import { HEX_HEIGHT, HEX_RADIUS, HEX_WIDTH } from "../core/balance";
/**
 * Coordinate system utilities for hex grid operations.
 * Provides conversions between offset, axial, and pixel coordinate systems.
 *
 * CRITICAL: This class manages three distinct coordinate systems used throughout the application.
 * Understanding these systems is essential for camera focus, rendering, and game logic.
 *
 * THREE COORDINATE SYSTEMS:
 *
 * 1. AXIAL COORDINATES (q, r)
 *    - Used by: Game engine, bot AI, unit positions in game state
 *    - Format: {q: number, r: number}
 *    - Layout: Odd-q vertical layout for pointy-top hexagons
 *    - Purpose: Hex math operations (distance, neighbors, pathfinding)
 *    - Example: {q: 5, r: 3} represents a hex in the game grid
 *
 * 2. OFFSET COORDINATES (col, row)
 *    - Used by: Array indexing, hex keys, DOM element lookup
 *    - Format: {col: number, row: number} or string "col,row"
 *    - Layout: Standard 2D array indexing
 *    - Purpose: Efficient array access and DOM element identification
 *    - Example: [5, 3] or "5,3" for array scenario.tiles[row][col]
 *
 * 3. VIEWBOX/PIXEL COORDINATES (x, y)
 *    - Used by: SVG rendering, camera positioning, visual display
 *    - Format: {x: number, y: number}
 *    - Units: SVG viewBox pixels (not screen pixels!)
 *    - Purpose: Positioning elements in SVG coordinate space
 *    - Example: {x: 450, y: 225} for center position in SVG
 *
 * COORDINATE CONVERSIONS:
 *
 *   offsetToAxial(col, row)     → {q, r}      [Offset → Axial]
 *   axialToOffset(q, r)         → {col, row}  [Axial → Offset]
 *   axialToPixel(q, r)          → {x, y}      [Axial → ViewBox]
 *   makeHexKey(col, row)        → "col,row"   [Offset → String Key]
 *   parseHexKey("col,row")      → {col, row}  [String Key → Offset]
 *
 * TRANSFORMATION RULES:
 *
 * Offset ↔ Axial (odd-q vertical layout):
 *   - offsetToAxial: q = col, r = row - floor(col / 2)
 *   - axialToOffset: col = q, row = r + floor(q / 2)
 *
 * Axial → Pixel (pointy-top hex):
 *   - x = HEX_WIDTH * (q + r / 2)
 *   - y = HEX_HEIGHT * 3/4 * r
 *
 * USAGE PATTERNS:
 *
 * 1. Game Engine → Renderer:
 *    engine.unit.hex (axial) → axialToOffset() → makeHexKey() → DOM lookup
 *
 * 2. Camera Focus:
 *    bot.move (axial) → axialToOffset() → makeHexKey() → getHexElement() → read dataset.cx/cy
 *
 * 3. User Click → Game Logic:
 *    DOM element → parseHexKey() → offsetToAxial() → engine.selectUnit()
 *
 * WARNING: Never mix coordinate systems! Always convert explicitly at boundaries.
 *
 * @see docs/CAMERA_FOCUS_BUG_POSTMORTEM.md for detailed coordinate system documentation
 */
export class CoordinateSystem {
    /**
     * Converts offset coordinates to axial coordinates.
     * @param column - Column index in offset grid
     * @param row - Row index in offset grid
     * @returns Axial coordinates {q, r}
     */
    static offsetToAxial(column, row) {
        // Pointy-top uses odd-q vertical layout. Columns are staggered; convert by subtracting half of the column index.
        const q = column;
        const r = row - Math.floor(column / 2);
        return { q, r };
    }
    /**
     * Converts axial coordinates to offset coordinates.
     * @param q - Q coordinate (axial)
     * @param r - R coordinate (axial)
     * @returns Offset coordinates {col, row}
     */
    static axialToOffset(q, r) {
        // In odd-q, rows are recovered by adding half of q to r; column equals q.
        const col = q;
        const row = r + Math.floor(q / 2);
        return { col, row };
    }
    /**
     * Converts axial coordinates to pixel coordinates for rendering.
     * @param q - Q coordinate (axial)
     * @param r - R coordinate (axial)
     * @returns Pixel coordinates {x, y}
     */
    static axialToPixel(q, r) {
        // Pointy-top axial to pixel: x grows with q and half r; y steps 3/2 radius per r.
        const x = HEX_WIDTH * (q + r / 2);
        const y = (HEX_HEIGHT * 3) / 4 * r; // equals HEX_RADIUS * 1.5 * r
        return { x, y };
    }
    /**
     * Creates a string key from grid coordinates for map lookups.
     * @param col - Column index
     * @param row - Row index
     * @returns String key in format "col,row"
     */
    static makeHexKey(col, row) {
        return `${col},${row}`;
    }
    /**
     * Parses a hex key string into grid coordinates.
     * @param key - Hex key string (e.g., "5,3")
     * @returns GridCoordinate or null if parsing fails
     */
    static parseHexKey(key) {
        const [colPart, rowPart] = key.split(",");
        const col = Number(colPart);
        const row = Number(rowPart);
        if (Number.isFinite(col) && Number.isFinite(row)) {
            return { col, row };
        }
        return null;
    }
    /**
     * Converts an axial key to an offset key.
     * @param key - Axial key string (e.g., "3,5")
     * @returns Offset key string or null if parsing fails
     */
    static axialKeyToOffsetKey(key) {
        const [qPart, rPart] = key.split(",");
        const q = Number(qPart);
        const r = Number(rPart);
        if (!Number.isFinite(q) || !Number.isFinite(r)) {
            return null;
        }
        const { col, row } = this.axialToOffset(q, r);
        return this.makeHexKey(col, row);
    }
    /**
     * Generates SVG polygon points for a hexagon.
     * @param cx - Center X coordinate
     * @param cy - Center Y coordinate
     * @returns SVG points string
     */
    static hexPoints(cx, cy) {
        // Emit pointy-top hex vertices ordered clockwise starting from the top point.
        const halfWidth = HEX_WIDTH / 2;
        const points = [
            [cx, cy - HEX_RADIUS],
            [cx + halfWidth, cy - HEX_RADIUS / 2],
            [cx + halfWidth, cy + HEX_RADIUS / 2],
            [cx, cy + HEX_RADIUS],
            [cx - halfWidth, cy + HEX_RADIUS / 2],
            [cx - halfWidth, cy - HEX_RADIUS / 2]
        ];
        return points.map(([x, y]) => `${x},${y}`).join(" ");
    }
    /**
     * Resolves a tile entry to its full tile details.
     * @param entry - Tile entry (reference)
     * @param palette - Tile palette for resolving references
     * @returns TileDetails or null if not found
     */
    static resolveTile(entry, palette) {
        if (this.isTileReference(entry)) {
            // Clone the palette definition and layer any overrides carried on the tile instance for density,
            // features, or recon flags. The clone avoids mutating shared palette state.
            const reference = palette[entry.tile];
            if (!reference) {
                return null;
            }
            const mergedFeatures = (entry.features ?? reference.features) ? [...(entry.features ?? reference.features)] : [];
            return {
                ...reference,
                density: entry.density ?? reference.density,
                features: mergedFeatures,
                recon: entry.recon ?? reference.recon
            };
        }
        if (this.isTileDefinition(entry)) {
            // Inline tile definitions already contain the full surface details; we still clone the array so
            // callers can safely mutate without affecting the scenario source.
            const features = entry.features ? [...entry.features] : [];
            return {
                ...entry,
                features: features
            };
        }
        return null;
    }
    /**
     * Checks whether the tile entry is a palette reference (the common case in scenario JSON).
     */
    static isTileReference(entry) {
        return typeof entry.tile === "string";
    }
    /**
     * Guards direct tile definitions embedded in the scenario grid.
     */
    static isTileDefinition(entry) {
        return typeof entry.terrain === "string";
    }
}
