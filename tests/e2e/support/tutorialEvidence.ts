import { expect, type Page } from "@playwright/test";

/** Observe only the prompt's own entrance, not infinite spotlight/target pulses. */
export async function readTutorialPanelEntrance(page: Page): Promise<{ opacity: string; finiteAnimationActive: boolean }> {
  return page.locator(".tutorial-panel").evaluate(panel => ({
    opacity: getComputedStyle(panel).opacity,
    finiteAnimationActive: panel.getAnimations().some(animation =>
      Number.isFinite(animation.effect?.getComputedTiming().endTime) &&
      (animation.pending || (animation.playState !== "finished" && animation.playState !== "idle")))
  }));
}

/** Wait for settled browser entrance state; never fast-forward or cancel a product animation. */
export async function waitForTutorialPanelEntrance(page: Page): Promise<void> {
  await expect.poll(() => readTutorialPanelEntrance(page), "Tutorial evidence waits for the fully opaque, settled prompt")
    .toEqual({ opacity: "1", finiteAnimationActive: false });
}

/** Screen-space target geometry and occlusion evidence at the capture boundary. */
interface GuidedPolygonVisibility {
  readonly hex: string | null;
  readonly points: readonly { x: number; y: number }[];
  readonly frame: { left: number; top: number; right: number; bottom: number };
  readonly prompt: { left: number; top: number; right: number; bottom: number };
  readonly outsideFrame: boolean;
  readonly promptOverlap: boolean;
  readonly centerCovered: boolean;
}

/** Inspect actual painted polygon coordinates; group decorations and spotlight padding are not targets. */
export async function readGuidedPolygonVisibility(page: Page): Promise<GuidedPolygonVisibility> {
  return page.evaluate(() => {
    const cells = document.querySelectorAll('#battleMapCanvas [data-tutorial-guided-hex="true"]');
    if (cells.length !== 1) throw new Error("Expected exactly one guided tutorial hex.");
    const cell = cells[0];
    const tile = cell.querySelector("polygon.hex-tile");
    const map = cell.closest(".map-viewport");
    const panel = document.querySelector(".tutorial-panel");
    if (!(tile instanceof SVGPolygonElement) || !(map instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
      throw new Error("Guided polygon, map viewport, or tutorial prompt is missing.");
    }
    const matrix = tile.getScreenCTM();
    if (!matrix || tile.points.numberOfItems < 3) throw new Error("Guided polygon has no painted geometry.");
    const points = Array.from({ length: tile.points.numberOfItems }, (_, index) => {
      const point = tile.points.getItem(index);
      const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      return { x: screen.x, y: screen.y };
    });
    const frame = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    for (let ancestor: HTMLElement | null = map; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      const rect = ancestor.getBoundingClientRect();
      const left = rect.left + ancestor.clientLeft;
      const top = rect.top + ancestor.clientTop;
      if (ancestor === map || /^(auto|scroll|hidden|clip)$/.test(style.overflowX)) {
        frame.left = Math.max(frame.left, left);
        frame.right = Math.min(frame.right, left + ancestor.clientWidth);
      }
      if (ancestor === map || /^(auto|scroll|hidden|clip)$/.test(style.overflowY)) {
        frame.top = Math.max(frame.top, top);
        frame.bottom = Math.min(frame.bottom, top + ancestor.clientHeight);
      }
    }
    const panelRect = panel.getBoundingClientRect();
    const prompt = { left: panelRect.left, top: panelRect.top, right: panelRect.right, bottom: panelRect.bottom };
    // Retain the existing geometry tests' 1px rounding allowance; do not count glow or border padding.
    const promptPoints = [
      { x: prompt.left + 1, y: prompt.top + 1 }, { x: prompt.right - 1, y: prompt.top + 1 },
      { x: prompt.right - 1, y: prompt.bottom - 1 }, { x: prompt.left + 1, y: prompt.bottom - 1 }
    ];
    // Separating axes avoid a false overlap when the prompt only crosses an empty hex bounding-box corner.
    const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }, ...points.map((point, index) => {
      const next = points[(index + 1) % points.length];
      return { x: -(next.y - point.y), y: next.x - point.x };
    })];
    const promptOverlap = axes.every(axis => {
      const targetProjection = points.map(point => point.x * axis.x + point.y * axis.y);
      const promptProjection = promptPoints.map(point => point.x * axis.x + point.y * axis.y);
      return Math.max(...targetProjection) > Math.min(...promptProjection) &&
        Math.max(...promptProjection) > Math.min(...targetProjection);
    });
    const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
    const hit = document.elementFromPoint(center.x, center.y);
    return {
      hex: cell.getAttribute("data-hex"), points, frame, prompt,
      outsideFrame: points.some(point => point.x < frame.left - 1 || point.x > frame.right + 1 ||
        point.y < frame.top - 1 || point.y > frame.bottom + 1),
      promptOverlap,
      centerCovered: hit === null || !cell.contains(hit)
    };
  });
}

/** Assert at the declared capture moment, without another camera wait or forced input. */
export async function expectGuidedPolygonVisible(page: Page): Promise<void> {
  const report = await readGuidedPolygonVisibility(page);
  expect(report, "Guided polygon is fully visible and clickable at tutorial capture: " + JSON.stringify(report))
    .toMatchObject({ outsideFrame: false, promptOverlap: false, centerCovered: false });
}
