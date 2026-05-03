import { CoordinateSystem } from "./CoordinateSystem";
import { axialDirections } from "../core/Hex";
/**
 * Renders river overlays on hex tiles as blue curvy SVG lines.
 * Works neighbour-aware: a river line segment is drawn from the hex centre toward each
 * adjacent hex that also carries a river (terrain === "river" or feature "large river" /
 * "small rivers"), giving connected, flowing river art without requiring explicit edge data.
 *
 * Design mirrors RoadOverlayRenderer: the approach is SVG quadratic Bézier paths with a
 * lateral curvature offset to distinguish rivers visually from straight road segments.
 */
export class RiverOverlayRenderer {
    /**
     * Returns true when a tile should be treated as carrying river water.
     * Accepts tiles whose terrain key is "river" OR that carry the "large river" / "small rivers" feature.
     */
    hasRiver(tile) {
        if (!tile) {
            return false;
        }
        const terrain = tile.terrain.toLowerCase();
        if (terrain === "river") {
            return true;
        }
        const features = tile.features.map((f) => f.toLowerCase());
        return features.includes("large river") || features.includes("small rivers");
    }
    /**
     * Draws the river overlay SVG markup for a single hex tile.
     * Only produces output when the current tile carries river water AND has at least one
     * river-carrying neighbour (so isolated single-hex markers still render a hub circle).
     *
     * @param cx - Pixel centre X of the hex
     * @param cy - Pixel centre Y of the hex
     * @param tile - Resolved tile details for the current hex
     * @param col - Column index (offset coordinates)
     * @param row - Row index (offset coordinates)
     * @param tiles - Full scenario tile grid for neighbour lookup
     * @param tilePalette - Tile palette for resolving palette references
     * @returns SVG markup string, empty string if no river overlay is needed
     */
    drawRiverOverlay(cx, cy, tile, col, row, tiles, tilePalette) {
        if (!this.hasRiver(tile)) {
            return "";
        }
        // Determine which of the six axial neighbours also carry river water.
        const hasRiverNeighbor = [];
        const currentAxial = CoordinateSystem.offsetToAxial(col, row);
        for (const dir of axialDirections) {
            const nq = currentAxial.q + dir.q;
            const nr = currentAxial.r + dir.r;
            const { col: nCol, row: nRow } = CoordinateSystem.axialToOffset(nq, nr);
            if (nRow >= 0 && nRow < tiles.length && nCol >= 0 && nCol < tiles[nRow].length) {
                const neighborEntry = tiles[nRow][nCol];
                const neighborTile = CoordinateSystem.resolveTile(neighborEntry, tilePalette);
                hasRiverNeighbor.push(this.hasRiver(neighborTile));
            }
            else {
                // Treat off-map edges as river continuations so border tiles don't appear capped.
                hasRiverNeighbor.push(true);
            }
        }
        const strokeColor = "#4a90c4";
        const strokeWidth = 4;
        const edgeStrokeWidth = 3;
        // Curvature sign alternates per direction index to produce a natural meandering look.
        const curvatureSigns = [1, -1, 1, -1, 1, -1];
        const currentPixel = CoordinateSystem.axialToPixel(currentAxial.q, currentAxial.r);
        const edgeVectors = axialDirections.map((dir) => {
            const neighborPixel = CoordinateSystem.axialToPixel(currentAxial.q + dir.q, currentAxial.r + dir.r);
            return {
                dx: neighborPixel.x - currentPixel.x,
                dy: neighborPixel.y - currentPixel.y
            };
        });
        // Hub circle at centre ties all river segments together visually.
        let markup = `<circle data-river-hub="true" cx="${cx}" cy="${cy}" r="${strokeWidth * 0.7}" fill="${strokeColor}" opacity="0.88" />`;
        edgeVectors.forEach(({ dx, dy }, index) => {
            if (!hasRiverNeighbor[index]) {
                return;
            }
            const edgeX = cx + dx / 2;
            const edgeY = cy + dy / 2;
            // Lateral curvature perpendicular to the direction vector gives the river its meander.
            const curvature = 0.22 * curvatureSigns[index];
            const controlX = cx + dx * 0.38 + dy * curvature;
            const controlY = cy + dy * 0.38 - dx * curvature;
            markup += `<path data-river-segment="true" d="M ${cx} ${cy} Q ${controlX} ${controlY} ${edgeX} ${edgeY}" fill="none" stroke="${strokeColor}" stroke-width="${edgeStrokeWidth}" stroke-linecap="round" opacity="0.88" />`;
        });
        return markup;
    }
}
