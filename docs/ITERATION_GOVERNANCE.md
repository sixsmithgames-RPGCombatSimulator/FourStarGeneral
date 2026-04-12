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

1. Test
2. Report
3. Evaluate for issues
4. Analyze root cause for issues
5. Plan effective solution, not just a patch
5.1. Review plan against north star spec
5.2. Realign plan if needed
6. Implement fix or fixes
7. Update test to improve diagnosis if needed
8. Repeat this loop until goal is achieved

Never skip any part of step 5.
No step may be skipped because a local bug appears obvious.

## Step 1: Test

Start each iteration by testing the real system or the closest deterministic harness available.

Testing may include:

- automated tests
- scenario diagnostics
- focused reproductions
- instrumentation
- UI playback verification

The test must answer a concrete question tied to the goal. Test first, even when the bug appears obvious.

## Step 2: Report

Record what actually happened.

The report must distinguish:

- observed behavior
- expected behavior
- confirmed facts
- open uncertainty

Do not collapse interpretation into observation.

## Step 3: Evaluate For Issues

Compare the report against the source-of-truth specification.

Evaluation asks:

- what part of the spec is satisfied
- what part is violated
- whether the failure is structural or cosmetic
- whether the issue is local or evidence of broader drift

This is the explicit anti-drift checkpoint.

## Step 4: Analyze Root Cause For Issues

Determine the root cause at the correct architectural layer.

Analysis must avoid:

- treating a rendering symptom as an engine truth problem without evidence
- treating a logging discrepancy as purely UI if the data contract is wrong
- treating a passing narrow test as proof that the system is aligned

Root cause should be stated in terms of ownership, contract, sequencing, or state truth.

## Step 5: Plan Effective Solution, Not Just A Patch

Plan the smallest effective change that restores alignment with the goal and the north star specification.

The plan must include:

- what will change
- what will not change
- what must be verified after the change
- what new drift risks the change could create

If the fix is too large to reason about safely, split it into smaller aligned iterations.

Never skip the plan-quality checks below. They are mandatory parts of Step 5.

## Step 5.1: Review Plan Against North Star Spec

Before implementation:

- reopen the current source-of-truth specification
- restate the full architectural objective, not just the current symptom
- identify which layer owns truth for the behavior under investigation
- confirm the plan serves the full goal rather than a narrow local artifact
- confirm the plan does not introduce a second source of truth, duplicate ownership, or a convenience workaround that violates the spec

This is the required realignment review before code changes.

## Step 5.2: Realign Plan If Needed

If the plan does not cleanly serve the north star:

- revise the plan before implementing
- narrow or widen scope as needed to restore alignment
- reject patch-only fixes that leave the architectural problem intact
- explicitly call out if a spec update is needed instead of silently changing the target

Do not proceed to implementation until the plan is aligned.

## Step 6: Implement Fix Or Fixes

Implement the planned change without redefining the target.

During implementation:

- preserve the architectural owner of truth
- avoid introducing duplicate logic paths
- avoid temporary side channels that can become permanent drift
- keep the diff small enough to verify with confidence

## Step 7: Update Test To Improve Diagnosis If Needed

After implementation, improve the test when the current test is too weak to explain failures, regressions, or architectural drift.

Test improvement may include:

- stronger assertions
- better scenario coverage
- improved instrumentation
- clearer diagnostics
- a more representative reproduction

The goal is not just to prove the latest change passed once. The goal is to improve the loop's ability to diagnose the next failure accurately.

## Step 8: Repeat Until Goal Is Achieved

If the problem is not fully resolved, the next iteration starts again at Step 1: Test.

The loop is not:

- test -> tweak -> test -> tweak

The loop is:

- test -> report -> evaluate -> analyze -> plan -> review against spec -> realign plan if needed -> implement -> update test if needed -> repeat

## Drift Prevention Rules

- Never let the currently visible symptom redefine the whole problem.
- Never let a historical plan document outrank the active source-of-truth specification.
- Never accept a local pass if the system-level north star is still violated.
- Never treat convenience architecture as acceptable if it splits ownership of truth.
- Never update the process document to excuse implementation drift.
- Never skip any part of Step 5 because the local fix feels obvious.

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
