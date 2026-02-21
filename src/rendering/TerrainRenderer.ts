import type { TileDetails } from "./CoordinateSystem";
import type { TerrainKey } from "../core/types";

/**
 * Terrain sprite mapping.
 * Note: Vite requires new URL() with literal string paths for proper asset bundling.
 */
const TERRAIN_SPRITES: Record<string, string> = {
  sea: new URL("../assets/terrain/Sea.png", import.meta.url).href,
  beach: new URL("../assets/terrain/Beach.png", import.meta.url).href,
  plains: new URL("../assets/terrain/Plain.png", import.meta.url).href,
  forest: new URL("../assets/terrain/Forest.png", import.meta.url).href,
  hill: new URL("../assets/terrain/Hill.png", import.meta.url).href,
  mountain: new URL("../assets/terrain/Mountain.png", import.meta.url).href,
  city: new URL("../assets/terrain/Village.png", import.meta.url).href,
  marsh: new URL("../assets/terrain/Marsh.png", import.meta.url).href,
  river: new URL("../assets/terrain/River.png", import.meta.url).href,
  road: new URL("../assets/terrain/grasslands.png", import.meta.url).href,
  grass: new URL("../assets/terrain/grasslands.png", import.meta.url).href
};

/**
 * Terrain rendering utilities for hex tiles.
 * Handles terrain colors, sprites, and visual representation.
 */
export class TerrainRenderer {
  private readonly terrainPalette: Record<string, string> = {
    sea: "#1c3a5d",
    beach: "#c79d67",
    plains: "#4f7a3a",
    forest: "#1f4f3c",
    hill: "#7a6a4d",
    road: "#bfae97",
    city: "#7e7b8b",
    mountain: "#65616a"
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

    return "#3c445c"; // Default color
  }

  /**
   * Returns the sprite image path for a terrain type.
   * @param tile - Tile details
   * @returns Sprite path or null if no sprite available
   */
  getTerrainSprite(tile: TileDetails): string | null {
    const terrain = tile.terrain.toLowerCase();
    const terrainType = tile.terrainType.toLowerCase();

    // Prefer an exact terrain match, falling back to the broader terrain type so maps stay textured even when
    // palette entries omit specialized artwork (e.g., "grass" vs. "plains").
    return TERRAIN_SPRITES[terrain] ?? TERRAIN_SPRITES[terrainType] ?? null;
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
