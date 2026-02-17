import terrainData from "../data/terrain.json";
import unitTypes from "../data/unitTypes.json";
import scenarioData from "../data/scenario01.json";
import {
  GENERAL_MODIFIER_KEYS,
  UNIT_PROPERTY_KEYS,
  UNIT_ARMOR_FACING_KEYS,
  UNIT_CLASS_KEYS,
  UNIT_TRAIT_KEYS,
  MOVE_PROFILE_KEYS,
  TERRAIN_NAME_KEYS,
  TERRAIN_PROPERTY_KEYS,
  TERRAIN_TYPE_KEYS,
  TERRAIN_DENSITY_KEYS,
  TERRAIN_FEATURE_KEYS,
  SCENARIO_TILE_PROPERTY_KEYS,
  SCENARIO_RECON_KEYS,
  SCENARIO_UNIT_PROPERTY_KEYS,
  SCENARIO_UNIT_FACING_KEYS
} from "../data/gameplayCanon";
import { COMMANDER_DEFAULTS, FUEL_COST, TRAIT_EFFECTS } from "./balance";

type KeyList = readonly string[];

type IndexedRecord = Record<string, unknown>;

type StringRecord = Record<string, string>;

type NumberRecord = Record<string, number>;

function toKeySet(keys: KeyList): Set<string> {
  return new Set<string>(keys);
}

function ensureExactKeys(record: IndexedRecord, expectedKeys: KeyList, context: string): void {
  const actual = Object.keys(record);
  const expected = toKeySet(expectedKeys);

  for (const key of actual) {
    if (!expected.has(key)) {
      throw new Error(`${context} contains unexpected key "${key}"`);
    }
  }

  for (const key of expected) {
    if (!(key in record)) {
      throw new Error(`${context} is missing key "${key}"`);
    }
  }
}

function ensureKeysSubset(record: IndexedRecord, allowedKeys: KeyList, context: string): void {
  const allowed = toKeySet(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error(`${context} contains unsupported key "${key}"`);
    }
  }
}

function ensureValueInSet(value: string, allowedKeys: KeyList, context: string): void {
  const allowed = toKeySet(allowedKeys);
  if (!allowed.has(value)) {
    throw new Error(`${context} has unsupported value "${value}"`);
  }
}

function ensureArrayValuesInSet(values: readonly string[], allowedKeys: KeyList, context: string): void {
  const allowed = toKeySet(allowedKeys);
  const seen = new Set<string>();

  for (const value of values) {
    if (!allowed.has(value)) {
      throw new Error(`${context} contains unsupported entry "${value}"`);
    }
    if (seen.has(value)) {
      throw new Error(`${context} contains duplicate entry "${value}"`);
    }
    seen.add(value);
  }
}

function ensureTuple(value: unknown, length: number, context: string): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(`${context} must be an array of length ${length}`);
  }
}

export function validateGameplayCanon(): void {
  // General modifiers
  ensureExactKeys(COMMANDER_DEFAULTS, GENERAL_MODIFIER_KEYS, "COMMANDER_DEFAULTS");
  ensureExactKeys(FUEL_COST as NumberRecord, MOVE_PROFILE_KEYS, "FUEL_COST");
  ensureExactKeys(TRAIT_EFFECTS as IndexedRecord, UNIT_TRAIT_KEYS, "TRAIT_EFFECTS");
  // SIZE_ACCURACY_MOD removed - now using range-based accuracy tables

  Object.entries(scenarioData.sides).forEach(([sideKey, side]) => {
    ensureExactKeys(side.general as IndexedRecord, GENERAL_MODIFIER_KEYS, `scenario sides.${sideKey}.general`);
  });

  // Terrain definitions
  const terrainNames = toKeySet(TERRAIN_NAME_KEYS);
  ensureKeysSubset(terrainData as IndexedRecord, TERRAIN_NAME_KEYS, "terrain.json root keys");

  Object.entries(terrainData).forEach(([terrainKey, terrainDef]) => {
    if (!terrainNames.has(terrainKey)) {
      throw new Error(`terrain.json contains unknown terrain key "${terrainKey}"`);
    }
    ensureExactKeys(terrainDef as IndexedRecord, TERRAIN_PROPERTY_KEYS, `terrain ${terrainKey}`);
    const moveCost = (terrainDef as { moveCost: NumberRecord }).moveCost;
    ensureExactKeys(moveCost, MOVE_PROFILE_KEYS, `terrain ${terrainKey}.moveCost`);
  });

  // Unit definitions
  Object.entries(unitTypes).forEach(([unitKey, unitDef]) => {
    ensureExactKeys(unitDef as IndexedRecord, UNIT_PROPERTY_KEYS, `unitTypes ${unitKey}`);

    const unitRecord = unitDef as {
      class: string;
      moveType: string;
      traits: readonly string[];
      armor: NumberRecord;
    };

    ensureValueInSet(unitRecord.class, UNIT_CLASS_KEYS, `unitTypes ${unitKey}.class`);
    ensureValueInSet(unitRecord.moveType, MOVE_PROFILE_KEYS, `unitTypes ${unitKey}.moveType`);
    ensureArrayValuesInSet(unitRecord.traits, UNIT_TRAIT_KEYS, `unitTypes ${unitKey}.traits`);
    ensureExactKeys(unitRecord.armor, UNIT_ARMOR_FACING_KEYS, `unitTypes ${unitKey}.armor`);
  });

  // Scenario tile palette
  Object.entries(scenarioData.tilePalette).forEach(([tileKey, tileDef]) => {
    ensureExactKeys(tileDef as IndexedRecord, SCENARIO_TILE_PROPERTY_KEYS, `tilePalette ${tileKey}`);

    const definition = tileDef as {
      terrain: string;
      terrainType: string;
      density: string;
      features: readonly string[];
      recon: string;
    };

    ensureValueInSet(definition.terrain, TERRAIN_NAME_KEYS, `tilePalette ${tileKey}.terrain`);
    ensureValueInSet(definition.terrainType, TERRAIN_TYPE_KEYS, `tilePalette ${tileKey}.terrainType`);
    ensureValueInSet(definition.density, TERRAIN_DENSITY_KEYS, `tilePalette ${tileKey}.density`);
    ensureArrayValuesInSet(definition.features, TERRAIN_FEATURE_KEYS, `tilePalette ${tileKey}.features`);
    ensureValueInSet(definition.recon, SCENARIO_RECON_KEYS, `tilePalette ${tileKey}.recon`);
  });

  const paletteKeys = new Set(Object.keys(scenarioData.tilePalette));

  scenarioData.tiles.forEach((row, rowIndex) => {
    row.forEach((tile, colIndex) => {
      if ((tile as { tile?: string }).tile) {
        const tileId = (tile as { tile: string }).tile;
        if (!paletteKeys.has(tileId)) {
          throw new Error(`scenario tiles[${rowIndex}][${colIndex}] references unknown tile palette key "${tileId}"`);
        }
        return;
      }

      ensureExactKeys(tile as IndexedRecord, SCENARIO_TILE_PROPERTY_KEYS, `scenario tiles[${rowIndex}][${colIndex}] definition`);

      const definition = tile as {
        terrain: string;
        terrainType: string;
        density: string;
        features: readonly string[];
        recon: string;
      };

      ensureValueInSet(definition.terrain, TERRAIN_NAME_KEYS, `scenario tiles[${rowIndex}][${colIndex}].terrain`);
      ensureValueInSet(definition.terrainType, TERRAIN_TYPE_KEYS, `scenario tiles[${rowIndex}][${colIndex}].terrainType`);
      ensureValueInSet(definition.density, TERRAIN_DENSITY_KEYS, `scenario tiles[${rowIndex}][${colIndex}].density`);
      ensureArrayValuesInSet(definition.features, TERRAIN_FEATURE_KEYS, `scenario tiles[${rowIndex}][${colIndex}].features`);
      ensureValueInSet(definition.recon, SCENARIO_RECON_KEYS, `scenario tiles[${rowIndex}][${colIndex}].recon`);
    });
  });

  // Scenario units
  Object.entries(scenarioData.sides).forEach(([sideKey, side]) => {
    side.units.forEach((unit, unitIndex) => {
      ensureExactKeys(unit as IndexedRecord, SCENARIO_UNIT_PROPERTY_KEYS, `scenario sides.${sideKey}.units[${unitIndex}]`);

      const definition = unit as {
        type: string;
        hex: unknown;
        facing: string;
      };

      if (!(definition.type in unitTypes)) {
        throw new Error(`scenario sides.${sideKey}.units[${unitIndex}].type references unknown unit "${definition.type}"`);
      }

      ensureValueInSet(definition.facing, SCENARIO_UNIT_FACING_KEYS, `scenario sides.${sideKey}.units[${unitIndex}].facing`);
      ensureTuple(definition.hex, 2, `scenario sides.${sideKey}.units[${unitIndex}].hex`);
    });
  });
}
