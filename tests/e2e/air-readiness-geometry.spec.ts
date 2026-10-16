/** Real popup renderer and shipped styles; this fixture is not a live tutorial certificate. */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import { expectAirReadinessVisible, readAirReadinessGeometry } from './support/airReadinessGeometry';
import type * as AirReadinessFixture from './support/airReadinessFixture';

const source = new JSDOM(readFileSync(resolve('index.html'), 'utf8')).window.document;
const popup = source.getElementById('battlePopupLayer');
const battle = source.getElementById('battleScreen')?.cloneNode(false) as HTMLElement | undefined;
if (!popup || !battle) throw new Error('Shipped battle popup markup is missing.');
battle.classList.remove('hidden');
const styles = Array.from(source.querySelectorAll('style')).map(style => style.outerHTML).join('\n');
const fixtureHtml = `<!doctype html><html><head><meta charset="utf-8">${styles}</head>
  <body><div id="app">${battle.outerHTML}${popup.outerHTML}</div></body></html>`;
const component = buildSync({
  entryPoints: [resolve('tests/e2e/support/airReadinessFixture.ts')], bundle: true, write: false,
  platform: 'browser', format: 'iife', globalName: 'airReadinessFixture',
  // A source bundle has no Vite asset manifest. Resolve unrequested sprite URLs against this local fixture origin.
  define: { 'import.meta.url': JSON.stringify('http://air-readiness.fixture/src/data/unitSpriteCatalog.ts'), 'import.meta.glob': 'undefined' }
}).outputFiles[0].text;

/** Test-owned module binding; no extra production singleton is exposed. */
interface AirFixtureWindow extends Window { airReadinessFixture: typeof AirReadinessFixture }

async function mountAirPopup(page: Page): Promise<void> {
  // Give production storage a normal origin while serving only this source-backed fixture; no network dependency.
  await page.route('**/*', route => route.request().url() === 'http://air-readiness.fixture/'
    ? route.fulfill({ contentType: 'text/html', body: fixtureHtml }) : route.abort());
  await page.goto('http://air-readiness.fixture/');
  await page.addScriptTag({ content: component });
  await page.evaluate(() => (window as unknown as AirFixtureWindow).airReadinessFixture.mountAirReadinessFixture());
  await expect(page.locator('.battle-popup[data-popup-key="airSupport"]')).toBeVisible();
  await page.evaluate(async () => { await document.fonts.ready; });
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => (window as unknown as Partial<AirFixtureWindow>).airReadinessFixture?.disposeAirReadinessFixture());
});

for (const viewport of [
  { width: 1680, height: 857 }, { width: 1440, height: 900 },
  { width: 761, height: 900 }, { width: 760, height: 900 }, { width: 390, height: 844 }
]) {
  test.describe(`Air readiness ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test('heading and all readiness indicators fit the actual popup', async ({ page }, info) => {
      await mountAirPopup(page);
      // Preserve measurements before the assertion, including old-CSS failures needed for causal diagnosis.
      await info.attach('air-readiness-geometry', {
        contentType: 'application/json', body: Buffer.from(JSON.stringify(await readAirReadinessGeometry(page), null, 2))
      });
      await page.screenshot({ path: info.outputPath('air-readiness.png'), scale: 'css' });
      await expectAirReadinessVisible(page);
    });
  });
}

test.describe('Air readiness visibility contract', () => {
  test.use({ viewport: { width: 1680, height: 857 } });
  test('detects clipped heading text even when the board itself fits', async ({ page }) => {
    await mountAirPopup(page);
    const before = await page.locator('.air-readiness-board').boundingBox();
    await page.addStyleTag({ content: '.air-readiness-board__label { width:80px; overflow:hidden; white-space:nowrap; }' });
    expect(await page.locator('.air-readiness-board').boundingBox()).toEqual(before);
    await expect(expectAirReadinessVisible(page)).rejects.toThrow(/Air readiness content/);
  });
  test('detects clipped Refit even when the board itself fits', async ({ page }) => {
    await mountAirPopup(page);
    const before = await page.locator('.air-readiness-board').boundingBox();
    await page.addStyleTag({ content: '.air-chip:last-child { transform:translateX(120px); }' });
    expect(await page.locator('.air-readiness-board').boundingBox()).toEqual(before);
    await expect(expectAirReadinessVisible(page)).rejects.toThrow(/Air readiness content/);
  });
  test('detects a displaced dialog beyond its clipping ancestor', async ({ page }) => {
    await mountAirPopup(page);
    await page.addStyleTag({ content: '.battle-popup[data-popup-key="airSupport"] { transform:translateX(70vw); }' });
    await expect(expectAirReadinessVisible(page)).rejects.toThrow(/Air popup must fit/);
  });
  test('detects a displaced Close control even when the dialog fits', async ({ page }) => {
    await mountAirPopup(page);
    const before = await page.locator('.battle-popup').boundingBox();
    const closeBefore = (await readAirReadinessGeometry(page)).close.bounds;
    await page.locator('#battlePopupClose').evaluate(element => {
      // Override authored hover/focus transforms and interpolation so the injected defect is immediate.
      element.style.transition = 'none';
      element.style.transform = 'translateX(120px)';
    });
    expect(await page.locator('.battle-popup').boundingBox()).toEqual(before);
    const displaced = await readAirReadinessGeometry(page);
    expect(displaced.close.bounds.left).toBeGreaterThan(closeBefore.left + 119);
    expect(displaced.close.outsideFrame).toBe(true);
    expect(displaced.closeHitAtCenter).toBe(false);
    await expect(expectAirReadinessVisible(page)).rejects.toThrow(/Air popup (?:Close )?must fit/);
  });
});
