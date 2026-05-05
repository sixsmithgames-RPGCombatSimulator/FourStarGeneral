# Precombat Data Module TODO

<!-- STATUS: 🔲 PENDING IMPLEMENTATION - This file contains specific implementation checklist for creating the unit allocation data module. All 7 tasks (DATA-1 through DATA-7) need to be completed to support the precombat allocation UI. -->

## Non-Negotiable Rules
- Developers must **read every existing file referenced in this checklist in full** before editing (`PRECOMBAT_SCREEN_TODO.md`, `src/data/`, any re-export barrels). No guessing or assumptions about structure or prior logic.
- **Preserve the current UI contract**: data changes must not require sweeping UI rewrites. Update only the minimum necessary pieces to supply accurate allocation metadata.
- **Do not rename, relocate, or remove existing exports** unless explicitly stated; additive changes only. Guard against breaking imports used by other modules.
- **Document all additions** with clear comments explaining what the code does and why, following the project's documentation requirement.

- **[DATA-1]** Create `src/data/unitAllocation.ts` exporting a readonly `UnitAllocationOption` interface (key, label, category, costPerUnit, description, maxQuantity, spriteUrl?) based on `PRECOMBAT_SCREEN_TODO.md` requirements. Ensure `category` is a strict union of "units" | "supplies" | "support" | "logistics".
- **[DATA-2]** Populate `allocationOptions: readonly UnitAllocationOption[]` with the combat, supply, support, and logistics entries listed in the TODO document. Preserve numeric values and descriptive text exactly and add any missing placeholder sprite URLs as `undefined` for now.
- **[DATA-3]** Export helper maps: `ALLOCATION_BY_KEY` (Record) and `ALLOCATION_BY_CATEGORY` (Map) to support constant-time lookups by `PrecombatScreen`. Document usage with inline JSDoc.
- **[DATA-4]** Add type guards `isAllocationKey(value: string): value is UnitAllocationOption["key"]` and `getAllocationOption(key)` returning `UnitAllocationOption | undefined` for downstream safety.
- **[DATA-5]** Write unit tests in `tests/precombatAllocs.test.ts` ensuring every option has positive `maxQuantity`, non-negative `costPerUnit`, and categories only use the defined union.
- **[DATA-6]** Update `src/state/DeploymentState.ts` or relevant barrel exports to re-export `UnitAllocationOption` so UI modules can import from a single location without circular dependencies.
- **[DATA-7]** Run `npm test -- precombatAllocs` (or applicable test command) to confirm the new dataset passes linting and tests. Capture resulting fixture JSON for documentation if additional assets are required.
