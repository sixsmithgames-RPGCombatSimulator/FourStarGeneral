import { expect, type Page } from '@playwright/test';
import { waitForTutorialPanelEntrance } from './tutorialEvidence';

/** Verify the painted triangle and its attachment edge, not just the intended CSS class. */
export async function expectTutorialArrow(page: Page, direction: 'left' | 'right' | 'up' | 'down'): Promise<void> {
  await waitForTutorialPanelEntrance(page);
  await expect(page.locator('.tutorial-arrow')).toBeVisible();
  const border = { left: 'right', right: 'left', up: 'bottom', down: 'top' }[direction];
  await expect(page.locator('.tutorial-arrow'), 'The painted triangle must point toward the target')
    .toHaveCSS(`border-${border}-width`, '14px');
  const geometry = await page.locator('.tutorial-arrow').evaluate(arrow => {
    const panel = arrow.parentElement!.getBoundingClientRect();
    const bounds = arrow.getBoundingClientRect();
    const style = getComputedStyle(arrow);
    return {
      panel: { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom },
      arrow: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom },
      borders: {
        left: [style.borderRightWidth, style.borderRightColor],
        right: [style.borderLeftWidth, style.borderLeftColor],
        up: [style.borderBottomWidth, style.borderBottomColor],
        down: [style.borderTopWidth, style.borderTopColor]
      }
    };
  });
  expect(geometry.borders[direction], 'The painted triangle must point toward the target').toEqual(['14px', 'rgba(245, 196, 109, 0.35)']);
  const gap = direction === 'left' ? geometry.arrow.right - geometry.panel.left
    : direction === 'right' ? geometry.panel.right - geometry.arrow.left
      : direction === 'up' ? geometry.arrow.bottom - geometry.panel.top
        : geometry.panel.bottom - geometry.arrow.top;
  expect(Math.abs(gap), 'The arrow must be attached to the target-facing panel edge').toBeLessThanOrEqual(2);
}

/** Air Brief 3 must face its content in both original and flipped layouts; mobile intentionally omits arrows. */
export async function expectAirBriefArrow(page: Page): Promise<void> {
  await waitForTutorialPanelEntrance(page);
  if (page.viewportSize()!.width <= 768) {
    await expect(page.locator('.tutorial-arrow')).toBeHidden();
    return;
  }
  const target = await page.locator('[data-air-sortie-board]').boundingBox();
  const panel = await page.locator('.tutorial-panel').boundingBox();
  expect(target).not.toBeNull();
  expect(panel).not.toBeNull();
  const targetCenter = target!.x + target!.width / 2;
  const targetOnLeft = targetCenter < panel!.x;
  if (!targetOnLeft) {
    expect(targetCenter, 'Sortie content lies beyond the final prompt edge').toBeGreaterThan(panel!.x + panel!.width);
  }
  await expectTutorialArrow(page, targetOnLeft ? 'left' : 'right');
}
