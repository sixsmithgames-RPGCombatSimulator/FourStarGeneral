/**
 * Establishes a shared jsdom-backed DOM so screen-level tests can instantiate UI classes
 * without depending on a real browser. The helper sets globals once and reuses them for
 * subsequent imports to keep test execution deterministic.
 */
import { JSDOM } from "jsdom";

let domInitialized = false;

const MOCK_IMAGE_DIMENSIONS: ReadonlyArray<{ readonly match: RegExp; readonly width: number; readonly height: number }> = [
  { match: /muzzle_flash/i, width: 256, height: 64 },
  { match: /explosion|FSG_Explosion/i, width: 1536, height: 1024 },
  { match: /sparks|FSG_Sparks/i, width: 1536, height: 1024 },
  { match: /dust_cloud/i, width: 256, height: 64 },
  { match: /tracer/i, width: 256, height: 64 },
  { match: /Campaign Map -- Central Channel/i, width: 2048, height: 1024 }
];

/**
 * Ensures the jsdom window and document are available on the global scope.
 */
export function ensureDomEnvironment(): void {
  if (domInitialized) {
    return;
  }

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    resources: "usable"
  });
  const jsdomWindow = dom.window as unknown as Window & typeof globalThis;

  // Mock Image constructor for sprite sheet loading
  class MockImage extends EventTarget {
    onload: ((this: MockImage, ev: Event) => any) | null = null;
    onerror: ((this: MockImage, ev: Event) => any) | null = null;
    decoding: "async" | "auto" | "sync" = "auto";
    width: number = 0;
    height: number = 0;
    naturalWidth: number = 0;
    naturalHeight: number = 0;
    complete: boolean = false;
    private currentSrc: string = "";

    get src(): string {
      return this.currentSrc;
    }

    set src(value: string) {
      this.currentSrc = value;
      this.complete = false;
      this.width = 0;
      this.height = 0;
      this.naturalWidth = 0;
      this.naturalHeight = 0;

      setTimeout(() => {
        const matchedAsset = MOCK_IMAGE_DIMENSIONS.find(({ match }) => match.test(this.currentSrc));
        if (!matchedAsset) {
          const error = new Error(`[MockImage] No mocked dimensions are registered for asset: ${this.currentSrc}`);
          console.error(error.message);
          if (this.onerror) {
            this.onerror.call(this, new Event("error"));
          }
          return;
        }

        this.complete = true;
        this.width = this.naturalWidth = matchedAsset.width;
        this.height = this.naturalHeight = matchedAsset.height;
        console.log(`[MockImage] Loaded ${this.currentSrc} with dimensions ${this.naturalWidth}x${this.naturalHeight}`);
        if (this.onload) {
          this.onload.call(this, new Event("load"));
        }
      }, 0);
    }

    constructor() {
      super();
    }
  }

  jsdomWindow.Image = MockImage as any;

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
    cancelAnimationFrame: cancelAnimationFrameImpl,
    Image: MockImage
  });

  domInitialized = true;
}

// Initialize immediately so tests only need to import this module once.
ensureDomEnvironment();
