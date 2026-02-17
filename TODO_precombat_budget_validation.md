# Precombat Budget & Validation TODO

<!-- STATUS: 🔲 PENDING IMPLEMENTATION - Budget calculations and validation flows remain unimplemented; tasks below outline required work. -->

## Non-Negotiable Rules
- **Read all related modules** (`PrecombatScreen.ts`, budget panel markup in `index.html`, existing validation helpers) before modifying anything. No assumptions allowed. <!-- STATUS: 🔲 Pending - Review not logged. -->
- **Maintain current UX**: do not introduce new dialogs or remove existing messaging; only enhance validation per checklist. <!-- STATUS: 🔲 Pending - Pending validation work. -->
- **Do not bypass existing navigation flow**; validation must integrate with current `handleProceedToBattle()` semantics and warning modal behavior. <!-- STATUS: 🔲 Pending - Integration unchanged yet. -->
- **Comment critical validation paths** so future contributors understand the business rules being enforced. <!-- STATUS: 🔲 Pending - Comments to be written during implementation. -->

- **[BUDGET-1]** In `PrecombatScreen`, add derived getters `getAllocationSpend()` and `getRemainingBudget()` that compute totals from `allocationCounts` using `ALLOCATION_BY_KEY` cost data, caching results when `allocationDirty` is false. <!-- STATUS: 🔲 Pending - Getters missing. -->
- **[BUDGET-2]** Implement `updateBudgetDisplay()` to format both spent and remaining funds, update `#budgetSpent`, `#budgetRemaining`, and apply warning classes (`data-state="over-budget"`) on the budget panel when remaining < 0. <!-- STATUS: 🔲 Pending - Display logic absent. -->
- **[BUDGET-3]** Add validation inside `handleProceedToBattle()` that blocks advancing if remaining budget is negative or if no units have been allocated; surface an inline message in `#allocationFeedback` describing the issue. <!-- STATUS: 🔲 Pending - Validation not implemented. -->
- **[BUDGET-4]** Implement a modal workflow: when over budget but `allocationDirty` is true, show `#allocationWarningModal` (existing markup) and wire `handleAllocationWarningReturn()` to close modal while keeping screen on precombat. <!-- STATUS: 🔲 Pending - Modal workflow missing. -->
- **[BUDGET-5]** In `handleAllocationWarningProceed()`, allow proceeding by calling the same logic as `handleProceedToBattle()` but with an override flag so the player can intentionally go over budget if design allows; otherwise, keep proceed disabled and ensure modal messaging reflects design choice. <!-- STATUS: 🔲 Pending - Override logic undefined. -->
- **[BUDGET-6]** Disable `#proceedToBattle` when validation fails and re-enable only when budget is within limits and at least one allocation exists. <!-- STATUS: 🔲 Pending - Button state not wired. -->
- **[BUDGET-7]** Write unit tests (or integration tests via `tests/precombatBudget.test.ts`) that simulate: zero allocations, over-budget scenario, exact-budget scenario, and ensure button/feedback states update correctly after each call. <!-- STATUS: 🔲 Pending - Tests not written. -->
- **[BUDGET-8]** Document budget rules in `PRECOMBAT_SCREEN_TODO.md` or a new `docs/precombat-allocation.md` so gameplay/design expectations stay aligned. <!-- STATUS: 🔲 Pending - Documentation not updated. -->
