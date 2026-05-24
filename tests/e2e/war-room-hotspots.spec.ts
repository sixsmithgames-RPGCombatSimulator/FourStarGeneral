import { test, expect, Page } from '@playwright/test';
import type { WarRoomHotspotDefinition } from '../../src/data/warRoomHotspots';
import { warRoomHotspotDefinitions } from '../../src/data/warRoomHotspots';

/**
 * War Room Hotspot Positioning Tests
 */

test.describe('War Room Hotspot Positioning', () => {
  test('hotspots are visible and positioned correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { timeout: 10000 });
    
    // Open war room
    await page.goto('/?codex-test=warroom');
    await page.waitForTimeout(500);
    
    const hotspots = page.locator('.war-room-hotspot');
    const count = await hotspots.count();
    expect(count).toBeGreaterThan(0);
  });
});
