# Design Note — MASTER_TODO_PHASE1_PRECOMBAT_UI

## Context
- The precombat screen currently renders allocation lists and mission/general summaries but lacks verified accessibility polish, budget feedback alignment, and styling compliance outlined in `TODO_precombat_ui_rendering.md` and `TODO_precombat_ui_styling.md`.
- `PrecombatScreen.ts` already exposes helpers like `renderAllocationItem()`, `rerenderAllocations()`, and `renderMissionSummary()`; we must enhance focus states, responsive layout behaviors, and budget gating without altering downstream state contracts relied on by deployment and battle flows.
- Master plan Phase 1 prioritizes finishing precombat polish before sidebar work, so we address UI rendering and styling gaps within the existing structure.

## Plan
- Update `PrecombatScreen.ts` to ensure all allocation lists bind interactions once, refresh budget labels consistently, and announce over-budget states via `#allocationFeedback`. This includes double-checking focus management when the warning modal appears and returns focus to `#proceedToBattle`.
- Extend the inline `<style>` block in `index.html` (precombat section) to add the responsive grid, focus outlines, and budget panel state modifiers described in `TODO_precombat_ui_styling.md`, reusing existing CSS variables (`--allocation-gap`, `--allocation-focus-ring`).
- Validate repeated calls to `setup()` remain idempotent by relying on `rerenderAllocations()` and ensuring we do not attach duplicate listeners. Keep state mutations confined to the existing `allocationCounts` map and `allocationDirty` flag.
- Add/adjust unit-level DOM helpers in `PrecombatScreen.ts` to return early if containers are missing, logging console assertions for developers per TODO guidance, without mutating `BattleState` or `DeploymentState` beyond existing flows.
- Document additional verification steps and cross-reference with `TODO_precombat_ui_rendering.md` so the roadmap reflects completed work.

## Events & State Integrity
- Only mutate `allocationCounts`, `allocationDirty`, and the DOM nodes cached in `cacheElements()`. No new state is introduced.
- Maintain `BattleState` contracts by continuing to call `setPendingDeployment()` and `setPrecombatAllocationSummary()` unchanged.
- Ensure `allocationWarningOverlay` toggles `hidden` class correctly while focus returns to `proceedToBattleButton` for accessibility consistency.

## Error & Empty States
- When allocation lists are empty (e.g., data misconfiguration), display fallback feedback via `allocationFeedbackElement` and skip binding.
- Over-budget logic already sets dataset state; ensure styling handles both `within-budget` and `over-budget` without throwing.

## Caching & Invalidations
- Reuse existing `allocationDirty` and budget calculations; no new caches introduced.
- Preserve `seedDeploymentCaches()` behavior to keep `DeploymentState` mirrors in sync.

## Alternatives Considered
- **Option A: Refactor to a component-based renderer.** Rejected because CODEX prohibits architectural rewrites; would exceed change budget and risk regressions.
- **Option B: Introduce a dedicated CSS module file.** Rejected for now to minimize file churn and keep within style guardrails; adjustments remain in existing inline styles.

## Test Plan
- Extend `tests/precombatAllocs.test.ts` (or add new spec if needed) to verify budget state transitions and allocation rendering counts after adjustments.
- Manual verification checklist: keyboard navigation for +/- controls, modal focus return, responsive wrapping at 1280px and 960px widths, and over-budget warning triggering visual updates.
- Console assertions already present in `setup()`; ensure they remain satisfied after UI polish.

## Impact
- **Performance:** Minimal; rerender path reuses existing DOM updates and avoids introducing per-frame work.
- **Accessibility:** Improved focus outlines and modal focus return behavior; verify ARIA labels remain intact.
- **Docs:** Update `MASTER_TODO.md` Phase 1 status and add notes to relevant TODO files confirming completed items.
