# TODO: DeploymentState ↔ GameEngine Bridge

<!-- STATUS: ✅ COMPLETED 2025-10-25 - Mirroring APIs implemented in `DeploymentState.mirrorEngineState()`, placements/reserves accessors available; BattleScreen sync consuming them. -->

## Objective
Extend `src/state/DeploymentState.ts` to capture per-hex placements and synchronize snapshots from `GameEngine` without leaking engine internals.

## Non-Negotiable Rules
- **Coordinate with engine owners**: Review `GameEngine` and `BattleState` before adding new hooks to prevent API drift. <!-- STATUS: ✅ Completed 2025-10-25 - Bridge aligns with `GameEngineAPI` and `BattleState` usage. -->
- **Keep state immutable outwardly**: Expose read-only views; never leak mutable references to internal maps when wiring UI. <!-- STATUS: ✅ Completed 2025-10-25 - Read models returned as snapshots; internal maps not leaked. -->
- **No UI edits here**: Restrict changes to state-level code; if UI adjustments are required, document them as follow-ups instead of modifying templates. <!-- STATUS: ✅ Completed 2025-10-25 - Bridge shipped without UI edits. -->
- **Comment synchronization flow**: Every new method must explain when callers should invoke it and the rationale behind copying engine state. <!-- STATUS: ✅ Completed 2025-10-25 - Methods documented per user preference. -->

## Dependency Cautions
- **Depends on UI wiring**: Align new accessors with selectors introduced in `TODO_deployment_panel_wiring.md`; update that TODO if method names change. <!-- STATUS: ✅ Completed 2025-10-25 - Panel wiring updated and aligned. -->
- **Prerequisite for battle sync**: Complete this bridge before implementing `TODO_battle_screen_sync.md` so `BattleScreen` can rely on stable state mirroring APIs. <!-- STATUS: ✅ Completed 2025-10-25 - BattleScreen now calls `mirrorEngineState()` in a single refresh pipeline. -->

## Detailed Spec
- **Placement mirror shape**: Maintain a `Map<string, { unitKey: string; sprite?: string; faction: "Player" | "Bot" }>` so UI layers can render sprites and faction styling without additional lookups.
- **Reserve snapshot schema**: Provide an array of `{ unitKey, label, sprite?, remaining }` that matches `BattleLoadout` expectations and keeps reserve counts aligned with engine data.
- **Zone occupancy metrics**: Expose helper methods that compute remaining hex capacity per deployment zone to support uncluttered status messaging in `DeploymentPanel`.
- **Sprite path normalization**: When copying engine units, carry through any sprite references (`unit.icon`, `definition.sprite`) so renderers can display appropriate assets.
- **Performance guardrails**: Ensure mirroring runs in O(n) relative to unit counts and avoids reallocating large structures unnecessarily, keeping deployment interactions responsive.

## Recommended Implementation Notes
- **Bridge read models** Document read-only accessors on `DeploymentState` (e.g., `getPlacements()`, `getReserves()`) that return frozen copies so UI consumers never mutate internal maps.
- **Engine mirror timing** Invoke a dedicated `mirrorEngineState(engine: GameEngineAPI)` immediately after `GameEngine.deployUnit()`, `recallUnit()`, or `finalizeDeployment()` to keep state synchronized without leaking engine references.
- **Sprite cache strategy** Reuse `DeploymentState.registerSprite()` data while enriching placement/reserve snapshots with fallback sprite URLs from allocation metadata when the engine omits them.
- **Zone capacity helpers** Add methods like `getRemainingZoneCapacity(zoneKey)` that derive usage from mirrored placements, supporting future wiring in `DeploymentPanel` without touching UI templates.
- **Mutation cohesion** Teach `setPlacement()` and `clearPlacement()` to update aggregate counts (including reserve mirrors) so local interactions stay consistent even before the next engine sync.
- **Snapshot resiliency** Handle empty arrays from `getPlayerPlacementsSnapshot()` and `getReserveSnapshot()` by clearing mirrors without leaving stale entries, preventing mismatched UI states.
- **Test scaffolding** Outline Vitest cases ensuring `mirrorEngineState()` clones data in O(n) time and respects immutability, giving QA a baseline before `TODO_battle_screen_sync.md` lands.

## Tasks
- **Map out data requirements** <!-- STATUS: ✅ Completed 2025-10-25 - Engine snapshot audit performed and shapes consumed. -->
  Analyze engine methods (`GameEngine.getPlayerPlacementsSnapshot()`, `getReserveSnapshot()`) and identify the minimal placement/reserve fields the UI consumes.

- **Add placement accessors** <!-- STATUS: ✅ Completed 2025-10-25 - `getPlacement()`, `getReserves()`, and zone helpers available. -->
  Introduce getters on `DeploymentState` that expose `placements` and `reserves` (new structure) as read-only collections for UI consumers.

- **Implement sync method** <!-- STATUS: ✅ Completed 2025-10-25 - `mirrorEngineState(engine)` copies placements, reserves, and base camp key. -->
  Create a method like `mirrorEngineState(engine: GameEngineAPI)` that copies placements/reserves/base camp data into `DeploymentState` while preserving immutability.

- **Handle placement mutations** <!-- STATUS: ✅ Completed 2025-10-25 - Local `setPlacement`/`clearPlacement` update aggregates to keep counts consistent between refreshes. -->
  Ensure `setPlacement()` / `clearPlacement()` also update any new aggregate maps (e.g., reserve counts) so counts remain accurate across the panel and loadout.

- **Write inline documentation** <!-- STATUS: ✅ Completed 2025-10-25 - Methods documented with human-readable comments. -->
  Add descriptive comments for new methods detailing when they should be called (pre/post deployment actions) per user preference for clear explanations.

- **Plan unit tests (optional)** <!-- STATUS: 🟡 Partially Completed 2025-10-25 - Harness exists; add Vitest specs in a follow-up. -->
  Outline Jest/Vitest test cases validating that `mirrorEngineState` produces consistent snapshots even when the engine returns empty arrays.
