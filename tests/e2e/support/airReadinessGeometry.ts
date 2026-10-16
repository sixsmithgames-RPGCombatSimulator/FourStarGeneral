import { expect, type Page } from '@playwright/test';

/** Browser client-space rectangles are copied so reports stay serializable. */
interface ReadinessRect { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }

/** A text/control fragment and every clip that can hide it. */
interface ReadinessItem {
  readonly selector: string;
  readonly text: string;
  readonly bounds: ReadinessRect;
  readonly frame: ReadinessRect;
  readonly textRects: readonly ReadinessRect[];
  readonly outsideFrame: boolean;
  readonly hidden: boolean;
  readonly ownHorizontalClipping: boolean;
  readonly promptOverlap: boolean;
}

/** Source-layout observations saved before each positive assertion. */
interface AirReadinessGeometry {
  readonly dialog: ReadinessItem;
  readonly close: ReadinessItem;
  readonly closeHitAtCenter: boolean;
  readonly gridColumns: string;
  readonly boardMinimum: string;
  readonly board: ReadinessRect;
  readonly briefing: ReadinessRect;
  readonly copy: ReadinessRect | null;
  readonly copyContained: boolean;
  readonly label: string | undefined;
  readonly chipLabels: readonly (string | undefined)[];
  readonly chipValues: readonly (string | undefined)[];
  readonly items: readonly ReadinessItem[];
}

/** Inspect readiness contents, not only the enclosing spotlight or board. */
export async function readAirReadinessGeometry(page: Page): Promise<AirReadinessGeometry> {
  return page.locator('.battle-popup[data-popup-key="airSupport"] .air-readiness-board').evaluate(board => {
    const briefing = board.closest('.air-briefing');
    if (!(briefing instanceof HTMLElement)) throw new Error('Air briefing is missing.');
    const dialog = board.closest<HTMLElement>('.battle-popup');
    const close = dialog?.querySelector<HTMLElement>('#battlePopupClose');
    if (!dialog || !close) throw new Error('Air popup or Close control is missing.');
    const box = (rect: DOMRect) => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
    const selectors = ['.air-readiness-board__label', '.air-summary', '.air-chip', '.air-chip strong', '.air-chip span'];
    const prompt = document.querySelector('.tutorial-panel');
    const promptRect = prompt && getComputedStyle(prompt).visibility !== 'hidden' && prompt.getClientRects().length
      ? prompt.getBoundingClientRect() : null;
    const inspect = (element: HTMLElement, includeOwnClip = true): ReadinessItem => {
      const frame = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
      // Text respects its own overflow; the dialog's outer border is clipped only by ancestors.
      for (let ancestor: HTMLElement | null = includeOwnClip ? element : element.parentElement;
        ancestor; ancestor = ancestor.parentElement) {
        const css = getComputedStyle(ancestor);
        const rect = ancestor.getBoundingClientRect();
        const left = rect.left + ancestor.clientLeft;
        const top = rect.top + ancestor.clientTop;
        if (/^(auto|scroll|hidden|clip)$/.test(css.overflowX)) {
          frame.left = Math.max(frame.left, left);
          frame.right = Math.min(frame.right, left + ancestor.clientWidth);
        }
        if (/^(auto|scroll|hidden|clip)$/.test(css.overflowY)) {
          frame.top = Math.max(frame.top, top);
          frame.bottom = Math.min(frame.bottom, top + ancestor.clientHeight);
        }
      }
      const bounds = box(element.getBoundingClientRect());
      const leaf = element.matches('.air-readiness-board__label, strong, span');
      const range = document.createRange();
      range.selectNodeContents(element);
      const textRects = leaf ? Array.from(range.getClientRects()).map(box) : [];
      const observed = [bounds, ...textRects];
      const css = getComputedStyle(element);
      return {
        selector: element.className || element.tagName.toLowerCase(), text: element.innerText.trim(),
        bounds, frame, textRects,
        outsideFrame: observed.some(rect => rect.left < frame.left - 1 || rect.right > frame.right + 1 ||
          rect.top < frame.top - 1 || rect.bottom > frame.bottom + 1),
        hidden: bounds.right <= bounds.left || bounds.bottom <= bounds.top ||
          css.visibility === 'hidden' || css.display === 'none' || css.opacity === '0',
        ownHorizontalClipping: /^(auto|scroll|hidden|clip)$/.test(css.overflowX) &&
          element.scrollWidth > element.clientWidth + 1,
        promptOverlap: Boolean(promptRect && observed.some(rect => rect.left < promptRect.right - 1 &&
          rect.right > promptRect.left + 1 && rect.top < promptRect.bottom - 1 && rect.bottom > promptRect.top + 1))
      };
    };
    const items = Array.from(board.querySelectorAll<HTMLElement>(selectors.join(','))).map(element => inspect(element));
    const closeBounds = close.getBoundingClientRect();
    const closeHit = document.elementFromPoint(
      (closeBounds.left + closeBounds.right) / 2, (closeBounds.top + closeBounds.bottom) / 2
    );
    const briefingBox = briefing.getBoundingClientRect();
    const copy = briefing.querySelector<HTMLElement>('.air-briefing__copy');
    const copyBox = copy?.getBoundingClientRect();
    return {
      dialog: inspect(dialog, false), close: inspect(close), closeHitAtCenter: closeHit !== null && close.contains(closeHit),
      gridColumns: getComputedStyle(briefing).gridTemplateColumns,
      boardMinimum: getComputedStyle(board).minWidth, board: box(board.getBoundingClientRect()),
      briefing: box(briefingBox), copy: copyBox ? box(copyBox) : null,
      copyContained: Boolean(copyBox && copyBox.left >= briefingBox.left - 1 &&
        copyBox.right <= briefingBox.right + 1 && copyBox.top >= briefingBox.top - 1 && copyBox.bottom <= briefingBox.bottom + 1),
      label: board.querySelector('.air-readiness-board__label')?.textContent?.trim(),
      chipLabels: Array.from(board.querySelectorAll('.air-chip span')).map(element => element.textContent?.trim()),
      chipValues: Array.from(board.querySelectorAll('.air-chip strong')).map(element => element.textContent?.trim()),
      items
    };
  });
}

/** Enforce full content visibility at the measurement boundary, using existing 1px rounding. */
export async function expectAirReadinessVisible(page: Page): Promise<void> {
  const report = await readAirReadinessGeometry(page);
  expect(report.dialog, 'Air popup must fit its visible frame: ' + JSON.stringify(report.dialog))
    .toMatchObject({ outsideFrame: false, hidden: false, ownHorizontalClipping: false });
  expect(report.close, 'Air popup Close must fit its visible frame: ' + JSON.stringify(report.close))
    .toMatchObject({ outsideFrame: false, hidden: false, ownHorizontalClipping: false, promptOverlap: false });
  expect(report.closeHitAtCenter, 'Air popup Close must receive input at its visible center').toBe(true);
  expect(report.label).toBe('Readiness Board');
  expect(report.chipLabels).toEqual(['On Deck', 'In Flight', 'Refit']);
  expect(report.chipValues).toHaveLength(3);
  expect(report.chipValues.every(value => /^\d+$/.test(value ?? ''))).toBe(true);
  expect(report.copyContained, 'Air briefing copy remains in its authored panel').toBe(true);
  expect(report.items.length).toBe(11);
  for (const item of report.items) {
    expect(item, 'Air readiness content must remain visible: ' + JSON.stringify(item))
      .toMatchObject({ outsideFrame: false, hidden: false, ownHorizontalClipping: false, promptOverlap: false });
  }
}
