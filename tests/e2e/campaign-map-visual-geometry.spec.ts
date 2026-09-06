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
    const boundedTile = scenario.tiles.find(instance => instance.tile === 'easternBeachheadLink');
    if (boundedTile) boundedTile.spriteKey = 'intelNode';
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

async function assertHexRasterPaintClipped(page: Page, info: TestInfo): Promise<void> {
  const isolation = await page.locator('#campaignHexMap').evaluate(svg => {
    const runtime = window as unknown as MapFixture;
    runtime.camera.dispose();
    const image = svg.querySelector<SVGImageElement>('#campaign-map-sprites .campaign-map-tile-symbol[data-hex="28,23"]')!;
    const frame = image.closest<SVGGElement>('.campaign-map-hex-art-frame')!;
    const owner = frame.parentElement!;
    const spriteLayer = owner.parentElement!;
    const root = svg.querySelector<SVGGElement>('#viewportRoot')!;
    const cell = svg.querySelector<SVGPolygonElement>('.campaign-hex[data-hex="28,23"] polygon')!;
    const matrix = cell.getScreenCTM()!;
    const polygon = cell.getAttribute('points')!.trim().split(/\s+/).map(pair => {
      const [x, y] = pair.split(',').map(Number);
      const point = new DOMPoint(x, y).matrixTransform(matrix);
      return { x: point.x, y: point.y };
    });
    Array.from(root.children).forEach(child => {
      if (child.id !== 'campaign-map-hex-art-clips' && child !== spriteLayer) {
        (child as SVGElement).style.setProperty('display', 'none', 'important');
      }
    });
    Array.from(spriteLayer.children).forEach(child => {
      if (child !== owner) (child as SVGElement).style.setProperty('display', 'none', 'important');
    });
    for (const element of [document.documentElement, document.body, document.querySelector('main'),
      document.querySelector('.campaign-map-viewport'), document.querySelector('#campaignMapCanvas'), svg]) {
      if (element instanceof HTMLElement || element instanceof SVGElement) {
        element.style.setProperty('background', 'transparent', 'important');
        element.style.setProperty('box-shadow', 'none', 'important');
        element.style.setProperty('border-color', 'transparent', 'important');
      }
    }
    const box = image.getBoundingClientRect();
    const left = Math.max(0, Math.floor(box.left - 3));
    const top = Math.max(0, Math.floor(box.top - 3));
    const right = Math.min(innerWidth, Math.ceil(box.right + 3));
    const bottom = Math.min(innerHeight, Math.ceil(box.bottom + 3));
    return {
      clip: { x: left, y: top, width: right - left, height: bottom - top },
      polygon: polygon.map(point => ({ x: point.x - left, y: point.y - top }))
    };
  });
  const screenshot = await page.screenshot({ clip: isolation.clip, omitBackground: true, scale: 'css' });
  await info.attach('hex-art-effective-alpha-clip.png', { body: screenshot, contentType: 'image/png' });
  const pixels = await page.evaluate(async ({ dataUrl, polygon }) => {
    const source = new Image();
    source.src = dataUrl;
    await source.decode();
    const canvas = document.createElement('canvas');
    canvas.width = source.naturalWidth;
    canvas.height = source.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(source, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const inside = (x: number, y: number): boolean => {
      let contained = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i]!; const b = polygon[j]!;
        if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) contained = !contained;
      }
      return contained;
    };
    const distanceToEdge = (x: number, y: number): number => Math.min(...polygon.map((start, index) => {
      const end = polygon[(index + 1) % polygon.length]!;
      const dx = end.x - start.x; const dy = end.y - start.y;
      const t = Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(x - (start.x + t * dx), y - (start.y + t * dy));
    }));
    let painted = 0;
    let outside = 0;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const alpha = data[(y * canvas.width + x) * 4 + 3]!;
        if (alpha < 8) continue;
        painted += 1;
        if (!inside(x + 0.5, y + 0.5) && distanceToEdge(x + 0.5, y + 0.5) > 1.5) outside += 1;
      }
    }
    return { painted, outside };
  }, { dataUrl: `data:image/png;base64,${screenshot.toString('base64')}`, polygon: isolation.polygon });
  expect(pixels.painted, 'Isolated shipped raster must produce visible pixels').toBeGreaterThan(100);
  expect(pixels.outside, 'No nontransparent shipped-raster pixels may escape the effective cell clip').toBe(0);
}

async function assertContainedTargets(page: Page): Promise<void> {
  const failures = await page.locator('.campaign-known-site, .campaign-intel-contact').evaluateAll(markers => {
    const failures: string[] = [];
    const paintedHexPoints = (image: SVGGraphicsElement): DOMPoint[] => {
      const x = Number(image.getAttribute('x')); const y = Number(image.getAttribute('y'));
      const width = Number(image.getAttribute('width')); const height = Number(image.getAttribute('height'));
      const cx = x + width / 2;
      const halfPaintedWidth = width * Math.sqrt(3) / 4;
      const matrix = image.getScreenCTM()!;
      return [
        new DOMPoint(cx, y),
        new DOMPoint(cx + halfPaintedWidth, y + height / 4),
        new DOMPoint(cx + halfPaintedWidth, y + height * 3 / 4),
        new DOMPoint(cx, y + height),
        new DOMPoint(cx - halfPaintedWidth, y + height * 3 / 4),
        new DOMPoint(cx - halfPaintedWidth, y + height / 4)
      ].map(point => point.matrixTransform(matrix));
    };
    for (const marker of markers) {
      if (getComputedStyle(marker.parentElement!).display === 'none') continue;
      const hex = document.querySelector<SVGPolygonElement>(`.campaign-hex[data-hex="${marker.getAttribute('data-hex')}"] polygon`)!;
      const matrix = hex.getScreenCTM()!.inverse();
      for (const node of marker.querySelectorAll<SVGGraphicsElement>('image, .campaign-known-site__hit-target, circle:not(.campaign-intel-uncertainty):not(.campaign-known-site__focus-ring)')) {
        const box = node.getBoundingClientRect();
        // Every corner of a square icon must fit; circular targets are sampled on their circumference.
        const points = node.classList.contains('campaign-map-hex-art')
          ? paintedHexPoints(node)
          : node.tagName === 'circle'
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
    const paintedHexPoints = (image: SVGGraphicsElement): Array<{ x: number; y: number }> => {
      const x = Number(image.getAttribute('x')); const y = Number(image.getAttribute('y'));
      const width = Number(image.getAttribute('width')); const height = Number(image.getAttribute('height'));
      const cx = x + width / 2; const halfPaintedWidth = width * Math.sqrt(3) / 4;
      const matrix = image.getScreenCTM()!;
      return [
        new DOMPoint(cx, y),
        new DOMPoint(cx + halfPaintedWidth, y + height / 4),
        new DOMPoint(cx + halfPaintedWidth, y + height * 3 / 4),
        new DOMPoint(cx, y + height),
        new DOMPoint(cx - halfPaintedWidth, y + height * 3 / 4),
        new DOMPoint(cx - halfPaintedWidth, y + height / 4)
      ].map(point => point.matrixTransform(matrix)).map(point => ({ x: point.x, y: point.y }));
    };
    type MarkerShape = { box: DOMRect; polygon?: Array<{ x: number; y: number }> };
    const markerShapes: MarkerShape[] = Array.from(svg.querySelectorAll<SVGGraphicsElement>(
      '#campaign-map-sprites image, .campaign-base-marker__sprite, .campaign-force-stack__footprint, .campaign-known-site__sprite, .campaign-intel-contact circle:not(.campaign-intel-uncertainty)'
    )).filter(visible).map(marker => ({
      box: marker.getBoundingClientRect(),
      polygon: marker.classList.contains('campaign-map-hex-art') ? paintedHexPoints(marker) : undefined
    }));
    const viewportElement = document.querySelector<HTMLElement>('.campaign-map-viewport')!;
    const clippingFrame = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    for (let parent: Element | null = viewportElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (!/(auto|hidden|scroll|clip)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)) continue;
      const frame = parent.getBoundingClientRect();
      clippingFrame.left = Math.max(clippingFrame.left, frame.left);
      clippingFrame.top = Math.max(clippingFrame.top, frame.top);
      clippingFrame.right = Math.min(clippingFrame.right, frame.right);
      clippingFrame.bottom = Math.min(clippingFrame.bottom, frame.bottom);
    }
    const paintedLabelBox = (label: SVGTextElement) => {
      const box = label.getBoundingClientRect();
      const matrix = label.getScreenCTM();
      const scale = matrix ? Math.hypot(matrix.a, matrix.b) : 1;
      const strokeWidth = Number.parseFloat(getComputedStyle(label).strokeWidth);
      const padding = Number.isFinite(strokeWidth) ? strokeWidth * scale / 2 : 0;
      return {
        left: box.left - padding, right: box.right + padding,
        top: box.top - padding, bottom: box.bottom + padding
      };
    };
    const visibleLabelBoxes = labels.filter(visible).map(label => ({ label: label.textContent?.trim() ?? '', box: paintedLabelBox(label) }));
    const leaderGaps = visibleLabelBoxes.flatMap(({ label, box }) => {
      const text = labels.find(candidate => candidate.textContent?.trim() === label);
      const labelId = text?.closest<SVGGElement>('.campaign-map-location-label')?.dataset.locationLabelId;
      const leader = labelId
        ? svg.querySelector<SVGLineElement>(`.campaign-map-location-label__leader[data-location-label-id="${labelId}"]`)
        : null;
      const matrix = leader?.getScreenCTM();
      if (!leader || !matrix) return [`${label}:missing`];
      const x2 = Number(leader.getAttribute('x2')); const y2 = Number(leader.getAttribute('y2'));
      const endpoint = new DOMPoint(x2, y2).matrixTransform(matrix);
      const dx = Math.max(box.left - endpoint.x, 0, endpoint.x - box.right);
      const dy = Math.max(box.top - endpoint.y, 0, endpoint.y - box.bottom);
      const gap = Math.hypot(dx, dy);
      return gap <= 1 ? [] : [`${label}:${gap.toFixed(1)}`];
    });
    const labelDiagnostics = labels.map(label => {
      const owner = label.closest<SVGGElement>('.campaign-map-location-label');
      return {
        label: label.textContent?.trim() ?? '',
        hex: owner?.dataset.hex,
        viewportVisibility: owner?.dataset.viewportVisibility,
        box: paintedLabelBox(label),
        visible: visible(label)
      };
    });
    const clippedLabels = visibleLabelBoxes.filter(({ box }) => (
      box.left < clippingFrame.left - 0.5 || box.right > clippingFrame.right + 0.5
      || box.top < clippingFrame.top - 0.5 || box.bottom > clippingFrame.bottom + 0.5
    )).map(({ label }) => label);
    const polygonsIntersect = (a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>): boolean => {
      for (const polygon of [a, b]) {
        for (let index = 0; index < polygon.length; index += 1) {
          const start = polygon[index]!; const end = polygon[(index + 1) % polygon.length]!;
          const length = Math.hypot(end.y - start.y, end.x - start.x);
          const axis = { x: -(end.y - start.y) / length, y: (end.x - start.x) / length };
          const project = (points: Array<{ x: number; y: number }>) => points.map(point => point.x * axis.x + point.y * axis.y);
          const projectedA = project(a); const projectedB = project(b);
          if (Math.max(...projectedA) <= Math.min(...projectedB) + 0.5
            || Math.max(...projectedB) <= Math.min(...projectedA) + 0.5) return false;
        }
      }
      return true;
    };
    const intersections = visibleLabelBoxes.flatMap(entry => markerShapes.flatMap((marker, index) => {
      const labelPolygon = [
        { x: entry.box.left, y: entry.box.top }, { x: entry.box.right, y: entry.box.top },
        { x: entry.box.right, y: entry.box.bottom }, { x: entry.box.left, y: entry.box.bottom }
      ];
      if (marker.polygon) return polygonsIntersect(labelPolygon, marker.polygon) ? [`${entry.label}:marker-${index}`] : [];
      const area = Math.max(0, Math.min(entry.box.right, marker.box.right) - Math.max(entry.box.left, marker.box.left))
        * Math.max(0, Math.min(entry.box.bottom, marker.box.bottom) - Math.max(entry.box.top, marker.box.top));
      return area > 0.5 ? [`${entry.label}:marker-${index}:${area.toFixed(1)}`] : [];
    }));
    const labelIntersections = visibleLabelBoxes.flatMap((entry, index) => visibleLabelBoxes.slice(index + 1).flatMap(other => {
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
      visibleLabels: visibleLabelBoxes.length,
      leaderGaps,
      labelDiagnostics,
      intersections,
      labelIntersections,
      clippedLabels,
      leaders: svg.querySelectorAll('#campaign-map-location-leaders .campaign-map-location-label__leader').length,
      leaderIndex,
      labelIndex,
      earliestMarker: Math.min(...markerIndexes),
      latestMarker: Math.max(...markerIndexes)
    };
  });
  expect(result.rendered, 'Every player-safe authored location remains in the DOM').toEqual(result.expected);
  expect(
    result.visibleLabels,
    'Viewport fitting must retain readable location context: ' + JSON.stringify(result.labelDiagnostics)
  ).toBeGreaterThan(0);
  expect(result.intersections, 'No location name intersects a visible Operational or Intelligence marker').toEqual([]);
  expect(result.labelIntersections, 'Location names do not cover one another').toEqual([]);
  expect(result.clippedLabels, 'Every painted location name is fully readable inside the clipping viewport').toEqual([]);
  expect(result.leaderGaps, 'Every visible leader reaches the painted label boundary').toEqual([]);
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

test('FSG_CAM_107 hex artwork aligns to flat-top cells and follows map zoom', async ({ page }, info) => {
  await mount(page, 1);
  await evidence(page, info, 'grid-registered-opening');
  const geometry = await page.locator('#campaignHexMap').evaluate(async svg => {
    const runtime = window as unknown as MapFixture;
    const tile = svg.querySelector<SVGImageElement>('#campaign-map-sprites .campaign-map-tile-symbol[data-hex="28,23"]')!;
    const tileHex = svg.querySelector<SVGPolygonElement>('.campaign-hex[data-hex="28,23"] polygon')!;
    const base = svg.querySelector<SVGImageElement>('.campaign-base-marker__sprite')!;
    const baseMarker = base.closest<SVGGElement>('.campaign-base-marker')!;
    const boundedTile = svg.querySelector<SVGImageElement>('#campaign-map-sprites .campaign-map-tile-symbol[data-symbol-treatment="bounded-icon"]')!;
    const baseHex = svg.querySelector<SVGPolygonElement>(`.campaign-hex[data-hex="${baseMarker.dataset.hex}"] polygon`)!;
    const selection = baseMarker.querySelector<SVGPolygonElement>('.campaign-map-selection-locator')!;
    const center = runtime.renderer.getHexCenter('28,23')!;
    const registrationFailures = Array.from(svg.querySelectorAll<SVGImageElement>('.campaign-map-hex-art')).flatMap(image => {
      if (!image.getAttribute('transform')?.startsWith('rotate(30 ')) return [`${image.getAttribute('class')}:rotation`];
      const frame = image.closest<SVGGElement>('.campaign-map-hex-art-frame');
      const clipReference = frame?.getAttribute('clip-path')?.match(/^url\(#(.+)\)$/)?.[1];
      const clipPath = clipReference ? svg.querySelector<SVGClipPathElement>(`#${clipReference}`) : null;
      const clip = clipPath?.querySelector<SVGPolygonElement>('polygon') ?? null;
      const hexKey = frame?.dataset.hex;
      const cell = hexKey ? svg.querySelector<SVGPolygonElement>(`.campaign-hex[data-hex="${hexKey}"] polygon`) : null;
      return frame && clipPath?.getAttribute('clipPathUnits') === 'userSpaceOnUse'
        && getComputedStyle(frame).clipPath !== 'none'
        && clip && cell && clip.getAttribute('points') === cell.getAttribute('points')
        ? []
        : [`${image.getAttribute('class')}:clip`];
    });
    const read = () => {
      const tileBox = tile.getBoundingClientRect();
      const tileHexBox = tileHex.getBoundingClientRect();
      const baseBox = base.getBoundingClientRect();
      const baseHexBox = baseHex.getBoundingClientRect();
      const boundedBox = boundedTile.getBoundingClientRect();
      return {
        tileRatio: tileBox.width / tileHexBox.width,
        baseRatio: baseBox.width / baseHexBox.width,
        boundedWidth: boundedBox.width,
        centerDelta: Math.hypot(
          tileBox.left + tileBox.width / 2 - (tileHexBox.left + tileHexBox.width / 2),
          tileBox.top + tileBox.height / 2 - (tileHexBox.top + tileHexBox.height / 2)
        )
      };
    };
    const opening = read();
    runtime.camera.setTransform(3.48, 610 - center.cx * 3.48, 150 - center.cy * 3.48);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const detail = read();
    runtime.camera.setTransform(7.5, 610 - center.cx * 7.5, 150 - center.cy * 7.5);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const maximum = read();
    return {
      opening,
      detail,
      maximum,
      tileWidth: Number(tile.getAttribute('width')),
      cellWidth: tileHex.getBBox().width,
      tileTransform: tile.getAttribute('transform'),
      tileTreatment: tile.dataset.symbolTreatment,
      tileParentTransform: getComputedStyle(tile.parentElement!).transform,
      baseTransform: base.getAttribute('transform'),
      baseInlineTransform: base.style.transform,
      registrationFailures,
      selectionPoints: selection.getAttribute('points'),
      baseHexPoints: baseHex.getAttribute('points')
    };
  });
  expect(geometry.tileTreatment).toBe('grid-registered-hex');
  expect(geometry.tileTransform).toMatch(/^rotate\(30 /);
  expect(geometry.baseTransform).toMatch(/^rotate\(30 /);
  expect(geometry.tileParentTransform).toBe('none');
  expect(geometry.baseInlineTransform).toBe('');
  expect(geometry.registrationFailures, 'Every hex raster keeps one flat-top rotation and an exact cell clip').toEqual([]);
  expect(geometry.tileWidth).toBeCloseTo(geometry.cellWidth, 4);
  expect(geometry.selectionPoints).toBe(geometry.baseHexPoints);
  expect(geometry.opening.centerDelta).toBeLessThan(0.5);
  expect(geometry.detail.centerDelta).toBeLessThan(0.5);
  expect(geometry.maximum.centerDelta).toBeLessThan(0.5);
  expect(geometry.detail.tileRatio).toBeCloseTo(geometry.opening.tileRatio, 4);
  expect(geometry.maximum.tileRatio).toBeCloseTo(geometry.opening.tileRatio, 4);
  expect(geometry.detail.baseRatio).toBeCloseTo(geometry.opening.baseRatio, 4);
  expect(geometry.maximum.baseRatio).toBeCloseTo(geometry.opening.baseRatio, 4);
  expect(geometry.detail.boundedWidth).toBeCloseTo(geometry.opening.boundedWidth * 2.9, 3);
  expect(geometry.maximum.boundedWidth).toBeCloseTo(geometry.detail.boundedWidth, 3);
  await evidence(page, info, 'grid-registered-hex-art');
  await assertHexRasterPaintClipped(page, info);
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
  await assertCompleteCollisionFreeLabels(page);
  await evidence(page, info, 'scroll-resize-label-fit');
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
    expect(rotation.parent, 'Grid-registered hex art inherits only the map transform').toBe('none');
    await evidence(page, info, 'intelligence');
    expect(await page.evaluate(() => JSON.stringify((window as unknown as MapFixture).view) === (window as unknown as MapFixture).originalView)).toBe(true);
  });
}
