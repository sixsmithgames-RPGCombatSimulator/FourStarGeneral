/** Shipped CSS must preserve target meaning when the user's motion preference disables pulses. */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const document = new JSDOM(readFileSync(resolve('index.html'), 'utf8')).window.document;
const styles = Array.from(document.querySelectorAll('style')).map(style => style.outerHTML).join('\n');
const targets = [
  { className: 'move-option-highlight', stroke: 'rgb(95, 166, 91)', animation: 'move-option-pulse', dash: '4px, 3px' },
  { className: 'attack-target-highlight', stroke: 'rgb(255, 68, 68)', animation: 'attack-target-pulse', dash: '4px, 3px' },
  { className: 'deployment-zone', stroke: 'rgba(246, 207, 122, 0.96)', animation: 'deployment-zone-pulse', dash: '8px, 5px' }
];

async function mountHighlight(page: Page, className: string): Promise<void> {
  await page.route('**/*', route => route.abort());
  await page.setContent(`<!doctype html><html><head>${styles}</head><body>
    <svg width="320" height="160" viewBox="0 0 320 160" aria-label="Legal target outlines">
      <g class="hex-cell"><polygon id="direct" class="hex-tile ${className}" points="20,40 60,20 100,40 100,90 60,110 20,90" fill="#567642" stroke="#2a2a2a" stroke-width="1"/></g>
      <g class="hex-cell ${className}"><polygon id="grouped" class="hex-tile" points="170,40 210,20 250,40 250,90 210,110 170,90" fill="#567642" stroke="#2a2a2a" stroke-width="1"/></g>
    </svg></body></html>`);
}

async function expectSemanticStroke(page: Page, stroke: string): Promise<void> {
  for (const id of ['direct', 'grouped']) {
    await expect(page.locator(`#${id}`), `${id} target keeps its semantic color without animation`).toHaveCSS('stroke', stroke);
  }
}

for (const target of targets) {
  test(`FSG_VIS_091 ${target.className} remains meaningful with reduced motion`, async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await mountHighlight(page, target.className);
    for (const id of ['direct', 'grouped']) await expect(page.locator(`#${id}`)).toHaveCSS('animation-name', target.animation);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.screenshot({ path: info.outputPath('reduced-motion-targets.png'), scale: 'css' });
    await expectSemanticStroke(page, target.stroke);
    for (const id of ['direct', 'grouped']) {
      const polygon = page.locator(`#${id}`);
      await expect(polygon).toHaveCSS('animation-name', 'none');
      await expect(polygon).toHaveCSS('stroke-dasharray', target.dash);
      await expect(polygon).toHaveCSS('fill', 'rgb(86, 118, 66)');
    }
    await page.locator(`.${target.className}`).evaluateAll((elements, className) => {
      for (const element of elements) element.classList.remove(className);
    }, target.className);
    await expectSemanticStroke(page, 'rgb(42, 42, 42)');
    for (const id of ['direct', 'grouped']) await expect(page.locator(`#${id}`)).toHaveCSS('animation-name', 'none');
  });
}

test('FSG_VIS_091 detects the former reduced-motion terrain-stroke fallback', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mountHighlight(page, 'attack-target-highlight');
  // Reproduce the previous computed result without changing production styles or tolerances.
  await page.addStyleTag({ content: '.hex-tile { stroke: #2a2a2a !important; }' });
  await expect(expectSemanticStroke(page, 'rgb(255, 68, 68)')).rejects.toThrow(/semantic color/);
});
