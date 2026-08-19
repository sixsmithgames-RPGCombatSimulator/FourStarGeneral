import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { PrecombatScreen } from "../src/ui/screens/PrecombatScreen";
import type { IScreenManager } from "../src/contracts/IScreenManager";
import { BattleState } from "../src/state/BattleState";
import { ensureTutorialState } from "../src/state/TutorialState";
import { getAllMissionKeys } from "../src/data/missions";

function mountPrecombatDom(): void {
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

function createScreen(): PrecombatScreen {
  mountPrecombatDom();
  const fakeScreenManager: IScreenManager = {
    showScreen: () => {},
    showScreenById: () => {},
    getCurrentScreen: () => null
  };
  const screen = new PrecombatScreen(fakeScreenManager, new BattleState());
  // @ts-expect-error - test override for jsdom.
  screen.renderMiniMap = () => {};
  screen.initialize();
  return screen;
}

registerTest("PRECOMBAT_ENFORCES_A_CONVOY_MINIMUM_FOR_RIVER_WATCH", async ({ Given, When, Then }) => {
  let screen: PrecombatScreen;
  let convoyCount = 0;
  let convoyVisible = false;

  await Given("River Watch precombat loads with mission defaults", async () => {
    screen = createScreen();
    screen.setup("patrol_river_watch", null, "Normal");
  });

  await When("the commander reviews the unit roster and tries to remove the convoy", async () => {
    const internals = screen as unknown as {
      allocationCounts: Map<string, number>;
      allocationLogisticsList: HTMLElement;
      handleAllocationAdjustment: (optionKey: string, delta: number) => void;
    };

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

registerTest("PRECOMBAT_CAMPAIGN_CONTEXT_STAYS_OUTSIDE_BUDGET_GRID", async ({ Given, When, Then }) => {
  let screen: PrecombatScreen;
  let banner: HTMLElement | null = null;
  let budget: HTMLElement | null = null;

  await Given("a campaign engagement summary and the compact requisition budget", async () => {
    screen = createScreen();
    const internals = screen as any;
    internals.engagementContext = {
      battleHexKey: "4,4",
      missionType: "meetingEngagement",
      forceRatio: 1,
      availableForces: [{ hexKey: "3,4", unitType: "Infantry_42", count: 2 }],
      airSorties: 0,
      rpReserve: 100
    };
  });

  await When("the strategic context banner is rendered", async () => {
    (screen as any).renderEngagementContextBanner();
    banner = document.getElementById("engagementContextBanner");
    budget = document.getElementById("precombatBudgetPanel");
  });

  await Then("the full-width briefing is a sibling rather than a child that distorts the budget grid", async () => {
    if (!banner || !budget) throw new Error("Expected campaign banner and budget panel.");
    if (budget.contains(banner) || banner.parentElement !== budget.parentElement) {
      throw new Error("Campaign context banner was mounted inside the requisition budget grid.");
    }
  });
});

registerTest("PRECOMBAT_CAMPAIGN_COPY_HAS_NO_HIDDEN_TACTICAL_DEADLINE", async ({ Given, When, Then }) => {
  let attackBriefing = "";
  let defenseBriefing = "";
  let turnLimit = "";

  await Given("campaign attack and defense briefings using no-fixed-limit mission rules", () => {});

  await When("both roles render their mission summary", () => {
    for (const playerDefense of [false, true]) {
      const screen = createScreen();
      const internals = screen as any;
      internals.engagementContext = {
        engagementId: playerDefense ? "precombat-defense" : "precombat-attack",
        battleHexKey: "28,38",
        missionType: "meetingEngagement",
        attacker: playerDefense ? "Bot" : "Player",
        defender: playerDefense ? "Player" : "Bot"
      };
      internals.miniMapScenario = {
        name: "Meeting Engagement",
        turnLimit: 0,
        campaignPlayerRole: playerDefense ? "defender" : "attacker",
        campaignBattleHexKey: "28,38",
        objectives: [{ hex: { q: 2, r: 1 }, owner: "Bot", vp: 1 }],
        sides: { Player: { units: [] }, Bot: { units: [] }, Ally: { units: [] } }
      };
      internals.renderMissionSummary("campaign", "Normal");
      const briefing = document.getElementById("precombatMissionBriefing")?.textContent ?? "";
      if (playerDefense) defenseBriefing = briefing;
      else attackBriefing = briefing;
      turnLimit = document.getElementById("missionTurnLimit")?.textContent ?? "";
    }
  });

  await Then("briefing and timeline agree that battlefield conditions decide the engagement", () => {
    const combined = `${attackBriefing} ${defenseBriefing}`;
    if (turnLimit !== "No fixed turn limit"
      || !attackBriefing.includes("objective control or force collapse")
      || !defenseBriefing.includes("objective control or force collapse")
      || /window closes|turns? remain/i.test(combined)) {
      throw new Error(`Campaign precombat retained contradictory deadline copy: ${combined}`);
    }
  });
});

registerTest("PRECOMBAT_HONORS_EXPLICIT_CONVOY_RESTRICTIONS", async ({ Given, When, Then }) => {
  let screen: PrecombatScreen;
  let convoyVisible = true;
  let convoyCount = 1;
  let previousRestrictedUnits: string[] | undefined;

  await Given("a mission that explicitly restricts supply convoys", async () => {
    screen = createScreen();
    screen.setup("training", null, "Normal");

    const internals = screen as unknown as {
      scenarioSource: {
        restrictedUnits?: string[];
      };
      allocationCounts: Map<string, number>;
      rerenderAllocations: () => void;
      seedRecommendedLogisticsAllocations: () => void;
      allocationLogisticsList: HTMLElement;
    };

    previousRestrictedUnits = Array.isArray(internals.scenarioSource.restrictedUnits)
      ? [...internals.scenarioSource.restrictedUnits]
      : undefined;
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
    const internals = screen as unknown as {
      scenarioSource: {
        restrictedUnits?: string[];
      };
    };
    if (previousRestrictedUnits) {
      internals.scenarioSource.restrictedUnits = previousRestrictedUnits;
    } else {
      delete internals.scenarioSource.restrictedUnits;
    }
    document.body.innerHTML = "";
  });
});

registerTest("PRECOMBAT_SUPPLY_REQUISITIONS_CONVERT_TO_REAL_DEPOT_PACKAGES", async ({ Given, When, Then }) => {
  let screen: PrecombatScreen;
  let depotAmmo = 0;
  let depotFuel = 0;

  await Given("a precombat requisition plan that buys one ammunition dump and one fuel dump", async () => {
    screen = createScreen();
    screen.setup("training", null, "Normal");

    const internals = screen as unknown as {
      allocationCounts: Map<string, number>;
      buildAllocationSummary: (entries: unknown[]) => { depotPackage: { ammo: number; fuel: number } };
    };

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

registerTest("PRECOMBAT_TRAINING_PRESET_APPLIES_FULL_ALLOCATION_PACKAGE", async ({ Given, When, Then }) => {
  let screen: PrecombatScreen;
  let actionButton: HTMLButtonElement;
  const countsAfterPreset = new Map<string, number>();
  let initialLabel = "";
  let appliedLabel = "";
  let resetLabel = "";
  let spendAfterPreset = 0;
  let spendAfterReset = 0;
  let proceedDisabledAfterPreset = true;

  await Given("the Training requisition screen is freshly opened", async () => {
    screen = createScreen();
    screen.setup("training", null, "Normal");
    actionButton = document.getElementById("resetAllocations") as HTMLButtonElement;
    initialLabel = actionButton.textContent?.trim() ?? "";
  });

  await When("the commander applies the Training preset", async () => {
    actionButton.click();
    const internals = screen as unknown as {
      allocationCounts: Map<string, number>;
      calculateSpend: () => number;
      proceedToBattleButton: HTMLButtonElement;
    };
    [
      "infantry",
      "engineer",
      "tank",
      "heavyTankCompany",
      "tankDestroyerCompany",
      "flakBattery",
      "reconBike",
      "howitzer",
      "supplyConvoy",
      "ammo",
      "medic",
      "maintenance"
    ].forEach((key) => countsAfterPreset.set(key, internals.allocationCounts.get(key) ?? 0));
    spendAfterPreset = internals.calculateSpend();
    proceedDisabledAfterPreset = internals.proceedToBattleButton.disabled;
    appliedLabel = actionButton.textContent?.trim() ?? "";

    actionButton.click();
    spendAfterReset = internals.calculateSpend();
    resetLabel = actionButton.textContent?.trim() ?? "";
  });

  await Then("the tutorial package is selected and reset returns to the pristine preset offer", async () => {
    const expectedCounts = new Map<string, number>([
      ["infantry", 3],
      ["engineer", 1],
      ["tank", 1],
      ["heavyTankCompany", 1],
      ["tankDestroyerCompany", 1],
      ["flakBattery", 1],
      ["reconBike", 1],
      ["howitzer", 1],
      ["supplyConvoy", 1],
      ["ammo", 1],
      ["medic", 1],
      ["maintenance", 1]
    ]);

    if (initialLabel !== "Use Preset Allocations") {
      throw new Error(`Expected pristine Training button to offer presets, saw "${initialLabel}".`);
    }
    if (appliedLabel !== "Reset Allocations") {
      throw new Error(`Expected applied preset to flip the action to reset, saw "${appliedLabel}".`);
    }
    for (const [key, expected] of expectedCounts.entries()) {
      const actual = countsAfterPreset.get(key);
      if (actual !== expected) {
        throw new Error(`Expected Training preset ${key} count ${expected}, saw ${actual}.`);
      }
    }
    if (spendAfterPreset !== 1170) {
      throw new Error(`Expected Training preset to spend 1,170 RP, saw ${spendAfterPreset}.`);
    }
    if (proceedDisabledAfterPreset) {
      throw new Error("Expected Training preset to satisfy proceed gating.");
    }
    if (resetLabel !== "Use Preset Allocations") {
      throw new Error(`Expected reset to restore the preset offer, saw "${resetLabel}".`);
    }
    if (spendAfterReset !== 40) {
      throw new Error(`Expected reset to leave only the default supply convoy at 40 RP, saw ${spendAfterReset}.`);
    }

    ensureTutorialState().endTutorial();
    document.body.innerHTML = "";
  });
});

registerTest("PRECOMBAT_TRAINING_MANUAL_ALLOCATION_FLIPS_PRESET_BUTTON_TO_RESET", async ({ Given, When, Then }) => {
  let screen: PrecombatScreen;
  let initialLabel = "";
  let manualLabel = "";

  await Given("the Training requisition screen is pristine", async () => {
    screen = createScreen();
    screen.setup("training", null, "Normal");
    initialLabel = (document.getElementById("resetAllocations") as HTMLButtonElement).textContent?.trim() ?? "";
  });

  await When("the commander manually changes an allocation", async () => {
    const internals = screen as unknown as {
      handleAllocationAdjustment: (optionKey: string, delta: number) => void;
    };
    internals.handleAllocationAdjustment("infantry", 1);
    manualLabel = (document.getElementById("resetAllocations") as HTMLButtonElement).textContent?.trim() ?? "";
  });

  await Then("the preset offer is replaced by the reset action", async () => {
    if (initialLabel !== "Use Preset Allocations") {
      throw new Error(`Expected pristine Training button to offer presets, saw "${initialLabel}".`);
    }
    if (manualLabel !== "Reset Allocations") {
      throw new Error(`Expected manual allocation to flip the action to reset, saw "${manualLabel}".`);
    }

    ensureTutorialState().endTutorial();
    document.body.innerHTML = "";
  });
});

registerTest("PRECOMBAT_TOWN_DEFENSE_PRESET_APPLIES_FLAK_ARTILLERY_AND_INTERCEPTORS", async ({ Given, When, Then }) => {
  let screen: PrecombatScreen;
  let initialLabel = "";
  let appliedLabel = "";
  let flakCount = 0;
  let howitzerCount = 0;
  let interceptorCount = 0;

  await Given("the Town Defense requisition screen is freshly opened", async () => {
    screen = createScreen();
    screen.setup("patrol", null, "Normal");
    initialLabel = (document.getElementById("resetAllocations") as HTMLButtonElement).textContent?.trim() ?? "";
  });

  await When("the commander applies the Town Defense preset", async () => {
    const actionButton = document.getElementById("resetAllocations") as HTMLButtonElement;
    actionButton.click();
    appliedLabel = actionButton.textContent?.trim() ?? "";

    const internals = screen as unknown as {
      allocationCounts: Map<string, number>;
    };
    flakCount = internals.allocationCounts.get("flakBattery") ?? 0;
    howitzerCount = internals.allocationCounts.get("howitzer") ?? 0;
    interceptorCount = internals.allocationCounts.get("interceptorWing") ?? 0;
  });

  await Then("the preset applies the requested anti-air and artillery package", async () => {
    if (initialLabel !== "Use Preset Allocations") {
      throw new Error(`Expected pristine Town Defense button to offer presets, saw "${initialLabel}".`);
    }
    if (appliedLabel !== "Reset Allocations") {
      throw new Error(`Expected applied Town Defense preset to flip the action to reset, saw "${appliedLabel}".`);
    }
    if (flakCount !== 4) {
      throw new Error(`Expected Town Defense preset flakBattery count 4, saw ${flakCount}.`);
    }
    if (howitzerCount !== 4) {
      throw new Error(`Expected Town Defense preset howitzer count 4, saw ${howitzerCount}.`);
    }
    if (interceptorCount !== 3) {
      throw new Error(`Expected Town Defense preset interceptorWing count 3, saw ${interceptorCount}.`);
    }
    document.body.innerHTML = "";
  });
});

registerTest("PRECOMBAT_ALL_BATTLE_SCENARIO_PRESETS_APPLY_WITHIN_BUDGET", async ({ Given, When, Then }) => {
  const failures: string[] = [];

  await Given("every non-campaign battle scenario has a fresh requisition screen", async () => {
    document.body.innerHTML = "";
  });

  await When("the commander applies each mission preset", async () => {
    for (const missionKey of getAllMissionKeys().filter((key) => key !== "campaign")) {
      const screen = createScreen();
      screen.setup(missionKey, null, "Normal");

      const actionButton = document.getElementById("resetAllocations") as HTMLButtonElement;
      const initialLabel = actionButton.textContent?.trim() ?? "";
      if (initialLabel !== "Use Preset Allocations") {
        failures.push(`${missionKey}: expected preset offer, saw "${initialLabel}".`);
        document.body.innerHTML = "";
        ensureTutorialState().endTutorial();
        continue;
      }

      actionButton.click();

      const internals = screen as unknown as {
        allocationBudget: number;
        allocationFeedbackElement: HTMLElement;
        calculateSpend: () => number;
        proceedToBattleButton: HTMLButtonElement;
      };
      const spend = internals.calculateSpend();
      const feedback = internals.allocationFeedbackElement.textContent ?? "";

      if (spend <= 0) {
        failures.push(`${missionKey}: preset produced no spend.`);
      }
      if (spend > internals.allocationBudget) {
        failures.push(`${missionKey}: preset spend ${spend} exceeded budget ${internals.allocationBudget}.`);
      }
      if (internals.proceedToBattleButton.disabled) {
        failures.push(`${missionKey}: preset did not satisfy proceed gating.`);
      }
      if (/Unavailable:|Capped at maximum:/i.test(feedback)) {
        failures.push(`${missionKey}: preset reported unavailable or capped entries: ${feedback}`);
      }

      document.body.innerHTML = "";
      ensureTutorialState().endTutorial();
    }
  });

  await Then("each preset is available, affordable, and fully applicable", async () => {
    if (failures.length > 0) {
      throw new Error(failures.join(" | "));
    }
    document.body.innerHTML = "";
  });
});
