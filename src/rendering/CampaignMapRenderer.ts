import { CAMPAIGN_HEX_SCALE_KM, type CampaignScenarioData, type CampaignTileInstance, type CampaignForceGroup } from "../core/campaignTypes";
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
const FORCE_ICON_SIZE = 34;
const FORCE_POSITIONS: Array<{ dx: number; dy: number }> = [
  { dx: -20, dy: -16 },
  { dx: 12, dy: -16 },
  { dx: -20, dy: 16 },
  { dx: 12, dy: 16 },
  { dx: -4, dy: 0 }
];
const FORCE_COUNT_FONT_SIZE = 13;

/** Maps sprite keys declared in campaign data to asset URLs (PNG sprites). */
const CAMPAIGN_SPRITES: Record<string, string> = {
  airbase: new URL("../assets/campaign/Airbase_Land_Large.png", import.meta.url).href,
  navalBase: new URL("../assets/campaign/Naval_base_large.png", import.meta.url).href,
  logisticsHub: new URL("../assets/campaign/Military_Base_Large.png", import.meta.url).href,
  taskForce: new URL("../assets/campaign/task_force.svg", import.meta.url).href,
  fortificationHeavy: new URL("../assets/campaign/Fortifications -- Heavy -- Land -- small.png", import.meta.url).href,
  fortificationLight: new URL("../assets/campaign/Fortifications -- Light -- Land -- small.png", import.meta.url).href
};

export type CampaignHexClickHandler = (hexKey: string, tile: CampaignTileInstance | null) => void;

/**
 * Responsible for rendering the strategic campaign map on top of a static background illustration.
 * Unlike the tactical renderer, this class focuses on clean overlays and large-scale markers.
 */
export class CampaignMapRenderer {
  private svgElement: SVGSVGElement | null = null;
  private canvasElement: HTMLDivElement | null = null;
  private scenario: CampaignScenarioData | null = null;
  private tileIndex = new Map<string, CampaignTileInstance>();
  private hexGroups = new Map<string, SVGGElement>();
  private spriteIndex = new Map<string, SVGImageElement>();
  private hexClickHandler: CampaignHexClickHandler | null = null;
  private boundClickListener: ((event: MouseEvent) => void) | null = null;
  private gridBounds: { minX: number; maxX: number; minY: number; maxY: number } | null = null;

  /** Stores the dimensions in pixels so callers can size viewports accordingly. */
  private mapPixelWidth = 0;
  private mapPixelHeight = 0;

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
   * Calculates pixel dimensions for the campaign map. Prefers native background size so the map respects its 5 km per hex reference scale.
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
   * This ensures the 5km-per-hex scale is maintained visually while fitting the grid.
   */
  private getHexDensityScalar(): number {
    if (!this.scenario || !Number.isFinite(this.mapPixelWidth)) {
      return 1.0;
    }

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
  private resolveGridPadding(scenario: CampaignScenarioData, margin: number, density: number): number {
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
  render(svg: SVGSVGElement, canvas: HTMLDivElement, scenario: CampaignScenarioData): void {
    this.svgElement = svg;
    this.canvasElement = canvas;
    this.scenario = scenario;

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
    // Expose the strategic scale so tooltips or other UI helpers can explain the 5km-per-hex abstraction.
    canvas.dataset.campaignHexScaleKm = String(scenario.hexScaleKm ?? CAMPAIGN_HEX_SCALE_KM);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", `${width}`);
    svg.setAttribute("height", `${height}`);

    svg.innerHTML = "";
    const backgroundGroup = this.ensureLayer(svg, BACKGROUND_LAYER_ID);
    const hexGroup = this.ensureLayer(svg, HEX_LAYER_ID);
    const terrainOverlayGroup = this.ensureLayer(svg, TERRAIN_OVERLAY_LAYER_ID);
    const spriteGroup = this.ensureLayer(svg, SPRITE_LAYER_ID);
    const frontGroup = this.ensureLayer(svg, FRONT_LAYER_ID);
    const forceGroup = this.ensureLayer(svg, FORCE_LAYER_ID);

    const density = this.getHexDensityScalar();

    this.gridBounds = null;

    this.renderBackground(backgroundGroup, scenario);
    this.renderHexGrid(hexGroup, scenario, density);
    this.renderTerrainOverlay(terrainOverlayGroup, scenario);
    this.renderFronts(frontGroup, scenario);
    this.renderSprites(spriteGroup, scenario);
    this.renderForceGroups(forceGroup, scenario);

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
    this.bindInteraction();
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

  private ensureLayer(svg: SVGSVGElement, id: string): SVGGElement {
    let layer = svg.querySelector<SVGGElement>(`#${id}`);
    if (!layer) {
      layer = document.createElementNS(SVG_NS, "g");
      layer.id = id;
      svg.appendChild(layer);
    }
    layer.innerHTML = "";
    return layer;
  }

  /** Injects the campaign background illustration. */
  private renderBackground(layer: SVGGElement, scenario: CampaignScenarioData): void {
    const image = document.createElementNS(SVG_NS, "image");
    image.id = `${BACKGROUND_LAYER_ID}-image`;
    image.setAttribute("href", scenario.background.imageUrl);
    image.setAttribute("width", String(this.mapPixelWidth));
    image.setAttribute("height", String(this.mapPixelHeight));
    const hasNative = Boolean(scenario.background.nativeWidth && scenario.background.nativeHeight);
    // When native dimensions are supplied and we sized the canvas to match, never crop the background art.
    if (hasNative) {
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

      const asset = CAMPAIGN_SPRITES[spriteKey];
      if (!asset) {
        console.warn("[CampaignMapRenderer] Unknown sprite key", { spriteKey, hexKey });
        return;
      }

      const cx = Number(group.dataset.cx ?? NaN);
      const cy = Number(group.dataset.cy ?? NaN);
      if (Number.isNaN(cx) || Number.isNaN(cy)) {
        return;
      }

      const image = document.createElementNS(SVG_NS, "image");
      image.setAttribute("href", asset);
      image.setAttribute("width", String(iconSize));
      image.setAttribute("height", String(iconSize));
      image.setAttribute("x", String(cx - iconSize / 2));
      image.setAttribute("y", String(cy - iconSize / 2));
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

  /** Renders aggregated force icons using tactical sprites scaled for the campaign map. */
  private renderForceGroups(layer: SVGGElement, scenario: CampaignScenarioData): void {
    scenario.tiles.forEach((instance) => {
      const forces = this.resolveForces(instance, scenario);
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

      forces.slice(0, FORCE_POSITIONS.length).forEach((force, index) => {
        const spriteUrl = getSpriteForScenarioType(force.unitType);
        if (!spriteUrl) {
          return;
        }
        const { dx, dy } = FORCE_POSITIONS[index];
        const icon = document.createElementNS(SVG_NS, "image");
        icon.setAttribute("href", spriteUrl);
        icon.setAttribute("width", String(FORCE_ICON_SIZE));
        icon.setAttribute("height", String(FORCE_ICON_SIZE));
        icon.setAttribute("x", String(cx + dx - FORCE_ICON_SIZE / 2));
        icon.setAttribute("y", String(cy + dy - FORCE_ICON_SIZE / 2));
        icon.classList.add("campaign-force-icon");
        // Make force icons map back to the tile they represent so they are interactive.
        icon.setAttribute("data-hex", hexKey);
        layer.appendChild(icon);

        if (force.count > 1) {
          const countLabel = document.createElementNS(SVG_NS, "text");
          countLabel.textContent = `${force.count}`;
          countLabel.setAttribute("x", String(cx + dx + FORCE_ICON_SIZE / 2 - 6));
          countLabel.setAttribute("y", String(cy + dy + FORCE_ICON_SIZE / 2 - 4));
          countLabel.setAttribute("font-size", String(FORCE_COUNT_FONT_SIZE));
          countLabel.setAttribute("font-weight", "600");
          countLabel.setAttribute("fill", "#f5f7ff");
          countLabel.setAttribute("stroke", "#1b2231");
          countLabel.setAttribute("stroke-width", "2");
          countLabel.setAttribute("paint-order", "stroke");
          countLabel.classList.add("campaign-force-count");
          // Labels also carry the hex key so clicks on the number are handled identically.
          countLabel.setAttribute("data-hex", hexKey);
          layer.appendChild(countLabel);
        }
      });
    });
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
      const existing = merged.get(group.unitType);
      if (existing) {
        existing.count += group.count;
      } else {
        merged.set(group.unitType, { unitType: group.unitType, count: group.count, label: group.label });
      }
    };

    baseForces.forEach(applyGroup);
    overrides.forEach(applyGroup);

    return Array.from(merged.values()).sort((a, b) => b.count - a.count);
  }

  /** Draws polylines along the declared fronts using hex centers as control points. */
  private renderFronts(layer: SVGGElement, scenario: CampaignScenarioData): void {
    if (!scenario.fronts || scenario.fronts.length === 0) {
      return;
    }

    scenario.fronts.forEach((front) => {
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
      const color = front.initiative === "Player" ? "#5bc0ff" : front.initiative === "Bot" ? "#ff6b6b" : "#ffd166";
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

    if (!handler) {
      return;
    }

    const listener = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
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
      handler(hexKey, tile);
    };

    svg.addEventListener("click", listener);
    this.boundClickListener = listener;
  }
}
