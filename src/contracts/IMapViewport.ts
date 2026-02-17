/**
 * Interface for managing map viewport transformations (zoom, pan).
 * Provides consistent viewport control across different implementations.
 */
export interface IMapViewport {
  /**
   * Resets the viewport to default zoom and position.
   */
  reset(): void;

  /**
   * Adjusts the zoom level by the specified delta.
   * @param delta - The amount to change zoom (positive to zoom in, negative to zoom out)
   */
  adjustZoom(delta: number): void;

  /**
   * Pans the viewport by the specified pixel offsets.
   * @param dx - Horizontal pan distance in pixels
   * @param dy - Vertical pan distance in pixels
   */
  pan(dx: number, dy: number): void;

  /**
   * Returns the current viewport transformation state.
   */
  getTransform(): { zoom: number; panX: number; panY: number };

  /**
   * Centers the viewport on the specified map coordinates.
   * @param x - The X coordinate in map space
   * @param y - The Y coordinate in map space
   */
  centerOn(x: number, y: number): void;
}
