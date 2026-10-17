/** Local presentation integration: shipped objective card, canonical Citadel status and real SVG markers.
 * Supplied hex geometry is a component fixture, not a full mission or live playthrough certificate.
 */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import type { BattleScreen } from '../../src/ui/screens/BattleScreen';
import type { HexMapRenderer } from '../../src/rendering/HexMapRenderer';
import type { CoordinateSystem } from '../../src/rendering/CoordinateSystem';
import type { ScenarioData } from '../../src/core/types';
import type { MissionRulesController, MissionStatus } from '../../src/state/missionRules';
import type { TurnFaction } from '../../src/game/GameEngine';
import type { RawScenarioInput } from '../../src/data/scenarioNormalizer';

const source = new JSDOM(readFileSync(resolve('index.html'), 'utf8')).window.document;
const card = source.querySelector('#battleCycleObjective');
const announcements = source.querySelector('#battleAnnouncements');
if (!card || !announcements) throw new Error('Shipped objective card or announcement region is missing.');
const styles = Array.from(source.querySelectorAll('style')).map(style => style.outerHTML).join('\n');
// Only the fixture container and supplied SVG viewport are sized here; shipped card/marker styles are untouched.
const html = `<!doctype html><html><head><meta charset="utf-8">${styles}</head>
  <body style="margin:0;padding:0"><main id="battleScreen" style="width:calc(100vw - 32px);max-width:680px;margin:16px auto">
  ${card.outerHTML}${announcements.outerHTML}
  <svg id="citadelMarkerFixture" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 420"
    style="display:block;width:100%;aspect-ratio:1;background:#17221b;margin-top:16px"></svg>
  </main></body></html>`;
const component = buildSync({
  stdin: { contents: `export {BattleScreen} from './src/ui/screens/BattleScreen';
    export {HexMapRenderer} from './src/rendering/HexMapRenderer';
    export {CoordinateSystem} from './src/rendering/CoordinateSystem';
    export {createMissionRulesController} from './src/state/missionRules';
    export {normalizeScenarioSource} from './src/data/scenarioNormalizer';
    export {default as scenario} from './src/data/scenario_citadel_ridge.json';`,
    resolveDir: resolve('.'), loader: 'ts' },
  bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'citadelFixture',
  // Source bundles have no Vite asset manifest. This marker-only fixture never requests sprite assets.
  define: { 'import.meta.url': JSON.stringify('http://citadel.fixture/src/rendering/HexMapRenderer.ts'), 'import.meta.glob': 'undefined' }
}).outputFiles[0].text;

/** Test-only access to existing presentation methods; no production hook or controller is added. */
interface ObjectiveScreenProbe {
  element: HTMLElement;
  scenario: ScenarioData;
  currentObjectiveIndex: number;
  missionStatus: MissionStatus;
  hexMapRenderer: HexMapRenderer;
  cacheElements(): void;
  renderMissionStatus(): void;
  updateObjectiveMarkers(): void;
}

/** Browser-local fixture state; the controller remains the sole phase/marker authority. */
interface CitadelWindow extends Window {
  citadelFixture: {
    BattleScreen: typeof BattleScreen;
    HexMapRenderer: typeof HexMapRenderer;
    CoordinateSystem: typeof CoordinateSystem;
    createMissionRulesController: typeof import('../../src/state/missionRules')['createMissionRulesController'];
    normalizeScenarioSource: typeof import('../../src/data/scenarioNormalizer')['normalizeScenarioSource'];
    scenario: RawScenarioInput;
  };
  citadelController: MissionRulesController;
  citadelScreen: ObjectiveScreenProbe;
  citadelScenarioBefore: string;
  citadelClicks: string[];
}

const points = [
  { hex: { q: 16, r: -4 }, key: '16,4', label: 'North Battery', x: 90, y: 70 },
  { hex: { q: 16, r: 0 }, key: '16,8', label: 'Central Citadel', x: 90, y: 210 },
  { hex: { q: 16, r: 4 }, key: '16,12', label: 'South Battery', x: 90, y: 350 },
  { hex: { q: 20, r: -2 }, key: '20,8', label: 'Command Ridge', x: 330, y: 210 }
] as const;

async function mount(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => route.request().url() === 'http://citadel.fixture/'
    ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
  await page.goto('http://citadel.fixture/');
  await page.addScriptTag({ content: component });
  await page.evaluate(() => {
    const runtime = window as unknown as CitadelWindow;
    const api = runtime.citadelFixture;
    const scenario = api.normalizeScenarioSource(api.scenario, { turnLimit: 17 });
    runtime.citadelScenarioBefore = JSON.stringify(scenario);
    runtime.citadelController = api.createMissionRulesController('assault_citadel_ridge', scenario);
    const renderer = new api.HexMapRenderer();
    const svg = document.querySelector<SVGSVGElement>('#citadelMarkerFixture')!;
    const viewportRoot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(viewportRoot);
    const cells = new Map<string, SVGGElement>();
    runtime.citadelClicks = [];
    scenario.objectives.forEach(({ hex }) => {
      const offset = api.CoordinateSystem.axialToOffset(hex.q, hex.r);
      const key = api.CoordinateSystem.makeHexKey(offset.col, offset.row);
      const x = 90 + (offset.col - 16) * 60;
      const y = 70 + (offset.row - 4) * 35;
      const cell = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      cell.dataset.hex = key; cell.dataset.cx = String(x); cell.dataset.cy = String(y);
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', api.CoordinateSystem.hexPoints(x, y));
      polygon.setAttribute('fill', '#52633c'); polygon.setAttribute('stroke', '#d5cda4');
      cell.appendChild(polygon);
      cell.addEventListener('click', () => runtime.citadelClicks.push(key));
      viewportRoot.appendChild(cell); cells.set(key, cell);
    });
    // Real marker painting and clearing are retained; only map-layout geometry is supplied.
    Object.assign(renderer, { svgElement: svg, viewportRoot, hexElementMap: cells });
    // Prototype access avoids starting an unrelated battle session or installing global game listeners.
    const screen = Object.create(api.BattleScreen.prototype) as ObjectiveScreenProbe;
    Object.assign(screen, {
      element: document.querySelector('#battleScreen'), scenario, currentObjectiveIndex: 0,
      missionStatus: runtime.citadelController.getStatus(), hexMapRenderer: renderer,
      battleState: {
        getPrecombatMissionInfo: () => null,
        hasEngine: () => true,
        ensureGameEngine: () => { throw new Error('Explicit Citadel markers must not fall through to independent occupancy rendering.'); }
      }
    });
    runtime.citadelScreen = screen;
    screen.cacheElements(); screen.renderMissionStatus(); screen.updateObjectiveMarkers();
  });
  await page.evaluate(async () => { await document.fonts.ready; });
}

async function applySnapshot(page: Page, owners: Array<TurnFaction | null>, turn: number): Promise<MissionStatus> {
  return page.evaluate(({ owners, turn }) => {
    const runtime = window as unknown as CitadelWindow;
    const { scenario } = runtime.citadelScreen;
    const occupancy = new Map<string, TurnFaction>();
    scenario.objectives.forEach(({ hex }, index) => {
      const owner = owners[index];
      if (owner) occupancy.set(`${hex.q},${hex.r}`, owner);
    });
    const status = runtime.citadelController.onTurnAdvanced({
      // Authored player units are requisitioned later. Keep a fixture detachment alive so
      // the presentation snapshots do not accidentally exercise the elimination outcome.
      scenario, occupancy,
      playerUnits: [{ type: 'Infantry_42', hex: { q: 0, r: 0 }, strength: 100, experience: 0,
        ammo: 6, fuel: 0, entrench: 0, facing: 'E' }],
      botUnits: scenario.sides.Bot.units,
      turnSummary: { turnNumber: turn, activeFaction: 'Player', phase: 'playerTurn' }
    });
    runtime.citadelScreen.missionStatus = status;
    runtime.citadelScreen.renderMissionStatus(); runtime.citadelScreen.updateObjectiveMarkers();
    return status;
  }, { owners, turn });
}

/** Observe real finite entrances without cancelling animations or waiting for decorative infinite pulses. */
async function settleMarkerEntrances(page: Page): Promise<void> {
  await page.locator('.objective-marker').evaluateAll(async markers => {
    const entrances = markers.flatMap(marker => marker.getAnimations({ subtree: true }))
      .filter(animation => animation.effect && Number.isFinite(animation.effect.getTiming().iterations));
    await Promise.all(entrances.map(animation => animation.finished));
  });
  await expect(page.locator('.objective-marker')).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    const marker = page.locator('.objective-marker').nth(index);
    await expect(marker).toBeVisible();
    await expect(marker).toHaveCSS('opacity', '1');
  }
}

async function assertPresentation(page: Page, owners: Array<TurnFaction | null>): Promise<void> {
  await settleMarkerEntrances(page);
  await expect(page.locator('.objective-marker')).toHaveCount(4);
  await expect(page.locator('#battleObjectiveProgress')).toBeHidden();
  for (const [index, point] of points.entries()) {
    const friendly = owners[index] === 'Player' || owners[index] === 'Ally';
    const enemy = owners[index] === 'Bot';
    const expected = friendly
      ? { kind: 'secured', color: 'rgb(34, 197, 94)', label: 'Secured', tooltip: 'Friendly-held' }
      : enemy ? { kind: 'enemy', color: 'rgb(239, 68, 68)', label: 'Enemy Held', tooltip: 'Enemy-held' }
        : { kind: 'neutral', color: 'rgb(245, 196, 109)', label: 'In Progress', tooltip: 'Unoccupied' };
    const marker = page.locator('.objective-marker').nth(index);
    await expect(marker).toBeVisible();
    await expect(marker).toHaveClass(`objective-marker objective-marker--${expected.kind}`);
    await expect(marker).toHaveAttribute('pointer-events', 'none');
    await expect(marker.locator('title')).toHaveText(`${point.label} - ${expected.tooltip}.`);
    const ring = marker.locator('circle').nth(1);
    await expect(ring).toHaveAttribute('cx', String(point.x));
    await expect(ring).toHaveAttribute('cy', String(point.y - 6));
    await expect(ring).toHaveCSS('stroke', expected.color);
    await expect(ring).toHaveCSS('opacity', '0.7');
    await expect(marker.locator('circle').nth(2)).toHaveCSS('fill', expected.color);
    const ringBox = await ring.boundingBox();
    expect(ringBox).not.toBeNull();
    if (!ringBox) throw new Error('Objective ring has no painted bounds.');
    expect(ringBox.width).toBeGreaterThan(0);
    expect(ringBox.x).toBeGreaterThanOrEqual(0);
    expect(ringBox.y).toBeGreaterThanOrEqual(0);
    expect(ringBox.x + ringBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(ringBox.y + ringBox.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await page.mouse.click(ringBox.x + ringBox.width / 2, ringBox.y + ringBox.height / 2);
    expect(await page.evaluate(() => {
      const clicks = (window as unknown as CitadelWindow).citadelClicks;
      return clicks[clicks.length - 1];
    })).toBe(point.key);
    await page.evaluate(index => {
      const screen = (window as unknown as CitadelWindow).citadelScreen;
      screen.currentObjectiveIndex = index; screen.renderMissionStatus();
    }, index);
    await expect(page.locator('#battleObjectiveIndex')).toHaveText(`Tactical Objective ${index + 1} of 4`);
    await expect(page.locator('#battleObjectiveTitle')).toHaveText(`Secure Engagement Point ${index + 1}`);
    await expect(page.locator('#battleObjectiveStatus')).toHaveText(expected.label);
    await expect(page.locator('#battleCycleObjective')).toHaveAttribute('aria-label', `Secure Engagement Point ${index + 1}. Status: ${expected.label}. Focus this objective on the map.`);
    expect(await page.locator('#battleCycleObjective').evaluate(element => {
      const card = element.getBoundingClientRect();
      return [...element.querySelectorAll('#battleObjectiveIndex, #battleObjectiveTitle, #battleObjectiveStatus')].every(child => {
        const box = child.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.left >= card.left && box.right <= card.right
          && box.top >= card.top && box.bottom <= card.bottom && child.scrollWidth <= child.clientWidth + 1;
      }) && card.left >= 0 && card.right <= innerWidth && card.top >= 0 && card.bottom <= innerHeight;
    }), 'Every objective label fits its real compact card and the viewport').toBe(true);
  }
}

async function evidence(page: Page, info: TestInfo, name: string, selectedIndex: number): Promise<void> {
  await page.evaluate(index => {
    const screen = (window as unknown as CitadelWindow).citadelScreen;
    screen.currentObjectiveIndex = index; screen.renderMissionStatus();
  }, selectedIndex);
  // Repeated painting creates fresh marker groups and restarts their shipped fade-in.
  // Record the completed visible presentation, not a transparent entrance frame.
  await settleMarkerEntrances(page);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, scale: 'css' });
  await info.attach(name, { path, contentType: 'image/png' });
  await info.attach(`${name}-status`, { contentType: 'application/json', body: JSON.stringify(await page.evaluate(() => {
    const runtime = window as unknown as CitadelWindow;
    return { viewport: { width: innerWidth, height: innerHeight }, status: runtime.citadelScreen.missionStatus,
      markers: [...document.querySelectorAll('.objective-marker')].map(marker => marker.outerHTML),
      markerOpacity: [...document.querySelectorAll('.objective-marker')].map(marker => getComputedStyle(marker).opacity) };
  }), null, 2) });
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`Citadel objective card and markers share canonical control at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await mount(page);
    expect(await page.evaluate(() => (window as unknown as CitadelWindow).citadelScreen.scenario.objectives.map(({ hex }) => hex))).toEqual(points.map(point => point.hex));
    const initial = await applySnapshot(page, ['Bot', 'Bot', null, 'Bot'], 1);
    expect(initial.phase?.id).toBe('phase1_probe');
    expect(initial.markers?.map(marker => marker.hex)).toEqual(points.map(point => point.hex));
    await assertPresentation(page, ['Bot', 'Bot', null, 'Bot']);
    await evidence(page, info, 'citadel-approach', 3);
    const mixed = await applySnapshot(page, ['Player', 'Ally', null, 'Bot'], 7);
    expect(mixed.phase?.id).toBe('phase3_escalation');
    expect(mixed.outcome.state).toBe('inProgress');
    await assertPresentation(page, ['Player', 'Ally', null, 'Bot']);
    const repaint = await page.evaluate(() => {
      const runtime = window as unknown as CitadelWindow;
      const before = JSON.stringify(runtime.citadelController.serializeState());
      const statusBefore = JSON.stringify(runtime.citadelScreen.missionStatus);
      for (let i = 0; i < 3; i += 1) {
        runtime.citadelScreen.renderMissionStatus(); runtime.citadelScreen.updateObjectiveMarkers();
      }
      return { before, after: JSON.stringify(runtime.citadelController.serializeState()), statusBefore,
        statusAfter: JSON.stringify(runtime.citadelScreen.missionStatus), scenarioBefore: runtime.citadelScenarioBefore,
        scenarioAfter: JSON.stringify(runtime.citadelScreen.scenario), count: document.querySelectorAll('.objective-marker').length };
    });
    expect(repaint.after).toBe(repaint.before);
    expect(repaint.statusAfter).toBe(repaint.statusBefore);
    expect(repaint.scenarioAfter).toBe(repaint.scenarioBefore);
    expect(repaint.count).toBe(4);
    await evidence(page, info, 'citadel-mixed-control', 0);
    const vacated = await applySnapshot(page, ['Bot', null, null, 'Bot'], 7);
    expect(vacated.phase?.id).toBe('phase2_commitment');
    await assertPresentation(page, ['Bot', null, null, 'Bot']);
    await evidence(page, info, 'citadel-vacated', 1);
    expect(errors).toEqual([]);
  });
}
