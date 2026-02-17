# Battle Sidebar Plan – Support Panel

<!-- STATUS: 📋 PLANNING - This file contains the design plan for implementing the Support panel in the battle screen sidebar. This is a planned feature that has not yet been implemented. It provides specifications for combat support capabilities including artillery, air sorties, engineering, and medical teams. -->

## Purpose
- **Mission** Surface combat support capabilities (artillery, air sorties, engineering detachments, medical teams) so commanders can schedule, allocate, and track cooldowns without digging through multiple screens.

## Current State
- **UI** No dedicated support popup; sidebar button likely exists but lacks content wiring.
- **Engine** Support actions are not explicitly modeled—`GameEngine` exposes movement/attack only. Support effects (e.g., artillery strikes, air recon) remain on the roadmap.
- **Data** `DeploymentState` tracks reserve units but not specialized support assets or cooldown timers.

## Target Experience
- **Capability Board** Cards per support asset showing availability, charges, cooldown, assigned sector.
- **Scheduling Workflow** Button to queue actions (e.g., “Call artillery on hex”). Could integrate with future action planner.
- **Cooldown Tracker** Timeline or turn counter for each asset.
- **Notifications** Alerts for expiring support or assets requiring logistics resupply.

## Data Requirements
- **Support Registry** Create `SupportAsset` model: id, type, charges, cooldown, hex assignment, prerequisites.
- **Engine API** Add `GameEngine.getSupportAssets()` and mutation hooks (`commitSupportAction`, `refreshSupportCooldowns`).
- **State Sync** Mirror support arrays into `battleState` for UI consumption; ensure persistence in save games.
- **Action Resolution** Define effect handlers (e.g., artillery deals damage, engineers build fortifications) and integrate with combat resolution where appropriate.

## UI Implementation Tasks
1. **Registry Entry** Add `support` entry to `popupContentRegistry` with structure for active/queued/maintenance sections.
2. **Rendering Helper** Implement `renderSupportPanel()` within `PopupManager` to build cards from support snapshot.
3. **Interaction Controls** Provide `Deploy`, `Recall`, and `Queue Action` buttons. Use dialog or inline forms for targeting.
4. **Styling** Create `.support-panel` styles with grid layout for capability cards and status badges consistent with battle UI.
5. **Iconography** Source or design icons for artillery, air, engineering, medical to replace placeholder glyphs.

## Logic & Wiring Tasks
- **Snapshot Provider** Extend `GameEngine` with a `getSupportSnapshot()` returning arrays by readiness category.
- **Command Hooks** Expose support commands that trigger engine-side resolution, update cooldowns, and publish events to `battleState`.
- **Event Bus** Fire events (`support:queued`, `support:executed`, `support:cooldownUpdated`) so UI can refresh in real time.
- **Validation** Prevent overlapping usage (e.g., same asset called twice in one turn) using engine guard logic.

## Testing Strategy
- **Unit Tests** Validate cooldown decrement logic and queue handling within engine support helpers.
- **Integration Tests** Simulate calling support actions from UI, ensure effects propagate (damage, terrain changes) and UI refreshes accordingly.
- **UX Tests** Conduct accessibility audit on focus management and ARIA announcements for support availability changes.

## Documentation & Comments
- **Inline Comments** Document how support actions modify combat state and how cooldowns are computed, per user preference for human-readable comments.
- **Design Docs** Add section to `GameRulesArchitecture.md` or new `SupportCapabilities.md` describing asset types and balance levers.

## Open Questions
- **Support Types** Confirm initial asset roster (artillery, air, engineers, medics) and scope creep for future assets.
- **Resource Cost** Determine whether support consumes supplies/logistics metrics directly.
- **Multiplayer/AI** Decide if AI uses same interface or receives scripted advantages.
