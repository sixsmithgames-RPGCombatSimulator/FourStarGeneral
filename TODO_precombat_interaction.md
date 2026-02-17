# Precombat Interaction Logic TODO

<!-- STATUS: 🔲 PENDING IMPLEMENTATION - Interaction logic for precombat allocation controls is not yet implemented. Tasks below remain outstanding. -->

## Groundwork Spec
- **[State Initialization]** Document how `allocationCounts`, `allocationBudget`, and `allocationDirty` are seeded and maintained, including when flags reset (e.g., after `resetAllocations()` or screen transitions). Capture expectations around mutability so downstream modules know when values are authoritative. <!-- STATUS: 🔲 Pending - Documentation not provided. -->
- **[Event Delegation]** Define the event model for allocation controls (click, keyboard) and identify required data attributes (`data-action`, `data-key`). Note which containers act as delegates to prevent redundant listeners. <!-- STATUS: 🔲 Pending - Event model undefined. -->
- **[Budget Hooks]** Enumerate the callbacks or events (`rerenderAllocations()`, `updateBudgetDisplay()`) that must fire after state changes so the budget module can subscribe without duplicating logic. <!-- STATUS: 🔲 Pending - Hook list not enumerated. -->
- **[Accessibility Checklist]** Specify required aria labels, focus order behaviors, and keyboard shortcuts to align with accessibility goals noted in rendering TODO. Include verification steps to ensure no regressions. <!-- STATUS: 🔲 Pending - Accessibility plan missing. -->
- **[Reset Semantics]** Clarify how reset flows interact with `DeploymentState` and navigation back to landing; ensure the contract is documented for the deployment bridge. <!-- STATUS: 🔲 Pending - Reset semantics not documented. -->

## Non-Negotiable Rules
- **Study all relevant code paths first**: fully read `PrecombatScreen.ts`, `DeploymentState.ts`, and existing interaction helpers before edits. No assumptions or speculative changes. <!-- STATUS: 🔲 Pending - Review needs completion. -->
- **Avoid sweeping refactors**: keep existing event wiring intact unless a task explicitly requires changes. Only add or adjust behavior necessary for allocation controls. <!-- STATUS: 🔲 Pending - Guidance for future work. -->
- **Preserve user-visible behavior** outside the documented scope; do not change button labels, IDs, or existing accessibility attributes unless instructed. <!-- STATUS: 🔲 Pending - Scope guard remains. -->
- **Comment every new method or complex logic block** to explain purpose and reasoning per project standards. <!-- STATUS: 🔲 Pending - Comments to be added with implementation. -->

## Actionable Tasks
- **[INT-1]** In `PrecombatScreen` declare internal state containers: `private allocationCounts = new Map<string, number>();`, `private allocationBudget = 10_000_000;`, and `private allocationDirty = false;`. Initialize defaults inside `initialize()` before any render calls. <!-- STATUS: 🔲 Pending - State containers not implemented. -->
- **[INT-2]** Implement `primeAllocationState()` that seeds `allocationCounts` with zero values for every key returned by `allocationOptions`. Call this from `setup()` before `initializeAllocationUI()` so event handlers always have defined entries. <!-- STATUS: 🔲 Pending - Seeding missing. -->
- **[INT-3]** Replace the placeholder `console.log` in `initializeAllocationUI()` by wiring freshly rendered list items to event delegation: attach a single listener per category container that listens for `[data-action]` clicks and calls `handleAllocationAdjustment(key, delta)`. <!-- STATUS: 🔲 Pending - Event delegation not wired. -->
- **[INT-4]** Build `handleAllocationAdjustment(optionKey: string, delta: number)` to clamp resulting quantity between `0` and `Option.maxQuantity`, update `allocationCounts`, mark `allocationDirty = true`, then call `rerenderAllocations()` and `updateBudgetDisplay()`. <!-- STATUS: 🔲 Pending - Adjustment handler absent. -->
- **[INT-5]** Add keyboard accessibility: within `initializeAllocationUI()` ensure each plus/minus button receives `aria-label` and `data-key`. Register a `keydown` listener on the list containers that interprets `ArrowUp/ArrowDown` as increment/decrement when focus is on a button. <!-- STATUS: 🔲 Pending - Keyboard support missing. -->
- **[INT-6]** Implement a `resetAllocations()` method bound to a new "Reset" button (use existing DOM if present or inject one) that zeroes all counts, resets `allocationDirty = false`, and re-renders UI plus budget. <!-- STATUS: 🔲 Pending - Reset workflow not built. -->
- **[INT-7]** Ensure all interaction handlers guard against missing DOM nodes or allocation options; add `console.warn` diagnostics for unexpected keys to aid debugging. <!-- STATUS: 🔲 Pending - Diagnostics absent. -->
- **[INT-8]** Manually verify through browser console that repeated increments/decrements never desync displayed quantities from `allocationCounts` and that keyboard controls alter the same underlying state. <!-- STATUS: 🔲 Pending - Manual verification outstanding. -->

## Actionable Tasks
- **[INT-A]** Implement `primeAllocationState()` and `resetAllocations()` with thorough inline comments explaining why zero-seeding and dirty-flag resets are required before rendering. Acceptance: Invoking both methods in sequence leaves `allocationCounts` with zero values and `allocationDirty === false`. <!-- STATUS: 🔲 Pending - Implementation outstanding. -->
- **[INT-B]** Replace placeholder logging in `initializeAllocationUI()` with event delegation wiring (`click`, `keydown`) that reads `data-key`/`data-action`. Acceptance: Buttons respond to +/- clicks and arrow keys; listeners register only once per container. <!-- STATUS: 🔲 Pending - Wiring incomplete. -->
- **[INT-C]** Build `handleAllocationAdjustment(optionKey, delta)` to clamp counts, mark dirty state, and trigger `rerenderAllocations()` plus `updateBudgetDisplay()`. Acceptance: Overflows beyond `maxQuantity` are prevented and budget update fires on every change. <!-- STATUS: 🔲 Pending - Handler unmet. -->
- **[INT-D]** Ensure `handleReturnToLanding()` and other navigation exits call `resetAllocations()` and clear downstream deployment state per the deployment bridge TODO. Acceptance: Returning to landing leaves `allocationCounts` empty and `DeploymentState` reset. <!-- STATUS: 🔲 Pending - Reset integration missing. -->
- **[INT-E]** Add defensive checks/`console.warn` branches for missing DOM or option keys and verify via manual testing that unexpected inputs surface readable diagnostics without throwing. <!-- STATUS: 🔲 Pending - Diagnostics not added. -->
- **[INT-F]** Add test harness scripts (unit or integration) simulating rapid adjustments, keyboard use, and reset flow to guard against regressions. <!-- STATUS: 🔲 Pending - Tests not added. -->

## Task Breakdown & Acceptance Criteria
- **[Task-I01] State Seeding & Reset**
  - Implement state containers, prime/reset logic, and add comments documenting lifecycle expectations. <!-- STATUS: 🔲 Pending - Task not started. -->
  - Acceptance: Running allocation adjustments after reset behaves consistently; `allocationDirty` toggles true on change, false after reset. <!-- STATUS: 🔲 Pending - Acceptance unmet. -->
- **[Task-I02] Interaction Wiring**
  - Hook up delegated click/keyboard handlers and ensure accessible aria labels (`Increment`, `Decrement`). <!-- STATUS: 🔲 Pending - Interaction hooks missing. -->
  - Acceptance: Keyboard navigation (arrow keys, Enter/Space) adjusts counts during manual tests. <!-- STATUS: 🔲 Pending - Manual test not executed. -->
- **[Task-I03] Validation Hooks**
  - Invoke `updateBudgetDisplay()` and other validation routines after adjustments; ensure proceed button state reflects counts. <!-- STATUS: 🔲 Pending - Validation wiring absent. -->
  - Acceptance: Budget panel updates in sync with allocation changes (verified via console output until UI is complete). <!-- STATUS: 🔲 Pending - Acceptance unmet. -->
- **[Task-I04] Diagnostics & Testing**
  - Add console warnings, unit tests, and manual test checklist capturing scenarios like non-existent option keys, rapid increments, and reset from navigation. <!-- STATUS: 🔲 Pending - Diagnostics/tests not provided. -->
  - Acceptance: Tests pass and manual checklist is stored in this file or an attached doc. <!-- STATUS: 🔲 Pending - Acceptance unmet. -->
