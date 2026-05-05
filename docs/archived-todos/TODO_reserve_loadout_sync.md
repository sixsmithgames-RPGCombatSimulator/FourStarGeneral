# TODO: Reserve & Loadout Synchronization

## Objective
Tie reserve and loadout UI components to `DeploymentState` and `GameEngine` snapshots so counts remain accurate throughout deployment and battle phases. <!-- STATUS: ✅ Completed 2025-10-25 - `BattleLoadout` and `ReserveListPresenter` refresh from `DeploymentState` via `BattleScreen.refreshDeploymentMirrors()`. -->

## Non-Negotiable Rules
- **Do not mutate global singletons**: Route all data access through injected state/engine instances to keep components testable.
- **Respect component boundaries**: Update `BattleLoadout` and reserve presenters through their public APIs; avoid direct DOM manipulation from `BattleScreen`.
- **Keep counts authoritative**: Treat `DeploymentState` as the source of truth for totals; reconcile with engine snapshots before updating UI.
- **Document refresh triggers**: Comment on each place where loadout/reserve refreshes occur so future changes do not introduce stale UI bugs.

## Dependency Cautions
- **Depends on battle sync**: Wait for `TODO_battle_screen_sync.md` to introduce centralized update hooks before wiring loadout/reserve refreshes. <!-- STATUS: ✅ Completed - Refresh pipeline implemented. -->
- **Requires state bridge data**: Ensure `TODO_deployment_state_engine_bridge.md` exposes accessors for reserves and placements prior to binding UI counts. <!-- STATUS: ✅ Completed - Accessors available (`getReserves()`, `getPlacement()`, zone helpers). -->

## Detailed Spec
- **Compact roster layout**: Render loadout entries with sprite thumbnail, unit label, and deployed vs. allocated counts, limiting text width so the sidebar remains tidy.
- **Reserve queue clarity**: Display reserves in priority order with sprite icons and indicate whether each unit is eligible for deployment; include subtle badges for exhausted entries.
- **Responsive updates**: When a unit deploys or recycles to reserves, animate the corresponding list item briefly to highlight change without obscuring the map.
- **Sprite consistency**: Use the same sprite URL scheme as `HexMapRenderer` to ensure unit icons match between the lists and the map.
- **Accessibility hints**: Provide ARIA labels describing reserve status and deployment counts for screen readers, reinforcing the elegant, informative presentation.

## Tasks
- **Assess current UI hooks**
  Inspect `src/ui/components/BattleLoadout.ts` and any reserve list presenter to catalog methods requiring live data (e.g., `render()`, `refresh()`). <!-- STATUS: ✅ Completed - APIs audited; components render from `DeploymentState`. -->

- **Define data adapters**
  Decide whether `DeploymentState` will expose a derived reserve list or if `BattleScreen` should pass the engine’s `reserveUnits` snapshot directly into `BattleLoadout`. <!-- STATUS: ✅ Completed - Using `DeploymentState.pool` and `getReserves()` mirrors. -->

- **Implement data binding**
  Update `BattleLoadout.render()` to iterate over real counts from `DeploymentState` or injected data, replacing TODO comments with actual statistics (total allocated vs. deployed). <!-- STATUS: ✅ Completed - Uses `getUnitCount()` and pool snapshots. -->

- **Sync on engine events**
  Ensure every deployment/reserve action triggers a central update routine (likely in `BattleScreen`) that refreshes both the loadout list and reserve list DOM. <!-- STATUS: ✅ Completed - `refreshDeploymentMirrors()` calls `updateLoadout()` and `updateReserveList()`. -->

- **Handle battle phase transition**
  When `handleBeginBattle()` finalizes deployment, persist the remaining reserves and ensure `BattleLoadout` reflects the transition (e.g., mark reserves as locked in). <!-- STATUS: ✅ Completed - Presenters expose `markBattlePhaseStarted()`. -->

- **Add documentation**
  Write inline comments outlining the data flow, clarifying which module is responsible for initiating refreshes to comply with user documentation preferences. <!-- STATUS: ✅ Completed - Comments present in components and `BattleScreen`. -->
