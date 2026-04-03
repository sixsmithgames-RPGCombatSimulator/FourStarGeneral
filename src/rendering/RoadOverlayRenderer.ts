import { CoordinateSystem, type TileEntry, type TileDetails } from "./CoordinateSystem";
import { axialDirections } from "../core/Hex";
import type { TilePalette } from "../core/types";

interface RoadOverlayStyle {
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
  readonly opacity?: number;
}

interface RoadOverlayOptions {
  readonly treatCurrentAsRoad?: boolean;
  readonly style?: RoadOverlayStyle;
  readonly neighborHasRoad?: (args: {
    readonly tile: TileDetails | null;
    readonly col: number;
    readonly row: number;
    readonly q: number;
    readonly r: number;
  }) => boolean;
}

/**
 * Renders road overlays on hex tiles with neighbor-aware connections.
 * Creates dynamic road segments that connect to adjacent road tiles.
 */
export class RoadOverlayRenderer {
  private isHamlet(tile: TileDetails): boolean {
    return (
      tile.terrain.toLowerCase() === "city" &&
      tile.terrainType.toLowerCase() === "urban" &&
      tile.density.toLowerCase() === "sparse" &&
      tile.features.some((feature) => feature.toLowerCase() === "buildings")
    );
  }

  private canHostRoad(tile: TileDetails | null | undefined): boolean {
    if (!tile) {
      return false;
    }
    const terrain = tile.terrain.toLowerCase();
    const terrainType = tile.terrainType.toLowerCase();
    return terrain !== "sea" && terrain !== "river" && terrainType !== "water";
  }

  /**
   * Checks if a tile contains a road.
   * @param tile - Tile to check
   * @returns True if tile has a road
   */
  hasRoad(tile: TileDetails | null | undefined): boolean {
    if (!tile || !this.canHostRoad(tile)) {
      return false;
    }

    const terrain = tile.terrain.toLowerCase();
    const terrainType = tile.terrainType.toLowerCase();
    const features = tile.features.map((feature) => feature.toLowerCase());
    return terrain === "road" || terrainType === "road" || features.includes("road") || this.isHamlet(tile);
  }

  /**
   * Draws road overlay SVG for a hex tile.
   * @param cx - Center X coordinate
   * @param cy - Center Y coordinate
   * @param tile - Current tile details
   * @param col - Column index
   * @param row - Row index
   * @param tiles - All tiles in the scenario
   * @param tilePalette - Tile palette for resolving references
   * @returns SVG markup string for road overlay
   */
  drawRoadOverlay(
    cx: number,
    cy: number,
    tile: TileDetails,
    col: number,
    row: number,
    tiles: TileEntry[][],
    tilePalette: TilePalette,
    options: RoadOverlayOptions = {}
  ): string {
    const treatCurrentAsRoad = options.treatCurrentAsRoad ?? this.hasRoad(tile);
    if (!treatCurrentAsRoad) {
      return "";
    }

    // Check for paved feature using a case-insensitive match so scenario data can
    // specify variants like "paved" or "paving" without additional config.
    const isPaved = tile.features.some((feature) => feature.toLowerCase().includes("pav"));
    const style: RoadOverlayStyle = {
      strokeColor: options.style?.strokeColor ?? (isPaved ? "#2a2a2a" : "#8b6f47"),
      strokeWidth: options.style?.strokeWidth ?? (isPaved ? 2 : 3),
      opacity: options.style?.opacity ?? 1
    };

    // Use axial neighbours so the logic is orientation-agnostic and works for both flat-top and pointy-top.
    const hasRoadNeighbor: boolean[] = [];
    const currentAxial = CoordinateSystem.offsetToAxial(col, row);

    for (const dir of axialDirections) {
      const nq = currentAxial.q + dir.q;
      const nr = currentAxial.r + dir.r;
      const { col: nCol, row: nRow } = CoordinateSystem.axialToOffset(nq, nr);

      if (nRow >= 0 && nRow < tiles.length && nCol >= 0 && nCol < tiles[nRow].length) {
        const neighborEntry = tiles[nRow][nCol];
        const neighborTile = CoordinateSystem.resolveTile(neighborEntry, tilePalette);
        hasRoadNeighbor.push(
          options.neighborHasRoad?.({
            tile: neighborTile,
            col: nCol,
            row: nRow,
            q: nq,
            r: nr
          }) ?? this.hasRoad(neighborTile)
        );
      } else {
        hasRoadNeighbor.push(false);
      }
    }

    const currentPixel = CoordinateSystem.axialToPixel(currentAxial.q, currentAxial.r);
    const edgeVectors = axialDirections.map((dir) => {
      const neighborPixel = CoordinateSystem.axialToPixel(currentAxial.q + dir.q, currentAxial.r + dir.r);
      return {
        dx: neighborPixel.x - currentPixel.x,
        dy: neighborPixel.y - currentPixel.y
      };
    });

    let markup = `<circle data-road-hub="true" cx="${cx}" cy="${cy}" r="${(style.strokeWidth ?? 3) * 0.55}" fill="${style.strokeColor ?? "#8b6f47"}" opacity="${style.opacity ?? 1}" />`;
    edgeVectors.forEach(({ dx, dy }, index) => {
      if (!hasRoadNeighbor[index]) {
        return;
      }
      const edgeX = cx + dx / 2;
      const edgeY = cy + dy / 2;
      const curvature = 0.18;
      const controlX = cx + dx * 0.35 + dy * curvature;
      const controlY = cy + dy * 0.35 - dx * curvature;
      markup += `<path data-road-segment="true" d="M ${cx} ${cy} Q ${controlX} ${controlY} ${edgeX} ${edgeY}" fill="none" stroke="${style.strokeColor ?? "#8b6f47"}" stroke-width="${style.strokeWidth ?? 3}" stroke-linecap="round" opacity="${style.opacity ?? 1}" />`;
    });

    return markup;
  }
}
