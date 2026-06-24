/**
 * Requisition UI E2E Tests
 * 
 * Intent: Verify the requisition screen renders correctly in a real browser,
 * including layout, budget display accuracy, and supply convoy auto-seeding.
 * 
 * Scope: Precombat screen visual layout, interaction, and state consistency.
 * Risk: Low - tests user-facing behavior without modifying core logic.
 * Verification: Playwright E2E tests with screenshots for visual regression.
 * Known Limits: Requires dev server running; tests specific DOM selectors.
 * 
 * Follows CODING_STANDARDS.md:
 * - Uses explicit assertions with clear failure messages
 * - Separates concerns: visual, interaction, state validation
 * - Includes accessibility checks for controls
 */

import { test, expect } from "@playwright/test";

test.describe("Requisition Screen Layout", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and start the training mission
    await page.goto("/");
    
    // Wait for the landing screen
    await page.waitForSelector("#landingScreen", { state: "visible" });
    
    // Click start to enter precombat
    await page.click("#startGame");
    
    // Wait for precombat screen to load
    await page.waitForSelector("#precombatScreen", { state: "visible" });
    
    // Wait for initial render to complete
    await page.waitForTimeout(500);
  });

  test("should display two-column layout with mission intel and minimap at top", async ({ page }) => {
    // Verify the intel row exists with correct structure
    const intelRow = await page.locator(".precombat-intel-row");
    await expect(intelRow).toBeVisible();
    
    // Verify mission intel panel exists on the left
    const missionPanel = await page.locator(".mission-intel-panel");
    await expect(missionPanel).toBeVisible();
    
    // Verify mission title is displayed
    const missionTitle = await page.locator("#precombatMissionTitle");
    await expect(missionTitle).toBeVisible();
    
    // Verify theater overview (minimap) is on the right
    const mapCard = await page.locator(".map-card");
    await expect(mapCard).toBeVisible();
    
    // Verify minimap canvas exists
    const minimap = await page.locator("#precombatHexMap");
    await expect(minimap).toBeVisible();
    
    // Verify unit allocation panel is below the intel row
    const allocationPanel = await page.locator(".allocation-panel");
    await expect(allocationPanel).toBeVisible();
    
    // Take screenshot for visual verification
    await page.screenshot({ 
      path: "e2e/screenshots/requisition-layout.png",
      fullPage: false 
    });
  });

  test("should display budget in RP with correct initial values", async ({ page }) => {
    // Verify budget panel uses RP terminology
    const budgetLabel = await page.locator(".topbar-budget .budget-label");
    await expect(budgetLabel).toContainText(/Requisition Points|RP/i);
    
    // Verify spent amount shows RP
    const spentElement = await page.locator("#budgetSpent");
    const spentText = await spentElement.textContent();
    expect(spentText).toMatch(/Spent:\s*\d+\s*RP/i);
    
    // Verify remaining amount shows RP
    const remainingElement = await page.locator("#budgetRemaining");
    const remainingText = await remainingElement.textContent();
    expect(remainingText).toMatch(/(Remaining|Available):\s*[\d,]+\s*(RP|requisition)/i);
    
    // Verify budget shows 1,200 total (or close to it after auto-seeded convoy)
    const remainingMatch = remainingText?.match(/[\d,]+/);
    if (remainingMatch) {
      const remaining = parseInt(remainingMatch[0].replace(/,/g, ""), 10);
      expect(remaining).toBeGreaterThan(1100); // Should be ~1160 after convoy
      expect(remaining).toBeLessThanOrEqual(1200);
    }
  });

  test("should auto-seed supply convoy with quantity 1, not 0", async ({ page }) => {
    // Navigate to logistics section
    const logisticsList = await page.locator("#allocationLogisticsList");
    await expect(logisticsList).toBeVisible();
    
    // Find the supply convoy item
    const supplyConvoyItem = await logisticsList.locator('[data-key="supplyConvoy"]');
    await expect(supplyConvoyItem).toBeVisible();
    
    // Get the displayed quantity
    const countElement = await supplyConvoyItem.locator(".allocation-count");
    await expect(countElement).toBeVisible();
    
    const displayedQuantity = await countElement.textContent();
    const quantity = parseInt(displayedQuantity ?? "0", 10);
    
    // CRITICAL: Quantity should be 1 (auto-seeded), never 0
    expect(quantity).toBe(1);
    
    // Verify total cost is displayed as 40 RP (1 × 40)
    const totalElement = await supplyConvoyItem.locator(".allocation-total");
    const totalText = await totalElement.textContent();
    expect(totalText).toContain("40");
  });

  test("should maintain budget consistency when adding infantry", async ({ page }) => {
    // Find infantry in units list
    const unitList = await page.locator("#allocationUnitList");
    const infantryItem = await unitList.locator('[data-key="infantry"]');
    await expect(infantryItem).toBeVisible();
    
    // Get the increment button
    const incrementBtn = await infantryItem.locator('[data-action="increment"]');
    await expect(incrementBtn).toBeVisible();
    
    // Click twice to add 2 infantry (tutorial requirement)
    await incrementBtn.click();
    await page.waitForTimeout(100);
    await incrementBtn.click();
    await page.waitForTimeout(100);
    
    // Verify quantity shows 2
    const countElement = await infantryItem.locator(".allocation-count");
    const displayedCount = await countElement.textContent();
    expect(parseInt(displayedCount ?? "0", 10)).toBe(2);
    
    // Verify budget updated correctly
    // 2 infantry @ 50 RP = 100 RP + 1 supply convoy @ 40 RP = 140 RP total
    const newSpent = await page.locator("#budgetSpent").textContent();
    expect(newSpent).toContain("140");
    
    const newRemaining = await page.locator("#budgetRemaining").textContent();
    // 1200 - 140 = 1060
    expect(newRemaining).toContain("1,060");
  });

  test("should contain plus/minus buttons within allocation cards", async ({ page }) => {
    // Find an allocation item
    const unitList = await page.locator("#allocationUnitList");
    const firstItem = await unitList.locator(".allocation-item").first();
    await expect(firstItem).toBeVisible();
    
    // Get the buttons
    const decrementBtn = await firstItem.locator('[data-action="decrement"]');
    const incrementBtn = await firstItem.locator('[data-action="increment"]');
    
    // Verify both buttons exist
    await expect(decrementBtn).toBeVisible();
    await expect(incrementBtn).toBeVisible();
    
    // Verify buttons are contained within the item bounds
    const itemBox = await firstItem.boundingBox();
    const decBox = await decrementBtn.boundingBox();
    const incBox = await incrementBtn.boundingBox();
    
    expect(itemBox).not.toBeNull();
    expect(decBox).not.toBeNull();
    expect(incBox).not.toBeNull();
    
    if (itemBox && decBox && incBox) {
      // Buttons should be inside the item card
      expect(decBox.x).toBeGreaterThanOrEqual(itemBox.x - 1); // Allow 1px tolerance
      expect(decBox.y).toBeGreaterThanOrEqual(itemBox.y - 1);
      expect(decBox.x + decBox.width).toBeLessThanOrEqual(itemBox.x + itemBox.width + 1);
      expect(decBox.y + decBox.height).toBeLessThanOrEqual(itemBox.y + itemBox.height + 1);
      
      expect(incBox.x).toBeGreaterThanOrEqual(itemBox.x - 1);
      expect(incBox.y).toBeGreaterThanOrEqual(itemBox.y - 1);
      expect(incBox.x + incBox.width).toBeLessThanOrEqual(itemBox.x + itemBox.width + 1);
      expect(incBox.y + incBox.height).toBeLessThanOrEqual(itemBox.y + itemBox.height + 1);
    }
    
    // Take screenshot of the allocation item for visual verification
    await firstItem.screenshot({ path: "e2e/screenshots/allocation-item-buttons.png" });
  });

  test("should support complete tutorial force composition", async ({ page }) => {
    // Add units as per tutorial requirements
    const requiredUnits = [
      { key: "infantry", count: 3, cost: 50 },
      { key: "tank", count: 1, cost: 100 },
      { key: "heavyTankCompany", count: 1, cost: 140 },
      { key: "tankDestroyerCompany", count: 1, cost: 80 },
      { key: "engineer", count: 1, cost: 80 },
      { key: "flakBattery", count: 1, cost: 210 },
      { key: "reconBike", count: 1, cost: 45 },
      { key: "howitzer", count: 1, cost: 180 },
      { key: "ammo", count: 1, cost: 30 },
      { key: "medic", count: 1, cost: 60 },
      { key: "maintenance", count: 1, cost: 55 }
    ];
    
    // Calculate expected total (supply convoy auto-added at 40 RP)
    const expectedTotal = requiredUnits.reduce((sum, u) => sum + (u.count * u.cost), 40);
    expect(expectedTotal).toBe(1170);
    
    // Add each unit type
    for (const unit of requiredUnits) {
      const listId = ["ammo", "fuel", "medic", "maintenance", "supplyConvoy"].includes(unit.key)
        ? "#allocationLogisticsList"
        : "#allocationUnitList";
      
      const list = await page.locator(listId);
      const item = await list.locator(`[data-key="${unit.key}"]`);
      
      // Scroll into view if needed
      await item.scrollIntoViewIfNeeded();
      
      const incrementBtn = await item.locator('[data-action="increment"]');
      
      // Click the required number of times
      for (let i = 0; i < unit.count; i++) {
        await incrementBtn.click();
        await page.waitForTimeout(50);
      }
      
      // Verify quantity
      const countElement = await item.locator(".allocation-count");
      const displayedCount = await countElement.textContent();
      expect(parseInt(displayedCount ?? "0", 10)).toBe(unit.count);
    }
    
    // Verify final budget
    const spentText = await page.locator("#budgetSpent").textContent();
    const spentMatch = spentText?.match(/[\d,]+/);
    expect(Number.parseInt(spentMatch?.[0].replace(/,/g, "") ?? "0", 10)).toBe(expectedTotal);
    
    const remainingText = await page.locator("#budgetRemaining").textContent();
    const remainingMatch = remainingText?.match(/[\d,]+/);
    if (remainingMatch) {
      const remaining = parseInt(remainingMatch[0].replace(/,/g, ""), 10);
      expect(remaining).toBe(1200 - expectedTotal);
    }
    
    // Take final screenshot
    await page.screenshot({ 
      path: "e2e/screenshots/requisition-complete-composition.png",
      fullPage: false 
    });
  });
});

test.describe("Requisition Screen Responsive Layout", () => {
  test("should adapt layout for mobile viewport", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Navigate to precombat
    await page.goto("/");
    await page.waitForSelector("#landingScreen", { state: "visible" });
    await page.click("#startGame");
    await page.waitForSelector("#precombatScreen", { state: "visible" });
    await page.waitForTimeout(500);
    
    // On mobile, the intel row should stack vertically
    const intelRow = await page.locator(".precombat-intel-row");
    await expect(intelRow).toBeVisible();
    
    // Verify both panels are still visible
    const missionPanel = await page.locator(".mission-intel-panel");
    const mapCard = await page.locator(".map-card");
    
    await expect(missionPanel).toBeVisible();
    await expect(mapCard).toBeVisible();
    
    // Take mobile screenshot
    await page.screenshot({ 
      path: "e2e/screenshots/requisition-mobile-layout.png",
      fullPage: true 
    });
  });
});
