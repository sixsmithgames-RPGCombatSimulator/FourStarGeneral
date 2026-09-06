import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { MapViewport } from "../src/ui/controls/MapViewport";

type PointerEventProps = {
  button?: number;
  pointerId?: number;
  pointerType?: string;
  clientX?: number;
  clientY?: number;
};

type MutablePointerEvent = PointerEvent & { wasPrevented: () => boolean };

function createPointerEvent(type: string, props: PointerEventProps): MutablePointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as MutablePointerEvent;
  const originalPreventDefault = event.preventDefault.bind(event);
  let prevented = false;
  event.preventDefault = () => {
    prevented = true;
    originalPreventDefault();
  };
  event.wasPrevented = () => prevented;

  const apply = (key: keyof PointerEventProps, value: number | string | undefined) => {
    if (value === undefined) {
      return;
    }
    Object.defineProperty(event, key, {
      configurable: true,
      value
    });
  };

  apply("button", props.button ?? 0);
  apply("pointerId", props.pointerId ?? 0);
  apply("pointerType", props.pointerType ?? "mouse");
  apply("clientX", props.clientX ?? 0);
  apply("clientY", props.clientY ?? 0);

  return event;
}

function defineLayoutMetrics(element: Element, width: number, height: number, left = 0, top = 0): void {
  Object.defineProperty(element, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(element, "clientHeight", { value: height, configurable: true });
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      x: left,
      y: top,
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      toJSON: () => ""
    })
  });
}

function setupMapDom(options?: {
  readonly viewportWidth?: number;
  readonly viewportHeight?: number;
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
  readonly svgWidth?: number;
  readonly svgHeight?: number;
  readonly viewBoxWidth?: number;
  readonly viewBoxHeight?: number;
}): { host: HTMLElement; viewport: HTMLElement; svg: SVGSVGElement; viewportRoot: SVGGElement } {
  const viewportWidth = options?.viewportWidth ?? 400;
  const viewportHeight = options?.viewportHeight ?? 300;
  const canvasWidth = options?.canvasWidth ?? 600;
  const canvasHeight = options?.canvasHeight ?? 600;
  const svgWidth = options?.svgWidth ?? canvasWidth;
  const svgHeight = options?.svgHeight ?? canvasHeight;
  const viewBoxWidth = options?.viewBoxWidth ?? svgWidth;
  const viewBoxHeight = options?.viewBoxHeight ?? svgHeight;

  const viewport = document.createElement("div");
  viewport.className = "campaign-map-viewport";
  viewport.style.width = `${viewportWidth}px`;
  viewport.style.height = `${viewportHeight}px`;
  viewport.style.overflow = "hidden";

  const canvas = document.createElement("div");
  canvas.id = "battleMapCanvas";
  canvas.style.width = `${canvasWidth}px`;
  canvas.style.height = `${canvasHeight}px`;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "battleHexMap";
  svg.setAttribute("width", String(viewBoxWidth));
  svg.setAttribute("height", String(viewBoxHeight));
  svg.setAttribute("viewBox", `0 0 ${viewBoxWidth} ${viewBoxHeight}`);

  const viewportRoot = document.createElementNS("http://www.w3.org/2000/svg", "g");
  viewportRoot.setAttribute("id", "viewportRoot");
  svg.appendChild(viewportRoot);

  canvas.appendChild(svg);
  viewport.appendChild(canvas);
  document.body.appendChild(viewport);

  defineLayoutMetrics(viewport, viewportWidth, viewportHeight);
  defineLayoutMetrics(canvas, canvasWidth, canvasHeight);
  defineLayoutMetrics(svg, svgWidth, svgHeight);

  return { host: canvas, viewport, svg, viewportRoot };
}

registerTest("MAP_VIEWPORT_WHEEL_ZOOM", async ({ Given, When, Then }) => {
  let mapViewport: MapViewport;
  let host: HTMLElement;
  let wheelPrevented = false;
  let postZoom = 1;

  await Given("a rendered battle map viewport", async () => {
    const { host: canvas } = setupMapDom();
    host = canvas;
    mapViewport = new MapViewport();
  });

  await When("the commander rolls the mouse wheel toward the screen", async () => {
    const wheelEvent = new WheelEvent("wheel", {
      deltaY: 120,
      deltaMode: WheelEvent.DOM_DELTA_LINE,
      bubbles: true,
      cancelable: true
    });
    host.dispatchEvent(wheelEvent);
    wheelPrevented = wheelEvent.defaultPrevented;
    postZoom = mapViewport.getTransform().zoom;
  });

  await Then("the viewport zooms out and the gesture consumes the native scroll", async () => {
    if (!wheelPrevented) {
      throw new Error("Expected wheel interaction to prevent default scrolling");
    }
    const expectedZoom = 1 - 0.18;
    const tolerance = 1e-6;
    if (Math.abs(postZoom - expectedZoom) > tolerance) {
      throw new Error(`Zoom should adjust by wheel step. Expected ${expectedZoom}, got ${postZoom}`);
    }
    host.remove();
  });
});

registerTest("MAP_VIEWPORT_MIDDLE_DRAG_PAN", async ({ Given, When, Then }) => {
  let mapViewport: MapViewport;
  let host: HTMLElement;
  let downEvent: MutablePointerEvent;
  let moveEvent: MutablePointerEvent;
  let upEvent: MutablePointerEvent;
  let strayMoveEvent: MutablePointerEvent;

  await Given("a battle map viewport ready for pointer interactions", async () => {
    const { host: canvas } = setupMapDom();
    host = canvas;
    mapViewport = new MapViewport();
  });

  await When("the commander presses, drags, and releases the mouse wheel", async () => {
    downEvent = createPointerEvent("pointerdown", {
      button: 1,
      pointerId: 17,
      pointerType: "mouse",
      clientX: 200,
      clientY: 200
    });
    host.dispatchEvent(downEvent);

    moveEvent = createPointerEvent("pointermove", {
      pointerId: 17,
      pointerType: "mouse",
      clientX: 180,
      clientY: 160
    });
    host.dispatchEvent(moveEvent);

    upEvent = createPointerEvent("pointerup", {
      pointerId: 17,
      pointerType: "mouse",
      clientX: 180,
      clientY: 160
    });
    host.dispatchEvent(upEvent);

    strayMoveEvent = createPointerEvent("pointermove", {
      pointerId: 17,
      pointerType: "mouse",
      clientX: 140,
      clientY: 120
    });
    host.dispatchEvent(strayMoveEvent);
  });

  await Then("the viewport pans with the drag and stops once the button is released", async () => {
    if (!downEvent.wasPrevented()) {
      throw new Error("Pointer down should capture the pointer and prevent default behaviour");
    }
    if (!moveEvent.wasPrevented()) {
      throw new Error("Pointer move during drag should prevent default autoscroll");
    }
    if (!upEvent.wasPrevented()) {
      throw new Error("Pointer up should suppress browser auto-scroll");
    }
    if (strayMoveEvent.wasPrevented()) {
      throw new Error("Pointer move after releasing drag should not run pan logic");
    }

    const transform = mapViewport.getTransform();
    if (transform.panX !== -20 || transform.panY !== -40) {
      throw new Error(`Expected pan deltas (-20, -40); received (${transform.panX}, ${transform.panY})`);
    }

    const postReleaseTransform = mapViewport.getTransform();
    host.remove();
    if (postReleaseTransform.panX !== -20 || postReleaseTransform.panY !== -40) {
      throw new Error("Viewport pan changed unexpectedly after releasing the drag");
    }
  });
});

registerTest("MAP_VIEWPORT_TOUCH_PAN", async ({ Given, When, Then }) => {
  let mapViewport: MapViewport;
  let host: HTMLElement;
  let moveEvent: MutablePointerEvent;

  await Given("a battle map viewport receiving a single touch drag", async () => {
    const { host: canvas } = setupMapDom();
    host = canvas;
    mapViewport = new MapViewport();
  });

  await When("the commander drags one finger across the battlefield", async () => {
    host.dispatchEvent(createPointerEvent("pointerdown", {
      pointerId: 21,
      pointerType: "touch",
      clientX: 200,
      clientY: 200
    }));
    moveEvent = createPointerEvent("pointermove", {
      pointerId: 21,
      pointerType: "touch",
      clientX: 170,
      clientY: 160
    });
    host.dispatchEvent(moveEvent);
    host.dispatchEvent(createPointerEvent("pointerup", {
      pointerId: 21,
      pointerType: "touch",
      clientX: 170,
      clientY: 160
    }));
  });

  await Then("the viewport pans and the gesture suppresses native page scrolling", async () => {
    if (!moveEvent.wasPrevented()) {
      throw new Error("Touch pan should prevent default browser scrolling");
    }
    const transform = mapViewport.getTransform();
    if (transform.panX !== -30 || transform.panY !== -40) {
      throw new Error(`Expected touch pan (-30, -40); received (${transform.panX}, ${transform.panY})`);
    }
    host.remove();
  });
});

registerTest("MAP_VIEWPORT_TOUCH_PINCH_ZOOM", async ({ Given, When, Then }) => {
  let mapViewport: MapViewport;
  let host: HTMLElement;
  let pinchMoveEvent: MutablePointerEvent;

  await Given("a battle map viewport receiving a two-finger pinch", async () => {
    const { host: canvas } = setupMapDom();
    host = canvas;
    mapViewport = new MapViewport();
  });

  await When("the commander spreads two fingers apart on the battlefield", async () => {
    host.dispatchEvent(createPointerEvent("pointerdown", {
      pointerId: 31,
      pointerType: "touch",
      clientX: 150,
      clientY: 150
    }));
    host.dispatchEvent(createPointerEvent("pointerdown", {
      pointerId: 32,
      pointerType: "touch",
      clientX: 250,
      clientY: 150
    }));
    pinchMoveEvent = createPointerEvent("pointermove", {
      pointerId: 32,
      pointerType: "touch",
      clientX: 286,
      clientY: 150
    });
    host.dispatchEvent(pinchMoveEvent);
  });

  await Then("the viewport zooms in around the pinch center and consumes the native gesture", async () => {
    if (!pinchMoveEvent.wasPrevented()) {
      throw new Error("Touch pinch should prevent default browser gestures");
    }
    const transform = mapViewport.getTransform();
    const expectedZoom = 1.2;
    const tolerance = 1e-6;
    if (Math.abs(transform.zoom - expectedZoom) > tolerance) {
      throw new Error(`Expected pinch zoom ${expectedZoom}; received ${transform.zoom}`);
    }
    host.remove();
  });
});

registerTest("MAP_VIEWPORT_NON_HEX_TILE_SYMBOLS_RETAIN_CLOSE_ZOOM_CAP", async ({ Given, When, Then }) => {
  let mapViewport: MapViewport;
  let host: HTMLElement;
  let viewportRoot: SVGGElement;
  const tileScales: number[] = [];
  const labelScales: number[] = [];

  await Given("a campaign viewport with a bounded non-hex tile symbol", () => {
    const dom = setupMapDom();
    host = dom.host;
    viewportRoot = dom.viewportRoot;
    mapViewport = new MapViewport();
  });

  await When("the commander moves from opening zoom to maximum detail zoom", () => {
    for (const zoom of [1, 3.48, 7.5]) {
      mapViewport.setTransform(zoom, 0, 0);
      tileScales.push(Number(viewportRoot.style.getPropertyValue("--campaign-map-tile-symbol-scale")));
      labelScales.push(Number(viewportRoot.style.getPropertyValue("--campaign-map-location-label-scale")));
    }
  });

  await Then("the non-hex symbol retains its previous screen-space growth cap", () => {
    const expected = [1, 2.9 / 3.48, 2.9 / 7.5];
    if (tileScales.some((scale, index) => Math.abs(scale - expected[index]!) > 0.000001)) {
      throw new Error(`Expected bounded non-hex tile scales ${JSON.stringify(expected)}, received ${JSON.stringify(tileScales)}.`);
    }
    const expectedLabelScales = [1, 2.8 / 3.48, 2.8 / 7.5];
    if (labelScales.some((scale, index) => Math.abs(scale - expectedLabelScales[index]!) > 0.000001)) {
      throw new Error(`Expected bounded location-label scales ${JSON.stringify(expectedLabelScales)}, received ${JSON.stringify(labelScales)}.`);
    }
    host.remove();
  });
});

registerTest("MAP_VIEWPORT_LABEL_VISIBILITY_TRACKS_NATIVE_VIEWPORT_GEOMETRY", async ({ Given, When, Then }) => {
  let mapViewport: MapViewport;
  let host: HTMLElement;
  let viewport: HTMLElement;
  let label: SVGGElement;
  let leader: SVGLineElement;
  let labelLeft = 120;
  let resizeCallback: ResizeObserverCallback | null = null;
  let resizeDisconnected = false;
  const originalResizeObserver = globalThis.ResizeObserver;

  await Given("a campaign label inside a natively scrollable and resizable viewport", () => {
    class AuditResizeObserver {
      constructor(callback: ResizeObserverCallback) { resizeCallback = callback; }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void { resizeDisconnected = true; }
    }
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: AuditResizeObserver });
    const dom = setupMapDom();
    host = dom.host;
    viewport = dom.viewport;
    label = document.createElementNS("http://www.w3.org/2000/svg", "g");
    label.classList.add("campaign-map-location-label");
    label.dataset.locationLabelId = "audit-label";
    Object.defineProperty(label, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: labelLeft, y: 80, left: labelLeft, top: 80, width: 90, height: 24,
        right: labelLeft + 90, bottom: 104, toJSON: () => ""
      })
    });
    leader = document.createElementNS("http://www.w3.org/2000/svg", "line");
    leader.classList.add("campaign-map-location-label__leader");
    leader.dataset.locationLabelId = "audit-label";
    leader.setAttribute("x1", "0");
    leader.setAttribute("y1", "0");
    const translatedLayerMatrix = {
      a: 1, b: 0, c: 0, d: 1, e: 36, f: 52,
      inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: -36, f: -52 })
    } as unknown as DOMMatrix;
    Object.defineProperty(leader, "getScreenCTM", {
      configurable: true,
      value: () => translatedLayerMatrix
    });
    dom.viewportRoot.append(leader, label);
    mapViewport = new MapViewport();
    mapViewport.setViewportRoot(dom.viewportRoot);
  });

  await When("native scrolling clips the label and resizing reveals it without a camera transform", () => {
    labelLeft = 360;
    viewport.dispatchEvent(new Event("scroll"));
    if (label.style.visibility !== "hidden" || leader.style.visibility !== "hidden") {
      throw new Error("Native viewport scrolling did not suppress the clipped label and leader.");
    }
    labelLeft = 120;
    if (!resizeCallback) throw new Error("Campaign label ResizeObserver was not installed.");
    resizeCallback([], {} as ResizeObserver);
  });

  await Then("the label is readable again and disposal releases viewport observers", () => {
    if (label.style.visibility !== "visible" || leader.style.visibility !== "visible") {
      throw new Error("Resize-driven geometry did not restore the fully readable label and leader.");
    }
    if (Math.abs(Number(leader.getAttribute("x2")) - 84) > 0.000001
      || Math.abs(Number(leader.getAttribute("y2")) - 28) > 0.000001) {
      throw new Error("Leader endpoint did not account for its translated legacy-grid layer.");
    }
    mapViewport.dispose();
    const transformBeforeDisposedInput = mapViewport.getTransform();
    labelLeft = 360;
    viewport.dispatchEvent(new Event("scroll"));
    const wheel = new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true });
    host.dispatchEvent(wheel);
    const pointerDown = createPointerEvent("pointerdown", { button: 1, pointerId: 71, clientX: 30, clientY: 30 });
    const pointerMove = createPointerEvent("pointermove", { button: 1, pointerId: 71, clientX: 90, clientY: 80 });
    host.dispatchEvent(pointerDown);
    host.dispatchEvent(pointerMove);
    const contextMenu = new Event("contextmenu", { bubbles: true, cancelable: true });
    host.dispatchEvent(contextMenu);
    if (label.style.visibility !== "visible" || !resizeDisconnected
      || JSON.stringify(mapViewport.getTransform()) !== JSON.stringify(transformBeforeDisposedInput)
      || wheel.defaultPrevented || pointerDown.wasPrevented() || pointerMove.wasPrevented() || contextMenu.defaultPrevented) {
      throw new Error("MapViewport disposal retained campaign label geometry observers.");
    }
    host.remove();
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: originalResizeObserver });
  });
});

registerTest("MAP_VIEWPORT_CENTER_ON_USES_VIEWBOX_UNITS_WHEN_LAYOUT_IS_SCALED", async ({ Given, When, Then }) => {
  let mapViewport: MapViewport;
  let host: HTMLElement;
  let viewportRoot: SVGGElement;
  let transform: { zoom: number; panX: number; panY: number } = { zoom: 1, panX: 0, panY: 0 };

  await Given("a viewport whose rendered SVG is scaled down relative to its viewBox", async () => {
    const dom = setupMapDom({
      viewportWidth: 400,
      viewportHeight: 300,
      canvasWidth: 500,
      canvasHeight: 500,
      svgWidth: 500,
      svgHeight: 500,
      viewBoxWidth: 1000,
      viewBoxHeight: 1000
    });
    host = dom.host;
    viewportRoot = dom.viewportRoot;
    mapViewport = new MapViewport();
  });

  await When("the camera centers on a distant hex in viewBox space", async () => {
    mapViewport.centerOn(600, 600);
    transform = mapViewport.getTransform();
  });

  await Then("the pan values move in viewBox units instead of half-strength pixel units", async () => {
    const tolerance = 1e-6;
    if (Math.abs(transform.panX - -200) > tolerance || Math.abs(transform.panY - -300) > tolerance) {
      throw new Error(`Expected pan (-200, -300) in viewBox units, received (${transform.panX}, ${transform.panY}).`);
    }

    const appliedTransform = viewportRoot.getAttribute("transform") ?? "";
    if (appliedTransform !== "translate(-200, -300) scale(1)") {
      throw new Error(`Expected viewportRoot transform to match centered viewBox pan, received ${appliedTransform}.`);
    }

    host.remove();
  });
});

registerTest("MAP_VIEWPORT_FITS_AND_CENTERS_COMPLETE_MAP", async ({ Given, When, Then }) => {
  let mapViewport: MapViewport;
  let host: HTMLElement;
  let viewportRoot: SVGGElement;

  await Given("a square theater map inside a wider command viewport", () => {
    const dom = setupMapDom({
      viewportWidth: 700,
      viewportHeight: 560,
      canvasWidth: 1024,
      canvasHeight: 1024,
      svgWidth: 1024,
      svgHeight: 1024,
      viewBoxWidth: 1024,
      viewBoxHeight: 1024
    });
    host = dom.host;
    viewportRoot = dom.viewportRoot;
    mapViewport = new MapViewport();
  });

  await When("the complete map is fit with twelve pixels of viewport padding", () => {
    mapViewport.fitToMap(12);
  });

  await Then("the limiting height determines zoom and the theater is centered", () => {
    const transform = mapViewport.getTransform();
    const expectedZoom = (560 - 24) / 1024;
    const expectedPanX = 700 / 2 - expectedZoom * 512;
    const expectedPanY = 560 / 2 - expectedZoom * 512;
    const tolerance = 1e-6;
    if (Math.abs(transform.zoom - expectedZoom) > tolerance
      || Math.abs(transform.panX - expectedPanX) > tolerance
      || Math.abs(transform.panY - expectedPanY) > tolerance) {
      throw new Error(`Complete-map fit was not centered: ${JSON.stringify(transform)}.`);
    }
    const appliedTransform = viewportRoot.getAttribute("transform") ?? "";
    const inverseZoom = Number(viewportRoot.style.getPropertyValue("--campaign-map-inverse-zoom"));
    const restingScale = Number(viewportRoot.style.getPropertyValue("--campaign-map-inverse-zoom-resting"));
    const markerScale = Number(viewportRoot.style.getPropertyValue("--campaign-map-marker-scale"));
    // At overview zoom, markers follow the theater so they cannot cover adjacent authored cells.
    const expectedMarkerScale = 1;
    if (!appliedTransform.includes(`scale(${expectedZoom})`)
      || Math.abs(inverseZoom - 1 / expectedZoom) > tolerance
      || Math.abs(restingScale - 0.92 / expectedZoom) > tolerance
      || Math.abs(markerScale - expectedMarkerScale) > tolerance) {
      throw new Error(`Complete-map fit was not applied to the viewport root: ${appliedTransform}.`);
    }
    host.remove();
  });
});

registerTest("MAP_VIEWPORT_COMPLETE_MAP_FIT_SURVIVES_A_SHORT_VIEWPORT", async ({ Given, When, Then }) => {
  let mapViewport: MapViewport;
  let host: HTMLElement;
  let viewportRoot: SVGGElement;
  const cameraAdjustments = { count: 0 };

  await Given("a square theater map inside a 200-percent-equivalent short command viewport", () => {
    const dom = setupMapDom({
      viewportWidth: 640,
      viewportHeight: 170,
      canvasWidth: 1024,
      canvasHeight: 1024,
      svgWidth: 1024,
      svgHeight: 1024,
      viewBoxWidth: 1024,
      viewBoxHeight: 1024
    });
    host = dom.host;
    viewportRoot = dom.viewportRoot;
    mapViewport = new MapViewport("#battleHexMap", () => { cameraAdjustments.count += 1; }, 0.1);
  });

  await When("the commander requests the complete theater", () => {
    mapViewport.fitToMap(12);
  });

  await Then("the preset remains stable below the former interaction floor instead of cropping the theater", () => {
    const transform = mapViewport.getTransform();
    const expectedZoom = (170 - 24) / 1024;
    const tolerance = 1e-6;
    if (Math.abs(transform.zoom - expectedZoom) > tolerance
      || transform.panX <= 0
      || transform.panY <= 0
      || viewportRoot.getAttribute("transform") !== `translate(${transform.panX}, ${transform.panY}) scale(${expectedZoom})`) {
      throw new Error(`Short complete-map fit remained cropped: ${JSON.stringify(transform)}.`);
    }
    mapViewport.setTransform(transform.zoom, transform.panX, transform.panY);
    const rebound = mapViewport.getTransform();
    if (Math.abs(rebound.zoom - expectedZoom) > tolerance
      || Math.abs(rebound.panX - transform.panX) > tolerance
      || Math.abs(rebound.panY - transform.panY) > tolerance
      || cameraAdjustments.count !== 0) {
      throw new Error(`Renderer rebind changed the fitted camera: ${JSON.stringify(rebound)}.`);
    }
    mapViewport.adjustZoom(-0.2);
    const zoomedOut = mapViewport.getTransform();
    const adjustmentsAfterZoom = Number(cameraAdjustments.count);
    if (zoomedOut.zoom !== 0.1 || zoomedOut.zoom >= expectedZoom || adjustmentsAfterZoom !== 1) {
      throw new Error(`Zooming from the fitted camera was not monotonic: ${JSON.stringify({ zoomedOut, cameraAdjustments: adjustmentsAfterZoom })}.`);
    }
    host.remove();
  });
});

registerTest("MAP_VIEWPORT_DEFAULT_ZOOM_FLOOR_REMAINS_TACTICAL", async ({ Given, When, Then }) => {
  let mapViewport: MapViewport;
  let host: HTMLElement;

  await Given("a tactical map using the default viewport contract", () => {
    const dom = setupMapDom({
      viewportWidth: 640,
      viewportHeight: 480,
      canvasWidth: 1024,
      canvasHeight: 1024,
      svgWidth: 1024,
      svgHeight: 1024,
      viewBoxWidth: 1024,
      viewBoxHeight: 1024
    });
    host = dom.host;
    mapViewport = new MapViewport();
  });

  await When("the commander zooms out beyond the tactical minimum", () => {
    mapViewport.adjustZoom(-2);
  });

  await Then("the tactical map keeps its established half-scale floor", () => {
    if (mapViewport.getTransform().zoom !== 0.5) {
      throw new Error(`Default viewport zoom floor changed: ${JSON.stringify(mapViewport.getTransform())}.`);
    }
    host.remove();
  });
});
