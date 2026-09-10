import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

const releaseViewports = [
  { width: 1920, height: 1080 }, { width: 1506, height: 768 },
  { width: 1440, height: 900 }, { width: 1280, height: 720 },
  { width: 800, height: 900 }, { width: 640, height: 360 }
];

/** Actual painted bounds and scroll dimensions, rather than CSS-class contracts. */
interface Geometry {
  x: number; y: number; width: number; height: number;
  right: number; bottom: number; clientWidth: number; scrollWidth: number;
  clientHeight: number; scrollHeight: number; scrollLeft: number; scrollTop: number;
  overflowX: string; overflowY: string;
}

async function geometry(locator: Locator): Promise<Geometry> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      right: rect.right, bottom: rect.bottom,
      clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
      scrollLeft: element.scrollLeft, scrollTop: element.scrollTop,
      overflowX: getComputedStyle(element).overflowX,
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

async function campaignHexArtGeometry(page: Page, preferredHex?: string): Promise<{
  hexKey: string; scale: number; intersectsViewport: boolean;
  ratio: number; centerDelta: number; treatment: string | undefined;
  transform: string | null; registrationFailures: string[];
  ownerRatios: Record<'tiles' | 'bases' | 'knownSites', number[]>;
  forceRatio: number; forceWidth: number; forceContained: boolean;
  cameraScaleOwners: string[]; gridRelativeCounterScales: string[];
}> {
  return page.locator('#campaignHexMap').evaluate((svg, requestedHex) => {
    const viewport = document.querySelector<HTMLElement>('.campaign-map-viewport')!.getBoundingClientRect();
    const candidates = Array.from(svg.querySelectorAll<SVGImageElement>('#campaign-map-sprites .campaign-map-tile-symbol.campaign-map-hex-art'));
    const tile = requestedHex
      ? candidates.find(image => image.dataset.hex === requestedHex)
      : candidates.filter(image => {
        const box = image.getBoundingClientRect();
        return box.right > viewport.left && box.left < viewport.right && box.bottom > viewport.top && box.top < viewport.bottom;
      }).sort((left, right) => {
        const leftBox = left.getBoundingClientRect(); const rightBox = right.getBoundingClientRect();
        const cx = viewport.left + viewport.width / 2; const cy = viewport.top + viewport.height / 2;
        return Math.hypot(leftBox.left + leftBox.width / 2 - cx, leftBox.top + leftBox.height / 2 - cy)
          - Math.hypot(rightBox.left + rightBox.width / 2 - cx, rightBox.top + rightBox.height / 2 - cy);
      })[0];
    if (!tile?.dataset.hex) throw new Error(`No visible registered hex artwork${requestedHex ? ` at ${requestedHex}` : ''}.`);
    const hexKey = tile.dataset.hex;
    const cell = svg.querySelector<SVGPolygonElement>(`.campaign-hex[data-hex="${hexKey}"] polygon`)!;
    const tileBox = tile.getBoundingClientRect();
    const cellBox = cell.getBoundingClientRect();
    const transform = svg.querySelector('#viewportRoot')?.getAttribute('transform') ?? null;
    const scale = Number(transform?.match(/scale\(([^)]+)\)/)?.[1]);
    const registrationFailures = Array.from(svg.querySelectorAll<SVGImageElement>('.campaign-map-hex-art')).flatMap(image => {
      if (!image.getAttribute('transform')?.startsWith('rotate(30 ')) return [`${image.getAttribute('class')}:rotation`];
      const frame = image.closest<SVGGElement>('.campaign-map-hex-art-frame');
      const clipId = frame?.getAttribute('clip-path')?.match(/^url\(#(.+)\)$/)?.[1];
      const clip = clipId ? svg.querySelector<SVGPolygonElement>(`#${clipId} polygon`) : null;
      const owner = frame?.dataset.hex
        ? svg.querySelector<SVGPolygonElement>(`.campaign-hex[data-hex="${frame.dataset.hex}"] polygon`)
        : null;
      const cellBox = owner?.getBBox();
      const width = Number(image.getAttribute('width')); const height = Number(image.getAttribute('height'));
      const cellRelativeOwner = image.dataset.visualScale === 'cell-relative'
        || image.closest('[data-visual-scale="cell-relative"]') !== null;
      let counterScaleOwner: Element | null = null;
      for (let parent: Element | null = image.parentElement; parent && parent.id !== 'viewportRoot'; parent = parent.parentElement) {
        if (/scale\(/.test(parent.getAttribute('transform') ?? '')
          || (parent instanceof SVGElement && /scale\(/.test(parent.style.transform) && parent.style.transform !== 'none')) {
          counterScaleOwner = parent;
          break;
        }
      }
      return frame && clip && owner && cellBox && clip.getAttribute('points') === owner.getAttribute('points')
        && Math.abs(width - cellBox.width) < 0.001
        && Math.abs(height - cellBox.width) < 0.001
        && cellRelativeOwner && !counterScaleOwner
        ? []
        : [`${image.getAttribute('class')}:extent-or-transform`];
    });
    const ownerRatios = {
      tiles: Array.from(svg.querySelectorAll<SVGImageElement>('#campaign-map-sprites .campaign-map-tile-symbol.campaign-map-hex-art')),
      bases: Array.from(svg.querySelectorAll<SVGImageElement>('.campaign-base-marker__sprite.campaign-map-hex-art')),
      knownSites: Array.from(svg.querySelectorAll<SVGImageElement>('.campaign-known-site__sprite.campaign-map-hex-art'))
    };
    const measuredOwnerRatios = Object.fromEntries(Object.entries(ownerRatios).map(([kind, images]) => [kind, images.flatMap(image => {
      const frame = image.closest<SVGGElement>('.campaign-map-hex-art-frame')!;
      const owner = svg.querySelector<SVGPolygonElement>(`.campaign-hex[data-hex="${frame.dataset.hex}"] polygon`)!;
      const imageBox = image.getBoundingClientRect(); const ownerBox = owner.getBoundingClientRect();
      return imageBox.width > 0 && ownerBox.width > 0 ? [imageBox.width / ownerBox.width] : [];
    })])) as Record<'tiles' | 'bases' | 'knownSites', number[]>;
    const force = svg.querySelector<SVGCircleElement>('.campaign-force-stack__footprint')!;
    const forceStack = force.closest<SVGGElement>('.campaign-force-stack')!;
    const forceCell = svg.querySelector<SVGPolygonElement>(`.campaign-hex[data-hex="${forceStack.dataset.hex}"] polygon`)!;
    const forceBox = force.getBoundingClientRect();
    const forceCellBox = forceCell.getBoundingClientRect();
    const forceToCell = forceCell.getScreenCTM()!.inverse();
    const forceContained = Array.from({ length: 32 }, (_, index) => new DOMPoint(
      forceBox.left + forceBox.width / 2 + Math.cos(index * Math.PI / 16) * forceBox.width / 2,
      forceBox.top + forceBox.height / 2 + Math.sin(index * Math.PI / 16) * forceBox.height / 2
    )).every(point => forceCell.isPointInFill(point.matrixTransform(forceToCell)));
    return {
      hexKey,
      scale,
      intersectsViewport: tileBox.right > viewport.left && tileBox.left < viewport.right
        && tileBox.bottom > viewport.top && tileBox.top < viewport.bottom,
      ratio: tileBox.width / cellBox.width,
      centerDelta: Math.hypot(
        tileBox.left + tileBox.width / 2 - (cellBox.left + cellBox.width / 2),
        tileBox.top + tileBox.height / 2 - (cellBox.top + cellBox.height / 2)
      ),
      treatment: tile.dataset.symbolTreatment,
      transform,
      registrationFailures,
      ownerRatios: measuredOwnerRatios,
      forceRatio: forceBox.width / forceCellBox.width,
      forceWidth: forceBox.width,
      forceContained,
      cameraScaleOwners: Array.from(svg.querySelectorAll<SVGElement>('[transform*="scale("]'))
        .map(element => element.id || element.getAttribute('class') || element.tagName),
      gridRelativeCounterScales: Array.from(svg.querySelectorAll<SVGElement>('[data-visual-scale="cell-relative"]'))
        .filter(element => {
          for (let parent = element.parentElement; parent && parent.id !== 'viewportRoot'; parent = parent.parentElement) {
            if (/scale\(/.test(parent.getAttribute('transform') ?? '')
              || (parent instanceof SVGElement && /scale\(/.test(parent.style.transform))) return true;
          }
          return false;
        })
        .map(element => element.getAttribute('class') ?? element.tagName)
    };
  }, preferredHex);
}

/** Local entitlement fixture only. Campaign state and order results use normal product controls. */
async function openFront(page: Page, viewport: { width: number; height: number }, startCompact = false): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(startCompact ? viewport : { width: 1920, height: 1080 });
  await page.route('**/clerk.browser.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.Clerk = { load: () => Promise.resolve(), user: null };'
  }));
  await page.goto('/?campaign-ui=v2', { waitUntil: 'domcontentloaded' });
  expect(['localhost', '127.0.0.1']).toContain(new URL(page.url()).hostname);
  await expect(page.locator('#appBootStatus')).toHaveCount(0, { timeout: 30_000 });
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
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await expect(page.locator('#campaignInspectorTitle')).toContainText('Utah');
}

test('FSG_CAM_081: public Enter Campaign link opens campaign while tactical entry keeps operation selection', async ({ page }, info) => {
  await page.route('**/clerk.browser.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.Clerk = { load: () => Promise.resolve(), user: null };'
  }));
  await page.goto('/play');
  await expect(page.locator('#appBootStatus')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('#landingScreen')).toBeVisible();
  await expect(page.locator('#campaignScreen')).toBeHidden();
  await page.goto('/landing/index.html');
  await page.getByRole('link', { name: 'Enter Campaign', exact: true }).click();
  await expect(page).toHaveURL(/\/play\?mode=campaign$/);
  await expect(page.locator('#appBootStatus')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('#campaignScreen')).toBeVisible();
  await expect(page.locator('#landingScreen')).toBeHidden();
  await expect(page.locator('.campaign-command-shell')).toBeVisible();
  await expect(page.locator('#campaignCommandClock')).toContainText('7 June 1944');
  await evidence(page, info, 'public-campaign-entry', { url: page.url(), campaignVisible: true });
});

test('FSG_CAM_108: real theater and zoom controls preserve hex-art registration', async ({ page }, info) => {
  await openFront(page, { width: 1506, height: 768 });
  const cameraControls = page.locator('.campaign-map-viewport-controls');
  const mapViewport = page.locator('.campaign-map-viewport');
  const nativeNavigation = await geometry(mapViewport);
  expect(['hidden', 'clip']).toContain(nativeNavigation.overflowX);
  expect(['hidden', 'clip']).toContain(nativeNavigation.overflowY);
  expect(nativeNavigation.scrollLeft).toBe(0);
  expect(nativeNavigation.scrollTop).toBe(0);
  await cameraControls.getByRole('button', { name: 'Active front', exact: true }).click();
  await expect(page.locator('#campaignMapScopeLabel')).toHaveText('Active front');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const active = await campaignHexArtGeometry(page);
  await cameraControls.getByRole('button', { name: 'Theater overview', exact: true }).click();
  await expect(cameraControls.getByRole('button', { name: 'Theater overview', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const overview = await campaignHexArtGeometry(page, active.hexKey);
  await evidence(page, info, 'hex-art-theater-overview', overview);

  await cameraControls.getByRole('button', { name: 'Active front', exact: true }).click();
  await expect(cameraControls.getByRole('button', { name: 'Active front', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const restoredActive = await campaignHexArtGeometry(page, active.hexKey);
  const zoomIn = page.locator('#campaignZoomIn');
  await zoomIn.evaluate(button => {
    for (let step = 0; step < 36; step += 1) (button as HTMLButtonElement).click();
  });
  await expect.poll(async () => (await campaignHexArtGeometry(page, restoredActive.hexKey)).scale).toBe(7.5);
  const maximum = await campaignHexArtGeometry(page, restoredActive.hexKey);
  await evidence(page, info, 'hex-art-maximum-zoom', maximum);

  for (const result of [active, overview, restoredActive, maximum]) {
    expect(result.treatment).toBe('grid-registered-hex');
    expect(result.centerDelta).toBeLessThan(0.5);
    expect(result.registrationFailures).toEqual([]);
    expect(result.cameraScaleOwners).toEqual(['viewportRoot']);
    expect(result.gridRelativeCounterScales).toEqual([]);
    expect(result.forceContained).toBe(true);
    for (const ratios of Object.values(result.ownerRatios)) {
      for (const ratio of ratios) expect(ratio).toBeCloseTo(result.ratio, 4);
    }
    expect(result.intersectsViewport, `${result.hexKey} must remain visible at zoom ${result.scale}`).toBe(true);
  }
  for (const ownerKind of ['tiles', 'bases', 'knownSites'] as const) {
    expect(active.ownerRatios[ownerKind].length, `${ownerKind} must be measured at normal zoom`).toBeGreaterThan(0);
    expect(maximum.ownerRatios[ownerKind].length, `${ownerKind} must be measured at maximum zoom`).toBeGreaterThan(0);
  }
  expect(overview.ratio).toBeCloseTo(active.ratio, 4);
  expect(restoredActive.ratio).toBeCloseTo(active.ratio, 4);
  expect(maximum.ratio).toBeCloseTo(active.ratio, 4);
  expect(overview.scale).toBeGreaterThanOrEqual(0.1);
  expect(overview.scale).toBeLessThan(active.scale);
  expect(maximum.scale).toBe(7.5);
  expect(maximum.forceRatio).toBeCloseTo(active.forceRatio, 4);
  expect(maximum.forceWidth).toBeGreaterThanOrEqual(44);
  expect(maximum.forceWidth).toBeGreaterThan(active.forceWidth);
  await expect(page.locator('#campaignZoomLevel')).toHaveText('750%');
  const postControls = await geometry(mapViewport);
  expect(postControls.scrollLeft).toBe(0);
  expect(postControls.scrollTop).toBe(0);
  expect(overview.transform).not.toBe(active.transform);
  expect(maximum.transform).not.toBe(active.transform);
});

for (const viewport of releaseViewports) {
  const size = `${viewport.width}x${viewport.height}`;

  test(`FSG_CAM_082 ${size}: locked entry isolates campaign controls and exposes account recovery`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/clerk.browser.js', (route) => route.fulfill({
      contentType: 'application/javascript',
      body: 'window.Clerk = { load: () => Promise.resolve(), user: null };'
    }));
    await page.goto('/landing/index.html');
    expect(['localhost', '127.0.0.1']).toContain(new URL(page.url()).hostname);
    await page.getByRole('link', { name: 'Enter Campaign', exact: true }).click();
    const gate = page.getByRole('dialog', { name: /campaign locked/i });
    await expect(gate).toBeVisible({ timeout: 30_000 });
    await expect(gate).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Situation', exact: true })).toHaveCount(0);

    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press(step < 4 ? 'Tab' : 'Shift+Tab');
      expect(await gate.evaluate(element => element.contains(document.activeElement)),
        'Locked campaign must keep keyboard focus on its recovery actions').toBe(true);
    }

    const signIn = gate.getByRole('link', { name: /sign in/i });
    const href = await signIn.getAttribute('href');
    expect(href).toBeTruthy();
    const signInUrl = new URL(href!, page.url());
    expect(signInUrl.hostname).toBe('www.sixsmithgames.com');
    expect(signInUrl.pathname).toBe('/sign-in');
    const returnUrl = new URL(signInUrl.searchParams.get('redirect_url')!);
    expect(returnUrl.pathname).toBe('/play');
    expect(returnUrl.searchParams.get('mode')).toBe('campaign');

    // Trial clicks use actual hit testing, catching a higher workspace/tray above the gate.
    const recoveryActions = [signIn, gate.getByRole('link', { name: /view plans/i }),
      gate.getByRole('button', { name: /return to landing screen/i })];
    for (const action of recoveryActions) {
      await action.scrollIntoViewIfNeeded();
      await action.click({ trial: true });
      const bounds = await geometry(action);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom).toBeLessThanOrEqual(viewport.height);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(viewport.width);
    }
    await evidence(page, info, `locked-access-${size}`, { viewport, gate: await geometry(gate), signIn: href });
    await recoveryActions[2].click();
    await expect(page.locator('#landingScreen')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enter Western Europe Campaign', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Enter Western Europe Campaign', exact: true }).click();
    await expect(gate).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Situation', exact: true })).toHaveCount(0);
  });

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
      right: viewport.width, bottom: viewport.height,
      clientWidth: viewport.width, scrollWidth: viewport.width,
      clientHeight: viewport.height, scrollHeight: viewport.height,
      scrollLeft: 0, scrollTop: 0, overflowX: 'visible', overflowY: 'visible'
    };
    await evidence(page, info, `inspector-${size}`, { viewport, shell, inspector, body, footer, action, tray });
    expect(intersectionArea(tray, action), 'Tray/action intersection must be exactly zero').toBe(0);
    // Read both adjoining edges in one layout snapshot. Independent locator
    // evaluations can straddle a resize frame and report an overlap that never
    // existed in one painted frame.
    const inspectorTrayOverlap = await page.locator('.campaign-command-shell').evaluate((shellElement) => {
      const inspectorRect = shellElement.querySelector('#campaignContextInspector')!.getBoundingClientRect();
      const trayRect = shellElement.querySelector('.campaign-order-tray')!.getBoundingClientRect();
      return Math.max(0, Math.min(trayRect.bottom, inspectorRect.bottom) - Math.max(trayRect.y, inspectorRect.y));
    });
    expect(inspectorTrayOverlap, 'Inspector must occupy the command content row').toBeLessThanOrEqual(0.5);
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
    const findLocation = page.getByRole('button', { name: /^Find location(?:,| \()/i });
    await expect(findLocation).toBeVisible();
    contained(await geometry(findLocation), toolbarBounds);
    if (viewport.width >= 1440) {
      const commandBar = await geometry(page.locator('.campaign-command-bar'));
      const rail = await geometry(page.locator('.campaign-workspace-rail'));
      const workspace = await geometry(page.locator('.campaign-workspace-panel.campaign-sidebar'));
      const operationalMap = await geometry(page.locator('.campaign-operational-map'));
      expect(commandBar.height, 'The command bar should return vertical space to the map').toBeGreaterThanOrEqual(64);
      expect(commandBar.height, 'The command bar should return vertical space to the map').toBeLessThanOrEqual(80);
      expect(rail.width, 'The headquarters rail stays compact').toBeGreaterThanOrEqual(80);
      expect(rail.width, 'The headquarters rail stays compact').toBeLessThanOrEqual(100);
      expect(workspace.width, 'The decision workspace retains a readable measure').toBeGreaterThanOrEqual(280);
      expect(workspace.width, 'The decision workspace retains a readable measure').toBeLessThanOrEqual(330);
      expect(inspector.width, 'The field report retains a readable measure').toBeGreaterThanOrEqual(350);
      expect(inspector.width, 'The field report retains a readable measure').toBeLessThanOrEqual(400);
      expect(operationalMap.height, 'The map remains the primary planning surface').toBeGreaterThan(viewport.height * 0.7);
    }
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
    const queue = page.locator('#campaignQueueEngagement');
    const disabledReason = page.locator('#campaignEngagementReason');
    await expect(queue).toBeDisabled();
    await expect(queue).toHaveAttribute('aria-describedby', 'campaignEngagementReason');
    await expect(disabledReason).toBeVisible();
    await expect(disabledReason).toContainText(/select an eligible opposing hex/i);
    const targetHex = await target.getAttribute('data-campaign-front-target-choice');
    expect(targetHex).toBeTruthy();
    await target.click();
    await expect(target).toHaveAttribute('aria-pressed', 'true');
    await expect(queue).toBeEnabled();
    const selectedHexes = page.locator('.campaign-hex.selected');
    await expect(selectedHexes).toHaveCount(1);
    await expect(selectedHexes).toHaveAttribute('data-hex', targetHex!);
    const selectionPaint = await selectedHexes.locator('polygon').evaluate((polygon) => {
      const style = getComputedStyle(polygon);
      return { stroke: style.stroke, strokeWidth: Number.parseFloat(style.strokeWidth), opacity: Number(style.opacity) };
    });
    expect(selectionPaint.stroke).not.toBe('none');
    expect(selectionPaint.stroke).not.toBe('transparent');
    expect(selectionPaint.strokeWidth).toBeGreaterThanOrEqual(2);
    expect(selectionPaint.opacity).toBeGreaterThan(0.8);
    if (viewport.width <= 1120) {
      // The compact inspector is an intentional modal sheet over the map. Exercise the
      // real close → camera control → Situation/front reopen path instead of clicking
      // through the sheet, then confirm the selected target survives the round trip.
      await page.locator('[data-close-campaign-inspector]').click();
      await expect(page.locator('#campaignContextInspector')).toBeHidden();
      await page.locator('#campaignZoomIn').click();
      await page.locator('#campaignWorkspaceTab-situation').click();
      await page.locator('.campaign-situation-front[data-front-key="utah_cotentin"]').click();
      await expect(page.locator('#campaignContextInspector')).toBeVisible();
      await expect(target).toHaveAttribute('aria-pressed', 'true');
    } else {
      await page.locator('#campaignZoomIn').click();
    }
    await expect(page.locator('.campaign-hex.selected')).toHaveCount(1);
    await expect(page.locator('.campaign-hex.selected')).toHaveAttribute('data-hex', targetHex!);
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
