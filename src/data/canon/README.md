# FSG Canon

This folder is the in-repo canonical import of [`design/fsg_weapon_database_platforms_v3_presentation.xlsx`](/C:/FourStarGeneral/design/fsg_weapon_database_platforms_v3_presentation.xlsx).

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
  - `platformPresentation.table.json`
  - `weaponPresentation.table.json`
  - `ammoPresentation.table.json`
  - `manifest.json`
- Hand-authored access layers:
  - `canon.ts`
  - `weaponCanon.ts` (compatibility wrapper)

Use these commands when the workbook changes:

```bash
npm run canon:export
npm run canon:check
```

`manifest.json` records the workbook hash, row counts, and the current integrity report. Prefer importing `canon.ts` from app code so weapons, ammo, sources, platforms, mounts, loadouts, and game-facing presentation text all come through one unified access layer.

`Platform_Presentation` is authored in the workbook. Weapon and ammo presentation tables are currently derived from canon facts during export so every item has game-ready display text even before dedicated workbook sheets exist.
