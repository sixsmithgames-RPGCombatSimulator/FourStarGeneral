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
      console.error("[MapViewport] adjustZoomAt failed: viewport context unavailable", {
        delta,
        clientX,
        clientY
      });
      return;
    }

    const {
      viewport,
      containerWidth,
      containerHeight,
      baseOffsetX,
      baseOffsetY,
      renderScale,
      contentOffsetX,
      contentOffsetY,
      elementWidth,
      elementHeight,
      zoom: currentZoom
    } = context;

    const oldZoom = currentZoom;
    const newZoom = this.clamp(currentZoom + delta, this.MIN_ZOOM, this.MAX_ZOOM);
    if (newZoom === oldZoom) {
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const screenX = clientX - viewportRect.left;
    const screenY = clientY - viewportRect.top;
    const mapX = ((screenX - baseOffsetX - this.transform.panX) / oldZoom - contentOffsetX) / renderScale;
    const mapY = ((screenY - baseOffsetY - this.transform.panY) / oldZoom - contentOffsetY) / renderScale;

    const scaledElementWidth = elementWidth * newZoom;
    const scaledElementHeight = elementHeight * newZoom;
    const scaledX = newZoom * (contentOffsetX + renderScale * mapX);
    const scaledY = newZoom * (contentOffsetY + renderScale * mapY);

    let panX = screenX - baseOffsetX - scaledX;
    let panY = screenY - baseOffsetY - scaledY;

    const overflowTolerance = 0.5;

    if (scaledElementWidth - containerWidth > overflowTolerance) {
      const maxPanX = -baseOffsetX;
      const minPanX = containerWidth - baseOffsetX - scaledElementWidth;
      panX = this.clamp(panX, minPanX, maxPanX);
      console.log("[MapViewport] adjustZoomAt clamped X", { minPanX, maxPanX, panX });
    }

    if (scaledElementHeight - containerHeight > overflowTolerance) {
      const maxPanY = -baseOffsetY;
      const minPanY = containerHeight - baseOffsetY - scaledElementHeight;
      panY = this.clamp(panY, minPanY, maxPanY);
      console.log("[MapViewport] adjustZoomAt clamped Y", { minPanY, maxPanY, panY });
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
      renderScale,
      contentOffsetX,
      contentOffsetY,
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
   *
   * CRITICAL: This function performs complex coordinate transformations from viewBox space to screen space.
   * The coordinate system depends on CSS transform-box: view-box being set on the SVG element.
   *
   * Coordinate Transformation Formula:
   *   screen = (viewBox * zoom + pan) * renderScale + baseOffset
   *
   * To center a viewBox point (x, y) at screen center:
   *   panX = (containerCenterX - baseOffsetX) / renderScale - zoom * x
   *   panY = (containerCenterY - baseOffsetY) / renderScale - zoom * y
   *
   * Key Concepts:
   * - viewBox coordinates: (x, y) input parameters, in SVG viewBox space
   * - zoom: Applied via CSS matrix in viewBox coordinate space
   * - pan: Translation in viewBox units (NOT pixels)
   * - renderScale: Ratio of element size to viewBox size
   * - baseOffset: Canvas position relative to viewport container
   *
   * Clamping:
   * - Pan values are clamped to keep map edges within viewport bounds
   * - Prevents camera from panning completely off the map
   * - Uses overflowTolerance to handle float precision issues
   *
   * CSS Requirements:
   * - transform-origin: 0 0 (anchor to top-left)
   * - transform-box: view-box (CRITICAL: use viewBox coordinates, not bbox)
   * - transform: matrix(zoom, 0, 0, zoom, panX, panY)
   *
   * @param x - ViewBox X coordinate (from hex cell dataset.cx)
   * @param y - ViewBox Y coordinate (from hex cell dataset.cy)
   *
   * @see docs/CAMERA_FOCUS_BUG_POSTMORTEM.md for detailed explanation
   * @see updateTransform() for CSS transform application
   */
  centerOn(x: number, y: number): void {
    const context = this.computeViewportContext();
    if (!context) {
      console.error("[MapViewport] centerOn failed: viewport context unavailable");
      return;
    }

    const {
      canvas,
      viewport,
      containerWidth,
      containerHeight,
      baseOffsetX,
      baseOffsetY,
      renderScale,
      contentOffsetX,
      contentOffsetY,
      elementWidth,
      elementHeight,
      zoom
    } = context;

    const scaledElementWidth = elementWidth * zoom;
    const scaledElementHeight = elementHeight * zoom;
    const containerCenterX = containerWidth / 2;
    const containerCenterY = containerHeight / 2;

    const scaledX = zoom * (contentOffsetX + renderScale * x);
    const scaledY = zoom * (contentOffsetY + renderScale * y);
    let panX = containerCenterX - baseOffsetX - scaledX;
    let panY = containerCenterY - baseOffsetY - scaledY;

    const overflowTolerance = 0.5; // ignore float noise when sizes are effectively equal

    if (scaledElementWidth - containerWidth > overflowTolerance) {
      const maxPanX = -baseOffsetX;
      const minPanX = containerWidth - baseOffsetX - scaledElementWidth;
      panX = this.clamp(panX, minPanX, maxPanX);
    }

    if (scaledElementHeight - containerHeight > overflowTolerance) {
      const maxPanY = -baseOffsetY;
      const minPanY = containerHeight - baseOffsetY - scaledElementHeight;
      panY = this.clamp(panY, minPanY, maxPanY);
    }

    this.transform.panX = panX;
    this.transform.panY = panY;

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
    renderScale: number;
    contentOffsetX: number;
    contentOffsetY: number;
    elementWidth: number;
    elementHeight: number;
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

    if (mapWidth === 0 || mapHeight === 0) {
      console.warn("[MapViewport] computeViewportContext: map has 0 size", { mapWidth, mapHeight });
      return null;
    }

    const elementWidth = this.mapElement.clientWidth;
    const elementHeight = this.mapElement.clientHeight;
    if (elementWidth === 0 || elementHeight === 0) {
      console.warn("[MapViewport] computeViewportContext: map element has 0 layout size", {
        elementWidth,
        elementHeight
      });
      return null;
    }

    const scaleX = elementWidth / mapWidth;
    const scaleY = elementHeight / mapHeight;
    const renderScale = Math.min(scaleX, scaleY);
    const contentOffsetX = (elementWidth - mapWidth * renderScale) / 2;
    const contentOffsetY = (elementHeight - mapHeight * renderScale) / 2;

    return {
      viewport,
      canvas,
      containerWidth,
      containerHeight,
      baseOffsetX,
      baseOffsetY,
      mapWidth,
      mapHeight,
      renderScale,
      contentOffsetX,
      contentOffsetY,
      elementWidth,
      elementHeight,
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
      return { width: viewBox.width, height: viewBox.height };
    }

    // Fallback to getBBox when the SVG lacks an explicit viewBox (e.g., legacy renders or tests).
    const bbox = this.mapElement.getBBox?.();
    if (bbox && bbox.width > 0 && bbox.height > 0) {
      return { width: bbox.width, height: bbox.height };
    }

    // Fallback to width/height attributes
    const attrWidth = parseFloat(this.mapElement.getAttribute("width") ?? "0");
    const attrHeight = parseFloat(this.mapElement.getAttribute("height") ?? "0");
    if (attrWidth > 0 && attrHeight > 0) {
      return { width: attrWidth, height: attrHeight };
    }

    // Last resort: getBoundingClientRect (includes transforms)
    const rect = this.mapElement.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }
}
