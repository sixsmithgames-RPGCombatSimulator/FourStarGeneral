# TODO: Hex Selection Feedback Loop

## Objective
Ensure map interactions propagate selected hex information to both `BattleScreen` and `DeploymentPanel`, providing clear UI feedback for base camp assignment and deployment targeting. <!-- STATUS: ✅ Completed 2025-10-25 - Selection propagation and keyboard navigation implemented; panel and map highlights stay in sync. -->

## Non-Negotiable Rules
- **Avoid duplicate state**: Use `BattleScreen` as the single source of truth for `selectedHexKey`; other modules should receive updates via dedicated setters. <!-- STATUS: ✅ Completed - `BattleScreen.handleRendererSelection()` updates `selectedHexKey` and calls `updateSelectionFeedback()`. -->
- **Preserve existing visuals**: Do not remove current SVG highlight logic in `HexMapRenderer`; extend it carefully to avoid regressions. <!-- STATUS: ✅ Completed - `HexMapRenderer.applyHexSelection()`/`toggleSelectionGlow()` used; zone outlines via `setZoneHighlights()`. -->
- **Keep event wiring centralized**: Any new listeners must attach through existing handler factories in `BattleScreen` rather than direct DOM manipulation from components. <!-- STATUS: ✅ Completed - Renderer hooks registered in `initializeBattleMap()`; keyboard in `handleMapNavigation()`. -->
- **Comment interaction flow**: Document how selection propagates across modules so future updates to base-camp logic remain safe. <!-- STATUS: ✅ Completed - Inline comments added in `BattleScreen` update/selection methods. -->

## Dependency Cautions
- **Relies on panel wiring**: Ensure `TODO_deployment_panel_wiring.md` exposes a method like `setSelectedHex()` before implementing cross-module feedback. <!-- STATUS: ✅ Unblocked - `DeploymentPanel.setSelectedHex()` implemented and used. -->
- **Requires battle sync hooks**: Coordinate with `TODO_battle_screen_sync.md` so selection updates flow through the refreshed orchestration logic. <!-- STATUS: ✅ Completed - Selection feedback integrated into the refresh pipeline. -->

## Detailed Spec
- **Hex highlight styling**: Use existing CSS animation classes (e.g., `.deployment-zone`) to pulse selected deployment hexes without obscuring tile sprites; incorporate subtle glow rather than solid overlays. <!-- STATUS: ✅ Completed - Glow via `toggleSelectionGlow()` and `.hex-selection-glow` circle. -->
- **Zone outline cues**: When a zone is active, apply a dashed outline to every eligible hex via `HexMapRenderer` class toggles so the user can read the map terrain underneath. <!-- STATUS: ✅ Completed - `setZoneHighlights()` toggles `.deployment-zone`. -->
- **Panel feedback**: Display the selected hex key, terrain name, and zone label within the deployment panel status area, keeping text concise to avoid clutter. <!-- STATUS: ✅ Completed - `DeploymentPanel.renderDeploymentStatus()` and `composeSelectionMessage()` wired. -->
- **Keyboard navigation**: Provide handlers that let users move selection with arrow keys or WASD while the panel announces the new hex, supporting accessibility and rapid map scanning. <!-- STATUS: ✅ Completed - `BattleScreen.handleMapNavigation()` implements Arrow/WASD navigation. -->
- **Sprite preservation**: Ensure selection effects layer beneath unit sprites so icons remain fully visible during deployment preview. <!-- STATUS: ✅ Completed - Glow inserted before unit images; z-order preserved. -->

## Tasks
- **Trace selection flow** <!-- STATUS: ✅ Completed - Selection handled through renderer callbacks into `handleRendererSelection()` and `updateSelectionFeedback()`. -->
  Review `BattleScreen.handleHexSelection()` and `handleAssignBaseCamp()` to confirm how `selectedHexKey` is stored and consumed.

- **Expose selection state** <!-- STATUS: ✅ Completed - `DeploymentPanel.setSelectedHex()` implemented and used by `BattleScreen`. -->
  Add a setter on `DeploymentPanel` (e.g., `setSelectedHex(key: string | null)`) to surface the active selection and enable UI highlighting.

- **Highlight UI elements** <!-- STATUS: ✅ Completed - `DeploymentPanel.syncZoneHighlight()` and renderer zone outlines kept in sync. -->
  Implement CSS class toggles within `DeploymentPanel` that mark the selected zone/unit when `setSelectedHex()` is called; ensure the SVG hex highlight from `HexMapRenderer` remains in sync.

- **Update status messaging** <!-- STATUS: ✅ Completed - Context prompts implemented in `DeploymentPanel.renderDeploymentStatus()`. -->
  Extend `renderDeploymentStatus()` to show context-sensitive prompts (“Select a hex to assign base camp”) when no selection exists.

- **Handle deselection** <!-- STATUS: ✅ Completed - `BattleScreen.clearSelectedHex()` and renderer callbacks clear selection and prompts. -->
  Make map clicks on already-selected hexes clear the selection and update both the map highlight and deployment panel prompts.

- **Document interaction contract** <!-- STATUS: ✅ Completed - Inline comments added in `BattleScreen` and component methods. -->
  Add comments summarizing the responsibilities of `BattleScreen`, `HexMapRenderer`, and `DeploymentPanel` in the selection workflow for future maintainers.
