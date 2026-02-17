# Battle Sidebar Plan – War Room (HQ) Overlay

<!-- STATUS: 📋 PLANNING - This file contains the design plan for implementing the War Room (HQ) overlay in the battle screen sidebar. This is a planned feature that has not yet been implemented. It provides specifications for interactive HQ map with hotspots, detail panels, and live data integration. -->

## Purpose
- **Mission** Restore the immersive HQ experience with the interactive war room graphic, providing campaign-level intelligence, logistics, and command directives in a modal overlay.

## Current State
- **Overlay Component** `src/ui/components/WarRoomOverlay.ts` exists with hotspot definitions and sample data.
- **Activation** Popup wiring now routes through `PopupManager` with a shared `WarRoomOverlay` instance created in `src/main.ts`.
- **Assets** Hotspot layout expects `.war-room-hotspot-layer` and supporting CSS (present in legacy HTML).
- **Data Feed** `BattleWarRoomDataProvider` hydrates overlays from `BattleState` and publishes refresh events when the engine advances or deployment changes.
- **Gaps** Future iterations should convert the placeholder action buttons inside `WarRoomOverlay.buildDetailBody()` into real command hooks and add automated tests for provider subscriptions.

## Target Experience
- **Interactive Map** HQ map with clickable hotspots (intel, recon, logistics, etc.) surfacing detail panel with live data.
- **Announcements** Screen-reader friendly messages on hotspot focus/activation.
- **Customization** Ability to theme overlay per scenario (different map assets, hotspot sets).
- **Command Actions** Buttons within detail panel to launch contextual operations (e.g., queue supply drop, approve directive).

## Data Requirements
- **War Room DTO** Replace `createSampleWarRoomData()` with state-driven provider (e.g., `getWarRoomSnapshot()` sourcing:
  - Intel briefs from recon/intel modules.
  - Supply summaries from logistics/supplies snapshots.
  - Command directives from campaign scripting.
- **Hotspot Definitions** Expand `warRoomHotspotDefinitions` to support scenario overrides, tooltip text, status strings.
- **Event Stream** Introduce event emitter so overlay refreshes when underlying data changes while open.

## UI Implementation Tasks
1. **Overlay Template** Ensure DOM scaffolding from index.html is present in React/Vite app (if not, port markup/CSS).
2. **Hotspot Rendering** Verify `WarRoomOverlay.renderHotspots()` loads scenario-specific definitions; support dynamic repositioning.
3. **Detail Panel** Enhance `buildDetailBody()` to render richer content (tables, charts) and action buttons.
4. **Accessibility** Confirm ARIA roles: overlay uses `dialog`, hotspots have `aria-label`/`aria-describedby`, detail panel updates focus appropriately.
5. **Theming** Implement CSS variables or data attributes for scenario skins (background image, color palette).

## Logic & Wiring Tasks
- **State Injection** ✅ `WarRoomOverlay` now consumes the injected `WarRoomDataProvider` and exposes richer detail rendering aligned with the plan.
- **BattleState Bridge** ✅ Overlay instance is created in `src/main.ts`, passed into `PopupManager`, and the sidebar HQ button uses that shared instance.
- **Data Refresh** ✅ Provider listens to `BattleState` notifications; overlay re-renders active hotspots when data changes.
- **Action Handlers** When user clicks command buttons inside detail panel, dispatch to engine or state modules (e.g., approve directive triggers new tasks).

## Testing Strategy
- **Unit Tests** Validate `WarRoomOverlay` builds hotspots correctly and handles data provider outputs.
- **Integration Tests** Simulate data changes while overlay open to ensure UI refreshes without closing.
- **Accessibility Testing** Use axe or manual SR testing for focus management and announcements.

## Documentation & Comments
- **Inline Comments** Document data provider responsibilities and how hotspots map to `WarRoomDataKey` entries.
- **Design Notes** Update or author `WarRoomExperience.md` explaining architecture, theming hooks, and integration points.

## Open Questions
- **Scenario Overrides** How should scenario authors define custom hotspots? JSON schema vs. TypeScript config.
- **Performance** Large data payloads for campaign detail may require pagination or lazy loading.
- **Security/Multiplayer** If remote players observe different data, overlay must respect permissions.
