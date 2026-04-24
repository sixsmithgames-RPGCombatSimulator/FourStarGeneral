# Air Show North Star Specification

## Purpose

This document is the single source of truth for the Four Star General air show.

It defines the intended product goal, architecture, choreography, UI expectations, correction priorities, and done criteria for the air show system based on the current codebase understanding and the target experience of a readable, coherent aerial battle presentation.

This document absorbs the intent that had previously been spread across older air-show planning and evaluation notes. There should be no competing air-show specification outside this file.

## Document Role

- This is the canonical specification for the air show.
- This document is allowed to change when product understanding changes.
- The governing implementation procedure lives in `docs/ITERATION_GOVERNANCE.md`.
- If implementation, tests, or historical notes disagree with this document, this document is the north star until it is deliberately revised.

## Technical Foundation

### 1. Coordinate System and Measurement Authority

All choreography, animation, timing, and combat resolution operate in **pixel space**.

**Authoritative Definitions**
- `AirShowPoint = { cx: number, cy: number }` → pixel coordinates on SVG canvas
- All aircraft positions, tracers, flak, and effects are resolved in pixel coordinates
- All motion occurs along pixel-defined paths

**Pathing Model**
Each aircraft follows a parametric path:
- `progress ∈ [0.0 → 1.0]`
- Progress is measured along pixel path length, not time directly
- Derived: `positionPx = samplePath(progress)`, `speedPxPerMs = pathLengthPx / durationMs`

### 2. Hex → Pixel Boundary Rule

Hexes are used only for strategic anchoring, never for runtime movement.

**Allowed Hex Usage**
- Spawn constraints (e.g., min 8 hex distance)
- Target identification via hex keys
- Corridor endpoints via: `resolveHexCenterByKey(hexKey)` → pixel center

**Conversion Rule**
Once converted, **ALL** movement, timing, spacing, and collision operate exclusively in pixel space. No hex-based stepping, counting, or distance checks are used after conversion.

### 3. Speed Model

**Base Speeds**
- Fighter speed = V = 11.5 px/100ms
- Bomber speed = V / 2 = 5.75 px/100ms

**Behavior**
- **Initial Ingress**: Bombers at V/2, Escorts at V/2 (matching bombers), CAP at V
- **Escort Acceleration**: At `bomberProgress = 0.15`, escorts instantly transition to speed V

### 4. Tracer Geometry and Fire Ownership

Tracer ownership and tracer geometry are governed visual behavior, not cosmetic implementation detail.

**Fighter / Escort / Interceptor Tracers**
- Fighter-class tracers must originate from the nose/front of the sprite
- Fighter-class tracers must fire as straight forward bursts only
- Angled fighter tracer fans, side-emission, and center-origin fighter fire are forbidden

**Bomber Defensive Fire**
- Bomber return fire is allowed during direct interception and `bomber-defense-pass`
- Bomber defensive fire must originate from the center of the bomber sprite
- Bomber defensive fire is turreted 360 degrees relative to bomber heading and must aim toward attacking interceptors
- Bomber defensive fire must be intermittent burst fire, never a continuous beam or sustained stream

**Verification Rule**
- Inspection output, diagnostics, and tests must validate emitter origin and tracer geometry from canonical renderer output
- Tests may not satisfy this section by reconstructing alternate tracer rules in parallel code

## Product Goal

The air show must present the turn's air combat as a coherent replay of resolved airspace events.

The player should experience one readable air phase that communicates:

- who launched
- who contested the airspace
- how escorts screened
- how bombers survived or failed
- when flak fired
- whether ordnance was released
- what damage was inflicted
- which aircraft exited the scene

The system must favor clarity, continuity, and architectural truth over isolated spectacle.

## Detailed Goal

The air show should feel like a short aerial battle story rather than disconnected effects.

The target experience is:

- air missions feel like a distinct air phase, not just another ground-side effect
- multiple concurrent missions can be understood without visual corruption
- each mission or package reads as a mini aerial ballet with clear ingress, combat, strike, and egress
- the Air Support modal and activity log agree with what the player just saw
- aircraft do not teleport, disappear unexpectedly, or behave as though two different systems are fighting over ownership

## North Star Outcomes

The final air show must satisfy all of the following:

1. Air combat is resolved from a global airspace view, not from a single-strike-local viewpoint.
2. Playback is a faithful rendering of resolved events, not an improvised animation assembled from partial side effects.
3. Each contested linked strike package has one owner for sprite lifecycle from first visible ingress through final egress.
4. Complex air battle packages do not visually corrupt one another through parallel playback.
5. UI state, combat logs, mission reports, and visible playback all agree on what happened.
6. The player can identify the package structure of the battle without guessing which aircraft belong together.

## Player-Visible Experience

The player-visible air show must communicate these beats clearly:

1. Launch and ingress
2. Contest for air superiority
3. Escort screening
4. Bomber interception or bomber survival
5. Flak on terminal approach
6. Strike release or abort
7. Egress and exit

The show must make it visually obvious whether:

- the strike was uncontested
- CAP intercepted the package
- escorts successfully screened
- the bomber was damaged or destroyed before bomb release
- the strike succeeded, partially succeeded, or aborted

## Supported Mission Scenarios

The air show must support five distinct scenario families.

### Scenario 1: Escort Plus Strike, No Interceptors

Participants:

- escorts
- strike craft

Required choreography:

- escorts and bombers ingress together at bomber speed (V/2)
- at 15% progress, escorts may accelerate to fighter speed (V) to establish screen position ahead
- escorts maintain protective formation with the strike craft
- no dogfight phase occurs because no hostile interceptors are present
- strike craft perform their bombing run with arc turn at 2 hexes before target
- escorts and strike craft egress together

### Scenario 2: Strike Only

Participants:

- strike craft (bombers) only — no CAP, no escorts

Required choreography (progress-based):

- bomber ingress at bomber speed (V/2)
- no fighter combat phases occur
- flak engagement: progress 0.80 → 1.00
- bombers reach stand-off point (2 hexes before target) at progress 1.0
- execute smooth 160° arc turn (diameter = 3 hexes in pixels)
- bomb release at `turnProgress = 0.50`
- flak continues through arc turn
- flak stops scheduling at `egressProgress = 0.20`
- surviving bombers egress clearly

### Scenario 3: Strike Plus Interceptors, No Escorts

Participants:

- interceptors (CAP)
- strike craft (bombers)

Required choreography:

- simultaneous ingress: CAP at fighter speed (V), bombers at bomber speed (V/2)
- strike craft continue visible ingress while interceptors close from ahead/side
- no escort dogfight phase occurs (no escorts present)
- interceptor passes happen against the bombers during the bomber run window (progress 0.50-0.80)
- survivors egress clearly

### Scenario 4: CAP Patrol / CAP Clash

Participants:

- opposing CAP / interceptor packages only — no bombers

Required choreography:

- opposing CAP flights ingress toward the map center (meeting point)
- dogfight occurs at the center, repeating with variations for "fight to the death"
- engagement continues until one side eliminated or forced to withdraw
- continuous movement — no static combat staging
- destroyed aircraft removed immediately
- survivors egress on readable return arcs

**Timing Model**: Since no bomber progress exists, timing is driven by:
- Distance-based triggers (approach center, enter combat radius)
- Combat rounds repeating until resolution
- Total duration scales with force sizes (typical: 1500-3000ms per combat round)

### Scenario 5: Full Engagement

Participants:

- interceptors
- escorts
- strike craft

Required choreography (progress-based, all times relative to bomber ingress path):

1. **Ingress (0.0 → 0.15)**
   - CAP ingress at fighter speed (V)
   - Bombers and escorts ingress together at bomber speed (V/2)
   - Escorts fly with bombers as protective screen

2. **Escort Acceleration (0.15)**
   - Escorts accelerate to fighter speed (V)
   - Continue screening ahead of bombers

3. **Fighter Clash / Dogfight (0.20 → 0.50)**
   - CAP vs Escort combat occurs spatially between bomber formation and target
   - Continuous movement — no freezing for combat
   - Destroyed CAP → immediately removed
   - Destroyed Escorts → immediately removed

4. **CAP vs Bombers (0.50 → 0.80)**
   - Surviving CAP attack bombers with coordination:
     - **Attack Priority**: Strongest CAP formation vs Strongest Bomber formation first
     - **Re-calculation**: After each engagement pair resolves, re-evaluate: next strongest CAP vs next strongest bomber
     - CAP flights coordinate and gang up on target bombers
   - Fighter attack tracers remain nose-origin, straight-ahead attack bursts
   - Bombers may answer with intermittent center-origin turret bursts toward attacking CAP
   - Surviving escorts chase CAP at fighter speed (V) — purely visual, tracers for show
   - Escorts pursue CAP until CAP egress begins (≥ 0.80), or egress immediately if all CAP destroyed
   - Fighters at speed V, bombers continue at V/2
   - Destroyed bombers and CAP removed immediately

5. **Fighter Egress (≥ 0.80)**
   - Surviving CAP begin egress
   - Surviving escorts begin egress (or egress immediately if all CAP destroyed earlier)
   - No further fighter engagements occur

6. **Flak Engagement (0.80 → 1.00 + arc turn)**
   - Flak activates at bomberProgress 0.80
   - Continues through straight ingress and entire arc turn
   - Each flak unit targets a bomber formation; animation spread across zone around formation
   - Visual: persistent black puffs fade slowly over entire flak sequence
   - Stops scheduling new bursts at egressProgress 0.20
   - **Early Destruction Rule**: If all bombers destroyed before progress 0.80, flak does not fire

7. **Arc Turn & Bomb Release**
   - Bombers reach stand-off point (2 hexes before target) at ingressProgress 1.0
   - Each bomber executes smooth 160° arc turn across circular path (diameter = 3 hexes in pixels)
   - Bomb release at `turnProgress = 0.50`
   - Flak continues during turn (each flak unit targets its assigned bomber formation)
   - Destroyed bombers removed immediately
   - Destroyed ground targets removed immediately

**Multiple Bomber Flights Rule**: When bombers have different target hexes, each bomber flight maintains separate ingress progress track. Flak units target their assigned bomber formation independently.

**Verification Guardrail**: Multi-bomber coordinated packages may not be validated by forcing all bomber flights through one shared straight-line efficiency or one shared ingress progress track. Validation must respect each bomber flight's own progress track and the governed 160° arc-turn geometry.

8. **Bomber Egress**
   - Surviving bombers complete arc turn and begin egress
   - Flak stops scheduling new bursts at egressProgress 0.20

## Canonical Per-Package Timelines

Package timing is scenario-specific.

The renderer must select the canonical package timeline that matches the resolved participant mix and outcome. These timelines are not interchangeable. Each one exists to make the package read clearly for that specific scenario rather than forcing every package into the same generic beat order.

### Scenario 1 Package Timeline: Escort Plus Strike, No Interceptors

1. Coordinated ingress
   - escorts and bombers depart together at bomber speed (V/2)
   - escorts may accelerate to fighter speed (V) at 15% progress to establish forward screen position
   - escorts are visually legible as the protective screen for the bomber package
2. Protected transit
   - escorts hold readable forward and wing positions while the bomber package continues toward the target
   - no dogfight beat occurs
   - the package should feel coordinated rather than decorative
3. Terminal setup
   - escorts open enough space for the bomber attack lane to read clearly
   - if escorts peel outward before the target run, the peel must be coordinated and readable rather than looking like abandonment
4. Flak
   - surviving strike craft that commit to the target lane take flak on terminal approach
   - escorts remain visually associated at the edge of the package or on coordinated return arcs
5. Strike release
   - only surviving strike craft release ordnance
   - bomber path remains smooth and deliberate through the target run
6. Coordinated egress
   - surviving bombers and escorts exit on readable return arcs
   - the package still reads as one formation even if escorts are wider than the bomber corridor

### Scenario 2 Package Timeline: Strike Only (Progress-Based)

**Phase 1: Ingress (0.0 → 0.80)**
- Bomber ingress at bomber speed (V/2)
- No fighter combat phases

**Phase 2: Terminal Approach & Flak (0.80 → 1.00)**
- Flak activates at bomberProgress 0.80
- Flak targets bomber real-time pixel position
- Flak animation: spread across zone around formation, persistent black puffs fade slowly over sequence
- Bombers reach stand-off point (2 hexes before target) at progress 1.0

**Phase 3: Arc Turn & Strike Release**
- Bomber executes smooth 160° arc turn (circular path, diameter = 3 hexes in pixels)
- Bomb release at `turnProgress = 0.50`
- Flak continues throughout turn
- Destroyed bombers and ground targets removed immediately

**Phase 4: Bomber Egress**
- Surviving bombers complete turn and exit
- Flak stops scheduling at `egressProgress = 0.20`
- Existing bursts complete their animation

### Scenario 3 Package Timeline: Strike Plus Interceptors, No Escorts

**Phase 1: Simultaneous Ingress (0.0 → 0.50)**
- CAP ingress at fighter speed (V)
- Bombers ingress at bomber speed (V/2)
- CAP establishes contact from ahead/side of bomber approach lane

**Phase 2: Direct Bomber Interception (0.50 → 0.80)**
- Hostile fighters attack strike craft directly (no escort screen)
- Fighter passes simultaneous within beat
- Fighter tracers remain nose-origin, straight-ahead bursts only
- Bomber defensive fire occurs during passes as intermittent center-origin turret bursts toward interceptors
- Speed differential: fighters at V, bombers at V/2
- Destroyed bombers and CAP removed immediately

**Phase 3: Fighter Egress (≥ 0.80)**
- Surviving CAP begin egress
- No escorts present to pursue

**Phase 4: Terminal Approach & Flak (0.80 → 1.00)**
- Flak activates at bomberProgress 0.80
- Flak targets bomber real-time pixel position
- Bombers reach stand-off point at progress 1.0

**Phase 5: Arc Turn & Strike Release**
- Bomber executes smooth 160° arc turn
- Bomb release at `turnProgress = 0.50`
- Flak continues throughout turn
- Destroyed bombers and ground targets removed immediately

**Phase 6: Bomber Egress**
- Surviving bombers complete turn and exit
- Flak stops scheduling at `egressProgress = 0.20`

### Scenario 4 Package Timeline: CAP Patrol / CAP Clash (Distance-Based)

**Phase 1: Ingress to Center**
- Opposing CAP packages ingress toward map center (meeting point) at fighter speed (V)
- Each package approaches from their respective origins/protected sectors
- No bomber corridor exists in this scenario

**Phase 2: CAP Merge & Initial Clash**
- CAP packages meet at center and engage
- Dogfight begins with simultaneous fighter combat
- Continuous movement — no static staging

**Phase 3: Sustained Combat (Fight to the Death)**
- Combat repeats with variations until resolution:
  - Multiple passes and re-engagements
  - Surviving fighters arc back into combat
  - Destroyed aircraft removed immediately
- Engagement continues until:
  - One side completely eliminated, OR
  - Surviving force withdraws (determined by resolution logic)
- Typical: 1500-3000ms per combat round

**Phase 4: Air-Superiority Resolution**
- Surviving side briefly signals control of center airspace
- Visual sweep or holding pattern to show dominance

**Phase 5: CAP Egress**
- Surviving CAP aircraft exit on readable return arcs
- Defeated side (if any survivors) egress separately

### Scenario 5 Package Timeline: Full Engagement (Progress-Based)

All timing is driven by bomber progress along ingress path.

**Phase 1: Ingress (0.0 → 0.15)**
- CAP ingress at fighter speed (V)
- Bombers and escorts ingress at bomber speed (V/2), flying together
- Escorts screen ahead of bomber package

**Phase 2: Escort Acceleration (at 0.15)**
- Escorts accelerate to fighter speed (V)
- Escorts reposition to engage CAP while maintaining bomber association

**Phase 3: Fighter Clash — CAP vs Escorts (0.20 → 0.50)**
- Dogfight occurs spatially between bomber formation and target
- Continuous movement — no static combat staging
- Destroyed aircraft removed immediately (fade optional)
- Resolution: surviving CAP proceed to bomber interception; surviving escorts pursue CAP

**Phase 4: CAP vs Bombers (0.50 → 0.80)**
- Surviving CAP press attack on bombers
- Surviving escorts chase CAP at fighter speed (V) — purely visual, tracers for show
- Escorts pursue CAP until CAP egress begins (≥ 0.80)
- Speed differential: fighters at V, bombers at V/2
- Destroyed bombers and CAP removed immediately

**Phase 5: Fighter Egress (≥ 0.80)**
- Surviving CAP begin egress
- Surviving escorts begin egress (or egress immediately if all CAP destroyed in Phase 3)
- No further fighter combat

**Phase 6: Terminal Approach & Flak (0.80 → 1.00)**
- Flak activates at bomberProgress 0.80
- Flak targets bomber real-time pixel position
- Bombers reach stand-off point (2 hexes before target) at progress 1.0

**Phase 7: Arc Turn & Strike Release**
- Bomber executes smooth 160° arc turn (circular path, diameter = 3 hexes in pixels)
- Bomb release at `turnProgress = 0.50`
- Flak continues throughout turn
- Destroyed bombers and ground targets removed immediately

**Phase 8: Bomber Egress**
- Surviving bombers complete turn and exit
- Flak stops scheduling new bursts at `egressProgress = 0.20`
- Existing bursts complete their animation

### Timeline Truncation Rule

Any scenario-specific package timeline may truncate when the resolved outcome removes later beats.

Examples:

- if the bomber package is destroyed before flak, the package skips flak, strike release, and bomber egress
- if no flak survives at the target, the package skips the flak beat
- if no CAP opponent exists in Scenario 4, the package may collapse to patrol and egress

What may not happen is ownership discontinuity. A truncated package still has to remain visually continuous and faithful to resolved truth.

## Multiple Missions In One Turn

When several missions are active in the same turn:

- the system may treat each linked strike package as an atomic playback unit
- complex contested packages must be serialized where simultaneous playback would make the show unreadable or would mix package ownership
- simple standalone flyovers may overlap only when they do not visually conflict with a contested package
- the player should still be able to tell which package is currently being resolved

## Canonical Architecture

### 1. Engine Is the Air Combat Authority

The engine is the authoritative owner of air combat resolution.

The canonical engine model is:

- collect all relevant inflight and resolving sorties before applying combat
- resolve CAP superiority before strike-package interception
- assign surviving CAP to hostile strike packages by target relevance and availability
- resolve escort screen exchanges before bomber defense passes
- resolve flak after surviving strike craft reach the target area
- release ordnance only if strike craft survive to bomb-release state
- derive mission outcomes, engagement events, and logs from this resolved state

Current implementation anchor:

- `src/game/GameEngine.ts`
- `resolveInflightAirPhase()`

### 2. Playback Replays Resolved Truth

Playback must consume resolved air combat outputs and render them without redefining the battle.

The canonical playback model is:

- `BattleScreen` collects resolved results, groups nearby operations, and hands resolved contested packages to the playback planner
- `ClusterAirPlaybackPlanner` owns coordinated cluster grouping outputs and shared timing inputs for contested packages
- `AirShowPlaybackPlanner` owns authoritative contested-package choreography and produces one `PlannedAirShowScene`
- `HexMapRenderer` paints and animates the already-planned scene; it must not rebuild choreography from separate renderer-only rules
- no package may split bomber ownership, escort ownership, or interceptor ownership across multiple unrelated playback paths
- no aircraft should disappear and later reappear because ownership switched between systems

Current implementation anchors:

- `src/ui/screens/BattleScreen.ts`
- `src/ui/airshow/ClusterAirPlaybackPlanner.ts`
- `src/ui/airshow/AirShowPlaybackPlanner.ts`
- `src/ui/airshow/AirShowPlaybackScene.ts`
- `src/rendering/HexMapRenderer.ts`

### 3. One Package, One Visible Story

A linked strike package is the atomic storytelling unit for contested strike playback.

Within a package:

- ingress, combat, flak, strike, and egress are one continuous story
- aircraft roles stay visually legible
- survivors continue from where the previous beat ended
- destroyed aircraft exit continuously rather than vanishing instantaneously

### 4. Shared Playback Policy Is Canonical

Air-show timing, role speed, HQ-relative origins, and package coordination math must be defined once and reused everywhere.

The canonical playback-policy model is:

- `AirShowPlaybackPolicy` owns role px/ms rates and shared timing primitives
- `AirShowTimingPolicies` owns derived phase durations and coordination delay builders
- `BattleScreen` and scene builders consume shared policy outputs when they build coordinated and resolved air-show scenes
- scene builders and renderer code consume the same shared policy instead of shadowing constants
- tests and diagnostics may inspect or assert policy outputs, but they must not maintain parallel copies of the formulas they are validating
- no renderer, scene-builder, or test-layer patch may "fix" timing by shortening a role's path, stretching a rival role's window, or otherwise compensating visually for incorrect policy timing
- if observed playback only looks correct because of a role-specific path-length retarget, phase-local speed fudge, or visibility workaround, the issue remains open and the policy/runtime contract is not satisfied
- no layer may suppress, relocate, or re-characterize governed tracer ownership to hide a choreography defect; if bomber defensive fire, fighter nose fire, or tracer geometry is wrong, the shared runtime and shared tests must be corrected rather than patched around

Current implementation anchors:

- `src/ui/airshow/AirShowPlaybackPolicy.ts`
- `src/ui/airshow/AirShowTimingPolicies.ts`
- `src/ui/screens/BattleScreen.ts`
- `src/ui/airshow/ClusterAirPlaybackPlanner.ts`
- `src/ui/airshow/ResolvedAirCombatSceneBuilder.ts`
- `src/ui/airshow/AirShowPlaybackPlanner.ts`
- `src/rendering/HexMapRenderer.ts`

### 5. Canonical Test Architecture

The air-show test suite mirrors the runtime layers. It must never become a second engine or a second playback planner.

The canonical test layers are:

- `tests/BattleScreen.airMissionPlayback.test.ts` verifies `BattleScreen` orchestration, live scene construction, shared timing policy wiring, and HQ-context propagation
- `tests/airScenarioSupport.ts`, `tests/run-airshow-diagnostics.ts`, and `tests/AirScenario.report.ts` form the diagnostic harness and reporting layer; they consume production planners and the shared `PlannedAirShowScene`/inspection output, but they are not an alternate rules engine
- `tests/AirShow.fighterMotion.test.ts`, `tests/AirShow.progressTiming.test.ts`, `tests/AirShow.speedModel.test.ts`, `tests/AirShow.coordinatedPackage.test.ts`, `tests/AirShow.regression.test.ts`, and `tests/AirShow.bomberSpeed.validation.test.ts` enforce choreography, continuity, package ownership, speed-model, and timing invariants
- `tests/AirShow.visual.jest.test.ts`, `tests/e2e/airshow-choreography.spec.ts`, `tests/e2e/airshow-visual.spec.ts`, `src/testing/airshowE2eHarness.ts`, and `src/testing/airshowHarnessFixture.ts` cover render-visible and browser-level confirmation

Authoritative order of evidence for playback disputes:

- shared playback policy
- `BattleScreen` scene construction
- authoritative `PlannedAirShowScene` output from `AirShowPlaybackPlanner`
- renderer timing audit and diagnostic harness output derived from that same planned scene
- visual and e2e confirmation

## Canonical Runtime Contracts

The air show depends on these contracts remaining coherent across engine, UI, and playback.

### `AirMissionArrival`

This represents visible mission entry into the air phase.

It must preserve:

- `missionId`
- `unitKey`
- faction
- role or mission kind
- origin context
- target context when relevant

### `AirEngagementEvent`

This represents resolved engagement beats used for playback and reporting.

It must preserve:

- `missionId`
- location
- participant identity
- participant role
- before and after combat state where needed for faithful playback

### `AirMissionReportEntry`

This represents the authoritative mission-level outcome for UI and logs.

It must preserve:

- mission kind
- outcome result
- damage or destruction state
- air combat metadata needed for summary and activity log

### Identity Rules

- `missionId` must remain stable across arrivals, engagements, playback grouping, and mission reports
- `unitKey` must remain stable for participant identity and grouping
- completed mission outcomes shown in UI must match the resolved mission report
- the activity log must describe the resolved result, not a best-effort interpretation of animation callbacks

If the current contracts are insufficient for the north star behavior, they should be extended deliberately rather than bypassed with ad hoc animation logic.

## Current Runtime Baseline

The current system already provides these building blocks:

- air missions are scheduled and tracked in engine mission state
- `consumeAirMissionArrivals()` emits visible air-mission arrivals
- `consumeAirEngagements()` emits resolved engagement events
- `getAirMissionReports()` exposes mission outcomes and refit events
- mission-update hooks exist for UI refresh and logging

This baseline is important because the air show should evolve by tightening architectural alignment, not by discarding working engine truth.

## Layer Responsibilities

### GameEngine

- resolve the turn-wide air phase
- assemble strike packages and CAP pools
- produce arrivals, engagements, and mission reports from resolved state
- keep outcome logic deterministic and testable

### BattleScreen

- gather resolved engine outputs
- group them into mission or package playback units
- serialize complex playback where required
- manage camera timing and activity-log synchronization
- avoid re-resolving air combat logic

### HexMapRenderer

- own full sprite lifecycle for contested linked packages
- render ingress, exchanges, flak, bomb release, and egress as one continuous show
- preserve spatial separation between fighter combat volume and bomber corridor when the scene calls for it
- avoid ownership handoffs that force despawn or respawn artifacts

## Non-Negotiable Rules

### Global Air Phase Rules

- CAP vs CAP resolves before strike package interception.
- Target assignment is based on the resolved airspace roster, not only a local query around one target hex.
- Simultaneous rounds use round-start state.
- Aircraft are not removed mid-round before returning fire for that round.
- Mission reports are derived after resolution, not inferred from playback.

### Playback Ownership Rules

- A contested linked package must have one continuous sprite lifecycle owner.
- Complex linked packages must not run in parallel with other complex linked packages in the same visual cluster.
- Simple standalone flyovers may overlap only when they do not share ownership with a contested package.
- Camera focus must support readability of the whole package, not just one moment inside it.
- Legacy fallback systems must not secretly own part of a package once unified playback is in place.

### Visual Continuity Rules

- Bombers do not despawn at interception and respawn later for the strike run.
- Escorts do not vanish because they are rendered on one path and resolved on another.
- Interceptors do not drift into unrelated movements after their exchange without an explicit egress or patrol decision.
- Aircraft should enter, fight, attack, and leave in a way the player can follow without guessing.
- Destroyed aircraft should exit or fade in a readable way rather than blinking out abruptly.

### Choreography Rules

- fighters should visually establish contact before or ahead of bombers in contested packages
- bomber ingress may overlap fighter combat, but bombers should remain readable and distinct
- escort or interceptor combat within the same beat must be simultaneous rather than serial
- survivors transition directly into the next beat from their current positions
- there should be no holding phase that freezes aircraft simply to reposition them for the next beat

## Timing And Choreography Targets

These are target behavior rules for readability. The authoritative timing model is **progress-based** tied to bomber ingress path.

### Speed Principles

- Fighter base speed = V
- Bomber base speed = V / 2
- CAP ingress at fighter speed
- Bombers and escorts ingress together at bomber speed
- Escorts accelerate to fighter speed at 15% bomber progress
- CAP may appear on-screen slightly before the first escort because of the speed differential, but that visible lead must stay brief; the governed browser suite caps the lead at about 1 second so CAP does not loiter on-screen waiting for the package
- visible speed is the on-screen distance traveled over wall-clock time; it must come from canonical path length plus canonical timing, not from truncated paths or shared-window illusions
- if two roles must appear to move at different speeds, the renderer must give them different authoritative time windows or local progress windows derived from policy, rather than forcing them through one shared progress value

### Progress-Based Phase Triggers

All combat timing is driven by bomber progress along its ingress path:

| Progress | Event |
|----------|-------|
| 0.00 | Spawn — CAP at V, Bombers/Escorts at V/2 |
| 0.15 | Escort acceleration to V |
| 0.20 | Fighter clash (dogfight) begins |
| 0.50 | Dogfight ends / CAP engages bombers |
| 0.80 | Fighters disengage / Flak begins |
| 1.00 | Reach stand-off point (2 hexes before target) |

**Turn Phase (separate progress)**
| Turn Progress | Event |
|---------------|-------|
| 0.00 | Arc turn begins |
| 0.50 | Bomb release |
| 1.00 | Arc turn complete / Egress begins |

**Egress Phase**
| Egress Progress | Event |
|-----------------|-------|
| 0.00 | Egress begins |
| 0.20 | Flak stops scheduling new bursts |
| 1.00 | Egress complete |

### Typical Contested Package Shape

A typical contested package reads as:

1. CAP ingress (fast) and bomber/escort ingress (slow) begin simultaneously
2. Escorts accelerate and clash with CAP while bombers continue approach
3. Surviving CAP press through to bomber interception
4. Surviving escorts pursue CAP
5. Fighters egress; flak engages bombers on terminal approach
6. Arc turn with bomb release; flak continues
7. Egress begins; flak tapers off

### Continuity Requirement

Every phase transition must be seamless.

The next phase begins from the aircraft's actual end position from the previous phase. Progress is measured along pixel path length, not time directly.

Continuity, separation, and speed validation must use canonical sampled/rendered positions from the shared playback scene.

Raw assignment `points` are planner control waypoints and are not authoritative proof of painted boundary continuity.

## Visual Design Constraints

### Path Behavior

- ingress and transit paths should use gentle readable curves
- bomber runs should be smooth and deliberate, with minimal lateral jitter
- combat maneuvers can be more aggressive than ingress paths, but they must remain readable and within bounds
- egress should clearly carry aircraft off the battlefield rather than making them disappear at the target

### Formation Behavior

- ingress and transit formations should be coherent
- variation should come from spacing and role, not from excessive random jitter
- escorts should read as a screen associated with bombers
- interceptors should read as a hostile or protective fighter package rather than isolated random actors

### Viewport Rules

- aircraft should remain within readable viewport bounds during combat unless they are intentionally exiting
- contested maneuver paths should avoid sending actors fully off-screen during their active beat

### Transition Rules

- fade-ins and fade-outs should be graceful
- visibility changes should support entry, damage, destruction, and exit
- instant opacity jumps or disappear/reappear behavior are not acceptable for normal package flow

## UI Expectations

### Air Support Modal

The Air Support modal must:

- show all missions scheduled for the current turn
- continue showing completed missions for at least the current turn
- show mission kind, unit, origin, target or protected area, status, and short outcome summary
- make it clear when a mission completed successfully, partially succeeded, aborted, or entered refit-related follow-up state

### Activity Log

The activity log must:

- emit a clear log entry for each resolved mission
- describe kind, target, result, damage, and destruction state when relevant
- optionally include interceptions, kills, and bomber attrition
- agree with the mission report and with the visible playback the player just saw

### Status Readability

Status transitions should remain legible across UI and logs, including:

- queued
- in flight
- resolving
- completed
- refit-related follow-up events where applicable

## Quality And Performance Targets

These are operating targets for implementation and tuning.

- support roughly 1 to 20 simultaneous aircraft sprites in a scene
- maintain smooth playback at the normal game target frame rate
- avoid unnecessary DOM churn or leaked sprite state across repeated air shows
- keep a typical contested package short enough to remain readable and repeatable during play
- prefer predictable choreography over excessive randomness

## Known Failure Patterns That Are Not Acceptable

The following behaviors are considered spec violations:

- bomber disappearance and later reappearance within one package
- escorts disappearing because a different code path took over
- interceptors drifting in random directions after combat without a clear reason
- one complex package visually borrowing aircraft from another nearby package
- nearby contested packages running in a way that makes the visible story incoherent
- stale launch coordinates being used when resolved target truth has changed
- logs or modal summaries contradicting visible results

## Current Architectural Understanding

The current codebase already reflects part of the north star and still falls short in part.

### Already Aligned

- the engine has a global inflight air phase in `resolveInflightAirPhase()`
- tests already assert bounded CAP visible lead and escort participation in package interception
- mission update hooks and mission-report plumbing exist
- the system already exposes arrivals, engagements, and reports as distinct artifacts

### Remaining Focus Areas

- CAP-only patrol presentation can still be made more explicit than the contested-package scenarios
- browser diagnostic probes should remain consumers of the planned scene and must not drift back into heuristic-only alternate choreography logic

This means the engine and playback center of gravity are now aligned around one planned contested-package scene, and remaining work is primarily presentation polish rather than split-brain correction.

## Realignment Priorities

These priorities capture the most important lessons from prior planning and evaluation.

### Priority 1: Preserve Unified Playback Ownership

Before tuning path parameters or polishing visuals further:

- keep contested linked-package playback under one visible owner path
- do not split bomber lifecycle across separate playback systems
- do not reintroduce any path where a complex package is partly rendered by a fallback system

This remains the first correction priority because most visible defects are downstream symptoms of ownership split.

### Priority 2: Serialize Complex Package Playback

- contested packages that share a cluster or camera space must not play in corrupting parallel
- only simple non-conflicting flyovers may overlap

### Priority 3: Preserve Continuous Motion

- remove holding or staging phases that stop aircraft for artificial repositioning
- ensure beat-to-beat transitions begin from current positions

### Priority 4: Tune Paths And Visibility

After ownership is unified:

- reduce excessive fighter weaving
- prevent off-screen combat maneuvers during active beats
- keep bomber runs smooth and readable
- use graceful fade behavior for entry, destruction, and exit

## Verification Matrix

The following behaviors must be verifiable through tests, diagnostics, or direct replay.

### Engine and Data Verification

- CAP clash is emitted before strike-package interception
- resolving escorts are included in their linked strike package
- mission reports reflect resolved outcomes rather than inferred playback state
- completed mission outcomes remain visible to UI for the current turn

### Playback Verification

- playback uses the live resolved target rather than stale launch snapshots
- contested strike packages replay through one continuous owner path
- complex package playback is serialized when cluster overlap would corrupt readability
- survivors transition cleanly between beats with no teleporting
- egress is visible and readable

### Architecture Guardrails

- redundant or overlapping engine/test code is forbidden
- tests must consume shared production helpers for HQ-origin selection, path timing, bomber-arrival coordination, and role px/ms rates whenever they are validating live runtime behavior
- `airScenarioSupport.ts` is a diagnostic consumer of production code, not an alternate engine, planner, or renderer
- tests and diagnostics must use canonical sampled playback positions for continuity, separation, and speed assertions; raw planner waypoints are not a second source of truth for painted motion
- `BattleScreen.ts`, `ResolvedAirCombatSceneBuilder.ts`, and `HexMapRenderer.ts` must not carry independent copies of speed constants, duration formulas, or origin-direction logic; if multiple layers need the same behavior, extract a shared module and make every layer consume it
- synthetic or stress-only tests may diverge from live policy only when they are clearly labeled synthetic and cannot be cited as proof that runtime behavior is correct
- playback patches and visual workarounds are forbidden for timing, speed, continuity, or arrival-order defects; non-compliant behavior must be fixed in canonical policy and canonical runtime flow
- any "fix" that depends on per-role path truncation inside a shared phase window, actor hide/show compensation, or phase-local speed fudging is not a valid completion state and must be treated as an open defect

### Scenario Verification

The air show should be verifiable against at least these scenarios:

1. 4 bombers plus 4 escorts versus 6 interceptors
2. single bomber with no escort versus 2 interceptors
3. large engagement around 10 versus 10
4. escort plus strike with no interception
5. interceptor-only CAP patrol
6. 3 CAP missions versus 2 escort flights linked to a 4-bomber strike package that reads as 2 lead bombers followed by 2 trailing bombers

## Done Criteria

The air show is not done until all of these are true:

- the engine resolves the air phase globally and deterministically
- contested strike packages replay through one continuous owner path
- no bomber disappearance and reappearance occurs across package playback
- escorts and interceptors remain visually tied to the correct package
- nearby complex packages do not run in visually corrupting parallel
- all five scenario families have a clear and intentional visible presentation
- runtime and tests share one canonical playback-policy implementation for origin, speed, and phase timing; duplicate formulas are not allowed in harnesses or UI branches
- Air Support UI, reports, and activity log all reflect the same outcome as playback
- automated tests cover engine ordering, escort inclusion, live-target resolution, and playback sequencing
- the visible result reads as a coherent air battle rather than disconnected effects

---

## Implementation Status & Recent Fixes

> This section tracks completed fixes and known issues for the air show system.
> For bug reports and fixes, see test files in `tests/AirShow.fighterMotion.test.ts` and `tests/AirCombatSceneBuilder.test.ts`

### April 13, 2026 — Phase Handoff Continuity & Spatial Separation

**Fixed: Double-Bias Phase Handoff Gap**
- **Issue**: 7.2px gap between phase boundaries (e.g., `escort-clash-scramble` → `bomber-ingress`)
- **Root Cause**: `applyInspectionAirShowAssignments` stored biased endpoint, next phase added bias again
- **Fix**: Store unbiased position (`finalPoint - bias`) in `actor.position`
- **Test**: `AIR_SHOW_FULL_ENGAGEMENT_PHASES_PRESERVE_ACTOR_CONTINUITY` — validates ≤2px sampled boundary gap from canonical playback positions

**Fixed: Merge Convergence / Formation Overlap**
- **Issue**: 247+ overlap events in `escort-clash-merge` — CAP flights converging with 40-75% sprite overlap
- **Fixes Applied**:
  1. Focus point separation: 52px → 90px between interceptor flights
  2. Path lane spread: `laneSpreadPx` 30px → 45px per lane index
  3. Merge/cross offsets: `laneIndex * 6/4` → `laneIndex * 22/18`
  4. Multi-flight separation: 80px lateral offset per flight (sampling-only, preserves phase continuity)
- **Result**: Overlap events 247 → 239 (3% improvement)
- **Test**: `AIR_SHOW_SPATIAL_SEPARATION_REPORT` — time-sampled position diagnostics

**Enhancement: Time-Sampled Inspection Report**
- Added `sampledPositions` to `AirShowInspectionAssignment`
- Samples every ~250ms with `{timeMs, progress, cx, cy, headingDegrees}`
- Enables animation verification and collision detection
- Boundary continuity and start-of-phase separation assertions must read `sampledPositions`, not raw planner control waypoints

### April 13, 2026 — User Reported Fixes

**Fixed: Flak Timing Misplaced**
- **Issue**: Flak fired at 82-99% of strike run (after sprites gone), not during approach
- **Fix**: Flak now fires during terminal approach (bomberProgress 0.80-1.00) and continues through arc turn, stopping at egressProgress 0.20
- **Files**: `ResolvedAirCombatSceneBuilder.ts`, `airScenarioSupport.ts`, `HexMapRenderer.ts`

**Fixed: Aircraft Disappear at Target / Reappear for Egress**
- **Issue**: Phase existence checks used `actor.active` (per-actor visibility), causing phases to be skipped when individual actors were visually hidden
- **Root Cause**: `actor.active` conflated two concerns — visual opacity AND phase existence
- **Fix**: 
  1. Phase existence now checks `flight.currentStrength > 0` (flight-level)
  2. `actor.active` now controls ONLY visual opacity (per-actor)
  3. All actors receive phase assignments regardless of active status (for continuity)
- **Result**: Phases record even with visually hidden actors; aircraft maintain position continuity through all beats

**Fixed: Fighters Linger During Next Bomber Approach**
- **Issue**: `escort-hold` phase (825ms drift) ran while bomber was approaching, creating "linger and drift" effect
- **Fix**: Skip `escort-hold` when `bomberFlight` is present — fighters immediately reposition for defense
- **Files**: `HexMapRenderer.ts` (inspection and runtime branches)

### April 12, 2026 — Fighter Motion Path Jitter

**Fixed: "Coiling Snake" Path Shape**
- **Issue**: Direction reversals, twitchy heading changes during dogfight beats
- **Root Causes**:
  1. `reengage` branch inserted `snakePointA → snakePointB → coilPoint` waypoints
  2. Bias application grew per waypoint: `(0.92 + pointIndex * 0.06)`
- **Fixes**:
  1. Replaced with 5-phase pass: Approach arc → Commit pass → Break turn → Rejoin arc → Egress arc
  2. Fixed bias: one-time offset at index 0 only
- **Tests**: `AIR_SHOW_DOGFIGHT_AUTHORED_REENGAGE_PASS_NO_SNAKE`, `AIR_SHOW_BIAS_OFFSET_DOES_NOT_GROW_ALONG_PATH`

**Fixed: Collision-Aware Formation Spacing**
- **Issue**: Aircraft overlapped into dense black clusters during combat
- **Fixes**: Minimum spacing constants, collision detection, altitude lane layering, combat ellipse expansion
- **Tests**: `AIR_SHOW_MINIMUM_SPRITE_SPACING`, `AIR_SHOW_MAX_DENSITY_THRESHOLD`, `AIR_SHOW_NO_OVERLAP_STACK`

**Fixed: Ingress Timing Violations**
- **Issue**: Spawn at only 1.76 hexes, immediate weapons fire
- **Fixes**: Enforced 8 hex minimum spawn, 1250ms fighter / 3000ms bomber ingress, 250ms role-read beat
- **Tests**: `AIR_SHOW_INGRESS_SPAWN_MINIMUM_8_HEX_DISTANCE`, `AIR_SHOW_FIGHTER_INGRESS_MINIMUM_1250MS`

### Historical Regression Ledger (User Reported)

Retained for traceability. Statuses below reflect the current measured runtime and regression coverage as of 2026-04-21.

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| ~~**Flak timing misplaced**~~ | ~~High~~ | ✅ **FIXED** | Flak now fires during terminal approach in the governed late-approach window, with active regression coverage for progress placement. |
| ~~**Aircraft disappear/reappear at target**~~ | ~~Critical~~ | ✅ **FIXED** | Removed `actor.active` filter from `buildAirShowFlightAssignments` — all actors now get phase assignments, visibility controlled by opacity only |
| ~~**Fighters linger during next bomber approach**~~ | ~~High~~ | ✅ **FIXED** | Skip `escort-hold` phase when bomber is present — fighters now reposition immediately for defense instead of drifting |
| ~~**Bombers appear compliant only via shared-window path truncation during fighter-ingress**~~ | ~~Critical~~ | ✅ **FIXED** | Contested pre-target timing is now derived from the canonical bomber corridor-to-stand-off path, and the renderer applies explicit motion budgets from shared playback policy instead of the old shared-window shortening workaround. |
| ~~**Both fighter factions egress toward same side (player HQ)**~~ | ~~High~~ | ✅ **FIXED** | Egress target for interceptors/escorts now uses `hqAxis.botOrigin` (Bot faction) or `hqAxis.playerOrigin` (Player faction) with lane offset, replacing hardcoded `corridorPoint(±146px)` offsets from corridor center. Applied to both `inspectResolvedAirCombatShow` and `animateResolvedAirCombatShow`. Choreography test Invariants 5+6 now pass. |
| ~~**Bombers reach target simultaneous with fighter clash start**~~ | ~~High~~ | ✅ **FIXED** | Current contested playback starts the clash during early bomber approach instead of at target arrival; regression coverage now measures clash start against bomber pre-target progress. |
| ~~**Bombers disappear for entire dogfighting scene**~~ | ~~Critical~~ | ✅ **FIXED** | Root cause: `syncAirShowPhaseVisibility` hid any actor not in current phase assignments. Added bomber hold-in-place assignments to every escort clash beat so bombers remain in `phaseAssignments` and stay visible. |
| ~~**Escorts snap near-180° turn at dogfight start**~~ | ~~High~~ | ✅ **FIXED** | Clash-entry continuity is now covered directly; current escorts enter the first clash beat without the old near-180° reversal. |
| ~~**Bombers reappear after dogfighting scene**~~ | ~~Critical~~ | ✅ **FIXED** | Paired with disappearance fix. Removed the force `actor.active=true / opacity="1"` block at target-run start — bombers are never hidden so the restore was never needed, and it was incorrectly reactivating destroyed actors. |
| ~~**All sprites slow down when bombers reappear**~~ | ~~High~~ | ✅ **FIXED** | The blocking fade-in await was removed; target-run motion no longer stalls when bombers transition through the later beats. |
| ~~**Bombers and fighters perform mutual dogfight instead of interception pass**~~ | ~~High~~ | ✅ **FIXED** | `bomber-defense-pass` now preserves interception-pass roles without collapsing into fighter-style dogfight visuals: fighters fire straight nose-origin attack bursts, and bombers answer only with intermittent center-origin turret fire toward interceptors. |
| ~~**Surviving bombers briefly disappear and reappear facing opposite direction after ordnance**~~ | ~~Critical~~ | ✅ **FIXED** | Target-run to egress now stays continuous across position and heading; no despawn/respawn or heading-flip handoff remains at the ordnance boundary. |
| ~~**Destroyed escorts remain visible until CAP egress finishes**~~ | ~~Medium~~ | ✅ **FIXED** | The old `actor.active=true` force-show block at target-run start was reactivating destroyed actors; removing that block means only genuinely active actors enter egress. |}

### Progress Anchor Reference

```
Bomber Ingress (pixel path progress)
0.00 → spawn
0.15 → escort acceleration
0.20 → dogfight begins (CAP vs Escorts)
0.50 → dogfight ends / CAP engages bombers
0.80 → fighters disengage / flak begins
1.00 → reach stand-off point (2 hex equivalent before target)

Arc Turn (separate turnProgress)
0.00 → turn begins
0.50 → bomb release
1.00 → turn complete / egress begins

Egress (egressProgress)
0.00 → egress begins
0.20 → flak stops scheduling
1.00 → egress complete
```

### Known Issues (Non-Critical)

| Issue | Severity | Notes |
|-------|----------|-------|
| Off-screen spawn stacking | Minor | Expected per spec — occurs at t=0ms before visibility |
| Within-flight formation overlap | Moderate | Formation spacing within single flight — actors visually close but distinct |
| Late-merge convergence (t=570ms+) | Moderate | Paths reconverge after initial separation — acceptable for dramatic effect |

### Test Suite Architecture

The current air-show suite is organized by runtime layer, not by duplicated logic:

- `tests/BattleScreen.airMissionPlayback.test.ts` is the authoritative integration layer for `BattleScreen` playback wiring
- `tests/airScenarioSupport.ts` is the shared diagnostic support module used by scenario reports and inspection-based validations; it consumes production builders and planned-scene output rather than reconstructing its own choreography
- `tests/AirScenario.report.ts` and `tests/run-airshow-diagnostics.ts` generate anomaly reports and human-readable diagnostic bundles
- `tests/AirShow.fighterMotion.test.ts`, `tests/AirShow.progressTiming.test.ts`, `tests/AirShow.speedModel.test.ts`, `tests/AirShow.coordinatedPackage.test.ts`, `tests/AirShow.regression.test.ts`, and `tests/AirShow.bomberSpeed.validation.test.ts` cover motion, timing, continuity, coordinated-package behavior, regression protection, and role-speed validation
- `tests/AirShow.visual.jest.test.ts` provides renderer-facing visual assertions
- `tests/e2e/airshow-choreography.spec.ts` and `tests/e2e/airshow-visual.spec.ts`, with `src/testing/airshowE2eHarness.ts` and `src/testing/airshowHarnessFixture.ts`, provide browser-level confirmation

Guardrails for maintaining this suite:

- test support code must consume canonical runtime policy and scene-building helpers whenever the goal is to verify live behavior
- `AirShowPlaybackPlanner` and `PlannedAirShowScene` are authoritative for contested-package choreography; diagnostics and tests must consume them rather than rebuilding paths or timing from scratch
- do not recreate engine logic, scene-timing formulas, HQ-origin math, or role-speed constants inside tests
- do not maintain one implementation in `BattleScreen` and another in diagnostics or renderer code; shared logic belongs in a production module and every consumer should import it
- redundant or overlapping engine, planner, renderer, and test code is forbidden for contested-package timing, origin resolution, tracer ownership, and path choreography
- when a test intentionally uses synthetic timings or geometry, label it synthetic in the test name or report output

Primary commands:

- `npm test`
- `npm run test:airshow:diagnostics`
- `npm run test:airshow:report`
- `npm run test:airshow:visual`
- `npm run test:e2e`
