import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

const releaseViewports = [
  { width: 1920, height: 1080 }, { width: 1506, height: 768 },
  { width: 1440, height: 900 }, { width: 1280, height: 720 },
  { width: 800, height: 900 }, { width: 640, height: 360 }
];

/** Actual painted bounds and scroll dimensions, rather than CSS-class contracts. */
interface Geometry {
  x: number; y: number; width: number; height: number;
  right: number; bottom: number; clientHeight: number; scrollHeight: number;
  overflowY: string;
}

async function geometry(locator: Locator): Promise<Geometry> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      right: rect.right, bottom: rect.bottom,
      clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY
    };
  });
}

function intersectionArea(first: Geometry, second: Geometry): number {
  return Math.max(0, Math.min(first.right, second.right) - Math.max(first.x, second.x))
    * Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.y, second.y));
}

function contained(inner: Geometry, outer: Geometry): void {
  expect(inner.width).toBeGreaterThan(0);
  expect(inner.height).toBeGreaterThan(0);
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1);
  expect(inner.right).toBeLessThanOrEqual(outer.right + 1);
  expect(inner.bottom).toBeLessThanOrEqual(outer.bottom + 1);
}

async function evidence(page: Page, info: TestInfo, name: string, value: unknown): Promise<void> {
  await info.attach(`${name}.json`, { body: Buffer.from(JSON.stringify(value, null, 2)), contentType: 'application/json' });
  const screenshot = info.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshot });
  await info.attach(`${name}.png`, { path: screenshot, contentType: 'image/png' });
}

/** Local entitlement fixture only. Campaign state and order results use normal product controls. */
async function openFront(page: Page, viewport: { width: number; height: number }, startCompact = false): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(startCompact ? viewport : { width: 1920, height: 1080 });
  await page.route('**/clerk.browser.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.Clerk = { load: () => Promise.resolve(), user: null };'
  }));
  await page.goto('/?campaign-ui=v2');
  expect(['localhost', '127.0.0.1']).toContain(new URL(page.url()).hostname);
  await expect(page.locator('#appBootStatus')).toHaveCount(0);
  await page.locator('[data-campaign-id="western-europe"]').click();
  await expect(page.locator('.campaign-command-shell')).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('fsg:authResolved', {
    detail: {
      resolved: true, isAuthenticated: false, email: null, subscriptionStatus: null,
      planIds: [], isPrivileged: true, isGuest: true
    }
  })));
  await expect(page.locator('#campaignLockOverlay')).toHaveCount(0);
  if (startCompact) await page.locator('#campaignWorkspaceTab-situation').click();
  await page.locator('.campaign-situation-front[data-front-key="utah_cotentin"]').click();
  await expect(page.locator('#campaignContextInspector')).toBeVisible();
  await page.setViewportSize(viewport);
  await expect(page.locator('#campaignInspectorTitle')).toContainText('Utah');
}

test('FSG_CAM_081: public Enter Campaign link opens campaign while tactical entry keeps operation selection', async ({ page }, info) => {
  await page.route('**/clerk.browser.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.Clerk = { load: () => Promise.resolve(), user: null };'
  }));
  await page.goto('/play');
  await expect(page.locator('#appBootStatus')).toHaveCount(0);
  await expect(page.locator('#landingScreen')).toBeVisible();
  await expect(page.locator('#campaignScreen')).toBeHidden();
  await page.goto('/landing/index.html');
  await page.getByRole('link', { name: 'Enter Campaign', exact: true }).click();
  await expect(page).toHaveURL(/\/play\?mode=campaign$/);
  await expect(page.locator('#appBootStatus')).toHaveCount(0);
  await expect(page.locator('#campaignScreen')).toBeVisible();
  await expect(page.locator('#landingScreen')).toBeHidden();
  await expect(page.locator('.campaign-command-shell')).toBeVisible();
  await expect(page.locator('#campaignCommandClock')).toContainText('7 June 1944');
  await evidence(page, info, 'public-campaign-entry', { url: page.url(), campaignVisible: true });
});

for (const viewport of releaseViewports) {
  const size = `${viewport.width}x${viewport.height}`;

  test(`FSG_CAM_076 ${size}: inspector and primary action fit above the tray`, async ({ page }, info) => {
    await openFront(page, viewport);
    const shell = await geometry(page.locator('.campaign-command-shell'));
    const inspector = await geometry(page.locator('#campaignContextInspector'));
    const body = await geometry(page.locator('.campaign-context-inspector__body'));
    const footer = await geometry(page.locator('.campaign-context-inspector__action-footer'));
    const action = await geometry(page.locator('#campaignQueueEngagement'));
    const tray = await geometry(page.locator('.campaign-order-tray'));
    const viewportBounds: Geometry = {
      x: 0, y: 0, width: viewport.width, height: viewport.height,
      right: viewport.width, bottom: viewport.height, clientHeight: viewport.height,
      scrollHeight: viewport.height, overflowY: 'visible'
    };
    await evidence(page, info, `inspector-${size}`, { viewport, shell, inspector, body, footer, action, tray });
    expect(intersectionArea(tray, action), 'Tray/action intersection must be exactly zero').toBe(0);
    expect(intersectionArea(tray, inspector), 'Inspector must occupy the command content row').toBe(0);
    contained(inspector, shell);
    contained(shell, viewportBounds);
    contained(tray, viewportBounds);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    contained(footer, inspector);
    contained(action, footer);
    contained(body, inspector);
    expect(body.height, 'Selected information must retain a positive body').toBeGreaterThan(0);

    // A compact inspector intentionally covers the map until its explicit close action.
    if (viewport.width <= 1120) await page.locator('[data-close-campaign-inspector]').click();
    const toolbar = page.locator('.campaign-map-command-strip');
    const toolbarBounds = await geometry(toolbar);
    const layerParts = page.locator('.campaign-map-overlay-select:visible > span, .campaign-map-overlay-select:visible select, .campaign-map-overlay-buttons:visible button, .campaign-map-layer-label:visible');
    const cameraButtons = page.locator('.campaign-map-viewport-controls button');
    const layers = await Promise.all((await layerParts.all()).map(geometry));
    const cameras = await Promise.all((await cameraButtons.all()).map(geometry));
    await evidence(page, info, `map-toolbar-${size}`, { toolbar: toolbarBounds, layers, cameras });
    expect(layers.length).toBeGreaterThan(0);
    expect(cameras.length).toBeGreaterThan(0);
    contained(toolbarBounds, viewportBounds);
    for (const layer of layers) {
      contained(layer, toolbarBounds);
      for (const camera of cameras) {
        expect(intersectionArea(layer, camera), 'Map layer must not overlap camera controls').toBe(0);
      }
    }
    for (const camera of cameras) contained(camera, toolbarBounds);
    for (const camera of await cameraButtons.all()) await camera.click({ trial: true });
    const select = page.locator('.campaign-map-overlay-select select');
    if (await select.isVisible()) {
      await select.click({ trial: true });
      await select.selectOption('objectives');
      await expect(page.locator('#campaignHexMap')).toHaveAttribute('data-overlay-mode', 'objectives');
      await select.selectOption('operational');
    } else {
      await page.locator('.campaign-map-overlay-buttons').getByRole('button', { name: 'Objectives', exact: true }).click();
      await expect(page.locator('#campaignHexMap')).toHaveAttribute('data-overlay-mode', 'objectives');
      await page.locator('.campaign-map-overlay-buttons').getByRole('button', { name: 'Operational', exact: true }).click();
    }
    await page.locator('.campaign-map-viewport-controls').getByRole('button', { name: 'Theater overview', exact: true }).click();
    await page.locator('.campaign-map-viewport-controls').getByRole('button', { name: 'Active front', exact: true }).click();
    await expect(page.locator('.campaign-map-viewport-controls').getByRole('button', { name: 'Active front', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test(`FSG_CAM_078 ${size}: order drawer, timeline, advance and map return are reachable`, async ({ page }, info) => {
    await openFront(page, viewport);
    await page.locator('#campaignOrdersToggle').click();
    const drawer = page.locator('#campaignOrdersDrawer');
    await expect(drawer).toBeVisible();
    const shell = await geometry(page.locator('.campaign-command-shell'));
    contained(await geometry(drawer), shell);
    contained(await geometry(page.locator('[data-close-campaign-orders]')), await geometry(drawer));
    await page.locator('[data-close-campaign-orders]').click();
    await expect(drawer).toBeHidden();
    await page.locator('#campaignTimelineToggle').click();
    const timeline = page.locator('#campaignAdvanceTimeline');
    await expect(timeline).toBeVisible();
    contained(await geometry(timeline), shell);
    await page.locator('[data-close-campaign-timeline]').click();
    await page.locator('#campaignAdvanceMode').selectOption('segment');
    const clock = page.locator('#campaignCommandClock');
    const before = await clock.textContent();
    await page.locator('#campaignAdvanceSegment').click();
    await expect(clock).not.toHaveText(before ?? '');
    await page.locator('#campaignTimelineToggle').click();
    await expect(page.locator('.campaign-advance-timeline__entry').first()).toBeVisible();
    const timelineBounds = await geometry(timeline);
    if (timelineBounds.scrollHeight > timelineBounds.clientHeight) {
      const entry = page.locator('.campaign-advance-timeline__entry').last();
      const entryBounds = await geometry(entry);
      await page.mouse.move(timelineBounds.x + timelineBounds.width / 2, timelineBounds.y + timelineBounds.height / 2);
      await page.mouse.wheel(0, Math.ceil(entryBounds.bottom - timelineBounds.bottom + 12));
      await expect.poll(() => timeline.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      contained(await geometry(entry), await geometry(timeline));
    }
    await evidence(page, info, `timeline-${size}`, await geometry(timeline));
    await page.locator('[data-close-campaign-timeline]').click();
    if (viewport.width <= 1120) {
      const close = page.locator('[data-close-campaign-inspector]');
      if (await close.isVisible()) await close.click();
      await expect(page.locator('#campaignContextInspector')).toBeHidden();
    }
    await page.locator('.campaign-map-list-toggle').click();
    await expect(page.locator('.campaign-map-accessible-list')).toBeVisible();
  });

  test(`FSG_CAM_079 ${size}: target selection and queue action complete tactical handoff`, async ({ page }, info) => {
    await openFront(page, viewport);
    const target = page.locator('[data-campaign-front-target-choice]').first();
    await target.click();
    await expect(target).toHaveAttribute('aria-pressed', 'true');
    const queue = page.locator('#campaignQueueEngagement');
    await expect(queue).toBeEnabled();
    contained(await geometry(queue), await geometry(page.locator('#campaignContextInspector')));
    await evidence(page, info, `selected-target-${size}`, { target: await geometry(target), queue: await geometry(queue) });
    await queue.click();
    const confirm = page.locator('#battlePopupLayer [data-confirm-campaign-action]');
    await expect.poll(async () => (await confirm.isVisible()) || (await page.locator('#precombatScreen').isVisible())).toBe(true);
    if (await confirm.isVisible()) await confirm.click();
    await expect(page.locator('#precombatScreen')).toBeVisible();
  });
}

test('FSG_CAM_077 640x360: body alone scrolls and exposes the last target', async ({ page }, info) => {
  await openFront(page, { width: 640, height: 360 }, true);
  const body = page.locator('.campaign-context-inspector__body');
  const bounds = await geometry(body);
  expect(bounds.height).toBeGreaterThan(0);
  const owners = await page.locator('#campaignContextInspector').evaluate((inspector) =>
    [inspector, ...inspector.querySelectorAll('*')].filter((element) => {
      const style = getComputedStyle(element);
      return element.clientHeight > 0 && /^(auto|scroll)$/.test(style.overflowY)
        && element.scrollHeight > element.clientHeight;
    }).map((element) => element.className));
  expect(owners).toEqual(['campaign-context-inspector__body']);
  const ancestors = await body.evaluate((element) => {
    const chain: { element: string; overflowY: string; scrollTop: number; scrollable: boolean }[] = [];
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const overflowY = getComputedStyle(ancestor).overflowY;
      chain.push({ element: ancestor.id || ancestor.className || ancestor.tagName, overflowY,
        scrollTop: ancestor.scrollTop,
        scrollable: /^(auto|scroll)$/.test(overflowY) && ancestor.scrollHeight > ancestor.clientHeight });
    }
    return chain;
  });
  expect(ancestors.filter((ancestor) => ancestor.scrollable)).toEqual([]);
  const initial = await body.evaluate((element) => element.scrollTop);
  const target = page.locator('[data-campaign-front-target-choice]').last();
  const targetBeforeScroll = await geometry(target);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.wheel(0, Math.ceil(targetBeforeScroll.bottom - bounds.bottom + 4));
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(initial);
  await evidence(page, info, 'compact-before-target', { body: await geometry(body), target: await geometry(target), scrollTop: await body.evaluate((element) => element.scrollTop) });
  contained(await geometry(target), await geometry(body));
  await target.click();
  await expect(target).toHaveAttribute('aria-pressed', 'true');
  await evidence(page, info, 'compact-after-target', { body: await geometry(body), target: await geometry(target), scrollTop: await body.evaluate((element) => element.scrollTop) });
  contained(await geometry(target), await geometry(body));
  const outerScroll = await page.locator('#campaignContextInspector').evaluate((element) => ({
    inspector: element.scrollTop, document: document.scrollingElement?.scrollTop
  }));
  expect(outerScroll).toEqual({ inspector: 0, document: 0 });
  await evidence(page, info, 'compact-body-scroll', { bounds: await geometry(body), owners, ancestors, outerScroll });
  await page.locator('[data-close-campaign-inspector]').click();
  await expect(page.locator('#campaignContextInspector')).toBeHidden();
});
