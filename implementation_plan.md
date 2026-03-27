## Deployment Panel Reserve Guard Plan

### Intended behavior
- A deployment click should consume a reserve at most once.
- If the UI is stale and a requested reserve no longer exists in the live engine queue, the battle screen must refresh from engine truth and provide a clear, actionable message instead of throwing an opaque engine error.

### Current behavior
- `BattleScreen` forwards deployment panel clicks directly to `engine.deployUnitByKey(...)`.
- When the same deployment request is processed after the reserve was already consumed, `GameEngine.findReserveIndexByUnitKey(...)` throws and the user receives a generic deployment failure.
- `BattleScreen.bindPanelEvents()` does not guard against repeated binding, which increases the risk of duplicate deploy handling if the screen is rebound in future flows.

### Expected new behavior
- `BattleScreen` performs a live reserve preflight before issuing a deployment command.
- If the target hex is already occupied by the just-placed unit and the reserve is gone, the second event is treated as a duplicate and ignored after a mirror refresh.
- If the reserve is genuinely absent, the user receives a structured deployment-panel error that explains what was attempted, what went wrong, and what to do next.
- Panel event binding is idempotent.

### Edge cases
- Duplicate deploy events for the same hex and unit key.
- Stale UI state where the panel still advertises a reserve that the engine has already consumed.
- Mixed reserve queues where the requested unit key must still be matched through scenario-type aliasing.

### Impact analysis
- Systems consuming this output:
  - `DeploymentPanel` event stream into `BattleScreen`
  - `DeploymentState` mirror refresh flow
  - `GameEngine.deployUnitByKey(...)`
- Events depending on this structure:
  - Deployment panel `deploy` events
  - `battleState.emitBattleUpdate("deploymentUpdated")`
- Visual behaviors that could shift:
  - Deployment failures should now refresh the panel back to live reserve counts before presenting an error.
  - Duplicate deploy clicks should no longer surface a false-negative panel error after a successful placement.

### Verification
- Add a focused regression test in `tests/BattleScreen.missionFlow.test.ts` covering duplicate/stale deploy handling.
- Run `npm run build`.
- Run the focused battle-screen test harness.
