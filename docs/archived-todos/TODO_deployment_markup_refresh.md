# TODO: Deployment Panel Markup Refresh

<!-- STATUS: ✅ COMPLETED 2025-10-25 - `index.html` includes refreshed hooks: `#deploymentPanel`, `#deploymentStatus`, `#baseCampStatus`, `#deploymentZoneSummary`, `#deploymentZoneList`, `#deploymentUnitList`, `#battleLoadoutList`, and `#reserveList`. -->

## Objective
Align the `#deploymentPanel` HTML scaffold in `index.html` with the modular deployment workflow so UI components receive the hooks they expect.

## Non-Negotiable Rules
- **Review dependent assets first**: Inspect `index.html`, any linked partials, and shared CSS modules (`src/styles/`) before editing so selector changes do not break unrelated screens.
- **Preserve integration contracts**: Maintain IDs and data attributes consumed by `DeploymentPanel`, `BattleScreen`, and sidebar controls unless a matching update plan exists in their TODOs.
- **Avoid script edits**: Do not touch TypeScript files while executing this checklist—focus solely on markup and document any scripting follow-ups separately.
- **Annotate structural changes**: Add concise HTML comments when elements move or rename so downstream tasks understand rationale without reopening commit history.

## Dependency Cautions
- **Unblock state wiring first**: Complete this markup refresh before pursuing `TODO_deployment_panel_wiring.md` so component logic can rely on finalized selectors and element structure.
- **Coordinate with selection feedback**: Preserve `#baseCampStatus` and related hooks expected by `TODO_hex_selection_feedback.md`; note any renames in that file's task list if unavoidable.

## Detailed Spec
- **Two-column layout**: Keep the battle map width-dominant on desktop (minimum 70% viewport width) with the deployment panel as a slim overlay or side drawer so the map remains fully visible.
- **Collapsible panel**: Introduce markup hooks for a collapse/expand control that lets players hide the panel while inspecting the map; ensure ARIA attributes for accessibility.
- **Zone spotlight region**: Reserve a dedicated element for deployment zone summaries that can render concise labels without pushing the map downward; support max height with internal scroll.
- **Sprite-ready slots**: Provide `data-sprite` placeholders within unit list items so `DeploymentPanel` can inject unit icons using existing sprite assets without additional markup edits later.
- **Mobile responsiveness**: Add container classes that allow the panel to dock below the map on narrow screens while keeping zone highlights readable.

## Tasks
- **Audit current markup**
  Review `index.html` and note every legacy element (`#deploymentZoneList`, `#deploymentUnitList`, static status paragraphs) that no longer receives data. <!-- STATUS: ✅ Completed - IDs present and wired. -->

- **Define data-driven structure**
  Sketch an updated subtree for `#deploymentPanel` that exposes slots/data attributes required by `DeploymentPanel` and reserve UI modules (e.g., container for dynamic zone cards, button groups for phase controls). <!-- STATUS: ✅ Completed - Structure implemented with `deployment-panel-body`, lists, and headers. -->

- **Draft HTML revisions**
  Update `index.html` with the new markup while preserving semantic headings and existing CSS hooks or providing replacements documented in-line. <!-- STATUS: ✅ Completed - Markup present and referenced by components. -->

- **Validate styles**
  Run Vite dev build to confirm existing stylesheet rules still target the refreshed markup or adjust selectors (in `src/styles/` if present) to maintain layout fidelity. <!-- STATUS: ✅ Completed - Visual integration verified. -->

- **Document migration notes**
  Capture any renamed IDs/classes in a short comment near the markup or in `README_MODULARIZATION.md` so downstream tasks know which selectors changed. <!-- STATUS: ✅ Completed - IDs documented in this header. -->
