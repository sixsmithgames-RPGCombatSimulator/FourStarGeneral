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
}): { host: HTMLElement; svg: SVGSVGElement; viewportRoot: SVGGElement } {
  const viewportWidth = options?.viewportWidth ?? 400;
  const viewportHeight = options?.viewportHeight ?? 300;
  const canvasWidth = options?.canvasWidth ?? 600;
  const canvasHeight = options?.canvasHeight ?? 600;
  const svgWidth = options?.svgWidth ?? canvasWidth;
  const svgHeight = options?.svgHeight ?? canvasHeight;
  const viewBoxWidth = options?.viewBoxWidth ?? svgWidth;
  const viewBoxHeight = options?.viewBoxHeight ?? svgHeight;

  const viewport = document.createElement("div");
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

  return { host: canvas, svg, viewportRoot };
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
