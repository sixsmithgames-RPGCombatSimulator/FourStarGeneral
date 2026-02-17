# Battle Sidebar Plan – General Panel

<!-- STATUS: 📋 PLANNING - This file contains the design plan for implementing the General panel in the battle screen sidebar. This is a planned feature that has not yet been implemented. It provides specifications for UI implementation, data requirements, and testing strategy. -->

## Purpose
- **Mission** Provide commanders with at-a-glance briefing about the commissioned general assigned to the operation, including biography, command traits, morale modifiers, and current theater directives.

## Current State
- **UI** No dedicated general panel is wired; sidebar buttons exist but do not open meaningful content for this category.
- **Data** General information is partially available via `getAllGenerals()` inside `src/ui/components/PopupManager.ts` but currently reused for the army roster placeholder.
- **UX** Players lack an accessible summary of commander bonuses, doctrine, and unlockable abilities.

## Target Experience
- **Primary View** Profile card with portrait, name, rank, allegiance, doctrine focus, and signature ability.
- **Secondary Details** Tabs or accordion for command traits, active directives, and historical notes.
- **Contextual Indicators** Badges reflecting morale impact and any active temporal buffs.
- **Accessibility** ARIA headings for each subsection; keyboard navigation across tabs.

## Data Requirements
- **Source** Extend roster storage or introduce `GeneralProfile` DTO exposing identity, doctrine, modifiers, portrait URL, motivational quote.
- **Live Values** Hook into battle state for dynamic morale/initiative modifiers, supply bonuses, and active strategic cards.
- **Fallbacks** Provide default placeholder portrait and strings when data is missing to avoid blank panel.

## UI Implementation Tasks
1. **Sidebar Icon Update** Assign `data-popup="generalProfile"` button with new icon asset and tooltip.
2. **Popup Template** Create React-less templating function producing:
   - Hero section (portrait + stats grid).
   - Traits list (unordered list with icon per trait).
   - Directives timeline (ordered list with effective dates).
3. **Styling** Add SCSS module or extend `battle-ui.css` for `.general-profile` block with responsive layout for portrait and detail columns.

## Logic & Wiring Tasks
- **Popup Registration** Add entry to `popupContentRegistry` keyed `generalProfile` with container placeholder.
- **Dynamic Rendering** In `PopupManager`, add handler similar to `renderArmyRoster()` that injects general profile HTML using roster storage or new API.
- **State Integration** Pull current battle modifiers from `GameEngine` via new selector (e.g., `engine.getCommanderSummary()`).
- **Event Hooks** Listen for morale-changing events to refresh panel content when open (e.g., subscribe to `battleState` event bus).

## Testing Strategy
- **Unit Tests** Validate DTO mapping logic and HTML rendering functions produce expected content for complete and incomplete data sets.
- **UI Smoke Tests** Using Playwright/Cypress to ensure sidebar button opens panel, ARIA labels exist, and dynamic numbers update after simulated morale change.
- **Regression** Confirm existing popups unaffected and close button/ESC still work.

## Documentation & Comments
- **Inline Comments** Document data flow from `GameEngine` to panel per user preference.
- **Design Notes** Update `DEVELOPER_2_GUIDE.md` with icon usage and CSS guidelines.

## Open Questions
- **Portrait Storage** Decide whether portraits ship with repo or fetched from CDN.
- **Multiple Generals** Clarify if co-commanders should be selectable; plan supports list extension if required.
- **Localization** Determine timeline for translating doctrine descriptions.
