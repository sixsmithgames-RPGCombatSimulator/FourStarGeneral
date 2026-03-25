/**
 * Terrain Response System for Procedural Effects
 *
 * Applies terrain-specific color tinting to debris and dust effects so explosions
 * appear contextually appropriate (green dust on grass, gray debris on urban, etc.).
 */

/**
 * Terrain-specific color tint configuration.
 */
export interface TerrainTint {
  /** Terrain type identifier */
  readonly terrain: string;
  /** Base color for debris particles */
  readonly debrisColor: string;
  /** Base color for dust clouds */
  readonly dustColor: string;
  /** Optional color variation for mixed debris */
  readonly debrisColorAlt?: string;
}

/**
 * Terrain tint catalog loaded from JSON.
 */
class TerrainTintCatalog {
  private tints: Map<string, TerrainTint> = new Map();
  private defaultTint: TerrainTint = {
    terrain: "default",
    debrisColor: "#4a3c28",
    dustColor: "#b89968"
  };

  /**
   * Load terrain tints from configuration.
   */
  load(tintConfigs: TerrainTint[]): void {
    this.tints.clear();

    for (const config of tintConfigs) {
      this.tints.set(config.terrain.toLowerCase(), config);
    }

    console.log(`[TerrainResponseSystem] Loaded ${this.tints.size} terrain tint configurations`);
  }

  /**
   * Get terrain tint for a specific terrain type.
   */
  getTint(terrainType: string): TerrainTint {
    const normalized = terrainType.toLowerCase();
    return this.tints.get(normalized) ?? this.defaultTint;
  }

  /**
   * Get debris color for a terrain type.
   */
  getDebrisColor(terrainType: string): string {
    return this.getTint(terrainType).debrisColor;
  }

  /**
   * Get dust color for a terrain type.
   */
  getDustColor(terrainType: string): string {
    return this.getTint(terrainType).dustColor;
  }

  /**
   * Get alternate debris color with fallback to primary.
   */
  getDebrisColorAlt(terrainType: string): string {
    const tint = this.getTint(terrainType);
    return tint.debrisColorAlt ?? tint.debrisColor;
  }

  /**
   * Check if terrain response is available for a terrain type.
   */
  hasTint(terrainType: string): boolean {
    return this.tints.has(terrainType.toLowerCase());
  }
}

/**
 * Global terrain tint catalog.
 */
export const terrainTintCatalog = new TerrainTintCatalog();

/**
 * Load terrain tint configurations from JSON file.
 */
export async function loadTerrainTints(jsonPath: string): Promise<void> {
  try {
    const response = await fetch(jsonPath);
    if (!response.ok) {
      throw new Error(`Failed to load terrain tints: ${response.statusText}`);
    }

    const tintConfigs: TerrainTint[] = await response.json();
    terrainTintCatalog.load(tintConfigs);
  } catch (error) {
    console.error(`[TerrainResponseSystem] Error loading tints from ${jsonPath}:`, error);
    throw error;
  }
}

/**
 * Get terrain tint for rendering context.
 * Returns an object with debris and dust colors for the specified terrain.
 */
export function getTerrainTint(terrainType: string): { debris: string; dust: string; debrisAlt: string } {
  return {
    debris: terrainTintCatalog.getDebrisColor(terrainType),
    dust: terrainTintCatalog.getDustColor(terrainType),
    debrisAlt: terrainTintCatalog.getDebrisColorAlt(terrainType)
  };
}

/**
 * Determine if an effect type should use terrain response.
 * Currently only major explosive effects use terrain tinting.
 */
export function shouldUseTerrainResponse(effectType: string): boolean {
  const terrainResponsiveEffects = [
    "artillery",
    "rocket",
    "mortar",
    "small_bomb",
    "large_bomb",
    "demolition_charge",
    "cannon" // Cannon can also benefit from terrain response
  ];

  return terrainResponsiveEffects.includes(effectType);
}
