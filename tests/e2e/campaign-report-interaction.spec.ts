/** Local native-key/geometry proof with shipped CSS and real Shell, managed UI state and picker. */
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import type { CampaignCommandScreen } from '../../src/ui/campaign/CampaignCommandScreen';
import type { CampaignCommandShellView } from '../../src/ui/campaign/CampaignCommandShell';
import type { CampaignCheckpointPicker } from '../../src/ui/components/CampaignCheckpointPicker';
import type { EnhancedInitiativeTurnControls } from '../../src/ui/components/EnhancedInitiativeTurnControls';

const baseline = process.env.FSG_REPORT_BASELINE === '1';
const source = new JSDOM(readFileSync(baseline ? 'diagnostics/fsg-cam-015/baseline/index.html' : 'index.html', 'utf8')).window.document;
const campaignCss = readFileSync(baseline ? 'diagnostics/fsg-cam-015/baseline/campaign-command.css' : 'src/ui/campaign/styles/campaign-command.css', 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8">${Array.from(source.querySelectorAll('style')).map(s => s.outerHTML).join('\n')}<style>${campaignCss}</style></head><body><div id="app">${source.querySelector('#campaignScreen')!.outerHTML}<section id="battleScreen" class="hidden" aria-hidden="true"><div id="report-test-initiative"></div></section></div></body></html>`;
const bundle = build({ stdin: { contents: `export { CampaignCommandScreen } from './src/ui/campaign/CampaignCommandScreen';
export { CampaignCheckpointPicker } from './src/ui/components/CampaignCheckpointPicker';
export { EnhancedInitiativeTurnControls } from './src/ui/components/EnhancedInitiativeTurnControls';`, resolveDir: resolve('.'), loader: 'ts' },
  bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'reportComponents',
  define: { 'import.meta.url': JSON.stringify('http://local.test/src/main.ts'), 'import.meta.glob': 'undefined' },
  plugins: baseline ? [{ name: 'recorded-pre-repair-source', setup(builder) {
    builder.onLoad({ filter: /(?:CampaignCommandShell|EnhancedInitiativeTurnControls)\.ts$/ }, args => ({
      contents: readFileSync(resolve('diagnostics/fsg-cam-015/baseline', basename(args.path)), 'utf8'), loader: 'ts', resolveDir: resolve(args.path, '..')
    }));
  } }] : []
});
interface ReportWindow extends Window {
  reportComponents: { CampaignCommandScreen: typeof CampaignCommandScreen; CampaignCheckpointPicker: typeof CampaignCheckpointPicker; EnhancedInitiativeTurnControls: typeof EnhancedInitiativeTurnControls };
  reportScreen: CampaignCommandScreen;
  reportView: CampaignCommandShellView;
  reportPicker: CampaignCheckpointPicker | null;
  reportEvents: string[];
}
async function mount(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => route.abort());
  await page.setContent(html);
  await page.addScriptTag({ content: (await bundle).outputFiles![0].text });
  await page.evaluate(() => {
    const w = window as unknown as ReportWindow;
    const root = document.getElementById('campaignScreen')!;
    root.classList.remove('hidden'); root.setAttribute('aria-hidden', 'false');
    w.reportEvents = []; w.reportPicker = null;
    w.reportView = {
      theaterTitle: 'Operation Overlord — Normandy Campaign', campaignPhase: 'Normandy Expansion', timeLabel: 'D+1 · 7 June 1944, 09:00–12:00',
      commandStatus: 'Planning', saveStatus: 'Saved', unreadReports: 1, resources: [], objectives: [], forces: [], orders: [],
      airPower: 0, navalPower: 0, intelligenceCapacity: '0/0',
      advance: { mode: 'segment', enabled: true, pauseAfterEveryResolution: false, summary: 'Review the post-battle report.', alerts: [], timeline: [] },
      afterActionReports: [0, 1, 2].map(index => ({
        id: `report-${index}`, title: `After action: Omaha-Gold Sector ${index + 1}`, timeLabel: 'D+1 · 7 June 1944, 03:00–06:00',
        result: 'victory', resultLabel: 'Victory', acknowledged: index !== 0, location: 'Omaha-Gold Sector · Grid 24,24', locationHexKey: '24,24',
        summary: 'The battle area is now under friendly control. Review returned formations and required recovery before the next engagement.',
        checkpointStatus: 'Post-battle recovery checkpoint saved.', personnelLosses: '118', opponentLosses: '232', resourcesSpent: '110 supply · 87 fuel · 6 ammo', scoreChange: '0 · no change',
        operationalEffects: ['Control: Bot → Player', 'Western Naval Force: 2 fire missions fired; no tactical charges unused.'],
        tacticalObjectives: ['Secure the engagement area: completed', 'Break the opposing ground force: in progress'],
        formations: Array.from({ length: 11 }, (_, n) => ({ id: `formation-${n}`, name: n === 0 ? '5th Engineer Special Brigade' : `Infantry formation ${n}`,
          commandLabel: n < 2 ? 'V Corps Engineer Special Brigades' : '1st Infantry Division', personnel: '150 / 160 personnel · −10',
          condition: 'Readiness 100 → 0 · Cohesion 100 → 100', disposition: 'Returned to its exact campaign source.', materiallyChanged: n === 0 || (n >= 2 && n < 7) })),
        objectiveChanges: ['No campaign objective changed in this battle.'],
        decisions: [{ id: 'recover', severity: 'critical', targetKind: 'formation', targetId: 'formation-0', title: 'Recover 5th Engineer Special Brigade',
          detail: 'This formation is shattered and cannot be treated as a ready combat formation. Review its recovery needs before issuing another combat order.' }]
      }))
    };
    w.reportScreen = new w.reportComponents.CampaignCommandScreen(root, {
      onAcknowledgeAfterActionReport(id) {
        w.reportEvents.push(`ack:${id}`);
        w.reportView = { ...w.reportView, afterActionReports: w.reportView.afterActionReports!.map(report => ({ ...report, acknowledged: report.id === id || report.acknowledged })) };
        w.reportScreen.render(w.reportView);
      },
      onAfterActionTargetSelected(kind, id) { w.reportEvents.push(`route:${kind}:${id}`); w.reportScreen.navigate({ kind, id, focus: true }); }
    }, { v2Enabled: true });
    w.reportScreen.initialize(); w.reportScreen.showWorkspace('situation', true); w.reportScreen.render(w.reportView);
    document.getElementById('campaignLoad')!.addEventListener('click', () => {
      w.reportPicker = new w.reportComponents.CampaignCheckpointPicker(Array.from({ length: 9 }, (_, n) => ({
        slotId: n === 0 ? 'primary' : `post-battle-${n}`, label: n === 0 ? 'Primary campaign' : `Post-battle recovery — Omaha-Gold Sector ${n}`,
        detail: 'Operation Overlord — Normandy Campaign · D+1 · 7 June 1944, 03:00–06:00 · Saved checkpoint'
      })));
      void w.reportPicker.choose(document.getElementById('campaignLoad')).then(id => w.reportEvents.push(`load:${id}`));
    });
    const controls = new w.reportComponents.EnhancedInitiativeTurnControls(document.getElementById('report-test-initiative')!, {
      onSkipTurn() {}, onEndTurn() {}, onNextGroup() {}, onNextActivation() { w.reportEvents.push('hidden-battle-selection'); },
      onCompleteActivation() {}, onProceedToNext() {}, onSkipGroup() {}
    });
    controls.updatePhase('initiativeTurn'); controls.updatePlayerTurn(true);
    controls.updateCurrentUnit({ unitId: 'still-mounted', ownerId: 'player', initiative: 5, isActivated: false, sortOrder: 0 });
  });
}
async function readable(locator: Locator, page: Page) {
  const box = await locator.boundingBox(); expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1); expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  expect(await locator.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await locator.evaluate(el => {
    const rect = el.getBoundingClientRect();
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent); const frame = parent.getBoundingClientRect();
      if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowY)
        && (rect.top < frame.top + parent.clientTop - 1 || rect.bottom > frame.top + parent.clientTop + parent.clientHeight + 1)) return false;
      if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX)
        && (rect.left < frame.left + parent.clientLeft - 1 || rect.right > frame.left + parent.clientLeft + parent.clientWidth + 1)) return false;
    }
    return true;
  }), 'The entire control/text fits every clipping ancestor').toBe(true);
  expect(await locator.evaluate(el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return hit === el || el.contains(hit); })).toBe(true);
}
async function evidence(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(`${name}.png`), scale: 'css' });
  const data = await page.evaluate(() => ({ viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    focus: document.activeElement?.outerHTML, events: (window as unknown as ReportWindow).reportEvents,
    geometry: Array.from(document.querySelectorAll('#campaignAfterActionPanel, .campaign-aar-card, #campaignAarDetail, #campaignCheckpointPicker, .tactical-save-center__surface, .tactical-save-center__body, .tactical-save-center__footer')).map(el => ({
      element: el.id || el.className, rect: el.getBoundingClientRect().toJSON(), scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
      scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, font: getComputedStyle(el).font,
      layout: { gridColumns: getComputedStyle(el).gridTemplateColumns, gridRows: getComputedStyle(el).gridTemplateRows,
        width: getComputedStyle(el).width, maxWidth: getComputedStyle(el).maxWidth, minWidth: getComputedStyle(el).minWidth,
        padding: getComputedStyle(el).padding, overflow: getComputedStyle(el).overflow }
    })) }));
  writeFileSync(info.outputPath(`${name}.json`), JSON.stringify({ source: baseline ? 'pre-repair' : 'working-tree', ...data }, null, 2));
}
for (const viewport of [{ width: 640, height: 360 }, { width: 753, height: 356 }, { width: 800, height: 900 },
  { width: 1280, height: 720 }, { width: 1506, height: 768 }, { width: 1920, height: 1080 }]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, deviceScaleFactor: viewport.width === 753 ? 2.5 : 1 });
    test('FSG_CAM_095 populated AAR native traversal refresh acknowledgement and return', async ({ page }, info) => {
      await mount(page);
      const panel = page.locator('#campaignAfterActionPanel');
      const close = panel.locator('.campaign-aar-card__header [data-close-campaign-aar]');
      await evidence(page, info, 'aar-open');
      await expect(close).toBeFocused(); await readable(close, page);
      await page.keyboard.press('Escape');
      await page.getByRole('tab', { name: 'Situation', exact: true }).click();
      await page.getByRole('button', { name: /Battle reports.*archived/ }).click();
      await expect(close).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(panel.locator('[data-aar-report-id="report-0"]')).toBeFocused();
      await readable(panel.locator('[data-aar-report-id="report-0"] strong'), page);
      await page.keyboard.press('Enter');
      await expect(panel.locator('[data-aar-report-id="report-0"]')).toBeFocused();
      await page.evaluate(() => { const w = window as unknown as ReportWindow; w.reportScreen.render(w.reportView); });
      await expect(panel.locator('[data-aar-report-id="report-0"]')).toBeFocused();
      const disclosures = panel.locator('details > summary');
      await expect(disclosures).toHaveCount(2);
      for (let n = 0; n < 12 && !await disclosures.first().evaluate(el => el === document.activeElement); n++) await page.keyboard.press('Tab');
      await expect(disclosures.first()).toBeFocused();
      await readable(disclosures.first(), page);
      await page.keyboard.press('Tab'); await expect(disclosures.nth(1)).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(disclosures.nth(1).locator('..')).toHaveAttribute('open', '');
      await readable(disclosures.nth(1), page);
      // Offscreen rows remain vertically scrollable; their exact names and statistics must reflow within the pane.
      const formationText = panel.locator('.campaign-aar-formations article :is(strong, span):visible');
      expect(await formationText.count()).toBeGreaterThan(0);
      expect(await formationText.evaluateAll(elements => elements.filter(el => {
        const rect = el.getBoundingClientRect();
        const detail = el.closest('#campaignAarDetail')!;
        const frame = detail.getBoundingClientRect();
        return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
          || rect.left < frame.left + detail.clientLeft - 1
          || rect.right > frame.left + detail.clientLeft + detail.clientWidth + 1;
      }).map(el => el.textContent)), 'Formation names and exact statistics fit without horizontal scrolling or clipped text').toEqual([]);
      const decision = panel.locator('[data-aar-target-kind]');
      await page.keyboard.press('Tab'); await expect(decision).toBeFocused();
      await readable(decision, page); await readable(decision.locator('strong'), page);
      for (const text of await decision.locator('span').all()) await readable(text, page);
      const acknowledge = panel.locator('[data-acknowledge-aar]');
      for (let n = 0; n < 20 && !await acknowledge.evaluate(el => el === document.activeElement); n++) await page.keyboard.press('Tab');
      await expect(acknowledge).toBeFocused(); await readable(acknowledge, page);
      await evidence(page, info, 'aar-final-action');
      await page.keyboard.press('Enter');
      const continuation = panel.locator('[data-continue-campaign-aar]');
      await expect(continuation).toBeFocused(); await readable(continuation, page);
      await expect(disclosures.nth(1).locator('..')).toHaveAttribute('open', '');
      await page.keyboard.press('Tab'); await expect(close).toBeFocused();
      await page.keyboard.press('Shift+Tab'); await expect(continuation).toBeFocused();
      await page.keyboard.press('2'); await expect(continuation).toBeFocused();
      await page.keyboard.press('Escape'); await expect(panel).toBeHidden();
      await expect(page.getByRole('button', { name: /Battle reports.*archived/ })).toBeFocused();
      await page.keyboard.press('Tab');
      // A real pointer click on noninteractive heading text leaves body focus, as observed after battle.
      await page.locator('#campaignCommandTitle').click();
      await expect(page.locator('body')).toBeFocused();
      await page.keyboard.press('Tab'); await expect(page.locator('body')).not.toBeFocused();
      expect(await page.evaluate(() => (window as unknown as ReportWindow).reportEvents)).toEqual(['ack:report-0']);
      await evidence(page, info, 'aar-return');
    });
    test('FSG_CAM_092 populated checkpoint picker fits and loads only exact keyboard selection', async ({ page }, info) => {
      await mount(page); await page.keyboard.press('Escape');
      const load = page.locator('#campaignLoad'); await load.click();
      const picker = page.locator('#campaignCheckpointPicker');
      await expect(picker.getByRole('option').first()).toBeFocused();
      await expect(picker.locator('[data-campaign-checkpoint-load]')).toBeDisabled();
      await readable(picker.locator('.tactical-save-center__header'), page);
      await evidence(page, info, 'picker-open');
      await page.keyboard.press('End');
      const last = picker.getByRole('option').last(); await expect(last).toBeFocused(); await readable(last, page);
      await readable(last.locator('strong'), page); await readable(last.locator('small'), page);
      await readable(picker.locator('.tactical-save-center__header'), page);
      await page.keyboard.press('Tab'); const confirm = picker.locator('[data-campaign-checkpoint-load]');
      await expect(confirm).toBeFocused(); await readable(confirm, page);
      await readable(picker.locator('.tactical-save-center__header'), page);
      await readable(picker.locator('[data-campaign-checkpoint-cancel]').first(), page);
      await evidence(page, info, 'picker-final-selection');
      await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
      await expect(picker.locator('[data-campaign-checkpoint-cancel]').first()).toBeFocused();
      await page.keyboard.press('Shift+Tab'); await expect(picker.locator('[data-campaign-checkpoint-cancel]').last()).toBeFocused();
      await page.keyboard.press('Escape'); await expect(picker).toHaveCount(0); await expect(load).toBeFocused();
      await page.keyboard.press('Enter'); await page.keyboard.press('End'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
      await expect(picker).toHaveCount(0); await expect(load).toBeFocused();
      expect(await page.evaluate(() => (window as unknown as ReportWindow).reportEvents)).toEqual(['load:null', 'load:post-battle-8']);
      await evidence(page, info, 'picker-return');
    });
  });
}
