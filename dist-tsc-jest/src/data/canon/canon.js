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
import platformPresentationData from "./platformPresentation.table.json";
import weaponPresentationData from "./weaponPresentation.table.json";
import ammoPresentationData from "./ammoPresentation.table.json";
const manifest = Object.freeze(manifestData);
const readmeFields = Object.freeze(readmeFieldsData);
const weapons = Object.freeze(weaponsData);
const ammo = Object.freeze(ammoData);
const accuracyCurveBands = Object.freeze(accuracyCurveBandsData);
const dataDictionary = Object.freeze(dataDictionaryData);
const sourcesLog = Object.freeze(sourcesLogData);
const platforms = Object.freeze(platformsData);
const platformArmor = Object.freeze(platformArmorData);
const platformMobility = Object.freeze(platformMobilityData);
const platformSensors = Object.freeze(platformSensorsData);
const weaponMounts = Object.freeze(weaponMountsData);
const platformLoadouts = Object.freeze(platformLoadoutsData);
const platformPresentation = Object.freeze(platformPresentationData);
const weaponPresentation = Object.freeze(weaponPresentationData);
const ammoPresentation = Object.freeze(ammoPresentationData);
const PLATFORM_CLASSES_WITHOUT_REQUIRED_ARMAMENT = new Set(["truck"]);
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
    platformPresentation,
    weaponPresentation,
    ammoPresentation,
});
export const canon = Object.freeze({
    manifest,
    ...canonTables,
});
function countBy(items, selector) {
    const counts = {};
    items.forEach((item) => {
        const key = selector(item);
        counts[key] = (counts[key] ?? 0) + 1;
    });
    return counts;
}
function groupBy(items, selector) {
    const buckets = new Map();
    items.forEach((item) => {
        const key = selector(item);
        const bucket = buckets.get(key);
        if (bucket) {
            bucket.push(item);
        }
        else {
            buckets.set(key, [item]);
        }
    });
    return new Map(Array.from(buckets.entries(), ([key, bucket]) => [key, Object.freeze(bucket.slice())]));
}
function mapBy(items, selector) {
    return new Map(items.map((item) => [selector(item), item]));
}
function findDuplicates(values) {
    const seen = new Set();
    const duplicates = new Set();
    values.forEach((value) => {
        if (seen.has(value)) {
            duplicates.add(value);
        }
        else {
            seen.add(value);
        }
    });
    return Object.freeze(Array.from(duplicates).sort());
}
function compareStringArrays(actual, expected) {
    return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}
function compareCountRecords(actual, expected) {
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (!compareStringArrays(actualKeys, expectedKeys)) {
        return false;
    }
    return actualKeys.every((key) => actual[key] === expected[key]);
}
function describeMissingReferences(rows, options) {
    const issues = [];
    rows.forEach((row) => {
        const rowData = row;
        const reference = rowData[options.referenceField];
        if (typeof reference !== "string" || reference.length === 0 || options.validKeys.has(reference)) {
            return;
        }
        const rowId = rowData[options.idField];
        issues.push(`${options.tableLabel}:${typeof rowId === "string" && rowId.length > 0 ? rowId : "<unknown>"}:${String(options.referenceField)}=${reference}`);
    });
    return Object.freeze(issues.sort());
}
function findParentsWithoutChildren(parentRows, options) {
    const coveredIds = new Set();
    options.childRows.forEach((row) => {
        const value = row[options.childForeignKeyField];
        if (typeof value === "string" && value.length > 0) {
            coveredIds.add(value);
        }
    });
    const uncovered = [];
    parentRows.forEach((row) => {
        const value = row[options.parentIdField];
        if (typeof value === "string" && value.length > 0 && !coveredIds.has(value)) {
            uncovered.push(value);
        }
    });
    uncovered.sort();
    return Object.freeze(uncovered);
}
function filterPlatformsForRequiredArmament(platformRows) {
    return Object.freeze(platformRows.filter((platform) => !PLATFORM_CLASSES_WITHOUT_REQUIRED_ARMAMENT.has(platform.platform_class)));
}
export function calculateCanonIntegrity(dataset = canonTables) {
    const combatArmedPlatforms = filterPlatformsForRequiredArmament(dataset.platforms);
    const accuracyProfiles = new Set(dataset.accuracyCurveBands.map((band) => band.profile_id));
    const ammoFamilies = new Set(dataset.ammo.map((entry) => entry.ammo_family));
    const sourceIds = new Set(dataset.sourcesLog.map((entry) => entry.source_id));
    const platformIds = new Set(dataset.platforms.map((entry) => entry.platform_id));
    const weaponIds = new Set(dataset.weapons.map((entry) => entry.weapon_id));
    const ammoIds = new Set(dataset.ammo.map((entry) => entry.ammo_id));
    const missingAccuracyProfiles = dataset.weapons
        .map((weapon) => weapon.accuracy_profile_id)
        .filter((profileId) => typeof profileId === "string" && profileId.length > 0)
        .filter((profileId) => !accuracyProfiles.has(profileId));
    const missingAmmoFamilies = dataset.weapons
        .map((weapon) => weapon.ammo_group)
        .filter((ammoGroup) => typeof ammoGroup === "string" && ammoGroup.length > 0)
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
        ...describeMissingReferences(dataset.platformPresentation, {
            tableLabel: "Platform_Presentation",
            idField: "platform_id",
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
        duplicate_accuracy_band_keys: findDuplicates(dataset.accuracyCurveBands.map((band) => `${band.profile_id}:${band.band_min_m}:${band.band_max_m}`)),
        duplicate_data_dictionary_keys: findDuplicates(dataset.dataDictionary.map((entry) => `${entry.Sheet}:${entry.Column}`)),
        duplicate_source_ids: findDuplicates(dataset.sourcesLog.map((entry) => entry.source_id)),
        duplicate_platform_ids: findDuplicates(dataset.platforms.map((entry) => entry.platform_id)),
        duplicate_armor_ids: findDuplicates(dataset.platformArmor.map((entry) => entry.armor_id)),
        duplicate_mobility_ids: findDuplicates(dataset.platformMobility.map((entry) => entry.mobility_id)),
        duplicate_sensor_ids: findDuplicates(dataset.platformSensors.map((entry) => entry.sensors_id)),
        duplicate_mount_ids: findDuplicates(dataset.weaponMounts.map((entry) => entry.mount_id)),
        duplicate_loadout_ids: findDuplicates(dataset.platformLoadouts.map((entry) => entry.loadout_id)),
        duplicate_platform_presentation_ids: findDuplicates(dataset.platformPresentation.map((entry) => entry.platform_id)),
        duplicate_weapon_presentation_ids: findDuplicates(dataset.weaponPresentation.map((entry) => entry.weapon_id)),
        duplicate_ammo_presentation_ids: findDuplicates(dataset.ammoPresentation.map((entry) => entry.ammo_id)),
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
        platforms_missing_mounts: findParentsWithoutChildren(combatArmedPlatforms, {
            parentIdField: "platform_id",
            childRows: dataset.weaponMounts,
            childForeignKeyField: "platform_id",
        }),
        platforms_missing_loadouts: findParentsWithoutChildren(combatArmedPlatforms, {
            parentIdField: "platform_id",
            childRows: dataset.platformLoadouts,
            childForeignKeyField: "platform_id",
        }),
        platforms_missing_presentation: findParentsWithoutChildren(dataset.platforms, {
            parentIdField: "platform_id",
            childRows: dataset.platformPresentation,
            childForeignKeyField: "platform_id",
        }),
        weapons_missing_presentation: findParentsWithoutChildren(dataset.weapons, {
            parentIdField: "weapon_id",
            childRows: dataset.weaponPresentation,
            childForeignKeyField: "weapon_id",
        }),
        ammo_missing_presentation: findParentsWithoutChildren(dataset.ammo, {
            parentIdField: "ammo_id",
            childRows: dataset.ammoPresentation,
            childForeignKeyField: "ammo_id",
        }),
        weapon_category_counts: Object.freeze(countBy(dataset.weapons, (weapon) => weapon.category)),
        weapon_platform_counts: Object.freeze(countBy(dataset.weapons, (weapon) => weapon.platform)),
        ammo_type_counts: Object.freeze(countBy(dataset.ammo, (entry) => entry.ammo_type)),
        accuracy_profile_band_counts: Object.freeze(countBy(dataset.accuracyCurveBands, (band) => band.profile_id)),
        platform_class_counts: Object.freeze(countBy(dataset.platforms, (platform) => platform.platform_class)),
        platform_nation_counts: Object.freeze(countBy(dataset.platforms, (platform) => platform.nation)),
        mobility_type_counts: Object.freeze(countBy(dataset.platformMobility, (mobility) => mobility.move_type)),
        mount_type_counts: Object.freeze(countBy(dataset.weaponMounts, (mount) => mount.mount_type)),
        presentation_ui_group_counts: Object.freeze(countBy(dataset.platformPresentation, (presentation) => presentation.ui_group)),
        weapon_presentation_ui_group_counts: Object.freeze(countBy(dataset.weaponPresentation, (presentation) => presentation.ui_group)),
        ammo_presentation_ui_group_counts: Object.freeze(countBy(dataset.ammoPresentation, (presentation) => presentation.ui_group)),
        source_type_counts: Object.freeze(countBy(dataset.sourcesLog, (source) => source.source_type)),
    });
}
export function validateCanonManifest(dataset = canon) {
    const issues = [];
    const derivedIntegrity = calculateCanonIntegrity(dataset);
    const declaredIntegrity = dataset.manifest.integrity;
    const tableCountChecks = [
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
        ["platformPresentation", dataset.platformPresentation.length],
        ["weaponPresentation", dataset.weaponPresentation.length],
        ["ammoPresentation", dataset.ammoPresentation.length],
    ];
    tableCountChecks.forEach(([tableKey, actualCount]) => {
        const declaredCount = dataset.manifest.table_counts[tableKey];
        if (declaredCount !== actualCount) {
            issues.push(`Manifest table count mismatch for ${tableKey}: declared ${declaredCount}, actual ${actualCount}.`);
        }
    });
    const arrayChecks = [
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
        ["duplicate_platform_presentation_ids", derivedIntegrity.duplicate_platform_presentation_ids, declaredIntegrity.duplicate_platform_presentation_ids],
        ["duplicate_weapon_presentation_ids", derivedIntegrity.duplicate_weapon_presentation_ids, declaredIntegrity.duplicate_weapon_presentation_ids],
        ["duplicate_ammo_presentation_ids", derivedIntegrity.duplicate_ammo_presentation_ids, declaredIntegrity.duplicate_ammo_presentation_ids],
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
        ["platforms_missing_presentation", derivedIntegrity.platforms_missing_presentation, declaredIntegrity.platforms_missing_presentation],
        ["weapons_missing_presentation", derivedIntegrity.weapons_missing_presentation, declaredIntegrity.weapons_missing_presentation],
        ["ammo_missing_presentation", derivedIntegrity.ammo_missing_presentation, declaredIntegrity.ammo_missing_presentation],
    ];
    arrayChecks.forEach(([label, actual, expected]) => {
        if (!compareStringArrays(actual, expected)) {
            issues.push(`Manifest integrity mismatch for ${label}.`);
        }
    });
    const countChecks = [
        ["weapon_category_counts", derivedIntegrity.weapon_category_counts, declaredIntegrity.weapon_category_counts],
        ["weapon_platform_counts", derivedIntegrity.weapon_platform_counts, declaredIntegrity.weapon_platform_counts],
        ["ammo_type_counts", derivedIntegrity.ammo_type_counts, declaredIntegrity.ammo_type_counts],
        ["accuracy_profile_band_counts", derivedIntegrity.accuracy_profile_band_counts, declaredIntegrity.accuracy_profile_band_counts],
        ["platform_class_counts", derivedIntegrity.platform_class_counts, declaredIntegrity.platform_class_counts],
        ["platform_nation_counts", derivedIntegrity.platform_nation_counts, declaredIntegrity.platform_nation_counts],
        ["mobility_type_counts", derivedIntegrity.mobility_type_counts, declaredIntegrity.mobility_type_counts],
        ["mount_type_counts", derivedIntegrity.mount_type_counts, declaredIntegrity.mount_type_counts],
        ["presentation_ui_group_counts", derivedIntegrity.presentation_ui_group_counts, declaredIntegrity.presentation_ui_group_counts],
        ["weapon_presentation_ui_group_counts", derivedIntegrity.weapon_presentation_ui_group_counts, declaredIntegrity.weapon_presentation_ui_group_counts],
        ["ammo_presentation_ui_group_counts", derivedIntegrity.ammo_presentation_ui_group_counts, declaredIntegrity.ammo_presentation_ui_group_counts],
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
export const WEAPON_CANON_BY_ID = mapBy(weapons, (weapon) => weapon.weapon_id);
export const AMMO_CANON_BY_ID = mapBy(ammo, (entry) => entry.ammo_id);
export const ACCURACY_PROFILE_BANDS_BY_ID = groupBy(accuracyCurveBands, (band) => band.profile_id);
export const DATA_DICTIONARY_BY_KEY = mapBy(dataDictionary, (entry) => `${entry.Sheet}:${entry.Column}`);
export const AMMO_BY_FAMILY = groupBy(ammo, (entry) => entry.ammo_family);
export const SOURCE_CANON_BY_ID = mapBy(sourcesLog, (entry) => entry.source_id);
export const PLATFORM_CANON_BY_ID = mapBy(platforms, (entry) => entry.platform_id);
export const PLATFORM_ARMOR_BY_ID = mapBy(platformArmor, (entry) => entry.armor_id);
export const PLATFORM_ARMOR_BY_PLATFORM_ID = groupBy(platformArmor, (entry) => entry.platform_id);
export const PLATFORM_MOBILITY_BY_ID = mapBy(platformMobility, (entry) => entry.mobility_id);
export const PLATFORM_MOBILITY_BY_PLATFORM_ID = mapBy(platformMobility, (entry) => entry.platform_id);
export const PLATFORM_SENSORS_BY_ID = mapBy(platformSensors, (entry) => entry.sensors_id);
export const PLATFORM_SENSORS_BY_PLATFORM_ID = mapBy(platformSensors, (entry) => entry.platform_id);
export const WEAPON_MOUNTS_BY_ID = mapBy(weaponMounts, (entry) => entry.mount_id);
export const WEAPON_MOUNTS_BY_PLATFORM_ID = groupBy(weaponMounts, (entry) => entry.platform_id);
export const PLATFORM_LOADOUTS_BY_ID = mapBy(platformLoadouts, (entry) => entry.loadout_id);
export const PLATFORM_LOADOUTS_BY_PLATFORM_ID = groupBy(platformLoadouts, (entry) => entry.platform_id);
export const PLATFORM_PRESENTATION_BY_PLATFORM_ID = mapBy(platformPresentation, (entry) => entry.platform_id);
export const WEAPON_PRESENTATION_BY_WEAPON_ID = mapBy(weaponPresentation, (entry) => entry.weapon_id);
export const AMMO_PRESENTATION_BY_AMMO_ID = mapBy(ammoPresentation, (entry) => entry.ammo_id);
export function getAccuracyProfileBands(profileId) {
    return ACCURACY_PROFILE_BANDS_BY_ID.get(profileId) ?? [];
}
export function getPlatformArmor(platformId) {
    return PLATFORM_ARMOR_BY_PLATFORM_ID.get(platformId) ?? [];
}
export function getPlatformMobility(platformId) {
    return PLATFORM_MOBILITY_BY_PLATFORM_ID.get(platformId);
}
export function getPlatformSensors(platformId) {
    return PLATFORM_SENSORS_BY_PLATFORM_ID.get(platformId);
}
export function getWeaponMountsForPlatform(platformId) {
    return WEAPON_MOUNTS_BY_PLATFORM_ID.get(platformId) ?? [];
}
export function getPlatformLoadouts(platformId) {
    return PLATFORM_LOADOUTS_BY_PLATFORM_ID.get(platformId) ?? [];
}
export function getPlatformPresentation(platformId) {
    return PLATFORM_PRESENTATION_BY_PLATFORM_ID.get(platformId);
}
export function getPlatformDisplayName(platformId) {
    return getPlatformPresentation(platformId)?.display_name ?? PLATFORM_CANON_BY_ID.get(platformId)?.platform_name ?? platformId;
}
export function getPlatformShortName(platformId) {
    return getPlatformPresentation(platformId)?.short_name ?? getPlatformDisplayName(platformId);
}
export function getPlatformShortDescription(platformId) {
    return getPlatformPresentation(platformId)?.short_description ?? null;
}
export function getPlatformLongDescription(platformId) {
    return getPlatformPresentation(platformId)?.long_description ?? null;
}
export function getWeaponPresentation(weaponId) {
    return WEAPON_PRESENTATION_BY_WEAPON_ID.get(weaponId);
}
export function getWeaponDisplayName(weaponId) {
    return getWeaponPresentation(weaponId)?.display_name ?? WEAPON_CANON_BY_ID.get(weaponId)?.weapon_name ?? weaponId;
}
export function getWeaponShortDescription(weaponId) {
    return getWeaponPresentation(weaponId)?.short_description ?? null;
}
export function getWeaponLongDescription(weaponId) {
    return getWeaponPresentation(weaponId)?.long_description ?? null;
}
export function getAmmoPresentation(ammoId) {
    return AMMO_PRESENTATION_BY_AMMO_ID.get(ammoId);
}
export function getAmmoDisplayName(ammoId) {
    return getAmmoPresentation(ammoId)?.display_name ?? AMMO_CANON_BY_ID.get(ammoId)?.ammo_name ?? ammoId;
}
export function getAmmoShortDescription(ammoId) {
    return getAmmoPresentation(ammoId)?.short_description ?? null;
}
export function getAmmoLongDescription(ammoId) {
    return getAmmoPresentation(ammoId)?.long_description ?? null;
}
