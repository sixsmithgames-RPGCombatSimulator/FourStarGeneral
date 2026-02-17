# Four Star General – Engine Integration Overview

## Summary
This project hosts the tactical battle prototype for **Four Star General**. The latest development cycle connected the allocation UI to the `GameEngine`, added persistence stubs, and expanded automated coverage.

## Engine Wiring Workflow
- **Templates to placements**: `src/game/adapters.ts` exports `deploymentTemplates` and helper lookups so allocation choices resolve to engine-ready unit payloads.
- **Scenario normalization**: `normalizeScenarioForEngine()` in `src/main.ts` converts static scenario JSON into `GameEngine`-compatible structures (palette, objectives, sides).
- **Engine lifecycle**: `ensureGameEngineInstance()` boots a singleton `GameEngine`, calls `beginDeployment()`, and refreshes UI mirrors (`refreshDeploymentFromEngine()`, `refreshReserveList()`, `refreshTurnSummary()`).
- **Base camp + reserves**: UI toggles route selection through `gameEngine.setBaseCamp()` and `gameEngine.deployUnit()/recallUnit()`, keeping `deploymentState` as a read-only mirror of engine data.
- **Turn flow**: `finalizeDeploymentWithEngine()` transitions to the player turn, while `endPlayerTurn()` calls `gameEngine.endTurn()` and surfaces supply reports.

## Persistence Hooks
- `GameEngine.serialize()` returns a `SerializedBattleState` snapshot including phase, turn metadata, placements, and reserves.
- `GameEngine.fromSerialized(config, state)` hydrates a new engine instance from saved data.
- Future UI helpers should wrap these calls (e.g., `saveBattleState()` / `resumeBattleState()`) once storage decisions are finalized.

## Manual QA Checklist
1. **Enter deployment**
   - Allocate units, open the battle screen, and confirm the map renders player placements from the engine snapshot.
2. **Assign base camp**
   - Click `Assign Base Camp`, choose a deployment hex, and verify the marker and status text update.
3. **Deploy reserves**
   - Select a reserve formation, click a valid hex, and confirm the unit appears while the reserve list updates.
4. **Finalize deployment**
   - Press `Begin Battle` and ensure the button disables unless every reserve is placed and the base camp is set.
5. **Advance turns**
   - Use `Advance Turn`; confirm turn summary text switches factions and supply warnings display when applicable.
6. **Serialization smoke test**
   - Run `npm test` to execute `ENGINE_SERIALIZATION_ROUND_TRIP`, verifying engine state survives save/load.

## Automated Tests
- Run `npm test` to execute acceptance tests in `tests/baseline.ts`, including:
  - `DEPLOYMENT_BUILD_ENGINE_PLACEMENTS`
  - `ENGINE_INITIALIZE_FROM_ALLOCATIONS_RESETS_RESERVES`
  - `ENGINE_END_TURN_REQUIRES_BASE_CAMP`
  - `ENGINE_SERIALIZATION_ROUND_TRIP`

## Contributing Notes
- Keep comments concise and human-readable per house style.
- When extending engine flows, prefer minimal UI mutations and rely on `GameEngine` snapshots rather than duplicating state.
