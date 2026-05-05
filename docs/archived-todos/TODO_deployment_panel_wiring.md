# TODO: DeploymentPanel State Wiring

<!-- STATUS: ✅ COMPLETED 2025-10-25 - DeploymentPanel now wired to DeploymentState; monitor for additional BattleScreen race conditions in related components. -->

## Objective
Replace placeholder rendering in `src/ui/components/DeploymentPanel.ts` with live data from `DeploymentState` and prepared placement collections.

## Non-Negotiable Rules
- **Trace dependencies before edits**: Review `DeploymentState`, `BattleScreen`, and any mediator modules to avoid duplicating logic or breaking their assumptions.
- **Preserve existing selectors**: Keep element IDs/classes referenced by CSS or other components; introduce new hooks via data attributes rather than renaming.
- **No engine mutations here**: Limit changes to UI rendering and event wiring—any engine-side updates must be coordinated through a separate task.
- **Document helper contracts**: Every new method should include comments summarizing inputs, outputs, and side effects to align with project documentation standards.

## Dependency Cautions
- **Requires finalized markup**: Execute `TODO_deployment_markup_refresh.md` first to ensure DOM structure matches the wiring logic.
- **Feeds state/engine bridge**: Coordinate with `TODO_deployment_state_engine_bridge.md` so new UI hooks align with whatever data mirror utilities that task introduces.

## Detailed Spec
- **Concise unit cards**: Render each deployment option as a compact row with sprite thumbnail, unit name, and remaining count; keep row height ≤72px so lists stay scannable.
- **Deployment zone clarity**: Surface the active zone name and remaining hex capacity near the status banner, updating as the user swaps zones.
- **Sprite injection**: Use `option.sprite` or engine-provided asset paths to populate `<img>` tags created during rendering; fall back to initials when sprites are missing.
- **Map-preserving interactions**: Avoid forcing map scroll or overlay; selection changes should update zone cues and status text without shifting focus away from the battlefield.
- **Accessibility copy**: Include visually-hidden text describing actions (e.g., "Deploy Infantry Squad to highlighted hex") so keyboard users understand the workflow.

## Tasks
- **Review state contract**
  Inspect `DeploymentState` to confirm availability of `pool`, `placements`, and helper methods like `getTotalDeployed()`.

- **Design render helpers**
  Plan methods that transform `DeploymentPoolEntry` data into HTML (e.g., `renderZoneCard`, `renderUnitRow`) and determine necessary data attributes for click handling.

- **Implement status binding** <!-- STATUS: ✅ Completed 2025-10-24 - Status banner now reflects deployment totals, remaining reserves, and base camp context via live DeploymentState metrics. -->
  Update `renderDeploymentStatus()` to compute deployed vs. total counts using `DeploymentState` and reflect base camp status if provided.

- **Populate zone list**
  Wire `renderDeploymentZones()` to scenario-derived zones (stubbed via new adapter or placeholder call) and ensure each `<li>` registers data attributes consumed by click events.

- **Populate unit list** <!-- STATUS: ✅ Completed 2025-10-24 - `renderDeploymentUnits()` now hydrates rows using DeploymentState data with sprites and accessibility copy. -->
  Replace mock entries in `renderDeploymentUnits()` with entries generated from `DeploymentState.pool`, showing remaining counts and disabled states when exhausted.

- **Hook update lifecycle**
  Ensure `update()` re-invokes status and unit renders and clears selection highlights when the deployment selection changes.

- **Add inline docs**
  Document key helper methods with comments describing expected inputs/outputs per user preference for readable comments.
