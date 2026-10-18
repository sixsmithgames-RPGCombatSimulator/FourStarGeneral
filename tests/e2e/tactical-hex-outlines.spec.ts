/** Exercise shipped hex geometry and paint over real terrain, including overlapping tactical states. */
import { expect, test, type Page, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { buildSync } from 'esbuild';

const source: Document = new JSDOM(readFileSync(resolve('index.html'), 'utf8')).window.document;
const styles: string = Array.from(source.querySelectorAll('style')).map((style: HTMLStyleElement): string => style.outerHTML).join('\n');
const component: string = buildSync({
  stdin: { contents: 'export { buildHexTileMarkup } from "./HexMapMarkupBuilder"; export { buildHexOutlineLayerMarkup } from "./HexOutlinePresentation"; export { buildHexMapLayout } from "./HexMapLayout";', loader: 'ts', resolveDir: resolve('src/rendering') },
  bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'hexOutlineFixture'
}).outputFiles[0].text;

async function mountMap(page: Page): Promise<void> {
  // Image data is fixture transport for shipped local art; the product uses its ordinary asset URLs.
  const terrainFiles: string[] = ['Terrain_Grass_1.png', 'Terrain_Forest_1.png', 'Terrain_Mountain_1.png'];
  const textures: string[] = terrainFiles.map((name: string): string => `data:image/png;base64,${readFileSync(resolve('src/assets/terrain', name)).toString('base64')}`);
  await page.setContent(`<!doctype html><html><head>${styles}</head><body style="margin:0;background:#121a17"><svg id="outlineMap" width="860" height="460" style="display:block" aria-label="Tactical hex outline fixture"></svg></body></html>`);
  await page.addScriptTag({ content: component });
  await page.evaluate((textures: string[]) => {
    // This small presentation fixture intentionally supplies no engine, commands, hidden contacts, or saved game.
    const fixture = (window as unknown as { hexOutlineFixture: {
      buildHexMapLayout(data: unknown, margin: number): { hexes: Array<{ col: number; row: number }>; minX: number; minY: number; width: number; height: number; margin: number };
      buildHexTileMarkup(hex: unknown, x: number, y: number, margin: number, data: unknown, services: unknown): string;
      buildHexOutlineLayerMarkup(hexes: unknown[], x: number, y: number, margin: number): string;
    } }).hexOutlineFixture;
    const data = { name: 'Outline paint', size: { cols: 9, rows: 5 }, tilePalette: {
      PLAINS: { terrain: 'plains', terrainType: 'grass', features: [], density: 'average', recon: 'intel' }
    }, tiles: Array.from({ length: 5 }, () => Array.from({ length: 9 }, () => ({ tile: 'PLAINS' }))) };
    const layout = fixture.buildHexMapLayout(data, 54);
    const services = { terrainRenderer: {
      getTerrainFill: () => '#8c9558', generateHexTooltip: () => 'Textured terrain',
      getTerrainSprite: (_tile: unknown, col: number) => textures[col < 4 ? 0 : col < 7 ? 1 : 2], getBeachWaterSprite: () => textures[0]
    }, roadRenderer: { drawRoadOverlay: () => '' }, riverRenderer: { drawRiverOverlay: () => '' } };
    const svg: SVGSVGElement = document.querySelector('#outlineMap')!;
    svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    svg.innerHTML = `<g id="viewportRoot">${layout.hexes.map(hex => fixture.buildHexTileMarkup(hex, layout.minX, layout.minY, layout.margin, data, services)).join('')}${fixture.buildHexOutlineLayerMarkup(layout.hexes, layout.minX, layout.minY, layout.margin)}<g class="combat-effects-layer"></g></g>`;
    const highlight = (key: string, ...classes: string[]): void => {
      svg.querySelector(`[data-hex="${key}"]`)?.classList.add(...classes);
      svg.querySelector(`[data-outline-hex="${key}"]`)?.classList.add(...classes);
    };
    for (const key of ['1,1', '2,1', '3,1', '1,2', '2,2', '3,2', '1,3', '2,3', '3,3']) highlight(key, 'move-option-highlight');
    highlight('2,2', 'is-selected');
    highlight('4,1', 'attack-target-highlight'); highlight('4,2', 'move-option-highlight', 'attack-target-highlight');
    highlight('5,3', 'idle-unit-highlight'); highlight('6,3', 'initiative-group-highlight'); highlight('7,2', 'deployment-zone');
    svg.addEventListener('click', (event: MouseEvent): void => {
      const cell: Element | null = (event.target as Element).closest('.hex-cell');
      if (cell) svg.setAttribute('data-clicked-hex', cell.getAttribute('data-hex')!);
    });
  }, textures);
  await page.evaluate(async () => {
    await Promise.all(Array.from(document.querySelectorAll<SVGImageElement>('svg image')).map((image: SVGImageElement): Promise<void> => new Promise((done): void => {
      const probe: HTMLImageElement = new Image(); probe.onload = () => done(); probe.onerror = () => done(); probe.src = image.getAttribute('href')!;
    })));
  });
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`tactical borders stay distinct above terrain with ${reducedMotion} motion`, async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion });
    await mountMap(page);
    const move: Locator = page.locator('[data-outline-hex="1,2"] .hex-outline-core');
    const attack: Locator = page.locator('[data-outline-hex="4,2"] .hex-outline-core');
    const selected: Locator = page.locator('[data-outline-hex="2,2"] .hex-outline-core');
    await expect(move).toHaveCSS('stroke', 'rgb(155, 214, 168)');
    await expect(move).toHaveCSS('stroke-dasharray', '8px, 5px');
    await expect(attack).toHaveCSS('stroke', 'rgb(255, 107, 102)');
    await expect(attack).toHaveCSS('stroke-dasharray', 'none');
    await page.locator('[data-outline-hex="4,2"]').evaluate(node => node.classList.add('deployment-zone'));
    await expect(attack, 'Artillery and smoke order targets override ordinary attack eligibility').toHaveCSS('stroke', 'rgb(246, 207, 122)');
    await expect(attack).toHaveCSS('stroke-dasharray', '10px, 6px');
    await page.locator('[data-outline-hex="4,2"]').evaluate(node => node.classList.remove('deployment-zone'));
    await expect(attack).toHaveCSS('stroke', 'rgb(255, 107, 102)');
    await expect(selected).toHaveCSS('stroke', 'rgb(243, 207, 119)');
    await expect(selected).toHaveCSS('stroke-width', '1.8px');
    await expect(selected).toHaveCSS('stroke-dasharray', 'none');
    for (const polygon of [move, attack, selected]) {
      await expect(polygon).toHaveCSS('fill', 'none');
      await expect(polygon).toHaveCSS('animation-name', 'none');
      await expect(polygon).toHaveCSS('vector-effect', 'non-scaling-stroke');
      await expect(polygon).toHaveCSS('pointer-events', 'none');
    }
    await page.locator('[data-outline-hex="2,2"]').evaluate(node => node.classList.add('attack-target-highlight', 'initiative-group-highlight', 'deployment-zone'));
    await expect(selected).toHaveCSS('stroke', 'rgb(243, 207, 119)');
    await page.locator('[data-hex="2,2"] .hex-tile').click();
    await expect(page.locator('#outlineMap')).toHaveAttribute('data-clicked-hex', '2,2');
    for (const scale of [0.55, 1, 1.7]) {
      await page.locator('#viewportRoot').evaluate((node: SVGGElement, scale: number): void => node.setAttribute('transform', `translate(20 10) scale(${scale})`), scale);
      await expect(attack).toHaveCSS('stroke-width', '1.65px');
      await expect(move).toHaveCSS('stroke-width', '1.2px');
      await page.screenshot({ path: info.outputPath(`outlines-zoom-${scale}.png`), scale: 'css' });
    }
    await page.locator('#viewportRoot').evaluate((node: SVGGElement): void => node.removeAttribute('transform'));
    const beforeClear: Buffer = await page.locator('#outlineMap').screenshot();
    await page.locator('[data-outline-hex="1,2"]').evaluate(node => node.classList.remove('move-option-highlight'));
    // WebKit can retain an SVG child's bounding box under display:none; verify paint as well as CSS.
    await expect(page.locator('[data-outline-hex="1,2"]')).toHaveCSS('display', 'none');
    expect((await page.locator('#outlineMap').screenshot()).equals(beforeClear), 'Clearing a highlight removes its painted pixels').toBe(false);
  });
}
