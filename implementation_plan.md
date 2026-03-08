# Implementation Plan: Restore Enemy Presence in Training Scenario

## Context
Enemy units disappear in training after repositioning; prior attempts added incorrect edits. Need a standards-compliant, minimal fix that fails fast when bot forces are missing.

## Goals
1. Ensure GameEngine cannot initialize without bot placements when bot units exist in the scenario.
2. Keep behavior unchanged otherwise; no refactor + feature mixing.

## Steps
1) Add constructor invariant in `GameEngine` to validate botSide.units are seeded into `botPlacements` right after seeding; throw with clear message if empty.
2) (Optional if required) Add small inline comment documenting why we enforce the invariant (to prevent silent enemy removal in tutorial flow).
3) Verify types/lint locally for the touched file scope (manual reasoning if commands unavailable) and note manual visual check required by standards.

## Impact/Blast Radius
- High-risk file: `src/game/GameEngine.ts` (constructor). Affects engine initialization for all missions.
- Behavior change: only in error handling—engine will throw early if bot units cannot seed placements. Normal flows remain unchanged.
- UI: none directly; possible surfaced error instead of silent missing enemies.

## Validation
- Build/lint: reasoning only (cannot run here). Ensure no new `any`, no unused vars.
- Runtime sanity: start training mission; expect no errors and bots present. If invariant triggers, error message will show cause.
- Manual checklist (visual): enemy units render on map; enemy turn shows actions (per standards).
