import type { TileDetails } from "./CoordinateSystem";
import type { TerrainKey } from "../core/types";

/**
 * Terrain sprite mapping.
 */
const toSpritePath = (relative: string): string => new URL(relative, import.meta.url).href;

const TERRAIN_SPRITES: Record<string, string> = {
  sea: toSpritePath("../assets/terrain/Sea.png"),
  beach: toSpritePath("../assets/terrain/Beach.png"),
  plains: toSpritePath("../assets/terrain/Plain.png"),
  forest: toSpritePath("../assets/terrain/Forest.png"),
  hill: toSpritePath("../assets/terrain/Hill.png"),
  mountain: toSpritePath("../assets/terrain/Mountain.png"),
  city: toSpritePath("../assets/terrain/Village.png"),
  marsh: toSpritePath("../assets/terrain/Marsh.png"),
  river: toSpritePath("../assets/terrain/River.png"),
  road: toSpritePath("../assets/terrain/grasslands.png"),
  grass: toSpritePath("../assets/terrain/grasslands.png")
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
