/** Shipped CSS and real screen ownership; this contract is not a frame-rate benchmark. */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import type { ScreenManager } from '../../src/ui/screens/ScreenManager';

const source = new JSDOM(readFileSync(resolve('index.html'), 'utf8')).window.document;
const screenIds = ['landingScreen', 'precombatScreen', 'battleScreen', 'campaignScreen'];
// Preserve the shipped screen identity/classes without loading unrelated assets or game state.
const screens = screenIds.map(id => {
  const element = source.getElementById(id);
  if (!element) throw new Error(`Shipped screen ${id} is missing.`);
  return (element.cloneNode(false) as HTMLElement).outerHTML;
}).join('');
const styles = Array.from(source.querySelectorAll('style')).map(style => style.outerHTML).join('\n');
const fixtureHtml = `<!doctype html><html><head>${styles}</head><body><div id="app">${screens}
  <div id="composition-fixed-probe" style="position:fixed;inset:0;z-index:999"></div>
  <div id="composition-absolute-probe" style="position:absolute;inset:0;pointer-events:none"></div>
  </div><div id="composition-outside-probe" style="position:fixed;left:50%;top:50%;width:8px;height:8px;z-index:1"></div>
  </body></html>`;
const component = buildSync({
  entryPoints: [resolve('src/ui/screens/ScreenManager.ts')], bundle: true, write: false,
  platform: 'browser', format: 'iife', globalName: 'screenCompositionFixture'
}).outputFiles[0].text;

/** Test-owned bindings for the bundled production screen manager. */
interface CompositionFixtureWindow extends Window {
  screenCompositionFixture: { ScreenManager: typeof ScreenManager };
  compositionScreenManager: ScreenManager;
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`battle composition ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test('battle visibility alone removes enclosing blur and other screens retain their appearance', async ({ page }, info) => {
      await page.route('**/*', route => route.abort());
      await page.setContent(fixtureHtml);
      await page.addScriptTag({ content: component });
      await page.evaluate(ids => {
        // Only this isolated fixture installs these globals; production screen ownership is unchanged.
        const fixture = window as unknown as CompositionFixtureWindow;
        const manager = new fixture.screenCompositionFixture.ScreenManager();
        for (const id of ids) {
          const screen = document.getElementById(id);
          if (!screen) throw new Error(`Fixture screen ${id} is missing.`);
          manager.registerScreen(id, screen);
        }
        fixture.compositionScreenManager = manager;
      }, screenIds);

      const app = page.locator('#app');
      const originalAppearance = await app.evaluate(element => {
        const css = getComputedStyle(element);
        return { background: css.background, borderRadius: css.borderRadius, width: css.width, height: css.height };
      });
      await expect(app).toHaveCSS('backdrop-filter', 'blur(16px)');
      const originalFixedBounds = await page.locator('#composition-fixed-probe').boundingBox();
      const originalAbsoluteBounds = await page.locator('#composition-absolute-probe').boundingBox();
      expect(originalFixedBounds).not.toBeNull();
      expect(originalAbsoluteBounds).not.toBeNull();
      for (const id of ['landingScreen', 'precombatScreen', 'campaignScreen', 'battleScreen', 'precombatScreen', 'battleScreen', 'landingScreen']) {
        await page.evaluate(screenId => {
          const screen = document.getElementById(screenId);
          if (!screen) throw new Error(`Fixture screen ${screenId} is missing.`);
          (window as unknown as CompositionFixtureWindow).compositionScreenManager.showScreen(screen);
        }, id);
        await expect(page.locator('#app > .screen:not(.hidden)')).toHaveCount(1);
        await expect(page.locator(`#${id}`)).not.toHaveClass(/\bhidden\b/);
        await expect(app).toHaveCSS('backdrop-filter', id === 'battleScreen' ? 'none' : 'blur(16px)');
        expect(await app.evaluate(element => {
          const css = getComputedStyle(element);
          return { background: css.background, borderRadius: css.borderRadius, width: css.width, height: css.height };
        })).toEqual(originalAppearance);
        expect(await app.evaluate(element => (element as HTMLElement).style.getPropertyValue('backdrop-filter'))).toBe('');
        // A backdrop filter also establishes containing/stacking contexts. Its
        // replacement must not move fixed dialogs or let app children escape above outside UI.
        expect(await page.locator('#composition-fixed-probe').boundingBox()).toEqual(originalFixedBounds);
        expect(await page.locator('#composition-absolute-probe').boundingBox()).toEqual(originalAbsoluteBounds);
        expect(await page.locator('#composition-outside-probe').evaluate(element => {
          const box = element.getBoundingClientRect();
          return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === element;
        })).toBe(true);
      }
      await page.evaluate(() => (window as unknown as CompositionFixtureWindow).compositionScreenManager.hideAllScreens());
      await expect(page.locator('#app > .screen:not(.hidden)')).toHaveCount(0);
      await expect(app).toHaveCSS('backdrop-filter', 'blur(16px)');

      const fullscreenSupported = await page.evaluate(() => document.fullscreenEnabled
        && typeof document.getElementById('app')?.requestFullscreen === 'function');
      if (!fullscreenSupported) {
        info.annotations.push({ type: 'fullscreen-capability', description: 'This browser does not expose fullscreen; normal screen/positioning contracts still ran.' });
        return;
      }
      // Production fullscreen targets #app. Use native clicks for transient user
      // activation; a supported API rejection must fail, never become a skipped test.
      await page.evaluate(() => {
        const element = document.getElementById('app');
        if (!element) throw new Error('Missing fullscreen app target.');
        const enter = document.createElement('button');
        enter.id = 'composition-enter-fullscreen';
        enter.textContent = 'Enter fullscreen';
        enter.style.cssText = 'position:fixed;left:24px;bottom:24px;z-index:1001';
        enter.onclick = () => { void element.requestFullscreen().catch(error => { enter.dataset.error = String(error); }); };
        document.body.append(enter);
        const leave = document.createElement('button');
        leave.id = 'composition-leave-fullscreen';
        leave.textContent = 'Exit fullscreen';
        leave.style.cssText = 'position:fixed;left:24px;top:24px;z-index:1001';
        leave.onclick = () => { void document.exitFullscreen().catch(error => { leave.dataset.error = String(error); }); };
        element.append(leave);
      });
      await page.locator('#composition-enter-fullscreen').click();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('app');
      await expect.poll(() => app.evaluate(element => {
        const box = element.getBoundingClientRect();
        return Math.abs(box.width - innerWidth) < 1 && Math.abs(box.height - innerHeight) < 1;
      }), 'Fullscreen shell fills the native viewport').toBe(true);
      const fullscreenFixed = await page.locator('#composition-fixed-probe').boundingBox();
      const fullscreenAbsolute = await page.locator('#composition-absolute-probe').boundingBox();
      expect(fullscreenFixed).not.toBeNull();
      expect(fullscreenAbsolute).not.toBeNull();
      for (const id of ['landingScreen', 'battleScreen', 'landingScreen']) {
        await page.evaluate(screenId => (window as unknown as CompositionFixtureWindow).compositionScreenManager.showScreenById(screenId), id);
        await expect(app).toHaveCSS('backdrop-filter', id === 'battleScreen' ? 'none' : 'blur(16px)');
        expect(await page.locator('#composition-fixed-probe').boundingBox()).toEqual(fullscreenFixed);
        expect(await page.locator('#composition-absolute-probe').boundingBox()).toEqual(fullscreenAbsolute);
        expect(await page.locator('#composition-outside-probe').evaluate(element => {
          const box = element.getBoundingClientRect();
          return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === element;
        }), 'Fullscreen app retains top-layer ownership').toBe(false);
      }
      await page.locator('#composition-leave-fullscreen').click();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
      await expect.poll(() => page.locator('#composition-fixed-probe').boundingBox()).toEqual(originalFixedBounds);
      await expect.poll(() => page.locator('#composition-absolute-probe').boundingBox()).toEqual(originalAbsoluteBounds);
    });
  });
}
