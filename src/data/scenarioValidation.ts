import { hexDistance, type Axial } from "../core/Hex";
import type { MissionKey } from "../state/UIState";
import type { ScenarioDeploymentZone, TileInstance, TilePalette } from "../core/types";
import { getMissionDeploymentProfile, isValidMission } from "./missions";
import { getFormation, isUnitAllocationKey } from "./unitSystem/formations";
import { finalizeDeploymentZone, measureDeploymentZoneGeometry, type DeploymentZonePlanningScenario } from "../ui/utils/deploymentZonePlanner";

type SupportedMissionKey = MissionKey;

type RawScenarioSource = {
  name?: unknown;
  size?: { cols?: unknown; rows?: unknown } | unknown;
  tilePalette?: Record<string, unknown> | unknown;
  tiles?: unknown;
  objectives?: unknown;
  deploymentZones?: unknown;
  mainSupplyDistanceTurns?: unknown;
  allowedBattleRequisitions?: unknown;
  battleRequisitionPointsPerTurn?: unknown;
  battleRequisitionStartingPoints?: unknown;
  sides?: Record<string, unknown> | unknown;
};

type RawScenarioSize = { cols: number; rows: number };

/** Maximum allowed hexes (cols × rows bounding rectangle) for a tactical scenario. Keeps SVG DOM node count and AI pathfinding within browser performance bounds. */
const MAX_HEX_COUNT = 2000;

type RawScenarioProfile = {
  readonly scenarioName: string;
  readonly allowedMissionKeys: readonly SupportedMissionKey[];
  readonly minCols: number;
  readonly minRows: number;
  readonly minObjectiveCount: number;
  readonly minObjectiveSpacing: number;
  readonly minRangeBuffer: number;
};

export interface ScenarioValidationResult {
  readonly missionKey: string;
  readonly scenarioName: string | null;
  readonly issues: readonly string[];
}

const scenarioProfilesByName: Record<string, RawScenarioProfile> = {
  "Coastal Push": {
    scenarioName: "Coastal Push",
    allowedMissionKeys: ["training", "patrol", "assault", "campaign"],
    minCols: 20,
    minRows: 15,
    minObjectiveCount: 3,
    minObjectiveSpacing: 4,
    minRangeBuffer: 6
  },
  "Town Defense": {
    scenarioName: "Town Defense",
    allowedMissionKeys: ["patrol"],
    minCols: 20,
    minRows: 15,
    minObjectiveCount: 1,
    minObjectiveSpacing: 4,
    minRangeBuffer: 6
  },
  "River Crossing Watch": {
    scenarioName: "River Crossing Watch",
    allowedMissionKeys: ["patrol_river_watch"],
    minCols: 14,
    minRows: 12,
    minObjectiveCount: 3,
    minObjectiveSpacing: 2,
    minRangeBuffer: 6
  },
  "Pointe du Hoc": {
    scenarioName: "Pointe du Hoc",
    allowedMissionKeys: ["patrol_pointe_du_hoc"],
    minCols: 16,
    minRows: 14,
    minObjectiveCount: 3,
    minObjectiveSpacing: 3,
    minRangeBuffer: 6
  },
  "Citadel Ridge": {
    scenarioName: "Citadel Ridge",
    allowedMissionKeys: ["assault_citadel_ridge"],
    minCols: 24,
    minRows: 18,
    minObjectiveCount: 4,
    minObjectiveSpacing: 3,
    minRangeBuffer: 6
  },
  "El Alamein": {
    scenarioName: "El Alamein",
    allowedMissionKeys: ["assault_el_alamein"],
    minCols: 30,
    minRows: 20,
    minObjectiveCount: 4,
    minObjectiveSpacing: 4,
    minRangeBuffer: 6
  },
  "Kasserine Pass": {
    scenarioName: "Kasserine Pass",
    allowedMissionKeys: ["assault_kasserine_pass"],
    minCols: 26,
    minRows: 20,
    minObjectiveCount: 4,
    minObjectiveSpacing: 4,
    minRangeBuffer: 6
  },
  "Gela Landings": {
    scenarioName: "Gela Landings",
    allowedMissionKeys: ["assault_gela_landings"],
    minCols: 28,
    minRows: 18,
    minObjectiveCount: 4,
    minObjectiveSpacing: 4,
    minRangeBuffer: 6
  },
  "Anzio Beachhead": {
    scenarioName: "Anzio Beachhead",
    allowedMissionKeys: ["assault_anzio_beachhead"],
    minCols: 30,
    minRows: 20,
    minObjectiveCount: 4,
    minObjectiveSpacing: 4,
    minRangeBuffer: 6
  },
  "Monte Cassino": {
    scenarioName: "Monte Cassino",
    allowedMissionKeys: ["assault_monte_cassino"],
    minCols: 28,
    minRows: 22,
    minObjectiveCount: 4,
    minObjectiveSpacing: 4,
    minRangeBuffer: 6
  },
  "Omaha Beach": {
    scenarioName: "Omaha Beach",
    allowedMissionKeys: ["assault_omaha_beach"],
    minCols: 30,
    minRows: 18,
    minObjectiveCount: 4,
    minObjectiveSpacing: 4,
    minRangeBuffer: 6
  },
  "Carentan": {
    scenarioName: "Carentan",
    allowedMissionKeys: ["assault_carentan"],
    minCols: 26,
    minRows: 18,
    minObjectiveCount: 4,
    minObjectiveSpacing: 4,
    minRangeBuffer: 6
  },
  "Arnhem Bridge": {
    scenarioName: "Arnhem Bridge",
    allowedMissionKeys: ["assault_arnhem_bridge"],
    minCols: 30,
    minRows: 18,
    minObjectiveCount: 4,
    minObjectiveSpacing: 4,
    minRangeBuffer: 6
  },
  "Falaise Pocket": {
    scenarioName: "Falaise Pocket",
    allowedMissionKeys: ["assault_falaise_pocket"],
    minCols: 30,
    minRows: 22,
    minObjectiveCount: 4,
    minObjectiveSpacing: 4,
    minRangeBuffer: 6
  },
  "Hurtgen Forest": {
    scenarioName: "Hurtgen Forest",
    allowedMissionKeys: ["assault_hurtgen_forest"],
    minCols: 28,
    minRows: 22,
    minObjectiveCount: 4,
    minObjectiveSpacing: 4,
    minRangeBuffer: 6
  },
  "Bastogne": {
    scenarioName: "Bastogne",
    allowedMissionKeys: ["assault_bastogne"],
    minCols: 28,
    minRows: 22,
    minObjectiveCount: 4,
    minObjectiveSpacing: 4,
    minRangeBuffer: 6
  },
  "Remagen": {
    scenarioName: "Remagen",
    allowedMissionKeys: ["assault_remagen"],
    minCols: 30,
    minRows: 20,
    minObjectiveCount: 4,
    minObjectiveSpacing: 4,
    minRangeBuffer: 6
  },
  "Two Bridges": {
    scenarioName: "Two Bridges",
    allowedMissionKeys: ["assault"],
    minCols: 20,
    minRows: 16,
    minObjectiveCount: 4,
    minObjectiveSpacing: 3,
    minRangeBuffer: 6
  }
};

/**
 * Profile applied to scenarios generated by the campaign battle generator (marked with
 * campaignTemplateKey). These reuse authored template maps whose geometry already passed their
 * own mission profiles, so the generated profile enforces sane floors rather than per-map tuning.
 */
const CAMPAIGN_GENERATED_PROFILE: RawScenarioProfile = {
  scenarioName: "Campaign Generated",
  allowedMissionKeys: ["campaign"],
  minCols: 20,
  minRows: 15,
  minObjectiveCount: 3,
  minObjectiveSpacing: 2,
  minRangeBuffer: 6
};

export function validateScenarioSource(source: unknown, missionKey: string): ScenarioValidationResult {
  const issues: string[] = [];
  const record = asRecord(source);
  const scenarioName = readString(record?.name);

  if (!scenarioName) {
    issues.push(`Scenario for mission ${missionKey} is missing a non-empty name.`);
  }
  if (!isValidMission(missionKey)) {
    issues.push(`Mission key ${missionKey} is not registered in mission metadata.`);
  }

  // Generated campaign scenarios carry dynamic names ("Fortified Assault — Hex 5,5"), so they are
  // recognized by their template marker rather than the authored-name registry.
  const isCampaignGenerated = typeof (record as Record<string, unknown> | null)?.["campaignTemplateKey"] === "string";
  const profile = isCampaignGenerated
    ? CAMPAIGN_GENERATED_PROFILE
    : scenarioName
      ? scenarioProfilesByName[scenarioName]
      : null;
  if (scenarioName && !profile) {
    issues.push(`Scenario ${scenarioName} does not have an authoritative validation profile.`);
  }
  if (profile && !profile.allowedMissionKeys.includes(missionKey as SupportedMissionKey)) {
    issues.push(
      `Scenario ${scenarioName} is not approved for mission key ${missionKey}. Allowed mission keys: ${profile.allowedMissionKeys.join(", ")}.`
    );
  }

  const size = readScenarioSize(record, issues, missionKey, scenarioName);
  const tilePalette = readTilePalette(record, issues, missionKey, scenarioName);
  const tiles = readTileRows(record, issues, missionKey, scenarioName, size);
  validateTileCoverage(issues, missionKey, scenarioName, size, tilePalette, tiles);
  validateObjectives(record, issues, missionKey, scenarioName, size, profile);
  validateDeploymentZones(record, issues, missionKey, scenarioName, size, tilePalette, tiles);
  validateRangeEnvelope(record, issues, missionKey, scenarioName, size, profile);
  validateBattleRequisitionPolicy(record, issues, missionKey, scenarioName);
  validateSides(record, issues, missionKey, scenarioName, size);

  return {
    missionKey,
    scenarioName,
    issues
  };
}

function validateBattleRequisitionPolicy(
  record: RawScenarioSource | null,
  issues: string[],
  missionKey: string,
  scenarioName: string | null
): void {
  const label = scenarioName ?? missionKey;
  const distance = readInteger(record?.mainSupplyDistanceTurns);
  if (distance === null || distance <= 0) {
    issues.push(`Scenario ${label} must declare a positive mainSupplyDistanceTurns value for in-battle requisitions.`);
  }
  const passiveIncome = readInteger(record?.battleRequisitionPointsPerTurn);
  if (record?.battleRequisitionPointsPerTurn !== undefined && passiveIncome === null) {
    issues.push(`Scenario ${label} battleRequisitionPointsPerTurn must be an integer when declared.`);
  } else if (passiveIncome !== null && passiveIncome < 0) {
    issues.push(`Scenario ${label} battleRequisitionPointsPerTurn cannot be negative.`);
  }
  const startingPoints = readInteger(record?.battleRequisitionStartingPoints);
  if (record?.battleRequisitionStartingPoints !== undefined && startingPoints === null) {
    issues.push(`Scenario ${label} battleRequisitionStartingPoints must be an integer when declared.`);
  } else if (startingPoints !== null && startingPoints < 0) {
    issues.push(`Scenario ${label} battleRequisitionStartingPoints cannot be negative.`);
  }

  const allowed = record?.allowedBattleRequisitions;
  if (!Array.isArray(allowed) || allowed.length === 0) {
    issues.push(`Scenario ${label} must declare at least one allowedBattleRequisitions entry.`);
    return;
  }

  allowed.forEach((entry, index) => {
    const key = readString(entry);
    if (!key || !isUnitAllocationKey(key)) {
      issues.push(`Scenario ${label} allowedBattleRequisitions[${index}] must be a valid formation allocation key.`);
      return;
    }
    const formation = getFormation(key);
    if (!formation) {
      issues.push(`Scenario ${label} allowedBattleRequisitions[${index}] references missing formation ${key}.`);
      return;
    }
    if (formation.requisition.inBattleAllowed !== true) {
      issues.push(`Scenario ${label} allows ${key} for in-battle requisition, but that formation is not marked inBattleAllowed.`);
    }
    if (formation.requisition.implemented === false) {
      issues.push(`Scenario ${label} allows ${key} for in-battle requisition, but that formation is not implemented.`);
    }
  });
}

export function assertScenarioSourceValid(source: unknown, missionKey: string): void {
  const result = validateScenarioSource(source, missionKey);
  if (result.issues.length === 0) {
    return;
  }
  const scenarioLabel = result.scenarioName ?? "unknown scenario";
  throw new Error(
    `[scenarioValidation] Validation failed for mission ${missionKey} (${scenarioLabel}):\n- ${result.issues.join("\n- ")}`
  );
}

function validateObjectives(
  record: RawScenarioSource | null,
  issues: string[],
  missionKey: string,
  scenarioName: string | null,
  size: RawScenarioSize | null,
  profile: RawScenarioProfile | null
): void {
  const objectivesValue = record?.objectives;
  if (!Array.isArray(objectivesValue)) {
    issues.push(`Scenario ${scenarioName ?? missionKey} must declare an objectives array.`);
    return;
  }

  if (profile && objectivesValue.length < profile.minObjectiveCount) {
    issues.push(
      `Scenario ${scenarioName ?? missionKey} only defines ${objectivesValue.length} objectives; at least ${profile.minObjectiveCount} are required.`
    );
  }

  const objectiveAxials: Axial[] = [];
  objectivesValue.forEach((objective, index) => {
    const objectiveRecord = asRecord(objective);
    const hex = objectiveRecord?.hex;
    if (!Array.isArray(hex) || hex.length < 2) {
      issues.push(`Objective ${index} in scenario ${scenarioName ?? missionKey} must declare a [col, row] hex.`);
      return;
    }
    const col = readInteger(hex[0]);
    const row = readInteger(hex[1]);
    if (col === null || row === null) {
      issues.push(`Objective ${index} in scenario ${scenarioName ?? missionKey} uses a non-integer hex coordinate.`);
      return;
    }
    if (size && !isWithinBounds(col, row, size)) {
      issues.push(`Objective ${index} in scenario ${scenarioName ?? missionKey} lies outside the ${size.cols}x${size.rows} map.`);
      return;
    }
    objectiveAxials.push(offsetToAxial(col, row));
  });

  if (!profile || objectiveAxials.length < 2) {
    return;
  }

  let minSpacing = Number.POSITIVE_INFINITY;
  for (let index = 0; index < objectiveAxials.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < objectiveAxials.length; compareIndex += 1) {
      minSpacing = Math.min(minSpacing, hexDistance(objectiveAxials[index], objectiveAxials[compareIndex]));
    }
  }

  if (Number.isFinite(minSpacing) && minSpacing < profile.minObjectiveSpacing) {
    issues.push(
      `Scenario ${scenarioName ?? missionKey} clusters objectives too tightly. Minimum spacing is ${minSpacing}; require at least ${profile.minObjectiveSpacing}.`
    );
  }
}

function validateDeploymentZones(
  record: RawScenarioSource | null,
  issues: string[],
  missionKey: string,
  scenarioName: string | null,
  size: RawScenarioSize | null,
  tilePalette: Record<string, unknown> | null,
  tiles: unknown[][] | null
): void {
  const zonesValue = record?.deploymentZones;
  if (!Array.isArray(zonesValue)) {
    issues.push(`Scenario ${scenarioName ?? missionKey} must declare deployment zones.`);
    return;
  }

  const deploymentProfile = isValidMission(missionKey) ? getMissionDeploymentProfile(missionKey) : null;
  const planningScenario: DeploymentZonePlanningScenario | null = size && tilePalette && tiles
    ? {
      size,
      tilePalette: tilePalette as TilePalette,
      tiles: tiles as TileInstance[][]
    }
    : null;

  const zoneKeys = new Set<string>();
  const claimedHexKeys = new Set<string>();
  let playerCapacityTotal = 0;
  let maxPlayerFrontage = 0;
  let maxPlayerDepth = 0;
  let playerZoneCount = 0;

  zonesValue.forEach((zone, index) => {
    const zoneRecord = asRecord(zone);
    const zoneKey = readString(zoneRecord?.key);
    const zoneLabel = readString(zoneRecord?.label);
    const zoneFaction = readString(zoneRecord?.faction);
    const capacity = readInteger(zoneRecord?.capacity);
    const hexes = zoneRecord?.hexes;

    if (!zoneKey) {
      issues.push(`Deployment zone ${index} in scenario ${scenarioName ?? missionKey} is missing a non-empty key.`);
      return;
    }
    if (zoneKeys.has(zoneKey)) {
      issues.push(`Deployment zone key ${zoneKey} is duplicated in scenario ${scenarioName ?? missionKey}.`);
    }
    zoneKeys.add(zoneKey);

    if (!zoneLabel) {
      issues.push(`Deployment zone ${zoneKey} in scenario ${scenarioName ?? missionKey} is missing a non-empty label.`);
    }
    if (capacity === null || capacity <= 0) {
      issues.push(`Deployment zone ${zoneKey} in scenario ${scenarioName ?? missionKey} must declare a positive integer capacity.`);
    }
    if (!Array.isArray(hexes) || hexes.length === 0) {
      issues.push(`Deployment zone ${zoneKey} in scenario ${scenarioName ?? missionKey} must declare at least one hex.`);
      return;
    }

    const zoneHexKeys = new Set<string>();
    const zoneCols = new Set<number>();
    const zoneRows = new Set<number>();
    let usableHexCount = 0;

    hexes.forEach((hex, hexIndex) => {
      if (!Array.isArray(hex) || hex.length < 2) {
        issues.push(`Deployment zone ${zoneKey} hex ${hexIndex} in scenario ${scenarioName ?? missionKey} must be [col, row].`);
        return;
      }
      const col = readInteger(hex[0]);
      const row = readInteger(hex[1]);
      if (col === null || row === null) {
        issues.push(`Deployment zone ${zoneKey} hex ${hexIndex} in scenario ${scenarioName ?? missionKey} uses a non-integer coordinate.`);
        return;
      }
      if (size && !isWithinBounds(col, row, size)) {
        issues.push(`Deployment zone ${zoneKey} uses out-of-bounds hex ${col},${row} on a ${size.cols}x${size.rows} map.`);
        return;
      }

      const hexKey = `${col},${row}`;
      if (zoneHexKeys.has(hexKey)) {
        issues.push(`Deployment zone ${zoneKey} duplicates hex ${hexKey} in scenario ${scenarioName ?? missionKey}.`);
      }
      zoneHexKeys.add(hexKey);
      zoneCols.add(col);
      zoneRows.add(row);

      if (claimedHexKeys.has(hexKey)) {
        issues.push(`Deployment zones in scenario ${scenarioName ?? missionKey} overlap on hex ${hexKey}.`);
      }
      claimedHexKeys.add(hexKey);

      const terrainType = resolveTerrainTypeAt(col, row, tiles, tilePalette);
      if (!terrainType) {
        issues.push(`Deployment zone ${zoneKey} references hex ${hexKey} without resolvable terrain metadata.`);
        return;
      }
      if (terrainType === "water" || terrainType === "coastal") {
        issues.push(`Deployment zone ${zoneKey} includes unusable ${terrainType} terrain at ${hexKey}.`);
        return;
      }
      usableHexCount += 1;
    });

    if (capacity !== null && usableHexCount < capacity) {
      issues.push(
        `Deployment zone ${zoneKey} in scenario ${scenarioName ?? missionKey} declares capacity ${capacity} but only ${usableHexCount} usable hexes.`
      );
    }

    if (zoneFaction === "Player") {
      playerZoneCount += 1;
      if (planningScenario && zoneLabel && capacity !== null && (zoneFaction === "Player" || zoneFaction === "Bot" || zoneFaction === "Ally")) {
        try {
          const finalizedZone = finalizeDeploymentZone({
            key: zoneKey,
            label: zoneLabel,
            description: readString(zoneRecord?.description) ?? "",
            capacity,
            faction: zoneFaction as ScenarioDeploymentZone["faction"],
            hexes: (hexes as unknown[]).map((hex) => [readInteger((hex as unknown[])[0]) ?? -1, readInteger((hex as unknown[])[1]) ?? -1] as [number, number])
          }, planningScenario, isValidMission(missionKey) ? missionKey : undefined);
          const metrics = measureDeploymentZoneGeometry(finalizedZone.hexKeys);
          playerCapacityTotal += finalizedZone.capacity;
          maxPlayerFrontage = Math.max(maxPlayerFrontage, metrics.frontage);
          maxPlayerDepth = Math.max(maxPlayerDepth, metrics.depth);

          const zoneDoctrine = deploymentProfile?.zoneDoctrine.find((zone) => zone.zoneKey === zoneKey) ?? null;
          if (zoneDoctrine && finalizedZone.capacity < zoneDoctrine.minimumCapacity) {
            issues.push(
              `Deployment zone ${zoneKey} in scenario ${scenarioName ?? missionKey} exposes capacity ${finalizedZone.capacity}; require at least ${zoneDoctrine.minimumCapacity}.`
            );
          }
          if (zoneDoctrine && metrics.frontage < zoneDoctrine.minimumFrontage) {
            issues.push(
              `Deployment zone ${zoneKey} in scenario ${scenarioName ?? missionKey} exposes frontage ${metrics.frontage}; require at least ${zoneDoctrine.minimumFrontage}.`
            );
          }
          if (zoneDoctrine && metrics.depth < zoneDoctrine.minimumDepth) {
            issues.push(
              `Deployment zone ${zoneKey} in scenario ${scenarioName ?? missionKey} exposes depth ${metrics.depth}; require at least ${zoneDoctrine.minimumDepth}.`
            );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown deployment finalization error.";
          issues.push(`Deployment zone ${zoneKey} in scenario ${scenarioName ?? missionKey} could not be finalized: ${message}`);
        }
      } else {
        if (capacity !== null) {
          playerCapacityTotal += capacity;
        }
        maxPlayerFrontage = Math.max(maxPlayerFrontage, zoneCols.size);
        maxPlayerDepth = Math.max(maxPlayerDepth, zoneRows.size);
      }
    }
  });

  if (!deploymentProfile) {
    return;
  }

  if (playerZoneCount === 0) {
    issues.push(`Scenario ${scenarioName ?? missionKey} must define at least one player deployment zone.`);
    return;
  }
  if (playerCapacityTotal < deploymentProfile.validation.minimumPlayerZoneCapacityTotal) {
    issues.push(
      `Scenario ${scenarioName ?? missionKey} exposes player deployment capacity ${playerCapacityTotal}; require at least ${deploymentProfile.validation.minimumPlayerZoneCapacityTotal}.`
    );
  }
  if (maxPlayerFrontage < deploymentProfile.validation.minimumPlayerZoneFrontage) {
    issues.push(
      `Scenario ${scenarioName ?? missionKey} exposes player deployment frontage ${maxPlayerFrontage}; require at least ${deploymentProfile.validation.minimumPlayerZoneFrontage}.`
    );
  }
  if (maxPlayerDepth < deploymentProfile.validation.minimumPlayerZoneDepth) {
    issues.push(
      `Scenario ${scenarioName ?? missionKey} exposes player deployment depth ${maxPlayerDepth}; require at least ${deploymentProfile.validation.minimumPlayerZoneDepth}.`
    );
  }
}

function validateSides(
  record: RawScenarioSource | null,
  issues: string[],
  missionKey: string,
  scenarioName: string | null,
  size: RawScenarioSize | null
): void {
  const sidesRecord = asRecord(record?.sides);
  if (!sidesRecord) {
    issues.push(`Scenario ${scenarioName ?? missionKey} must declare a sides object with Player and Bot entries.`);
    return;
  }

  for (const faction of ["Player", "Bot"] as const) {
    const side = asRecord(sidesRecord[faction]);
    if (!side) {
      issues.push(`Scenario ${scenarioName ?? missionKey} must declare a ${faction} side.`);
      continue;
    }
    const hq = side["hq"];
    if (!Array.isArray(hq) || hq.length < 2) {
      issues.push(`Scenario ${scenarioName ?? missionKey} ${faction} side must declare an hq as a [col, row] array.`);
      continue;
    }
    const col = readInteger(hq[0]);
    const row = readInteger(hq[1]);
    if (col === null || row === null) {
      issues.push(`Scenario ${scenarioName ?? missionKey} ${faction} hq must use integer coordinates.`);
      continue;
    }
    if (size && !isWithinBounds(col, row, size)) {
      issues.push(`Scenario ${scenarioName ?? missionKey} ${faction} hq [${col},${row}] lies outside the ${size.cols}x${size.rows} map bounds.`);
    }
  }
}

function validateRangeEnvelope(
  record: RawScenarioSource | null,
  issues: string[],
  missionKey: string,
  scenarioName: string | null,
  size: RawScenarioSize | null,
  profile: RawScenarioProfile | null
): void {
  if (!size || !profile) {
    return;
  }

  const sidesRecord = asRecord(record?.sides);
  if (!sidesRecord) {
    issues.push(`Scenario ${scenarioName ?? missionKey} must declare sides metadata.`);
    return;
  }

  // Only validate minimum map dimensions, not range envelope
  // Artillery can sit at the back and fire - countered by air units and off-map support
  if (size.cols < profile.minCols) {
    issues.push(
      `Scenario ${scenarioName ?? missionKey} width ${size.cols} is below the profile minimum ${profile.minCols}.`
    );
  }
  if (size.rows < profile.minRows) {
    issues.push(
      `Scenario ${scenarioName ?? missionKey} depth ${size.rows} is below the profile minimum ${profile.minRows}.`
    );
  }
}

function readScenarioSize(
  record: RawScenarioSource | null,
  issues: string[],
  missionKey: string,
  scenarioName: string | null
): RawScenarioSize | null {
  const sizeRecord = asRecord(record?.size);
  if (!sizeRecord) {
    issues.push(`Scenario ${scenarioName ?? missionKey} must declare size metadata.`);
    return null;
  }
  const cols = readInteger(sizeRecord.cols);
  const rows = readInteger(sizeRecord.rows);
  if (cols === null || cols <= 0 || rows === null || rows <= 0) {
    issues.push(`Scenario ${scenarioName ?? missionKey} must declare positive integer cols and rows.`);
    return null;
  }
  if (cols * rows > MAX_HEX_COUNT) {
    issues.push(
      `Scenario ${scenarioName ?? missionKey} bounding rectangle ${cols}×${rows} = ${cols * rows} hexes exceeds the maximum of ${MAX_HEX_COUNT}. Reduce cols or rows to stay within the performance limit.`
    );
  }
  return { cols, rows };
}

function readTilePalette(
  record: RawScenarioSource | null,
  issues: string[],
  missionKey: string,
  scenarioName: string | null
): Record<string, unknown> | null {
  const palette = asRecord(record?.tilePalette);
  if (!palette) {
    issues.push(`Scenario ${scenarioName ?? missionKey} must declare a tile palette.`);
    return null;
  }
  return palette;
}

function readTileRows(
  record: RawScenarioSource | null,
  issues: string[],
  missionKey: string,
  scenarioName: string | null,
  size: RawScenarioSize | null
): unknown[][] | null {
  const tilesValue = record?.tiles;
  if (!Array.isArray(tilesValue)) {
    issues.push(`Scenario ${scenarioName ?? missionKey} must declare a tiles matrix.`);
    return null;
  }

  const rows = tilesValue as unknown[];
  if (size && rows.length !== size.rows) {
    issues.push(`Scenario ${scenarioName ?? missionKey} declares ${size.rows} rows but provides ${rows.length} tile rows.`);
  }

  const normalizedRows: unknown[][] = [];
  rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) {
      issues.push(`Tile row ${rowIndex} in scenario ${scenarioName ?? missionKey} is not an array.`);
      return;
    }
    if (size && row.length !== size.cols) {
      issues.push(
        `Tile row ${rowIndex} in scenario ${scenarioName ?? missionKey} declares ${row.length} columns; expected ${size.cols}.`
      );
    }
    normalizedRows.push(row);
  });

  return normalizedRows;
}

function validateTileCoverage(
  issues: string[],
  missionKey: string,
  scenarioName: string | null,
  size: RawScenarioSize | null,
  tilePalette: Record<string, unknown> | null,
  tiles: unknown[][] | null
): void {
  if (!size || !tilePalette || !tiles) {
    return;
  }

  const scenarioLabel = scenarioName ?? missionKey;
  for (let row = 0; row < size.rows; row += 1) {
    const rowEntries = tiles[row];
    if (!rowEntries) {
      continue;
    }

    for (let col = 0; col < size.cols; col += 1) {
      if (!Object.prototype.hasOwnProperty.call(rowEntries, col)) {
        issues.push(`Scenario ${scenarioLabel} is missing tile [${row}][${col}].`);
        continue;
      }

      const entry = rowEntries[col];
      if (typeof entry === "string") {
        if (!asRecord(tilePalette[entry])) {
          issues.push(`Scenario ${scenarioLabel} tile [${row}][${col}] references unknown palette key "${entry}".`);
        }
        continue;
      }

      const entryRecord = asRecord(entry);
      if (!entryRecord) {
        issues.push(`Scenario ${scenarioLabel} tile [${row}][${col}] is empty or malformed.`);
        continue;
      }

      const tileKey = readString(entryRecord["tile"]);
      if (tileKey) {
        if (!asRecord(tilePalette[tileKey])) {
          issues.push(`Scenario ${scenarioLabel} tile [${row}][${col}] references unknown palette key "${tileKey}".`);
        }
        continue;
      }

      if (!readString(entryRecord["terrain"]) || !readString(entryRecord["terrainType"])) {
        issues.push(
          `Scenario ${scenarioLabel} tile [${row}][${col}] must reference a palette key or declare terrain and terrainType.`
        );
      }
    }
  }
}

function resolveTerrainTypeAt(
  col: number,
  row: number,
  tiles: unknown[][] | null,
  tilePalette: Record<string, unknown> | null
): string | null {
  if (!tiles || !tilePalette) {
    return null;
  }
  const rowEntries = tiles[row];
  const entry = rowEntries?.[col];
  if (typeof entry === "string") {
    const paletteEntry = asRecord(tilePalette[entry]);
    return readString(paletteEntry?.terrainType);
  }
  const entryRecord = asRecord(entry);
  const tileKey = readString(entryRecord?.tile);
  if (tileKey) {
    const paletteEntry = asRecord(tilePalette[tileKey]);
    return readString(paletteEntry?.terrainType);
  }
  return readString(entryRecord?.terrainType);
}

function isWithinBounds(col: number, row: number, size: RawScenarioSize): boolean {
  return col >= 0 && row >= 0 && col < size.cols && row < size.rows;
}

function offsetToAxial(col: number, row: number): Axial {
  return { q: col, r: row - Math.floor(col / 2) };
}

function readInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
