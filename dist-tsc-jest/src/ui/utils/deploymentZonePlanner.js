import { CoordinateSystem } from "../../rendering/CoordinateSystem";
import { axialDirections } from "../../core/Hex";
import { getMissionDeploymentZoneDoctrine } from "../../data/missions";
import terrainData from "../../data/terrain.json";
/**
 * Detects whether a deployment zone description implies a water landing.
 */
function requiresWaterLanding(zone) {
    const text = `${zone.label} ${zone.description}`.toLowerCase();
    return text.includes("beach") || text.includes("landing") || text.includes("amphib") || text.includes("naval");
}
function resolveTargetCapacity(zone, missionKey) {
    if (zone.faction !== "Player" || !missionKey) {
        return zone.capacity;
    }
    const doctrine = getMissionDeploymentZoneDoctrine(missionKey, zone.key);
    if (!doctrine) {
        return zone.capacity;
    }
    return Math.max(zone.capacity, doctrine.minimumCapacity);
}
/**
 * Resolves a tile definition for the provided offset coordinate.
 * Supports scenarios that reference palette tiles as well as inline definitions.
 */
function resolveTileDefinition(scenario, col, row) {
    const rowData = scenario.tiles[row];
    if (!rowData) {
        throw new Error(`Tile row ${row} is out of bounds for deployment zone calculation.`);
    }
    const entry = rowData[col];
    if (!entry) {
        throw new Error(`Tile column ${col} is out of bounds for deployment zone calculation.`);
    }
    const paletteKey = entry.tile;
    if (paletteKey) {
        const definition = scenario.tilePalette[paletteKey];
        if (!definition) {
            throw new Error(`Palette key '${paletteKey}' missing while resolving deployment zone terrain.`);
        }
        return definition;
    }
    return entry;
}
function isWaterTerrain(definition) {
    const terrain = (definition.terrain ?? "").toLowerCase();
    const terrainType = (definition.terrainType ?? "").toLowerCase();
    return terrainType === "water" || terrainType === "sea" || terrainType === "ocean" || terrain === "sea" || terrain === "ocean";
}
function isCoastalTerrain(definition) {
    return definition.terrainType === "coastal" || definition.terrain === "beach";
}
/**
 * Checks if a tile is passable for ground units by looking up terrain movement costs.
 */
function isPassableForGroundUnits(definition) {
    const terrainKey = definition.terrain;
    const terrainDef = terrainData[terrainKey];
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
function touchesWater(scenario, col, row) {
    const definition = resolveTileDefinition(scenario, col, row);
    if (isWaterTerrain(definition) || isCoastalTerrain(definition)) {
        return true;
    }
    const axial = CoordinateSystem.offsetToAxial(col, row);
    return axialDirections.some((direction) => {
        const neighbor = { q: axial.q + direction.q, r: axial.r + direction.r };
        const { col: neighborCol, row: neighborRow } = CoordinateSystem.axialToOffset(neighbor.q, neighbor.r);
        if (neighborCol < 0 ||
            neighborRow < 0 ||
            neighborCol >= scenario.size.cols ||
            neighborRow >= scenario.size.rows) {
            return false;
        }
        const neighborDefinition = resolveTileDefinition(scenario, neighborCol, neighborRow);
        return isWaterTerrain(neighborDefinition);
    });
}
function determineAnchorColumns(width, originalHexes) {
    if (originalHexes.length === 0) {
        return [0, 1, 2, 3];
    }
    const averageColumn = originalHexes.reduce((sum, [col]) => sum + col, 0) / originalHexes.length;
    const anchorLeft = averageColumn < width / 2;
    const ordered = [];
    const columnRange = [...Array(width).keys()];
    if (anchorLeft) {
        columnRange.forEach((col) => ordered.push(col));
    }
    else {
        columnRange.reverse().forEach((col) => ordered.push(col));
    }
    return ordered;
}
function parseHexKey(hexKey) {
    const [colText, rowText] = hexKey.split(",");
    const col = Number.parseInt(colText ?? "", 10);
    const row = Number.parseInt(rowText ?? "", 10);
    if (Number.isNaN(col) || Number.isNaN(row)) {
        return null;
    }
    return { col, row };
}
function determineExpansionColumns(width, seededHexKeys, originalHexes) {
    if (seededHexKeys.length === 0) {
        return determineAnchorColumns(width, originalHexes);
    }
    const seededColumns = seededHexKeys
        .map((hexKey) => parseHexKey(hexKey)?.col ?? null)
        .filter((value) => value !== null);
    if (seededColumns.length === 0) {
        return determineAnchorColumns(width, originalHexes);
    }
    const minimumColumn = Math.min(...seededColumns);
    const maximumColumn = Math.max(...seededColumns);
    const averageColumn = seededColumns.reduce((sum, value) => sum + value, 0) / seededColumns.length;
    const anchorLeft = averageColumn < width / 2;
    const ordered = [];
    if (anchorLeft) {
        for (let col = maximumColumn + 1; col < width; col += 1) {
            ordered.push(col);
        }
        for (let col = minimumColumn - 1; col >= 0; col -= 1) {
            ordered.push(col);
        }
    }
    else {
        for (let col = minimumColumn - 1; col >= 0; col -= 1) {
            ordered.push(col);
        }
        for (let col = maximumColumn + 1; col < width; col += 1) {
            ordered.push(col);
        }
    }
    return ordered;
}
function determinePreferredRows(height, seededHexKeys) {
    if (seededHexKeys.length === 0) {
        return [...Array(height).keys()];
    }
    const seededRows = seededHexKeys
        .map((hexKey) => parseHexKey(hexKey)?.row ?? null)
        .filter((value) => value !== null);
    if (seededRows.length === 0) {
        return [...Array(height).keys()];
    }
    const minimumRow = Math.min(...seededRows);
    const maximumRow = Math.max(...seededRows);
    return [...Array(height).keys()].sort((left, right) => {
        const leftDistance = left < minimumRow ? minimumRow - left : left > maximumRow ? left - maximumRow : 0;
        const rightDistance = right < minimumRow ? minimumRow - right : right > maximumRow ? right - maximumRow : 0;
        if (leftDistance !== rightDistance) {
            return leftDistance - rightDistance;
        }
        return left - right;
    });
}
function determineSeedRowBand(seededHexKeys) {
    const seededRows = seededHexKeys
        .map((hexKey) => parseHexKey(hexKey)?.row ?? null)
        .filter((value) => value !== null);
    if (seededRows.length === 0) {
        return null;
    }
    return {
        minimumRow: Math.min(...seededRows),
        maximumRow: Math.max(...seededRows)
    };
}
function isEligibleHexForZone(scenario, zone, col, row) {
    if (col < 0 || row < 0 || col >= scenario.size.cols || row >= scenario.size.rows) {
        return false;
    }
    const definition = resolveTileDefinition(scenario, col, row);
    if (!isPassableForGroundUnits(definition)) {
        return false;
    }
    if (requiresWaterLanding(zone)) {
        if (isWaterTerrain(definition)) {
            return false;
        }
        return isCoastalTerrain(definition) || touchesWater(scenario, col, row);
    }
    return !isWaterTerrain(definition);
}
function isEligibleAuthoredHexForZone(scenario, zone, col, row) {
    if (col < 0 || row < 0 || col >= scenario.size.cols || row >= scenario.size.rows) {
        return false;
    }
    const definition = resolveTileDefinition(scenario, col, row);
    if (!isPassableForGroundUnits(definition)) {
        return false;
    }
    return !isWaterTerrain(definition);
}
function collectAuthoredHexes(zone, scenario) {
    const authoredHexes = new Set();
    zone.hexes.forEach(([col, row]) => {
        if (!isEligibleAuthoredHexForZone(scenario, zone, col, row)) {
            throw new Error(`Deployment zone '${zone.key}' includes an unusable authored hex at ${col},${row}.`);
        }
        authoredHexes.add(CoordinateSystem.makeHexKey(col, row));
    });
    return Array.from(authoredHexes.values()).sort((a, b) => a.localeCompare(b));
}
function normalizeZoneFaction(zone) {
    if (zone.faction === "Player" || zone.faction === "Bot") {
        return zone.faction;
    }
    throw new Error(`Deployment zone '${zone.key}' uses unsupported faction '${zone.faction}'.`);
}
function selectCandidateHexes(scenario, zone, targetCount, seededHexKeys = []) {
    const columnOrder = determineExpansionColumns(scenario.size.cols, seededHexKeys, zone.hexes);
    const rowOrder = determinePreferredRows(scenario.size.rows, seededHexKeys);
    const seedRowBand = determineSeedRowBand(seededHexKeys);
    const focusedRows = seedRowBand
        ? rowOrder.filter((row) => row >= seedRowBand.minimumRow && row <= seedRowBand.maximumRow)
        : rowOrder;
    const secondaryRows = seedRowBand
        ? rowOrder.filter((row) => row < seedRowBand.minimumRow || row > seedRowBand.maximumRow)
        : [];
    const selected = new Set(seededHexKeys);
    const considerHex = (col, row) => {
        if (selected.size >= targetCount) {
            return;
        }
        if (!isEligibleHexForZone(scenario, zone, col, row)) {
            return;
        }
        const hexKey = CoordinateSystem.makeHexKey(col, row);
        selected.add(hexKey);
    };
    // Pass 1: Priority edge hexes (water and beach for amphibious, first 4 columns otherwise)
    const requiresWater = requiresWaterLanding(zone);
    const maxEdgeDistance = requiresWater ? 4 : 2; // Expand to 5 columns for beach landings
    columnOrder.forEach((col) => {
        const distanceFromEdge = columnOrder.indexOf(col);
        if (distanceFromEdge > maxEdgeDistance) {
            return;
        }
        for (const row of focusedRows) {
            considerHex(col, row);
            if (selected.size >= targetCount) {
                return;
            }
        }
    });
    if (selected.size < targetCount) {
        columnOrder.forEach((col) => {
            const distanceFromEdge = columnOrder.indexOf(col);
            if (distanceFromEdge > maxEdgeDistance) {
                return;
            }
            for (const row of secondaryRows) {
                considerHex(col, row);
                if (selected.size >= targetCount) {
                    return;
                }
            }
        });
    }
    // Pass 2: expand across the map while maintaining ordering if more slots are required.
    if (selected.size < targetCount) {
        columnOrder.forEach((col) => {
            for (const row of rowOrder) {
                considerHex(col, row);
                if (selected.size >= targetCount) {
                    return;
                }
            }
        });
    }
    if (selected.size < targetCount) {
        throw new Error(`Unable to allocate ${targetCount} deployment hexes for zone '${zone.key}'. ` +
            `Only ${selected.size} qualifying edge positions were found.`);
    }
    return Array.from(selected.values())
        .sort((a, b) => a.localeCompare(b));
}
/**
 * Computes edge-anchored deployment hexes for a scenario zone, enforcing water adjacency when required.
 */
export function measureDeploymentZoneGeometry(hexKeys) {
    const columns = new Set();
    const rows = new Set();
    hexKeys.forEach((hexKey) => {
        const [colText, rowText] = hexKey.split(",");
        const col = Number.parseInt(colText ?? "", 10);
        const row = Number.parseInt(rowText ?? "", 10);
        if (Number.isNaN(col) || Number.isNaN(row)) {
            return;
        }
        columns.add(col);
        rows.add(row);
    });
    return {
        frontage: columns.size,
        depth: rows.size
    };
}
export function planDeploymentZoneHexes(zone, scenario, missionKey) {
    const targetCount = resolveTargetCapacity(zone, missionKey);
    if (targetCount <= 0) {
        throw new Error(`Deployment zone '${zone.key}' reported a non-positive capacity.`);
    }
    const authoredHexes = collectAuthoredHexes(zone, scenario);
    if (authoredHexes.length >= targetCount) {
        return authoredHexes;
    }
    return selectCandidateHexes(scenario, zone, targetCount, authoredHexes);
}
export function finalizeDeploymentZone(zone, scenario, missionKey) {
    const capacity = resolveTargetCapacity(zone, missionKey);
    return {
        zoneKey: zone.key,
        capacity,
        hexKeys: planDeploymentZoneHexes(zone, scenario, missionKey),
        name: zone.label,
        description: zone.description,
        faction: normalizeZoneFaction(zone)
    };
}
