/** Source-backed rail rendering, not a mission playthrough or a second initiative state machine. */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import type { EnhancedInitiativeTurnControls } from '../../src/ui/components/EnhancedInitiativeTurnControls';

const source = new JSDOM(readFileSync(resolve('index.html'), 'utf8')).window.document;
const styles = Array.from(source.querySelectorAll('style')).map(style => style.outerHTML).join('\n');
const component = buildSync({
  stdin: { contents: "export {EnhancedInitiativeTurnControls} from './src/ui/components/EnhancedInitiativeTurnControls';",
    resolveDir: resolve('.'), loader: 'ts' },
  bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'allyRail'
}).outputFiles[0].text;

interface RailWindow extends Window {
  allyRail: { EnhancedInitiativeTurnControls: typeof EnhancedInitiativeTurnControls };
  allyControls: EnhancedInitiativeTurnControls;
}

for (const width of [1680, 1440, 390]) {
  test(`autonomous Ally initiative identity and command containment at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/*', route => route.abort());
    await page.setContent(`<!doctype html><html><head>${styles}</head><body style="margin:0">
      <main id="battleScreen" style="width:calc(100% - 32px);margin:16px">
        <header class="battle-map-header initiative-controls-active">
          <div class="battle-map-header__command-group initiative-controls-active">
            <div id="allyRailFixture" class="initiative-turn-controls-container enhanced-initiative-turn-controls"></div>
          </div>
        </header>
      </main></body></html>`);
    await page.addScriptTag({ content: component });
    await page.evaluate(() => {
      const runtime = window as unknown as RailWindow;
      const noop = (): void => undefined;
      const controls = new runtime.allyRail.EnhancedInitiativeTurnControls(document.querySelector('#allyRailFixture')!, {
        onSkipTurn: noop, onEndTurn: noop, onNextGroup: noop, onNextActivation: noop,
        onCompleteActivation: noop, onProceedToNext: noop, onSkipGroup: noop
      });
      runtime.allyControls = controls;
      const activation = { unitId: 'autonomous-ally', ownerId: 'bot' as const, faction: 'Ally' as const,
        initiative: 5, isActivated: false, sortOrder: 0 };
      controls.updatePhase('initiativeTurn');
      controls.updatePlayerTurn(false);
      controls.updateCurrentUnit(activation);
      controls.updateCurrentGroup({ initiative: 5, units: [activation], currentUnitIndex: 0, isCompleted: false });
    });
    try {
      const rail = page.locator('#allyRailFixture');
      await expect(rail.locator('.initiative-status__value')).toHaveText('Allied group');
      await expect(rail.locator('.initiative-status__detail')).toHaveText('Allied orders resolving');
      await expect(rail).not.toContainText('Enemy');
      for (const button of await rail.locator('button').all()) await expect(button).toBeDisabled();
      const textBounds = await rail.locator('[data-initiative-status]').evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return { width: element.clientWidth, scrollWidth: element.scrollWidth,
          fragments: Array.from(range.getClientRects()).map(rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })) };
      });
      expect(textBounds.scrollWidth).toBeLessThanOrEqual(textBounds.width + 1);
      for (const rect of textBounds.fragments) {
        expect(rect.left).toBeGreaterThanOrEqual(0);
        expect(rect.right).toBeLessThanOrEqual(width);
        expect(rect.top).toBeGreaterThanOrEqual(0);
        expect(rect.bottom).toBeLessThanOrEqual(900);
      }
      await page.screenshot({ path: info.outputPath('allied-initiative-rail.png') });
      // A following enemy activation must restore enemy presentation, not inherit an Ally label.
      await page.evaluate(() => {
        const controls = (window as unknown as RailWindow).allyControls;
        const enemy = { unitId: 'enemy', ownerId: 'bot' as const, faction: 'Bot' as const,
          initiative: 5, isActivated: false, sortOrder: 1 };
        controls.updateCurrentUnit(enemy);
        controls.updateCurrentGroup({ initiative: 5, units: [enemy], currentUnitIndex: 0, isCompleted: false });
      });
      await expect(rail.locator('.initiative-status__value')).toHaveText('Enemy group');
      await expect(rail.locator('.initiative-status__detail')).toHaveText('Enemy orders resolving');
    } finally {
      await page.evaluate(() => (window as unknown as RailWindow).allyControls.dispose());
    }
  });
}
