# TODO: BattleScreen Race Condition Monitoring

<!-- STATUS: 📌 MONITORING - Track and prevent timing issues across BattleScreen renderers, panels, and state mirrors. 2025-10-25 -->

## Objective
Identify and prevent race conditions between `BattleScreen`, `HexMapRenderer`, `DeploymentPanel`, `ReserveListPresenter`, and `DeploymentState` during deployment and early turns.

## Non-Negotiable Rules
- Order of operations: engine → `DeploymentState.mirrorEngineState()` → UI refresh (`DeploymentPanel.update()` → loadout → reserves → sprites).
- Subscribe/unsubscribe: All event listeners must be registered on mount and removed on dispose.
- Idempotence: Refresh routines must tolerate duplicate or out-of-order signals.
- No direct engine mutation from UI components; use `BattleScreen` orchestration only.

## Watchlist Scenarios
- Late precombat allocations arriving after `BattleScreen` mounts.
- Rapid base-camp re-assignment before first mirror completes.
- Deploy/recall spam while `renderEngineUnits()` is executing.
- Toggling panel collapse during deployment updates.
- Begin Battle pressed while a unit is queued but not yet placed.

## Tasks
- Baseline logging: keep structured `console.log` in `refreshDeploymentMirrors()` and bridge methods to trace sequence (temporary; remove before release). [Owner: Dev]
- Verify unsubscribe on dispose for `subscribeToBattleUpdates()` and renderer hooks. [Owner: Dev]
- Add smoke tests in `tests/` for deploy→recall→deploy sequences and late allocation reseed. [Owner: Dev]
- Manual checklist: exercise Watchlist Scenarios on each PR touching battle UI. [Owner: QA]

## Acceptance Criteria
- No lost updates when allocations arrive late; mirrors reseed once and UI stays consistent.
- No duplicate listeners detected on screen re-entry.
- Deploy/recall under spam does not desync counts or sprites.
- Keyboard nav selection remains in-sync with zone highlights after any refresh.
