import { CoordinateSystem } from "../../rendering/CoordinateSystem";
import { axialDirections } from "../../core/Hex";
import type { ScenarioData, ScenarioDeploymentZone, TileDefinition, TileInstance, TilePalette, TerrainDefinition, TerrainDictionary } from "../../core/types";
import terrainData from "../../data/terrain.json";

/**
 * Detects whether a deployment zone description implies a water landing.
 */
function requiresWaterLanding(zone: ScenarioDeploymentZone): boolean {
  const text = `${zone.label} ${zone.description}`.toLowerCase();
  return text.includes("beach") || text.includes("landing") || text.includes("amphib") || text.includes("naval");
}

/**
 * Resolves a tile definition for the provided offset coordinate.
 * Supports scenarios that reference palette tiles as well as inline definitions.
 */
function resolveTileDefinition(
  scenario: ScenarioData,
  col: number,
  row: number
): TileDefinition | (TileDefinition & Partial<TileInstance>) {
  const rowData = scenario.tiles[row];
  if (!rowData) {
    throw new Error(`Tile row ${row} is out of bounds for deployment zone calculation.`);
  }
  const entry = rowData[col] as TileInstance | (TileDefinition & Partial<TileInstance>);
  if (!entry) {
    throw new Error(`Tile column ${col} is out of bounds for deployment zone calculation.`);
  }
  const paletteKey = (entry as TileInstance).tile;
  if (paletteKey) {
    const definition = (scenario.tilePalette as TilePalette)[paletteKey];
    if (!definition) {
      throw new Error(`Palette key '${paletteKey}' missing while resolving deployment zone terrain.`);
    }
    return definition as TileDefinition;
  }
  return entry as TileDefinition;
}

function isWaterTerrain(definition: TileDefinition): boolean {
  const terrain = (definition.terrain ?? "").toLowerCase();
  const terrainType = (definition.terrainType ?? "").toLowerCase();
  return terrainType === "water" || terrainType === "sea" || terrainType === "ocean" || terrain === "sea" || terrain === "ocean";
}

function isCoastalTerrain(definition: TileDefinition): boolean {
  return definition.terrainType === "coastal" || definition.terrain === "beach";
}

/**
 * Checks if a tile is passable for ground units by looking up terrain movement costs.
 */
function isPassableForGroundUnits(definition: TileDefinition): boolean {
  const terrainKey = definition.terrain as keyof TerrainDictionary;
  const terrainDef = (terrainData as TerrainDictionary)[terrainKey];
  if (!terrainDef) {
    return true; // Unknown terrain, assume passable
  }
  // Check if infantry (leg) can move through it (moveCost < 999 = passable)
  const legCost = terrainDef.moveCost?.leg ?? 1;
  return legCost < 999;
}

/**
 * Determines whether the supplied offset coordinate is itself water/coastal or touches a water hex.
 */
function touchesWater(scenario: ScenarioData, col: number, row: number): boolean {
  const definition = resolveTileDefinition(scenario, col, row);
  if (isWaterTerrain(definition) || isCoastalTerrain(definition)) {
    return true;
  }
  const axial = CoordinateSystem.offsetToAxial(col, row);
  return axialDirections.some((direction) => {
    const neighbor = { q: axial.q + direction.q, r: axial.r + direction.r };
    const { col: neighborCol, row: neighborRow } = CoordinateSystem.axialToOffset(neighbor.q, neighbor.r);
    if (
      neighborCol < 0 ||
      neighborRow < 0 ||
      neighborCol >= scenario.size.cols ||
      neighborRow >= scenario.size.rows
    ) {
      return false;
    }
    const neighborDefinition = resolveTileDefinition(scenario, neighborCol, neighborRow);
    return isWaterTerrain(neighborDefinition);
  });
}

function determineAnchorColumns(width: number, originalHexes: readonly [number, number][]): number[] {
  if (originalHexes.length === 0) {
    return [0, 1, 2, 3];
  }
  const averageColumn = originalHexes.reduce((sum, [col]) => sum + col, 0) / originalHexes.length;
  const anchorLeft = averageColumn < width / 2;
  const ordered: number[] = [];
  const columnRange = [...Array(width).keys()];
  if (anchorLeft) {
    columnRange.forEach((col) => ordered.push(col));
  } else {
    columnRange.reverse().forEach((col) => ordered.push(col));
  }
  return ordered;
}

function selectCandidateHexes(
  scenario: ScenarioData,
  zone: ScenarioDeploymentZone,
  targetCount: number
): string[] {
  const requiresWater = requiresWaterLanding(zone);
  const columnOrder = determineAnchorColumns(scenario.size.cols, zone.hexes);
  const selected = new Set<string>();

  const considerHex = (col: number, row: number): void => {
    if (selected.size >= targetCount) {
      return;
    }
    if (col < 0 || row < 0 || col >= scenario.size.cols || row >= scenario.size.rows) {
      return;
    }
    const definition = resolveTileDefinition(scenario, col, row);

    // Exclude impassable terrain (rivers, deep water, mountains for wheeled, etc.)
    if (!isPassableForGroundUnits(definition)) {
      return;
    }

    // For amphibious landings: include beach hexes and hexes adjacent to water (but NOT water itself)
    // Water hexes are impassable for ground units (moveCost 999)
    if (requiresWater) {
      const isWater = isWaterTerrain(definition);
      const isBeach = isCoastalTerrain(definition);
      const nearWater = touchesWater(scenario, col, row);

      // Exclude water hexes - ground units can't deploy on them
      if (isWater) {
        return;
      }

      // Accept: beach hexes or land hexes touching water (for amphibious assault)
      const qualifies = isBeach || nearWater;
      if (!qualifies) {
        return;
      }
    } else {
      // Regular deployment: no water hexes
      if (isWaterTerrain(definition)) {
        return;
      }
    }

    const hexKey = CoordinateSystem.makeHexKey(col, row);
    selected.add(hexKey);
  };

  // Pass 1: Priority edge hexes (water and beach for amphibious, first 4 columns otherwise)
  const maxEdgeDistance = requiresWater ? 4 : 2; // Expand to 5 columns for beach landings
  columnOrder.forEach((col) => {
    const distanceFromEdge = columnOrder.indexOf(col);
    if (distanceFromEdge > maxEdgeDistance) {
      return;
    }
    for (let row = 0; row < scenario.size.rows; row += 1) {
      considerHex(col, row);
      if (selected.size >= targetCount) {
        return;
      }
    }
  });

  // Pass 2: expand across the map while maintaining ordering if more slots are required.
  if (selected.size < targetCount) {
    columnOrder.forEach((col) => {
      for (let row = 0; row < scenario.size.rows; row += 1) {
        considerHex(col, row);
        if (selected.size >= targetCount) {
          return;
        }
      }
    });
  }

  if (selected.size < targetCount) {
    throw new Error(
      `Unable to allocate ${targetCount} deployment hexes for zone '${zone.key}'. ` +
        `Only ${selected.size} qualifying edge positions were found.`
    );
  }

  return Array.from(selected.values())
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Computes edge-anchored deployment hexes for a scenario zone, enforcing water adjacency when required.
 */
export function planDeploymentZoneHexes(zone: ScenarioDeploymentZone, scenario: ScenarioData): string[] {
  const targetCount = zone.capacity;
  if (targetCount <= 0) {
    throw new Error(`Deployment zone '${zone.key}' reported a non-positive capacity.`);
  }
  return selectCandidateHexes(scenario, zone, targetCount);
}
