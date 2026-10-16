import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import { expectTutorialCardVisible } from './support/tutorialCardGeometry';
import type * as BriefCardFixture from './support/tutorialBriefCardFixture';

const source = new JSDOM(readFileSync(resolve('index.html'), 'utf8')).window.document;
const popup = source.getElementById('battlePopupLayer');
if (!popup) throw new Error('Shipped popup markup is missing.');
const styles = Array.from(source.querySelectorAll('style'), style => style.outerHTML).join('\n');
const component = buildSync({
  entryPoints: [resolve('tests/e2e/support/tutorialBriefCardFixture.ts')], bundle: true, write: false,
  platform: 'browser', format: 'iife', globalName: 'briefCardFixture',
  define: { 'import.meta.url': JSON.stringify('http://tutorial-convoy.fixture/src/data/unitSpriteCatalog.ts'), 'import.meta.glob': 'undefined' }
}).outputFiles[0].text;
interface FixtureWindow extends Window { briefCardFixture: typeof BriefCardFixture }

test.afterEach(async ({ page }) => {
  await page.evaluate(() => (window as unknown as Partial<FixtureWindow>).briefCardFixture?.dispose());
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
  for (const count of [0, 1, 2]) {
    test(`convoy brief keeps ${count} convoys separate from care teams at ${viewport.width}px`, async ({ page }, info) => {
      await page.setViewportSize(viewport);
      await page.route('**/*', route => route.request().url() === 'http://tutorial-convoy.fixture/'
        ? route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8">${styles}</head><body>${popup!.outerHTML}</body></html>` })
        : route.abort());
      await page.goto('http://tutorial-convoy.fixture/');
      await page.addScriptTag({ content: component });
      await page.evaluate(total => (window as unknown as FixtureWindow).briefCardFixture.mountConvoys(total), count);
      for (const step of [1, 2, 3]) {
        await expect(page.locator('.tutorial-step-indicator')).toHaveText(`Logistics Brief ${step} of 4`);
        await page.locator('.tutorial-action-btn').click();
      }
      await expect(page.locator('.tutorial-step-indicator')).toHaveText('Logistics Brief 4 of 4');
      const target = page.locator('[data-logistics-convoys] > .tutorial-highlight');
      await expect(target).toHaveCount(1);
      await expect(target).toContainText(count ? 'Convoy 1' : 'No active convoys.');
      await expect(page.locator('[data-logistics-care-teams] .logistics-convoy-item')).toHaveCount(2);
      await expect(page.locator('[data-logistics-care-teams] .tutorial-highlight')).toHaveCount(0);
      await expectTutorialCardVisible(page, target);
      await page.screenshot({ path: info.outputPath('convoy-brief.png'), animations: 'disabled' });
      if (viewport.width === 390) {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.setViewportSize(viewport);
        await expectTutorialCardVisible(page, target);
      }
      await page.locator('.tutorial-action-btn').click();
      await expect(page.locator('#tutorialOverlayContainer')).toHaveClass(/hidden/);
      expect(await page.locator('[data-popup-body]').evaluate(element => getComputedStyle(element, '::after').content))
        .toBe('none');
    });
  }
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1680, height: 857 }]) {
  test(`roster readiness card stays readable at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.route('**/*', route => route.request().url() === 'http://tutorial-convoy.fixture/'
      ? route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8">${styles}</head><body>${popup!.outerHTML}</body></html>` })
      : route.abort());
    await page.goto('http://tutorial-convoy.fixture/');
    await page.addScriptTag({ content: component });
    await page.evaluate(() => (window as unknown as FixtureWindow).briefCardFixture.mountRoster());
    await expect(page.locator('.tutorial-step-indicator')).toHaveText('Roster Brief 1 of 4');
    await page.locator('.tutorial-action-btn').click();
    await expect(page.locator('.tutorial-step-indicator')).toHaveText('Roster Brief 2 of 4');
    const target = page.locator('[data-roster-list="frontline"] .army-roster-entry').first();
    await expectTutorialCardVisible(page, target);
    await page.screenshot({ path: info.outputPath('roster-brief.png'), animations: 'disabled' });
    await page.locator('.tutorial-skip-btn').click();
    await expect(page.locator('#tutorialOverlayContainer')).toHaveClass(/hidden/);
    expect(await page.locator('[data-popup-body]').evaluate(element => getComputedStyle(element, '::after').content)).toBe('none');
  });
}
