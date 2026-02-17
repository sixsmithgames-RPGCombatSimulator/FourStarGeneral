import type { TileDefinition, TilePalette, TileInstance } from "../core/types";
import { HEX_HEIGHT, HEX_RADIUS, HEX_WIDTH } from "../core/balance";

/**
 * Grid coordinate representation (offset coordinates).
 */
export interface GridCoordinate {
  col: number;
  row: number;
}

/**
 * Re-export types for convenience.
 */
export type TileDetails = TileDefinition;
export type TileEntry = TileInstance | TileDetails;

/**
 * Coordinate system utilities for hex grid operations.
 * Provides conversions between offset, axial, and pixel coordinate systems.
 */
export class CoordinateSystem {
  /**
   * Converts offset coordinates to axial coordinates.
   * @param column - Column index in offset grid
   * @param row - Row index in offset grid
   * @returns Axial coordinates {q, r}
   */
  static offsetToAxial(column: number, row: number): { q: number; r: number } {
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
  static axialToOffset(q: number, r: number): { col: number; row: number } {
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
  static axialToPixel(q: number, r: number): { x: number; y: number } {
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
  static makeHexKey(col: number, row: number): string {
    return `${col},${row}`;
  }

  /**
   * Parses a hex key string into grid coordinates.
   * @param key - Hex key string (e.g., "5,3")
   * @returns GridCoordinate or null if parsing fails
   */
  static parseHexKey(key: string): GridCoordinate | null {
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
  static axialKeyToOffsetKey(key: string): string | null {
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
  static hexPoints(cx: number, cy: number): string {
    // Emit pointy-top hex vertices ordered clockwise starting from the top point.
    const halfWidth = HEX_WIDTH / 2;
    const points: Array<[number, number]> = [
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
  static resolveTile(
    entry: TileEntry,
    palette: TilePalette
  ): TileDetails | null {
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
        features: mergedFeatures as TileDetails["features"],
        recon: entry.recon ?? reference.recon
      };
    }

    if (this.isTileDefinition(entry)) {
      // Inline tile definitions already contain the full surface details; we still clone the array so
      // callers can safely mutate without affecting the scenario source.
      const features = entry.features ? [...entry.features] : [];
      return {
        ...entry,
        features: features as TileDetails["features"]
      };
    }

    return null;
  }

  /**
   * Checks whether the tile entry is a palette reference (the common case in scenario JSON).
   */
  static isTileReference(entry: TileEntry): entry is TileInstance {
    return typeof (entry as { tile?: unknown }).tile === "string";
  }

  /**
   * Guards direct tile definitions embedded in the scenario grid.
   */
  private static isTileDefinition(entry: TileEntry): entry is TileDetails {
    return typeof (entry as { terrain?: unknown }).terrain === "string";
  }
}
