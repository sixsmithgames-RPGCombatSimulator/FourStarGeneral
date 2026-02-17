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

function setupMapDom(): { host: HTMLElement; svg: SVGSVGElement } {
  const viewport = document.createElement("div");
  viewport.style.width = "400px";
  viewport.style.height = "300px";
  viewport.style.overflow = "hidden";

  const canvas = document.createElement("div");
  canvas.id = "battleMapCanvas";
  canvas.style.width = "600px";
  canvas.style.height = "600px";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "battleHexMap";
  svg.setAttribute("width", "600");
  svg.setAttribute("height", "600");

  canvas.appendChild(svg);
  viewport.appendChild(canvas);
  document.body.appendChild(viewport);

  return { host: canvas, svg };
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
      clientX: 220,
      clientY: 240
    });
    host.dispatchEvent(moveEvent);

    upEvent = createPointerEvent("pointerup", {
      pointerId: 17,
      pointerType: "mouse",
      clientX: 220,
      clientY: 240
    });
    host.dispatchEvent(upEvent);

    strayMoveEvent = createPointerEvent("pointermove", {
      pointerId: 17,
      pointerType: "mouse",
      clientX: 260,
      clientY: 260
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
    if (transform.panX !== 20 || transform.panY !== 40) {
      throw new Error(`Expected pan deltas (20, 40); received (${transform.panX}, ${transform.panY})`);
    }

    const postReleaseTransform = mapViewport.getTransform();
    host.remove();
    if (postReleaseTransform.panX !== 20 || postReleaseTransform.panY !== 40) {
      throw new Error("Viewport pan changed unexpectedly after releasing the drag");
    }
  });
});
