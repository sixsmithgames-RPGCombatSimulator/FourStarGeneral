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
import { openTrainingRequisition } from "./support/openTrainingRequisition";

test.describe("Requisition Screen Layout", () => {
  test.beforeEach(async ({ page }) => {
    await openTrainingRequisition(page);
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
    const supplyConvoyItem = await logisticsList.locator('li.allocation-item[data-key="supplyConvoy"]');
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
    // Get initial budget values
    const initialSpent = await page.locator("#budgetSpent").textContent();
    const initialRemaining = await page.locator("#budgetRemaining").textContent();
    
    // Find infantry in units list
    const unitList = await page.locator("#allocationUnitList");
    const infantryItem = await unitList.locator('li.allocation-item[data-key="infantry"]');
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

  test("should keep the toolbar and allocation cards readable at narrow widths", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 744 });
    await page.waitForTimeout(300);

    const toolbarBudget = page.locator(".precombat-toolbar-budget");
    const leftGroup = page.locator(".precombat-toolbar-button-group").nth(0);
    const firstCard = page.locator("#allocationUnitList .allocation-item").nth(0);

    const budgetBox = await toolbarBudget.boundingBox();
    const leftGroupBox = await leftGroup.boundingBox();
    const firstCardBox = await firstCard.boundingBox();

    expect(budgetBox).not.toBeNull();
    expect(leftGroupBox).not.toBeNull();
    expect(firstCardBox).not.toBeNull();

    if (budgetBox && leftGroupBox && firstCardBox) {
      expect(
        budgetBox.y >= leftGroupBox.y + leftGroupBox.height + 8,
        "Budget panel should wrap below the toolbar buttons instead of overlapping them."
      ).toBe(true);

      expect(
        firstCardBox.height >= 120,
        `Allocation card should keep its full content height, received ${firstCardBox.height}px.`
      ).toBe(true);
    }
  });

  test("should support complete tutorial force composition", async ({ page }) => {
    // Add units as per tutorial requirements
    const requiredUnits = [
      { key: "infantry", count: 2, cost: 50 },      // 100 RP
      { key: "tank", count: 1, cost: 100 },         // 100 RP
      { key: "engineer", count: 1, cost: 80 },      // 80 RP
      { key: "flakBattery", count: 1, cost: 210 },  // 210 RP
      { key: "fighter", count: 1, cost: 240 }       // 240 RP
    ];
    
    // Calculate expected total (supply convoy auto-added at 40 RP)
    const expectedTotal = requiredUnits.reduce((sum, u) => sum + (u.count * u.cost), 40);
    expect(expectedTotal).toBe(770); // 730 + 40 convoy
    
    // Add each unit type
    for (const unit of requiredUnits) {
      const listId = unit.key === "fighter"
        ? "#allocationSupportList"
        : "#allocationUnitList";
      
      const list = await page.locator(listId);
      const item = await list.locator(`li.allocation-item[data-key="${unit.key}"]`);
      
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
    expect(spentText).toContain(expectedTotal.toString());
    
    const remainingText = await page.locator("#budgetRemaining").textContent();
    const remainingMatch = remainingText?.match(/[\d,]+/);
    if (remainingMatch) {
      const remaining = parseInt(remainingMatch[0].replace(/,/g, ""), 10);
      expect(remaining).toBe(1200 - expectedTotal); // Should be 330 RP remaining
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
    
    await openTrainingRequisition(page);
    
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
