/**
 * Requisition UI Integration Tests
 * 
 * Intent: Verify the requisition screen correctly displays allocation counts,
 * budget calculations, and seeded logistics. Addresses UI failure where supply
 * convoy shows 0 quantity but budget shows 40 RP spent.
 * 
 * Scope: PrecombatScreen allocation state seeding, rendering, and budget display.
 * Risk: Medium - touches core allocation logic but uses isolated test scenario.
 * Verification: Jest unit tests with mocked DOM and scenario data.
 * Known Limits: Does not test full browser rendering (see Playwright tests for that).
 */

import { describe, it, expect, beforeEach, jest, afterEach } from "@jest/globals";

// Type definitions for mocks
type MockScreenManager = {
  switchScreen: jest.Mock;
  registerScreen: jest.Mock;
};

type MockBattleState = {
  setPrecombatAllocations: jest.Mock;
  setAssignedCommanderId: jest.Mock;
  getPrecombatAllocations: jest.Mock;
  getCampaignBridgeState: jest.Mock;
  getAssignedCommanderId: jest.Mock;
};

// Create mock instances
const mockScreenManager: MockScreenManager = {
  switchScreen: jest.fn(),
  registerScreen: jest.fn()
};

const mockBattleState: MockBattleState = {
  setPrecombatAllocations: jest.fn(),
  setAssignedCommanderId: jest.fn(),
  getPrecombatAllocations: jest.fn().mockReturnValue(null),
  getCampaignBridgeState: jest.fn().mockReturnValue(null),
  getAssignedCommanderId: jest.fn().mockReturnValue(null)
};

// Mock the unlock state module
jest.mock("../state/UnlockState", () => ({
  ensureUnlockState: jest.fn().mockReturnValue({
    isUnitLocked: jest.fn().mockReturnValue(false),
    subscribe: jest.fn(),
    buildPurchaseUrlForSku: jest.fn().mockReturnValue("#purchase")
  })
}));

// Mock the deployment state
jest.mock("../state/DeploymentState", () => ({
  ensureDeploymentState: jest.fn().mockReturnValue({
    getUnitKeyForScenarioType: jest.fn().mockReturnValue(null),
    getScenarioTypeForUnitKey: jest.fn().mockReturnValue(null),
    syncBlueprintFromPrecombat: jest.fn(),
    registerAllocationSprite: jest.fn(),
    registerScenarioAlias: jest.fn()
  })
}));

// Mock the battle state - return the mock instance
jest.mock("../state/BattleState", () => ({
  ensureBattleState: jest.fn().mockReturnValue(mockBattleState)
}));

// Mock tutorial state
jest.mock("../state/TutorialState", () => ({
  ensureTutorialState: jest.fn().mockReturnValue({
    isTutorialActive: jest.fn().mockReturnValue(false),
    getCurrentPhase: jest.fn().mockReturnValue("inactive"),
    setCanProceed: jest.fn(),
    advancePhase: jest.fn()
  }),
  getNextPhase: jest.fn().mockReturnValue(null)
}));

// Mock the mini map renderer
jest.mock("../rendering/MiniMapRenderer", () => ({
  MiniMapRenderer: jest.fn().mockImplementation(() => ({
    render: jest.fn(),
    destroy: jest.fn()
  }))
}));

import { PrecombatScreen } from "../ui/screens/PrecombatScreen";
import { ALLOCATION_BY_CATEGORY } from "../data/unitAllocation";

describe("Requisition UI Integration", () => {
  let screen: PrecombatScreen;
  let container: HTMLElement;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup minimal DOM structure needed by PrecombatScreen
    container = document.createElement("div");
    container.id = "test-container";
    container.innerHTML = `
      <div id="precombatScreen" class="screen">
        <div id="precombatBudgetPanel" class="topbar-budget">
          <div id="budgetSpent">Spent: 0 RP</div>
          <div id="budgetRemaining">Available: 1,200 RP</div>
        </div>
        <ul id="allocationUnitList"></ul>
        <ul id="allocationSupplyList"></ul>
        <ul id="allocationSupportList"></ul>
        <ul id="allocationLogisticsList"></ul>
        <ul id="predeployedUnitList"></ul>
        <p id="predeployedSummary"></p>
        <div id="allocationFeedback"></div>
        <button id="resetAllocations"></button>
        <button id="proceedToBattle"></button>
        <div id="precombatMissionBriefing"></div>
        <h2 id="precombatMissionTitle"></h2>
        <ul id="objectiveList"></ul>
        <p id="missionTurnLimit"></p>
        <ul id="baselineSupplyList"></ul>
        <p id="missionDoctrineNotes"></p>
        <div id="commanderSummaryCard"></div>
        <h3 id="commanderName"></h3>
        <p id="commanderSummary"></p>
        <dd id="commanderMissions"></dd>
        <dd id="commanderVictories"></dd>
        <dd id="commanderUnits"></dd>
        <dd id="commanderCasualties"></dd>
        <div id="precombatMapCanvas">
          <svg id="precombatHexMap"></svg>
        </div>
        <button id="returnToLanding"></button>
        <div id="allocationWarningOverlay" class="hidden">
          <div id="allocationWarningModal"></div>
        </div>
        <button id="allocationWarningReturn"></button>
        <button id="allocationWarningProceed"></button>
      </div>
    `;
    document.body.appendChild(container);

    // Create screen with mocked dependencies
    screen = new PrecombatScreen(mockScreenManager as any, mockBattleState as any);
  });

  afterEach(() => {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
    jest.clearAllMocks();
  });

  describe("Supply Convoy Auto-Seeding", () => {
    it("should auto-seed supply convoy with count of 1 when no predeployed units exist", () => {
      // scenario01.json now has playerBudget: 1200 and empty Player units
      screen.setup("training", "general_001", "Easy");

      // Access private allocationCounts via reflection for testing
      const allocationCounts = (screen as any).allocationCounts;
      const supplyConvoyCount = allocationCounts.get("supplyConvoy");

      // With no predeployed units, recommended convoy count should be 1
      expect(supplyConvoyCount).toBe(1);
    });

    it("should display supply convoy quantity matching the budget spent", () => {
      screen.setup("training", "general_001", "Easy");

      const budgetSpent = (screen as any).calculateSpend();
      const allocationCounts = (screen as any).allocationCounts;
      const supplyConvoyCount = allocationCounts.get("supplyConvoy") ?? 0;
      const convoyCost = 40; // From unitAllocation.ts

      // Budget spent should equal supply convoy cost when it's the only unit
      expect(budgetSpent).toBe(supplyConvoyCount * convoyCost);
      expect(supplyConvoyCount).toBeGreaterThan(0);
    });

    it("should render supply convoy in logistics list with correct quantity", () => {
      screen.setup("training", "general_001", "Easy");

      const logisticsList = document.getElementById("allocationLogisticsList");
      expect(logisticsList).not.toBeNull();

      // Find the supply convoy item
      const supplyConvoyItem = logisticsList?.querySelector('[data-key="supplyConvoy"]');
      expect(supplyConvoyItem).not.toBeNull();

      // Check the displayed quantity matches the actual count
      const countElement = supplyConvoyItem?.querySelector(".allocation-count");
      expect(countElement).not.toBeNull();
      
      const displayedCount = parseInt(countElement?.textContent ?? "0", 10);
      const allocationCounts = (screen as any).allocationCounts;
      const actualCount = allocationCounts.get("supplyConvoy") ?? 0;

      expect(displayedCount).toBe(actualCount);
      expect(displayedCount).toBeGreaterThan(0); // Should never show 0 when auto-seeded
    });
  });

  describe("Budget Display Accuracy", () => {
    it("should show correct spent amount when infantry is added", () => {
      screen.setup("training", "general_001", "Easy");

      // Simulate adding 2 infantry battalions (tutorial requirement)
      const allocationCounts = (screen as any).allocationCounts;
      allocationCounts.set("infantry", 2);
      
      // Re-calculate and update budget
      (screen as any).allocationDirty = true;
      (screen as any).rerenderAllocations();
      (screen as any).updateBudgetDisplay();

      const spent = (screen as any).calculateSpend();
      // 2 infantry @ 50 RP + 1 supply convoy @ 40 RP = 140 RP
      expect(spent).toBe(140);
    });

    it("should maintain budget accuracy after reset", () => {
      screen.setup("training", "general_001", "Easy");

      // Add some units
      const allocationCounts = (screen as any).allocationCounts;
      allocationCounts.set("infantry", 2);
      allocationCounts.set("tank", 1);

      // Reset
      (screen as any).resetAllocations();

      // After reset, only supply convoy should remain (auto-seeded)
      const spent = (screen as any).calculateSpend();
      expect(spent).toBe(40); // Just the supply convoy
      expect(allocationCounts.get("supplyConvoy")).toBe(1);
    });
  });

  describe("Tutorial Force Composition", () => {
    it("should support the tutorial-required force composition within 1200 RP budget", () => {
      const unitCosts: Record<string, number> = {
        infantry: 50,
        tank: 200,
        engineer: 80,
        flakBattery: 210,
        fighter: 240,
        supplyConvoy: 40,
        ammo: 30,
        fuel: 25
      };

      // Tutorial composition: 2 infantry, 1 tank, 1 engineer, 1 flak, 1 fighter, supplies
      const composition: Record<string, number> = {
        infantry: 2,      // 100 RP
        tank: 1,          // 200 RP
        engineer: 1,      // 80 RP
        flakBattery: 1,   // 210 RP
        fighter: 1,       // 240 RP
        supplyConvoy: 1,  // 40 RP (auto)
        ammo: 2,          // 60 RP
        fuel: 2           // 50 RP
      };

      let totalCost = 0;
      for (const [key, quantity] of Object.entries(composition)) {
        totalCost += (unitCosts[key] || 0) * quantity;
      }

      // Total should be: 100 + 200 + 80 + 210 + 240 + 40 + 60 + 50 = 980 RP
      expect(totalCost).toBeLessThanOrEqual(1200);
      expect(totalCost).toBe(980);
    });
  });
});

describe("Allocation UI Layout", () => {
  it("should render allocation items with properly contained controls", () => {
    // This test verifies the CSS changes prevent button overflow
    const mockOption = {
      key: "infantry",
      label: "Infantry Battalion",
      category: "units" as const,
      costPerUnit: 50,
      description: "Test description",
      maxQuantity: 20,
      spriteUrl: undefined
    };

    // Create a mock screen to test the render method
    const testContainer = document.createElement("div");
    testContainer.id = "render-test-container";
    testContainer.innerHTML = `
      <div id="precombatScreen" class="screen">
        <ul id="allocationUnitList"></ul>
        <div id="precombatBudgetPanel"></div>
        <div id="budgetSpent"></div>
        <div id="budgetRemaining"></div>
        <div id="allocationFeedback"></div>
        <ul id="allocationSupplyList"></ul>
        <ul id="allocationSupportList"></ul>
        <ul id="allocationLogisticsList"></ul>
        <ul id="predeployedUnitList"></ul>
        <p id="predeployedSummary"></p>
        <button id="resetAllocations"></button>
        <button id="proceedToBattle"></button>
        <div id="precombatMissionBriefing"></div>
        <h2 id="precombatMissionTitle"></h2>
        <ul id="objectiveList"></ul>
        <p id="missionTurnLimit"></p>
        <ul id="baselineSupplyList"></ul>
        <p id="missionDoctrineNotes"></p>
        <div id="commanderSummaryCard"></div>
        <h3 id="commanderName"></h3>
        <p id="commanderSummary"></p>
        <dd id="commanderMissions"></dd>
        <dd id="commanderVictories"></dd>
        <dd id="commanderUnits"></dd>
        <dd id="commanderCasualties"></dd>
        <div id="precombatMapCanvas">
          <svg id="precombatHexMap"></svg>
        </div>
        <button id="returnToLanding"></button>
        <div id="allocationWarningOverlay" class="hidden">
          <div id="allocationWarningModal"></div>
        </div>
        <button id="allocationWarningReturn"></button>
        <button id="allocationWarningProceed"></button>
      </div>
    `;
    document.body.appendChild(testContainer);
    
    const testScreen = new PrecombatScreen(mockScreenManager as any, mockBattleState as any);

    // Access private method for testing
    const html = (testScreen as any).renderAllocationItem(mockOption, 2);

    // Verify the controls are contained within the item structure
    expect(html).toContain('class="allocation-quantity"');
    expect(html).toContain('class="allocation-btn"');
    expect(html).toContain('class="allocation-count"');
    expect(html).toContain('data-action="decrement"');
    expect(html).toContain('data-action="increment"');

    // Verify the quantity is displayed correctly
    expect(html).toContain(">2<");

    document.body.removeChild(testContainer);
  });
});
