# Iteration Governance

## Purpose

This document governs the recursive implementation loop used for spec-driven work.

Its job is to prevent drift, symptom chasing, and local optimization from replacing the actual architectural goal.

## Governance Role

- This document governs the process.
- This document is intentionally stable and should be treated as immutable relative to feature implementation.
- Do not edit this document to justify a tactical workaround, an implementation shortcut, or a temporary deviation.
- Change this document only when the process itself must change.

## Relationship To Specifications

- A feature specification is the mutable north star for that feature area.
- This governance document is the immutable procedure that tells us how to work against that north star.
- For the air show, the canonical spec is `docs/AIR_SHOW_NORTH_STAR_SPEC.md`.

If implementation reality and the specification diverge:

- do not silently redefine the problem
- do not update governance to fit the drift
- either realign implementation to the spec or explicitly propose a spec update


## Mandatory Iteration Loop

Every recursive implementation cycle must follow this sequence:

1. **Understand the exact user complaint**
2. Test
3. Report
4. Evaluate for issues
5. Analyze root cause for issues
6. Plan effective solution, not just a patch
6.1. Review plan against north star spec
6.2. Realign plan if needed
7. Implement fix or fixes
8. Update test to improve diagnosis if needed
9. Repeat this loop until goal is achieved

Never skip any part of step 6.
No step may be skipped because a local bug appears obvious.

## Step 1: Understand the Exact User Complaint

Before testing, you MUST understand exactly what the user is reporting.

**Mandatory Clarification Questions:**
- What is the exact observable symptom? (e.g., "sprites disappear" vs "animation jumps")
- When does it occur? (specific phase, timing, trigger)
- What is the expected behavior vs actual behavior?
- Is this a visual bug, logic bug, or both?

**If Uncertain - STOP and Ask:**
Do NOT proceed with testing if the complaint is ambiguous. Ask clarifying questions until you can precisely state:
- The exact issue in one sentence
- How to reproduce it
- What "fixed" looks like

**Example - Good vs Bad Understanding:**
- ❌ BAD: "There's something wrong with aircraft during explosions"
- ✅ GOOD: "Aircraft sprites disappear from view during the bomb release explosion at target hex, then reappear after explosion completes. The aircraft should remain visible throughout."

**Myopic Testing Prevention:**
- Do NOT test for symptoms that weren't reported
- Do NOT assume the bug is in a subsystem without evidence
- Do NOT test performance/continuity if the issue is visibility/disappearance
- Do NOT fix "related issues" you notice - stay focused on the exact complaint

## Step 2: Test

Start each iteration by testing the real system or the closest deterministic harness available.

**Test Design Principles:**
1. Test must reproduce the EXACT complaint, not a related symptom
2. Test failure mode should clearly indicate the specific issue
3. Test output should provide diagnostic information, not just pass/fail
4. If test passes but user still sees issue, the test is wrong - not the code

## Visual/DOM Testing Requirements (when applicable)

When testing visual bugs (disappearance, visibility, rendering issues):
- Test what is ACTUALLY SHOWN, not internal data structures
- Assert on DOM element state (opacity, display, visibility, existence)
- Assert on computed styles using `getComputedStyle()`
- Verify actual element presence in DOM, not just assignment data
- Test at the same layer the user observes (visual output)

**Example - Good vs Bad Testing:**
- ❌ BAD: `expect(actor.active).toBe(true)` - tests internal flag
- ❌ BAD: `expect(report.assignments).toContain(actor)` - tests data structure
- ✅ GOOD: `expect(actor.image.style.opacity).toBe('1')` - tests actual visual opacity
- ✅ GOOD: `expect(document.querySelector('.aircraft')).toBeVisible()` - tests DOM visibility

**When Internal State ≠ Visual State:**
Internal state (flags, assignments, data structures) may differ from what's rendered. Always verify the actual rendered output matches user expectations.

Testing may include:

- automated tests
- scenario diagnostics
- focused reproductions
- instrumentation
- UI playback verification

The test must answer a concrete question tied to the goal. Test first, even when the bug appears obvious.

## Animation Moment Precision (Mandatory for Animation Testing)

When testing animated systems (airshow, unit movement, combat effects), the test must capture state at the **exact moment** being claimed, not at an arbitrary point during or after animation.

### The Problem With Imprecise Timing

A test that reads actor positions mid-animation or after a phase transition may pass or fail for the wrong reasons:
- Actors may have already moved from their spawn positions before the snapshot is taken
- `waitForPhase("X")` fires when phase X **begins executing**, not at the initial DOM placement
- `waitForCompletion()` reads state after all animation has finished — useless for spawn verification

### Required: Name The Exact Moment

Every animation test must explicitly state which moment it is measuring and why that moment proves the goal:

```
// ✅ GOOD — names the moment and why it's the right one
// Capture immediately after animateResolvedAirCombatShow() is called but before
// any requestAnimationFrame has fired. This is the initial spawn placement
// set by normalizeAirShowSceneFlightAnchors → resetAirShowFlightToSceneAnchor.
spawnSnapshot = captureActorPositions();  // synchronous, before first frame
```

```
// ❌ BAD — moment is undefined; animation may have moved actors already
await hooks.waitForPhase("fighter-ingress");
const positions = readActorPositions();  // could be mid-flight
```

### Capture Pattern For Spawn Position

To test where actors **start**, capture synchronously immediately after the animation is initiated — before any async frame executes:

```typescript
activeAnimation = renderer.animateResolvedAirCombatShow(scene);
// Synchronous snapshot here: JS single-thread guarantees no frames have run yet
spawnSnapshot = captureActorPositions();
```

### Capture Pattern For Phase-Specific Position

To test actor positions at a specific phase, use a probe that fires at the exact start of that phase before any movement within the phase occurs. Document which probe event you are hooking and why it corresponds to the pre-movement state.

### Assertion Must Reference The Moment

The assertion message must identify the moment and the coordinate space:

```typescript
// ✅ GOOD
expect(
  isOutside,
  `actor ${role} cx=${cx} cy=${cy} is inside viewBox [${vb.x},${vb.y} ${vbRight}x${vbBottom}] — checked at spawn, before first animation frame`
).toBe(true);
```

### Coordinate Space Must Be Explicit

Always state which coordinate system the assertion uses:
- SVG viewBox coordinates (from `viewBox.baseVal`) — not CSS pixels, not screen pixels
- Read from `element.getAttribute("x")` / `getAttribute("y")` — set by `positionAircraftImageGhost`

Mixing coordinate spaces silently produces wrong bounds comparisons.

---

## Step 3: Report

Record what actually happened.

The report must distinguish:

- observed behavior
- expected behavior
- confirmed facts
- open uncertainty

Do not collapse interpretation into observation.

## Step 4: Evaluate For Issues

Compare the report against the source-of-truth specification.

Evaluation asks:

- what part of the spec is satisfied
- what part is violated
- whether the failure is structural or cosmetic
- whether the issue is local or evidence of broader drift

This is the explicit anti-drift checkpoint.

## Step 5: Analyze Root Cause For Issues

Determine the root cause at the correct architectural layer.

Analysis must avoid:

- treating a rendering symptom as an engine truth problem without evidence
- treating a logging discrepancy as purely UI if the data contract is wrong
- treating a passing narrow test as proof that the system is aligned

Root cause should be stated in terms of ownership, contract, sequencing, or state truth.

## Step 6: Plan Effective Solution, Not Just A Patch

Plan the smallest effective change that restores alignment with the goal and the north star specification.

The plan must include:

- what will change
- what will not change
- what must be verified after the change
- what new drift risks the change could create

If the fix is too large to reason about safely, split it into smaller aligned iterations.

Never skip the plan-quality checks below. They are mandatory parts of Step 6.

## Step 6.1: Review Plan Against North Star Spec

Before implementation:

- reopen the current source-of-truth specification
- restate the full architectural objective, not just the current symptom
- identify which layer owns truth for the behavior under investigation
- confirm the plan serves the full goal rather than a narrow local artifact
- confirm the plan does not introduce a second source of truth, duplicate ownership, or a convenience workaround that violates the spec

This is the required realignment review before code changes.

## Step 6.2: Realign Plan If Needed

If the plan does not cleanly serve the north star:

- revise the plan before implementing
- narrow or widen scope as needed to restore alignment
- reject patch-only fixes that leave the architectural problem intact
- explicitly call out if a spec update is needed instead of silently changing the target

Do not proceed to implementation until the plan is aligned.

## Step 7: Implement Fix Or Fixes

Implement the planned change without redefining the target.

During implementation:

- preserve the architectural owner of truth
- avoid introducing duplicate logic paths
- avoid temporary side channels that can become permanent drift
- keep the diff small enough to verify with confidence

## Step 8: Update Test To Improve Diagnosis If Needed

After implementation, improve the test when the current test is too weak to explain failures, regressions, or architectural drift.

Test improvement may include:

- stronger assertions
- better scenario coverage
- improved instrumentation
- clearer diagnostics
- a more representative reproduction

The goal is not just to prove the latest change passed once. The goal is to improve the loop's ability to diagnose the next failure accurately.

## Step 9: Repeat Until Goal Is Achieved

If the problem is not fully resolved, the next iteration starts again at Step 1: Understand the Exact User Complaint.

The loop is not:

- test -> tweak -> test -> tweak

The loop is:

- understand complaint -> test -> report -> evaluate -> analyze -> plan -> review against spec -> realign plan if needed -> implement -> update test if needed -> repeat

## Drift Prevention Rules

- Never let the currently visible symptom redefine the whole problem.
- Never let a historical plan document outrank the active source-of-truth specification.
- Never accept a local pass if the system-level north star is still violated.
- Never treat convenience architecture as acceptable if it splits ownership of truth.
- Never update the process document to excuse implementation drift.
- Never skip any part of Step 6 because the local fix feels obvious.
- Never test for a symptom different from the user's exact complaint.
- Never proceed with testing if the user complaint is ambiguous - ask for clarification.
- Never assume the bug is structural when it may be visual, or vice versa - verify with evidence.

## Required Deliverables For Spec-Driven Work

Each active effort should maintain or reference:

- one source-of-truth specification
- one governing iteration procedure
- current verification evidence
- a blocked note when the spec and implementation cannot be safely reconciled without a decision

## Exit Conditions

An iteration can close only when one of these is true:

- the implementation is aligned with the source-of-truth specification for the targeted scope
- the remaining gap is explicitly captured as a new bounded follow-up aligned to the same spec
- work is blocked and the blocking conflict is stated clearly

Anything else is partial progress, not completion.

---

## Testing Infrastructure

This project provides three test harnesses for different testing needs. Choose the right tool for the complaint being investigated.

### Test Harness Overview

| Harness | Command | Use Case | What It Tests |
|---------|---------|----------|---------------|
| **Original** | `npm test` | Logic, data structures, integration | Internal state, report data |
| **JEST** | `npm run test:jest` | DOM state, computed styles | Actual visual properties |
| **Playwright** | `npm run test:e2e` | Full browser, visual regression | True rendered pixels |

### When to Use Each Harness

**Use Original Custom Harness (`npm test`) when:**
- Testing business logic
- Verifying data transformations
- Checking report structures
- Testing state machines
- Fast feedback during development

**Use JEST (`npm run test:jest`) when:**
- Testing **what is actually shown** in the DOM
- Verifying `opacity`, `display`, `visibility` properties
- Testing computed styles
- Checking element existence/attributes
- User reports visual disappearance/appearance issues

**Use Playwright (`npm run test:e2e`) when:**
- Testing actual browser rendering
- Visual regression testing (comparing screenshots)
- Complex user interactions
- Cross-browser compatibility
- Pixel-perfect verification required
- User reports rendering issues at specific moments

### Testing by Complaint Type

| User Complaint | Primary Harness | What to Assert |
|----------------|-----------------|----------------|
| "Sprites disappear" | JEST or Playwright | `expect(element).toBeVisible()`, `opacity: 1` |
| "Animation jumps" | JEST | Position continuity, no teleporting |
| "Wrong colors/styles" | Playwright | Screenshots, computed styles |
| "Button doesn't work" | Playwright | Click interactions, navigation |
| "Wrong data shown" | Original or JEST | DOM text content, element attributes |
| "Timing issues" | Playwright | Real-time animation capture |

### JEST Testing Guide

**Location:** `tests/*.jest.test.ts`

**Key Utilities:**
```typescript
import { isElementVisible, getElementOpacity, captureVisualState } from './jest.setup';

// Test actual visual opacity (not internal flag)
expect(actor.image.style.opacity).toBe('1');
expect(getElementOpacity(element)).toBe(1);

// Test visibility in DOM
expect(isElementVisible(element)).toBe(true);

// Capture full state for debugging
const state = captureVisualState(element);
// Returns: { exists: true, opacity: '1', display: 'block', position: {...} }
```

**Critical Rule:**
- ❌ BAD: `expect(actor.active).toBe(true)` - tests internal data structure
- ✅ GOOD: `expect(actor.image.style.opacity).toBe('1')` - tests actual visual state

**Run:**
```bash
npm run test:jest        # Run once
npm run test:jest:watch  # Run in watch mode
```

### Playwright Testing Guide

**Location:** `tests/e2e/*.spec.ts`

**Key Features:**
- Real browser automation (Chromium, Firefox, WebKit)
- Screenshot capture on failure
- Video recording of test runs
- Visual regression testing

**Example:**
```typescript
test('aircraft remain visible', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-testid="play-airshow"]');
  
  // Test actual rendered state
  const bomber = page.locator('[data-role="bomber"]');
  await expect(bomber).toHaveCSS('opacity', '1');
  await expect(bomber).toBeVisible();
  
  // Screenshot for verification
  await page.screenshot({ path: 'test-results/visible.png' });
});
```

**Run:**
```bash
npm run test:e2e        # Run all E2E tests
npm run test:e2e:ui     # Run with visual debugger
npm run test:e2e:debug  # Debug mode
```

**Installation (one-time):**
```bash
npm install
npx playwright install
```

### Visual Regression Testing

Playwright supports comparing to baseline screenshots:

```typescript
test('layout matches baseline', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('baseline.png');
});
```

Update baselines after intentional visual changes:
```bash
npx playwright test --update-snapshots
```

### Test Selection Decision Tree

When investigating a user complaint, ask:

1. **Is it a visual/rendering issue?**
   - YES → Use JEST or Playwright
   - NO → Use Original harness

2. **Does it involve DOM visibility or computed styles?**
   - YES → Use JEST
   - NO → Continue...

3. **Does it require actual browser rendering or screenshots?**
   - YES → Use Playwright
   - NO → Use Original harness

4. **Is the bug intermittent or timing-dependent?**
   - YES → Use Playwright (more reliable than jsdom)
   - NO → Any harness

### Governance Rule: Test What Is Actually Shown

**MANDATORY:** When the user reports a visual issue, the test must verify the actual visual output, not internal state.

**Violation Examples:**
- ❌ User: "Aircraft disappear" → Test: `expect(actor.active).toBe(true)`
- ✅ User: "Aircraft disappear" → Test: `expect(actor.image.style.opacity).toBe('1')`

**Why:** Internal state (`active` flag) and visual state (`opacity`) can diverge. The bug was that actors had `active=true` but `opacity=0`. Only testing visual state catches this.

### Continuous Integration

All three test suites should run in CI:

```bash
# Full test suite
npm test              # Original harness
npm run test:jest     # JEST DOM tests
npm run test:e2e      # Playwright E2E tests
```

**Failure Priority:**
1. Playwright failures (real user experience)
2. JEST failures (DOM state)
3. Original harness failures (logic)
