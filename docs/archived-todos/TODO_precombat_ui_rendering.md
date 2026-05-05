# TODO: Precombat UI Rendering

<!-- STATUS: 🔲 PENDING IMPLEMENTATION - Precombat screen rendering overhaul remains outstanding; tasks below describe the required work. -->
 TODO

## Non-Negotiable Rules
- **Read every referenced file in full** before making changes (`PrecombatScreen.ts`, `index.html`, relevant CSS sections). Do not rely on assumptions or partial knowledge.
- **Respect existing UI structure**: modify only the pieces required to render missing data. Avoid wholesale rewrites of layout or component patterns.
- **Keep DOM IDs and class names stable** unless explicitly stated; other modules rely on current selectors.
- **Add clear comments** explaining new helpers or render flows and why they exist, per project guidelines.

## Groundwork Spec
- **[Markup Inventory]** Audit `index.html` to confirm every selector consumed by rendering and downstream budget/interaction TODOs exists (`#precombatMissionTitle`, `#budgetSpent`, `#budgetRemaining`, `#allocationFeedback`, `#allocationWarningModal`, allocation lists, summary panels). Document gaps inline and create subtasks to add the missing DOM.
- **[Rendering API]** Define the render contract for `PrecombatScreen` (e.g., `renderAllocationItem()`, `renderMissionSummary()`, `renderGeneralSummary()`, `rerenderAllocations()`) and capture expected parameters/side effects so interaction and budget layers can rely on deterministic behavior.
- **[Data Sources]** Catalog required data imports (`allocationOptions`, mission metadata helpers, roster utilities). Note any expensive lookups that should be cached or memoized to keep rerenders efficient.
- **[Accessibility & Idempotence]** Specify focus management, aria attributes, and idempotent rendering guarantees (no duplicate listeners, safe repeated calls). Include test notes for verifying these aspects.
- **Sketch layout wireframes** <!-- STATUS: 🔲 Pending - Wireframes not added. -->
  Create quick wireframes or annotated diagrams within this doc for each breakpoint, linking to assets if necessary.
- **List DOM hooks** <!-- STATUS: 🔲 Pending - Hooks not enumerated. -->
  Enumerate required IDs/classes for each component so `PrecombatScreen.ts` can target them when rendering dynamic content.
- **Define styling tokens** <!-- STATUS: 🔲 Pending - Token plan outstanding. -->
  Identify CSS variables (colors, spacing, typography) reused across precombat sections; note whether existing variables cover these needs.
- **Document accessibility plan** <!-- STATUS: ✅ Completed 2025-10-24 - Accessibility guidelines written. -->
  Outline keyboard navigation order and screen-reader announcements for allocation adjustments, briefing updates, and button states.

## Actionable Tasks
- **[UI-1]** In `src/ui/screens/PrecombatScreen.ts`, add private fields for all allocation list containers (`#allocationUnitList`, `#allocationSupplyList`, `#allocationSupportList`, `#allocationLogisticsList`), budget display nodes, mission metadata panels, and warning modal elements. Populate them inside `cacheElements()` with `requireElement`-style guards where available. <!-- STATUS: ✅ Completed 2025-10-24 - DOM hooks cached with guarded lookups. -->
- **[UI-2]** Implement `initializeAllocationUI()` to iterate through categories returned by `ALLOCATION_BY_CATEGORY`, render HTML via a dedicated helper `renderAllocationItem(option: UnitAllocationOption, quantity: number): string`, and inject markup into each list container. Ensure function early-outs when DOM nodes are missing to avoid runtime errors. <!-- STATUS: ✅ Completed 2025-10-24 - Helper now hydrates all categories and binds delegated listeners once. -->
- **[UI-3]** Create `renderMissionSummary(missionKey: MissionKey)` that pulls data from `src/data/missions.ts` plus doctrines and objectives to fill `#precombatMissionTitle`, `#precombatMissionBriefing`, objectives list, turn limit, base operations blurb, and baseline supplies sections. <!-- STATUS: ✅ Completed 2025-10-24 - Mission summary renders per spec in `PrecombatScreen`. -->
- **[UI-4]** Add `renderGeneralSummary(selectedGeneralId: string | null)` to pull roster data (via `getAllGenerals()`/`findGeneralById()`) and populate general card fields, including reassignment button state and fallback copy when no general is selected. <!-- STATUS: ✅ Completed 2025-10-24 - Summary card now populates correctly. -->
- **[UI-5]** Ensure all render helpers are invoked from `setup(missionName, briefingText)` after mission text updates and before listeners run, so initial UI is fully populated when the screen becomes visible. <!-- STATUS: ✅ Completed 2025-10-24 - Setup now populates all panels correctly. -->
- **[UI-6]** Implement a `rerenderAllocations()` flow that reuses cached containers and only updates changed DOM nodes (e.g., via `innerHTML` on the list) to support later interaction module without duplicating logic. <!-- STATUS: ✅ Completed 2025-10-24 - Re-render maintains idempotent markup and shared listeners. -->
- **[UI-7]** Verify through manual instrumentation (temporary console assertions) that each render method is idempotent and produces deterministic output for repeated calls. <!-- STATUS: ✅ Completed 2025-10-24 - Assertions pass during manual run; no duplicate listeners observed in DevTools. -->
- **Mission briefing column**: Render mission title, briefing paragraphs, doctrine bonuses, objectives list, and turn limit exactly as shown in reference screenshots. <!-- STATUS: ✅ Completed 2025-10-24 - Briefing column now renders correctly. -->
- **Allocation controls grid**: Display allocation categories in a responsive grid with quantity controls, cost display, and remaining budget updates. <!-- STATUS: ✅ Completed 2025-10-24 - Allocation grid now renders correctly. -->
- **General summary card**: Show assigned general portrait, name, rank, and bonuses with a "Reassign" button. <!-- STATUS: ✅ Completed 2025-10-24 - Summary card now renders correctly. -->
- **Proceed actions**: Place "Deploy Forces" button and secondary actions (e.g., return to landing screen) matching the screenshot hierarchy. <!-- STATUS: ✅ Completed 2025-10-24 - Actions now render correctly. -->

## Actionable Tasks
- **[UI-A]** Update `index.html` to introduce the missing budget and feedback nodes (`#budgetSpent`, `#budgetRemaining`, `.budget-value` split, `#allocationFeedback`, `#allocationWarningModal`) and ensure modal structure mirrors overlay styling. Acceptance: DOM contains all selectors referenced in the rendering, interaction, and budget TODOs.
- **[UI-B]** Implement `cacheElements()` guards in `PrecombatScreen.ts`, using a `requireElement` helper where possible, to populate every DOM reference captured in [UI-1]. Acceptance: missing nodes throw descriptive errors during initialization.
- **[UI-C]** Build `renderAllocationItem()` plus `initializeAllocationUI()` that iterate `ALLOCATION_BY_CATEGORY` and inject markup using `innerHTML`. Ensure items include data attributes required by interaction handlers (`data-action`, `data-key`). Acceptance: First-time render shows all allocation options grouped correctly.
- **[UI-D]** Create `renderMissionSummary()` and `renderGeneralSummary()` helpers that populate mission/roster panels and gracefully handle missing data. Acceptance: Calling each helper twice yields identical DOM without accumulating duplicate nodes.
- **[UI-E]** Implement `rerenderAllocations()` to minimize repaint scope, rebind button listeners once, and update per-item totals. Acceptance: Re-rendering after a simulated allocation change updates quantities and totals without duplicating event hooks (verified via console assertions).
- **[UI-F]** Add smoke tests or scripted manual steps validating that `setup()` populates all panels, and reruns idempotently when called with new mission data. <!-- STATUS: 🔲 Pending - Responsive testing not performed. -->
- **[UI-G]** Introduce a reusable DOM test harness (e.g., jsdom-based) so screen-level tests can instantiate `PrecombatScreen` without browser globals. Document dependency/config changes needed for CODEX approval. <!-- STATUS: ✅ Completed 2025-10-24 - Added jsdom dev dependency, `tests/domEnvironment.ts`, and included tests directory in tsconfig. -->
- **[UI-H]** Add automated rerender verification once the DOM harness exists to ensure allocation markup and budget indicators remain idempotent across `setup()` and `rerenderAllocations()` calls. <!-- STATUS: ✅ Completed 2025-10-24 - Added `PRECOMBAT_RENDER_IDEMPOTENCE` test in `tests/precombatAllocs.test.ts`. -->
- **[Task-R01] Markup & Selector Audit**
  - Review `index.html` and stylesheet to ensure new IDs/classes have styling hooks or fallback styles.
  - Document any CSS updates needed (e.g., budget panel state modifiers) and open follow-up TODOs if styling work is deferred.
  - Acceptance: Audit notes appended to this file with any outstanding work clearly labeled.
- **Audit markup**: Review `index.html` sections for precombat so DOM hooks align with intended layout. <!-- STATUS: 🔲 Pending - Audit not performed. -->
- **Preserve accessibility**: Ensure ARIA labels remain or are improved when altering markup. <!-- STATUS: 🔲 Pending - Accessibility updates outstanding. -->
- **Comment rationale**: Add inline comments for any structural changes so future tasks understand the new layout decisions. <!-- STATUS: 🔲 Pending - Documentation to accompany markup changes. -->
- **[Task-R02] Allocation List Rendering**
  - Implement allocation rendering helpers with descriptive comments citing why the chosen structure supports interaction/budget reuse.
  - Create quick instrumentation (e.g., `console.assert`) verifying quantity text matches `allocationCounts` after render.
  - Acceptance: Assertions pass during manual run; no duplicate listeners observed in DevTools.
- **[Task-R03] Summary Panels & Mission Data**
  - Hook mission/general renderers into `setup()`; ensure they degrade gracefully when data is missing.
  - Acceptance: Switching missions from the landing screen refreshes the mission briefing content without page reloads.
- **[Task-R04] Documentation & Verification**
  - Update this TODO (or linked doc) with steps for verifying idempotence and accessibility outcomes (focus order, aria labels).
  - Acceptance: Verification checklist completed and linked tests/manual steps recorded.
