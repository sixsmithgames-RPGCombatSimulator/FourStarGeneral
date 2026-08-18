import type {
  Axial,
  FacingDirection,
  ReconStatus,
  ScenarioData,
  ScenarioDeploymentZone,
  ScenarioSide,
  ScenarioUnit,
  TerrainDensity,
  TerrainFeature,
  TerrainKey,
  TerrainType,
  TileDefinition,
  TileInstance,
  TilePalette
} from "../core/types";
import { CoordinateSystem } from "../rendering/CoordinateSystem";

/**
 * Raw shape accepted from JSON scenario files before type-narrowing.
 * All fields are `unknown` so callers do not need to cast at call-site.
 */
export type RawScenarioInput = {
  name?: unknown;
  size?: unknown;
  tilePalette?: Record<string, unknown>;
  tiles?: unknown[];
  objectives?: unknown[];
  turnLimit?: unknown;
  playerBudget?: unknown;
  restrictedUnits?: unknown[];
  allowedUnits?: unknown[];
  mainSupplyDistanceTurns?: unknown;
  allowedBattleRequisitions?: unknown[];
  battleRequisitionPointsPerTurn?: unknown;
  battleRequisitionStartingPoints?: unknown;
  sides?: Record<string, unknown>;
  deploymentZones?: unknown[];
};

/**
 * Options that differ between the precombat minimap and the live battle screen.
 * The caller provides mission-specific overrides (e.g. difficulty-derived turn limit).
 */
export type ScenarioNormalizerOptions = {
  /** Turn limit to use — callers derive this from mission + difficulty. */
  readonly turnLimit: number;
};

/**
 * Coerces a raw tile-definition record into a well-typed TileDefinition.
 * Throws if required fields (terrain, terrainType) are absent so errors surface at load-time.
 */
function normalizeTileDefinition(
  raw: Record<string, unknown>,
  paletteKey: string
): TileDefinition {
  const terrain = raw["terrain"];
  const terrainType = raw["terrainType"];
  if (typeof terrain !== "string" || terrain.trim() === "") {
    throw new Error(
      `[scenarioNormalizer] Palette entry "${paletteKey}" is missing a non-empty terrain value.`
    );
  }
  if (typeof terrainType !== "string" || terrainType.trim() === "") {
    throw new Error(
      `[scenarioNormalizer] Palette entry "${paletteKey}" is missing a non-empty terrainType value.`
    );
  }
  return {
    terrain: terrain as TerrainKey,
    terrainType: terrainType as TerrainType,
    density: typeof raw["density"] === "string" ? (raw["density"] as TerrainDensity) : "average",
    features: Array.isArray(raw["features"])
      ? (raw["features"] as string[]).map((f) => f as TerrainFeature)
      : [],
    recon: typeof raw["recon"] === "string" ? (raw["recon"] as ReconStatus) : "none",
    spriteVariant: typeof raw["spriteVariant"] === "string" ? raw["spriteVariant"] : undefined
  };
}

/**
 * Coerces a raw tile-instance record into a typed TileInstance.
 * Throws if the tile key reference is missing or empty.
 */
function normalizeTileInstance(
  raw: Record<string, unknown>,
  gridPosition: string
): TileInstance {
  const tile = raw["tile"];
  if (typeof tile !== "string" || tile.trim() === "") {
    throw new Error(
      `[scenarioNormalizer] Tile instance at ${gridPosition} has a missing or empty tile key.`
    );
  }
  return {
    tile,
    recon: typeof raw["recon"] === "string" ? (raw["recon"] as ReconStatus) : undefined,
    density: typeof raw["density"] === "string" ? (raw["density"] as TerrainDensity) : undefined,
    features: Array.isArray(raw["features"])
      ? (raw["features"] as string[]).map((f) => f as TerrainFeature)
      : undefined,
    spriteVariant: typeof raw["spriteVariant"] === "string" ? raw["spriteVariant"] : undefined
  };
}

/**
 * Converts a [col, row] offset tuple from scenario JSON to the axial coordinate format.
 * Uses CoordinateSystem.offsetToAxial so the coordinate space matches the engine and renderer.
 */
export function tupleToAxial(coord: [number, number] | readonly [number, number] | Axial): Axial {
  if (Array.isArray(coord)) {
    const [col, row] = coord as [number, number];
    return CoordinateSystem.offsetToAxial(Number(col ?? 0), Number(row ?? 0));
  }
  return coord as Axial;
}

/**
 * Normalises the tilePalette and tiles grid from a raw scenario source into canonical
 * `TilePalette` and `TileInstance[][]` types. Inline tile definitions are hoisted into
 * the palette under generated keys so the grid contains only `TileInstance` references —
 * exactly what `CoordinateSystem.resolveTile` expects.
 *
 * This is the single place where compact string entries, tile-instance objects, and inline
 * tile-definition objects are all reduced to a uniform representation, eliminating the
 * split-brain where PrecombatScreen and BattleScreen each had independent (and divergent)
 * copies of this logic.
 */
export function normalizeTilePaletteAndGrid(raw: RawScenarioInput): {
  palette: TilePalette;
  tiles: TileInstance[][];
} {
  const palette: TilePalette = {};

  // Step 1: Normalise declared palette entries.
  for (const [key, definition] of Object.entries(raw.tilePalette ?? {})) {
    if (definition === null || typeof definition !== "object" || Array.isArray(definition)) {
      throw new Error(
        `[scenarioNormalizer] Palette key "${key}" must be an object, got ${typeof definition}.`
      );
    }
    palette[key] = normalizeTileDefinition(definition as Record<string, unknown>, key);
  }

  // Step 2: Walk the grid, handling compact strings, tile references, and inline definitions.
  const tiles: TileInstance[][] = (raw.tiles ?? []).map((rawRow, rowIndex) => {
    if (!Array.isArray(rawRow)) {
      throw new Error(
        `[scenarioNormalizer] Tile row ${rowIndex} is not an array.`
      );
    }
    return (rawRow as unknown[]).map((entry, colIndex) => {
      const position = `row ${rowIndex}, col ${colIndex}`;

      // Compact string: tile palette key used directly.
      if (typeof entry === "string") {
        if (!Object.prototype.hasOwnProperty.call(palette, entry)) {
          throw new Error(
            `[scenarioNormalizer] Compact string tile "${entry}" at ${position} has no matching palette entry.`
          );
        }
        return { tile: entry } satisfies TileInstance;
      }

      if (entry === null || typeof entry !== "object") {
        throw new Error(
          `[scenarioNormalizer] Tile entry at ${position} must be a string or object, got ${typeof entry}.`
        );
      }

      const entryRecord = entry as Record<string, unknown>;

      // Tile-instance reference: { tile: "KEY", ... }.
      if (typeof entryRecord["tile"] === "string") {
        return normalizeTileInstance(entryRecord, position);
      }

      // Inline tile definition: hoist into palette under a generated key.
      const inlineKey = `inline_${rowIndex}_${colIndex}`;
      palette[inlineKey] = normalizeTileDefinition(entryRecord, inlineKey);
      return { tile: inlineKey } satisfies TileInstance;
    });
  });

  return { palette, tiles };
}

/**
 * Normalises a raw side entry (Player / Bot / Ally) from scenario JSON.
 */
function normalizeSide(raw: Record<string, unknown> | undefined, sideKey: string): ScenarioSide {
  if (!raw) {
    // Ally side is optional in many scenarios; return an inert scaffold.
    return {
      hq: { q: 0, r: 0 },
      general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
      units: []
    } satisfies ScenarioSide;
  }

  const hqRaw = raw["hq"];
  let hqCoord: [number, number] = [0, 0];
  if (Array.isArray(hqRaw) && hqRaw.length >= 2) {
    hqCoord = [Number(hqRaw[0] ?? 0), Number(hqRaw[1] ?? 0)];
  } else if (hqRaw !== null && typeof hqRaw === "object" && !Array.isArray(hqRaw)) {
    const h = hqRaw as { q?: unknown; r?: unknown };
    hqCoord = [Number(h.q ?? 0), Number(h.r ?? 0)];
  } else if (hqRaw !== undefined) {
    throw new Error(
      `[scenarioNormalizer] Side "${sideKey}" has an unrecognised hq format: ${JSON.stringify(hqRaw)}`
    );
  }

  const rawGeneral = raw["general"] as Record<string, unknown> | undefined;
  const general = {
    accBonus: typeof rawGeneral?.["accBonus"] === "number" ? rawGeneral["accBonus"] : 0,
    dmgBonus: typeof rawGeneral?.["dmgBonus"] === "number" ? rawGeneral["dmgBonus"] : 0,
    moveBonus: typeof rawGeneral?.["moveBonus"] === "number" ? rawGeneral["moveBonus"] : 0,
    supplyBonus: typeof rawGeneral?.["supplyBonus"] === "number" ? rawGeneral["supplyBonus"] : 0
  };

  const units: ScenarioUnit[] = (Array.isArray(raw["units"]) ? raw["units"] : []).map(
    (unit: unknown, idx: number) => {
      const u = unit as Record<string, unknown>;
      const uType = u["type"];
      if (typeof uType !== "string" || uType.trim() === "") {
        throw new Error(
          `[scenarioNormalizer] Unit ${idx} in side "${sideKey}" is missing a non-empty type.`
        );
      }
      const hexRaw = u["hex"];
      let hexCoord: [number, number];
      if (Array.isArray(hexRaw) && hexRaw.length >= 2) {
        hexCoord = [Number(hexRaw[0] ?? 0), Number(hexRaw[1] ?? 0)];
      } else {
        throw new Error(
          `[scenarioNormalizer] Unit ${idx} ("${uType}") in side "${sideKey}" has an unrecognised hex format: ${JSON.stringify(hexRaw)}`
        );
      }
      return {
        type: uType as ScenarioUnit["type"],
        hex: tupleToAxial(hexCoord),
        strength: typeof u["strength"] === "number" ? u["strength"] : 0,
        experience: typeof u["experience"] === "number" ? u["experience"] : 0,
        baseExperience: typeof u["baseExperience"] === "number" ? u["baseExperience"] : undefined,
        earnedExperience: typeof u["earnedExperience"] === "number" ? u["earnedExperience"] : undefined,
        status: u["status"] !== null && typeof u["status"] === "object"
          ? structuredClone(u["status"]) as ScenarioUnit["status"]
          : undefined,
        formationKey: typeof u["formationKey"] === "string" ? u["formationKey"] : undefined,
        campaignProvenance: u["campaignProvenance"] !== null && typeof u["campaignProvenance"] === "object"
          ? structuredClone(u["campaignProvenance"]) as ScenarioUnit["campaignProvenance"]
          : undefined,
        ammo: typeof u["ammo"] === "number" ? u["ammo"] : 0,
        fuel: typeof u["fuel"] === "number" ? u["fuel"] : 0,
        entrench: typeof u["entrench"] === "number" ? u["entrench"] : 0,
        facing: typeof u["facing"] === "string" ? (u["facing"] as FacingDirection) : "SE",
        preDeployed: typeof u["preDeployed"] === "boolean" ? u["preDeployed"] : undefined,
        unitId: typeof u["unitId"] === "string" ? u["unitId"] : undefined
      } satisfies ScenarioUnit;
    }
  );

  const result: ScenarioSide = {
    hq: tupleToAxial(hqCoord),
    general,
    units
  };

  // Optional narrative / strategy fields forwarded from Bot side definitions.
  if (typeof raw["goal"] === "string") result.goal = raw["goal"];
  if (typeof raw["strategy"] === "string") result.strategy = raw["strategy"];
  if (typeof raw["resources"] === "number") result.resources = raw["resources"];
  if (Array.isArray(raw["objectives"])) {
    result.objectives = (raw["objectives"] as unknown[]).map((o) => String(o));
  }

  return result;
}

/**
 * Produces a fully-typed `ScenarioData` from a raw scenario JSON source.
 *
 * This is the **single source of truth** for scenario normalisation and must be used
 * by both PrecombatScreen (minimap) and BattleScreen (battle engine).  All tile,
 * palette, unit, and objective conversions live here so the two screens cannot diverge.
 *
 * @param raw       - Deep-cloned raw JSON payload from a scenario file.
 * @param options   - Caller-supplied mission/difficulty overrides.
 */
export function normalizeScenarioSource(
  raw: RawScenarioInput,
  options: ScenarioNormalizerOptions
): ScenarioData {
  const { palette, tiles } = normalizeTilePaletteAndGrid(raw);

  const rawSize = raw.size as Record<string, unknown> | undefined;
  const size = {
    cols: typeof rawSize?.["cols"] === "number" ? rawSize["cols"] : 0,
    rows: typeof rawSize?.["rows"] === "number" ? rawSize["rows"] : 0
  };

  const objectives = (raw.objectives ?? []).map((obj: unknown, idx: number) => {
    const o = obj as Record<string, unknown>;
    const hexRaw = o["hex"];
    if (!Array.isArray(hexRaw) || hexRaw.length < 2) {
      throw new Error(
        `[scenarioNormalizer] Objective ${idx} has an unrecognised hex format: ${JSON.stringify(hexRaw)}`
      );
    }
    return {
      owner: (o["owner"] as "Player" | "Bot") ?? "Bot",
      vp: typeof o["vp"] === "number" ? o["vp"] : 0,
      hex: tupleToAxial([Number(hexRaw[0] ?? 0), Number(hexRaw[1] ?? 0)])
    };
  });

  const sidesRecord = (raw.sides ?? {}) as Record<string, Record<string, unknown> | undefined>;

  const deploymentZones: ScenarioDeploymentZone[] | undefined = Array.isArray(raw.deploymentZones)
    ? (raw.deploymentZones as unknown[]).map((zone: unknown): ScenarioDeploymentZone => {
        const z = zone as Record<string, unknown>;
        const hexes: readonly [number, number][] = Array.isArray(z["hexes"])
          ? (z["hexes"] as unknown[]).map((hex: unknown): [number, number] => {
              if (!Array.isArray(hex) || hex.length < 2) {
                throw new Error(
                  `[scenarioNormalizer] Deployment zone "${z["key"]}" has an unrecognised hex: ${JSON.stringify(hex)}`
                );
              }
              return [Number(hex[0] ?? 0), Number(hex[1] ?? 0)];
            })
          : [];
        const zoneKey = typeof z["key"] === "string" ? z["key"] : "unknown-zone";
        return {
          key: zoneKey,
          label: typeof z["label"] === "string" ? z["label"] : "",
          description: typeof z["description"] === "string" ? z["description"] : "",
          capacity: typeof z["capacity"] === "number" ? z["capacity"] : 0,
          faction: (z["faction"] as "Player" | "Bot" | "Ally") ?? "Player",
          hexes
        } satisfies ScenarioDeploymentZone;
      })
    : undefined;

  return {
    name: typeof raw.name === "string" ? raw.name : "Unnamed Scenario",
    size,
    tilePalette: palette,
    tiles,
    objectives,
    turnLimit: options.turnLimit,
    playerBudget: typeof raw.playerBudget === "number" ? raw.playerBudget : undefined,
    restrictedUnits: Array.isArray(raw.restrictedUnits)
      ? (raw.restrictedUnits as unknown[]).map((k) => String(k))
      : undefined,
    allowedUnits: Array.isArray(raw.allowedUnits)
      ? (raw.allowedUnits as unknown[]).map((k) => String(k))
      : undefined,
    mainSupplyDistanceTurns:
      typeof raw.mainSupplyDistanceTurns === "number" ? raw.mainSupplyDistanceTurns : undefined,
    allowedBattleRequisitions: Array.isArray(raw.allowedBattleRequisitions)
      ? (raw.allowedBattleRequisitions as unknown[]).map((k) => String(k))
      : undefined,
    battleRequisitionPointsPerTurn:
      typeof raw.battleRequisitionPointsPerTurn === "number"
        ? raw.battleRequisitionPointsPerTurn
        : undefined,
    battleRequisitionStartingPoints:
      typeof raw.battleRequisitionStartingPoints === "number"
        ? raw.battleRequisitionStartingPoints
        : undefined,
    sides: {
      Player: normalizeSide(sidesRecord["Player"], "Player"),
      Bot: normalizeSide(sidesRecord["Bot"], "Bot"),
      Ally: sidesRecord["Ally"] ? normalizeSide(sidesRecord["Ally"], "Ally") : undefined
    },
    deploymentZones
  } satisfies ScenarioData;
}
