/** Local CSS contract using shipped battle markup and the real initiative-control component; no game state. */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import type { EnhancedInitiativeTurnControls } from '../../src/ui/components/EnhancedInitiativeTurnControls';

const source = new JSDOM(readFileSync(resolve('index.html'), 'utf8')).window.document;
const battle = source.querySelector('#battleScreen');
if (!battle) throw new Error('Shipped battle screen markup is missing.');
const fixtureHtml = `<!doctype html><html><head><meta charset="utf-8">${Array.from(source.querySelectorAll('style')).map(style => style.outerHTML).join('\n')}</head><body><div id="app">${battle.outerHTML}</div></body></html>`;
const component = buildSync({
  entryPoints: [resolve('src/ui/components/EnhancedInitiativeTurnControls.ts')],
  bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'initiativeFixture'
}).outputFiles[0].text;

interface FixtureWindow extends Window {
  initiativeFixture: { EnhancedInitiativeTurnControls: typeof EnhancedInitiativeTurnControls };
  tacticalGeometryControls: EnhancedInitiativeTurnControls;
  tacticalGeometryActions: string[];
}

async function mountBattleHeader(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => route.abort());
  await page.setContent(fixtureHtml);
  await page.evaluate(() => {
    const required = <T extends HTMLElement>(selector: string): T => {
      const node = document.querySelector<T>(selector);
      if (!node) throw new Error(`Missing shipped header fixture node: ${selector}`);
      return node;
    };
    required('#battleScreen').classList.remove('hidden');
    required('.battle-main').dataset.panelCollapsed = 'true';
    required('.battle-main').dataset.activityCollapsed = 'true';
    required('#battleActivityLog').dataset.activityCollapsed = 'true';
    required('#battleCampaignTitle').textContent = 'Operation Overlord - Normandy Campaign';
    required('#battleMissionTitle').textContent = 'Fortified Assault — Omaha-Gold Sector';
    required('#battleObjectiveIndex').textContent = 'Tactical Objective 1 of 4';
    required('#battleObjectiveTitle').textContent = 'Secure Engagement Point 1';
    required('#battleObjectiveStatus').textContent = 'Enemy Held';
    required('#battleTurnIndicator').textContent = '3';
    required('#battleSaveStatus').textContent = 'Turn-start autosave complete.';
    required('#endTurn').style.display = 'none';
    required('.battle-map-header').classList.add('initiative-controls-active');
    required('.battle-map-header__command-group').classList.add('initiative-controls-active');
  });
  await page.addScriptTag({ content: component });
  await page.evaluate(() => {
    const runtime = window as unknown as FixtureWindow;
    const container = document.createElement('div');
    container.className = 'initiative-turn-controls-container';
    document.querySelector('.battle-map-header__command-group')!.append(container);
    runtime.tacticalGeometryActions = [];
    runtime.tacticalGeometryControls = new runtime.initiativeFixture.EnhancedInitiativeTurnControls(container, {
      onSkipTurn() {}, onEndTurn: () => runtime.tacticalGeometryActions.push('end-turn'),
      onNextGroup: () => runtime.tacticalGeometryActions.push('next-group'), onNextActivation() {},
      onCompleteActivation() {}, onProceedToNext() {}, onSkipGroup() {}
    }, { showSkipTurn: true, showAdvanceButton: true, showProceedButton: false, enableKeyboardShortcuts: true });
    runtime.tacticalGeometryControls.updatePhase('initiativeTurn');
    runtime.tacticalGeometryControls.updatePlayerTurn(true);
  });
}

async function bounds(locator: Locator) {
  return locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height,
      scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
  });
}

for (const viewport of [
  { width: 640, height: 360 }, { width: 753, height: 356 }, { width: 800, height: 900 },
  { width: 1280, height: 720 }, { width: 1506, height: 768 }, { width: 1920, height: 1080 }
]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    // This reproduces the measured CSS viewport/DPR, not a claim of native Chrome zoom certification.
    test.use({ viewport, deviceScaleFactor: viewport.width === 753 ? 2.5 : 1 });
    test('FSG_CAM_088 tactical status and initiative actions reflow inside the visible header', async ({ page }, info) => {
      await mountBattleHeader(page);
      for (const ready of [true, false]) {
        await page.evaluate(roundReady => {
          const controls = (window as unknown as FixtureWindow).tacticalGeometryControls;
          controls.updateCurrentUnit(roundReady ? null : { unitId: 'geometry-only', ownerId: 'player', initiative: 6, isActivated: false, sortOrder: 0 });
          controls.updateRoundAdvanceReady(roundReady);
        }, ready);
        const name = ready ? 'end-turn' : 'active-group';
        const header = page.locator('.battle-map-header');
        const controls = header.locator('.enhanced-initiative-turn-controls');
        const selectors = ['.group-advance-btn', '.battle-operation-identity', '#battleCycleObjective', '.turn-status', '#battleSettingsToggle',
          '#battleSaveButton', '#battleLoadButton', '#battleSaveStatus', '.initiative-status',
          '.initiative-status__label', '.initiative-status__value', '.initiative-status__detail',
          '.skip-group-btn', '.next-activation-btn'];
        const measured = Object.fromEntries(await Promise.all(selectors.map(async selector => [selector, await bounds(header.locator(selector))] as const)));
        const headerBox = await bounds(header);
        const mapBox = await bounds(page.locator('#battleScreen .map-viewport'));
        const geometryPath = info.outputPath(`${name}-geometry.json`);
        writeFileSync(geometryPath, JSON.stringify({ viewport, header: headerBox, map: mapBox, elements: measured,
          browser: await page.evaluate(() => ({ pixelRatio: devicePixelRatio,
            rootFontSize: getComputedStyle(document.documentElement).fontSize,
            rootFontFamily: getComputedStyle(document.documentElement).fontFamily,
            initiativeButtonFont: getComputedStyle(document.querySelector('.group-advance-btn')!).font,
            headingFont: getComputedStyle(document.querySelector('#battleScreenHeading')!).font
          })) }, null, 2));
        await info.attach(`${name}-geometry.json`, { path: geometryPath, contentType: 'application/json' });
        await page.screenshot({ path: info.outputPath(`${name}.png`), scale: 'css' });

        for (const [selector, box] of Object.entries(measured)) {
          expect(box.width, `${selector} retains visible width`).toBeGreaterThan(0);
          expect(box.height, `${selector} retains visible height`).toBeGreaterThan(0);
          expect(box.x, `${selector} is not clipped at the left`).toBeGreaterThanOrEqual(headerBox.x - 1);
          expect(box.right, `${selector} fits the header`).toBeLessThanOrEqual(headerBox.right + 1);
          expect(box.right, `${selector} fits the CSS viewport`).toBeLessThanOrEqual(viewport.width + 1);
          expect(box.y, `${selector} is vertically reachable`).toBeGreaterThanOrEqual(-1);
          expect(box.bottom, `${selector} is vertically reachable`).toBeLessThanOrEqual(viewport.height + 1);
          expect(box.scrollWidth, `${selector} content is not horizontally clipped`).toBeLessThanOrEqual(box.clientWidth + 1);
        }
        expect(mapBox.height, 'Reflow leaves a positive map viewport').toBeGreaterThanOrEqual(48);
        expect(mapBox.y, 'The header does not overlap the map').toBeGreaterThanOrEqual(headerBox.bottom - 1);
        expect(mapBox.bottom, 'The map stays inside the viewport').toBeLessThanOrEqual(viewport.height + 1);
        expect(headerBox.scrollWidth, 'No hidden horizontal overflow in the header').toBeLessThanOrEqual(headerBox.clientWidth + 1);

        for (const button of await header.locator('button:visible').all()) {
          const box = await bounds(button);
          expect(box.height, `${await button.textContent()} retains a 44px target`).toBeGreaterThanOrEqual(44);
          expect(await button.evaluate(element => {
            const rect = element.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            return hit === element || element.contains(hit);
          }), 'Header actions are not covered by another control').toBe(true);
        }
        const advance = controls.locator('.group-advance-btn');
        await expect(advance).toHaveText(ready ? 'End Turn' : 'Next Group');
        if (ready) {
          await page.locator('#battleLoadButton').focus();
          await page.keyboard.press('Tab');
          await expect(advance).toBeFocused();
          await page.keyboard.press('Enter');
          await page.keyboard.press('Shift+Tab');
          await expect(page.locator('#battleLoadButton')).toBeFocused();
        } else {
          await advance.click();
        }
      }
      expect(await page.evaluate(() => (window as unknown as FixtureWindow).tacticalGeometryActions)).toEqual(['end-turn', 'next-group']);
    });
  });
}
