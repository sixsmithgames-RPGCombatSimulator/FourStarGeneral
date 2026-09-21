import { HEX_RADIUS } from "../core/balance";
import type { ScenarioData } from "../core/types";
import { CoordinateSystem, type TileDetails, type TileEntry } from "./CoordinateSystem";

export interface RenderableHex {
  readonly tile: TileDetails;
  readonly x: number;
  readonly y: number;
  readonly col: number;
  readonly row: number;
}

export interface UnresolvedHexTile {
  readonly entry: TileEntry;
  readonly col: number;
  readonly row: number;
}

export interface HexMapLayout {
  readonly hexes: readonly RenderableHex[];
  readonly unresolvedTiles: readonly UnresolvedHexTile[];
  readonly realAxialKeys: ReadonlySet<string>;
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
  readonly margin: number;
}

/**
 * Resolves scenario tiles and owns the canonical SVG bounds shared by every map presentation.
 * It intentionally contains no DOM, interaction, or battle-runtime state.
 */
export function buildHexMapLayout(data: ScenarioData, margin = HEX_RADIUS * 2): HexMapLayout {
  const hexes: RenderableHex[] = [];
  const unresolvedTiles: UnresolvedHexTile[] = [];
  const realAxialKeys = new Set<string>();
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  data.tiles.forEach((rowTiles, row) => {
    rowTiles.forEach((entry, col) => {
      const tile = CoordinateSystem.resolveTile(entry, data.tilePalette);
      if (!tile) {
        unresolvedTiles.push({ entry, col, row });
        return;
      }

      const { q, r } = CoordinateSystem.offsetToAxial(col, row);
      const { x, y } = CoordinateSystem.axialToPixel(q, r);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      realAxialKeys.add(`${q},${r}`);
      hexes.push({ tile, x, y, col, row });
    });
  });

  if (hexes.length === 0) {
    return { hexes, unresolvedTiles, realAxialKeys, minX: 0, minY: 0, width: 0, height: 0, margin };
  }

  return {
    hexes,
    unresolvedTiles,
    realAxialKeys,
    minX,
    minY,
    width: maxX - minX + margin * 2,
    height: maxY - minY + margin * 2,
    margin
  };
}
