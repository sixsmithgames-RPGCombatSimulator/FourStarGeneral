from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path, PurePosixPath
from typing import Any, Iterable
from xml.etree import ElementTree as ET
from zipfile import ZipFile


WORKBOOK_REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
PACKAGE_REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}Relationship"
MAIN_NS = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKBOOK = ROOT / "design" / "fsg_weapon_database_platforms_v2.xlsx"
OUTPUT_DIR = ROOT / "src" / "data" / "canon"

TABLE_SPECS: dict[str, dict[str, Any]] = {
    "README": {
        "header_row": 3,
        "table_key": "readmeFields",
        "output": "readmeFields.table.json",
    },
    "Weapons_DB": {
        "header_row": 1,
        "table_key": "weapons",
        "output": "weapons.table.json",
    },
    "Ammo_DB": {
        "header_row": 1,
        "table_key": "ammo",
        "output": "ammo.table.json",
    },
    "Accuracy_Curves": {
        "header_row": 1,
        "table_key": "accuracyCurveBands",
        "output": "accuracyCurveBands.table.json",
    },
    "Data_Dictionary": {
        "header_row": 1,
        "table_key": "dataDictionary",
        "output": "dataDictionary.table.json",
    },
    "Sources_Log": {
        "header_row": 1,
        "table_key": "sourcesLog",
        "output": "sourcesLog.table.json",
    },
    "Platforms": {
        "header_row": 1,
        "table_key": "platforms",
        "output": "platforms.table.json",
    },
    "Platform_Armor": {
        "header_row": 1,
        "table_key": "platformArmor",
        "output": "platformArmor.table.json",
    },
    "Platform_Mobility": {
        "header_row": 1,
        "table_key": "platformMobility",
        "output": "platformMobility.table.json",
    },
    "Platform_Sensors": {
        "header_row": 1,
        "table_key": "platformSensors",
        "output": "platformSensors.table.json",
    },
    "Weapon_Mounts": {
        "header_row": 1,
        "table_key": "weaponMounts",
        "output": "weaponMounts.table.json",
    },
    "Platform_Loadouts": {
        "header_row": 1,
        "table_key": "platformLoadouts",
        "output": "platformLoadouts.table.json",
    },
}

NUMERIC_COLUMNS = {
    "Weapons_DB": {
        "caliber_mm",
        "crew",
        "min_range_m",
        "effective_range_m",
        "max_direct_range_m",
        "max_ballistic_range_m",
        "rate_of_fire_rpm",
    },
    "Ammo_DB": {
        "caliber_mm",
    },
    "Accuracy_Curves": {
        "band_min_m",
        "band_max_m",
        "base_hit_probability",
        "shooter_moving_mult",
        "target_moving_mult",
        "obscured_mult",
    },
    "Platforms": {
        "crew_count",
    },
    "Platform_Armor": {
        "thickness_mm",
    },
    "Platform_Mobility": {
        "road_speed_kph",
        "offroad_speed_kph",
        "reverse_speed_kph_if_known",
        "operational_range_km",
        "fuel_capacity_l_if_known",
    },
    "Weapon_Mounts": {
        "traverse_arc_deg",
        "elevation_min_deg",
        "elevation_max_deg",
    },
    "Platform_Loadouts": {
        "carried_quantity",
        "default_mix_priority",
        "smoke_qty",
        "illumination_qty",
        "special_round_qty",
        "ready_rack_qty_if_known",
    },
}

BOOLEAN_COLUMNS = {
    "Ammo_DB": {
        "indirect_capable",
    },
    "Platforms": {
        "open_top_flag",
        "shielded_flag",
    },
    "Platform_Armor": {
        "spaced_flag",
        "shield_only_flag",
    },
    "Platform_Mobility": {
        "towing_capable_flag",
        "towed_by_default_flag",
        "amphibious_flag",
    },
    "Platform_Sensors": {
        "air_ground_spotting_flag",
    },
    "Weapon_Mounts": {
        "turret_flag",
        "coax_flag",
        "hull_flag",
        "pintle_flag",
    },
    "Platform_Loadouts": {
        "optional_mix_flag",
    },
}

FLEX_NUMERIC_COLUMNS = {
    "Platforms": {
        "weight_tons_or_class",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export the Excel canon workbook into in-repo JSON tables.")
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK, help="Path to the workbook to export.")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Verify that the checked-in canon matches the workbook without writing files.",
    )
    return parser.parse_args()


def normalize_target(target: str) -> str:
    normalized = target.replace("\\", "/")
    if normalized.startswith("/"):
        return normalized.lstrip("/")
    if normalized.startswith("xl/"):
        return normalized
    return str(PurePosixPath("xl") / normalized)


def column_letters(cell_ref: str) -> str:
    letters: list[str] = []
    for character in cell_ref:
        if character.isalpha():
            letters.append(character)
        else:
            break
    return "".join(letters)


def cell_value(cell: ET.Element, shared_strings: list[str]) -> str | None:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join((node.text or "") for node in cell.iterfind(".//main:t", MAIN_NS))

    value = cell.find("main:v", MAIN_NS)
    if value is None:
        return None

    raw = value.text
    if raw is None:
        return None
    if cell_type == "s":
        return shared_strings[int(raw)]
    return raw


def parse_number(value: str) -> int | float:
    number = float(value)
    if number.is_integer():
        return int(number)
    return number


def coerce_value(sheet_name: str, column_name: str, value: str | None) -> Any:
    if value is None:
        return None

    stripped = value.strip() if isinstance(value, str) else value
    if stripped == "":
        return None

    if column_name in BOOLEAN_COLUMNS.get(sheet_name, set()):
        return stripped == "1"

    if column_name in NUMERIC_COLUMNS.get(sheet_name, set()):
        return parse_number(stripped)

    if column_name in FLEX_NUMERIC_COLUMNS.get(sheet_name, set()):
        try:
            return parse_number(stripped)
        except ValueError:
            return stripped

    return stripped


def parse_sheet_rows(
    archive: ZipFile,
    shared_strings: list[str],
    worksheet_path: str,
    header_row_number: int,
) -> tuple[list[dict[str, Any]], int]:
    worksheet = ET.fromstring(archive.read(worksheet_path))
    rows = worksheet.findall("main:sheetData/main:row", MAIN_NS)
    if not rows:
        return [], 0

    header_row = next((row for row in rows if int(row.attrib.get("r", "0")) == header_row_number), None)
    if header_row is None:
        raise ValueError(f"Worksheet {worksheet_path} is missing expected header row {header_row_number}.")

    ordered_columns: list[tuple[str, str]] = []
    for cell in header_row.findall("main:c", MAIN_NS):
        header = cell_value(cell, shared_strings)
        if header:
            ordered_columns.append((column_letters(cell.attrib.get("r", "")), header))

    column_map = {column_letter: header for column_letter, header in ordered_columns}
    records: list[dict[str, Any]] = []
    max_column_count = len(ordered_columns)

    for row in rows:
        row_number = int(row.attrib.get("r", "0"))
        if row_number <= header_row_number:
            continue

        record = {header: None for _, header in ordered_columns}
        has_any_value = False

        for cell in row.findall("main:c", MAIN_NS):
            column_letter = column_letters(cell.attrib.get("r", ""))
            header = column_map.get(column_letter)
            if header is None:
                continue
            value = cell_value(cell, shared_strings)
            if value is not None and value != "":
                has_any_value = True
            record[header] = value

        if has_any_value:
            records.append(record)

    return records, max_column_count


def workbook_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as workbook_file:
        for chunk in iter(lambda: workbook_file.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def find_duplicates(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        else:
            seen.add(value)
    return sorted(duplicates)


def collect_missing_references(
    rows: list[dict[str, Any]],
    *,
    table_name: str,
    id_field: str,
    reference_field: str,
    valid_ids: set[str],
) -> list[str]:
    missing: list[str] = []
    for row in rows:
        reference = row.get(reference_field)
        if not reference:
            continue
        if reference not in valid_ids:
            row_id = row.get(id_field) or "<unknown>"
            missing.append(f"{table_name}:{row_id}:{reference_field}={reference}")
    return sorted(missing)


def missing_parent_rows(
    parent_rows: list[dict[str, Any]],
    *,
    parent_id_field: str,
    child_rows: list[dict[str, Any]],
    child_foreign_key_field: str,
) -> list[str]:
    covered_ids = {
        row[child_foreign_key_field]
        for row in child_rows
        if isinstance(row.get(child_foreign_key_field), str) and row[child_foreign_key_field]
    }
    return sorted(
        row[parent_id_field]
        for row in parent_rows
        if isinstance(row.get(parent_id_field), str) and row[parent_id_field] not in covered_ids
    )


def build_table_payloads(workbook_path: Path) -> dict[str, Any]:
    with ZipFile(workbook_path) as archive:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for string_item in shared_root.findall("main:si", MAIN_NS):
                shared_strings.append("".join((node.text or "") for node in string_item.iterfind(".//main:t", MAIN_NS)))

        workbook_root = ET.fromstring(archive.read("xl/workbook.xml"))
        rel_root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_map = {relationship.attrib["Id"]: relationship.attrib["Target"] for relationship in rel_root.findall(PACKAGE_REL_NS)}

        table_payloads: dict[str, list[dict[str, Any]]] = {}
        sheet_summaries: list[dict[str, Any]] = []
        workbook_title = None

        for sheet in workbook_root.find("main:sheets", MAIN_NS):
            sheet_name = sheet.attrib["name"]
            spec = TABLE_SPECS.get(sheet_name)
            if spec is None:
                continue

            worksheet_path = normalize_target(rel_map[sheet.attrib[WORKBOOK_REL_NS]])
            worksheet_rows, column_count = parse_sheet_rows(
                archive,
                shared_strings,
                worksheet_path,
                spec["header_row"],
            )

            if sheet_name == "README":
                workbook_sheet = ET.fromstring(archive.read(worksheet_path))
                title_cell = workbook_sheet.find("main:sheetData/main:row[@r='1']/main:c[@r='A1']", MAIN_NS)
                workbook_title = cell_value(title_cell, shared_strings) if title_cell is not None else None

            coerced_rows = [
                {
                    column_name: coerce_value(sheet_name, column_name, value)
                    for column_name, value in row.items()
                }
                for row in worksheet_rows
            ]

            table_payloads[spec["table_key"]] = coerced_rows
            sheet_summaries.append(
                {
                    "sheet_name": sheet_name,
                    "table_key": spec["table_key"],
                    "row_count": len(coerced_rows),
                    "column_count": column_count,
                    "worksheet_path": worksheet_path,
                }
            )

    weapons = table_payloads["weapons"]
    ammo = table_payloads["ammo"]
    accuracy_curve_bands = table_payloads["accuracyCurveBands"]
    data_dictionary = table_payloads["dataDictionary"]
    sources_log = table_payloads["sourcesLog"]
    platforms = table_payloads["platforms"]
    platform_armor = table_payloads["platformArmor"]
    platform_mobility = table_payloads["platformMobility"]
    platform_sensors = table_payloads["platformSensors"]
    weapon_mounts = table_payloads["weaponMounts"]
    platform_loadouts = table_payloads["platformLoadouts"]

    weapon_accuracy_profiles = {entry["accuracy_profile_id"] for entry in weapons if entry["accuracy_profile_id"]}
    accuracy_profiles = {entry["profile_id"] for entry in accuracy_curve_bands if entry["profile_id"]}
    weapon_ammo_groups = {entry["ammo_group"] for entry in weapons if entry["ammo_group"]}
    ammo_families = {entry["ammo_family"] for entry in ammo if entry["ammo_family"]}
    weapon_ids = {entry["weapon_id"] for entry in weapons if entry["weapon_id"]}
    ammo_ids = {entry["ammo_id"] for entry in ammo if entry["ammo_id"]}
    source_ids = {entry["source_id"] for entry in sources_log if entry["source_id"]}
    platform_ids = {entry["platform_id"] for entry in platforms if entry["platform_id"]}

    source_reference_rows = [
        ("Platforms", platforms, "platform_id"),
        ("Platform_Armor", platform_armor, "armor_id"),
        ("Platform_Mobility", platform_mobility, "mobility_id"),
        ("Platform_Sensors", platform_sensors, "sensors_id"),
        ("Weapon_Mounts", weapon_mounts, "mount_id"),
        ("Platform_Loadouts", platform_loadouts, "loadout_id"),
    ]
    missing_source_references = sorted(
        item
        for table_name, rows, id_field in source_reference_rows
        for item in collect_missing_references(
            rows,
            table_name=table_name,
            id_field=id_field,
            reference_field="source_id_primary",
            valid_ids=source_ids,
        )
    )

    platform_reference_rows = [
        ("Platform_Armor", platform_armor, "armor_id"),
        ("Platform_Mobility", platform_mobility, "mobility_id"),
        ("Platform_Sensors", platform_sensors, "sensors_id"),
        ("Weapon_Mounts", weapon_mounts, "mount_id"),
        ("Platform_Loadouts", platform_loadouts, "loadout_id"),
    ]
    missing_platform_references = sorted(
        item
        for table_name, rows, id_field in platform_reference_rows
        for item in collect_missing_references(
            rows,
            table_name=table_name,
            id_field=id_field,
            reference_field="platform_id",
            valid_ids=platform_ids,
        )
    )

    missing_weapon_references = sorted(
        item
        for table_name, rows, id_field in [
            ("Weapon_Mounts", weapon_mounts, "mount_id"),
            ("Platform_Loadouts", platform_loadouts, "loadout_id"),
        ]
        for item in collect_missing_references(
            rows,
            table_name=table_name,
            id_field=id_field,
            reference_field="weapon_id",
            valid_ids=weapon_ids,
        )
    )

    missing_ammo_references = collect_missing_references(
        platform_loadouts,
        table_name="Platform_Loadouts",
        id_field="loadout_id",
        reference_field="ammo_id",
        valid_ids=ammo_ids,
    )

    integrity = {
        "duplicate_weapon_ids": find_duplicates(entry["weapon_id"] for entry in weapons),
        "duplicate_ammo_ids": find_duplicates(entry["ammo_id"] for entry in ammo),
        "duplicate_accuracy_band_keys": find_duplicates(
            f"{entry['profile_id']}:{entry['band_min_m']}:{entry['band_max_m']}"
            for entry in accuracy_curve_bands
        ),
        "duplicate_data_dictionary_keys": find_duplicates(
            f"{entry['Sheet']}:{entry['Column']}" for entry in data_dictionary
        ),
        "duplicate_source_ids": find_duplicates(entry["source_id"] for entry in sources_log),
        "duplicate_platform_ids": find_duplicates(entry["platform_id"] for entry in platforms),
        "duplicate_armor_ids": find_duplicates(entry["armor_id"] for entry in platform_armor),
        "duplicate_mobility_ids": find_duplicates(entry["mobility_id"] for entry in platform_mobility),
        "duplicate_sensor_ids": find_duplicates(entry["sensors_id"] for entry in platform_sensors),
        "duplicate_mount_ids": find_duplicates(entry["mount_id"] for entry in weapon_mounts),
        "duplicate_loadout_ids": find_duplicates(entry["loadout_id"] for entry in platform_loadouts),
        "missing_accuracy_profiles": sorted(weapon_accuracy_profiles - accuracy_profiles),
        "missing_ammo_families": sorted(weapon_ammo_groups - ammo_families),
        "missing_source_references": missing_source_references,
        "missing_platform_references": missing_platform_references,
        "missing_weapon_references": missing_weapon_references,
        "missing_ammo_references": missing_ammo_references,
        "platforms_missing_armor": missing_parent_rows(
            platforms,
            parent_id_field="platform_id",
            child_rows=platform_armor,
            child_foreign_key_field="platform_id",
        ),
        "platforms_missing_mobility": missing_parent_rows(
            platforms,
            parent_id_field="platform_id",
            child_rows=platform_mobility,
            child_foreign_key_field="platform_id",
        ),
        "platforms_missing_sensors": missing_parent_rows(
            platforms,
            parent_id_field="platform_id",
            child_rows=platform_sensors,
            child_foreign_key_field="platform_id",
        ),
        "platforms_missing_mounts": missing_parent_rows(
            platforms,
            parent_id_field="platform_id",
            child_rows=weapon_mounts,
            child_foreign_key_field="platform_id",
        ),
        "platforms_missing_loadouts": missing_parent_rows(
            platforms,
            parent_id_field="platform_id",
            child_rows=platform_loadouts,
            child_foreign_key_field="platform_id",
        ),
        "weapon_category_counts": dict(sorted(Counter(entry["category"] for entry in weapons).items())),
        "weapon_platform_counts": dict(sorted(Counter(entry["platform"] for entry in weapons).items())),
        "ammo_type_counts": dict(sorted(Counter(entry["ammo_type"] for entry in ammo).items())),
        "accuracy_profile_band_counts": dict(
            sorted(Counter(entry["profile_id"] for entry in accuracy_curve_bands).items())
        ),
        "platform_class_counts": dict(sorted(Counter(entry["platform_class"] for entry in platforms).items())),
        "platform_nation_counts": dict(sorted(Counter(entry["nation"] for entry in platforms).items())),
        "mobility_type_counts": dict(sorted(Counter(entry["move_type"] for entry in platform_mobility).items())),
        "mount_type_counts": dict(sorted(Counter(entry["mount_type"] for entry in weapon_mounts).items())),
        "source_type_counts": dict(sorted(Counter(entry["source_type"] for entry in sources_log).items())),
    }

    manifest = {
        "schema_version": 2,
        "source_workbook": {
            "relative_path": str(workbook_path.relative_to(ROOT)).replace("\\", "/"),
            "file_name": workbook_path.name,
            "sha256": workbook_hash(workbook_path),
            "workbook_title": workbook_title,
        },
        "sheet_summaries": sheet_summaries,
        "table_counts": {table_name: len(rows) for table_name, rows in table_payloads.items()},
        "integrity": integrity,
    }

    return {
        "manifest": manifest,
        "tables": table_payloads,
    }


def render_json(value: Any) -> str:
    return json.dumps(value, indent=2, ensure_ascii=True) + "\n"


def desired_outputs(payloads: dict[str, Any]) -> dict[Path, str]:
    manifest = payloads["manifest"]
    tables = payloads["tables"]
    outputs = {
        OUTPUT_DIR / "manifest.json": render_json(manifest),
    }
    for spec in TABLE_SPECS.values():
        table_key = spec["table_key"]
        outputs[OUTPUT_DIR / spec["output"]] = render_json(tables[table_key])
    return outputs


def main() -> int:
    args = parse_args()
    workbook_path = args.workbook.resolve()
    if not workbook_path.exists():
        raise FileNotFoundError(f"Workbook not found: {workbook_path}")

    payloads = build_table_payloads(workbook_path)
    outputs = desired_outputs(payloads)

    if args.check:
        mismatched: list[str] = []
        for path, expected_contents in outputs.items():
            if not path.exists():
                mismatched.append(f"missing {path.relative_to(ROOT)}")
                continue
            actual_contents = path.read_text(encoding="utf-8")
            if actual_contents != expected_contents:
                mismatched.append(f"stale {path.relative_to(ROOT)}")

        if mismatched:
            print("Canon data is out of date:")
            for item in mismatched:
                print(f"- {item}")
            return 1

        print("Canon data is up to date.")
        return 0

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for path, contents in outputs.items():
        path.write_text(contents, encoding="utf-8")

    print(f"Exported canon tables from {workbook_path.relative_to(ROOT)} to {OUTPUT_DIR.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
