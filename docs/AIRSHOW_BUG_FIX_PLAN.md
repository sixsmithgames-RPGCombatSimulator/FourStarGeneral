# Airshow Bug Fix Plan

Governing spec: `docs/AIR_SHOW_NORTH_STAR_SPEC.md`
Test oracle: `tests/e2e/airshow-choreography.spec.ts` — full choreography invariant test
Failing tests as of this plan: 2 (choreography + side-separation)

---

## Open Bugs Being Fixed (in priority order)

| # | Bug | Spec Reference | Playwright Measurement |
|---|-----|----------------|------------------------|
| 1 | Both factions egress toward same side (player HQ) | §Scenario 5 Phase 5 | interceptors cx=333-349, escorts cx=616-624, midX=574 |
| 2 | Bombers travel at near-fighter speed during fighter-ingress | §Speed Principles | ratio=0.95, requires <0.75 |

---

## Bug 1 — Egress Direction Wrong For Both Factions

### Root Cause (confirmed)

Egress target points are computed with `corridorPoint(alongPx, lateralPx)` which calls
`projectAirShowCorridorPoint(corridor, alongPx, lateralPx)`:

```
cx = corridor.center.cx + corridor.axis.x * alongPx + corridor.normal.x * lateralPx
```

The corridor `axis` points from **bot HQ → player HQ** (positive = player side).
Both egress targets use **positive** `alongPx`:

- Escorts: `corridorPoint(108 + ..., 138 + ...)` → positive along → player side ✓ (correct)
- Interceptors: `corridorPoint(-146 - ..., -156 - ...)` → negative along → bot side

Wait — interceptors use **negative** along. But Playwright measured them at cx=333, well left of
midX=574. The corridor center must itself be on the right half of the map, so negative-along
from center still lands in the left half.

The real fault: egress targets are hardcoded offsets from **corridor center** (the combat hex),
not from the **HQ origins**. The corridor center is near the middle of the map. A 146px offset
from center is still within the map bounds and does not guarantee the actor reaches its own HQ
side before fading out. With the current map (midX=574, corridor center near center), a -146px
along offset puts interceptors at ~cx=330 — still left of midX, which is player territory.

`hqAxis` is already available in `animateResolvedAirCombatShow` (passed to
`normalizeAirShowSceneFlightAnchors`). It must also be used to compute egress targets.

### Fix

**In `animateResolvedAirCombatShow` (around line 3642-3657) and `inspectResolvedAirCombatShow`
(around line 2368-2379):**

Replace the hardcoded `corridorPoint(...)` egress targets for interceptors and escorts with
faction-aware off-map destinations derived from `hqAxis`:

```typescript
// Faction-aware egress: escort → playerOrigin side, interceptor → botOrigin side
const egressPoint =
  flight.spec.role === "bomber"
    ? /* existing bomber logic — unchanged */
    : (() => {
        // Use hqAxis when available so each faction exits toward its own HQ
        if (hqAxis) {
          const origin = flight.spec.faction === "Bot" ? hqAxis.botOrigin : hqAxis.playerOrigin;
          return this.offsetAirShowPoint(
            origin,
            corridor.normal.x * (index - (egressFlights.length - 1) / 2) * 72
              + (rand() - 0.5) * 22,
            corridor.normal.y * (index - (egressFlights.length - 1) / 2) * 72
              + (rand() - 0.5) * 18
          );
        }
        // Fallback (no hqAxis): existing corridor-relative offsets
        return flight.spec.role === "escort"
          ? corridorPoint(108 + index * 18 + rand() * 16, 138 + index * 18 + (rand() - 0.5) * 24)
          : corridorPoint(-146 - index * 18 - rand() * 16, -156 - index * 20 + (rand() - 0.5) * 24);
      })();
```

Both the `inspectResolvedAirCombatShow` path and the `animateResolvedAirCombatShow` path have
identical egress-point logic and must both be updated.

### Detection (test must pass after fix)

`airshow-choreography.spec.ts` Invariant 6 — egress direction check with 30px margin.
Expected result: zero `EGRESS` violations.

---

## Bug 2 — Bombers Travel at Fighter Speed During Fighter-Ingress

### Root Cause (confirmed)

`normalizeAirShowSceneFlightAnchors` places all flights (including bombers) at `hqAxis.playerOrigin`
or `hqAxis.botOrigin` — 2000px off-map. The `fighter-ingress` phase then animates **all**
`ingressAssignments` (which includes `bomberIngressBandAssignments`) with `fighterIngressDurationMs`
(1250-1680ms). Bombers travel ~2000px in 1680ms — the same rate as fighters traversing their
~500-700px paths. Measured ratio: 0.95 (requires <0.75).

The existing comment in the code (lines 2691-2697) describes a path-length speed differential
("fighters have a shorter path, making them visibly faster") that is **not achieved** when both
factions spawn 2000px off-map — all paths are equally long.

`resolveAirShowBomberIngressBandHoldTarget`'s `cappedAdvancePx` limit (18-32px creep from current
position) was designed for on-map starts, not 2000px off-map starts.

### Fix

Decouple bomber ingress from the fighter-ingress phase animation. Run them at different durations
within the same wall-clock window using `Promise.all`:

**In `animateResolvedAirCombatShow` (around line 2703):**

```typescript
// Fighters sprint to hold positions at fighter speed
const fighterOnlyAssignments = spacedIngressAssignments.filter(
  a => a.actor.role !== "bomber"
);
// Bombers creep in at bomber speed (2x fighter duration)
const bomberOnlyAssignments = spacedIngressAssignments.filter(
  a => a.actor.role === "bomber"
);
const bomberDurationMs = Math.max(3000, scene.bomberIngressDurationMs ?? 3500);

await Promise.all([
  this.runAirShowPhase(fighterOnlyAssignments, fighterIngressDurationMs, [], { easing: "linear", sceneActors }),
  this.runAirShowPhase(bomberOnlyAssignments, bomberDurationMs, [], { easing: "linear", sceneActors })
]);
```

This requires that `runAirShowPhase` can safely run concurrently for non-overlapping actor sets
(fighters and bombers are distinct actors). Verify `runAirShowPhase` has no shared mutable state
across its actor set before applying.

If `runAirShowPhase` has shared state (e.g. a shared phase label or sampler), an alternative is
to give bombers a **proportionally longer path target** so their distance at `fighterIngressDurationMs`
equals `distance × (fighterDuration / bomberDuration)`:

```typescript
// Bomber hold target = halfway between spawn origin and final band hold position
// so that at fighter speed they only travel half the distance a fighter does
const scaledHoldTarget = midpoint(anchor, finalBomberBandHoldTarget);
```

Prefer the `Promise.all` approach as it is architecturally cleaner and directly expresses the
spec's intent of concurrent animations at different speeds.

### Detection (test must pass after fix)

`airshow-choreography.spec.ts` Invariant 3 — `fighter-ingress` bomber/fighter speed ratio < 0.75.
Expected result: zero `INGRESS SPEED` violations.

---

## Implementation Order

1. **Fix Bug 1 (egress direction)** — isolated change in two egress-point computations.
   No animation timing changes. Lower risk.

2. **Verify Bug 1** — run choreography test, confirm zero `EGRESS` violations.
   Side-separation test (`airshow-visual.spec.ts`) should also pass once interceptors exit right.

3. **Fix Bug 2 (bomber ingress speed)** — concurrent phase approach.
   First verify `runAirShowPhase` concurrency safety, then apply.

4. **Verify Bug 2** — run choreography test, confirm ratio < 0.75.

5. **Full suite run** — both choreography and visual spec tests green.

---

## Acceptance Criteria

All of the following must be true after fixes:

- `tests/e2e/airshow-choreography.spec.ts` — **0 violations** (currently 6)
- `tests/e2e/airshow-visual.spec.ts` — **all 6 tests pass** (currently 5 pass, 1 fail)
- No regressions in `npm test` (Jest suite)

### Invariant Mapping

| Test Invariant | Fixes Bug | Pass Condition |
|----------------|-----------|----------------|
| SPAWN off-map | — (already passing) | fighters start outside viewBox |
| INGRESS side separation | — (already passing with 70% cutoff) | interceptors/escorts opposite sides in first 70% of ingress |
| INGRESS SPEED ratio < 0.75 | Bug 2 | bombers avg px/200ms < 75% of fighters |
| INGRESS TRAIL bombers behind escorts | — (already passing) | escorts closer to midX than bombers |
| BOMBER-INGRESS SPEED ratio < 0.6 | — (already passing) | bombers slower in bomber-ingress phase |
| EGRESS interceptors exit right | Bug 1 | interceptors cx > midX - 30 throughout egress |
| EGRESS escorts exit left | Bug 1 | escorts cx < midX + 30 throughout egress |

---

## What Followed This Plan

The issues that were previously deferred from this plan are now covered by the governed renderer
and dedicated regression checks in `AIR_SHOW_NORTH_STAR_SPEC.md` / `tests/AirShow.regression.test.ts`:

- Bombers no longer wait until target arrival before the fighter clash reads as engaged
- Escorts no longer snap into a near-180° reversal at clash entry
- Bomber-defense-pass now keeps attack ownership on the interceptors instead of painting a mutual dogfight
- Surviving bombers now remain continuous across ordnance and egress transition
