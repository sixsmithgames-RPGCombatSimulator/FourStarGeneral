# TODO: BattleScreen Deployment Synchronization

<!-- STATUS: ✅ COMPLETED 2025-10-25 - `BattleScreen.refreshDeploymentMirrors()` orchestrates engine → DeploymentState → UI updates; subscribes to `BattleState` and reseeds mirrors on late allocations. -->

## Objective
Teach `src/ui/screens/BattleScreen.ts` to orchestrate deployment updates across the engine, deployment panel, and reserve UI without relying on legacy globals.

## Non-Negotiable Rules
- **Respect screen ownership**: Avoid mutating DOM outside `BattleScreen`'s scope; coordinate with component classes (`DeploymentPanel`, `BattleLoadout`) instead of querying the DOM directly.
- **Guard engine state**: Never access `battleState.ensureGameEngine()` without confirming initialization to prevent runtime errors during screen swaps.
- **Maintain modular wiring**: Introduce new dependencies through constructor parameters; do not import global singletons or reintroduce shared mutable state.
- **Document event sequences**: When adding handlers, comment on the order of operations (engine update → state mirror → UI refresh) for future maintainers.

## Dependency Cautions
- **Requires state bridge**: Do not start this work until `TODO_deployment_state_engine_bridge.md` delivers the mirroring API used to sync engine data.
- **Depends on panel wiring**: Ensure `TODO_deployment_panel_wiring.md` is complete so `BattleScreen` can invoke concrete `DeploymentPanel` methods without stubs.
- **Feeds reserve/loadout sync**: Coordinate refresh calls with `TODO_reserve_loadout_sync.md` to avoid duplicate or conflicting UI updates.

## Detailed Spec
- **Orchestration hub**: Centralize deployment actions in methods that first call engine APIs, then mirror state, then refresh UI components, maintaining a predictable sequence.
- **Minimal UI disruption**: Keep the map viewport static during updates; instead toggle CSS classes or subtle overlays to indicate active zones without shifting the camera.
- **Base camp workflow**: Provide clear prompts when no base camp is set and auto-scroll the deployment panel to base camp controls using gentle animation rather than modal popups.
- **Sprite propagation**: When rendering units after deployment, ensure `HexMapRenderer.renderUnit()` receives sprite paths from `DeploymentState` so icons match the unit list.
- **Phase toggle cues**: Update toolbar button states and include ARIA-live announcements when entering battle phase so the transition feels polished and accessible.

## Tasks
- **Identify integration points**
  Trace existing button handlers (`handleBeginBattle`, `handleAssignBaseCamp`, `handleEndTurn`) to determine where engine state changes occur. <!-- STATUS: ✅ Completed - Handlers invoke refreshDeploymentMirrors(). -->

- **Inject dependencies**
  Update the constructor to accept instances of `DeploymentPanel`, `BattleLoadout`, and any reserve list presenter so `BattleScreen` can call their `update()`/`render()` methods directly. <!-- STATUS: ✅ Completed - Constructor parameters wired; update methods called in refresh. -->

- **Prime deployment phase**
  During `initialize()`, call `battleState.ensureGameEngine().beginDeployment()` (or similar) and immediately mirror the engine state into `DeploymentState` to prepare UI components. <!-- STATUS: ✅ Completed - `initializeDeploymentMirrors()` primes and mirrors. -->

- **Synchronize on actions**
  After each deployment mutation (deploy/recall/base camp assignment), invoke the new `DeploymentState.mirrorEngineState(...)` helper and refresh `DeploymentPanel`, `BattleLoadout`, and reserves. <!-- STATUS: ✅ Completed - Implemented in `refreshDeploymentMirrors()` with cascade. -->

- **Handle battle start**
  In `handleBeginBattle()`, ensure `updateUIForBattlePhase()` disables deployment controls, triggers a final `DeploymentPanel.update()`, and leaves reserves consistent with the engine’s returned array. <!-- STATUS: ✅ Completed - UI disable and final mirror run in handler. -->

- **Document flow**
  Add comments summarizing the data flow sequence (engine → state → panel) for future maintainers per user documentation preference. <!-- STATUS: ✅ Completed - Orchestration and selection feedback documented. -->
