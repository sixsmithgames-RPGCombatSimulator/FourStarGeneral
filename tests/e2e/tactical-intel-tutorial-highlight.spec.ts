/** Tutorial decoration must preserve the floating card's real clickable controls. */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { buildSync } from 'esbuild';
import type { SelectionIntelOverlay } from '../../src/ui/announcements/SelectionIntelOverlay';
import type { BattleSelectionIntel } from '../../src/ui/announcements/AnnouncementTypes';

const source: Document = new JSDOM(readFileSync(resolve('index.html'), 'utf8')).window.document;
const styles: string = Array.from(source.querySelectorAll('style')).map((style: HTMLStyleElement): string => style.outerHTML).join('\n');
const markup: string = source.querySelector('#battleIntelOverlay')!.outerHTML;
const component: string = buildSync({
  entryPoints: [resolve('src/ui/announcements/SelectionIntelOverlay.ts')], bundle: true, write: false,
  platform: 'browser', format: 'iife', globalName: 'tutorialIntelFixture'
}).outputFiles[0].text;
const intel: BattleSelectionIntel = {
  kind: 'battle', hexKey: '9,7', terrainName: 'Plains', unitLabel: 'Engineering Corps',
  unitStrength: 100, unitAmmo: 6, unitFuel: null, unitEntrenchment: 1, canEntrench: true,
  movementRemaining: 4, movementMax: 4, rangeLabel: '1-4', facingLabel: 'E',
  moveOptions: 0, attackOptions: 0, unitTabs: [], statusMessage: '',
  statusChips: [{ label: 'Engineer', tone: 'neutral' }], detailSections: [], notes: [], actionCards: []
};

for (const width of [1280, 390]) {
  test(`tutorial-highlighted card keeps Expand clickable at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 });
    await page.setContent(`<!doctype html><html><head>${styles}</head><body><div id="battleScreen" style="position:relative;display:block;width:min(800px,100%);height:500px">${markup}</div></body></html>`);
    await page.addScriptTag({ content: component });
    await page.evaluate((intel: BattleSelectionIntel): void => {
      const runtime = window as unknown as { tutorialIntelFixture: { SelectionIntelOverlay: typeof SelectionIntelOverlay } };
      new runtime.tutorialIntelFixture.SelectionIntelOverlay().update(intel);
      document.querySelector('#battleIntelOverlay')!.classList.add('tutorial-highlight');
      document.querySelector('#battleIntelOverlayToggle')!.classList.add('tutorial-highlight');
    }, intel);
    await expect(page.locator('#battleIntelOverlay')).toHaveCSS('position', 'absolute');
    await expect(page.locator('#battleIntelOverlayToggle')).toHaveCSS('position', 'absolute');
    await page.locator('#battleIntelOverlayToggle').click();
    await expect(page.locator('#battleIntelOverlay')).toHaveAttribute('data-collapsed', 'false');
    await page.locator('#battleIntelOverlayToggle').click();
    await expect(page.locator('#battleIntelOverlay')).toHaveAttribute('data-collapsed', 'true');
    await page.locator('#battleIntelOverlay').screenshot({ path: info.outputPath('highlighted-compact-card.png') });
  });
}
