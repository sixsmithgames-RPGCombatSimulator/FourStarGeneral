# FSG Canon

This folder is the in-repo canonical import of [`design/fsg_weapon_database_platforms_v2.xlsx`](/C:/FourStarGeneral/design/fsg_weapon_database_platforms_v2.xlsx).

Files in this folder are split into two groups:

- Generated tables:
  - `readmeFields.table.json`
  - `weapons.table.json`
  - `ammo.table.json`
  - `accuracyCurveBands.table.json`
  - `dataDictionary.table.json`
  - `sourcesLog.table.json`
  - `platforms.table.json`
  - `platformArmor.table.json`
  - `platformMobility.table.json`
  - `platformSensors.table.json`
  - `weaponMounts.table.json`
  - `platformLoadouts.table.json`
  - `manifest.json`
- Hand-authored access layers:
  - `canon.ts`
  - `weaponCanon.ts` (compatibility wrapper)

Use these commands when the workbook changes:

```bash
npm run canon:export
npm run canon:check
```

`manifest.json` records the workbook hash, row counts, and the current integrity report. Prefer importing `canon.ts` from app code so weapons, sources, platforms, mounts, and loadouts all come through one unified access layer.
