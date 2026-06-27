/**
 * Establishes a shared jsdom-backed DOM so screen-level tests can instantiate UI classes
 * without depending on a real browser. The helper sets globals once and reuses them for
 * subsequent imports to keep test execution deterministic.
 */
// Polyfill TextEncoder/TextDecoder for jsdom compatibility
import { TextEncoder, TextDecoder } from "util";
if (!globalThis.TextEncoder) {
    globalThis.TextEncoder = TextEncoder;
}
if (!globalThis.TextDecoder) {
    globalThis.TextDecoder = TextDecoder;
}
import { JSDOM } from "jsdom";
let domInitialized = false;
const hostSetTimeout = globalThis.setTimeout.bind(globalThis);
const hostClearTimeout = globalThis.clearTimeout.bind(globalThis);
const MOCK_IMAGE_DIMENSIONS = [
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
export function ensureDomEnvironment() {
    if (domInitialized) {
        return;
    }
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
        url: "http://localhost/",
        resources: "usable"
    });
    const jsdomWindow = dom.window;
    const canvasState = new WeakMap();
    const getCanvasState = (canvas) => {
        let state = canvasState.get(canvas);
        if (!state) {
            state = { lastDrawSignature: "" };
            canvasState.set(canvas, state);
        }
        return state;
    };
    const describeCanvasSource = (value) => {
        if (value instanceof jsdomWindow.HTMLCanvasElement) {
            return value.dataset.frameSource ?? `canvas:${value.width}x${value.height}`;
        }
        if (value && typeof value === "object") {
            const maybeImage = value;
            if (typeof maybeImage.currentSrc === "string" && maybeImage.currentSrc.length > 0) {
                return maybeImage.currentSrc;
            }
            if (typeof maybeImage.src === "string" && maybeImage.src.length > 0) {
                return maybeImage.src;
            }
            if (typeof maybeImage.width === "number" && typeof maybeImage.height === "number") {
                return `surface:${maybeImage.width}x${maybeImage.height}`;
            }
        }
        return String(value);
    };
    const createMockCanvasContext = (canvas) => {
        const state = getCanvasState(canvas);
        return {
            canvas,
            globalAlpha: 1,
            globalCompositeOperation: "source-over",
            imageSmoothingEnabled: true,
            setTransform: () => { },
            resetTransform: () => { },
            save: () => { },
            restore: () => { },
            translate: () => { },
            rotate: () => { },
            scale: () => { },
            clearRect: () => {
                state.lastDrawSignature = "";
            },
            getImageData: (_x, _y, width, height) => ({
                data: new Uint8ClampedArray(Math.max(0, width * height * 4)),
                width,
                height
            }),
            drawImage: (...args) => {
                state.lastDrawSignature = args.map((value, index) => index === 0 ? describeCanvasSource(value) : String(value)).join("|");
            }
        };
    };
    const canvasPrototype = jsdomWindow.HTMLCanvasElement?.prototype;
    if (canvasPrototype) {
        Object.defineProperty(canvasPrototype, "getContext", {
            configurable: true,
            value(contextId) {
                if (contextId !== "2d") {
                    return null;
                }
                const existing = this.__mock2dContext;
                if (existing) {
                    return existing;
                }
                const context = createMockCanvasContext(this);
                this.__mock2dContext = context;
                return context;
            }
        });
        Object.defineProperty(canvasPrototype, "toDataURL", {
            configurable: true,
            value(type) {
                const state = getCanvasState(this);
                const signature = state.lastDrawSignature || `blank:${this.width}x${this.height}`;
                return `data:${type ?? "image/png"};mock,${encodeURIComponent(`${this.width}x${this.height}:${signature}`)}`;
            }
        });
    }
    // Mock Image constructor for sprite sheet loading
    class MockImage extends EventTarget {
        get src() {
            return this.currentSrc;
        }
        set src(value) {
            this.currentSrc = value;
            this.complete = false;
            this.width = 0;
            this.height = 0;
            this.naturalWidth = 0;
            this.naturalHeight = 0;
            hostSetTimeout(() => {
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
            this.onload = null;
            this.onerror = null;
            this.decoding = "auto";
            this.width = 0;
            this.height = 0;
            this.naturalWidth = 0;
            this.naturalHeight = 0;
            this.complete = false;
            this.currentSrc = "";
        }
    }
    jsdomWindow.Image = MockImage;
    const requestAnimationFrameImpl = jsdomWindow.requestAnimationFrame ??
        ((callback) => hostSetTimeout(() => callback(Date.now()), 16));
    const cancelAnimationFrameImpl = jsdomWindow.cancelAnimationFrame ??
        ((handle) => {
            hostClearTimeout(handle);
        });
    if (typeof jsdomWindow.requestAnimationFrame !== "function") {
        jsdomWindow.requestAnimationFrame = requestAnimationFrameImpl;
    }
    if (typeof jsdomWindow.cancelAnimationFrame !== "function") {
        jsdomWindow.cancelAnimationFrame = cancelAnimationFrameImpl;
    }
    class MockGainNode {
        constructor() {
            this.gain = { value: 1 };
        }
        connect() { }
        disconnect() { }
    }
    class MockBufferSourceNode extends EventTarget {
        constructor() {
            super(...arguments);
            this.buffer = null;
            this.playbackRate = { value: 1 };
            this.onended = null;
        }
        connect() { }
        disconnect() { }
        start() {
            hostSetTimeout(() => {
                if (this.onended) {
                    this.onended.call(this, new Event("ended"));
                }
            }, 0);
        }
    }
    class MockAudioContext {
        constructor() {
            this.destination = {};
            this.currentTime = 0;
        }
        createGain() {
            return new MockGainNode();
        }
        createBufferSource() {
            return new MockBufferSourceNode();
        }
        async decodeAudioData(_arrayBuffer) {
            return {
                duration: 0
            };
        }
        resume() {
            return Promise.resolve();
        }
        suspend() {
            return Promise.resolve();
        }
        close() {
            return Promise.resolve();
        }
    }
    jsdomWindow.AudioContext = MockAudioContext;
    jsdomWindow.webkitAudioContext =
        MockAudioContext;
    const WheelEventImpl = jsdomWindow.WheelEvent ?? (function WheelEvent(type, eventInitDict = {}) {
        const event = new jsdomWindow.Event(type, {
            bubbles: eventInitDict.bubbles ?? false,
            cancelable: eventInitDict.cancelable ?? false,
            composed: eventInitDict.composed ?? false
        });
        Object.defineProperty(event, "deltaX", { configurable: true, value: eventInitDict.deltaX ?? 0 });
        Object.defineProperty(event, "deltaY", { configurable: true, value: eventInitDict.deltaY ?? 0 });
        Object.defineProperty(event, "deltaZ", { configurable: true, value: eventInitDict.deltaZ ?? 0 });
        Object.defineProperty(event, "deltaMode", { configurable: true, value: eventInitDict.deltaMode ?? 0 });
        return event;
    });
    if (!("DOM_DELTA_PIXEL" in WheelEventImpl)) {
        WheelEventImpl.DOM_DELTA_PIXEL = 0;
    }
    if (!("DOM_DELTA_LINE" in WheelEventImpl)) {
        WheelEventImpl.DOM_DELTA_LINE = 1;
    }
    if (!("DOM_DELTA_PAGE" in WheelEventImpl)) {
        WheelEventImpl.DOM_DELTA_PAGE = 2;
    }
    const makeSvgElementConstructor = (tagName) => {
        const SvgElementConstructor = function SvgElementConstructor() { };
        Object.defineProperty(SvgElementConstructor, Symbol.hasInstance, {
            configurable: true,
            value(value) {
                return value instanceof jsdomWindow.SVGElement
                    && value.tagName.toLowerCase() === tagName.toLowerCase();
            }
        });
        return SvgElementConstructor;
    };
    Object.assign(globalThis, {
        window: jsdomWindow,
        document: jsdomWindow.document,
        Node: jsdomWindow.Node,
        Event: jsdomWindow.Event,
        MouseEvent: jsdomWindow.MouseEvent,
        WheelEvent: WheelEventImpl,
        HTMLElement: jsdomWindow.HTMLElement,
        HTMLCanvasElement: jsdomWindow.HTMLCanvasElement,
        SVGElement: jsdomWindow.SVGElement,
        SVGGElement: jsdomWindow.SVGGElement ?? makeSvgElementConstructor("g"),
        SVGImageElement: jsdomWindow.SVGImageElement ?? makeSvgElementConstructor("image"),
        SVGSVGElement: jsdomWindow.SVGSVGElement ?? makeSvgElementConstructor("svg"),
        SVGPolygonElement: jsdomWindow.SVGPolygonElement ?? makeSvgElementConstructor("polygon"),
        SVGTextElement: jsdomWindow.SVGTextElement ?? makeSvgElementConstructor("text"),
        SVGCircleElement: jsdomWindow.SVGCircleElement ?? makeSvgElementConstructor("circle"),
        getComputedStyle: jsdomWindow.getComputedStyle.bind(jsdomWindow),
        requestAnimationFrame: requestAnimationFrameImpl,
        cancelAnimationFrame: cancelAnimationFrameImpl,
        Image: MockImage,
        AudioContext: MockAudioContext,
        webkitAudioContext: MockAudioContext
    });
    domInitialized = true;
}
// Initialize immediately so tests only need to import this module once.
ensureDomEnvironment();
