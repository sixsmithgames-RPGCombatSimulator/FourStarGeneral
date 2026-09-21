import { buildSync } from "esbuild";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const warRoomHarness = buildSync({
  stdin: {
    contents: `
      import { createEmptyWarRoomData } from "./src/data/warRoomTypes";
      import { warRoomHotspotDefinitions } from "./src/data/warRoomHotspots";
      import { WarRoomOverlay } from "./src/ui/components/WarRoomOverlay";

      globalThis.__openWarRoomHotspotTest = () => {
        const overlay = new WarRoomOverlay({
          dataProvider: { getSnapshot: () => createEmptyWarRoomData() }
        });
        overlay.open();
        return warRoomHotspotDefinitions.length;
      };
    `,
    resolveDir: resolve("."),
    loader: "ts"
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2022"
}).outputFiles[0].text;

test.describe("War Room Hotspot Positioning", () => {
  test("shipped overlay renders every visible, bounded hotspot", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#app")).toBeVisible();
    await page.addScriptTag({ content: warRoomHarness });

    const authoredCount = await page.evaluate(() => (
      (globalThis as typeof globalThis & { __openWarRoomHotspotTest: () => number })
        .__openWarRoomHotspotTest()
    ));
    const overlay = page.locator("#warRoomOverlay");
    const hotspots = overlay.locator(".war-room-hotspot");

    await expect(overlay).toBeVisible();
    await expect(hotspots).toHaveCount(authoredCount);
    expect(authoredCount).toBeGreaterThan(0);

    const geometry = await hotspots.evaluateAll((buttons) => buttons.map((button) => {
      const hotspot = button as HTMLButtonElement;
      const bounds = hotspot.getBoundingClientRect();
      const layerBounds = hotspot.parentElement!.getBoundingClientRect();
      return {
        id: hotspot.dataset.hotspotId ?? "",
        label: hotspot.getAttribute("aria-label") ?? "",
        width: bounds.width,
        height: bounds.height,
        insideLayer: bounds.left >= layerBounds.left - 1
          && bounds.top >= layerBounds.top - 1
          && bounds.right <= layerBounds.right + 1
          && bounds.bottom <= layerBounds.bottom + 1
      };
    }));

    expect(new Set(geometry.map(({ id }) => id)).size).toBe(authoredCount);
    for (const hotspot of geometry) {
      expect(hotspot.id).not.toBe("");
      expect(hotspot.label).not.toBe("");
      expect(hotspot.width).toBeGreaterThan(0);
      expect(hotspot.height).toBeGreaterThan(0);
      expect(hotspot.insideLayer).toBe(true);
    }
  });
});
