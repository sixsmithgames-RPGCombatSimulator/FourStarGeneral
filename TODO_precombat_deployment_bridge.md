# Precombat Deployment Bridge TODO

<!-- STATUS: 🔲 PENDING IMPLEMENTATION - This file contains detailed requirements for bridging precombat allocations to deployment state. Contains 8 actionable tasks (DEPLOY-1 through DEPLOY-8) and 5 task breakdowns that need completion. -->

## Non-Negotiable Rules
- **Review all dependent modules** (`PrecombatScreen.ts`, `DeploymentState.ts`, `BattleState.ts`, battle screen entry points) before coding. No assumptions about data flow.
- **Keep navigation semantics intact**: the transition order between landing → precombat → battle must remain unchanged unless specifically instructed.
- **Avoid touching battle UI files** beyond necessary hook invocations; this checklist focuses on data handoff only.
- **Annotate new orchestration logic** with comments describing the data pipeline and reasoning.

## Groundwork Spec
- **[Scope Alignment]** Derive final UI requirements by cross-referencing `TODO_precombat_ui_rendering.md`, `TODO_precombat_interaction.md`, and `TODO_precombat_budget_validation.md`; enumerate prerequisite elements (DOM IDs, budget panel fields, warning modal controls) that the deployment bridge depends on. Capture open gaps (e.g., missing `#allocationFeedback`) and flag follow-up tasks if markup changes are needed.
- **[State Contract]** Confirm allocation state shape exported by `PrecombatScreen` (maps vs. arrays, dirty flags, budget caches). Document the contract in-line so future interaction modules can reuse it without re-reading the full file.
- **[Engine Touchpoints]** Inventory the methods on `DeploymentState`, `BattleState`, and `GameEngine` that the bridge must call. Identify missing hooks (e.g., `BattleScreen.initializeWithDeployment`) and decide whether to stub TODOs or deliver implementations.
- **[Testing Strategy]** Decide on automated coverage (e.g., new test file in `tests/`) for allocation hand-off plus manual smoke steps. Explicitly note required mocks or data fixtures so the work can start without further research.
- **[Documentation Targets]** Choose where to record the final data flow (existing `GameRulesArchitecture.md` vs. a new doc) and outline the sections to add once implementation lands.

## Actionable Tasks
- **[DEPLOY-1]** Import `ensureDeploymentState()` and `DeploymentPoolEntry` into `PrecombatScreen` so the precombat allocations can seed the deployment subsystem without referencing battle UI directly.
- **[DEPLOY-2]** Build `toDeploymentEntries(): DeploymentPoolEntry[]` that converts non-zero `allocationCounts` into entries with `remaining` and `label` sourced from `UnitAllocationOption` data.
- **[DEPLOY-3]** Within `handleProceedToBattle()` (post-validation), call `const deploymentState = ensureDeploymentState(); deploymentState.initialize(entries);` followed by `entries.forEach((entry) => deploymentState.setTotalAllocatedUnits(entry.key, entry.remaining));`.
- **[DEPLOY-4]** Persist allocation summary to `BattleState` (or a new `PrecombatAllocationState`) so the battle screen can display a loadout summary; include total spend, remaining funds, and timestamp of commitment.
- **[DEPLOY-5]** Clear any prior deployment markers by invoking `deploymentState.reset()` when the player cancels out of precombat via `handleReturnToLanding()`.
- **[DEPLOY-6]** Ensure navigation transitions: after `deploymentState.initialize`, call `this.screenManager.showScreenById("battle");` and trigger any required `battleScreen.initializeWithDeployment()` hook if present (add TODO comment if hook does not exist yet).
- **[DEPLOY-7]** Add integration smoke test (manual or automated) verifying that allocating a unit in precombat results in highlighted deployment zones once the battle screen loads.
- **[DEPLOY-8]** Update documentation (`GameRulesArchitecture.md` or new section) describing the data flow from precombat allocations into deployment.

## Task Breakdown & Acceptance Criteria
- **[Task-01] Dependency Audit (1 dev)**
  - Read `PrecombatScreen.ts`, `DeploymentState.ts`, `BattleScreen.ts`, and `GameEngine.ts` entry points.
  - Produce a short checklist of required DOM IDs (`#proceedToBattle`, `#allocationWarningOverlay`, etc.) and confirm they exist in `index.html`.
  - Acceptance: A markdown note inside this file referencing any missing elements and the follow-up ticket needed to add them.
- **[Task-02] Allocation State Plumbing (1 dev)**
  - Implement `primeAllocationState()`, `toDeploymentEntries()`, and wire `handleReturnToLanding()` resets.
  - Ensure every new method or branch includes a code comment summarizing purpose and rationale, per user guidelines.
  - Acceptance: Unit tests or console assertions showing `allocationCounts` mirrors the rendered UI after increments/decrements.
- **[Task-03] DeploymentState Integration (1 dev)**
  - Invoke `ensureDeploymentState()` during proceed/return flows and populate totals using `setTotalAllocatedUnits()`.
  - Add TODO markers or stub functions in `BattleScreen` if additional initialization hooks are required, without breaking existing flow.
  - Acceptance: After calling proceed, `DeploymentState.pool` matches the allocation summary; cancelling wipes the pool.
- **[Task-04] BattleState Summary Storage (1 dev)**
  - Add a `setPrecombatSummary()` (or similar) on `BattleState` capturing spend/remaining/timestamp and any optional notes.
  - Update `BattleScreen` (or future UI) to read the summary; include a TODO if rendering is deferred.
  - Acceptance: Serialized battle state includes the new summary block.
- **[Task-05] Verification & Docs (1 dev)**
  - Add automated tests under `tests/` to cover zero allocation, single allocation, and reset scenarios.
  - Draft the documentation update outline (section headings + bullet points) describing the data pipeline from allocation to deployment.
  - Acceptance: Tests pass locally and doc outline lives either in this file or an explicitly linked doc.
