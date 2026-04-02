import manifestData from "./manifest.json";
import readmeFieldsData from "./readmeFields.table.json";
import weaponsData from "./weapons.table.json";
import ammoData from "./ammo.table.json";
import accuracyCurveBandsData from "./accuracyCurveBands.table.json";
import dataDictionaryData from "./dataDictionary.table.json";
import sourcesLogData from "./sourcesLog.table.json";
import platformsData from "./platforms.table.json";
import platformArmorData from "./platformArmor.table.json";
import platformMobilityData from "./platformMobility.table.json";
import platformSensorsData from "./platformSensors.table.json";
import weaponMountsData from "./weaponMounts.table.json";
import platformLoadoutsData from "./platformLoadouts.table.json";

export interface CanonSheetSummary {
  readonly sheet_name: string;
  readonly table_key: string;
  readonly row_count: number;
  readonly column_count: number;
  readonly worksheet_path: string;
}

export interface CanonSourceWorkbook {
  readonly relative_path: string;
  readonly file_name: string;
  readonly sha256: string;
  readonly workbook_title: string | null;
}

export interface CanonIntegrityReport {
  readonly duplicate_weapon_ids: readonly string[];
  readonly duplicate_ammo_ids: readonly string[];
  readonly duplicate_accuracy_band_keys: readonly string[];
  readonly duplicate_data_dictionary_keys: readonly string[];
  readonly duplicate_source_ids: readonly string[];
  readonly duplicate_platform_ids: readonly string[];
  readonly duplicate_armor_ids: readonly string[];
  readonly duplicate_mobility_ids: readonly string[];
  readonly duplicate_sensor_ids: readonly string[];
  readonly duplicate_mount_ids: readonly string[];
  readonly duplicate_loadout_ids: readonly string[];
  readonly missing_accuracy_profiles: readonly string[];
  readonly missing_ammo_families: readonly string[];
  readonly missing_source_references: readonly string[];
  readonly missing_platform_references: readonly string[];
  readonly missing_weapon_references: readonly string[];
  readonly missing_ammo_references: readonly string[];
  readonly platforms_missing_armor: readonly string[];
  readonly platforms_missing_mobility: readonly string[];
  readonly platforms_missing_sensors: readonly string[];
  readonly platforms_missing_mounts: readonly string[];
  readonly platforms_missing_loadouts: readonly string[];
  readonly weapon_category_counts: Readonly<Record<string, number>>;
  readonly weapon_platform_counts: Readonly<Record<string, number>>;
  readonly ammo_type_counts: Readonly<Record<string, number>>;
  readonly accuracy_profile_band_counts: Readonly<Record<string, number>>;
  readonly platform_class_counts: Readonly<Record<string, number>>;
  readonly platform_nation_counts: Readonly<Record<string, number>>;
  readonly mobility_type_counts: Readonly<Record<string, number>>;
  readonly mount_type_counts: Readonly<Record<string, number>>;
  readonly source_type_counts: Readonly<Record<string, number>>;
}

export interface CanonManifest {
  readonly schema_version: number;
  readonly source_workbook: CanonSourceWorkbook;
  readonly sheet_summaries: readonly CanonSheetSummary[];
  readonly table_counts: Readonly<Record<string, number>>;
  readonly integrity: CanonIntegrityReport;
}

export interface CanonReadmeField {
  readonly Field: string;
  readonly Meaning: string;
}

export interface CanonWeaponRecord {
  readonly weapon_id: string;
  readonly weapon_name: string;
  readonly era: string;
  readonly nation_or_family: string;
  readonly category: string;
  readonly subcategory: string;
  readonly platform: string;
  readonly caliber_mm: number | null;
  readonly ammo_group: string | null;
  readonly crew: number | null;
  readonly min_range_m: number | null;
  readonly effective_range_m: number | null;
  readonly max_direct_range_m: number | null;
  readonly max_ballistic_range_m: number | null;
  readonly rate_of_fire_rpm: number | null;
  readonly mount: string | null;
  readonly accuracy_profile_id: string | null;
  readonly source_url: string | null;
  readonly notes: string | null;
}

export interface CanonAmmoRecord {
  readonly ammo_id: string;
  readonly ammo_family: string;
  readonly caliber_mm: number | null;
  readonly ammo_name: string;
  readonly ammo_type: string;
  readonly typical_weapons: string | null;
  readonly anti_armor_role: string | null;
  readonly anti_personnel_role: string | null;
  readonly smoke_role: string | null;
  readonly indirect_capable: boolean;
  readonly source_url: string | null;
  readonly notes: string | null;
}

export interface CanonAccuracyCurveBandRecord {
  readonly profile_id: string;
  readonly platform_class: string;
  readonly band_min_m: number;
  readonly band_max_m: number;
  readonly base_hit_probability: number;
  readonly shooter_moving_mult: number;
  readonly target_moving_mult: number;
  readonly obscured_mult: number;
  readonly notes: string | null;
  readonly source_url: string | null;
}

export interface CanonDataDictionaryRecord {
  readonly Sheet: string;
  readonly Column: string;
  readonly Description: string;
}

export interface CanonSourceLogRecord {
  readonly source_id: string;
  readonly source_title: string;
  readonly source_url: string;
  readonly source_type: string;
  readonly publisher_or_author: string | null;
  readonly publication_date_if_known: string | null;
  readonly accessed_date: string | null;
  readonly credibility_tier: string;
  readonly citation_short: string;
  readonly notes: string | null;
}

export interface CanonPlatformRecord {
  readonly platform_id: string;
  readonly platform_name: string;
  readonly platform_class: string;
  readonly nation: string;
  readonly service_branch: string;
  readonly era: string;
  readonly service_start_date: string | null;
  readonly service_end_date: string | null;
  readonly crew_count: number | null;
  readonly open_top_flag: boolean;
  readonly shielded_flag: boolean;
  readonly silhouette_class: string | null;
  readonly signature_class: string | null;
  readonly weight_tons_or_class: number | string | null;
  readonly notes: string | null;
  readonly source_id_primary: string | null;
  readonly confidence_level: string | null;
  readonly last_reviewed_date: string | null;
}

export interface CanonPlatformArmorRecord {
  readonly armor_id: string;
  readonly platform_id: string;
  readonly zone_key: string;
  readonly facing: string;
  readonly thickness_mm: number | null;
  readonly slope_if_known: string | null;
  readonly construction_type: string | null;
  readonly spaced_flag: boolean;
  readonly shield_only_flag: boolean;
  readonly crew_exposure_notes: string | null;
  readonly notes: string | null;
  readonly source_id_primary: string | null;
  readonly confidence_level: string | null;
  readonly last_reviewed_date: string | null;
}

export interface CanonPlatformMobilityRecord {
  readonly mobility_id: string;
  readonly platform_id: string;
  readonly move_type: string;
  readonly road_speed_kph: number | null;
  readonly offroad_speed_kph: number | null;
  readonly reverse_speed_kph_if_known: number | null;
  readonly operational_range_km: number | null;
  readonly fuel_type: string | null;
  readonly fuel_capacity_l_if_known: number | null;
  readonly towing_capable_flag: boolean;
  readonly towed_by_default_flag: boolean;
  readonly amphibious_flag: boolean;
  readonly bridge_class_or_weight_limit: string | null;
  readonly traction_notes: string | null;
  readonly notes: string | null;
  readonly source_id_primary: string | null;
  readonly confidence_level: string | null;
  readonly last_reviewed_date: string | null;
}

export interface CanonPlatformSensorsRecord {
  readonly sensors_id: string;
  readonly platform_id: string;
  readonly vision_class: string;
  readonly recon_quality: string;
  readonly radio_quality: string;
  readonly fire_control_quality: string;
  readonly rangefinding_quality: string;
  readonly air_ground_spotting_flag: boolean;
  readonly night_capability_notes: string | null;
  readonly commander_overwatch_notes: string | null;
  readonly notes: string | null;
  readonly source_id_primary: string | null;
  readonly confidence_level: string | null;
  readonly last_reviewed_date: string | null;
}

export interface CanonWeaponMountRecord {
  readonly mount_id: string;
  readonly platform_id: string;
  readonly weapon_id: string;
  readonly mount_position: string;
  readonly mount_type: string;
  readonly turret_flag: boolean;
  readonly coax_flag: boolean;
  readonly hull_flag: boolean;
  readonly pintle_flag: boolean;
  readonly traverse_arc_deg: number | null;
  readonly elevation_min_deg: number | null;
  readonly elevation_max_deg: number | null;
  readonly stabilization_class: string | null;
  readonly reload_access_notes: string | null;
  readonly notes: string | null;
  readonly source_id_primary: string | null;
  readonly confidence_level: string | null;
  readonly last_reviewed_date: string | null;
}

export interface CanonPlatformLoadoutRecord {
  readonly loadout_id: string;
  readonly platform_id: string;
  readonly weapon_id: string;
  readonly ammo_id: string;
  readonly carried_quantity: number | null;
  readonly default_mix_priority: number | null;
  readonly optional_mix_flag: boolean;
  readonly smoke_qty: number | null;
  readonly illumination_qty: number | null;
  readonly special_round_qty: number | null;
  readonly ready_rack_qty_if_known: number | null;
  readonly reload_notes: string | null;
  readonly notes: string | null;
  readonly source_id_primary: string | null;
  readonly confidence_level: string | null;
  readonly last_reviewed_date: string | null;
}

export interface CanonTables {
  readonly readmeFields: readonly CanonReadmeField[];
  readonly weapons: readonly CanonWeaponRecord[];
  readonly ammo: readonly CanonAmmoRecord[];
  readonly accuracyCurveBands: readonly CanonAccuracyCurveBandRecord[];
  readonly dataDictionary: readonly CanonDataDictionaryRecord[];
  readonly sourcesLog: readonly CanonSourceLogRecord[];
  readonly platforms: readonly CanonPlatformRecord[];
  readonly platformArmor: readonly CanonPlatformArmorRecord[];
  readonly platformMobility: readonly CanonPlatformMobilityRecord[];
  readonly platformSensors: readonly CanonPlatformSensorsRecord[];
  readonly weaponMounts: readonly CanonWeaponMountRecord[];
  readonly platformLoadouts: readonly CanonPlatformLoadoutRecord[];
}

export interface CanonDataset extends CanonTables {
  readonly manifest: CanonManifest;
}

const manifest = Object.freeze(manifestData as CanonManifest);
const readmeFields = Object.freeze(readmeFieldsData as CanonReadmeField[]);
const weapons = Object.freeze(weaponsData as CanonWeaponRecord[]);
const ammo = Object.freeze(ammoData as CanonAmmoRecord[]);
const accuracyCurveBands = Object.freeze(accuracyCurveBandsData as CanonAccuracyCurveBandRecord[]);
const dataDictionary = Object.freeze(dataDictionaryData as CanonDataDictionaryRecord[]);
const sourcesLog = Object.freeze(sourcesLogData as CanonSourceLogRecord[]);
const platforms = Object.freeze(platformsData as CanonPlatformRecord[]);
const platformArmor = Object.freeze(platformArmorData as CanonPlatformArmorRecord[]);
const platformMobility = Object.freeze(platformMobilityData as CanonPlatformMobilityRecord[]);
const platformSensors = Object.freeze(platformSensorsData as CanonPlatformSensorsRecord[]);
const weaponMounts = Object.freeze(weaponMountsData as CanonWeaponMountRecord[]);
const platformLoadouts = Object.freeze(platformLoadoutsData as CanonPlatformLoadoutRecord[]);

export const canonManifest = manifest;
export const canonTables = Object.freeze({
  readmeFields,
  weapons,
  ammo,
  accuracyCurveBands,
  dataDictionary,
  sourcesLog,
  platforms,
  platformArmor,
  platformMobility,
  platformSensors,
  weaponMounts,
  platformLoadouts,
}) as CanonTables;

export const canon = Object.freeze({
  manifest,
  ...canonTables,
}) as CanonDataset;

function countBy<T>(items: readonly T[], selector: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  items.forEach((item) => {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
  });
  return counts;
}

function groupBy<T>(items: readonly T[], selector: (item: T) => string): ReadonlyMap<string, readonly T[]> {
  const buckets = new Map<string, T[]>();
  items.forEach((item) => {
    const key = selector(item);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      buckets.set(key, [item]);
    }
  });
  return new Map(
    Array.from(buckets.entries(), ([key, bucket]) => [key, Object.freeze(bucket.slice()) as readonly T[]])
  );
}

function mapBy<T>(items: readonly T[], selector: (item: T) => string): ReadonlyMap<string, T> {
  return new Map(items.map((item) => [selector(item), item] as const));
}

function findDuplicates(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  values.forEach((value) => {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  });
  return Object.freeze(Array.from(duplicates).sort());
}

function compareStringArrays(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function compareCountRecords(actual: Readonly<Record<string, number>>, expected: Readonly<Record<string, number>>): boolean {
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (!compareStringArrays(actualKeys, expectedKeys)) {
    return false;
  }
  return actualKeys.every((key) => actual[key] === expected[key]);
}

function describeMissingReferences<T extends object>(
  rows: readonly T[],
  options: {
    readonly tableLabel: string;
    readonly idField: keyof T;
    readonly referenceField: keyof T;
    readonly validKeys: ReadonlySet<string>;
  }
): readonly string[] {
  const issues: string[] = [];
  rows.forEach((row) => {
    const rowData = row as Record<string, unknown>;
    const reference = rowData[options.referenceField as string];
    if (typeof reference !== "string" || reference.length === 0 || options.validKeys.has(reference)) {
      return;
    }
    const rowId = rowData[options.idField as string];
    issues.push(
      `${options.tableLabel}:${typeof rowId === "string" && rowId.length > 0 ? rowId : "<unknown>"}:${String(options.referenceField)}=${reference}`
    );
  });
  return Object.freeze(issues.sort());
}

function findParentsWithoutChildren<
  ParentRow extends object,
  ChildRow extends object,
>(
  parentRows: readonly ParentRow[],
  options: {
    readonly parentIdField: keyof ParentRow;
    readonly childRows: readonly ChildRow[];
    readonly childForeignKeyField: keyof ChildRow;
  }
): readonly string[] {
  const coveredIds = new Set<string>();
  options.childRows.forEach((row) => {
    const value = (row as Record<string, unknown>)[options.childForeignKeyField as string];
    if (typeof value === "string" && value.length > 0) {
      coveredIds.add(value);
    }
  });

  const uncovered: string[] = [];
  parentRows.forEach((row) => {
    const value = (row as Record<string, unknown>)[options.parentIdField as string];
    if (typeof value === "string" && value.length > 0 && !coveredIds.has(value)) {
      uncovered.push(value);
    }
  });
  uncovered.sort();
  return Object.freeze(uncovered);
}

export function calculateCanonIntegrity(dataset: CanonTables = canonTables): CanonIntegrityReport {
  const accuracyProfiles = new Set(dataset.accuracyCurveBands.map((band) => band.profile_id));
  const ammoFamilies = new Set(dataset.ammo.map((entry) => entry.ammo_family));
  const sourceIds = new Set(dataset.sourcesLog.map((entry) => entry.source_id));
  const platformIds = new Set(dataset.platforms.map((entry) => entry.platform_id));
  const weaponIds = new Set(dataset.weapons.map((entry) => entry.weapon_id));
  const ammoIds = new Set(dataset.ammo.map((entry) => entry.ammo_id));

  const missingAccuracyProfiles = dataset.weapons
    .map((weapon) => weapon.accuracy_profile_id)
    .filter((profileId): profileId is string => typeof profileId === "string" && profileId.length > 0)
    .filter((profileId) => !accuracyProfiles.has(profileId));

  const missingAmmoFamilies = dataset.weapons
    .map((weapon) => weapon.ammo_group)
    .filter((ammoGroup): ammoGroup is string => typeof ammoGroup === "string" && ammoGroup.length > 0)
    .filter((ammoGroup) => !ammoFamilies.has(ammoGroup));

  const missingSourceReferences = [
    ...describeMissingReferences(dataset.platforms, {
      tableLabel: "Platforms",
      idField: "platform_id",
      referenceField: "source_id_primary",
      validKeys: sourceIds,
    }),
    ...describeMissingReferences(dataset.platformArmor, {
      tableLabel: "Platform_Armor",
      idField: "armor_id",
      referenceField: "source_id_primary",
      validKeys: sourceIds,
    }),
    ...describeMissingReferences(dataset.platformMobility, {
      tableLabel: "Platform_Mobility",
      idField: "mobility_id",
      referenceField: "source_id_primary",
      validKeys: sourceIds,
    }),
    ...describeMissingReferences(dataset.platformSensors, {
      tableLabel: "Platform_Sensors",
      idField: "sensors_id",
      referenceField: "source_id_primary",
      validKeys: sourceIds,
    }),
    ...describeMissingReferences(dataset.weaponMounts, {
      tableLabel: "Weapon_Mounts",
      idField: "mount_id",
      referenceField: "source_id_primary",
      validKeys: sourceIds,
    }),
    ...describeMissingReferences(dataset.platformLoadouts, {
      tableLabel: "Platform_Loadouts",
      idField: "loadout_id",
      referenceField: "source_id_primary",
      validKeys: sourceIds,
    }),
  ].sort();

  const missingPlatformReferences = [
    ...describeMissingReferences(dataset.platformArmor, {
      tableLabel: "Platform_Armor",
      idField: "armor_id",
      referenceField: "platform_id",
      validKeys: platformIds,
    }),
    ...describeMissingReferences(dataset.platformMobility, {
      tableLabel: "Platform_Mobility",
      idField: "mobility_id",
      referenceField: "platform_id",
      validKeys: platformIds,
    }),
    ...describeMissingReferences(dataset.platformSensors, {
      tableLabel: "Platform_Sensors",
      idField: "sensors_id",
      referenceField: "platform_id",
      validKeys: platformIds,
    }),
    ...describeMissingReferences(dataset.weaponMounts, {
      tableLabel: "Weapon_Mounts",
      idField: "mount_id",
      referenceField: "platform_id",
      validKeys: platformIds,
    }),
    ...describeMissingReferences(dataset.platformLoadouts, {
      tableLabel: "Platform_Loadouts",
      idField: "loadout_id",
      referenceField: "platform_id",
      validKeys: platformIds,
    }),
  ].sort();

  const missingWeaponReferences = [
    ...describeMissingReferences(dataset.weaponMounts, {
      tableLabel: "Weapon_Mounts",
      idField: "mount_id",
      referenceField: "weapon_id",
      validKeys: weaponIds,
    }),
    ...describeMissingReferences(dataset.platformLoadouts, {
      tableLabel: "Platform_Loadouts",
      idField: "loadout_id",
      referenceField: "weapon_id",
      validKeys: weaponIds,
    }),
  ].sort();

  const missingAmmoReferences = describeMissingReferences(dataset.platformLoadouts, {
    tableLabel: "Platform_Loadouts",
    idField: "loadout_id",
    referenceField: "ammo_id",
    validKeys: ammoIds,
  });

  return Object.freeze({
    duplicate_weapon_ids: findDuplicates(dataset.weapons.map((weapon) => weapon.weapon_id)),
    duplicate_ammo_ids: findDuplicates(dataset.ammo.map((entry) => entry.ammo_id)),
    duplicate_accuracy_band_keys: findDuplicates(
      dataset.accuracyCurveBands.map((band) => `${band.profile_id}:${band.band_min_m}:${band.band_max_m}`)
    ),
    duplicate_data_dictionary_keys: findDuplicates(
      dataset.dataDictionary.map((entry) => `${entry.Sheet}:${entry.Column}`)
    ),
    duplicate_source_ids: findDuplicates(dataset.sourcesLog.map((entry) => entry.source_id)),
    duplicate_platform_ids: findDuplicates(dataset.platforms.map((entry) => entry.platform_id)),
    duplicate_armor_ids: findDuplicates(dataset.platformArmor.map((entry) => entry.armor_id)),
    duplicate_mobility_ids: findDuplicates(dataset.platformMobility.map((entry) => entry.mobility_id)),
    duplicate_sensor_ids: findDuplicates(dataset.platformSensors.map((entry) => entry.sensors_id)),
    duplicate_mount_ids: findDuplicates(dataset.weaponMounts.map((entry) => entry.mount_id)),
    duplicate_loadout_ids: findDuplicates(dataset.platformLoadouts.map((entry) => entry.loadout_id)),
    missing_accuracy_profiles: Object.freeze(Array.from(new Set(missingAccuracyProfiles)).sort()),
    missing_ammo_families: Object.freeze(Array.from(new Set(missingAmmoFamilies)).sort()),
    missing_source_references: Object.freeze(missingSourceReferences),
    missing_platform_references: Object.freeze(missingPlatformReferences),
    missing_weapon_references: Object.freeze(missingWeaponReferences),
    missing_ammo_references: missingAmmoReferences,
    platforms_missing_armor: findParentsWithoutChildren(dataset.platforms, {
      parentIdField: "platform_id",
      childRows: dataset.platformArmor,
      childForeignKeyField: "platform_id",
    }),
    platforms_missing_mobility: findParentsWithoutChildren(dataset.platforms, {
      parentIdField: "platform_id",
      childRows: dataset.platformMobility,
      childForeignKeyField: "platform_id",
    }),
    platforms_missing_sensors: findParentsWithoutChildren(dataset.platforms, {
      parentIdField: "platform_id",
      childRows: dataset.platformSensors,
      childForeignKeyField: "platform_id",
    }),
    platforms_missing_mounts: findParentsWithoutChildren(dataset.platforms, {
      parentIdField: "platform_id",
      childRows: dataset.weaponMounts,
      childForeignKeyField: "platform_id",
    }),
    platforms_missing_loadouts: findParentsWithoutChildren(dataset.platforms, {
      parentIdField: "platform_id",
      childRows: dataset.platformLoadouts,
      childForeignKeyField: "platform_id",
    }),
    weapon_category_counts: Object.freeze(countBy(dataset.weapons, (weapon) => weapon.category)),
    weapon_platform_counts: Object.freeze(countBy(dataset.weapons, (weapon) => weapon.platform)),
    ammo_type_counts: Object.freeze(countBy(dataset.ammo, (entry) => entry.ammo_type)),
    accuracy_profile_band_counts: Object.freeze(
      countBy(dataset.accuracyCurveBands, (band) => band.profile_id)
    ),
    platform_class_counts: Object.freeze(countBy(dataset.platforms, (platform) => platform.platform_class)),
    platform_nation_counts: Object.freeze(countBy(dataset.platforms, (platform) => platform.nation)),
    mobility_type_counts: Object.freeze(
      countBy(dataset.platformMobility, (mobility) => mobility.move_type)
    ),
    mount_type_counts: Object.freeze(countBy(dataset.weaponMounts, (mount) => mount.mount_type)),
    source_type_counts: Object.freeze(countBy(dataset.sourcesLog, (source) => source.source_type)),
  });
}

export function validateCanonManifest(dataset: CanonDataset = canon): readonly string[] {
  const issues: string[] = [];
  const derivedIntegrity = calculateCanonIntegrity(dataset);
  const declaredIntegrity = dataset.manifest.integrity;

  const tableCountChecks: Array<[keyof CanonTables, number]> = [
    ["readmeFields", dataset.readmeFields.length],
    ["weapons", dataset.weapons.length],
    ["ammo", dataset.ammo.length],
    ["accuracyCurveBands", dataset.accuracyCurveBands.length],
    ["dataDictionary", dataset.dataDictionary.length],
    ["sourcesLog", dataset.sourcesLog.length],
    ["platforms", dataset.platforms.length],
    ["platformArmor", dataset.platformArmor.length],
    ["platformMobility", dataset.platformMobility.length],
    ["platformSensors", dataset.platformSensors.length],
    ["weaponMounts", dataset.weaponMounts.length],
    ["platformLoadouts", dataset.platformLoadouts.length],
  ];
  tableCountChecks.forEach(([tableKey, actualCount]) => {
    const declaredCount = dataset.manifest.table_counts[tableKey];
    if (declaredCount !== actualCount) {
      issues.push(`Manifest table count mismatch for ${tableKey}: declared ${declaredCount}, actual ${actualCount}.`);
    }
  });

  const arrayChecks: Array<[string, readonly string[], readonly string[]]> = [
    ["duplicate_weapon_ids", derivedIntegrity.duplicate_weapon_ids, declaredIntegrity.duplicate_weapon_ids],
    ["duplicate_ammo_ids", derivedIntegrity.duplicate_ammo_ids, declaredIntegrity.duplicate_ammo_ids],
    ["duplicate_accuracy_band_keys", derivedIntegrity.duplicate_accuracy_band_keys, declaredIntegrity.duplicate_accuracy_band_keys],
    ["duplicate_data_dictionary_keys", derivedIntegrity.duplicate_data_dictionary_keys, declaredIntegrity.duplicate_data_dictionary_keys],
    ["duplicate_source_ids", derivedIntegrity.duplicate_source_ids, declaredIntegrity.duplicate_source_ids],
    ["duplicate_platform_ids", derivedIntegrity.duplicate_platform_ids, declaredIntegrity.duplicate_platform_ids],
    ["duplicate_armor_ids", derivedIntegrity.duplicate_armor_ids, declaredIntegrity.duplicate_armor_ids],
    ["duplicate_mobility_ids", derivedIntegrity.duplicate_mobility_ids, declaredIntegrity.duplicate_mobility_ids],
    ["duplicate_sensor_ids", derivedIntegrity.duplicate_sensor_ids, declaredIntegrity.duplicate_sensor_ids],
    ["duplicate_mount_ids", derivedIntegrity.duplicate_mount_ids, declaredIntegrity.duplicate_mount_ids],
    ["duplicate_loadout_ids", derivedIntegrity.duplicate_loadout_ids, declaredIntegrity.duplicate_loadout_ids],
    ["missing_accuracy_profiles", derivedIntegrity.missing_accuracy_profiles, declaredIntegrity.missing_accuracy_profiles],
    ["missing_ammo_families", derivedIntegrity.missing_ammo_families, declaredIntegrity.missing_ammo_families],
    ["missing_source_references", derivedIntegrity.missing_source_references, declaredIntegrity.missing_source_references],
    ["missing_platform_references", derivedIntegrity.missing_platform_references, declaredIntegrity.missing_platform_references],
    ["missing_weapon_references", derivedIntegrity.missing_weapon_references, declaredIntegrity.missing_weapon_references],
    ["missing_ammo_references", derivedIntegrity.missing_ammo_references, declaredIntegrity.missing_ammo_references],
    ["platforms_missing_armor", derivedIntegrity.platforms_missing_armor, declaredIntegrity.platforms_missing_armor],
    ["platforms_missing_mobility", derivedIntegrity.platforms_missing_mobility, declaredIntegrity.platforms_missing_mobility],
    ["platforms_missing_sensors", derivedIntegrity.platforms_missing_sensors, declaredIntegrity.platforms_missing_sensors],
    ["platforms_missing_mounts", derivedIntegrity.platforms_missing_mounts, declaredIntegrity.platforms_missing_mounts],
    ["platforms_missing_loadouts", derivedIntegrity.platforms_missing_loadouts, declaredIntegrity.platforms_missing_loadouts],
  ];
  arrayChecks.forEach(([label, actual, expected]) => {
    if (!compareStringArrays(actual, expected)) {
      issues.push(`Manifest integrity mismatch for ${label}.`);
    }
  });

  const countChecks: Array<[string, Readonly<Record<string, number>>, Readonly<Record<string, number>>]> = [
    ["weapon_category_counts", derivedIntegrity.weapon_category_counts, declaredIntegrity.weapon_category_counts],
    ["weapon_platform_counts", derivedIntegrity.weapon_platform_counts, declaredIntegrity.weapon_platform_counts],
    ["ammo_type_counts", derivedIntegrity.ammo_type_counts, declaredIntegrity.ammo_type_counts],
    ["accuracy_profile_band_counts", derivedIntegrity.accuracy_profile_band_counts, declaredIntegrity.accuracy_profile_band_counts],
    ["platform_class_counts", derivedIntegrity.platform_class_counts, declaredIntegrity.platform_class_counts],
    ["platform_nation_counts", derivedIntegrity.platform_nation_counts, declaredIntegrity.platform_nation_counts],
    ["mobility_type_counts", derivedIntegrity.mobility_type_counts, declaredIntegrity.mobility_type_counts],
    ["mount_type_counts", derivedIntegrity.mount_type_counts, declaredIntegrity.mount_type_counts],
    ["source_type_counts", derivedIntegrity.source_type_counts, declaredIntegrity.source_type_counts],
  ];
  countChecks.forEach(([label, actual, expected]) => {
    if (!compareCountRecords(actual, expected)) {
      issues.push(`Manifest integrity mismatch for ${label}.`);
    }
  });

  return Object.freeze(issues);
}

export const canonIntegrity = calculateCanonIntegrity();
export const canonManifestValidationIssues = validateCanonManifest();

export const WEAPON_CANON_BY_ID = mapBy(weapons, (weapon) => weapon.weapon_id) as ReadonlyMap<
  string,
  CanonWeaponRecord
>;

export const AMMO_CANON_BY_ID = mapBy(ammo, (entry) => entry.ammo_id) as ReadonlyMap<string, CanonAmmoRecord>;

export const ACCURACY_PROFILE_BANDS_BY_ID = groupBy(
  accuracyCurveBands,
  (band) => band.profile_id
) as ReadonlyMap<string, readonly CanonAccuracyCurveBandRecord[]>;

export const DATA_DICTIONARY_BY_KEY = mapBy(
  dataDictionary,
  (entry) => `${entry.Sheet}:${entry.Column}`
) as ReadonlyMap<string, CanonDataDictionaryRecord>;

export const AMMO_BY_FAMILY = groupBy(ammo, (entry) => entry.ammo_family) as ReadonlyMap<
  string,
  readonly CanonAmmoRecord[]
>;

export const SOURCE_CANON_BY_ID = mapBy(
  sourcesLog,
  (entry) => entry.source_id
) as ReadonlyMap<string, CanonSourceLogRecord>;

export const PLATFORM_CANON_BY_ID = mapBy(
  platforms,
  (entry) => entry.platform_id
) as ReadonlyMap<string, CanonPlatformRecord>;

export const PLATFORM_ARMOR_BY_ID = mapBy(
  platformArmor,
  (entry) => entry.armor_id
) as ReadonlyMap<string, CanonPlatformArmorRecord>;

export const PLATFORM_ARMOR_BY_PLATFORM_ID = groupBy(
  platformArmor,
  (entry) => entry.platform_id
) as ReadonlyMap<string, readonly CanonPlatformArmorRecord[]>;

export const PLATFORM_MOBILITY_BY_ID = mapBy(
  platformMobility,
  (entry) => entry.mobility_id
) as ReadonlyMap<string, CanonPlatformMobilityRecord>;

export const PLATFORM_MOBILITY_BY_PLATFORM_ID = mapBy(
  platformMobility,
  (entry) => entry.platform_id
) as ReadonlyMap<string, CanonPlatformMobilityRecord>;

export const PLATFORM_SENSORS_BY_ID = mapBy(
  platformSensors,
  (entry) => entry.sensors_id
) as ReadonlyMap<string, CanonPlatformSensorsRecord>;

export const PLATFORM_SENSORS_BY_PLATFORM_ID = mapBy(
  platformSensors,
  (entry) => entry.platform_id
) as ReadonlyMap<string, CanonPlatformSensorsRecord>;

export const WEAPON_MOUNTS_BY_ID = mapBy(
  weaponMounts,
  (entry) => entry.mount_id
) as ReadonlyMap<string, CanonWeaponMountRecord>;

export const WEAPON_MOUNTS_BY_PLATFORM_ID = groupBy(
  weaponMounts,
  (entry) => entry.platform_id
) as ReadonlyMap<string, readonly CanonWeaponMountRecord[]>;

export const PLATFORM_LOADOUTS_BY_ID = mapBy(
  platformLoadouts,
  (entry) => entry.loadout_id
) as ReadonlyMap<string, CanonPlatformLoadoutRecord>;

export const PLATFORM_LOADOUTS_BY_PLATFORM_ID = groupBy(
  platformLoadouts,
  (entry) => entry.platform_id
) as ReadonlyMap<string, readonly CanonPlatformLoadoutRecord[]>;

export function getAccuracyProfileBands(profileId: string): readonly CanonAccuracyCurveBandRecord[] {
  return ACCURACY_PROFILE_BANDS_BY_ID.get(profileId) ?? [];
}

export function getPlatformArmor(platformId: string): readonly CanonPlatformArmorRecord[] {
  return PLATFORM_ARMOR_BY_PLATFORM_ID.get(platformId) ?? [];
}

export function getPlatformMobility(platformId: string): CanonPlatformMobilityRecord | undefined {
  return PLATFORM_MOBILITY_BY_PLATFORM_ID.get(platformId);
}

export function getPlatformSensors(platformId: string): CanonPlatformSensorsRecord | undefined {
  return PLATFORM_SENSORS_BY_PLATFORM_ID.get(platformId);
}

export function getWeaponMountsForPlatform(platformId: string): readonly CanonWeaponMountRecord[] {
  return WEAPON_MOUNTS_BY_PLATFORM_ID.get(platformId) ?? [];
}

export function getPlatformLoadouts(platformId: string): readonly CanonPlatformLoadoutRecord[] {
  return PLATFORM_LOADOUTS_BY_PLATFORM_ID.get(platformId) ?? [];
}
