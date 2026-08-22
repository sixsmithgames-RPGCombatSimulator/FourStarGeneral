import { CAMPAIGN_HEX_SCALE_KM, type CampaignScenarioData, type CampaignTileInstance, type CampaignForceGroup } from "../core/campaignTypes";
import type { CampaignEnemyContactView, CampaignMapViewModel } from "../core/campaignIntelTypes";
import { HEX_RADIUS, HEX_WIDTH } from "../core/balance";
import { CoordinateSystem } from "./CoordinateSystem";
import { getSpriteForScenarioType } from "../data/unitSpriteCatalog";

const SVG_NS = "http://www.w3.org/2000/svg";
const HEX_STROKE = "#0e1a2b";
const HEX_STROKE_WIDTH = 0.75;
const BACKGROUND_LAYER_ID = "campaign-map-background";
const HEX_LAYER_ID = "campaign-map-hexes";
const TERRAIN_OVERLAY_LAYER_ID = "campaign-map-terrain-overlay";
const SPRITE_LAYER_ID = "campaign-map-sprites";
const FRONT_LAYER_ID = "campaign-map-fronts";
const FORCE_LAYER_ID = "campaign-map-forces";
const INTEL_COVERAGE_LAYER_ID = "campaign-map-intel-coverage";
const INTEL_CONTACT_LAYER_ID = "campaign-map-intel-contacts";
const KNOWN_SITE_LAYER_ID = "campaign-map-known-sites";
const LOCATION_LABEL_LAYER_ID = "campaign-map-location-labels";
const FRIENDLY_BASE_DISCLOSURE_LAYER_ID = "campaign-map-friendly-base-disclosures";
const MAX_CAMPAIGN_FORCE_ACTORS = 4;
const FORMATIONS_PER_CAMPAIGN_ACTOR = 3;

/** Maps sprite keys declared in campaign data to asset URLs (PNG sprites). */
const CAMPAIGN_SPRITES: Record<string, string> = {
  airbase: new URL("../assets/campaign/Airbase_Land_Large.png", import.meta.url).href,
  navalBase: new URL("../assets/campaign/Naval_base_large.png", import.meta.url).href,
  logisticsHub: new URL("../assets/campaign/Military_Base_Large.png", import.meta.url).href,
  fortificationHeavy: new URL("../assets/campaign/Fortifications -- Heavy -- Land -- small.png", import.meta.url).href,
  fortificationLight: new URL("../assets/campaign/Fortifications -- Light -- Land -- small.png", import.meta.url).href
};

export type CampaignHexClickHandler = (
  hexKey: string,
  tile: CampaignTileInstance | null,
  contactId?: string
) => void;

/**
 * Responsible for rendering the strategic campaign map on top of a static background illustration.
 * Unlike the tactical renderer, this class focuses on clean overlays and large-scale markers.
 */
export class CampaignMapRenderer {
  private svgElement: SVGSVGElement | null = null;
  private canvasElement: HTMLDivElement | null = null;
  private scenario: CampaignScenarioData | null = null;
  private viewModel: CampaignMapViewModel | null = null;
  private tileIndex = new Map<string, CampaignTileInstance>();
  private hexGroups = new Map<string, SVGGElement>();
  private spriteIndex = new Map<string, SVGImageElement>();
  private hexClickHandler: CampaignHexClickHandler | null = null;
  private boundClickListener: ((event: MouseEvent) => void) | null = null;
  private boundKeydownListener: ((event: KeyboardEvent) => void) | null = null;
  /** Single pan/zoom transform owner recreated on each render (see MapViewport). */
  private viewportRoot: SVGGElement | null = null;
  private gridBounds: { minX: number; maxX: number; minY: number; maxY: number } | null = null;

  /** Stores the dimensions in pixels so callers can size viewports accordingly. */
  private mapPixelWidth = 0;
  private mapPixelHeight = 0;

  private usesRegisteredFlatTopGrid(): boolean {
    return this.scenario?.background.gridLayout === "flatTopOddQ";
  }

  /** Radius and origin for a regular flat-top odd-q lattice registered to the full image bounds. */
  private getRegisteredGridGeometry(): { radius: number; originX: number; originY: number } | null {
    if (!this.scenario || !this.usesRegisteredFlatTopGrid()) return null;
    const { cols, rows } = this.scenario.dimensions;
    if (cols <= 0 || rows <= 0) return null;
    const radiusForWidth = this.mapPixelWidth / (2 + 1.5 * (cols - 1));
    const radiusForHeight = this.mapPixelHeight / (Math.sqrt(3) * (rows + 0.5));
    const radius = Math.min(radiusForWidth, radiusForHeight);
    const gridWidth = radius * (2 + 1.5 * (cols - 1));
    const gridHeight = Math.sqrt(3) * radius * (rows + 0.5);
    return {
      radius,
      originX: (this.mapPixelWidth - gridWidth) / 2 + radius,
      originY: (this.mapPixelHeight - gridHeight) / 2 + Math.sqrt(3) * radius / 2
    };
  }

  private registeredHexCenter(col: number, row: number): { x: number; y: number } | null {
    const geometry = this.getRegisteredGridGeometry();
    if (!geometry) return null;
    return {
      x: geometry.originX + 1.5 * geometry.radius * col,
      y: geometry.originY + Math.sqrt(3) * geometry.radius * (row + 0.5 * Math.abs(col % 2))
    };
  }

  /**
   * Computes pixel width/height using existing hex math and campaign dimensions.
   * Exported so screens can calculate scroll container sizes without invoking render.
   */
  static estimatePixelBounds(cols: number, rows: number): { width: number; height: number } {
    // We piggy-back on the tactical hex metrics (HEX_WIDTH/HEIGHT) baked into CoordinateSystem so the campaign map
    // retains consistent layout math with the battle renderer while operating at a larger narrative scale.
    const { x: maxX } = CoordinateSystem.axialToPixel(cols - 1, Math.floor((rows - 1) / 2));
    const { y: maxY } = CoordinateSystem.axialToPixel(0, rows - 1);
    const margin = 32;
    return { width: maxX + margin, height: maxY + margin };
  }

  /** Computes the unscaled grid bounds using the same hex math but with a caller-supplied margin. */
  private estimatePixelBoundsWithMargin(cols: number, rows: number, margin: number): { width: number; height: number } {
    const { x: maxX } = CoordinateSystem.axialToPixel(cols - 1, Math.floor((rows - 1) / 2));
    const { y: maxY } = CoordinateSystem.axialToPixel(0, rows - 1);
    return { width: maxX + margin, height: maxY + margin };
  }

  /**
   * Calculates pixel dimensions for the campaign map. Native dimensions are the authoritative
   * artwork registration surface; scenario.hexScaleKm owns geographic scale independently.
   */
  private derivePixelDimensions(scenario: CampaignScenarioData): { width: number; height: number } {
    const { background } = scenario;
    if (background.nativeWidth && background.nativeHeight) {
      return { width: background.nativeWidth, height: background.nativeHeight };
    }
    return CampaignMapRenderer.estimatePixelBounds(scenario.dimensions.cols, scenario.dimensions.rows);
  }

  /**
   * Strategic map needs breathing room around hex outlines so the border hexes align with the art's coastline. We use a larger buffer when
   * rendering against native artwork (scrolling viewport) to prevent sprites from hugging edges.
   */
  private computeHexMargin(): number {
    // With optimized density calculation, we need minimal margin
    return this.mapPixelWidth >= 1024 ? 64 : 32;
  }

  /** Returns a multiplicative bias used to make the grid appear denser without changing scenario dimensions. */
  private computeGridScaleBias(): number {
    return 1.0;
  }

  /**
   * Controls how aggressively to densify the campaign grid (1.0 = original tactical size).
   *
   * Because odd-q creates a parallelogram, we must calculate density based on the
   * parallelogram's BOUNDING BOX, not just the grid dimensions.
   *
   * For a 78×48 grid:
   *   - Unscaled parallelogram: ~6776×6120 pixels
   *   - Target map size: 1024×768 pixels
   *   - Required density: ~0.15 (hexes become ~15% of tactical size)
   *
   * This fits the complete authored grid; strategic distance remains governed by scenario.hexScaleKm.
   */
  private getHexDensityScalar(): number {
    if (!this.scenario || !Number.isFinite(this.mapPixelWidth)) {
      return 1.0;
    }

    const registered = this.getRegisteredGridGeometry();
    if (registered) return registered.radius / HEX_RADIUS;

    const { cols, rows } = this.scenario.dimensions;

    // Check all 4 corners of the parallelogram to find the true bounding box.
    // Note: Top-right corner has NEGATIVE y coordinate due to odd-q math!
    const corners = [
      CoordinateSystem.offsetToAxial(0, 0),           // (0, 0)
      CoordinateSystem.offsetToAxial(cols - 1, 0),    // (4822, -2736)
      CoordinateSystem.offsetToAxial(0, rows - 1),    // (1954, 3384)
      CoordinateSystem.offsetToAxial(cols - 1, rows - 1) // (6776, 648)
    ];

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    corners.forEach(({ q, r }) => {
      const { x, y } = CoordinateSystem.axialToPixel(q, r);
      // Account for hex radius when calculating bounds
      minX = Math.min(minX, x - HEX_WIDTH / 2);
      maxX = Math.max(maxX, x + HEX_WIDTH / 2);
      minY = Math.min(minY, y - HEX_RADIUS);
      maxY = Math.max(maxY, y + HEX_RADIUS);
    });

    const gridWidthUnscaled = maxX - minX;   // ~6817 pixels
    const gridHeightUnscaled = maxY - minY;  // ~6168 pixels

    // Calculate what density would make the grid fit the map
    const densityForWidth = this.mapPixelWidth / gridWidthUnscaled;   // ~0.150
    const densityForHeight = this.mapPixelHeight / gridHeightUnscaled; // ~0.125

    // Use the smaller density to ensure the grid fits within the map
    const density = Math.min(densityForWidth, densityForHeight);

    return Math.max(0.05, Math.min(2.0, density));
  }

  /**
   * Determines how many overscan rings we need so the parallelogram grid fully covers the rectangular map.
   * Since odd-q creates a parallelogram, we need significant padding to ensure full coverage.
   */
  private resolveGridPadding(scenario: CampaignScenarioData, _margin: number, _density: number): number {
    const { cols, rows } = scenario.dimensions;

    // For a parallelogram grid to cover a rectangle, we need padding roughly equal to
    // half the grid dimensions to ensure corners are covered
    const basePadding = Math.max(Math.floor(cols / 3), Math.floor(rows / 3), 20);

    return basePadding;
  }

  /**
   * Renders the campaign map using the supplied SVG + canvas container.
   * Background image loads beneath hex outlines, followed by strategic sprites.
   */
  render(svg: SVGSVGElement, canvas: HTMLDivElement, viewModel: CampaignMapViewModel): void {
    const scenario = viewModel.scenario;
    this.svgElement = svg;
    this.canvasElement = canvas;
    this.scenario = scenario;
    this.viewModel = structuredClone(viewModel);

    this.tileIndex.clear();
    this.hexGroups.clear();
    this.spriteIndex.clear();

    scenario.tiles.forEach((tile) => {
      const { col, row } = CoordinateSystem.axialToOffset(tile.hex.q, tile.hex.r);
      const key = CoordinateSystem.makeHexKey(col, row);
      this.tileIndex.set(key, tile);
    });

    const { width, height } = this.derivePixelDimensions(scenario);
    this.mapPixelWidth = width;
    this.mapPixelHeight = height;

    // Keep the HTML canvas sized to the actual illustration so scrollbars expose the full theater art without scaling artifacts.
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    // Expose the authoritative scenario scale so UI helpers can explain strategic distance.
    canvas.dataset.campaignHexScaleKm = String(scenario.hexScaleKm ?? CAMPAIGN_HEX_SCALE_KM);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", `${width}`);
    svg.setAttribute("height", `${height}`);

    svg.innerHTML = "";
    // All rendered layers live under a single #viewportRoot group. MapViewport applies
    // pan/zoom transforms ONLY to this group — without it, zoom/pan controls are inert.
    const viewportRoot = document.createElementNS(SVG_NS, "g");
    viewportRoot.id = "viewportRoot";
    svg.appendChild(viewportRoot);
    this.viewportRoot = viewportRoot;
    const backgroundGroup = this.ensureLayer(viewportRoot, BACKGROUND_LAYER_ID);
    const hexGroup = this.ensureLayer(viewportRoot, HEX_LAYER_ID);
    const terrainOverlayGroup = this.ensureLayer(viewportRoot, TERRAIN_OVERLAY_LAYER_ID);
    const spriteGroup = this.ensureLayer(viewportRoot, SPRITE_LAYER_ID);
    const frontGroup = this.ensureLayer(viewportRoot, FRONT_LAYER_ID);
    const locationLabelGroup = this.ensureLayer(viewportRoot, LOCATION_LABEL_LAYER_ID);
    const forceGroup = this.ensureLayer(viewportRoot, FORCE_LAYER_ID);
    const friendlyBaseDisclosureGroup = this.ensureLayer(viewportRoot, FRIENDLY_BASE_DISCLOSURE_LAYER_ID);
    const coverageGroup = this.ensureLayer(viewportRoot, INTEL_COVERAGE_LAYER_ID);
    const knownSiteGroup = this.ensureLayer(viewportRoot, KNOWN_SITE_LAYER_ID);
    const contactGroup = this.ensureLayer(viewportRoot, INTEL_CONTACT_LAYER_ID);

    const density = this.getHexDensityScalar();

    this.gridBounds = null;

    this.renderBackground(backgroundGroup, scenario);
    this.renderHexGrid(hexGroup, scenario, density);
    this.renderTerrainOverlay(terrainOverlayGroup, scenario);
    this.renderFronts(frontGroup, scenario);
    this.renderSprites(spriteGroup, scenario);
    this.renderForceGroups(forceGroup, scenario);
    this.renderFriendlyBaseDisclosures(friendlyBaseDisclosureGroup, scenario);
    this.renderIntelCoverage(coverageGroup, viewModel);
    this.renderKnownStrategicSites(knownSiteGroup, viewModel);
    this.renderIntelContacts(contactGroup, viewModel);
    this.renderNamedLocations(locationLabelGroup, scenario);

    const bounds = this.gridBounds;
    if (!bounds) {
      return;
    }

    const { minX, maxX, minY, maxY } = bounds;
    const overlayWidth = maxX - minX;
    const overlayHeight = maxY - minY;
    if (overlayWidth <= 0 || overlayHeight <= 0) {
      return;
    }

    // Grid is already scaled and positioned. Just offset to align with map edges.
    // Position so (0,0) is at top-left corner of map
    const offsetX = -minX;
    const offsetY = -minY;

    const transform = `translate(${offsetX.toFixed(3)}, ${offsetY.toFixed(3)})`;
    hexGroup.setAttribute("transform", transform);
    terrainOverlayGroup.setAttribute("transform", transform);
    frontGroup.setAttribute("transform", transform);
    spriteGroup.setAttribute("transform", transform);
    forceGroup.setAttribute("transform", transform);
    friendlyBaseDisclosureGroup.setAttribute("transform", transform);
    coverageGroup.setAttribute("transform", transform);
    knownSiteGroup.setAttribute("transform", transform);
    contactGroup.setAttribute("transform", transform);
    locationLabelGroup.setAttribute("transform", transform);
    this.bindInteraction();
  }

  /** Shows or hides the collection-coverage overlay without hiding contact markers. */
  setIntelCoverageVisible(visible: boolean): void {
    if (!this.svgElement) return;
    const layer = this.svgElement.querySelector<SVGGElement>(`#${INTEL_COVERAGE_LAYER_ID}`);
    if (layer) layer.style.display = visible ? "block" : "none";
  }

  /** Keeps contact symbology in the dedicated Intelligence workspace instead of crowding operations. */
  setIntelContactsVisible(visible: boolean): void {
    if (!this.svgElement) return;
    const layer = this.svgElement.querySelector<SVGGElement>(`#${INTEL_CONTACT_LAYER_ID}`);
    if (layer) layer.style.display = visible ? "block" : "none";
  }

  /** Allow UI modules to react when the player clicks a campaign hex. */
  onHexClick(handler: CampaignHexClickHandler | null): void {
    this.hexClickHandler = handler;
    this.bindInteraction();
  }

  /** Highlights an objective or front by adding a CSS class to the hex group. */
  highlightHex(hexKey: string, className: string): void {
    const group = this.hexGroups.get(hexKey);
    if (!group) {
      return;
    }
    group.classList.add(className);
  }

  /** Clears a highlight class from a specific hex. */
  clearHighlight(hexKey: string, className: string): void {
    const group = this.hexGroups.get(hexKey);
    if (!group) {
      return;
    }
    group.classList.remove(className);
  }

  /** Removes highlight class from all tracked hexes. */
  clearAllHighlights(className: string): void {
    this.hexGroups.forEach((group) => group.classList.remove(className));
  }

  /** Returns the pixel center of a given hex so overlays can animate focus. */
  getHexCenter(hexKey: string): { cx: number; cy: number } | null {
    const group = this.hexGroups.get(hexKey);
    if (!group) {
      return null;
    }
    const cx = Number(group.dataset.cx ?? NaN);
    const cy = Number(group.dataset.cy ?? NaN);
    if (Number.isNaN(cx) || Number.isNaN(cy)) {
      return null;
    }
    return { cx, cy };
  }

  /** Toggles the terrain overlay visibility (water/land coloring for edit mode). */
  setTerrainOverlayVisible(visible: boolean): void {
    if (!this.svgElement) return;
    const layer = this.svgElement.querySelector<SVGGElement>(`#${TERRAIN_OVERLAY_LAYER_ID}`);
    if (layer) {
      layer.style.display = visible ? "block" : "none";
    }
  }

  /** Updates the terrain overlay to reflect current waterHexes data. */
  refreshTerrainOverlay(): void {
    if (!this.svgElement || !this.scenario) return;
    const layer = this.svgElement.querySelector<SVGGElement>(`#${TERRAIN_OVERLAY_LAYER_ID}`);
    if (!layer) return;

    const extents = this.scenario.mapExtents;
    const waterHexSet = new Set(extents?.waterHexes ?? []);
    const zoneWaterRows = new Set<number>();

    if (waterHexSet.size === 0 && extents?.zones) {
      extents.zones.forEach((zone) => {
        if (zone.terrain !== "water") return;
        for (let r = zone.rMin; r <= zone.rMax; r += 1) {
          zoneWaterRows.add(r);
        }
      });
    }

    // Update existing terrain polygons
    layer.querySelectorAll<SVGPolygonElement>("polygon[data-hex-key]").forEach(polygon => {
      const hexKey = polygon.getAttribute("data-hex-key");
      if (!hexKey) return;

      const [, rPart] = hexKey.split(",");
      const r = Number(rPart);
      const isWater = waterHexSet.has(hexKey) || (Number.isFinite(r) && zoneWaterRows.has(r));
      polygon.setAttribute("fill", isWater ? "rgba(0, 100, 200, 0.25)" : "rgba(50, 150, 50, 0.15)");
      polygon.setAttribute("data-terrain", isWater ? "water" : "unmarked");
    });
  }

  private ensureLayer(parent: SVGSVGElement | SVGGElement, id: string): SVGGElement {
    let layer = parent.querySelector<SVGGElement>(`#${id}`);
    if (!layer) {
      layer = document.createElementNS(SVG_NS, "g");
      layer.id = id;
      parent.appendChild(layer);
    }
    layer.innerHTML = "";
    return layer;
  }

  /** Returns the transform root created during the last render, so MapViewport can re-bind after re-renders. */
  getViewportRoot(): SVGGElement | null {
    return this.viewportRoot;
  }

  /** Injects the campaign background illustration. */
  private renderBackground(layer: SVGGElement, scenario: CampaignScenarioData): void {
    const image = document.createElementNS(SVG_NS, "image");
    image.id = `${BACKGROUND_LAYER_ID}-image`;
    image.setAttribute("href", scenario.background.imageUrl);
    image.setAttribute("width", String(this.mapPixelWidth));
    image.setAttribute("height", String(this.mapPixelHeight));
    const hasNative = Boolean(scenario.background.nativeWidth && scenario.background.nativeHeight);
    // Registered artwork must preserve every contour at its native aspect ratio.
    if (scenario.background.gridLayout === "flatTopOddQ") {
      image.setAttribute("preserveAspectRatio", "xMidYMid meet");
    } else if (hasNative) {
      image.setAttribute("preserveAspectRatio", "none");
    } else {
      const stretchMode = scenario.background.stretchMode ?? "cover";
      const preserve = stretchMode === "contain" ? "xMidYMid meet" : stretchMode === "stretch" ? "none" : "xMidYMid slice";
      image.setAttribute("preserveAspectRatio", preserve);
    }
    layer.appendChild(image);
  }

  /**
   * Draws transparent hex outlines so the strategic map retains hex context.
   *
   * CHALLENGE: Odd-q offset coordinates create a PARALLELOGRAM, not a rectangle.
   * For a 78×48 grid, the corners map to these pixel positions:
   *   - Top-Left (0,0):     pixel (0, 0)
   *   - Top-Right (77,0):   pixel (4822, -2736) ← NEGATIVE Y!
   *   - Bottom-Left (0,47): pixel (1954, 3384)
   *   - Bottom-Right (77,47): pixel (6776, 648)
   *
   * This creates a diamond-shaped grid ~6776×6120 pixels that must cover a 1024×768 rectangle.
   *
   * SOLUTION: Render hexes OUTSIDE the official 0-77, 0-47 range to fill the corners,
   * then clip to only show hexes within the map's pixel bounds.
   */
  private renderHexGrid(layer: SVGGElement, scenario: CampaignScenarioData, density: number): void {
    const { cols, rows } = scenario.dimensions;

    if (this.usesRegisteredFlatTopGrid()) {
      const geometry = this.getRegisteredGridGeometry();
      if (!geometry) return;
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const center = this.registeredHexCenter(col, row);
          if (!center) continue;
          const hexKey = CoordinateSystem.makeHexKey(col, row);
          const group = document.createElementNS(SVG_NS, "g");
          group.dataset.hex = hexKey;
          group.dataset.cx = String(center.x);
          group.dataset.cy = String(center.y);
          group.classList.add("campaign-hex");

          const outline = document.createElementNS(SVG_NS, "polygon");
          outline.setAttribute("points", this.buildFlatTopHexPolygon(center.x, center.y, geometry.radius));
          outline.setAttribute("fill", "rgba(14, 26, 43, 0.035)");
          outline.setAttribute("stroke", HEX_STROKE);
          outline.setAttribute("stroke-width", String(HEX_STROKE_WIDTH));
          group.appendChild(outline);
          layer.appendChild(group);
          this.hexGroups.set(hexKey, group);
        }
      }
      this.gridBounds = { minX: 0, maxX: this.mapPixelWidth, minY: 0, maxY: this.mapPixelHeight };
      return;
    }

    // Extend rendering range far beyond official coordinates to ensure corner coverage.
    // Official gameplay hexes: 0-77 cols, 0-47 rows
    // Visual coverage hexes: -78 to 155 cols, -78 to 125 rows (marked with CSS class)
    const padding = Math.max(cols, rows); // 78 hexes of padding
    const rowStart = -padding;  // -78
    const rowEnd = rows + padding;  // 126
    const colStart = -padding;  // -78
    const colEnd = cols + padding;  // 155

    // No offset needed - position hex (0,0) at the coordinate origin
    // The transform applied later will align the grid with the map edges
    const offsetX = 0;
    const offsetY = 0;

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    // Target coverage area in scaled pixels
    const targetMinX = 0;
    const targetMaxX = this.mapPixelWidth;
    const targetMinY = 0;
    const targetMaxY = this.mapPixelHeight;

    // Render all hexes whose centers fall within the target pixel bounds
    for (let row = rowStart; row < rowEnd; row += 1) {
      for (let col = colStart; col < colEnd; col += 1) {
        const { q, r } = CoordinateSystem.offsetToAxial(col, row);
        const { x, y } = CoordinateSystem.axialToPixel(q, r);
        const cx = (x + offsetX) * density;
        const cy = (y + offsetY) * density;

        // Only render hexes whose centers are within or near the map bounds
        const margin = HEX_RADIUS * density * 1.5;
        if (cx >= targetMinX - margin && cx <= targetMaxX + margin &&
            cy >= targetMinY - margin && cy <= targetMaxY + margin) {

          const hexKey = CoordinateSystem.makeHexKey(col, row);
          const polygon = this.buildHexPolygon(cx, cy, density);

          const group = document.createElementNS(SVG_NS, "g");
          group.dataset.hex = hexKey;
          group.dataset.cx = String(cx);
          group.dataset.cy = String(cy);
          group.classList.add("campaign-hex");

          // Mark hexes outside the official range
          const isOfficial = col >= 0 && col < cols && row >= 0 && row < rows;
          if (!isOfficial) {
            group.classList.add("campaign-hex-padding");
          }

          const outline = document.createElementNS(SVG_NS, "polygon");
          outline.setAttribute("points", polygon);
          outline.setAttribute("fill", "rgba(14, 26, 43, 0.05)");
          outline.setAttribute("stroke", HEX_STROKE);
          outline.setAttribute("stroke-width", String(HEX_STROKE_WIDTH));

          group.appendChild(outline);
          layer.appendChild(group);
          this.hexGroups.set(hexKey, group);

          const halfWidth = (HEX_WIDTH / 2) * density;
          const radius = HEX_RADIUS * density;
          minX = Math.min(minX, cx - halfWidth);
          maxX = Math.max(maxX, cx + halfWidth);
          minY = Math.min(minY, cy - radius);
          maxY = Math.max(maxY, cy + radius);
        }
      }
    }

    if (minX !== Number.POSITIVE_INFINITY && maxX !== Number.NEGATIVE_INFINITY && minY !== Number.POSITIVE_INFINITY && maxY !== Number.NEGATIVE_INFINITY) {
      this.gridBounds = { minX, maxX, minY, maxY };
    }
  }

  private buildHexPolygon(cx: number, cy: number, scale: number): string {
    const halfWidth = (HEX_WIDTH / 2) * scale;
    const radius = HEX_RADIUS * scale;
    const points: Array<[number, number]> = [
      [cx, cy - radius],
      [cx + halfWidth, cy - radius / 2],
      [cx + halfWidth, cy + radius / 2],
      [cx, cy + radius],
      [cx - halfWidth, cy + radius / 2],
      [cx - halfWidth, cy - radius / 2]
    ];
    return points.map(([px, py]) => `${px},${py}`).join(" ");
  }

  private buildFlatTopHexPolygon(cx: number, cy: number, radius: number): string {
    const halfHeight = Math.sqrt(3) * radius / 2;
    const points: Array<[number, number]> = [
      [cx + radius, cy],
      [cx + radius / 2, cy + halfHeight],
      [cx - radius / 2, cy + halfHeight],
      [cx - radius, cy],
      [cx - radius / 2, cy - halfHeight],
      [cx + radius / 2, cy - halfHeight]
    ];
    return points.map(([px, py]) => `${px},${py}`).join(" ");
  }

  private buildActiveHexPolygon(cx: number, cy: number, density: number): string {
    const registered = this.getRegisteredGridGeometry();
    return registered
      ? this.buildFlatTopHexPolygon(cx, cy, registered.radius)
      : this.buildHexPolygon(cx, cy, density);
  }

  /**
   * Renders terrain overlay showing water hexes in blue and unmarked hexes in subtle green.
   * Only visible in edit mode.
   * Uses the same extended rendering range as the hex grid to cover the full rectangular viewport.
   */
  private renderTerrainOverlay(layer: SVGGElement, scenario: CampaignScenarioData): void {
    // This layer is initially hidden - edit mode will toggle visibility
    layer.style.display = "none";
    layer.setAttribute("data-edit-overlay", "true");
    layer.style.pointerEvents = "none";

    const { cols, rows } = scenario.dimensions;
    const extents = scenario.mapExtents;
    const waterHexSet = new Set(extents?.waterHexes ?? []);
    const zoneWaterRows = new Set<number>();

    // When no explicit waterHexes are authored, fall back to row-based zones so designers immediately
    // see approximate water regions (e.g., the English Channel band) in edit mode.
    if (waterHexSet.size === 0 && extents?.zones) {
      extents.zones.forEach((zone) => {
        if (zone.terrain !== "water") return;
        for (let r = zone.rMin; r <= zone.rMax; r += 1) {
          zoneWaterRows.add(r);
        }
      });
    }
    const density = this.getHexDensityScalar();

    if (this.usesRegisteredFlatTopGrid()) {
      const geometry = this.getRegisteredGridGeometry();
      if (!geometry) return;
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const center = this.registeredHexCenter(col, row);
          if (!center) continue;
          const { q, r } = CoordinateSystem.offsetToAxial(col, row);
          const axialKey = `${q},${r}`;
          const isWater = waterHexSet.has(axialKey);
          const hexagon = document.createElementNS(SVG_NS, "polygon");
          hexagon.setAttribute("points", this.buildFlatTopHexPolygon(center.x, center.y, geometry.radius));
          hexagon.setAttribute("fill", isWater ? "rgba(0, 100, 200, 0.25)" : "rgba(50, 150, 50, 0.15)");
          hexagon.setAttribute("stroke", "none");
          hexagon.setAttribute("data-hex-key", axialKey);
          hexagon.setAttribute("data-terrain", isWater ? "water" : "unmarked");
          layer.appendChild(hexagon);
        }
      }
      return;
    }

    // Use same extended range as hex grid to cover full rectangular viewport
    const padding = Math.max(cols, rows);
    const rowStart = -padding;
    const rowEnd = rows + padding;
    const colStart = -padding;
    const colEnd = cols + padding;

    // Target coverage area in scaled pixels
    const targetMinX = 0;
    const targetMaxX = this.mapPixelWidth;
    const targetMinY = 0;
    const targetMaxY = this.mapPixelHeight;

    // Render all hexes whose centers fall within the target pixel bounds
    for (let row = rowStart; row < rowEnd; row += 1) {
      for (let col = colStart; col < colEnd; col += 1) {
        const { q, r } = CoordinateSystem.offsetToAxial(col, row);
        const { x, y } = CoordinateSystem.axialToPixel(q, r);
        const cx = x * density;
        const cy = y * density;

        // Skip hexes outside the visible map area
        if (cx < targetMinX || cx > targetMaxX || cy < targetMinY || cy > targetMaxY) {
          continue;
        }

        const hexKey = `${q},${r}`;
        const isWater = waterHexSet.has(hexKey) || zoneWaterRows.has(r);

        const hexagon = document.createElementNS(SVG_NS, "polygon");
        hexagon.setAttribute("points", this.buildHexPolygon(cx, cy, density));
        hexagon.setAttribute("fill", isWater ? "rgba(0, 100, 200, 0.25)" : "rgba(50, 150, 50, 0.15)");
        hexagon.setAttribute("stroke", "none");
        hexagon.setAttribute("data-hex-key", hexKey);
        hexagon.setAttribute("data-terrain", isWater ? "water" : "unmarked");

        layer.appendChild(hexagon);
      }
    }
  }

  /** Drops strategic sprites (bases, fleets) onto the map using campaign palette metadata. */
  private renderSprites(layer: SVGGElement, scenario: CampaignScenarioData): void {
    const density = this.getHexDensityScalar();
    // Scale icon size based on hex size - icons should fill most of the hex without overlapping neighbors
    const iconSize = HEX_RADIUS * density * 1.6;

    scenario.tiles.forEach((instance) => {
      const { col, row } = CoordinateSystem.axialToOffset(instance.hex.q, instance.hex.r);
      const hexKey = CoordinateSystem.makeHexKey(col, row);
      const group = this.hexGroups.get(hexKey);
      if (!group) {
        return;
      }

      const paletteEntry = scenario.tilePalette[instance.tile];
      const spriteKey = instance.spriteKey ?? paletteEntry?.spriteKey;
      if (!spriteKey) {
        return;
      }

      const cx = Number(group.dataset.cx ?? NaN);
      const cy = Number(group.dataset.cy ?? NaN);
      if (Number.isNaN(cx) || Number.isNaN(cy)) {
        return;
      }

      const markerLabel = paletteEntry?.notes && (paletteEntry.factionControl === "Player" || paletteEntry.intelConfirmed)
        ? paletteEntry.notes.trim()
        : this.formatMarkerLabel(paletteEntry?.role ?? spriteKey);
      if (spriteKey === "taskForce") {
        this.renderTaskForce(layer, hexKey, cx, cy, iconSize, instance.rotation ?? 0, markerLabel);
        return;
      }

      const asset = CAMPAIGN_SPRITES[spriteKey];
      if (!asset) {
        console.warn("[CampaignMapRenderer] Unknown sprite key", { spriteKey, hexKey });
        return;
      }

      const image = document.createElementNS(SVG_NS, "image");
      image.setAttribute("href", asset);
      image.setAttribute("width", String(iconSize));
      image.setAttribute("height", String(iconSize));
      image.setAttribute("x", String(cx - iconSize / 2));
      image.setAttribute("y", String(cy - iconSize / 2));
      if (this.isFriendlyInstallation(instance, scenario) && Boolean(paletteEntry?.mapLabel?.trim())) {
        // The focusable disclosure marker owns the interactive accessible name.
        image.setAttribute("aria-hidden", "true");
      } else {
        image.setAttribute("role", "img");
        image.setAttribute("aria-label", `${markerLabel} · hex ${hexKey}`);
      }
      image.classList.add("campaign-sprite");

      // Apply rotation if specified
      const rotation = instance.rotation ?? 0;
      if (rotation !== 0) {
        image.setAttribute("transform", `rotate(${rotation} ${cx} ${cy})`);
      }

      // Associate the sprite with its hex so clicks on the icon can be resolved to the correct tile.
      image.setAttribute("data-hex", hexKey);

      layer.appendChild(image);
      this.spriteIndex.set(hexKey, image);
    });
  }

  /** Renders a naval formation with authored ship art instead of an abstract strategic emblem. */
  private renderTaskForce(
    layer: SVGGElement,
    hexKey: string,
    cx: number,
    cy: number,
    iconSize: number,
    rotation: number,
    markerLabel: string
  ): void {
    const facing = this.campaignFacingForRotation(rotation);
    const battleship = getSpriteForScenarioType("Battleship", "Player", facing);
    const transport = getSpriteForScenarioType("Transport_Ship", "Player", facing);
    const destroyer = getSpriteForScenarioType("Destroyer", "Player", facing);
    if (!battleship || !transport || !destroyer) {
      console.error("[CampaignMapRenderer] Naval task force sprites are unavailable.", { facing, hexKey });
      return;
    }

    const marker = document.createElementNS(SVG_NS, "g");
    marker.classList.add("campaign-sprite", "campaign-task-force");
    marker.setAttribute("data-hex", hexKey);
    marker.setAttribute("data-facing", facing);
    marker.setAttribute("role", "img");
    marker.setAttribute("aria-label", `${markerLabel} · hex ${hexKey}`);

    const addShip = (asset: string, width: number, height: number, dx: number, dy: number, className: string): SVGImageElement => {
      const ship = document.createElementNS(SVG_NS, "image");
      ship.setAttribute("href", asset);
      ship.setAttribute("width", String(width));
      ship.setAttribute("height", String(height));
      ship.setAttribute("x", String(cx + dx - width / 2));
      ship.setAttribute("y", String(cy + dy - height / 2));
      ship.setAttribute("preserveAspectRatio", "xMidYMid meet");
      ship.setAttribute(
        "style",
        "filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.95)) drop-shadow(0 0 3px rgba(175, 225, 245, 0.9));"
      );
      ship.setAttribute("aria-hidden", "true");
      ship.setAttribute("data-hex", hexKey);
      ship.classList.add("campaign-task-force__ship", className);
      marker.appendChild(ship);
      return ship;
    };

    const station = document.createElementNS(SVG_NS, "circle");
    station.setAttribute("cx", String(cx));
    station.setAttribute("cy", String(cy));
    station.setAttribute("r", String(iconSize * 0.42));
    station.setAttribute("fill", "rgba(7, 25, 38, 0.5)");
    station.setAttribute("stroke", "rgba(120, 210, 235, 0.78)");
    station.setAttribute("stroke-width", String(Math.max(0.9, iconSize * 0.035)));
    station.setAttribute("data-hex", hexKey);
    station.setAttribute("data-authoritative-anchor", "true");
    station.setAttribute("aria-hidden", "true");
    station.classList.add("campaign-task-force__station");
    marker.appendChild(station);

    const primaryShip = addShip(battleship, iconSize * 1.34, iconSize * 0.94, 0, 0, "campaign-task-force__battleship");
    addShip(transport, iconSize * 0.96, iconSize * 0.68, -iconSize * 1.38, -iconSize * 0.66, "campaign-task-force__transport");
    addShip(transport, iconSize * 0.96, iconSize * 0.68, -iconSize * 1.06, iconSize * 0.82, "campaign-task-force__transport");
    addShip(destroyer, iconSize * 1.02, iconSize * 0.48, iconSize * 1.06, -iconSize * 0.82, "campaign-task-force__destroyer");
    addShip(destroyer, iconSize * 1.02, iconSize * 0.48, iconSize * 1.38, iconSize * 0.66, "campaign-task-force__destroyer");
    if (facing.endsWith("W")) {
      marker.setAttribute("transform", `translate(${2 * cx} 0) scale(-1 1)`);
    }
    layer.appendChild(marker);
    this.spriteIndex.set(hexKey, primaryShip);
  }

  /** Maps clockwise SVG rotation to the nearest six-direction unit-sprite facing. */
  private campaignFacingForRotation(rotation: number): "NE" | "E" | "SE" | "SW" | "W" | "NW" {
    const normalized = ((rotation % 360) + 360) % 360;
    if (normalized >= 30 && normalized < 90) return "SE";
    if (normalized >= 90 && normalized < 150) return "SW";
    if (normalized >= 150 && normalized < 210) return "W";
    if (normalized >= 210 && normalized < 270) return "NW";
    if (normalized >= 270 && normalized < 330) return "NE";
    return "E";
  }

  /** Returns true only for a player-visible fixed installation that can own progressive map disclosure. */
  private isFriendlyInstallation(instance: CampaignTileInstance, scenario: CampaignScenarioData): boolean {
    const palette = scenario.tilePalette[instance.tile];
    const controller = instance.factionControl ?? palette?.factionControl;
    const role = palette?.role;
    return controller === this.viewModel?.observerFaction
      && (role === "airbase" || role === "logisticsHub" || role === "navalBase");
  }

  /**
   * Adds one focusable interaction anchor per friendly base without permanently painting its name over the map.
   * The disclosure is intentionally projection-only: ready aggregate groups are safe, while scheduled identities stay in the inspector.
   */
  private renderFriendlyBaseDisclosures(layer: SVGGElement, scenario: CampaignScenarioData): void {
    const density = this.getHexDensityScalar();
    const iconSize = HEX_RADIUS * density * 1.6;
    const fontSize = 12;
    const titleSize = 15;
    const lineHeight = 15;

    scenario.tiles.forEach((instance) => {
      if (!this.isFriendlyInstallation(instance, scenario)) return;
      const palette = scenario.tilePalette[instance.tile];
      const baseName = palette?.mapLabel?.trim();
      if (!palette || !baseName) return;
      const { col, row } = CoordinateSystem.axialToOffset(instance.hex.q, instance.hex.r);
      const hexKey = CoordinateSystem.makeHexKey(col, row);
      const center = this.getHexCenter(hexKey);
      if (!center) return;

      const readyForces = this.resolveForces(instance, scenario)?.filter((force) => force.count > 0) ?? [];
      const forceLines = readyForces.slice(0, 2).map((force) => (
        `${this.formatMarkerLabel(force.label ?? force.unitType)} · ${force.count}`
      ));
      if (readyForces.length > 2) forceLines.push(`+${readyForces.length - 2} more formation groups`);
      if (forceLines.length === 0) forceLines.push("No formations currently ready");
      const roleLabel = this.formatMarkerLabel(palette.role);
      const disclosureLines = [roleLabel, ...forceLines, "Select for full roster"];
      const longestLine = [baseName, ...disclosureLines].reduce((longest, line) => Math.max(longest, line.length), 0);
      const cardWidth = Math.min(300, Math.max(168, longestLine * fontSize * 0.56 + 28));
      const cardHeight = 19 + disclosureLines.length * lineHeight + 12;
      const gap = Math.max(12, iconSize * 0.95);
      const prefersRight = center.cx < this.mapPixelWidth * 0.58;
      const unclampedX = prefersRight ? center.cx + gap : center.cx - gap - cardWidth;
      const cardX = Math.max(6, Math.min(this.mapPixelWidth - cardWidth - 6, unclampedX));
      const cardY = Math.max(6, Math.min(this.mapPixelHeight - cardHeight - 6, center.cy - cardHeight / 2));
      const cardEdgeX = prefersRight ? cardX : cardX + cardWidth;
      const triggerRadius = Math.max(16, iconSize * 0.55, HEX_RADIUS * density * 0.76);
      const formationSummary = readyForces.length > 0
        ? readyForces.map((force) => `${force.count} ${this.formatMarkerLabel(force.label ?? force.unitType)}`).join(", ")
        : "no formations currently ready";
      const accessibleName = `${baseName}, ${roleLabel}, ${formationSummary}. Select for base and formation details.`;

      const marker = document.createElementNS(SVG_NS, "g");
      marker.classList.add("campaign-base-marker");
      marker.setAttribute("data-hex", hexKey);
      marker.setAttribute("data-base-name", baseName);
      marker.setAttribute("data-disclosure-side", prefersRight ? "right" : "left");
      marker.setAttribute("role", "button");
      marker.setAttribute("tabindex", "0");
      marker.setAttribute("aria-label", accessibleName);

      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = accessibleName;
      marker.appendChild(title);

      const hitTarget = document.createElementNS(SVG_NS, "circle");
      hitTarget.classList.add("campaign-base-marker__hit-target");
      hitTarget.setAttribute("cx", String(center.cx));
      hitTarget.setAttribute("cy", String(center.cy));
      hitTarget.setAttribute("r", String(triggerRadius));
      hitTarget.setAttribute("fill", "rgba(0, 0, 0, 0.001)");
      hitTarget.setAttribute("stroke", "transparent");
      hitTarget.setAttribute("pointer-events", "all");
      hitTarget.setAttribute("data-hex", hexKey);
      hitTarget.setAttribute("aria-hidden", "true");
      marker.appendChild(hitTarget);

      const focusRing = document.createElementNS(SVG_NS, "circle");
      focusRing.classList.add("campaign-base-marker__focus-ring");
      focusRing.setAttribute("cx", String(center.cx));
      focusRing.setAttribute("cy", String(center.cy));
      focusRing.setAttribute("r", String(triggerRadius));
      focusRing.setAttribute("fill", "rgba(82, 177, 131, 0.12)");
      focusRing.setAttribute("stroke", "#8bd3a9");
      focusRing.setAttribute("stroke-width", "1.5");
      focusRing.setAttribute("vector-effect", "non-scaling-stroke");
      focusRing.setAttribute("pointer-events", "none");
      focusRing.setAttribute("aria-hidden", "true");
      marker.appendChild(focusRing);

      const disclosure = document.createElementNS(SVG_NS, "g");
      disclosure.classList.add("campaign-base-disclosure");
      disclosure.setAttribute("data-base-disclosure", hexKey);
      disclosure.setAttribute("pointer-events", "none");
      disclosure.setAttribute("aria-hidden", "true");

      const connector = document.createElementNS(SVG_NS, "line");
      connector.setAttribute("x1", String(center.cx + (prefersRight ? triggerRadius : -triggerRadius)));
      connector.setAttribute("y1", String(center.cy));
      connector.setAttribute("x2", String(cardEdgeX));
      connector.setAttribute("y2", String(Math.max(cardY + 10, Math.min(cardY + cardHeight - 10, center.cy))));
      connector.setAttribute("stroke", "rgba(139, 211, 169, 0.9)");
      connector.setAttribute("stroke-width", "1.4");
      connector.setAttribute("vector-effect", "non-scaling-stroke");
      disclosure.appendChild(connector);

      const backdrop = document.createElementNS(SVG_NS, "rect");
      backdrop.setAttribute("x", String(cardX));
      backdrop.setAttribute("y", String(cardY));
      backdrop.setAttribute("width", String(cardWidth));
      backdrop.setAttribute("height", String(cardHeight));
      backdrop.setAttribute("rx", "7");
      backdrop.setAttribute("fill", "rgba(10, 18, 18, 0.96)");
      backdrop.setAttribute("stroke", "rgba(209, 177, 96, 0.92)");
      backdrop.setAttribute("stroke-width", "1.25");
      backdrop.setAttribute("vector-effect", "non-scaling-stroke");
      disclosure.appendChild(backdrop);

      const heading = document.createElementNS(SVG_NS, "text");
      heading.textContent = baseName;
      heading.setAttribute("x", String(cardX + 11));
      heading.setAttribute("y", String(cardY + 17));
      heading.setAttribute("font-size", String(titleSize));
      heading.setAttribute("font-weight", "700");
      heading.setAttribute("fill", "#fff2c9");
      disclosure.appendChild(heading);

      disclosureLines.forEach((line, index) => {
        const text = document.createElementNS(SVG_NS, "text");
        text.textContent = line;
        text.setAttribute("x", String(cardX + 11));
        text.setAttribute("y", String(cardY + 34 + index * lineHeight));
        text.setAttribute("font-size", String(index === disclosureLines.length - 1 ? fontSize - 1 : fontSize));
        text.setAttribute("font-weight", index === 0 ? "600" : "400");
        text.setAttribute("fill", index === disclosureLines.length - 1 ? "#d1b160" : "#d9e1d5");
        disclosure.appendChild(text);
      });

      marker.appendChild(disclosure);
      layer.appendChild(marker);
    });
  }

  private formatMarkerLabel(value: string): string {
    return value
      .replace(/_/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^./, (character) => character.toUpperCase());
  }

  /** Resolves the broad 1–4 actor strength grammar shared with the tactical map. */
  private resolveCampaignForceActorCount(totalFormations: number): number {
    return Math.max(
      1,
      Math.min(MAX_CAMPAIGN_FORCE_ACTORS, Math.ceil(totalFormations / FORMATIONS_PER_CAMPAIGN_ACTOR))
    );
  }

  /**
   * Allocates the limited visual actors across authored force groups.
   * Every represented type gets one actor before the remaining slots follow relative formation strength.
   */
  private resolveCampaignForceActors(forces: CampaignForceGroup[], actorCount: number): CampaignForceGroup[] {
    const actors: CampaignForceGroup[] = [];
    const assigned = new Map<string, number>();
    const seedCount = Math.min(actorCount, forces.length);

    for (let index = 0; index < seedCount; index += 1) {
      const force = forces[index];
      if (!force) continue;
      actors.push(force);
      assigned.set(force.unitType, 1);
    }

    while (actors.length < actorCount) {
      const next = forces.reduce<CampaignForceGroup | null>((best, force) => {
        if (!best) return force;
        const forceShare = force.count / ((assigned.get(force.unitType) ?? 0) + 1);
        const bestShare = best.count / ((assigned.get(best.unitType) ?? 0) + 1);
        return forceShare > bestShare ? force : best;
      }, null);
      if (!next) break;
      actors.push(next);
      assigned.set(next.unitType, (assigned.get(next.unitType) ?? 0) + 1);
    }

    return actors;
  }

  /** Returns a compact centered formation that stays inside the operational hex's safe circular inset. */
  private resolveCampaignForceLayout(actorCount: number, radius: number): Array<{ dx: number; dy: number }> {
    const spread = radius * 0.43;
    if (actorCount <= 1) return [{ dx: 0, dy: 0 }];
    if (actorCount === 2) {
      const pairSpread = radius * 0.34;
      return [{ dx: -pairSpread, dy: 0 }, { dx: pairSpread, dy: 0 }];
    }
    if (actorCount === 3) {
      return [
        { dx: 0, dy: -spread },
        { dx: -spread * 0.88, dy: spread * 0.55 },
        { dx: spread * 0.88, dy: spread * 0.55 }
      ];
    }
    return [
      { dx: 0, dy: -spread },
      { dx: spread, dy: 0 },
      { dx: 0, dy: spread },
      { dx: -spread, dy: 0 }
    ];
  }

  /** Renders each occupied operational hex as one centered, accessible strength formation. */
  private renderForceGroups(layer: SVGGElement, scenario: CampaignScenarioData): void {
    scenario.tiles.forEach((instance) => {
      const paletteEntry = scenario.tilePalette[instance.tile];
      const controller = instance.factionControl ?? paletteEntry?.factionControl;
      if (!controller || controller !== this.viewModel?.observerFaction || paletteEntry?.role === "taskForce") {
        return;
      }

      const forces = this.resolveForces(instance, scenario)?.filter((force) => force.count > 0) ?? [];
      if (!forces || forces.length === 0) {
        return;
      }

      const { col, row } = CoordinateSystem.axialToOffset(instance.hex.q, instance.hex.r);
      const hexKey = CoordinateSystem.makeHexKey(col, row);
      const group = this.hexGroups.get(hexKey);
      if (!group) {
        return;
      }

      const cx = Number(group.dataset.cx ?? NaN);
      const cy = Number(group.dataset.cy ?? NaN);
      if (Number.isNaN(cx) || Number.isNaN(cy)) {
        return;
      }

      const totalFormations = forces.reduce((total, force) => total + force.count, 0);
      const actorCount = this.resolveCampaignForceActorCount(totalFormations);
      const actors = this.resolveCampaignForceActors(forces, actorCount);
      const density = this.getHexDensityScalar();
      const safeRadius = (HEX_WIDTH / 2) * density * 0.85;
      const actorScaleByCount: Record<number, number> = { 1: 1.18, 2: 0.96, 3: 0.82, 4: 0.82 };
      const actorSize = safeRadius * (actorScaleByCount[actorCount] ?? 0.82);
      const layout = this.resolveCampaignForceLayout(actorCount, safeRadius);
      const composition = forces
        .map((force) => `${force.count} ${this.formatMarkerLabel(force.label ?? force.unitType)}`)
        .join(", ");
      const accessibleName = `Friendly force · ${totalFormations} formations · hex ${hexKey} · ${composition}`;

      const stack = document.createElementNS(SVG_NS, "g");
      stack.classList.add("campaign-force-stack");
      stack.setAttribute("data-hex", hexKey);
      stack.setAttribute("data-faction", controller);
      stack.setAttribute("data-formation-count", String(totalFormations));
      stack.setAttribute("data-actor-count", String(actorCount));
      stack.setAttribute("data-safe-radius", String(safeRadius));
      stack.setAttribute("role", "img");
      stack.setAttribute("aria-label", accessibleName);
      // The installation/hex beneath the visual formation remains the interaction owner.
      stack.setAttribute("pointer-events", "none");

      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = accessibleName;
      stack.appendChild(title);

      const footprint = document.createElementNS(SVG_NS, "circle");
      footprint.setAttribute("cx", String(cx));
      footprint.setAttribute("cy", String(cy));
      footprint.setAttribute("r", String(safeRadius));
      footprint.setAttribute("fill", "rgba(7, 18, 24, 0.24)");
      footprint.setAttribute("stroke", "rgba(137, 211, 169, 0.82)");
      footprint.setAttribute("stroke-width", String(Math.max(0.9, density * 4)));
      footprint.setAttribute("data-hex", hexKey);
      footprint.setAttribute("aria-hidden", "true");
      footprint.classList.add("campaign-force-stack__footprint");
      stack.appendChild(footprint);

      actors.forEach((force, index) => {
        const spriteFaction = controller === "Bot" ? "Bot" : controller === "Player" ? "Player" : undefined;
        const spriteUrl = getSpriteForScenarioType(force.unitType, spriteFaction);
        if (!spriteUrl) {
          return;
        }
        const position = layout[index] ?? { dx: 0, dy: 0 };
        const icon = document.createElementNS(SVG_NS, "image");
        icon.setAttribute("href", spriteUrl);
        icon.setAttribute("width", String(actorSize));
        icon.setAttribute("height", String(actorSize));
        icon.setAttribute("x", String(cx + position.dx - actorSize / 2));
        icon.setAttribute("y", String(cy + position.dy - actorSize / 2));
        icon.setAttribute("preserveAspectRatio", "xMidYMid meet");
        icon.setAttribute("aria-hidden", "true");
        icon.classList.add("campaign-force-icon", "campaign-force-stack__actor");
        icon.setAttribute("data-hex", hexKey);
        stack.appendChild(icon);
      });

      layer.appendChild(stack);
    });
  }

  /** Renders geographic names with a small collision-aware placement pass. */
  private renderNamedLocations(layer: SVGGElement, scenario: CampaignScenarioData): void {
    layer.style.pointerEvents = "none";
    const density = this.getHexDensityScalar();
    const fontSize = Math.max(5.5, density * 32);
    const inset = HEX_RADIUS * density * 0.8;
    type Placement = "above" | "below" | "left" | "right";
    type LabelBox = { left: number; right: number; top: number; bottom: number };
    const occupied: LabelBox[] = [];
    const intersects = (a: LabelBox, b: LabelBox): boolean => (
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    );
    const labeledTiles = scenario.tiles
      .map((instance) => ({ instance, palette: scenario.tilePalette[instance.tile] }))
      // Interactive formations and friendly bases carry identity through their sprite, disclosure, and inspector.
      // This layer stays geographic so permanent text never becomes a second entity layer.
      .filter(({ palette }) => palette?.mapLabel?.trim()
        && palette.role !== "taskForce"
        && !(palette.factionControl === this.viewModel?.observerFaction
          && (palette.role === "airbase" || palette.role === "logisticsHub" || palette.role === "navalBase")))
      .sort((a, b) => {
        const priority = (role: string): number => role === "navalBase" || role === "logisticsHub" ? 3 : role.startsWith("fortification") ? 2 : 1;
        return priority(b.palette.role) - priority(a.palette.role);
      });

    labeledTiles.forEach(({ instance, palette }) => {
      const label = palette.mapLabel?.trim();
      if (!label) return;
      const { col, row } = CoordinateSystem.axialToOffset(instance.hex.q, instance.hex.r);
      const hexKey = CoordinateSystem.makeHexKey(col, row);
      const center = this.getHexCenter(hexKey);
      if (!center) return;

      const preferred: Placement[] = palette.role === "region"
        ? ["above", "right", "left", "below"]
        : palette.role.startsWith("fortification")
          ? ["below", "above", "right", "left"]
          : ["right", "above", "below", "left"];
      const placements = preferred.filter((placement) => (
        !(col === 0 && placement === "left")
        && !(col === scenario.dimensions.cols - 1 && placement === "right")
      ));
      const estimatedWidth = fontSize * (label.length * 0.61 + 0.8);
      const estimatedHeight = fontSize * 1.2;
      const padding = fontSize * 0.38;
      let chosen: { placement: Placement; x: number; y: number; anchor: "start" | "middle" | "end"; box: LabelBox } | null = null;

      for (const placement of placements) {
        const anchor: "start" | "middle" | "end" = placement === "right" ? "start" : placement === "left" ? "end" : "middle";
        const x = center.cx + (placement === "right" ? inset : placement === "left" ? -inset : 0);
        const y = center.cy + (placement === "below" ? inset + fontSize * 0.72 : placement === "above" ? -inset + fontSize * 0.3 : fontSize * 0.3);
        const left = anchor === "start" ? x : anchor === "end" ? x - estimatedWidth : x - estimatedWidth / 2;
        const box = {
          left: left - padding,
          right: left + estimatedWidth + padding,
          top: y - estimatedHeight - padding,
          bottom: y + padding
        };
        if (box.left < 0 || box.right > this.mapPixelWidth || box.top < 0 || box.bottom > this.mapPixelHeight) continue;
        if (occupied.some((existing) => intersects(box, existing))) continue;
        chosen = { placement, x, y, anchor, box };
        break;
      }
      if (!chosen) return;
      occupied.push(chosen.box);

      const marker = document.createElementNS(SVG_NS, "g");
      marker.classList.add("campaign-map-location-label");
      marker.setAttribute("data-hex", hexKey);
      marker.setAttribute("data-placement", chosen.placement);
      marker.setAttribute("aria-hidden", "true");

      const text = document.createElementNS(SVG_NS, "text");
      text.textContent = label;
      text.setAttribute("x", String(chosen.x));
      text.setAttribute("y", String(chosen.y));
      text.setAttribute("text-anchor", chosen.anchor);
      text.setAttribute("font-size", String(fontSize));
      text.setAttribute("font-weight", "700");
      text.setAttribute("letter-spacing", String(Math.max(0.1, density * 0.75)));
      text.setAttribute("fill", "#fff1bd");
      text.setAttribute("stroke", "rgba(10, 16, 17, 0.96)");
      text.setAttribute("stroke-width", String(Math.max(0.8, density * 3.6)));
      text.setAttribute("paint-order", "stroke");
      marker.appendChild(text);
      layer.appendChild(marker);
    });
  }

  /** Renders the observing faction's collection footprint. Hidden by default and safe by construction. */
  private renderIntelCoverage(layer: SVGGElement, viewModel: CampaignMapViewModel): void {
    layer.style.display = "none";
    layer.style.pointerEvents = "none";
    const density = this.getHexDensityScalar();
    for (const coverage of viewModel.coverage) {
      const group = this.hexGroups.get(coverage.hexKey);
      if (!group) continue;
      const cx = Number(group.dataset.cx ?? NaN);
      const cy = Number(group.dataset.cy ?? NaN);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
      const polygon = document.createElementNS(SVG_NS, "polygon");
      polygon.setAttribute("points", this.buildActiveHexPolygon(cx, cy, density));
      polygon.setAttribute("fill",
        coverage.strength === "priority"
          ? "rgba(72, 200, 214, 0.28)"
          : coverage.strength === "observed"
            ? "rgba(72, 156, 214, 0.20)"
            : "rgba(120, 140, 170, 0.12)"
      );
      polygon.setAttribute("stroke", coverage.strength === "priority" ? "rgba(150, 245, 255, 0.72)" : "rgba(118, 190, 220, 0.42)");
      polygon.setAttribute("stroke-width", coverage.strength === "priority" ? "2" : "1");
      polygon.setAttribute("data-coverage", coverage.strength);
      polygon.setAttribute("data-hex", coverage.hexKey);
      layer.appendChild(polygon);
    }
  }

  /** Renders only sanitized contact views; no true enemy unit type or count reaches this layer. */
  private renderIntelContacts(layer: SVGGElement, viewModel: CampaignMapViewModel): void {
    const density = this.getHexDensityScalar();
    layer.setAttribute("aria-label", "Enemy intelligence contacts");
    viewModel.enemyContacts.forEach((contact) => {
      const hex = this.hexGroups.get(contact.locationHexKey);
      if (!hex) return;
      const cx = Number(hex.dataset.cx ?? NaN);
      const cy = Number(hex.dataset.cy ?? NaN);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;

      const marker = document.createElementNS(SVG_NS, "g");
      marker.classList.add("campaign-intel-contact", `intel-level-${contact.level}`, `intel-state-${contact.state}`);
      marker.setAttribute("data-contact-id", contact.id);
      marker.setAttribute("data-hex", contact.locationHexKey);
      marker.setAttribute("role", "button");
      marker.setAttribute("tabindex", "0");
      marker.setAttribute("aria-label", `${this.describeContactForAccessibility(contact)}. Select to review the assessment.`);

      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = `${this.describeContactForAccessibility(contact)}. Select to review the assessment.`;
      marker.appendChild(title);

      if (contact.uncertaintyRadius > 0) {
        const uncertainty = document.createElementNS(SVG_NS, "circle");
        const radius = HEX_RADIUS * density * (1.15 + contact.uncertaintyRadius * 1.45);
        uncertainty.setAttribute("cx", String(cx));
        uncertainty.setAttribute("cy", String(cy));
        uncertainty.setAttribute("r", String(radius));
        uncertainty.setAttribute("fill", "rgba(230, 177, 67, 0.08)");
        uncertainty.setAttribute("stroke", "rgba(238, 190, 85, 0.65)");
        uncertainty.setAttribute("stroke-width", contact.state === "disputed" ? "2.5" : "1.5");
        uncertainty.setAttribute("stroke-dasharray", contact.state === "current" ? "4 3" : "7 5");
        uncertainty.setAttribute("pointer-events", "none");
        uncertainty.setAttribute("aria-hidden", "true");
        uncertainty.classList.add("campaign-intel-uncertainty");
        marker.appendChild(uncertainty);
      }

      const sharesHexWithKnownSite = (viewModel.knownStrategicSites ?? [])
        .some((site) => site.locationHexKey === contact.locationHexKey);
      const markerCx = cx + (sharesHexWithKnownSite ? HEX_RADIUS * density * 0.38 : 0);
      const tokenRadius = HEX_RADIUS * density * (sharesHexWithKnownSite ? 0.36 : 0.54);
      const token = document.createElementNS(SVG_NS, "circle");
      token.setAttribute("cx", String(markerCx));
      token.setAttribute("cy", String(cy));
      token.setAttribute("r", String(tokenRadius));
      token.setAttribute("fill", contact.state === "stale"
        ? "rgba(35, 40, 47, 0.76)"
        : contact.state === "disputed"
          ? "rgba(77, 48, 88, 0.78)"
          : "rgba(44, 28, 24, 0.72)");
      token.setAttribute("stroke", contact.confidenceBand === "high" ? "#ffe1a0" : contact.confidenceBand === "medium" ? "#e6bd68" : "#c99a55");
      token.setAttribute("stroke-width", String(Math.max(0.9, density * (contact.level === "assessed" ? 7 : 5))));
      if (contact.state !== "current") token.setAttribute("stroke-dasharray", `${Math.max(1.5, density * 12)} ${Math.max(1, density * 8)}`);
      token.setAttribute("data-hex", contact.locationHexKey);
      token.setAttribute("aria-hidden", "true");
      marker.appendChild(token);

      const spriteUrl = this.resolveContactSprite(contact);
      if (spriteUrl) {
        const iconSize = tokenRadius * 1.55;
        const icon = document.createElementNS(SVG_NS, "image");
        icon.setAttribute("href", spriteUrl);
        icon.setAttribute("x", String(markerCx - iconSize / 2));
        icon.setAttribute("y", String(cy - iconSize / 2));
        icon.setAttribute("width", String(iconSize));
        icon.setAttribute("height", String(iconSize));
        icon.setAttribute("preserveAspectRatio", "xMidYMid meet");
        icon.setAttribute("opacity", contact.state === "stale" ? "0.58" : "0.88");
        icon.setAttribute("data-hex", contact.locationHexKey);
        icon.setAttribute("aria-hidden", "true");
        icon.classList.add("campaign-intel-contact__sprite");
        marker.appendChild(icon);
      } else {
        const diamond = document.createElementNS(SVG_NS, "polygon");
        const inset = tokenRadius * 0.46;
        diamond.setAttribute("points", [
          `${markerCx},${cy - inset}`,
          `${markerCx + inset},${cy}`,
          `${markerCx},${cy + inset}`,
          `${markerCx - inset},${cy}`
        ].join(" "));
        diamond.setAttribute("fill", "#e6bd68");
        diamond.setAttribute("opacity", "0.9");
        diamond.setAttribute("data-hex", contact.locationHexKey);
        diamond.setAttribute("aria-hidden", "true");
        marker.appendChild(diamond);
      }
      layer.appendChild(marker);
    });
  }

  /** Renders immutable briefing sites without consulting hidden runtime tiles. */
  private renderKnownStrategicSites(layer: SVGGElement, viewModel: CampaignMapViewModel): void {
    const density = this.getHexDensityScalar();
    layer.setAttribute("aria-label", "Briefed strategic sites");
    (viewModel.knownStrategicSites ?? []).forEach((site) => {
      const hex = this.hexGroups.get(site.locationHexKey);
      if (!hex) return;
      const cx = Number(hex.dataset.cx ?? NaN);
      const cy = Number(hex.dataset.cy ?? NaN);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;

      const marker = document.createElementNS(SVG_NS, "g");
      marker.classList.add("campaign-known-site");
      marker.setAttribute("data-known-site-id", site.id);
      marker.setAttribute("data-hex", site.locationHexKey);
      marker.setAttribute("role", "button");
      marker.setAttribute("tabindex", "0");
      marker.setAttribute(
        "aria-label",
        `${site.label}, briefed ${this.formatMarkerLabel(site.role).toLowerCase()}. Fixed location from ${site.sourceLabel}; current control and status unconfirmed.`
      );

      const sharesHexWithContact = viewModel.enemyContacts
        .some((contact) => contact.locationHexKey === site.locationHexKey);
      const markerCx = cx - (sharesHexWithContact ? HEX_RADIUS * density * 0.38 : 0);
      const ring = document.createElementNS(SVG_NS, "circle");
      const radius = HEX_RADIUS * density * (sharesHexWithContact ? 0.36 : 0.58);
      ring.setAttribute("cx", String(markerCx));
      ring.setAttribute("cy", String(cy));
      ring.setAttribute("r", String(radius));
      ring.setAttribute("fill", "rgba(24, 29, 32, 0.78)");
      ring.setAttribute("stroke", "#d1b468");
      ring.setAttribute("stroke-width", String(Math.max(1, density * 5)));
      ring.setAttribute("data-hex", site.locationHexKey);
      ring.setAttribute("aria-hidden", "true");
      marker.appendChild(ring);

      const asset = CAMPAIGN_SPRITES[site.spriteKey];
      if (asset) {
        const size = radius * 1.55;
        const image = document.createElementNS(SVG_NS, "image");
        image.setAttribute("href", asset);
        image.setAttribute("x", String(markerCx - size / 2));
        image.setAttribute("y", String(cy - size / 2));
        image.setAttribute("width", String(size));
        image.setAttribute("height", String(size));
        image.setAttribute("preserveAspectRatio", "xMidYMid meet");
        image.setAttribute("opacity", "0.84");
        image.setAttribute("data-hex", site.locationHexKey);
        image.setAttribute("aria-hidden", "true");
        image.classList.add("campaign-known-site__sprite");
        marker.appendChild(image);
      } else {
        const fallback = document.createElementNS(SVG_NS, "rect");
        const size = radius * 0.72;
        fallback.setAttribute("x", String(cx - size / 2));
        fallback.setAttribute("y", String(cy - size / 2));
        fallback.setAttribute("width", String(size));
        fallback.setAttribute("height", String(size));
        fallback.setAttribute("fill", "#d1b468");
        fallback.setAttribute("data-hex", site.locationHexKey);
        fallback.setAttribute("aria-hidden", "true");
        marker.appendChild(fallback);
      }
      layer.appendChild(marker);
    });
  }

  /** Resolves a broad assessed silhouette without receiving authoritative enemy unit truth. */
  private resolveContactSprite(contact: CampaignEnemyContactView): string | undefined {
    if (contact.level !== "identified" && contact.level !== "assessed") return undefined;
    const classification = contact.classificationBand?.toLowerCase() ?? "";
    if (!classification) return undefined;
    if (contact.domain === "air") return getSpriteForScenarioType("Interceptor", "Bot", "W");
    if (contact.domain === "naval") return getSpriteForScenarioType("Destroyer", "Bot", "W");
    if (contact.domain === "logistics") return getSpriteForScenarioType("Supply_Truck", "Bot", "W");
    if (classification.includes("armor")) return getSpriteForScenarioType("Medium_Tank", "Bot", "W");
    if (classification.includes("artillery")) return getSpriteForScenarioType("Artillery_105mm", "Bot", "W");
    if (classification.includes("infantry")) return getSpriteForScenarioType("Infantry_42", "Bot", "W");
    return undefined;
  }

  private describeContactForAccessibility(contact: CampaignEnemyContactView): string {
    const age = contact.ageSegments === 0 ? "current observation" : `${contact.ageSegments * 3} hours old`;
    const strength = contact.strengthBand ? `, ${contact.strengthBand} strength` : "";
    const radius = contact.uncertaintyRadius > 0
      ? `, within ${contact.uncertaintyRadius} ${contact.uncertaintyRadius === 1 ? "hex" : "hexes"}`
      : "";
    return `${contact.label}, ${contact.level}, ${contact.confidenceBand} confidence${strength}, ${age}, near ${contact.locationHexKey}${radius}`;
  }

  private resolveForces(instance: CampaignTileInstance, scenario: CampaignScenarioData): CampaignForceGroup[] | null {
    const paletteEntry = scenario.tilePalette[instance.tile];
    const baseForces = paletteEntry?.forces ?? [];
    const overrides = instance.forces ?? [];
    if (baseForces.length === 0 && overrides.length === 0) {
      return null;
    }

    const merged = new Map<string, CampaignForceGroup>();

    const applyGroup = (group: CampaignForceGroup): void => {
      if (!group || typeof group.unitType !== "string") {
        return;
      }
      const identity = `${group.unitType}\u0000${group.label ?? ""}`;
      const existing = merged.get(identity);
      if (existing) {
        existing.count += group.count;
      } else {
        merged.set(identity, { unitType: group.unitType, count: group.count, label: group.label });
      }
    };

    baseForces.forEach(applyGroup);
    overrides.forEach(applyGroup);

    return Array.from(merged.values()).sort((a, b) => b.count - a.count);
  }

  /** Draws derived shared-border segments, with authored center polylines retained as a legacy fallback. */
  private renderFronts(layer: SVGGElement, scenario: CampaignScenarioData): void {
    if (!scenario.fronts || scenario.fronts.length === 0) {
      return;
    }

    scenario.fronts.forEach((front) => {
      const color = front.initiative === "Player" ? "#5bc0ff" : front.initiative === "Bot" ? "#ff6b6b" : "#ffd166";
      if (front.edges && front.edges.length > 0) {
        const density = this.getHexDensityScalar();
        front.edges.forEach((edge, index) => {
          const friendly = this.getHexCenter(edge.friendlyHexKey);
          const opposing = this.getHexCenter(edge.opposingHexKey);
          if (!friendly || !opposing) return;
          const dx = opposing.cx - friendly.cx;
          const dy = opposing.cy - friendly.cy;
          const magnitude = Math.hypot(dx, dy);
          if (magnitude <= 0) return;
          const midpointX = (friendly.cx + opposing.cx) / 2;
          const midpointY = (friendly.cy + opposing.cy) / 2;
          const halfLength = HEX_RADIUS * density * 0.48;
          const perpendicularX = (-dy / magnitude) * halfLength;
          const perpendicularY = (dx / magnitude) * halfLength;
          const segment = document.createElementNS(SVG_NS, "line");
          segment.setAttribute("x1", String(midpointX - perpendicularX));
          segment.setAttribute("y1", String(midpointY - perpendicularY));
          segment.setAttribute("x2", String(midpointX + perpendicularX));
          segment.setAttribute("y2", String(midpointY + perpendicularY));
          segment.setAttribute("stroke", color);
          segment.setAttribute("stroke-width", "4.5");
          segment.setAttribute("stroke-linecap", "round");
          segment.setAttribute("opacity", "0.95");
          segment.setAttribute("pointer-events", "none");
          segment.setAttribute("data-front-edge", `${edge.friendlyHexKey}|${edge.opposingHexKey}`);
          segment.classList.add("campaign-front", `front-${front.key}`, "campaign-front-edge");
          if (index === 0) segment.setAttribute("aria-label", front.label);
          layer.appendChild(segment);
        });
        return;
      }
      const points: string[] = [];
      front.hexKeys.forEach((hexKey) => {
        let center = this.getHexCenter(hexKey);
        if (!center) {
          const maybeOffset = CoordinateSystem.axialKeyToOffsetKey(hexKey);
          if (maybeOffset) center = this.getHexCenter(maybeOffset);
        }
        if (center) {
          points.push(`${center.cx},${center.cy}`);
        }
      });

      if (points.length < 2) {
        return;
      }

      const poly = document.createElementNS(SVG_NS, "polyline");
      poly.setAttribute("points", points.join(" "));
      poly.setAttribute("stroke", color);
      poly.setAttribute("stroke-width", "3.5");
      poly.setAttribute("fill", "none");
      poly.setAttribute("opacity", "0.9");
      poly.classList.add("campaign-front", `front-${front.key}`);
      layer.appendChild(poly);
    });
  }

  private bindInteraction(): void {
    const handler = this.hexClickHandler;
    const svg = this.svgElement;
    if (!svg) {
      return;
    }

    if (this.boundClickListener) {
      svg.removeEventListener("click", this.boundClickListener);
      this.boundClickListener = null;
    }
    if (this.boundKeydownListener) {
      svg.removeEventListener("keydown", this.boundKeydownListener);
      this.boundKeydownListener = null;
    }

    if (!handler) {
      return;
    }

    const activateTarget = (target: Element | null): void => {
      if (!target) {
        return;
      }
      const contact = target.closest<SVGGElement>(".campaign-intel-contact[data-contact-id]");
      // First prefer the dedicated hex group when the click lands on the polygon.
      const group = target.closest<SVGGElement>(".campaign-hex");
      // Otherwise, try any element carrying a data-hex attribute (sprites, force icons, labels).
      const dataHexCarrier = (target.closest("[data-hex]") as Element | null);
      const dataHex = dataHexCarrier?.getAttribute?.("data-hex") ?? null;
      const hexKey = group?.dataset.hex ?? dataHex;
      if (!hexKey) {
        return;
      }
      const tile = this.tileIndex.get(hexKey) ?? null;
      handler(hexKey, tile, contact?.dataset.contactId);
    };

    const listener = (event: MouseEvent): void => {
      activateTarget(event.target as Element | null);
    };
    const keydownListener = (event: KeyboardEvent): void => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target as Element | null;
      if (!target?.closest(
        ".campaign-intel-contact[data-contact-id], .campaign-known-site[data-known-site-id], .campaign-base-marker[data-hex]"
      )) return;
      event.preventDefault();
      activateTarget(target);
    };

    svg.addEventListener("click", listener);
    svg.addEventListener("keydown", keydownListener);
    this.boundClickListener = listener;
    this.boundKeydownListener = keydownListener;
  }
}
