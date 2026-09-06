/** Real map renderer/camera and shipped safe campaign projection; no campaign-state mutations. */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { buildSync } from 'esbuild';
import { resolve } from 'node:path';
import type { CampaignMapRenderer } from '../../src/rendering/CampaignMapRenderer';
import type { MapViewport } from '../../src/ui/controls/MapViewport';
import type { CampaignMapViewModel } from '../../src/core/campaignIntelTypes';

const shipped = new JSDOM(readFileSync('index.html', 'utf8')).window.document;
const styles = Array.from(shipped.querySelectorAll('style')).map(style => style.outerHTML).join('\n');
const markup = shipped.querySelector('.campaign-map-viewport')!.outerHTML;
const component = buildSync({ stdin: { contents: `export {CampaignMapRenderer} from './src/rendering/CampaignMapRenderer'; export {MapViewport} from './src/ui/controls/MapViewport'; export {buildCampaignMapView,createCampaignKnowledgeState} from './src/state/CampaignIntelligence'; export {default as scenario} from './src/data/campaign01.json';`, resolveDir: resolve('.'), loader: 'ts' },
  bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'mapGeometry',
  // Both sprite producers resolve ../assets from their real src/<module> directory.
  define: { 'import.meta.url': '"http://campaign-map.test/src/rendering/CampaignMapRenderer.ts"', 'import.meta.glob': 'undefined' }
}).outputFiles[0].text;
interface MapFixture extends Window {
  mapGeometry: {
    CampaignMapRenderer: typeof CampaignMapRenderer; MapViewport: typeof MapViewport;
    scenario: CampaignMapViewModel['scenario'];
    buildCampaignMapView: typeof import('../../src/state/CampaignIntelligence')['buildCampaignMapView'];
    createCampaignKnowledgeState: typeof import('../../src/state/CampaignIntelligence')['createCampaignKnowledgeState'];
  };
  renderer: CampaignMapRenderer;
  camera: MapViewport;
  view: CampaignMapViewModel;
  originalView: string;
  picks: Array<{ hex: string; contact?: string }>;
}

async function mount(page: Page, zoom: number): Promise<void> {
  await page.route('http://campaign-map.test/src/assets/**', route => {
    const root = resolve('src/assets');
    const file = resolve('src/assets', decodeURIComponent(new URL(route.request().url()).pathname.slice('/src/assets/'.length)));
    if (!file.startsWith(`${root}\\`) && !file.startsWith(`${root}/`)) throw new Error('Asset escaped fixture root.');
    return route.fulfill({ path: file });
  });
  await page.route('**/__campaign-map-geometry', route => route.fulfill({ contentType: 'text/html', body:
    `<!doctype html><html><head>${styles}</head><body style="margin:0;padding:0"><main style="position:absolute;left:280px;top:120px;width:860px;height:530px;overflow:hidden">${markup}</main></body></html>` }));
  await page.goto('http://campaign-map.test/__campaign-map-geometry');
  await page.addScriptTag({ content: component });
  await page.evaluate(zoomValue => {
    const runtime = window as unknown as MapFixture;
    const { mapGeometry: api } = runtime;
    const scenario = structuredClone(api.scenario);
    // Use one shipped sprite instance to prove in a real browser that the scale wrapper does not
    // replace a child SVG rotation. The cloned fixture never mutates source campaign state.
    const rotated = scenario.tiles.find(instance => scenario.tilePalette[instance.tile]?.role.startsWith('fortification'));
    if (rotated) rotated.rotation = 30;
    const intelModule = api;
    runtime.view = intelModule.buildCampaignMapView(scenario, intelModule.createCampaignKnowledgeState(scenario, 'Player', 0), 0);
    runtime.originalView = JSON.stringify(runtime.view);
    runtime.renderer = new api.CampaignMapRenderer();
    const svg = document.querySelector<SVGSVGElement>('#campaignHexMap')!;
    runtime.renderer.render(svg, document.querySelector<HTMLDivElement>('#campaignMapCanvas')!, runtime.view);
    runtime.camera = new api.MapViewport('#campaignHexMap');
    const center = runtime.renderer.getHexCenter('28,23')!;
    runtime.camera.setTransform(zoomValue, 610 - center.cx * zoomValue, 150 - center.cy * zoomValue);
    runtime.renderer.setIntelContactsVisible(false);
    runtime.picks = [];
    runtime.renderer.onHexClick((hex, _tile, contact) => {
      runtime.picks.push({ hex, contact });
      runtime.renderer.highlightHex(hex, 'selected');
    });
  }, zoom);
  await settle(page);
  // Real loaded SVG images, not empty placeholders, own the visual proof.
  const failures = await page.locator('#campaignHexMap image').evaluateAll(async images => {
    const urls = [...new Set(images.map(image => image.getAttribute('href')!))];
    return (await Promise.all(urls.map(url => new Promise<string | null>(resolve => {
      const image = new Image(); image.onload = () => resolve(null); image.onerror = () => resolve(url); image.src = url;
    })))).filter(Boolean);
  });
  expect(failures, 'Every rendered sprite/background URL loads').toEqual([]);
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.locator('#campaignHexMap').evaluate(async svg => { await Promise.all(svg.getAnimations({ subtree: true }).map(animation => animation.finished)); });
}

async function evidence(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: info.outputPath(`${name}.png`), scale: 'css' });
  await info.attach(name, { body: JSON.stringify(await page.locator('#campaignHexMap').evaluate(svg => ({
    transform: svg.querySelector('#viewportRoot')?.getAttribute('transform'),
    viewport: document.querySelector('.campaign-map-viewport')!.getBoundingClientRect().toJSON(),
    site: svg.querySelector('[data-known-site-id="briefed_douvres"]')?.outerHTML
  })), null, 2), contentType: 'application/json' });
}

async function assertContainedTargets(page: Page): Promise<void> {
  const failures = await page.locator('.campaign-known-site, .campaign-intel-contact').evaluateAll(markers => {
    const failures: string[] = [];
    for (const marker of markers) {
      if (getComputedStyle(marker.parentElement!).display === 'none') continue;
      const hex = document.querySelector<SVGPolygonElement>(`.campaign-hex[data-hex="${marker.getAttribute('data-hex')}"] polygon`)!;
      const matrix = hex.getScreenCTM()!.inverse();
      for (const node of marker.querySelectorAll<SVGGraphicsElement>('image, .campaign-known-site__hit-target, circle:not(.campaign-intel-uncertainty):not(.campaign-known-site__focus-ring)')) {
        const box = node.getBoundingClientRect();
        // Every corner of a square icon must fit; circular targets are sampled on their circumference.
        const points = node.tagName === 'circle'
          ? Array.from({ length: 32 }, (_, i) => new DOMPoint(box.x + box.width / 2 + Math.cos(i * Math.PI / 16) * box.width / 2, box.y + box.height / 2 + Math.sin(i * Math.PI / 16) * box.height / 2))
          : [new DOMPoint(box.left, box.top), new DOMPoint(box.right, box.top), new DOMPoint(box.left, box.bottom), new DOMPoint(box.right, box.bottom)];
        if (points.some(point => !hex.isPointInFill(point.matrixTransform(matrix)))) failures.push(`${marker.getAttribute('data-hex')}: ${node.tagName}.${node.getAttribute('class')}`);
      }
    }
    return failures;
  });
  expect(failures, 'Visual and pointer footprints stay inside authored cells').toEqual([]);
}

async function assertCompleteCollisionFreeLabels(page: Page): Promise<void> {
  const result = await page.locator('#campaignHexMap').evaluate(svg => {
    const runtime = window as unknown as MapFixture;
    const expected = runtime.view.scenario.tiles.filter(instance => {
      const palette = runtime.view.scenario.tilePalette[instance.tile];
      return Boolean(palette?.mapLabel?.trim())
        && palette.role !== 'taskForce'
        && !(palette.factionControl === runtime.view.observerFaction
          && (palette.role === 'airbase' || palette.role === 'logisticsHub' || palette.role === 'navalBase'));
    }).map(instance => runtime.view.scenario.tilePalette[instance.tile].mapLabel!.trim()).sort();
    const visible = (node: Element): boolean => {
      for (let current: Element | null = node; current && current !== svg; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      }
      return true;
    };
    const labels = Array.from(svg.querySelectorAll<SVGTextElement>('.campaign-map-location-label text'));
    const rendered = labels.map(label => label.textContent?.trim() ?? '').sort();
    const markerBoxes = Array.from(svg.querySelectorAll<SVGGraphicsElement>(
      '#campaign-map-sprites image, .campaign-base-marker__sprite, .campaign-force-stack__footprint, .campaign-known-site__sprite, .campaign-intel-contact circle:not(.campaign-intel-uncertainty)'
    )).filter(visible).map(marker => marker.getBoundingClientRect());
    const labelBoxes = labels.map(label => ({ label: label.textContent?.trim() ?? '', box: label.getBoundingClientRect() }));
    const intersections = labelBoxes.flatMap(entry => markerBoxes.flatMap((marker, index) => {
      const area = Math.max(0, Math.min(entry.box.right, marker.right) - Math.max(entry.box.left, marker.left))
        * Math.max(0, Math.min(entry.box.bottom, marker.bottom) - Math.max(entry.box.top, marker.top));
      return area > 0.5 ? [`${entry.label}:marker-${index}:${area.toFixed(1)}`] : [];
    }));
    const labelIntersections = labelBoxes.flatMap((entry, index) => labelBoxes.slice(index + 1).flatMap(other => {
      const area = Math.max(0, Math.min(entry.box.right, other.box.right) - Math.max(entry.box.left, other.box.left))
        * Math.max(0, Math.min(entry.box.bottom, other.box.bottom) - Math.max(entry.box.top, other.box.top));
      return area > 0.5 ? [`${entry.label}:${other.label}:${area.toFixed(1)}`] : [];
    }));
    const layers = Array.from(svg.querySelector('#viewportRoot')?.children ?? []);
    const leaderIndex = layers.findIndex(layer => layer.id === 'campaign-map-location-leaders');
    const labelIndex = layers.findIndex(layer => layer.id === 'campaign-map-location-labels');
    const markerIndexes = ['campaign-map-sprites', 'campaign-map-forces', 'campaign-map-known-sites', 'campaign-map-intel-contacts']
      .map(id => layers.findIndex(layer => layer.id === id));
    return {
      expected,
      rendered,
      intersections,
      labelIntersections,
      leaders: svg.querySelectorAll('#campaign-map-location-leaders .campaign-map-location-label__leader').length,
      leaderIndex,
      labelIndex,
      earliestMarker: Math.min(...markerIndexes),
      latestMarker: Math.max(...markerIndexes)
    };
  });
  expect(result.rendered, 'Every player-safe authored location remains in the DOM').toEqual(result.expected);
  expect(result.intersections, 'No location name intersects a visible Operational or Intelligence marker').toEqual([]);
  expect(result.labelIntersections, 'Location names do not cover one another').toEqual([]);
  expect(result.leaders, 'Every displaced name retains one leader').toBe(result.rendered.length);
  expect(result.leaderIndex, 'Leader strokes render beneath physical markers').toBeLessThan(result.earliestMarker);
  expect(result.labelIndex, 'Location text renders above physical markers').toBeGreaterThan(result.latestMarker);
}

test.use({ viewport: { width: 1506, height: 768 } });
test('FSG_CAM_101 named geography avoids visible marker footprints at detail zoom', async ({ page }, info) => {
  await mount(page, 3.48);
  await evidence(page, info, 'labels');
  await assertCompleteCollisionFreeLabels(page);
  for (const label of ['Omaha', 'Juno', 'Utah Exits']) await expect(page.locator('.campaign-map-location-label text').filter({ hasText: new RegExp(`^${label}$`) })).toHaveCount(1);
});

test('FSG_CAM_101 right-edge disclosure fits the actual clipping viewport', async ({ page }, info) => {
  await mount(page, 3.48);
  const site = page.locator('[data-known-site-id="briefed_douvres"]');
  await site.dispatchEvent('pointerenter');
  await settle(page);
  let right = await page.locator('.campaign-map-viewport').evaluate(element => element.getBoundingClientRect().right);
  let cardRight = await page.locator('#campaign-map-transient-disclosures .is-open').evaluate(element => element.getBoundingClientRect().right);
  expect(cardRight, 'Hover disclosure fits the current viewport').toBeLessThanOrEqual(right - 1);
  await site.dispatchEvent('pointerleave');
  await page.locator('[data-known-site-id="briefed_douvres"]').focus();
  await settle(page);
  await evidence(page, info, 'right-edge-disclosure');
  await page.locator('main').evaluate(element => { element.style.width = '620px'; });
  await settle(page);
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.evaluate(() => {
    const runtime = window as unknown as MapFixture;
    const transform = runtime.camera.getTransform();
    runtime.camera.setTransform(transform.zoom, transform.panX - 36, transform.panY + 18);
    const clippingParent = document.querySelector<HTMLElement>('main')!;
    clippingParent.style.overflow = 'auto';
    clippingParent.scrollLeft = 12;
    clippingParent.dispatchEvent(new Event('scroll'));
  });
  await settle(page);
  right = await page.locator('.campaign-map-viewport').evaluate(element => element.getBoundingClientRect().right);
  cardRight = await page.locator('#campaign-map-transient-disclosures .is-open').evaluate(element => element.getBoundingClientRect().right);
  expect(cardRight, 'Focused disclosure refits after pan, scroll, ancestor resize and window resize').toBeLessThanOrEqual(right - 1);
});

for (const zoom of [0.714, 1, 3.48, 7.5]) {
  test(`FSG_CAM_101 campaign markers, names and disclosure fit at zoom ${zoom}`, async ({ page }, info) => {
    await mount(page, zoom);
    await evidence(page, info, 'operational-before-interaction');
    await assertContainedTargets(page);
    await assertCompleteCollisionFreeLabels(page);
    const site = page.locator('[data-known-site-id="briefed_douvres"]');
    await site.locator('.campaign-known-site__hit-target').click();
    await site.focus();
    await settle(page);
    const card = page.locator('#campaign-map-transient-disclosures .campaign-known-site-disclosure.is-open');
    await evidence(page, info, 'focused-disclosure');
    const clips = await card.evaluate(element => {
      const box = element.getBoundingClientRect();
      const failures: string[] = [];
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent); const frame = parent.getBoundingClientRect();
        if (/(auto|hidden|scroll|clip)/.test(style.overflowX) && (box.left < frame.left - 1 || box.right > frame.right + 1)) failures.push(parent.className.toString());
        if (/(auto|hidden|scroll|clip)/.test(style.overflowY) && (box.top < frame.top - 1 || box.bottom > frame.bottom + 1)) failures.push(parent.className.toString());
      }
      return failures;
    });
    expect(clips, 'Focused disclosure fits all clipping ancestors').toEqual([]);
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => (window as unknown as MapFixture).picks)).toEqual([{ hex: '29,23' }, { hex: '29,23' }]);
    await page.evaluate(() => (window as unknown as MapFixture).renderer.setIntelContactsVisible(true));
    await assertContainedTargets(page);
    await assertCompleteCollisionFreeLabels(page);
    const rotation = await page.locator('#campaign-map-sprites image[transform^="rotate("]').first().evaluate(image => {
      const transform = (image as SVGGraphicsElement).transform.baseVal.consolidate()?.matrix;
      return {
        child: transform ? [transform.a, transform.b, transform.c, transform.d] : null,
        parent: getComputedStyle(image.parentElement!).transform
      };
    });
    expect(rotation.child, 'Authored SVG rotation remains active').not.toBeNull();
    expect(Math.abs(rotation.child![1]) + Math.abs(rotation.child![2]), 'Authored rotation is non-zero').toBeGreaterThan(0.01);
    expect(rotation.parent, 'The independent bounded scale wrapper remains computed').not.toBe('none');
    await evidence(page, info, 'intelligence');
    expect(await page.evaluate(() => JSON.stringify((window as unknown as MapFixture).view) === (window as unknown as MapFixture).originalView)).toBe(true);
  });
}
