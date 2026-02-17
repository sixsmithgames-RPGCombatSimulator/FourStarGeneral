# Battle Sidebar Plan – Army Roster Panel

<!-- STATUS: 📋 PLANNING - This file contains the design plan for implementing the Army Roster panel in the battle screen sidebar. This is a planned feature that has not yet been implemented. It provides detailed specifications for roster breakdown, unit cards, filtering, and map integration. -->

## Purpose
- **Mission** Deliver commanders a detailed roster view covering deployed, reserve, and casualty statuses, enabling quick assessment of force composition and readiness.

## Current State
- **Popup Infrastructure** `popupContentRegistry` defines `armyRoster` entry and `PopupManager.renderArmyRoster()` renders placeholder data using `getAllGenerals()` (incorrect dataset).
- **Data** `DeploymentState` tracks pool, deployed units, and reserves but not fully mirrored to roster UI; `GameEngine` stores player/bot placements with unit stats.
- **UX Gap** Roster lacks sorting, filtering, or linkage to battlefield selections.

## Target Experience
- **Roster Breakdown** Sections for Frontline, Reserve, Support, Casualties.
- **Unit Cards** Each card shows unit name, class icon, strength, ammo, morale, current hex, and active orders.
- **Filters** Dropdowns or tabs for unit type (armor, infantry, artillery), status, and attachment (brigade/division).
- **Interactions** Selecting a card highlights corresponding unit on map and centers viewport; vice versa selecting hex highlights card.

## Data Requirements
- **Roster DTO** Create `BattleRosterSnapshot` including arrays for each category with fields: unitId, label, type, strength, ammo, morale, location, attachments, tags.
- **Engine API** Expose `GameEngine.getRosterSnapshot()` synthesizing data from placements, support assets, and casualty logs.
- **History** Maintain casualties log and redeployment history to feed casualty section.

## UI Implementation Tasks
1. **Template Updates** Modify `popupContentRegistry` to provide structured containers (`roster-filters`, `roster-list`, `roster-summary`).
2. **Rendering Helper** Implement `renderArmyRosterPanel()` replacing current general placeholder. Map snapshot data into DOM with reusable card component generator.
3. **Filtering UI** Build simple state store (in-module or dedicated) to manage filter selections and re-render list.
4. **Summary Metrics** Display top-level counts (total units, combat power index, reserve depth).
5. **Styling** Define `.army-roster-panel` CSS with responsive grid; reuse existing `.army-roster-entry` styles as base.

## Logic & Wiring Tasks
- **Snapshot Generation**
  - In `GameEngine`, compute roster arrays each time battle state changes or on demand.
  - Include derived stats (combat power) via helper functions (e.g., weighting strength + morale).
- **State Sync** Cache snapshot in `battleState` for quick retrieval; update after deployments, moves, attacks, support calls.
- **Map Integration** Add event channel linking roster selection to map highlight using `BattleScreen` selection APIs.
- **Casualty Tracking** Extend combat resolution to push casualty records into roster snapshot.

## Testing Strategy
- **Unit Tests** Cover snapshot generation: ensure units placed in correct category, casualty logging accurate.
- **Integration Tests** Simulate deployment, combat, recall, verifying roster UI reflects changes.
- **UX Tests** Validate keyboard accessibility for navigating roster cards and invoking map focus.

## Documentation & Comments
- **Inline Comments** Document how roster snapshot groups units and the meaning of derived metrics.
- **Developer Docs** Update `DEVELOPER_1_GUIDE.md` or create `BattleRoster.md` describing data contracts and event flow.

## Open Questions
- **Allied Forces** Should allied contingents appear in same roster or separate tab?
- **Sorting Metrics** Which default sort provides most value (combat power vs. unit type)?
- **Expansion Hooks** Future features like custom attachments or promotions might require editing capabilities—ensure UI extensible.
