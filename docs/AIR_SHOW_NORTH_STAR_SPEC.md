# Air Show North Star

Status: canonical implementation and acceptance specification

Last revised: 2026-08-03

Owner: battle presentation

## 1. Purpose

The air show is a deterministic visual account of combat that the game engine has
already resolved. It is not a flight simulator and it must never alter combat
results. Its job is to make fighter engagements, escort actions, flak, bombing
runs, losses, and exits readable as one continuous production-quality sequence.

This file is the only governing air show specification. Historical TODO files and
bug ledgers are not implementation authority.

## 2. Audit Findings

The previous implementation failed for architectural reasons, not because a few
curves needed different control points.

### 2.1 Split ownership

- `AirShowPlaybackPlanner` delegated geometry, timing, sampling, speed repair,
  viewport correction, tracers, flak, and visibility back to private
  `HexMapRenderer` callbacks.
- Contested packages used `animateResolvedAirCombatShow` while standalone and
  tutorial strikes used `animateAircraftSortie` or an older leg-by-leg fallback.
- A fix in one path therefore did not establish the same behavior elsewhere.

### 2.2 Timing was solved backward

- Phase durations began as fixed values multiplied by unrelated sequence and role
  factors.
- Paths were extended, truncated, smoothed, and extended again to consume those
  windows.
- The repair pipeline produced hookbacks, near-180-degree transitions, speed
  drift, and target overshoot.

### 2.3 View state changed choreography

- Viewport-safe anchors, visible-bound trimming, and visibility harmonization
  changed path geometry according to zoom and screen size.
- The same resolved combat could therefore produce a different show on another
  viewport.

### 2.4 Effects controlled actor continuity

- Standalone bombing playback awaited target effects between separately governed
  movement legs.
- Phase visibility synchronization could hide actors omitted from an assignment.
- Bombers could disappear while explosion effects were active and reappear for
  return movement.

### 2.5 Flak was grouped by construction

- A battery generated synchronized waves containing many puffs.
- Multiple bombers could replay similar wave geometry at similar progress values.
- The result looked like intermittent painted clusters instead of sustained,
  independently timed fire.

### 2.6 Tests were not an acceptance gate

- The diagnostic report moved real production findings into
  `legacyDiagnosticFindings`, while its fail gate inspected only `findings`.
- A green report concealed hard reversals, misaligned tracers, and short tracer
  streaks.
- Jest visual tests inspected planner samples, not actual animated frames.
- Browser fixtures replaced real `BattleScreen` behavior with private stubs.
- The real tutorial flow did not assert bomber continuity through explosions.
- Approved screenshots did not cover flak, impact continuity, destruction, or
  egress and did not present the 20x20 battle at a readable scale.

## 3. Product Goals

The completed air show must:

1. Tell a readable beginning, engagement, strike, and exit story.
2. Use authored engagement patterns rather than autonomous per-aircraft AI.
3. Keep every aircraft on one continuous identity and timeline.
4. Derive every movement duration from measured path length and role speed.
5. Produce the same timeline from the same scene, map geometry, and seed.
6. Work on small, large, square, and rectangular maps.
7. Use one planner and one player for tutorial, standalone, and contested shows.
8. Keep effects independent from aircraft movement and lifecycle.
9. Make every diagnostic failure actionable and release blocking.

## 4. Non-Goals

- Aerodynamic simulation, collision avoidance AI, or free-flight steering.
- Random flight paths or random phase order.
- Re-resolving combat outcomes during playback.
- Moving origins or rails to make the current viewport more convenient.
- Extending a path only to fill a predetermined duration.

## 5. Governing Invariants

### 5.1 Geometry

- All choreography uses rendered-map pixel coordinates.
- The map envelope is calculated from every rendered hex center plus half the
  rendered hex width and height.
- Player and bot HQ centers are known planner inputs.
- Each faction origin is the intersection of the outward HQ-axis ray with the map
  envelope plus exactly 500 pixels.
- Aircraft never originate from the browser viewport or a theoretical maximum map.
- The attack corridor runs from the attacking faction origin through the target.
- The initial fighter merge is a marked point on that corridor before the target.
- Camera framing may read timeline bounds but may not change any timeline value.

### 5.2 Motion

- Fighter speed is `0.115 px/ms`.
- Bomber speed is `0.0575 px/ms`.
- A movement segment is authored first and measured second.
- Segment duration is `measuredLengthPx / roleSpeedPxPerMs`.
- Synchronization uses spawn time, authored anchor placement, or a measured route
  authored before the immutable timeline is frozen.
- A route may be length-governed to make a planned meeting possible at role speed,
  but it must remain one intentional forward-moving rail. Runtime repair merely to
  consume a fixed window is prohibited.
- Synchronization may not use frozen holds, hookbacks, path truncation, hidden
  movement, target overshoot, or post-plan geometry mutation.
- Adjacent path samples may not turn more than 38 degrees for fighters or 24
  degrees for bombers.
- Across each 100ms playback interval, cumulative heading change may not exceed
  67 degrees for fighters or 32 degrees for bombers. Fighter break turns are
  designed to 55 degrees or less per interval to retain verification headroom.
- Phase boundaries must be position continuous and heading continuous.

### 5.3 Determinism and spacing

- The scene seed is derived from stable scene and participant identifiers.
- Seeded variation may affect lane side, small lateral offsets, tracer selection,
  flak timing, and effect placement.
- Seeded variation may not affect scenario selection, path topology, role speed,
  origin distance, target location, or combat result.
- Fighter sprite centers must remain at least 18 pixels apart at planned merges.
- Bomber sprite centers must remain at least 56 pixels apart through ingress and
  target run so the enlarged bomber silhouettes do not visually collapse.

### 5.4 Lifecycle

- A sprite element is created once when its track becomes visible.
- It remains the same element until it exits or completes a governed destruction
  exit.
- Ground explosions, flak, tracers, dust, and smoke never await or block movement.
- A tutorial visual-seed bomber remains visible through release, impact, and
  egress even when recorded post-resolution strength is zero.
- A combat loss creates a destruction cue and short continuous exit; it does not
  cause an unexplained disappearance.

## 6. Canonical Architecture

```text
Resolved combat scene + immutable map geometry
                    |
                    v
            AirShowDirector.plan
                    |
                    v
          Immutable AirShowTimeline
             /              \
            v                v
   AirShowTimelinePlayer   Camera framing
            |
            v
      SVG sprites and effects
```

### 6.1 AirShowDirector

`AirShowDirector` is a pure module. It receives:

- resolved participants, roles, factions, strengths, exchanges, and losses;
- rendered map bounds and hex dimensions;
- player HQ, bot HQ, engagement, and target centers;
- a stable deterministic seed.

It returns an immutable timeline containing:

- scenario family and geometry markers;
- actor descriptors and stable actor IDs;
- absolute-time movement tracks;
- measured segment lengths, speeds, and durations;
- semantic beats;
- tracer, flak, release, impact, smoke, destruction, and exit cues;
- an invariant verification report.

It has no DOM, renderer, timer, animation-frame, camera, or viewport dependency.

### 6.2 AirShowTimelinePlayer

The player:

- creates runtime sprites from timeline actors;
- samples all active tracks from one elapsed-time clock;
- fires each semantic cue once when its absolute time is crossed;
- never changes path geometry or duration;
- never hides an actor merely because another actor is in a different beat;
- removes sprites only after their timeline lifecycle ends;
- exposes the current timeline and clock for diagnostics and browser tests.

### 6.3 Renderer boundary

`HexMapRenderer` may:

- resolve map and hex centers before planning;
- create, position, and remove SVG sprite elements;
- paint tracer, flak, explosion, dust, and smoke primitives;
- request animation frames.

It may not design rails, repair paths, decide phase timings, or change actor
visibility outside the timeline lifecycle.

## 7. Scenario Templates

Every scene selects exactly one template.

### 7.1 Strike only

1. Bombers spawn at the attacking HQ-side origin.
2. They fly spaced parallel ingress rails through approach and release markers.
3. Bomb release fires the target impact cue without interrupting movement.
4. Bombers pass the target, execute one authored shallow 160-degree turn, and
   leave through the attacking faction side.

### 7.2 Escorted strike

1. Bombers and escorts originate on the attacking side.
2. Escorts fly parallel screen rails ahead and outside the bomber lanes.
3. Each escort rendezvous path is length-governed so its target-run screen starts
   and ends with a bomber target run while retaining fighter speed.
4. The package performs the same release and exit pattern as strike only.

### 7.3 Intercepted strike

1. Defending CAP and bombers are back-calculated to a common intercept marker.
2. CAP crosses the bomber corridor on a single attack pass.
3. Tracers use sampled source and target positions at cue time.
4. Surviving aircraft continue into authored faction exits.

### 7.4 CAP clash

1. Opposing fighters enter head-on from their faction origins.
2. The first merge is simultaneous and lane spaced.
3. The scramble beat changes lanes and target pairing through smooth preset rails.
4. The template contains no bomber, target-run, flak, or impact beat.
5. Survivors exit toward their faction side.

### 7.5 Full engagement

1. Opposing fighters are back-calculated to the head-on merge.
2. The scramble beat uses a compact preset break turn, switches pairings, and
   avoids repeated reciprocal passes.
3. Fighter clash and escort-arrival durations are solved first.
4. Bomber spawn time and the smooth post-intercept strike corridor are calculated
   backward from the solved fighter rendezvous.
5. Surviving CAP performs one bomber-defense crossing pass.
6. Escorts rendezvous with the package and remain synchronized through the
   complete bomber target run while retaining fighter speed.
7. Every surviving role follows an authored faction exit.

## 8. Pairing and Ganging

- First-merge pairing is deterministic by stable actor order.
- If one side has additional fighters, extra actors gang onto the least-supported
  opponent in round-robin order.
- Scramble pairing rotates the opponent index by one.
- When only one opponent exists, the target remains but the attacker switches
  lane and attack side.
- Pairing controls tracer targets and rail selection, not combat resolution.

## 9. Flak Model

- Flak is an absolute-time sequence of individual puff cues.
- Each battery and bomber pair gets a stable independent seed.
- Cue intervals use bounded deterministic jitter to avoid synchronized volleys.
- Puff centers are sampled from the bomber track at cue time, then offset within a
  bounded along-track and lateral envelope.
- A cue paints one primary black burst and at most two lingering smoke elements.
- Smoke persists for 1.4 to 2.4 seconds and may overlap later cues.
- No phase contains a multi-puff grouped volley object.

## 10. Timing Procedure

The director follows this order exactly:

1. Resolve map envelope, HQ origins, attack axis, target, merge, intercept, release,
   turn, and exit markers.
2. Select the scenario template.
3. Assign stable actor lanes and pairing relationships.
4. Build complete authored paths for every actor.
5. Measure every path segment using the same sampler used by playback.
6. Derive segment durations from the role speed.
7. Solve common meetings using actor start times.
8. Shift the whole timeline if any solved start time is negative.
9. Place semantic cues at absolute path-crossing times.
10. Verify all invariants and reject an invalid timeline.

## 11. Acceptance Tests

### 11.1 Pure contract tests

For all five scenario families on 10x10, 20x20, and rectangular fixtures:

- origins are exactly 500 pixels beyond the tile envelope;
- path and phase labels match the selected template;
- segment lengths are positive and independently measured;
- realized speed differs from role speed by no more than `0.0005 px/ms`;
- tracks are continuous across every segment;
- heading-change limits pass;
- merge and intercept arrivals are within 20ms and 8px;
- opposing merge-lane centroids remain within 36px and every fighter comes within
  68px of at least one opponent at the marked merge;
- opposing scramble centroids remain within 210px and at least one opposing pair
  remains within 160px at the shared scramble midpoint;
- every escort target run shares the start and end time of a bomber target run;
- aircraft role speeds remain exact while escort and bomber windows overlap;
- same-flight bomber centers remain at least 56 pixels apart from bomber ingress
  through the shared target-run window;
- no target-run point extends beyond the authored exit;
- CAP-only timelines contain no strike cues;
- the same input produces byte-equivalent timeline data.

### 11.2 Player tests

Using a controllable clock and actual SVG elements:

- one element is used for each actor identity;
- bomber elements remain visible while impact promises are unresolved;
- cues fire once even when a frame skips over their exact time;
- actor position equals director sampling at checkpoints;
- effects do not alter the clock or actor lifecycle;
- cleanup removes every actor after completion or error.

### 11.3 Integration tests

- Real `BattleScreen` air-operation preparation feeds the canonical director.
- Standalone/tutorial and contested packages call the same timeline player.
- No production route calls the legacy sortie or leg fallback.
- Diagnostics inspect the exact timeline sent to playback.
- The actual Training Exercise scenario verifies bomber identity and visibility
  continuously through release, impact, and unresolved explosion playback.

### 11.4 Browser certification

The actual tutorial and a real 20x20 battle are played at desktop and mobile
viewports. Required evidence covers:

- origin and first visible ingress;
- head-on merge;
- scramble and switched pairing;
- bomber-defense pass;
- sustained independent flak;
- release and impact with bombers still visible;
- governed bomber turn;
- destruction continuity;
- faction-correct egress;
- full-sequence video or timestamped frame series.

No unrelated deployment modal or panel may obscure acceptance frames.

Static screenshots certify paint, framing, and obstruction only. They do not
certify motion. The primary iterative movement gate is a timestamped temporal
trace sampled every 100ms from the painted SVG nodes using the player's exposed
timeline clock. At this cadence a fighter travels 11.5px and a bomber travels
5.75px, which is frequent enough to expose discontinuities without recording
every animation frame.

Every temporal sample records:

- elapsed timestamp and active semantic beat;
- actor, flight, role, combat role, and faction identifiers;
- actual SVG center, width, height, heading, active flag, computed opacity, and
  node connectivity for every aircraft sprite;
- bomb-release and destruction state;
- cumulative tracer, flak, release, impact, and destruction cue counts;
- currently painted flak-burst and flak-smoke counts.

The temporal audit fails on sparse sampling, lifecycle gaps, hidden active
actors, role-speed drift, speed spikes, excessive 100ms heading change,
misaligned merge, absent pairing switch, split scramble, bomber overlap, stalled
flak cadence, bomber disappearance through impact, or faction-wrong egress. Each
run writes a concise text verdict plus full JSON and row-per-aircraft CSV logs
under `diagnostics/playwright/airshow-traces/latest/`.

## 12. Diagnostic Policy

- There is one findings collection.
- Every error-severity geometry, timing, continuity, tracer, lifecycle, or ownership
  finding fails the command.
- Findings may carry source metadata but may not be reclassified to avoid failure.
- The report headline includes every finding category.
- Soft visual notes are explicitly named warnings and never mixed with passed
  invariants.

## 13. Migration Plan

### Milestone 0: authority and truthful gates

- Replace conflicting documentation with this specification.
- Set the origin constant to 500 pixels.
- Remove legacy-finding suppression from the report gate.
- Add failing contract tests for current production defects.

Exit criterion: the existing defects are visible as failures, not hidden by the
reporter.

### Milestone 1: pure timeline core

- Add timeline types, path sampling, deterministic random helpers, templates, and
  invariant verification.
- Cover all five scenario families with pure tests.
- Keep the old renderer player temporarily behind an adapter only for comparison.

Exit criterion: all pure timeline tests pass without a DOM or renderer host.

### Milestone 2: one player and tutorial cutover

- Add the single-clock player to `HexMapRenderer`.
- Route strike-only and tutorial playback through the director and player.
- Keep impact effects asynchronous and independent.
- Remove production fallback from tutorial strike playback.

Exit criterion: the real tutorial bomber remains visible through impact and exits
on the authored track.

### Milestone 3: contested cutover

- Route every contested scenario through the same director and player.
- Replace grouped flak with individual timeline cues.
- Remove path repair, viewport path mutation, and phase visibility ownership from
  production playback.

Exit criterion: diagnostics have no hidden or active geometry, timing, tracer, or
continuity findings on 10x10 and 20x20 fixtures.

### Milestone 4: production certification

- Replace synthetic browser acceptance with real BattleScreen and tutorial flows.
- Capture all required frames and full sequences.
- Certify desktop, mobile, 10x10, 20x20, and rectangular maps.
- Delete obsolete planner-host and legacy sortie code after coverage proves no
  production references remain.

Exit criterion: all automated gates pass and visual review confirms the complete
story at production quality.

## 14. Implementation Record

Implementation completed: 2026-08-03

### 14.1 Milestone disposition

| Milestone | Status | Implemented evidence |
|---|---|---|
| Authority and truthful gates | Complete | Competing air-show TODO/spec files were removed, this document became canonical, origin distance is 500px, and diagnostic findings fail the report. |
| Pure timeline core | Complete | `AirShowDirector.ts` and `AirShowTimeline.ts` own deterministic geometry, measured paths, role-speed timing, cues, sampling, and invariant verification. |
| One player and tutorial cutover | Complete | `HexMapRenderer.animateResolvedAirCombatShow` samples every actor from one elapsed clock; tutorial and persistent strikes use it without an effects-blocking movement fallback. |
| Contested cutover | Complete | CAP clash, escort clash, bomber defense, target run, flak, and egress are one immutable timeline. Production `BattleScreen` routes call the canonical entrypoint. |
| Production certification | Complete | Pure, renderer, diagnostic, 20x20 temporal browser, real tutorial impact-continuity, desktop painted-frame, and mobile painted-frame gates pass. |

### 14.2 Implemented corrections

- HQ-side origins are derived from the actual rendered tile envelope and lie
  exactly 500px beyond its ray intersection.
- All five scenario families use preset authored rails. Randomness is limited to
  stable lane, tracer, and effect variation.
- Fighter timing is solved first. Bomber arrival and any smooth post-intercept
  corridor length are then solved backward from the escort rendezvous.
- Merge lanes are centered independently per faction. This prevents dense groups
  from occupying opposite halves of a global lane list and makes extra fighters
  join the outer pairings.
- The first pass is head-on. Every surviving fighter then takes a compact preset
  break turn chosen from a finite deterministic pattern set. The planner selects
  the compact pattern that maximizes formation-level pairing switches; it does
  not improvise runtime steering.
- Reversed escort rendezvous use one measured racetrack return: an outbound leg,
  one broad U-turn, and a tangent-continuous lane change. Distance budget is
  solved by the outbound leg, with no oscillating corrective weave.
- CAP bomber-defense transitions use a measured exact turn followed by a
  forward-only lane change into a straight head-on pass.
- Bomber lanes use 70px authored spacing and are verified to retain at least 56px
  center separation from ingress through target run.
- Escort screen rails have the exact bomber target-run start and end times while
  retaining fighter speed.
- Flak consists of independently seeded, deconflicted single-puff cues with
  1.4-2.4 second smoke persistence.
- Impact effects are fire-and-continue cues. They do not await, hide, replace, or
  recreate bomber actors.
- The browser harness timestamps painted positions from the exposed timeline
  clock, so observed speed checks do not mix animation and wall clocks.
- The browser harness samples actual SVG centers from each sprite's own rendered
  dimensions. It persists 100ms JSON/CSV traces and a human-readable audit
  verdict instead of discarding successful measurements.
- The pure verifier repeats the cumulative 100ms heading check, so a sharp-turn
  regression fails in seconds before the real-duration browser certificate.
- CAP bomber-defense rails now approach from the target side and cross bombers
  head-on. Measured-radius lead-ins replace last-moment hookbacks.
- Escort target screens use one broad role-speed turn instead of a short
  multi-cycle weave, retaining exact bomber timing without rapid oscillation.
- Large-map acceptance frames hide setup chrome and apply a camera-only focus
  transform. The transform never changes planner coordinates or path timing.

### 14.3 Verification record

The final 2026-08-03 verification produced:

- `npx tsc --noEmit`: pass;
- `npm test`: pass;
- `AirShowDirector.jest.test.js`: 15 tests passed, including the 100ms heading-rate gate;
- `AirShow.visual.jest.test.js`: 8 tests passed on 10x10 and 20x20 fixtures;
- `npm run test:airshow:report`: 9 diagnostic animations, no findings;
- 20x20 Chromium temporal choreography: 766 samples across 76.497 seconds,
  9 aircraft, exact role-speed medians, zero lifecycle gaps, 12.1px nearest
  head-on merge, 100% pairing switches, 60.3px minimum bomber spacing, and
  87 independently timed flak cues across 36 sampled batches;
- real Training Exercise bomber continuity: 806 samples across 80.495 seconds,
  exact `0.0575 px/ms` median speed, and zero connectivity, opacity, or lifecycle
  gaps through impact and egress;
- large-map target-run role separation: pass;
- large-map desktop and 390x844 mobile painted scramble frames: pass and visually
  reviewed with no deployment or intel panel obscuring the action.

Canonical visual evidence is stored under
`diagnostics/playwright/screenshots/latest/`, with snapshot baselines under
`tests/e2e/airshow-visual.spec.ts-snapshots/`.

Canonical temporal evidence is stored under
`diagnostics/playwright/airshow-traces/latest/`. The JSON and CSV files contain
every sampled aircraft position; the adjacent text file is the release verdict.

## 15. Rollback and Risk Control

- Combat resolution data remains unchanged throughout the migration.
- New planning and playback are isolated behind `animateResolvedAirCombatShow` so
  a runtime error can be diagnosed without corrupting battle state.
- Timeline verification runs before sprite creation. Invalid timelines fail with a
  precise invariant report rather than silently invoking legacy playback.
- Old implementation code is deleted only after every production route and test
  uses the new timeline.
- Performance is checked with 20 active actors and overlapping effects; the target
  is one position sample per actor per animation frame with no layout reads.

## 16. Definition of Done

The air show is first-class only when:

1. One pure director owns all choreography.
2. One elapsed-time player owns all aircraft movement and lifecycle.
3. Tutorial and contested shows use that same path.
4. Origins are exactly 500 pixels beyond actual map tiles.
5. Every movement segment obeys its role speed without path repair.
6. Fighter merges, pairing switches, bomber interception, release, and exit are
   readable and continuous.
7. Flak is sustained, independently timed, and lingering.
8. No aircraft disappears because an effect or another phase is running.
9. Diagnostics fail on every active defect.
10. Real tutorial and 20x20 visual certification pass.
