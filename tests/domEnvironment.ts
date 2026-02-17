/**
 * Establishes a shared jsdom-backed DOM so screen-level tests can instantiate UI classes
 * without depending on a real browser. The helper sets globals once and reuses them for
 * subsequent imports to keep test execution deterministic.
 */
import { JSDOM } from "jsdom";

let domInitialized = false;

/**
 * Ensures the jsdom window and document are available on the global scope.
 */
export function ensureDomEnvironment(): void {
  if (domInitialized) {
    return;
  }

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/"
  });
  const jsdomWindow = dom.window as unknown as Window & typeof globalThis;

  const requestAnimationFrameImpl =
    jsdomWindow.requestAnimationFrame ??
    ((callback: FrameRequestCallback) => globalThis.setTimeout(() => callback(Date.now()), 16));
  const cancelAnimationFrameImpl =
    jsdomWindow.cancelAnimationFrame ??
    ((handle: number) => {
      globalThis.clearTimeout(handle);
    });

  if (typeof jsdomWindow.requestAnimationFrame !== "function") {
    jsdomWindow.requestAnimationFrame = requestAnimationFrameImpl;
  }
  if (typeof jsdomWindow.cancelAnimationFrame !== "function") {
    jsdomWindow.cancelAnimationFrame = cancelAnimationFrameImpl;
  }

  const WheelEventImpl: typeof WheelEvent = jsdomWindow.WheelEvent ?? ((function WheelEvent(
    this: unknown,
    type: string,
    eventInitDict: WheelEventInit = {}
  ): WheelEvent {
    const event = new jsdomWindow.Event(type, {
      bubbles: eventInitDict.bubbles ?? false,
      cancelable: eventInitDict.cancelable ?? false,
      composed: eventInitDict.composed ?? false
    }) as unknown as WheelEvent;

    Object.defineProperty(event, "deltaX", { configurable: true, value: eventInitDict.deltaX ?? 0 });
    Object.defineProperty(event, "deltaY", { configurable: true, value: eventInitDict.deltaY ?? 0 });
    Object.defineProperty(event, "deltaZ", { configurable: true, value: eventInitDict.deltaZ ?? 0 });
    Object.defineProperty(event, "deltaMode", { configurable: true, value: eventInitDict.deltaMode ?? 0 });

    return event;
  }) as unknown) as typeof WheelEvent;

  if (!("DOM_DELTA_PIXEL" in WheelEventImpl)) {
    (WheelEventImpl as unknown as Record<string, unknown>).DOM_DELTA_PIXEL = 0;
  }
  if (!("DOM_DELTA_LINE" in WheelEventImpl)) {
    (WheelEventImpl as unknown as Record<string, unknown>).DOM_DELTA_LINE = 1;
  }
  if (!("DOM_DELTA_PAGE" in WheelEventImpl)) {
    (WheelEventImpl as unknown as Record<string, unknown>).DOM_DELTA_PAGE = 2;
  }

  Object.assign(globalThis, {
    window: jsdomWindow,
    document: jsdomWindow.document,
    Node: jsdomWindow.Node,
    Event: jsdomWindow.Event,
    MouseEvent: jsdomWindow.MouseEvent,
    WheelEvent: WheelEventImpl,
    HTMLElement: jsdomWindow.HTMLElement,
    SVGElement: jsdomWindow.SVGElement,
    getComputedStyle: jsdomWindow.getComputedStyle.bind(jsdomWindow),
    requestAnimationFrame: requestAnimationFrameImpl,
    cancelAnimationFrame: cancelAnimationFrameImpl
  });

  domInitialized = true;
}

// Initialize immediately so tests only need to import this module once.
ensureDomEnvironment();
