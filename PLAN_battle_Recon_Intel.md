# Battle Sidebar Plan – Recon & Intel Panel

<!-- STATUS: 📋 PLANNING - This file contains the design plan for implementing the combined Recon & Intel panel in the battle screen sidebar. This is a planned feature that has not yet been implemented. It provides specifications for unified layout, filtering, and cross-linking between recon and intelligence data. -->

## Purpose
- **Mission** Combine reconnaissance feeds and intelligence briefs into a unified operating picture, highlighting enemy dispositions, terrain shifts, and strategic insights.

## Current State
- **Data Sources**
  - `src/data/reconContent.ts` provides `reconContentEntries` consumed by `PopupManager.renderReconPopupContent()`.
  - `popupContentRegistry` has separate `recon` and `intelligence` entries with generic placeholders.
- **UI Flow** `PopupManager.openPopup("recon")` renders recon content; intelligence popup uses fallback stub.
- **UX Gap** Recon and intel are fragmented, lacking correlation between scouting data and analytical assessments.

## Target Experience
- **Unified Layout** Two-column view:
  - Left: Recon map overlays, terrain notes, patrol routes.
  - Right: Intelligence briefs, enemy force estimates, strategic forecasts.
- **Filtering** Tabs for Timeframe (Last Turn, Current Turn, Forecast) and Confidence level.
- **Cross-links** Recon entries reference matching intel briefs (e.g., clicking a sector highlights associated analysis).
- **Notifications** Banner for critical alerts (enemy offensive) with call-to-action.

## Data Requirements
- **Merged DTO** Introduce `ReconIntelSnapshot` encapsulating:
  - `sectors`: array of recon reports with coordinates, findings, confidence.
  - `intelBriefs`: structured assessments referencing sectors or unit IDs.
  - `alerts`: prioritized warnings with severity.
- **Engine Hooks** Provide `GameEngine.getReconIntelSnapshot()` drawing from recon system and intelligence pipeline (future modules).
- **History Buffer** Optional timeline data to power timeframe filters.

## UI Implementation Tasks
1. **Registry Update** Add consolidated entry `reconIntel` (or repurpose existing `recon` key) with container placeholders for both columns.
2. **Rendering Helper** Implement `renderReconIntelPanel()` in `PopupManager`:
   - Build recon column with cards and miniature map (if feasible).
   - Build intel column with accordions/expansion panels for briefs.
3. **Interactions**
   - Hover/focus on recon card highlights related intel brief.
   - Filter controls update DOM via simple state store.
4. **Styling** Create `.recon-intel-panel` grid layout, responsive stacking on narrow screens.
5. **Visualization** Consider using existing map renderer to project recon overlays (optional advanced task).

## Logic & Wiring Tasks
- **Snapshot Retrieval** Extend `PopupManager` to request snapshot from `battleState` or injected service when opening panel.
- **Event Subscriptions** Listen for `recon:update` and `intel:update` events to refresh content while panel open.
- **Confidence Gating** When recon confidence low, degrade intel clarity (e.g., blur precise numbers).
- **Localization** Prepare strings for future translation; store in data layer rather than inline HTML.

## Testing Strategy
- **Unit Tests** Validate merging logic linking recon sectors to intel briefs (matching IDs, handling missing data).
- **Integration Tests** Simulate recon updates (e.g., new scouting report) and ensure panel refreshes without reload.
- **UX Tests** Confirm keyboard navigation between columns and filters.

## Documentation & Comments
- **Inline Comments** Document how recon and intel sources are correlated and how filters affect snapshots.
- **Design Docs** Update or create `ReconIntelArchitecture.md` describing data flow from sensors to UI.

## Open Questions
- **Map Integration** Should recon overlays display directly on battle map or remain abstract in panel?
- **Enemy Deception** How to represent conflicting intel or misinformation?
- **Player Agency** Will players mark recon targets or request new sorties from this panel?
