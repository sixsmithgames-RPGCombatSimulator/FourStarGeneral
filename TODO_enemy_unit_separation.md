# Enemy Unit Separation & Architecture Drift Review

## Goal
Preserve strict segregation between player and enemy (bot) data within deployment, battle orchestration, and supporting overlays **while also reconciling recent architectural drift** uncovered during engine and documentation review.

## Action Plan

1. **Engine layering check** ✅
   - `GameEngine` centralizes deployment, supply, combat, and support snapshots (`src/game/GameEngine.ts`); `BattleState` (`src/state/BattleState.ts`) wraps the engine, and `DeploymentState` (`src/state/DeploymentState.ts`) mirrors engine snapshots for UI panels.
   - `BattleScreen` (`src/ui/screens/BattleScreen.ts`) orchestrates rendering and calls `renderEngineUnits()` for both factions while coordinating `DeploymentPanel`, `BattleLoadout`, and `ReserveListPresenter`.
   - **Implementation:** keep deployment panel counts when scenario-only rosters skip precombat (zero committed pool). ✅ fixed by `DeploymentState.mirrorEngineState()` synthesizing totals from engine reserves and placements on 2025-10-24.

2. **Clarify DeploymentState inputs** ✅
   - `DeploymentState.mirrorEngineState()` consumes `engine.getPlayerPlacementsSnapshot()` exclusively, keeping bot placements out of mirrored data.
   - Maintain the player-only contract in comments and extend type metadata when faction data becomes available so assertions can catch regressions early.

3. **Reserve snapshot segregation** ✅
   - `GameEngine.getReserveSnapshot()` clones only the player reserve queue.
   - **Implementation:** keep runtime guards ensuring every entry carries an `allocationKey` sourced via `DeploymentState` and retain placeholder APIs for potential bot reserve exposure.

4. **UI mirror adjustments** ✅
   - `BattleScreen.refreshDeploymentMirrors()` relies on `DeploymentState.mirrorEngineState()` so player-only data feeds loadout/reserve panels.
   - Base camp logic respects faction splits via `deploymentState.getZoneKeyForHex()`.
   - **Implementation:** continue surfacing separate counts when logging map overlays, and flag TODOs for future enemy UI once requirements solidify.

5. **Counting integrity** ✅
   - `placementCounts` derives from player placements and `reserveCountMap` mirrors the player reserve snapshot.
   - **Implementation:** retain faction-aware assertions and metrics logging so future changes do not reintroduce cross-faction contamination.

6. **UI presentation** ✅
   - `BattleLoadout` and `ReserveListPresenter` consume player-only pools/reserves.
   - Continue documenting player-scoped assumptions until dedicated enemy panels are introduced.

7. **Testing plan** ✅
   - Manual regression covers enemy placements vs player flows; future automation remains planned via Playwright/Vitest harnesses.

## Deliverables
- Updated engine documentation clarifying player vs bot storage.
- Guards and filters in state synchronizations preventing bot units from impacting player counts.
- Optional new APIs or data models representing enemy presence for future UI work.
- Regression test cases (manual or automated) validating the separation.

## New Findings & Architectural Gaps (2025-10-24)

- **Support snapshot dead code**
  - `GameEngine.getSupportSnapshot()` invokes `buildSupportSnapshot()` (`src/game/GameEngine.ts`), but the helper was removed in prior refactors. The getter now references missing functionality and must either restore the builder or delegate to an alternative pipeline.
  - **Action:** Reintroduce `buildSupportSnapshot()` or adjust `getSupportSnapshot()` to construct snapshots in-line, ensuring the Support panel receives accurate data.

- **Command DSL & harness not implemented**
  - `GameRulesArchitecture.md` mandates command-based change workflows and a Given/When/Then harness (commands such as `SET_CONST`, `PATCH_FORMULA`, `EDIT_JSON`, `WRITE_TEST`). Existing tests (`tests/baseline.ts`, `tests/precombatAllocs.test.ts`) still use manual registration, meaning the migration plan never landed.
  - **Action:** Draft adoption plan detailing migration steps for current tests and change workflows, including tooling updates needed to enforce the DSL.

- **Layered module expectations unmet**
  - Architecture spec references guardrails (mandatory `WRITE_TEST`, no export renames, “safe checklist” logging) for modules like `src/core/LOS.ts` and `src/core/Supply.ts`. The repo lacks mechanisms enforcing these rules, allowing architectural drift.
  - **Action:** Audit module entry points and introduce linting/build-time checks (or TODO scaffolding) that reflect the documented workflow, preventing future drift.

- **UI contract drift**
  - `GameEngine` exposes a broad mutable API that exceeds the “small testable changes” contract described in `GameRulesArchitecture.md`, indicating further divergence.
  - **Action:** Evaluate which APIs should be internalized or wrapped by `BattleState` to align runtime behavior with documented expectations.

## Potential Duplicates / Unused Code

- **Support snapshot references**
  - Identify and remove or restore legacy helpers connected to `buildSupportSnapshot()` to avoid dead code paths.

- **Clone helper redundancy**
  - `BattleScreen` defines several `clone*` helpers that wrap `deepCloneValue()`. Assess whether shared utilities can replace bespoke wrappers.

- **Scenario normalization overlap**
  - `PrecombatScreen` and `BattleScreen` both normalize scenario data. Consolidate normalization logic if possible to maintain a single authoritative path.

## Recommended Follow-up Actions

- **[Support Pipeline]** Restore or refactor the support snapshot workflow so `GameEngine.getSupportSnapshot()` returns valid data.
- **[DSL Adoption]** Produce a migration roadmap bringing tests and change workflows in line with `GameRulesArchitecture.md` (command DSL + Given/When/Then harness).
- **[Cloning Audit]** Review cloning utilities across screens to consolidate duplicated logic.
- **[Stray Helpers]** Track additional unused helpers introduced in recent edits, ensuring any cleanup keeps explanatory comments per user guidelines.
