/** Observation-helper contracts only; full tutorial journeys remain the product acceptance gate. */
import { expect, test, type Page } from "@playwright/test";
import { expectGuidedPolygonVisible, readGuidedPolygonVisibility, readTutorialPanelEntrance, waitForTutorialPanelEntrance } from "./support/tutorialEvidence";

test("tutorial evidence waits for finite entrance opacity without waiting for infinite decoration", async ({ page }) => {
  await page.setContent('<div class="tutorial-panel">Brief</div>');
  await page.locator(".tutorial-panel").evaluate(panel => {
    const entrance = panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100, fill: "forwards" });
    entrance.id = "entrance";
    entrance.pause();
    entrance.currentTime = 50;
    panel.animate([{ outlineOffset: "0px" }, { outlineOffset: "2px" }], { duration: 100, iterations: Infinity });
  });
  expect(await readTutorialPanelEntrance(page)).toEqual({ opacity: "0.5", finiteAnimationActive: true });
  await page.locator(".tutorial-panel").evaluate(panel => panel.getAnimations().find(animation => animation.id === "entrance")!.play());
  await waitForTutorialPanelEntrance(page);
  expect(await readTutorialPanelEntrance(page)).toEqual({ opacity: "1", finiteAnimationActive: false });
});

async function mountGuidedPolygon(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent('<style>body{margin:0}.battle-map-pane{position:fixed;left:10px;top:180px;width:370px;height:580px;overflow:hidden}.map-viewport{position:absolute;left:10px;top:20px;width:350px;height:500px;overflow:hidden}.tutorial-panel{position:fixed;left:0;top:220px;width:390px;height:80px;background:#123;z-index:10}.tutorial-spotlight{position:fixed;left:154px;top:270px;width:72px;height:115px;outline:4px solid gold;pointer-events:none}</style>' +
    '<div class="battle-map-pane"><div class="map-viewport"><svg id="battleMapCanvas" width="350" height="500" viewBox="0 0 350 500"><g data-tutorial-guided-hex="true" data-hex="1,1"><circle cx="170" cy="10" r="1" pointer-events="none"/><polygon class="hex-tile" points="170,110 196,125 196,155 170,170 144,155 144,125" fill="green"/></g></svg></div></div><div class="tutorial-spotlight"></div><div class="tutorial-panel">Scout ahead</div>');
}

test("tutorial target observation ignores padded spotlights, group decorations and empty polygon corners", async ({ page }) => {
  await mountGuidedPolygon(page);
  const group = await page.locator('[data-tutorial-guided-hex="true"]').boundingBox();
  expect(group!.y).toBeLessThan(300);
  await expectGuidedPolygonVisible(page);
  // The panel crosses the polygon's rectangular bounds, but not its actual top-right triangular corner.
  await page.locator(".tutorial-panel").evaluate(panel => Object.assign((panel as HTMLElement).style,
    { left: "215px", top: "309px", width: "10px", height: "10px" }));
  await expectGuidedPolygonVisible(page);
});

test("tutorial target observation rejects actual prompt occlusion and map, pane or viewport clipping", async ({ page }) => {
  await mountGuidedPolygon(page);
  await page.locator(".tutorial-panel").evaluate(panel => { (panel as HTMLElement).style.top = "335px"; });
  expect(await readGuidedPolygonVisibility(page)).toMatchObject({ promptOverlap: true, centerCovered: true });
  await expect(expectGuidedPolygonVisible(page)).rejects.toThrow(/Guided polygon/);
  await page.locator(".tutorial-panel").evaluate(panel => { (panel as HTMLElement).style.top = "220px"; });
  for (const selector of [".map-viewport", ".battle-map-pane"]) {
    await page.locator(selector).evaluate(element => { (element as HTMLElement).style.height = "130px"; });
    expect(await readGuidedPolygonVisibility(page)).toMatchObject({ outsideFrame: true });
    await expect(expectGuidedPolygonVisible(page)).rejects.toThrow(/Guided polygon/);
    await page.locator(selector).evaluate(element => { (element as HTMLElement).style.removeProperty("height"); });
  }
  await page.locator(".battle-map-pane").evaluate(pane => { (pane as HTMLElement).style.top = "800px"; });
  expect(await readGuidedPolygonVisibility(page)).toMatchObject({ outsideFrame: true, centerCovered: true });
  await expect(expectGuidedPolygonVisible(page)).rejects.toThrow(/Guided polygon/);
});
