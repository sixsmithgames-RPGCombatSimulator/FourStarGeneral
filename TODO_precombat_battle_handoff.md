# TODO: Precombat → Battle Handoff Hardening

<!-- STATUS: 🔲 PENDING IMPLEMENTATION - Deployment allocations and engine seeding must become deterministic across screen transitions. -->

## Objective
Guarantee that commander-approved allocations, base camp intent, and deployment mirrors remain consistent when transitioning from `PrecombatScreen` to `BattleScreen`, eliminating timing windows that surface empty reserves or stale UI snapshots.

## Non-Negotiable Rules
- Treat `DeploymentState` as the single source of truth; do not rebuild allocations from UI DOM.
- Avoid race-prone asynchronous waits (`setTimeout`, `requestAnimationFrame`) for critical handoff logic.
- Keep engine mutations centralized inside `BattleScreen` or dedicated state helpers.
- Preserve commander actions (assignments, pre-deployments) when rehydrating the engine.

## Known Gaps
- `BattleScreen.initialize()` primes mirrors before precombat commits arrive, briefly rendering empty rosters.
- `handleBeginBattle()` relies on prior seeding and can finalize deployment while reserves are empty if allocations show up late.
- Base camp selection can be cleared when reserves are reseeded without explicitly restoring the chosen hex.

## Tasks
- **Design deterministic handoff contract** ✅
  Document exact sequencing for `PrecombatScreen.handleProceedToBattle()`, `BattleState.setPendingDeployment()`, and `BattleScreen.initialize()`. *Observation:* `DeploymentPanel.renderDeploymentUnits()` intentionally hides the roster until `markBaseCampAssigned()` runs, so panel availability is dependent on base camp selection rather than missing allocations.
- **Add integrity assertions** ✅ 2025-10-26
  `BattleScreen.handleBeginBattle()` now calls `assertBattleReady()` which throws descriptive errors when allocations are missing, the base camp is unset, or reserves failed to seed, preventing silent desyncs.
- **Enforce synchronous seeding**
  Replace rAF-based waits with engine-side readiness checks and immediate mirrors.
- **Update diagnostics**
  Expand console diagnostics / telemetry around deployment seeding to prove invariants hold during QA runs.
- **QA checklist**
  Build manual verification covering: zero allocations, late allocations, resume flows, and cross-screen back/forward navigation.

## Handoff Contract (Draft)
- **Precombat snapshot**: `PrecombatScreen.handleProceedToBattle()` must call `deploymentState.recordCommittedEntries()` → `deploymentState.initialize()` → `BattleState.setPendingDeployment()` before changing screens, guaranteeing the commander-approved roster is stored in `DeploymentState` and mirrored into `BattleState`.
- **Engine staging**: `BattleState.initializeEngine()` must run prior to showing `BattleScreen`. When the screen mounts, `BattleScreen.prepareBattleState()` verifies committed entries exist and reseeds the engine synchronously via `seedEngineFromDeploymentState()` when reserves are empty.
- **Mirror sync**: After seeding, `BattleScreen.initialize()` invokes `initializeDeploymentMirrors()` so `DeploymentState.mirrorEngineState()` becomes the authoritative snapshot for UI renderers.
- **Begin Battle lock**: `prepareBattleState()` also runs immediately before `finalizeDeployment()`, ensuring allocations and base camp are present before the engine transitions into combat.
- **Failure path**: If any stage lacks committed entries or seeding fails, `prepareBattleState()` raises a descriptive error instructing the commander to return to precombat rather than presenting an empty roster.

## Acceptance Criteria
- No UI render path shows empty reserves after `setPendingDeployment()` executes.
- `handleBeginBattle()` reseeds the engine deterministically or throws a descriptive error before finalization.
- Base camp selection persists across any reseeding required during battle start.
- Logs confirm a single engine seeding per transition, with clear success/failure states.
