import type { ScenarioData } from "../core/types";

/**
 * Interface for rendering hex-based battle maps.
 * Abstracts the rendering implementation from consumers.
 */
export interface IMapRenderer {
  /**
   * Renders the complete hex map into the provided SVG and canvas elements.
   * @param svg - The SVG element to render the map into
   * @param canvas - The container div for layout calculations
   * @param data - The scenario data containing map information
   */
  render(svg: SVGSVGElement, canvas: HTMLDivElement, data: ScenarioData): void;

  /**
   * Initializes or re-initializes the map rendering.
   * @param force - If true, forces a complete re-render even if already initialized
   */
  initialize(force?: boolean): void;

  /**
   * Caches DOM references to hex elements for efficient access.
   */
  cacheHexReferences(): void;

  /**
   * Retrieves a cached hex element by its key.
   * @param key - The hex coordinate key (e.g., "5,3")
   * @returns The SVG group element for the hex, or undefined if not found
   */
  getHexElement(key: string): SVGGElement | undefined;
}
