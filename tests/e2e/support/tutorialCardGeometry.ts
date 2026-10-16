import { expect, type Locator, type Page } from '@playwright/test';
import { waitForTutorialPanelEntrance } from './tutorialEvidence';

/** A bounded briefing card must be readable, not merely enclosed by a spotlight. */
export async function expectTutorialCardVisible(page: Page, target: Locator): Promise<void> {
  await waitForTutorialPanelEntrance(page);
  await expect.poll(async () => target.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const prompt = document.querySelector('.tutorial-panel')!.getBoundingClientRect();
    let top = 0;
    let bottom = innerHeight;
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(ancestor).overflowY)) {
        const clip = ancestor.getBoundingClientRect();
        top = Math.max(top, clip.top);
        bottom = Math.min(bottom, clip.bottom);
      }
    }
    const overlaps = rect.left < prompt.right && rect.right > prompt.left
      && rect.top < prompt.bottom && rect.bottom > prompt.top;
    return rect.top >= top - 1 && rect.bottom <= bottom + 1
      && rect.left >= -1 && rect.right <= innerWidth + 1 && !overlaps;
  }), { message: 'The highlighted briefing card must be fully visible outside the prompt and clipping ancestors.' }).toBe(true);
}
