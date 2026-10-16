/** Source-backed visual regression; the complete journey remains a separate acceptance gate. */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import { expectAirBriefArrow, expectTutorialArrow } from './support/tutorialArrowGeometry';
import type * as TutorialArrowFixture from './support/tutorialArrowFixture';
import type { TutorialPhase } from '../../src/state/TutorialState';

const source = new JSDOM(readFileSync(resolve('index.html'), 'utf8')).window.document;
const popup = source.getElementById('battlePopupLayer');
const battle = source.getElementById('battleScreen')?.cloneNode(false) as HTMLElement | undefined;
if (!popup || !battle) throw new Error('Shipped battle popup markup is missing.');
battle.classList.remove('hidden');
const styles = Array.from(source.querySelectorAll('style')).map(style => style.outerHTML).join('\n');
const component = buildSync({
  entryPoints: [resolve('tests/e2e/support/tutorialArrowFixture.ts')], bundle: true, write: false,
  platform: 'browser', format: 'iife', globalName: 'tutorialArrowFixture',
  define: { 'import.meta.url': JSON.stringify('http://tutorial-arrow.fixture/src/data/unitSpriteCatalog.ts'), 'import.meta.glob': 'undefined' }
}).outputFiles[0].text;

/** Test-owned binding; production exposes no new singleton or test hook. */
interface FixtureWindow extends Window { tutorialArrowFixture: typeof TutorialArrowFixture }

async function mount(page: Page, markup: string): Promise<void> {
  await page.route('**/*', route => route.request().url() === 'http://tutorial-arrow.fixture/'
    ? route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8">${styles}</head><body>${markup}</body></html>` })
    : route.abort());
  await page.goto('http://tutorial-arrow.fixture/');
  await page.addScriptTag({ content: component });
}

async function openAirBrief3(page: Page): Promise<void> {
  await mount(page, `<div id="app">${battle!.outerHTML}${popup!.outerHTML}</div>`);
  await page.evaluate(() => (window as unknown as FixtureWindow).tutorialArrowFixture.mountAirBrief());
  await expect(page.locator('.tutorial-step-indicator')).toHaveText('Air Brief 1 of 4');
  await page.locator('.tutorial-action-btn').click();
  await expect(page.locator('.tutorial-step-indicator')).toHaveText('Air Brief 2 of 4');
  await page.locator('[data-air-mission-tab]').first().click();
  await expect(page.locator('.tutorial-step-indicator')).toHaveText('Air Brief 3 of 4');
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => (window as unknown as Partial<FixtureWindow>).tutorialArrowFixture?.dispose());
});

for (const viewport of [{ width: 1680, height: 857 }, { width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`Air Brief 3 painted arrow ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await openAirBrief3(page);
    await page.screenshot({ path: info.outputPath('air-brief-3.png'), animations: 'disabled', scale: 'css' });
    await expectAirBriefArrow(page);
    // Include the actual arrow beyond the panel's border and the highlighted content in the reference.
    await expect(page).toHaveScreenshot(`air-brief-3-${viewport.width}.png`, {
      animations: 'disabled', scale: 'css', maxDiffPixels: 0
    });
    await page.locator('.tutorial-action-btn').click();
    await expect(page.locator('.tutorial-step-indicator')).toHaveText('Air Brief 4 of 4');
    await page.locator('.tutorial-action-btn').click();
    await expect(page.locator('#tutorialOverlayContainer')).toHaveClass(/hidden/);
  });
}

const placements: { phase: TutorialPhase; target: string; style: string; direction: 'left' | 'right' | 'up' | 'down' }[] = [
  { phase: 'budget_overview', target: 'id="precombatBudgetPanel"', style: 'left:80px;top:350px', direction: 'left' },
  { phase: 'select_infantry', target: 'data-key="infantry"', style: 'right:80px;top:350px', direction: 'right' },
  { phase: 'mission_briefing', target: 'class="battle-map-header"', style: 'left:650px;bottom:100px', direction: 'down' }
];

for (const placement of placements) {
  test(`flipped ${placement.phase} arrow follows final layout`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mount(page, `<div ${placement.target} data-arrow-test-target style="position:fixed;width:120px;height:60px;${placement.style}">Target</div>`);
    await page.evaluate(phase => (window as unknown as FixtureWindow).tutorialArrowFixture.mountAnchoredStep(phase), placement.phase);
    await expectTutorialArrow(page, placement.direction);
    // Moving the existing target exercises the real mutation observer, not another render entry point.
    const unflipped = { left: 'right', right: 'left', up: 'down', down: 'up' } as const;
    await page.locator('[data-arrow-test-target]').evaluate((target, direction) => {
      Object.assign((target as HTMLElement).style, {
        right: 'auto', bottom: 'auto',
        left: direction === 'left' ? '1000px' : direction === 'right' ? '200px' : '650px',
        top: direction === 'up' ? '650px' : direction === 'down' ? '100px' : '350px'
      });
    }, placement.direction);
    await expectTutorialArrow(page, unflipped[placement.direction]);
  });
}

test('Air Brief 3 resizes without changing the step or leaving a stale arrow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openAirBrief3(page);
  await expectAirBriefArrow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectAirBriefArrow(page);
  await page.setViewportSize({ width: 1680, height: 857 });
  await expectAirBriefArrow(page);
  await expect(page.locator('.tutorial-step-indicator')).toHaveText('Air Brief 3 of 4');
});

test('painted-arrow assertion rejects the old opposite-facing triangle', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openAirBrief3(page);
  // A stylesheet mutation remains effective even when the real layout observer runs again.
  await page.addStyleTag({ content: '.tutorial-arrow { border-right:0 solid transparent !important; border-left:14px solid rgba(245,196,109,.35) !important; left:100% !important; right:auto !important; }' });
  await expect(expectAirBriefArrow(page)).rejects.toThrow(/painted triangle/);
});

test('missing targets and top-docked battle prompts do not display an orphan arrow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mount(page, '<div id="precombatBudgetPanel" style="position:fixed;left:80px;top:350px;width:120px;height:60px">Budget</div>');
  await page.evaluate(() => (window as unknown as FixtureWindow).tutorialArrowFixture.mountAnchoredStep('budget_overview'));
  await page.locator('#precombatBudgetPanel').evaluate(target => target.remove());
  await expect(page.locator('.tutorial-arrow')).toBeHidden();
  await page.evaluate(() => {
    (window as unknown as FixtureWindow).tutorialArrowFixture.dispose();
    (window as unknown as FixtureWindow).tutorialArrowFixture.mountAnchoredStep('initiative_order');
  });
  await expect(page.locator('.tutorial-arrow')).toBeHidden();
  await page.evaluate(() => {
    (window as unknown as FixtureWindow).tutorialArrowFixture.dispose();
    (window as unknown as FixtureWindow).tutorialArrowFixture.mountAnchoredStep('place_units');
  });
  await expect(page.locator('.tutorial-arrow')).toBeHidden();
});
