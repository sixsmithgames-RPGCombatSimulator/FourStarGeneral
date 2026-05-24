/**
 * Allocation Button Containment E2E Tests
 * 
 * Intent: Verify that plus/minus buttons in allocation cards never overflow
 * their container or overlap adjacent cards. This test addresses the specific
 * UI failure where buttons were falling outside cards.
 * 
 * Scope: PrecombatScreen allocation items at various viewport sizes.
 * Risk: Low - tests visual layout without modifying logic.
 * Verification: Playwright bounding box comparisons and screenshots.
 * Known Limits: Depends on consistent DOM structure; may need updates if
 * allocation-item HTML structure changes significantly.
 */

import { test, expect } from "@playwright/test";
import { openTrainingRequisition } from "./support/openTrainingRequisition";

test.describe("Allocation Button Containment", () => {
  test.beforeEach(async ({ page }) => {
    await openTrainingRequisition(page);
  });

  /**
   * Helper function to verify all buttons in allocation items are contained
   * within their parent card boundaries.
   */
  async function verifyButtonContainment(page: import("@playwright/test").Page, testName: string): Promise<void> {
    const items = await page.locator(".allocation-item").all();
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemBox = await item.boundingBox();
      
      if (!itemBox) {
        continue; // Skip if item not visible
      }

      // Get all buttons within this allocation item
      const buttons = await item.locator(".allocation-btn").all();
      
      for (const button of buttons) {
        const buttonBox = await button.boundingBox();
        
        if (!buttonBox) {
          continue; // Skip if button not visible
        }

        // CRITICAL: Button must be entirely within its parent card
        // Allow 2px tolerance for subpixel rendering and borders
        const tolerance = 2;
        
        expect(
          buttonBox.x >= itemBox.x - tolerance,
          `${testName}: Button left edge (${buttonBox.x}) extends beyond card left edge (${itemBox.x}) in item ${i}`
        ).toBe(true);
        
        expect(
          buttonBox.x + buttonBox.width <= itemBox.x + itemBox.width + tolerance,
          `${testName}: Button right edge (${buttonBox.x + buttonBox.width}) extends beyond card right edge (${itemBox.x + itemBox.width}) in item ${i}`
        ).toBe(true);
        
        expect(
          buttonBox.y >= itemBox.y - tolerance,
          `${testName}: Button top edge (${buttonBox.y}) extends beyond card top edge (${itemBox.y}) in item ${i}`
        ).toBe(true);
        
        expect(
          buttonBox.y + buttonBox.height <= itemBox.y + itemBox.height + tolerance,
          `${testName}: Button bottom edge (${buttonBox.y + buttonBox.height}) extends beyond card bottom edge (${itemBox.y + itemBox.height}) in item ${i}`
        ).toBe(true);
      }
    }
  }

  /**
   * Helper function to verify no allocation items overlap with each other.
   */
  async function verifyNoOverlappingItems(page: import("@playwright/test").Page, testName: string): Promise<void> {
    const listIds = [
      "#allocationUnitList",
      "#allocationSupplyList",
      "#allocationSupportList",
      "#allocationLogisticsList"
    ];

    for (const listId of listIds) {
      const items = await page.locator(`${listId} > .allocation-item`).all();
      const boxes: Array<{ index: number; box: { x: number; y: number; width: number; height: number } | null }> = [];

      for (let i = 0; i < items.length; i++) {
        const box = await items[i].boundingBox();
        if (box) {
          boxes.push({ index: i, box });
        }
      }

      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const itemA = boxes[i];
          const itemB = boxes[j];

          if (!itemA.box || !itemB.box) continue;

          const horizontalOverlap =
            itemA.box.x < itemB.box.x + itemB.box.width &&
            itemA.box.x + itemA.box.width > itemB.box.x;

          const verticalOverlap =
            itemA.box.y < itemB.box.y + itemB.box.height &&
            itemA.box.y + itemA.box.height > itemB.box.y;

          const tolerance = 1;
          const trulyOverlapping =
            horizontalOverlap && verticalOverlap &&
            (itemA.box.x < itemB.box.x + itemB.box.width - tolerance) &&
            (itemA.box.x + itemA.box.width > itemB.box.x + tolerance) &&
            (itemA.box.y < itemB.box.y + itemB.box.height - tolerance) &&
            (itemA.box.y + itemA.box.height > itemB.box.y + tolerance);

          expect(
            trulyOverlapping,
            `${testName}: Allocation items ${itemA.index} and ${itemB.index} overlap inside ${listId}`
          ).toBe(false);
        }
      }
    }
  }

  test("buttons contained within cards at desktop viewport (1920x1080)", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(300);
    
    await verifyButtonContainment(page, "Desktop 1920x1080");
    await verifyNoOverlappingItems(page, "Desktop 1920x1080");
    
    await page.screenshot({ path: "e2e/screenshots/button-containment-desktop.png" });
  });

  test("buttons contained within cards at large laptop viewport (1440x900)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
    
    await verifyButtonContainment(page, "Laptop 1440x900");
    await verifyNoOverlappingItems(page, "Laptop 1440x900");
    
    await page.screenshot({ path: "e2e/screenshots/button-containment-laptop.png" });
  });

  test("buttons contained within cards at small laptop viewport (1366x768)", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(300);
    
    await verifyButtonContainment(page, "Small Laptop 1366x768");
    await verifyNoOverlappingItems(page, "Small Laptop 1366x768");
    
    await page.screenshot({ path: "e2e/screenshots/button-containment-small-laptop.png" });
  });

  test("buttons contained within cards at tablet viewport (1024x768)", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(300);
    
    await verifyButtonContainment(page, "Tablet 1024x768");
    await verifyNoOverlappingItems(page, "Tablet 1024x768");
    
    await page.screenshot({ path: "e2e/screenshots/button-containment-tablet.png" });
  });

  test("buttons contained within cards at narrow viewport (900x600)", async ({ page }) => {
    // This is the critical test - narrow viewports trigger layout changes
    await page.setViewportSize({ width: 900, height: 600 });
    await page.waitForTimeout(300);
    
    await verifyButtonContainment(page, "Narrow 900x600");
    await verifyNoOverlappingItems(page, "Narrow 900x600");
    
    await page.screenshot({ path: "e2e/screenshots/button-containment-narrow.png" });
  });

  test("buttons contained after adding multiple units", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // Add several units to increase the state complexity
    const unitList = await page.locator("#allocationUnitList");
    const infantryItem = await unitList.locator('[data-key="infantry"]');
    const incrementBtn = await infantryItem.locator('[data-action="increment"]');
    
    // Add 3 infantry units
    for (let i = 0; i < 3; i++) {
      await incrementBtn.click();
      await page.waitForTimeout(100);
    }
    
    await verifyButtonContainment(page, "After Adding Units");
    await verifyNoOverlappingItems(page, "After Adding Units");
    
    await page.screenshot({ path: "e2e/screenshots/button-containment-with-units.png" });
  });

  test("allocation controls remain usable and visible", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    
    const unitList = await page.locator("#allocationUnitList");
    const firstItem = await unitList.locator(".allocation-item").first();
    
    // Verify controls are visible (not clipped)
    const decrementBtn = await firstItem.locator('[data-action="decrement"]');
    const incrementBtn = await firstItem.locator('[data-action="increment"]');
    const count = await firstItem.locator(".allocation-count");
    
    // All elements should be visible
    await expect(decrementBtn).toBeVisible();
    await expect(incrementBtn).toBeVisible();
    await expect(count).toBeVisible();
    
    // Verify click targets are reasonable (not zero-sized)
    const decBox = await decrementBtn.boundingBox();
    const incBox = await incrementBtn.boundingBox();
    
    expect(decBox?.width).toBeGreaterThan(20); // Minimum touch target size
    expect(decBox?.height).toBeGreaterThan(20);
    expect(incBox?.width).toBeGreaterThan(20);
    expect(incBox?.height).toBeGreaterThan(20);
  });

  test("quantity controls stay together as a unit", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    
    const items = await page.locator(".allocation-item").all();
    
    for (const item of items.slice(0, 5)) { // Check first 5 items
      const quantityContainer = await item.locator(".allocation-quantity");
      const buttons = await item.locator(".allocation-btn").all();
      const count = await item.locator(".allocation-count");
      
      if (buttons.length === 0) continue; // Skip locked/unavailable items
      
      const containerBox = await quantityContainer.boundingBox();
      
      if (!containerBox) continue;
      
      // All buttons in this container should be within its bounds
      for (const button of buttons) {
        const buttonBox = await button.boundingBox();
        if (!buttonBox) continue;
        
        expect(buttonBox.x).toBeGreaterThanOrEqual(containerBox.x - 2);
        expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(containerBox.x + containerBox.width + 2);
        expect(buttonBox.y).toBeGreaterThanOrEqual(containerBox.y - 2);
        expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(containerBox.y + containerBox.height + 2);
      }
    }
  });
});

test.describe("Allocation Item Minimum Width", () => {
  test.beforeEach(async ({ page }) => {
    await openTrainingRequisition(page);
  });

  test("allocation items respect minimum width constraint", async ({ page }) => {
    // Test at a viewport that would otherwise make cards too narrow
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(300);
    
    const items = await page.locator(".allocation-item").all();
    
    for (const item of items.slice(0, 3)) {
      const box = await item.boundingBox();
      if (box) {
        // Cards should not be narrower than 200px (roughly our min-width - padding)
        expect(box.width).toBeGreaterThan(200);
      }
    }
  });
});
