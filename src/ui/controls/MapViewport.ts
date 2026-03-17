import type { IMapViewport } from "../../contracts/IMapViewport";

/**
 * Manages map viewport transformations including zoom and pan.
 * Provides smooth viewport control with configurable limits.
 */
export class MapViewport implements IMapViewport {
  private transform = {
    zoom: 1,
    panX: 0,
    panY: 0
  };

  private readonly mapElement: SVGSVGElement;
  private readonly wheelZoomStep = 0.18;
  private readonly wheelEventTarget: HTMLElement | SVGSVGElement;
  /** Tracks middle-mouse drag state so panning only occurs while the wheel button stays depressed. */
  private readonly dragState: {
    active: boolean;
    pointerId: number | null;
    lastX: number;
    lastY: number;
  } = {
    active: false,
    pointerId: null,
    lastX: 0,
    lastY: 0
  };
  /**
   * Processes browser wheel events and converts them into viewport zoom operations.
   * Defined as an arrow property so the same instance is registered/unregistered safely.
   */
  private readonly handleWheel = (event: Event): void => {
    const wheelEvent = event as WheelEvent;

    if (wheelEvent.deltaX === 0 && wheelEvent.deltaY === 0) {
      return;
    }

    // Prevent the surrounding page from scrolling while the commander manipulates the battlefield viewport.
    wheelEvent.preventDefault();

    const deltaModeScale = wheelEvent.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 28
      : wheelEvent.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? 100
        : 1;

    const scaledDeltaY = wheelEvent.deltaY * deltaModeScale;
    if (scaledDeltaY === 0) {
      return;
    }

    // Scroll direction > 0 means the commander rolled the wheel away (zoom out), < 0 zooms in.
    const zoomDirection = scaledDeltaY > 0 ? -1 : 1;
    this.adjustZoomAt(zoomDirection * this.wheelZoomStep, wheelEvent.clientX, wheelEvent.clientY);
  };
  private readonly bindWheelInteractions = (): void => {
    this.wheelEventTarget.addEventListener("wheel", this.handleWheel, { passive: false });
  };

  /**
   * Begins a middle-button drag when the commander presses and holds the mouse wheel.
   */
  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 1) {
      return;
    }
    if (event.pointerType && event.pointerType !== "mouse") {
      return;
    }

    // Middle-click initiates a drag pan; capture the pointer so movement outside the SVG still pans.
    this.dragState.active = true;
    this.dragState.pointerId = event.pointerId;
    this.dragState.lastX = event.clientX;
    this.dragState.lastY = event.clientY;

    if (typeof (this.wheelEventTarget as Element).setPointerCapture === "function") {
      (this.wheelEventTarget as Element).setPointerCapture(event.pointerId);
    }

    event.preventDefault();
  };

  /**
   * Applies panning deltas while the middle button stays captured.
   */
  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.dragState.active || event.pointerId !== this.dragState.pointerId) {
      return;
    }

    // Prevent default so the browser does not autoscroll while the map follows the pointer.
    event.preventDefault();

    const deltaX = event.clientX - this.dragState.lastX;
    const deltaY = event.clientY - this.dragState.lastY;
    if (deltaX !== 0 || deltaY !== 0) {
      // Pan by the movement delta so the map tracks the pointer one-to-one.
      this.pan(deltaX, deltaY);
      this.dragState.lastX = event.clientX;
      this.dragState.lastY = event.clientY;
    }
  };

  /**
   * Ends middle-button drag and releases pointer capture once the button lifts or leaves the canvas.
   */
  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (!this.dragState.active || event.pointerId !== this.dragState.pointerId) {
      return;
    }

    this.dragState.active = false;
    this.dragState.pointerId = null;

    if (typeof (this.wheelEventTarget as Element).releasePointerCapture === "function") {
      (this.wheelEventTarget as Element).releasePointerCapture(event.pointerId);
    }
    // Prevent default so releasing the middle button does not trigger browser auto-scroll artifacts.
    event.preventDefault();
  };

  private readonly bindPointerInteractions = (): void => {
    // Use pointer events so the same logic works for mice that expose the middle button as button 1.
    this.wheelEventTarget.addEventListener("pointerdown", this.handlePointerDown as EventListener);
    this.wheelEventTarget.addEventListener("pointermove", this.handlePointerMove as EventListener);
    this.wheelEventTarget.addEventListener("pointerup", this.handlePointerUp as EventListener);
    this.wheelEventTarget.addEventListener("pointercancel", this.handlePointerUp as EventListener);
    this.wheelEventTarget.addEventListener("pointerleave", this.handlePointerUp as EventListener);
  };

  // Zoom limits keep interactions bounded; a higher max lets commanders inspect the map closely.
  private readonly MIN_ZOOM = 0.5;
  private readonly MAX_ZOOM = 6.0;

  constructor(mapElementSelector: string = "#battleHexMap") {
    const element = document.querySelector<SVGSVGElement>(mapElementSelector);
    if (!element) {
      throw new Error(`Map element not found: ${mapElementSelector}`);
    }
    this.mapElement = element;
    this.wheelEventTarget = this.mapElement.parentElement instanceof HTMLElement ? this.mapElement.parentElement : this.mapElement;

    this.bindWheelInteractions();
    this.bindPointerInteractions();
  }

  /**
   * Resets the viewport to default zoom and position.
   */
  reset(): void {
    this.transform.zoom = 1;
    this.transform.panX = 0;
    this.transform.panY = 0;
    this.updateTransform();
  }

  /**
   * Adjusts the zoom level by the specified delta.
   */
  adjustZoom(delta: number): void {
    const oldZoom = this.transform.zoom;
    this.transform.zoom = this.clamp(
      this.transform.zoom + delta,
      this.MIN_ZOOM,
      this.MAX_ZOOM
    );
    console.log("[MapViewport] adjustZoom:", { delta, oldZoom, newZoom: this.transform.zoom, transform: this.transform });
    this.updateTransform();
  }

  /**
   * Adjusts zoom centered on the pointer position, preserving the screen location of the hovered map point.
   */
  adjustZoomAt(delta: number, clientX: number, clientY: number): void {
    const context = this.computeViewportContext();
    if (!context) {
      // If container sizing is unavailable (e.g., headless tests), fall back to simple zoom.
      this.adjustZoom(delta);
      return;
    }

    const {
      viewport,
      containerWidth,
      containerHeight,
      baseOffsetX,
      baseOffsetY,
      mapWidth,
      mapHeight,
      viewScale,
      zoom: currentZoom
    } = context;

    const oldZoom = currentZoom;
    const newZoom = this.clamp(currentZoom + delta, this.MIN_ZOOM, this.MAX_ZOOM);
    if (newZoom === oldZoom) {
      return;
    }

    // Convert pointer screen position to viewBox coordinates under the cursor before zooming.
    // With transform-box: view-box, the transformation is:
    //   screen = (viewBox * zoom + pan) * renderScale + baseOffset
    // Solving for viewBox:
    //   viewBox = ((screen - baseOffset) / renderScale - pan) / zoom
    const viewportRect = viewport.getBoundingClientRect();
    const screenX = clientX - viewportRect.left;
    const screenY = clientY - viewportRect.top;
    const mapX = ((screenX - baseOffsetX) / viewScale - this.transform.panX) / oldZoom;
    const mapY = ((screenY - baseOffsetY) / viewScale - this.transform.panY) / oldZoom;

    const scaledWidth = mapWidth * viewScale * newZoom;
    const scaledHeight = mapHeight * viewScale * newZoom;
    const scaledX = newZoom * mapX;  // viewBox units after zoom (not multiplied by viewScale)
    const scaledY = newZoom * mapY;

    // Calculate pan to keep the cursor position stationary:
    //   screen = (scaledX + pan) * renderScale + baseOffset
    //   pan = (screen - baseOffset) / renderScale - scaledX
    let panX = (screenX - baseOffsetX) / viewScale - scaledX;
    let panY = (screenY - baseOffsetY) / viewScale - scaledY;

    // Clamp pan (in viewBox units) to keep map edges within container
    if (scaledWidth > containerWidth) {
      const maxPanX = -baseOffsetX / viewScale;
      const minPanX = (containerWidth - baseOffsetX) / viewScale - mapWidth * newZoom;
      panX = this.clamp(panX, minPanX, maxPanX);
      console.log("[MapViewport] adjustZoomAt clamped X", { minPanX, maxPanX, panX });
    } else {
      // Center the map when it's smaller than the container
      const centeredPanX = (containerWidth / 2 - baseOffsetX) / viewScale - (mapWidth * newZoom) / 2;
      panX = centeredPanX;
      console.log("[MapViewport] adjustZoomAt centering X", { panX });
    }

    if (scaledHeight > containerHeight) {
      const maxPanY = -baseOffsetY / viewScale;
      const minPanY = (containerHeight - baseOffsetY) / viewScale - mapHeight * newZoom;
      panY = this.clamp(panY, minPanY, maxPanY);
      console.log("[MapViewport] adjustZoomAt clamped Y", { minPanY, maxPanY, panY });
    } else {
      // Center the map when it's smaller than the container
      const centeredPanY = (containerHeight / 2 - baseOffsetY) / viewScale - (mapHeight * newZoom) / 2;
      panY = centeredPanY;
      console.log("[MapViewport] adjustZoomAt centering Y", { panY });
    }

    this.transform.zoom = newZoom;
    this.transform.panX = panX;
    this.transform.panY = panY;

    console.log("[MapViewport] adjustZoomAt applied", {
      delta,
      oldZoom,
      newZoom,
      screenX,
      screenY,
      mapX,
      mapY,
      viewScale,
      panX,
      panY
    });

    this.updateTransform();
  }

  /**
   * Pans the viewport by the specified pixel offsets.
   */
  pan(dx: number, dy: number): void {
    this.transform.panX += dx;
    this.transform.panY += dy;
    this.updateTransform();
  }

  /**
   * Returns the current viewport transformation state.
   */
  getTransform(): { zoom: number; panX: number; panY: number } {
    return { ...this.transform };
  }

  /**
   * Centers the viewport on the specified map coordinates.
   */
  centerOn(x: number, y: number): void {
    console.log("[MapViewport] centerOn called:", { x, y, currentTransform: { ...this.transform } });

    const canvas = this.mapElement.parentElement;
    if (!canvas) {
      console.warn("[MapViewport] centerOn: no parent canvas");
      console.warn("[MapViewport] centerOn: no parent canvas");
      return;
    }

    const viewport = canvas.parentElement instanceof HTMLElement ? canvas.parentElement : canvas;

    console.log("[MapViewport] Canvas element:", {
      tagName: canvas.tagName,
      id: canvas.id,
      className: canvas.className,
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight,
      offsetWidth: canvas.offsetWidth,
      offsetHeight: canvas.offsetHeight
    });

    console.log("[MapViewport] Viewport element:", {
      tagName: viewport.tagName,
      id: viewport.id,
      className: viewport.className,
      clientWidth: viewport.clientWidth,
      clientHeight: viewport.clientHeight,
      offsetWidth: viewport.offsetWidth,
      offsetHeight: viewport.offsetHeight
    });

    const viewportRect = viewport.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const containerWidth = viewport.clientWidth || viewportRect.width;
    const containerHeight = viewport.clientHeight || viewportRect.height;
    const baseOffsetX = canvasRect.left - viewportRect.left;
    const baseOffsetY = canvasRect.top - viewportRect.top;
    console.log("[MapViewport] Viewport dimensions (used for centering):", { containerWidth, containerHeight });
    console.log("[MapViewport] Base canvas offsets relative to viewport:", { baseOffsetX, baseOffsetY });

    if (containerWidth === 0 || containerHeight === 0) {
      console.warn("[MapViewport] centerOn: container has 0 width or height", { containerWidth, containerHeight });
      console.warn("[MapViewport] centerOn: container has 0 width or height");
      return;
    }

    const { width: mapWidth, height: mapHeight } = this.getMapDimensions();
    const zoom = this.transform.zoom;
    const clientWidth = this.mapElement.clientWidth || this.mapElement.getBoundingClientRect().width;
    const clientHeight = this.mapElement.clientHeight || this.mapElement.getBoundingClientRect().height;
    // Render scale comes from layout size vs viewBox; zoom is applied on top via CSS matrix.
    const scaleX = mapWidth === 0 ? 1 : clientWidth / mapWidth;
    const scaleY = mapHeight === 0 ? 1 : clientHeight / mapHeight;
    const renderScale = Math.min(scaleX || 1, scaleY || 1);
    console.log("[MapViewport] Map dimensions:", { mapWidth, mapHeight, renderedWidth: clientWidth, renderedHeight: clientHeight, renderScale, zoom });

    if (mapWidth === 0 || mapHeight === 0) {
      console.warn("[MapViewport] centerOn: map has 0 width or height", { mapWidth, mapHeight });
      console.warn("[MapViewport] centerOn: map has 0 width or height");
      return;
    }

    const scaledWidth = mapWidth * renderScale * zoom;
    const scaledHeight = mapHeight * renderScale * zoom;
    const containerCenterX = containerWidth / 2;
    const containerCenterY = containerHeight / 2;

    console.log("[MapViewport] Zoom and scaling:", { zoom, renderScale, scaledWidth, scaledHeight, containerCenterX, containerCenterY });

    // With transform-origin at (0,0), transform-box: view-box, and CSS matrix(zoom,0,0,zoom,panX,panY):
    // - The matrix operates in viewBox coordinate space (not screen pixels)
    // - A viewBox point (x,y) transforms to viewBox (zoom*x + panX, zoom*y + panY)
    // - Then maps to screen: ((zoom*x + panX) * renderScale + baseOffsetX, ...)
    //
    // To center viewBox coordinate (x,y) at screen position containerCenter:
    //   (zoom*x + panX) * renderScale + baseOffsetX = containerCenterX
    //   panX = (containerCenterX - baseOffsetX) / renderScale - zoom*x
    const scaledX = zoom * x;  // viewBox units after zoom
    const scaledY = zoom * y;
    let panX = (containerCenterX - baseOffsetX) / renderScale - scaledX;
    let panY = (containerCenterY - baseOffsetY) / renderScale - scaledY;

    console.log("[MapViewport] centerOn calculation details:", {
      x,
      y,
      zoom,
      renderScale,
      baseOffsetX,
      baseOffsetY,
      containerCenterX,
      containerCenterY,
      scaledX,
      scaledY,
      calculatedPanX: panX,
      calculatedPanY: panY,
      formula: "panX = (containerCenterX - baseOffsetX) / renderScale - zoom * x"
    });
    console.log("[MapViewport] Before clamping:", { panX, panY, zoom });

    const overflowTolerance = 0.5; // ignore float noise when sizes are effectively equal

    // Clamp pan values (in viewBox units) to keep map edges within container bounds.
    // With transform: screen = (viewBox * zoom + pan) * renderScale + baseOffset
    // Constraints:
    //   Left edge: (0 + panX) * renderScale + baseOffsetX >= 0  →  panX >= -baseOffsetX / renderScale
    //   Right edge: (mapWidth * zoom + panX) * renderScale + baseOffsetX <= containerWidth
    //               →  panX <= (containerWidth - baseOffsetX) / renderScale - mapWidth * zoom
    if (scaledWidth - containerWidth > overflowTolerance) {
      const maxPanX = -baseOffsetX / renderScale;
      const minPanX = (containerWidth - baseOffsetX) / renderScale - mapWidth * zoom;
      panX = this.clamp(panX, minPanX, maxPanX);
      console.log("[MapViewport] Clamped X:", { minPanX, maxPanX, panX });
    }

    if (scaledHeight - containerHeight > overflowTolerance) {
      const maxPanY = -baseOffsetY / renderScale;
      const minPanY = (containerHeight - baseOffsetY) / renderScale - mapHeight * zoom;
      panY = this.clamp(panY, minPanY, maxPanY);
      console.log("[MapViewport] Clamped Y:", { minPanY, maxPanY, panY });
    }

    // Verify: calculate where the target point will actually appear on screen
    const targetScreenX = (scaledX + panX) * renderScale + baseOffsetX;
    const targetScreenY = (scaledY + panY) * renderScale + baseOffsetY;
    console.log("[MapViewport] Target vs container centre:", {
      targetScreenX,
      targetScreenY,
      containerCenterX,
      containerCenterY,
      deltaX: targetScreenX - containerCenterX,
      deltaY: targetScreenY - containerCenterY
    });

    this.transform.panX = panX;
    this.transform.panY = panY;

    console.log("[MapViewport] Calling updateTransform with:", this.transform);
    this.updateTransform();
  }

  /**
   * Applies the current transform to the map element.
   */
  private updateTransform(): void {
    const { zoom, panX, panY } = this.transform;
    // Ensure transforms are anchored to the top-left to keep pan and zoom math linear.
    this.mapElement.style.transformOrigin = "0 0";
    // Crucial for SVG: make transform origin and scaling relative to the viewBox (0,0) instead of the content bbox.
    // Without this, the origin drifts by the content's bounding-box offset (e.g., ~51px horizontally),
    // which manifests as the target hex appearing pinned to the right edge.
    this.mapElement.style.setProperty("transform-box", "view-box");
    // Use a CSS matrix to avoid ambiguity in transform order.
    this.mapElement.style.transform = `matrix(${zoom}, 0, 0, ${zoom}, ${panX}, ${panY})`;
    const rect = this.mapElement.getBoundingClientRect();
    console.log("[MapViewport] updateTransform applied", {
      zoom,
      panX,
      panY,
      cssTransform: this.mapElement.style.transform,
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      }
    });
  }

  /**
   * Clamps a value between min and max.
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private computeViewportContext(): {
    viewport: HTMLElement;
    canvas: HTMLElement;
    containerWidth: number;
    containerHeight: number;
    baseOffsetX: number;
    baseOffsetY: number;
    mapWidth: number;
    mapHeight: number;
    viewScale: number;
    zoom: number;
  } | null {
    const canvas = this.mapElement.parentElement;
    if (!canvas) {
      console.warn("[MapViewport] computeViewportContext: no parent canvas");
      return null;
    }

    const viewport = canvas.parentElement instanceof HTMLElement ? canvas.parentElement : canvas;
    const viewportRect = viewport.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const containerWidth = viewport.clientWidth || viewportRect.width;
    const containerHeight = viewport.clientHeight || viewportRect.height;
    const baseOffsetX = canvasRect.left - viewportRect.left;
    const baseOffsetY = canvasRect.top - viewportRect.top;

    if (containerWidth === 0 || containerHeight === 0) {
      console.warn("[MapViewport] computeViewportContext: container has 0 size", { containerWidth, containerHeight });
      return null;
    }

    const { width: mapWidth, height: mapHeight } = this.getMapDimensions();
    const zoom = this.transform.zoom;
    const renderedRect = this.mapElement.getBoundingClientRect();
    const scaleX = mapWidth === 0 ? 1 : renderedRect.width / (mapWidth * zoom);
    const scaleY = mapHeight === 0 ? 1 : renderedRect.height / (mapHeight * zoom);
    const viewScale = Math.min(scaleX || 1, scaleY || 1);

    if (mapWidth === 0 || mapHeight === 0) {
      console.warn("[MapViewport] computeViewportContext: map has 0 size", { mapWidth, mapHeight });
      return null;
    }

    return {
      viewport,
      canvas,
      containerWidth,
      containerHeight,
      baseOffsetX,
      baseOffsetY,
      mapWidth,
      mapHeight,
      viewScale,
      zoom
    };
  }

  /**
   * Derives the current map pixel dimensions from the SVG so pan clamping reflects the rendered canvas bounds.
   */
  private getMapDimensions(): { width: number; height: number } {
    // Prefer the SVG viewBox so our pan math stays in the same coordinate space as the cx/cy dataset values.
    const viewBox = this.mapElement.viewBox.baseVal;
    if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
      console.log("[MapViewport] getMapDimensions: using viewBox (primary)", { width: viewBox.width, height: viewBox.height });
      return { width: viewBox.width, height: viewBox.height };
    }

    // Fallback to getBBox when the SVG lacks an explicit viewBox (e.g., legacy renders or tests).
    const bbox = this.mapElement.getBBox?.();
    if (bbox && bbox.width > 0 && bbox.height > 0) {
      console.log("[MapViewport] getMapDimensions: using getBBox (fallback)", { width: bbox.width, height: bbox.height });
      return { width: bbox.width, height: bbox.height };
    }

    // Fallback to width/height attributes
    const attrWidth = parseFloat(this.mapElement.getAttribute("width") ?? "0");
    const attrHeight = parseFloat(this.mapElement.getAttribute("height") ?? "0");
    if (attrWidth > 0 && attrHeight > 0) {
      console.log("[MapViewport] getMapDimensions: using width/height attributes (fallback)", { width: attrWidth, height: attrHeight });
      return { width: attrWidth, height: attrHeight };
    }

    // Last resort: getBoundingClientRect (includes transforms)
    const rect = this.mapElement.getBoundingClientRect();
    console.log("[MapViewport] getMapDimensions: using getBoundingClientRect (last resort)", { width: rect.width, height: rect.height });
    return { width: rect.width, height: rect.height };
  }
}
