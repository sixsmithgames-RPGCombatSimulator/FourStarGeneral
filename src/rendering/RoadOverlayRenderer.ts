import { CoordinateSystem, type TileEntry, type TileDetails } from "./CoordinateSystem";
import { axialDirections } from "../core/Hex";
import type { TilePalette } from "../core/types";

/**
 * Renders road overlays on hex tiles with neighbor-aware connections.
 * Creates dynamic road segments that connect to adjacent road tiles.
 */
export class RoadOverlayRenderer {
  /**
   * Checks if a tile contains a road.
   * @param tile - Tile to check
   * @returns True if tile has a road
   */
  hasRoad(tile: TileDetails | null | undefined): boolean {
    if (!tile) {
      return false;
    }

    const terrain = tile.terrain.toLowerCase();
    const terrainType = tile.terrainType.toLowerCase();
    return terrain === "road" || terrainType === "road";
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
    tilePalette: TilePalette
  ): string {
    if (!this.hasRoad(tile)) {
      return "";
    }

    // Check for paved feature using a case-insensitive match so scenario data can
    // specify variants like "paved" or "paving" without additional config.
    const isPaved = tile.features.some((feature) => feature.toLowerCase().includes("pav"));
    const strokeColor = isPaved ? "#2a2a2a" : "#8b6f47";
    const strokeWidth = isPaved ? 2 : 3;

    // Use axial neighbours so the logic is orientation-agnostic and works for both flat-top and pointy-top.
    const hasRoadNeighbor: boolean[] = [];
    const edgeVectors: Array<{ dx: number; dy: number }> = [];
    const currentAxial = CoordinateSystem.offsetToAxial(col, row);
    const currentPixel = CoordinateSystem.axialToPixel(currentAxial.q, currentAxial.r);

    for (const dir of axialDirections) {
      const nq = currentAxial.q + dir.q;
      const nr = currentAxial.r + dir.r;
      const { col: nCol, row: nRow } = CoordinateSystem.axialToOffset(nq, nr);

      if (nRow >= 0 && nRow < tiles.length && nCol >= 0 && nCol < tiles[nRow].length) {
        const neighborEntry = tiles[nRow][nCol];
        const neighborTile = CoordinateSystem.resolveTile(neighborEntry, tilePalette);
        hasRoadNeighbor.push(this.hasRoad(neighborTile));

        const neighborPixel = CoordinateSystem.axialToPixel(nq, nr);
        edgeVectors.push({
          dx: neighborPixel.x - currentPixel.x,
          dy: neighborPixel.y - currentPixel.y
        });
      } else {
        hasRoadNeighbor.push(false);
        edgeVectors.push({ dx: 0, dy: 0 });
      }
    }

    // Draw road hub and connections using shallow curves so segments feel organic while remaining aligned.
    const hubRadius = strokeWidth * 0.55;
    let markup = `<circle cx="${cx}" cy="${cy}" r="${hubRadius}" fill="${strokeColor}" />`;

    edgeVectors.forEach(({ dx, dy }, index) => {
      if (!hasRoadNeighbor[index]) {
        return;
      }

      const edgeX = cx + dx / 2;
      const edgeY = cy + dy / 2;

      // Bend the segment slightly by aiming the control point a fraction of the way toward the edge while
      // nudging orthogonally. The offset sign alternates to avoid symmetrical "spokes".
      const curvature = 0.18;
      const controlX = cx + dx * 0.35 + dy * curvature;
      const controlY = cy + dy * 0.35 - dx * curvature;

      markup += `<path d="M ${cx} ${cy} Q ${controlX} ${controlY} ${edgeX} ${edgeY}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" />`;
    });

    return markup;
  }
}
