# Four Star General
## Coding Standards & Zero Regression Guardrails v1.1

This document defines the mandatory engineering standards for the Four Star General project. The goal is zero regression in engine logic and visual integrity. These rules apply to all contributors (human and AI).

> [!IMPORTANT]
> No change is considered complete unless it satisfies every applicable section below.

## 1. Architectural Guardrails (Non-Negotiable)
### 1.1 Separation of Concerns
The project enforces strict architectural boundaries:
*   `src/engine` → deterministic game logic only
*   `src/state` → state management and orchestration
*   `src/ui` → rendering and user interaction

The UI layer MUST NOT:
*   Mutate engine state directly
*   Import internal engine modules
*   Modify engine-owned objects

All state transitions must flow through:
1.  Engine or State Manager
2.  Event emission
3.  UI reaction via listeners

Direct coupling between UI and engine internals is prohibited.

### 1.2 Event-Driven Rendering
Rendering updates must occur via typed events (`CustomEvent` or PubSub).
*   **No polling loops** to "check" engine state.
*   **No cross-layer method calls** between decoupled systems.
*   All events must use centrally defined event constants.
*   All event payloads must be strongly typed.
*   Event payloads must not use `any`.

### 1.3 Engine Determinism
The engine must be deterministic.
*   RNG must be seeded or injectable.
*   Core battle resolution must produce identical results given identical inputs.
*   Engine logic must not depend on UI timing, DOM state, or async side effects.

## 2. Type Safety & Linting (CI-Enforced Gate)
### 2.1 Strict TypeScript
`"strict": true` is mandatory.
*   No implicit `any`.
*   No untyped public/exported functions.
*   All engine/state modules must declare explicit return types.
*   Avoid `any` entirely unless integrating an untyped third-party library (must document why).
*   No unsafe type assertions without a justification comment.

### 2.2 ESLint
All code must pass:
*   `npm run build`
*   `npm run lint`

Requirements:
*   Zero TypeScript errors.
*   Zero ESLint warnings.
*   Unused variables must be prefixed with `_`.
*   Floating promises are not allowed.

### 2.3 CI Enforcement
No PR or merge may proceed unless:
1.  Typecheck passes
2.  Lint passes
3.  Unit tests pass
4.  Build passes

These are automated gates.

## 3. High-Risk File Protocol
The following are classified as **HIGH-RISK** modules:
*   `BattleScreen.ts`
*   `HexMapRenderer.ts`
*   Any file in `src/engine`
*   Coordinate math / combat resolution modules

Modifying high-risk files requires:
1.  An `implementation_plan.md`
2.  Explicit impact analysis documenting:
    *   What systems consume this output?
    *   What events depend on this structure?
    *   What visual behaviors could shift?
3.  At least one of:
    *   A new/updated unit test
    *   A replay snapshot update
    *   Manual verification checklist completion

> [!WARNING]
> Feature changes and refactors must NOT occur in the same PR.

## 4. Planning & Change Discipline
### 4.1 Measure Twice, Cut Once
Before modifying core logic, developers must document:
*   Intended behavior
*   Current behavior
*   Expected new behavior
*   Edge cases
*   Regression risk

### 4.2 No Refactor + Feature in Same Change
A single change set may either Refactor code structure **OR** Change behavior. Never both.

If both are needed, split into two PRs:
1.  Pure refactor (no behavior change)
2.  Feature change (verified against refactored baseline)

## 5. Testing & Validation (Engine First)
### 5.1 Unit Tests (Vitest)
All existing tests must pass: `npm run test`

If engine logic changes:
*   Tests must be added or updated.
*   Edge cases must be covered.
*   Test must fail under previous incorrect behavior.

### 5.2 Replay / Snapshot Testing (Required for Engine Changes)
Engine changes must support deterministic replay. For battle resolution or turn simulation:
1.  Use seeded RNG.
2.  Run predefined scenario.
3.  Assert final state snapshot or key invariants.

*This protects against invisible logic regressions.*

### 5.3 State Invariants
Engine and state modules must enforce invariants in development builds.
*   Units cannot occupy invalid hexes.
*   HP cannot drop below zero unless explicitly handled.
*   Coordinates must remain valid map bounds.
*   Event payload schema must match type definition.

If invariant violation occurs:
*   Throw in development.
*   Log with context in production.

## 6. Error Handling Policy
### 6.1 No Silent Failures
Catch blocks must log contextual information:
`console.error("[ComponentName] Render failed:", err);`

Never swallow errors silently.

### 6.2 Fail Fast in Engine
Engine logic must not attempt to "recover" from impossible states silently. If state integrity is compromised:
1.  Throw error in development.
2.  Log and revert to last safe state in production (if feasible).

## 7. Manual Verification Checklist (Visual Integrity)
Because this is a visual strategy game, the following must be manually verified after relevant changes:
- [ ] Map panning and zoom stability
- [ ] SVG unit alignment
- [ ] Coordinate conversions
- [ ] Deployment overlays
- [ ] Tooltip positioning
- [ ] Animation timing (if affected)

Verification must be documented in PR notes.

## 8. Documentation Standard
### 8.1 JSDoc
Every Class, Interface, Public method, and Event type must include JSDoc formatting.

### 8.2 Inline Context (Explain the Why)
Complex logic must include inline comments explaining:
*   Why a coordinate conversion works that way
*   Why certain rounding is required
*   Why combat math uses specific formulas
*   Why event ordering matters

**Do not merely restate the code.**

## 9. Change Traceability (Required for Agentic Contributions)
Every change must include:
*   Intent (what problem is solved)
*   Scope (files modified)
*   Risk assessment
*   Verification steps executed
*   Known limitations

AI-generated changes must follow this template without exception.

## Definition of Done
A change is "done" only when:
- [ ] All CI gates pass
- [ ] Required tests exist and pass
- [ ] Manual visual verification completed
- [ ] Documentation updated
- [ ] High-risk protocol followed (if applicable)

*No shortcuts.*