/** Local CSS contract using shipped battle markup and the real initiative-control component; no game state. */
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import type { EnhancedInitiativeTurnControls } from '../../src/ui/components/EnhancedInitiativeTurnControls';
import type { SelectionIntelOverlay } from '../../src/ui/announcements/SelectionIntelOverlay';
import type { BattleActivityLog } from '../../src/ui/announcements/BattleActivityLog';
import type { BattleSelectionIntel } from '../../src/ui/announcements/AnnouncementTypes';

const baselineRef = process.env.FSG_TACTICAL_GEOMETRY_BASELINE;
const readSource = (path: string): string => baselineRef
  ? execFileSync('git', ['show', `${baselineRef}:${path}`], { encoding: 'utf8' })
  : readFileSync(resolve(path), 'utf8');
const source = new JSDOM(readSource('index.html')).window.document;
const battle = source.querySelector('#battleScreen');
if (!battle) throw new Error('Shipped battle screen markup is missing.');
const fixtureHtml = `<!doctype html><html><head><meta charset="utf-8">${Array.from(source.querySelectorAll('style')).map(style => style.outerHTML).join('\n')}</head><body><div id="app">${battle.outerHTML}</div></body></html>`;
const component = buildSync({
  stdin: { contents: readSource('src/ui/components/EnhancedInitiativeTurnControls.ts'), loader: 'ts', resolveDir: resolve('src/ui/components') },
  bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'initiativeFixture'
}).outputFiles[0].text;
const intelComponent = buildSync({
  stdin: { contents: readSource('src/ui/announcements/SelectionIntelOverlay.ts'), loader: 'ts', resolveDir: resolve('src/ui/announcements') },
  bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'intelFixture'
}).outputFiles[0].text;
const logComponent = buildSync({
  stdin: { contents: readSource('src/ui/announcements/BattleActivityLog.ts'), loader: 'ts', resolveDir: resolve('src/ui/announcements') },
  bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'logFixture'
}).outputFiles[0].text;
const defenderTitle = '8th (Midlands) Infantry Division — 2nd Battalion';
const objectiveProgress = 'Secured 0/4 · Friendly control 4/4. Move a friendly formation onto each point and retain control.';

// Supplied presentation data reproduces the selected engineer's seven stats and long order descriptions.
const selectedIntel: BattleSelectionIntel = {
  kind: 'battle', hexKey: '0,12', terrainName: 'Forest', unitLabel: '6th Engineer Special Brigade',
  unitStrength: 100, unitAmmo: 6, unitFuel: null, unitEntrenchment: 0, canEntrench: true,
  movementRemaining: 4, movementMax: 4, rangeLabel: '1-4', facingLabel: 'NW',
  moveOptions: 0, attackOptions: 0, unitTabs: [], statusMessage: '',
  statusChips: [{ label: 'Engineer', tone: 'neutral' }], detailSections: [], notes: [],
  actionCards: [
    { id: 'naval', label: 'Call Western Naval Force naval gunfire', available: false, tone: 'denial',
      detail: 'No observed enemy hex is close enough to adjust Western Naval Force naval gunfire.' },
    { id: 'sentry', label: 'Sentry', available: true, tone: 'defense',
      detail: 'Hold in place on alert. If attacked before the next activation and legal return fire exists, both sides fire simultaneously.' },
    { id: 'dig-in', label: 'Dig In', available: false, tone: 'defense', detail: 'Only infantry formations can dig in.' },
    { id: 'facing', label: 'Set Facing', available: true, tone: 'defense',
      detail: 'Orient the formation toward a chosen hex edge. Facing affects defensive bonuses and retaliation arcs. Cannot reorient after firing.' },
    { id: 'fortify', label: 'Fortify', available: true, tone: 'defense',
      detail: 'Build directional defensive works along a chosen hex edge. The engineer must start fresh, and the five-minute build effort consumes the rest of the turn.' },
    { id: 'traps', label: 'Lay Tank Traps', available: true, tone: 'denial',
      detail: 'Emplace anti-vehicle obstacles along a chosen hex edge. The engineer must start fresh, and the edge work consumes the rest of the turn.' },
    { id: 'clear-path', label: 'Clear Path', available: true, tone: 'mobility',
      detail: 'Cut or widen an internal lane through the hex, improving it up to level 3 until movement approaches road quality. The engineer must start fresh, and each pass consumes the rest of the turn.' }
  ]
};

interface FixtureWindow extends Window {
  initiativeFixture: { EnhancedInitiativeTurnControls: typeof EnhancedInitiativeTurnControls };
  intelFixture: { SelectionIntelOverlay: typeof SelectionIntelOverlay };
  logFixture: { BattleActivityLog: typeof BattleActivityLog };
  tacticalGeometryLog: BattleActivityLog;
  tacticalGeometryControls: EnhancedInitiativeTurnControls;
  tacticalGeometryIntel: SelectionIntelOverlay;
  tacticalGeometryActions: string[];
}

async function settleIntel(page: Page): Promise<void> {
  // Actual log toggling animates the outer grid; measure the settled layout, not an intermediate track width.
  await page.locator('.battle-main').evaluate(async element => {
    await Promise.all(element.getAnimations().map(animation => animation.finished));
  });
  // Include the real overlay's scheduled position clamp before measuring its visible content.
  await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

async function saveIntelEvidence(page: Page, info: TestInfo, name: string): Promise<void> {
  const selectors = ['.battle-map-pane', '.battle-map-header', '.map-viewport', '#battleIntelOverlay',
    '#battleIntelOverlayBody', '#battleIntelOverlayTitle', '#battleIntelOverlayMeta', '#battleIntelOverlayToggle', '#battleIntelOverlayDismiss',
    '.battle-intel-overlay__stats', '[data-selection-action="clear-path"]', '.group-advance-btn'];
  const geometry = Object.fromEntries(await Promise.all(selectors.map(async selector => {
    const locator = page.locator(`#battleScreen ${selector}`);
    return [selector, { ...await bounds(locator), ...await locator.evaluate(element => ({
      scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
      overflowY: getComputedStyle(element).overflowY, font: getComputedStyle(element).font
    })) }];
  })));
  const path = info.outputPath(`${name}-geometry.json`);
  writeFileSync(path, JSON.stringify({ source: baselineRef ?? 'working-tree', viewport: page.viewportSize(),
    browser: await page.evaluate(() => ({ dpr: devicePixelRatio, focus: document.activeElement?.id || document.activeElement?.tagName,
      actions: (window as unknown as FixtureWindow).tacticalGeometryActions })), geometry }, null, 2));
  await info.attach(`${name}-geometry.json`, { path, contentType: 'application/json' });
  await page.screenshot({ path: info.outputPath(`${name}.png`), scale: 'css' });
}

async function expectReadable(locator: Locator, containers: Locator[]): Promise<void> {
  const box = await bounds(locator);
  const content = await locator.evaluate(element => ({
    label: `${element.id || element.className || element.tagName}: ${element.textContent?.trim()}`,
    overflowY: getComputedStyle(element).overflowY
  }));
  expect(box.width, `${content.label} has visible width`).toBeGreaterThan(0);
  expect(box.height, `${content.label} has visible height`).toBeGreaterThan(0);
  expect(box.scrollWidth, `${content.label} fits without horizontal clipping`).toBeLessThanOrEqual(box.clientWidth + 1);
  // Visible glyph ink may exceed a tight line box without being clipped (e.g. 15px line / 17px ink).
  // Enforce own-box vertical containment only where overflow actually hides or scrolls that ink.
  if (/^(auto|scroll|hidden|clip)$/.test(content.overflowY)) {
    expect(box.scrollHeight, `${content.label} fits without vertical clipping`).toBeLessThanOrEqual(box.clientHeight + 1);
  }
  const clipping = await locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    const failures: string[] = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const rect = parent.getBoundingClientRect();
      const left = rect.left + parent.clientLeft;
      const top = rect.top + parent.clientTop;
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX) && (box.left < left - 1 || box.right > left + parent.clientWidth + 1)) failures.push(`${parent.id || parent.className}: horizontal`);
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY) && (box.top < top - 1 || box.bottom > top + parent.clientHeight + 1)) failures.push(`${parent.id || parent.className}: vertical`);
    }
    if (box.top < -1 || box.bottom > innerHeight + 1 || box.left < -1 || box.right > innerWidth + 1) failures.push('viewport');
    return failures;
  });
  expect(clipping, 'Content fits every clipping ancestor, before browser focus/scroll can reveal it').toEqual([]);
  for (const container of containers) {
    const frame = await bounds(container);
    expect(box.x, 'Content fits its visible frame').toBeGreaterThanOrEqual(frame.x - 1);
    expect(box.right, 'Content fits its visible frame').toBeLessThanOrEqual(frame.right + 1);
    expect(box.y, 'Content is not clipped above').toBeGreaterThanOrEqual(frame.y - 1);
    expect(box.bottom, 'Content is not clipped below').toBeLessThanOrEqual(frame.bottom + 1);
  }
  expect(await locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit === element || element.contains(hit);
  }), 'Visible content is not covered').toBe(true);
}

async function mountBattleHeader(page: Page, defense = false): Promise<void> {
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
  await page.addScriptTag({ content: logComponent });
  await page.evaluate(isDefense => {
    const runtime = window as unknown as FixtureWindow;
    runtime.tacticalGeometryLog = new runtime.logFixture.BattleActivityLog();
    // Match BattleScreen.reflectActivityLogState: expanded removes the attribute; it never writes "false".
    runtime.tacticalGeometryLog.registerCollapsedChangeListener(collapsed => {
      const main = document.querySelector('.battle-main')!;
      if (collapsed) main.setAttribute('data-activity-collapsed', 'true');
      else main.removeAttribute('data-activity-collapsed');
    });
    runtime.tacticalGeometryLog.sync(Array.from({ length: 18 }, (_, index) => ({
      id: `defender-${index}`, timestamp: '06:00', category: 'system', type: 'deployment',
      summary: `Defending formation ${index + 1} is deployed and ready.`
    })));
    runtime.tacticalGeometryLog.show();
    if (isDefense) {
      document.querySelector('#battleMissionTitle')!.textContent = 'Defensive Engagement — Caen-Orne Sector';
      const progress = document.querySelector('#battleObjectiveProgress')!;
      progress.textContent = 'Secured 0/4 · Friendly control 4/4. Move a friendly formation onto each point and retain control.';
      progress.classList.remove('hidden');
      document.querySelector('#battleObjectiveStatus')!.textContent = 'Friendly-held; needs securing';
    }
  }, defense);
  await page.addScriptTag({ content: component });
  await page.evaluate(() => {
    const runtime = window as unknown as FixtureWindow;
    const container = document.createElement('div');
    container.className = 'initiative-turn-controls-container';
    document.querySelector('.battle-map-header__command-group')!.append(container);
    runtime.tacticalGeometryActions = [];
    runtime.tacticalGeometryControls = new runtime.initiativeFixture.EnhancedInitiativeTurnControls(container, {
      onSkipTurn() {}, onEndTurn: () => runtime.tacticalGeometryActions.push('end-turn'),
      onNextGroup: () => runtime.tacticalGeometryActions.push('next-group'), onNextActivation: () => runtime.tacticalGeometryActions.push('next-activation'),
      onCompleteActivation() {}, onProceedToNext() {}, onSkipGroup() {}
    }, { showSkipTurn: true, showAdvanceButton: true, showProceedButton: false, enableKeyboardShortcuts: true });
    runtime.tacticalGeometryControls.updatePhase('initiativeTurn');
    runtime.tacticalGeometryControls.updatePlayerTurn(true);
    runtime.tacticalGeometryControls.updateCurrentGroup({ initiative: 6, isCompleted: false, currentUnitIndex: 3,
      units: Array.from({ length: 18 }, (_, index) => ({ unitId: `defender-${index}`, ownerId: 'player', initiative: 6,
        isActivated: index < 3, sortOrder: index })) });
  });
  const log = page.locator('#battleActivityLog');
  const logToggle = page.locator('#battleActivityLogToggle');
  await expect(log).not.toHaveAttribute('data-activity-collapsed');
  await expect(logToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(log.locator('li')).toHaveCount(18);
  if (defense) {
    await expectReadable(log.locator('.battle-activity-log__title'), [log]);
    await expectReadable(logToggle, [page.locator('.battle-main')]);
    expect((await bounds(logToggle)).height).toBeGreaterThanOrEqual(44);
    // Opening the compact drawer must not shrink the underlying map/header track.
    const expandedPaneWidth = (await bounds(page.locator('.battle-map-pane'))).width;
    await logToggle.click();
    await settleIntel(page);
    if (page.viewportSize()!.width <= 980) {
      expect((await bounds(page.locator('.battle-map-pane'))).width).toBeCloseTo(expandedPaneWidth, 0);
    }
    await logToggle.click();
    await expect(logToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(log).not.toHaveAttribute('data-activity-collapsed');
  }
  // The user closes the drawer to inspect the map. Never synthesize collapsed state in the fixture.
  await logToggle.click();
  await expect(log).toHaveAttribute('data-activity-collapsed', 'true');
  await expect(logToggle).toHaveAttribute('aria-expanded', 'false');
  await settleIntel(page);
}

/** A container can fit while its flexible text track collapses over its neighbour. */
async function expectInitiativeStatusReadable(header: Locator): Promise<void> {
  const status = header.locator('.initiative-status');
  const frame = await bounds(status);
  const selectors = ['.initiative-status__label', '.initiative-status__value', '.initiative-status__detail'];
  const cells = await Promise.all(selectors.map(async selector => ({ selector, ...await bounds(status.locator(selector)) })));
  for (const cell of cells) {
    expect(cell.width, `${cell.selector} retains a visible track`).toBeGreaterThan(0);
    expect(cell.scrollWidth, `${cell.selector} text fits its own track`).toBeLessThanOrEqual(cell.clientWidth + 1);
    expect(cell.x, `${cell.selector} fits within status left edge`).toBeGreaterThanOrEqual(frame.x - 1);
    expect(cell.right, `${cell.selector} fits within status right edge`).toBeLessThanOrEqual(frame.right + 1);
    expect(cell.y, `${cell.selector} fits within status top edge`).toBeGreaterThanOrEqual(frame.y - 1);
    expect(cell.bottom, `${cell.selector} fits within status bottom edge`).toBeLessThanOrEqual(frame.bottom + 1);
  }
  for (let first = 0; first < cells.length; first += 1) {
    for (let second = first + 1; second < cells.length; second += 1) {
      const a = cells[first];
      const b = cells[second];
      const overlapX = Math.min(a.right, b.right) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
      expect(overlapX > 0.5 && overlapY > 0.5, `${a.selector} must not overlap ${b.selector}`).toBe(false);
    }
  }
}

async function expectInitiativeOwnerStatesReadable(page: Page, header: Locator, roundReady: boolean): Promise<void> {
  await expectInitiativeStatusReadable(header);
  if (roundReady) return;
  const original = await page.evaluate(() => {
    const controls = (window as unknown as FixtureWindow).tacticalGeometryControls;
    return { unit: controls.getCurrentUnit(), group: controls.getCurrentGroup() };
  });
  try {
    await page.evaluate(({ unit, group }) => {
      const controls = (window as unknown as FixtureWindow).tacticalGeometryControls;
      const player = unit ?? group?.units.find(candidate => candidate.ownerId === 'player');
      if (!player) throw new Error('Geometry handoff fixture requires a Player actor.');
      controls.updateCurrentUnit(player);
      controls.updatePlayerTurn(false);
    }, original);
    // Permission changes do not turn the still-current friendly actor into an enemy.
    await expect(header.locator('.initiative-status__value')).toHaveText('Your group');
    await expect(header.locator('.initiative-status__detail')).toHaveText('Orders resolving');
    await expect(header.locator('.initiative-status')).not.toContainText(/formations? ready/);
    await expectInitiativeStatusReadable(header);

    await page.evaluate(({ group }) => {
      if (!group) throw new Error('Geometry handoff fixture requires an initiative group.');
      const controls = (window as unknown as FixtureWindow).tacticalGeometryControls;
      const units = group.units.map(unit => ({ ...unit, unitId: `enemy-${unit.unitId}`, ownerId: 'bot' as const, faction: 'Bot' as const }));
      controls.updateCurrentUnit(units[group.currentUnitIndex]);
      controls.updateCurrentGroup({ ...group, units });
    }, original);
    await expect(header.locator('.initiative-status__value')).toHaveText('Enemy group');
    await expect(header.locator('.initiative-status__detail')).toHaveText('Enemy orders resolving');
    await expect(header.locator('.initiative-status')).not.toContainText(/formations? ready/);
    await expectInitiativeStatusReadable(header);
  } finally {
    await page.evaluate(({ unit, group }) => {
      const controls = (window as unknown as FixtureWindow).tacticalGeometryControls;
      controls.updateCurrentUnit(unit);
      controls.updateCurrentGroup(group);
      controls.updatePlayerTurn(true);
    }, original);
  }
}

async function expectInitialIntel(page: Page, label: string): Promise<void> {
  const overlay = page.locator('#battleIntelOverlay');
  const body = page.locator('#battleIntelOverlayBody');
  await expect(page.locator('#battleIntelOverlayTitle')).toHaveText(label);
  for (const text of await overlay.locator('#battleIntelOverlayTitle, #battleIntelOverlayMeta, .battle-intel-overlay__stat-label, .battle-intel-overlay__stat-value, .battle-intel-overlay__chip').all()) {
    await expectReadable(text, [overlay]);
  }
  expect(await body.evaluate(element => element.scrollTop), 'Initial stats must not require body scrolling').toBe(0);
  for (const id of ['battleIntelOverlayToggle', 'battleIntelOverlayDismiss']) {
    const control = page.locator(`#${id}`);
    await expectReadable(control, [overlay]);
    expect((await bounds(control)).height, `${id} has a 44px target`).toBeGreaterThanOrEqual(43.99);
    expect((await bounds(control)).width, `${id} has a 44px target`).toBeGreaterThanOrEqual(43.99);
  }
}

async function bounds(locator: Locator) {
  return locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height,
      scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight, clientHeight: element.clientHeight };
  });
}

test('readability contract distinguishes visible ink from clipped text', async ({ page }) => {
  await page.setContent('<div id="frame" style="padding:24px;width:200px;overflow:hidden"><div id="text" style="height:1px;font:16px/16px sans-serif">100%</div></div>');
  const text = page.locator('#text');
  const frame = page.locator('#frame');
  // The glyph is fully painted in the frame padding even though its own line box is short.
  await expectReadable(text, [frame]);
  for (const overflow of ['hidden', 'clip', 'auto', 'scroll']) {
    await text.evaluate((element, value) => { (element as HTMLElement).style.overflowY = value; }, overflow);
    await expect(expectReadable(text, [frame])).rejects.toThrow(/vertical clipping/);
  }
  await text.evaluate(element => {
    const style = (element as HTMLElement).style;
    style.overflow = 'visible';
    style.transform = 'translateY(-28px)';
  });
  await expect(expectReadable(text, [frame])).rejects.toThrow(/clipping ancestor/);
});

async function wheelUntilContained(page: Page, owner: Locator, target: Locator): Promise<void> {
  const ownerBox = await bounds(owner);
  await page.mouse.move(ownerBox.x + ownerBox.width / 2, ownerBox.y + ownerBox.height / 2);
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const frame = await bounds(owner);
    const item = await bounds(target);
    if (item.y >= frame.y - 1 && item.bottom <= frame.bottom + 1) return;
    const distance = item.bottom > frame.bottom ? item.bottom - frame.bottom + 8 : item.y - frame.y - 8;
    const direction = Math.sign(distance) || 1;
    await page.mouse.wheel(0, direction * Math.min(360, Math.max(96, Math.abs(distance))));
    await page.evaluate(() => new Promise<void>(resolveFrame => requestAnimationFrame(() => resolveFrame())));
  }
  const frame = await bounds(owner);
  const item = await bounds(target);
  expect(item.y, 'Repeated real wheel gestures reveal the target from above').toBeGreaterThanOrEqual(frame.y - 1);
  expect(item.bottom, 'Repeated real wheel gestures reveal the target from below').toBeLessThanOrEqual(frame.bottom + 1);
}

/** Read individual labels: the command group can fit while a button paints into its neighbour. */
async function expectCommandButtonsReadable(header: Locator): Promise<void> {
  const buttons = header.locator('.turn-controls-buttons button');
  const boxes = [];
  for (const button of await buttons.all()) {
    await expectReadable(button, [header, header.locator('.turn-controls-buttons')]);
    const box = await bounds(button);
    expect(box.width, 'Command retains a 44px touch target').toBeGreaterThanOrEqual(43.99);
    expect(box.height, 'Command retains a 44px touch target').toBeGreaterThanOrEqual(43.99);
    boxes.push(box);
  }
  for (let index = 1; index < boxes.length; index += 1) {
    expect(boxes[index - 1].right, 'Adjacent command buttons do not overlap').toBeLessThanOrEqual(boxes[index].x + 1);
  }
}

/** A tall map rectangle may continue below its scrolling pane; count only pixels actually exposed. */
async function visibleMapEntryHeight(page: Page): Promise<number> {
  return page.locator('#battleScreen .map-viewport').evaluate(map => {
    const pane = map.closest('.battle-map-pane');
    if (!(pane instanceof HTMLElement)) throw new Error('Battle map is missing its scrolling pane.');
    const mapBox = map.getBoundingClientRect();
    const paneBox = pane.getBoundingClientRect();
    const paneTop = paneBox.top + pane.clientTop;
    const paneBottom = paneTop + pane.clientHeight;
    return Math.max(0, Math.min(mapBox.bottom, innerHeight, paneBottom) - Math.max(mapBox.top, 0, paneTop));
  });
}

for (const viewport of [
  { width: 390, height: 844 }, { width: 601, height: 900 },
  { width: 601, height: 360 }, { width: 640, height: 360 }
]) {
  test.describe(`${viewport.width}x${viewport.height} conventional command rail`, () => {
    test.use({ viewport });
    test('FSG_VIS_092 conventional End Turn preserves its original two-column header', async ({ page }, info) => {
      await mountBattleHeader(page);
      await page.evaluate(() => {
        // Match the conventional consumer: it has the shipped End Turn, not initiative controls.
        (window as unknown as FixtureWindow).tacticalGeometryControls.dispose();
        document.querySelector('.enhanced-initiative-turn-controls')!.remove();
        document.querySelectorAll('.initiative-controls-active').forEach(node => node.classList.remove('initiative-controls-active'));
        const endTurn = document.querySelector<HTMLButtonElement>('#endTurn')!;
        endTurn.style.removeProperty('display');
        endTurn.disabled = false;
      });
      await settleIntel(page);
      const header = page.locator('.battle-map-header');
      const save = await bounds(header.locator('.battle-save-command'));
      const commands = await bounds(header.locator('.battle-map-header__command-group'));
      const map = await bounds(page.locator('#battleScreen .map-viewport'));
      const spacing = await header.evaluate(element => {
        const style = getComputedStyle(element);
        const objective = getComputedStyle(element.querySelector('.battle-objective-card')!);
        return { paddingTop: parseFloat(style.paddingTop), paddingBottom: parseFloat(style.paddingBottom),
          gap: parseFloat(style.gap), objectivePadding: parseFloat(objective.paddingTop) };
      });
      writeFileSync(info.outputPath('conventional-command-geometry.json'), JSON.stringify({ viewport, save, commands, map, spacing }, null, 2));
      await page.screenshot({ path: info.outputPath('conventional-command-rail.png'), scale: 'css' });
      await expect(page.locator('.initiative-controls-active')).toHaveCount(0);
      expect(save.y, 'Conventional Save/Load and End Turn retain one shared row').toBeCloseTo(commands.y, 0);
      expect(save.right, 'Conventional actions retain separate columns').toBeLessThanOrEqual(commands.x + 1);
      expect(save.width, 'Conventional save track retains its original allocation').toBeCloseTo(viewport.height <= 480 ? 136 : 152, 0);
      if (viewport.height <= 480) {
        const legacyObjectivePadding = await page.evaluate(() => {
          // Compare the authored 0.46rem after the browser's own subpixel quantization.
          const reference = document.querySelector('.battle-objective-card')!.cloneNode(false) as HTMLElement;
          reference.removeAttribute('id');
          reference.style.paddingTop = '0.46rem';
          document.body.append(reference);
          const padding = parseFloat(getComputedStyle(reference).paddingTop);
          reference.remove();
          return padding;
        });
        expect(spacing, 'Initiative-only density fixes do not change conventional short-screen spacing').toEqual({
          paddingTop: 4, paddingBottom: 4, gap: 5.6, objectivePadding: legacyObjectivePadding
        });
      }
      for (const selector of ['#battleSaveButton', '#battleLoadButton', '#endTurn']) {
        const button = header.locator(selector);
        await expectReadable(button, [header]);
        const box = await bounds(button);
        expect(box.width, 'Conventional action retains a 44px target').toBeGreaterThanOrEqual(43.99);
        expect(box.height, 'Conventional action retains a 44px target').toBeGreaterThanOrEqual(43.99);
      }
      await expectReadable(header.locator('#battleSaveStatus'), [header]);
      expect(map.y, 'Conventional header does not overlap the map').toBeGreaterThanOrEqual((await bounds(header)).bottom - 1);
      expect(await visibleMapEntryHeight(page), 'Conventional map retains an initially visible 48px strip').toBeGreaterThanOrEqual(48);
    });
  });
}

for (const viewport of [
  { width: 375, height: 667, stacked: true }, { width: 390, height: 844, stacked: true },
  { width: 600, height: 900, stacked: false }, { width: 601, height: 900, stacked: true },
  { width: 640, height: 900, stacked: true }, { width: 601, height: 360, stacked: false },
  { width: 640, height: 360, stacked: false }
]) {
  test.describe(`${viewport.width}x${viewport.height} narrow command rail`, () => {
    test.use({ viewport });
    test('FSG_CAM_090 mobile command labels retain their own readable targets', async ({ page }, info) => {
      await mountBattleHeader(page);
      const header = page.locator('.battle-map-header');
      await page.screenshot({ path: info.outputPath('mobile-command-rail.png'), scale: 'css' });
      await expectCommandButtonsReadable(header);
      await expectInitiativeOwnerStatesReadable(page, header, false);
      for (const selector of ['#battleSaveButton', '#battleLoadButton', '#battleSaveStatus']) {
        await expectReadable(header.locator(selector), [header]);
      }
      const save = await bounds(header.locator('.battle-save-command'));
      const commands = await bounds(header.locator('.battle-map-header__command-group'));
      if (viewport.stacked) {
        expect(save.bottom, 'Save status clears the full-width initiative row').toBeLessThanOrEqual(commands.y + 1);
      } else {
        expect(save.y, 'Adequate panes retain the shared Save/Load and initiative row').toBeCloseTo(commands.y, 0);
        expect(save.right, 'Adequate panes retain separate action columns').toBeLessThanOrEqual(commands.x + 1);
      }
      const headerBox = await bounds(header);
      const map = await bounds(page.locator('#battleScreen .map-viewport'));
      const visibleMapHeight = await visibleMapEntryHeight(page);
      writeFileSync(info.outputPath('mobile-command-geometry.json'), JSON.stringify({ viewport, header: headerBox, map, visibleMapHeight, save, commands }, null, 2));
      expect(map.y, 'Header does not overlap the map').toBeGreaterThanOrEqual(headerBox.bottom - 1);
      expect(map.height, 'Mobile command readability retains a substantial map viewport').toBeGreaterThanOrEqual(viewport.height * 0.3);
      expect(visibleMapHeight, 'At least 48px of map fits the viewport and scrolling pane before scrolling').toBeGreaterThanOrEqual(48);
      expect(headerBox.scrollWidth, 'Header has no hidden horizontal overflow').toBeLessThanOrEqual(headerBox.clientWidth + 1);
    });
  });
}

test.describe('narrow command regression detector', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('FSG_CAM_090 rejects the former fixed Save/Load column squeezing command labels', async ({ page }) => {
    await mountBattleHeader(page);
    await page.addStyleTag({ content: '.battle-map-header__actions { grid-template-columns: 9.5rem minmax(0, 1fr) !important; }' });
    await expect(expectCommandButtonsReadable(page.locator('.battle-map-header'))).rejects.toThrow(/horizontal clipping/);
  });
});

for (const { height, breakpoint } of [{ height: 900, breakpoint: 480 }, { height: 360, breakpoint: 464 }]) {
  test.describe(`command pane breakpoint ${breakpoint}px`, () => {
    test.use({ viewport: { width: 900, height } });
    test('FSG_CAM_090 narrow panes reflow without changing adequate neighbouring panes', async ({ page }) => {
      await mountBattleHeader(page);
      const header = page.locator('.battle-map-header');
      for (const width of [breakpoint, breakpoint + 1]) {
        await page.locator('.battle-map-pane').evaluate((pane, contentWidth) => {
          const element = pane as HTMLElement;
          const style = getComputedStyle(element);
          const gutter = element.offsetWidth - element.clientWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
          element.style.boxSizing = 'content-box';
          // Container queries measure usable content, excluding the reserved scrollbar gutter.
          element.style.width = `${contentWidth + gutter}px`;
        }, width);
        expect(await page.locator('.battle-map-pane').evaluate(pane => {
          const style = getComputedStyle(pane);
          return pane.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        }), 'Boundary fixture measures actual container content width').toBeCloseTo(width, 0);
        const save = await bounds(header.locator('.battle-save-command'));
        const commands = await bounds(header.locator('.battle-map-header__command-group'));
        if (height > 480 && width === breakpoint) expect(save.bottom).toBeLessThanOrEqual(commands.y + 1);
        else {
          expect(save.y, 'Two-column row preserves short-screen map space or adequate pane placement').toBeCloseTo(commands.y, 0);
          expect(save.right).toBeLessThanOrEqual(commands.x + 1);
        }
        if (height <= 480) expect(save.width, 'Short screens allocate save width without shrinking hit targets').toBeCloseTo(width === breakpoint ? 104 : 136, 0);
        for (const selector of ['#battleSaveButton', '#battleLoadButton', '#battleSaveStatus']) await expectReadable(header.locator(selector), [header]);
        await expectCommandButtonsReadable(header);
      }
    });
  });
}

for (const defense of [false, true]) {
for (const viewport of [
  { width: 600, height: 900 },
  { width: 640, height: 360 }, { width: 753, height: 356 }, { width: 800, height: 900 },
  { width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1506, height: 768 }, { width: 1920, height: 1080 }
]) {
  test.describe(`${viewport.width}x${viewport.height} ${defense ? 'expanded-log defense' : 'collapsed-log assault'}`, () => {
    // This reproduces the measured CSS viewport/DPR, not a claim of native Chrome zoom certification.
    test.use({ viewport, deviceScaleFactor: viewport.width === 753 ? 2.5 : 1 });
    test('FSG_CAM_088 tactical status and initiative actions reflow inside the visible header', async ({ page }, info) => {
      await mountBattleHeader(page, defense);
      if (defense) await expect(page.locator('#battleObjectiveProgress')).toHaveText(objectiveProgress);
      for (const ready of [true, false]) {
        await page.evaluate(roundReady => {
          const controls = (window as unknown as FixtureWindow).tacticalGeometryControls;
          controls.updateCurrentUnit(roundReady ? null : { unitId: 'geometry-only', ownerId: 'player', initiative: 6, isActivated: false, sortOrder: 0 });
          controls.updateRoundAdvanceReady(roundReady);
        }, ready);
        const name = ready ? 'end-turn' : 'active-group';
        const header = page.locator('.battle-map-header');
        if (defense) {
          const drawerToggle = page.locator('#battleActivityLogToggle');
          await drawerToggle.click();
          await settleIntel(page);
          await expect(drawerToggle).toHaveAttribute('aria-expanded', 'true');
          await expect(page.locator('#battleActivityLog')).not.toHaveAttribute('data-activity-collapsed');
          await expectReadable(drawerToggle, [page.locator('.battle-main')]);
          await expectReadable(page.locator('.battle-activity-log__title'), [page.locator('#battleActivityLog')]);
          const frame = await bounds(header);
          for (const selector of ['#battleScreenHeading', '.group-advance-btn', '.skip-group-btn', '.next-activation-btn']) {
            const box = await bounds(header.locator(selector));
            expect(box.scrollWidth, `${selector} stays uncompressed behind the open drawer`).toBeLessThanOrEqual(box.clientWidth + 1);
            expect(box.right).toBeLessThanOrEqual(frame.right + 1);
          }
          await page.screenshot({ path: info.outputPath(`${name}-log-expanded.png`), scale: 'css' });
          await expectInitiativeOwnerStatesReadable(page, header, ready);
          await drawerToggle.click();
          await settleIntel(page);
          await expect(page.locator('#battleActivityLog')).toHaveCSS('visibility', 'hidden');
          await expectReadable(page.locator('#battleObjectiveProgress'), [header]);
          await expectReadable(page.locator('#battleObjectiveStatus'), [header]);
          if (!ready) await expect(header.locator('.initiative-status__detail')).toHaveText('15 formations ready');
        }
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
        await expectInitiativeOwnerStatesReadable(page, header, ready);

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
        expect(await visibleMapEntryHeight(page), 'At least 48px of map fits the viewport and scrolling pane before scrolling').toBeGreaterThanOrEqual(48);
        expect(headerBox.scrollWidth, 'No hidden horizontal overflow in the header').toBeLessThanOrEqual(headerBox.clientWidth + 1);

        for (const button of await header.locator('button:visible').all()) {
          const box = await bounds(button);
          // Fractional transformed bounds can be 43.999992px for a computed 44px target.
          expect(box.height, `${await button.textContent()} retains a 44px target`).toBeGreaterThanOrEqual(43.99);
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

    for (const ready of [true, false]) {
      test(`FSG_CAM_089 selected intel remains readable and commands reachable (${ready ? 'end-turn' : 'active-group'})`, async ({ page }, info) => {
        await mountBattleHeader(page, defense);
        await page.evaluate(roundReady => {
          const controls = (window as unknown as FixtureWindow).tacticalGeometryControls;
          controls.updateCurrentUnit(roundReady ? null : { unitId: 'geometry-only', ownerId: 'player', initiative: 6, isActivated: false, sortOrder: 0 });
          controls.updateRoundAdvanceReady(roundReady);
        }, ready);
        await page.addScriptTag({ content: intelComponent });
        await page.evaluate(intel => {
          const runtime = window as unknown as FixtureWindow;
          runtime.tacticalGeometryIntel = new runtime.intelFixture.SelectionIntelOverlay();
          runtime.tacticalGeometryIntel.update(intel);
        }, defense ? { ...selectedIntel, unitLabel: defenderTitle } : selectedIntel);
        await settleIntel(page);
        const pane = page.locator('.battle-map-pane');
        const map = page.locator('#battleScreen .map-viewport');
        const overlay = page.locator('#battleIntelOverlay');
        const body = page.locator('#battleIntelOverlayBody');
        const toggle = page.locator('#battleIntelOverlayToggle');
        const dismiss = page.locator('#battleIntelOverlayDismiss');
        const advance = page.locator('.enhanced-initiative-turn-controls .group-advance-btn');
        await saveIntelEvidence(page, info, 'selected-initial');
        await expectInitialIntel(page, defense ? defenderTitle : selectedIntel.unitLabel!);
        if (viewport.width > 980) {
          const compactHeader = await bounds(overlay.locator('.battle-intel-overlay__header'));
          expect(compactHeader.height, 'Desktop intel header shares its row with the 44px controls').toBeLessThanOrEqual(64);
          const statRows = await overlay.locator('.battle-intel-overlay__stat').evaluateAll(elements =>
            elements.map(element => Math.round(element.getBoundingClientRect().y))
          );
          expect(new Set(statRows).size, 'Desktop compact stats stay in one row').toBe(1);
        }
        // The overlay owns focus on selection. End must reach the map through the tactical pane.
        await expect(overlay).toBeFocused();
        await page.keyboard.press('End');
        await expect.poll(async () => (await bounds(map)).bottom - (await bounds(pane)).bottom).toBeLessThanOrEqual(1);
        await saveIntelEvidence(page, info, 'selected-compact');

        for (const expanded of [false, true]) {
          if (expanded) {
            await toggle.click();
            await expect(toggle).toHaveAttribute('aria-expanded', 'true');
            await settleIntel(page);
            await saveIntelEvidence(page, info, 'selected-expanded');
            await expectInitialIntel(page, defense ? defenderTitle : selectedIntel.unitLabel!);
          }
          expect((await bounds(body)).height, 'Intel retains room for readable stats').toBeGreaterThanOrEqual(viewport.height <= 480 ? 96 : 48);
          await expect(overlay.locator('.battle-intel-overlay__stat-value')).toHaveText(['100%', '6', '—', '0/2', '4/4', '1-4', 'NW']);
          for (const text of await overlay.locator('.battle-intel-overlay__stat-label, .battle-intel-overlay__stat-value').all()) {
            await expectReadable(text, [text.locator('..'), body, overlay, map, pane]);
          }
          await expectReadable(toggle, [overlay, map, pane]);
          await expectReadable(dismiss, [overlay, map, pane]);
          // Reserve an actual hit-testable strip of battlefield beside the intel, not just a positive map box.
          const mapBox = await bounds(map);
          const cardBox = await bounds(overlay);
          expect(mapBox.right - cardBox.right, 'Intel leaves an uncovered map strip').toBeGreaterThanOrEqual(48);
          expect(mapBox.height, 'Map remains substantial enough to inspect').toBeGreaterThanOrEqual(240);
          expect(await map.evaluate(element => {
            const box = element.getBoundingClientRect();
            const hit = document.elementFromPoint(box.right - 24, box.y + box.height / 2);
            return element.contains(hit) && !hit?.closest('#battleIntelOverlay');
          }), 'Uncovered map accepts pointer input').toBe(true);
        }

        const finalAction = body.locator('[data-selection-action="clear-path"]');
        await wheelUntilContained(page, body, finalAction);
        await expect.poll(async () => (await bounds(finalAction)).bottom - (await bounds(body)).bottom).toBeLessThanOrEqual(1);
        await expectReadable(finalAction, [body, overlay, map, pane]);
        await expectReadable(finalAction.locator('.battle-intel-overlay__action-detail'), [finalAction, body, pane]);
        await saveIntelEvidence(page, info, 'selected-final-action');
        // Tab traverses real enabled actions and scrolls each focused control into view.
        await page.keyboard.press('Tab');
        await expect(dismiss).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(body).toBeFocused();
        const enabledActions = await body.locator('button:enabled').all();
        for (const action of enabledActions) {
          await page.keyboard.press('Tab');
          await expect(action).toBeFocused();
        }
        await expectReadable(finalAction, [body, overlay, map, pane]);
        for (const _action of enabledActions) await page.keyboard.press('Shift+Tab');
        await expect(body).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(dismiss).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(overlay).toBeHidden();
        await settleIntel(page);
        await saveIntelEvidence(page, info, 'selected-closed');
        await page.keyboard.press('Shift+Tab');
        expect(await page.evaluate(() => (window as unknown as FixtureWindow).tacticalGeometryActions), 'Reverse Tab must not order another formation').toEqual([]);
        await expect(advance).toBeFocused();
        await page.keyboard.press('Home');
        await expect.poll(() => pane.evaluate(element => element.scrollTop)).toBe(0);
        await expectReadable(advance, [page.locator('.battle-map-header'), pane]);
        // Transformed fractional coordinates can report 43.999992px for a 44px target.
        expect((await bounds(advance)).height).toBeGreaterThanOrEqual(43.99);
        await page.keyboard.press('Enter');
        expect(await page.evaluate(() => (window as unknown as FixtureWindow).tacticalGeometryActions)).toEqual([ready ? 'end-turn' : 'next-group']);
        await saveIntelEvidence(page, info, 'returned-to-commands');
      });
    }

    if (viewport.width === 753) {
      test('FSG_CAM_090 nonmodal selected intel accepts keyboard entry without selecting another formation', async ({ page }) => {
        await mountBattleHeader(page, defense);
        await page.evaluate(() => (window as unknown as FixtureWindow).tacticalGeometryControls.updateCurrentUnit({
          unitId: 'geometry-only', ownerId: 'player', initiative: 6, isActivated: false, sortOrder: 0
        }));
        await page.addScriptTag({ content: intelComponent });
        await page.evaluate(intel => {
          const runtime = window as unknown as FixtureWindow;
          runtime.tacticalGeometryIntel = new runtime.intelFixture.SelectionIntelOverlay();
          runtime.tacticalGeometryIntel.update(intel);
        }, selectedIntel);
        await settleIntel(page);
        await expect(page.locator('#battleIntelOverlay')).toBeFocused();
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => (window as unknown as FixtureWindow).tacticalGeometryActions)).toEqual([]);
        await expect(page.locator('#battleIntelOverlayToggle')).toBeFocused();
        // Unlike fresh selection's dialog root, a clicked toggle already has the existing button guard.
        await page.keyboard.press('Tab');
        await expect(page.locator('#battleIntelOverlayDismiss')).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator('#battleIntelOverlay')).toBeHidden();
        await settleIntel(page);
        await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');
        // Preserve the deliberate, unmodified battlefield Tab shortcut without assigning focus in the test.
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => (window as unknown as FixtureWindow).tacticalGeometryActions)).toEqual(['next-activation']);
        await page.keyboard.press('Shift+Tab');
        await expect(page.locator('.enhanced-initiative-turn-controls .group-advance-btn')).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(page.locator('.enhanced-initiative-turn-controls .next-activation-btn')).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(page.locator('.enhanced-initiative-turn-controls .group-advance-btn')).toBeFocused();
        expect(await page.evaluate(() => (window as unknown as FixtureWindow).tacticalGeometryActions)).toEqual(['next-activation']);
      });
    }
  });
}
}
