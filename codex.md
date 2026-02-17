# Four-Star General — AI Implementation Guardrails

## 0) Purpose

Keep development focused, incremental, and reversible. Prevent scope creep, cross-module breakage, and "grand rewrites."

---

## 1) Non-negotiable Operating Rules

Every change must:

- **Actually look in the files** — no assumptions
- **Trace the logic** — understand before modifying
- **Fully document the change** — comments, design notes, changelog
- **Make it easy to roll back** — small, isolated changes

### Core Principles

- **Use existing patterns.** Do not create new architectures, libraries, or patterns. Use the existing stack and patterns already present.

- **Check impact.** Verify your change impact on other modules and files. If a needed file isn't listed, add a follow-up task.

- **No speculative changes.** Implement only what is required. Identify necessary refactors or cleanups and request a follow-up task.

- **No TODO re-interpretation.** Implement only the specific acceptance criteria attached to the current task.

- **Keep diffs small.** Prefer smaller, focused changes. If a change grows large, split it into subtasks.

- **Strict TypeScript.** No `any`, no `// @ts-ignore` unless justified in the design note and limited to a single line.

- **Test everything.** All new logic must have unit tests (and, for UI, minimal integration tests).

- **Handle ambiguity.** If anything is unclear, stop and emit a "BLOCKED: need clarification" note (see template).

- **Preserve existing behavior.** Never delete existing behavior to make new behavior "fit." Extend safely and keep backward compatibility unless the task explicitly instructs a breaking change with a migration plan.

---

## 2) Commenting Standards (Mandatory)

All code must be commented. Comments are not optional — they are required documentation that enables maintainability and collaboration.

### Requirements for Every Function

Every function must have a header comment that includes:

```typescript
/**
 * WHAT: Brief description of what this function does
 * WHY: Explains the purpose — why this function exists and when to use it
 *
 * @param paramName - Description of parameter and expected values
 * @returns Description of return value
 * @throws Description of error conditions (if applicable)
 */
```

### Requirements for Every Module/File

Every module must have a header comment at the top:

```typescript
/**
 * MODULE: ModuleName
 * WHAT: Brief description of what this module contains
 * WHY: Explains the purpose — why this module exists in the architecture
 *
 * DEPENDENCIES: List key dependencies and why they're needed
 * EXPORTS: List main exports and their purposes
 */
```

### Inline Comments

- Use inline comments to explain **non-obvious logic**
- Explain the "why" not the "what" for complex operations
- Mark any workarounds with `// WORKAROUND:` and explain why it's necessary
- Mark any temporary code with `// TODO:` and include a task reference

### Comment Quality Standards

- **Human readable** — write for a developer who has never seen this code
- **Clear and concise** — no jargon without explanation
- **Up to date** — update comments when code changes
- **Honest** — if something is a hack or workaround, say so

---

## 3) Error Handling Standards (No Fallbacks)

**Fallbacks are prohibited.** Silent failures hide bugs and create unpredictable behavior. Instead, use proper error trapping with clear user feedback.

### Error Handling Requirements

1. **Catch errors explicitly** — wrap risky operations in try/catch
2. **Log errors with context** — include what operation failed and why
3. **Provide user feedback** — display clear, actionable error messages
4. **Offer a path forward** — tell users what they can do to resolve the issue

### Error Message Format

Every error shown to users must include:

```typescript
{
  title: "What went wrong",           // Brief, human-readable summary
  detail: "Why it happened",          // Technical context if helpful
  action: "What you can do",          // Clear next steps for the user
  recoverable: boolean                // Can the user retry or continue?
}
```

### Example Pattern

```typescript
/**
 * WHAT: Loads unit data from the game state
 * WHY: Required for deployment panel to display available units
 */
function loadUnitData(unitId: string): UnitData {
  try {
    const unit = gameState.getUnit(unitId);

    if (!unit) {
      // Specific error with path forward
      throw new GameError({
        title: "Unit not found",
        detail: `No unit exists with ID: ${unitId}`,
        action: "Refresh the page or return to the main menu",
        recoverable: true
      });
    }

    return unit;
  } catch (error) {
    // Re-throw GameErrors, wrap unexpected errors
    if (error instanceof GameError) throw error;

    throw new GameError({
      title: "Failed to load unit",
      detail: error.message,
      action: "Please try again. If the problem persists, refresh the page.",
      recoverable: true
    });
  }
}
```

### Prohibited Patterns

- `catch (e) { /* ignore */ }` — silent swallowing
- `return defaultValue` in catch blocks — hidden failures
- `console.log(error)` without user notification — invisible errors
- Generic "Something went wrong" messages — unhelpful to users

---

## 4) Allowed Modules by Feature Area

| Feature | Allowed Paths |
|---------|---------------|
| Precombat | `src/game/precombat/*`, `src/data/unitAllocation.ts`, `src/ui/PrecombatScreen.ts`, `src/ui/styles/*` |
| Deployment | `src/game/deployment/*`, `src/ui/DeploymentPanel.ts` |
| Battle | `src/game/battle/*`, `src/ui/BattleScreen.ts`, `src/ui/panels/*` |
| Engine/State | `src/core/*`, `src/game/state/*` |
| Popup/UI | `src/ui/popup/*`, `src/ui/popupContentRegistry.ts` |

**Do not touch:** build tooling, project config, `package.json`, routing/entry unless the task explicitly says so.

---

## 5) Definition of Done

Every PR must satisfy all of the following:

- [ ] All acceptance criteria met
- [ ] TypeScript compiles with zero errors/warnings
- [ ] All tests pass; new tests cover every branch of new logic
- [ ] All functions and modules have required comments (see Section 2)
- [ ] No regressions in: deployment flow, precombat budget validation, hex selection
- [ ] Performance: no extra allocations per frame; no leaked event listeners
- [ ] Accessibility: focusable elements have keyboard nav; ARIA roles where appropriate
- [ ] Error handling uses proper error trapping (no fallbacks)
- [ ] Documentation updated: CHANGELOG entry + design note
- [ ] Lint fixed; no console logs left behind

---

## 6) Absolutely Prohibited

- Introducing backend, network calls, or persistence changes unless the ticket says so
- Replacing localStorage without a migration plan and approval
- Changing `index.html`, canvas sizing, or global styles unrelated to the task
- Editing more than one sidebar panel per task unless explicitly grouped
- Silent behavior changes or hidden feature flags
- **Fallbacks of any kind** — always use error trapping with clear messaging
- Uncommitted or poorly commented code
- Generic error messages that don't help users resolve issues

---

## 7) Ambiguity & Conflict Protocol

If you hit any of the following, **stop and emit a BLOCKED note:**

- Conflicting requirements between TODOs/PLAN docs vs. code
- Missing DOM anchors or CSS hooks not listed in the task
- A required engine API doesn't exist or contradicts current types
- Requirements are unclear or incomplete

Use the BLOCKED template in Section 11.

---

## 8) Module-Safety Rules

- **State mirrors:** Do not mutate BattleState/DeploymentState directly in UI code. Use existing state update helpers or create a small action helper if missing.

- **PopupManager:** All panels must register via `popupContentRegistry` (no ad-hoc popups).

- **Rendering loop:** No synchronous layout thrash; prefer state→render cycle; keep map interactions idempotent.

- **Selection:** Hex selection is a single source of truth; changes must dispatch events already used by other components.

- **Caching:** If you add a snapshot cache, include an explicit `invalidateXSnapshot()` and call it from write-paths.

---

## 9) UI Contracts (Sidebar Panels)

Each panel must:

1. Register content descriptor in `popupContentRegistry.ts`
2. Provide a pure render function that accepts a typed snapshot and returns DOM
3. Wire actions through existing engine APIs (no direct state mutation)
4. Handle **empty**, **loading**, and **error** states with clear user messaging
5. Include a panel-specific unit test + one integration test for happy path
6. Have complete function and module comments per Section 2

---

## 10) Test Requirements

- Unit tests for each new function/branch
- Snapshot or DOM tests for any new panel rendering
- A minimal interaction test proving the panel calls the engine API and updates UI
- Smoke test for landing → precombat → battle flow if you touch navigation

---

## 11) Templates

### A) Task Intake (fill before changing code)

```
TASK_ID: <link or id>
GOAL: <one-sentence outcome>
SCOPE: <list of files allowed to touch>
OUT OF SCOPE: <explicitly list what will NOT be changed>
ACCEPTANCE CRITERIA:
- [ ] AC1 ...
- [ ] AC2 ...
RISKS:
- Perf: <risk or 'none'>
- State coupling: <risk or 'none'>
- UI/Accessibility: <risk or 'none'>
```

### B) Design Note (first commit in PR)

Location: `design/<TASK_ID>.md`

```
## Context
- Current behavior & constraints (1–3 bullets)
- Why change is needed

## Plan
- Exact functions/types to add/modify
- Events/state touched & how integrity is preserved
- Error states and user messaging strategy
- Caching/invalidations (if any)

## Alternatives Considered
- Option A (rejected): reason
- Option B (rejected): reason

## Test Plan
- Unit tests to add
- Integration test scenario(s)
- Manual steps to verify

## Impact
- Perf implications
- Accessibility notes
- Docs/CHANGELOG updates
```

### C) BLOCKED Note

```
BLOCKED — <TASK_ID>

Reason: <what is ambiguous or conflicting>
Evidence: <file paths/lines>
Decision Needed: <single specific question>

Proposed Safe Options:
1) ...
2) ...

I will proceed after selection.
```

### D) Commit Message Format

```
<TYPE>(<scope>): <summary> (#<TASK_ID>)

- Implements AC1: …
- Implements AC2: …
- Tests: added <files>
- Docs: updated CHANGELOG + design/<TASK_ID>.md
```

---

## 12) Task-Specific Guardrails

### Deployment Panel Wiring
- Implement live data binding to DeploymentState through existing selectors
- Do not alter DeploymentState shape — if a field seems missing, BLOCKED
- Add "zone capacity" display using provided helpers; no new capacity math

### Hex Selection Feedback
- Use the existing selection event bus; do not invent new events
- Keyboard nav: arrow keys move selection; enter confirms; escape cancels
- No extra per-frame allocations; reuse highlight elements

### Sidebar Panels (Support, Logistics, General, Army, Recon, Supplies)
- One panel per task unless explicitly grouped
- Register in `popupContentRegistry` and mount via PopupManager only
- Fetch snapshot via `GameEngine.get*Snapshot()`
- If a cache exists, add `invalidate*Snapshot()` and call only after successful actions
- Handle: empty (no data), loading (spinner), error (clear message with path forward)
- Add one "happy path" interaction test per panel

---

## 13) Rollback & Failure Handling

- If an acceptance criterion can't be met, STOP after the design note and produce a split plan with smaller subtasks
- If a test reveals an unintended regression, revert immediately, re-plan with a smaller diff, and proceed
- If engine API doesn't match PLAN docs, BLOCKED with a one-line diff proposal to the type only
