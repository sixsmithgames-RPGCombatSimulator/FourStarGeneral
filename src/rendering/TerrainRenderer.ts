import type { TileDetails } from "./CoordinateSystem";

/**
 * Terrain sprite variant sets.
 * Each terrain key maps to an array of variant URLs. Variants are selected deterministically
 * by hex position so the map looks natural without requiring per-tile data in scenario JSON.
 * Urban terrains (city / town / hamlet) additionally have a "center" entry used when the tile
 * carries spriteVariant: "center".
 *
 * Note: Vite requires new URL() with literal string paths for proper asset bundling.
 * River tiles have no sprite — rivers are drawn as blue SVG overlay lines by RiverOverlayRenderer.
 */

interface UrbanVariantSet {
  readonly center: string;
  readonly variants: readonly string[];
}

interface TerrainVariantSet {
  readonly variants: readonly string[];
}

type SpriteSet = UrbanVariantSet | TerrainVariantSet;

function isUrbanSet(set: SpriteSet): set is UrbanVariantSet {
  return "center" in set;
}

const TERRAIN_SPRITE_SETS: Record<string, SpriteSet> = {
  grass: {
    variants: [
      new URL("../assets/terrain/Terrain_Grass_1.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Grass_2.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Grass_3.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Grass_4.png", import.meta.url).href
    ]
  },
  plains: {
    variants: [
      new URL("../assets/terrain/Terrain_Grass_1.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Grass_2.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Grass_3.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Grass_4.png", import.meta.url).href
    ]
  },
  road: {
    // Roads are drawn as feature overlays; use plains art as a safe base so explicit "road" terrain
    // entries never render as empty hexes when scenario data uses road as the primary terrain key.
    variants: [
      new URL("../assets/terrain/Terrain_Grass_1.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Grass_2.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Grass_3.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Grass_4.png", import.meta.url).href
    ]
  },
  forest: {
    variants: [
      new URL("../assets/terrain/Terrain_Forest_1.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Forest_2.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Forest_3.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Forest_4.png", import.meta.url).href
    ]
  },
  hill: {
    variants: [
      new URL("../assets/terrain/Terrain_Hills_1.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Hills_2.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Hills_3.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Hills_4.png", import.meta.url).href
    ]
  },
  mountain: {
    variants: [
      new URL("../assets/terrain/Terrain_Mountain_1.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Mountain_2.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Mountain_3.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Mountain_4.png", import.meta.url).href
    ]
  },
  marsh: {
    variants: [
      new URL("../assets/terrain/Terrain_Marsh_1.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Marsh_2.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Marsh_3.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Marsh_4.png", import.meta.url).href
    ]
  },
  muddy: {
    variants: [
      new URL("../assets/terrain/Terrain_Muddy_1.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Muddy_2.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Muddy_3.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Muddy_4.png", import.meta.url).href
    ]
  },
  city: {
    center: new URL("../assets/terrain/Terrain_City_Center.png", import.meta.url).href,
    // City set is missing variant 3; use 1, 2, 4, 4 to fill four slots without repeating center.
    variants: [
      new URL("../assets/terrain/Terrain_City_1.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_City_2.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_City_4.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_City_4.png", import.meta.url).href
    ]
  },
  town: {
    center: new URL("../assets/terrain/Terrain_Town_Center.png", import.meta.url).href,
    // Town set is missing variant 2; use 1, 3, 4, 4 to fill four slots without repeating center.
    variants: [
      new URL("../assets/terrain/Terrain_Town_1.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Town_3.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Town_4.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Town_4.png", import.meta.url).href
    ]
  },
  hamlet: {
    center: new URL("../assets/terrain/Terrain_Hamlet_Center.png", import.meta.url).href,
    // Hamlet set is missing variant 2; use 1, 3, 4, 4 to fill four slots without repeating center.
    variants: [
      new URL("../assets/terrain/Terrain_Hamlet_1.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Hamlet_3.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Hamlet_4.png", import.meta.url).href,
      new URL("../assets/terrain/Terrain_Hamlet_4.png", import.meta.url).href
    ]
  },
  sea: {
    variants: [
      new URL("../assets/terrain/Sea.png", import.meta.url).href
    ]
  },
  beach: {
    variants: [
      new URL("../assets/terrain/Beach.png", import.meta.url).href
    ]
  }
};

/**
 * Deterministic variant index derived from hex grid position.
 * Uses a simple integer hash so the same hex always shows the same variant,
 * giving a natural-looking map without storing variant data in scenario JSON.
 */
function variantIndexForHex(col: number, row: number, count: number): number {
  // Interleave column and row primes to break up diagonal repetition.
  const hash = Math.abs(col * 7 + row * 13 + col * row * 3);
  return hash % count;
}

/**
 * Terrain rendering utilities for hex tiles.
 * Handles terrain fill colors, sprite selection, and tooltip generation.
 */
export class TerrainRenderer {
  private readonly terrainPalette: Record<string, string> = {
    sea: "#1c3a5d",
    beach: "#c79d67",
    plains: "#4f7a3a",
    grass: "#4f7a3a",
    forest: "#1f4f3c",
    hill: "#7a6a4d",
    road: "#bfae97",
    city: "#7e7b8b",
    town: "#8a8590",
    hamlet: "#9e9a8a",
    mountain: "#65616a",
    marsh: "#4a6145",
    muddy: "#6b5c40",
    river: "#1c4d6e"
  };

  /**
   * Returns the fill color for a terrain type.
   * @param terrain - Primary terrain identifier
   * @param terrainType - Secondary terrain type
   * @returns Hex color string
   */
  getTerrainFill(terrain: string, terrainType: string): string {
    if (this.terrainPalette[terrain]) {
      return this.terrainPalette[terrain];
    }

    if (this.terrainPalette[terrainType]) {
      return this.terrainPalette[terrainType];
    }

    return "#3c445c";
  }

  /**
   * Returns the sprite image path for a tile, picking among available variants deterministically
   * by hex position. If the tile carries a spriteVariant override ("center" or "1"–"4") that
   * value takes precedence over the position-based selection.
   * @param tile - Resolved tile details (may carry spriteVariant)
   * @param col - Column index used for deterministic variant selection
   * @param row - Row index used for deterministic variant selection
   * @returns Sprite URL string, or null if no art is available for this terrain type
   */
  getTerrainSprite(tile: TileDetails, col: number, row: number): string | null {
    const terrain = tile.terrain.toLowerCase();
    const set = TERRAIN_SPRITE_SETS[terrain];

    if (!set) {
      // No sprite set registered for this terrain key (e.g. pure road overlays, river).
      return null;
    }

    // Urban terrains support an explicit "center" variant for the landmark tile of a settlement.
    if (tile.spriteVariant === "center" && isUrbanSet(set)) {
      return set.center;
    }

    // A numeric variant override ("1"–"4") pins a specific art file.
    if (tile.spriteVariant && /^[1-4]$/.test(tile.spriteVariant)) {
      const pinned = parseInt(tile.spriteVariant, 10) - 1;
      const index = Math.min(pinned, set.variants.length - 1);
      return set.variants[index];
    }

    // Default: deterministic position-based selection.
    const index = variantIndexForHex(col, row, set.variants.length);
    return set.variants[index];
  }

  /**
   * Generates tooltip text for a hex tile.
   * @param tile - Tile details
   * @returns Formatted tooltip string
   */
  generateHexTooltip(tile: TileDetails): string {
    const segments = [
      tile.terrain.toUpperCase(),
      tile.features.length > 0 ? `Features: ${tile.features.join(", ")}` : null,
      `Density: ${tile.density}`,
      `Recon: ${tile.recon}`
    ].filter((segment): segment is string => Boolean(segment));

    return segments.join("\n");
  }

  /**
   * Creates a 3-character abbreviation from a label.
   * @param label - Label to abbreviate
   * @returns Abbreviated string (max 3 chars)
   */
  abbreviateLabel(label: string): string {
    const initials = label
      .split(/\s+/)
      .map((part) => part.charAt(0))
      .join("")
      .slice(0, 3)
      .toUpperCase();

    if (initials.length > 0) {
      return initials;
    }

    return label.slice(0, 3).toUpperCase();
  }
}
