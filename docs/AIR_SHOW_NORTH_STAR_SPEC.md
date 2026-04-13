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

- escorts arrive first or slightly ahead on fast ingress
- strike craft arrive on slower overlapping ingress
- escorts maintain protective formation with the strike craft
- no dogfight phase occurs because no hostile interceptors are present
- strike craft perform their bombing run
- escorts and strike craft egress together

### Scenario 2: Strike Only

Participants:

- strike craft only

Required choreography:

- strike craft ingress on a smooth readable path
- strike craft perform a smooth bombing run over the target area
- ordnance release is visible
- strike craft continue into clear egress

### Scenario 3: Strike Plus Interceptors, No Escorts

Participants:

- interceptors
- strike craft

Required choreography:

- interceptors arrive first or establish contact first
- strike craft continue visible ingress rather than freezing for a separate combat stage
- no escort dogfight phase occurs
- interceptor passes happen against the bombers during the bomber run window
- survivors egress clearly

### Scenario 4: CAP Patrol / CAP Clash

Participants:

- opposing CAP / interceptor packages

Required choreography:

- interceptors ingress or appear as a patrol package
- they execute a readable CAP/patrol pattern over the relevant protected area
- they engage in a dogfight with enemy CAP missions
- they egress after the patrol beat or show duration

### Scenario 5: Full Engagement

Participants:

- interceptors
- escorts
- strike craft

Required choreography:

- escorts and interceptors enter the contested area first
- strike craft begin slower overlapping ingress behind the fighter screen
- escort and interceptor combat happens as a simultaneous melee, not as serial one-pair turns
- surviving hostile fighters transition into bomber interception
- bombers continue their target run if they survive
- surviving escorts remain tied to bomber protection
- surviving aircraft egress clearly

## Canonical Per-Package Timelines

Package timing is scenario-specific.

The renderer must select the canonical package timeline that matches the resolved participant mix and outcome. These timelines are not interchangeable. Each one exists to make the package read clearly for that specific scenario rather than forcing every package into the same generic beat order.

### Scenario 1 Package Timeline: Escort Plus Strike, No Interceptors

1. Escort-led ingress
   - escorts depart first or appear slightly ahead of the bomber corridor
   - bomber package departs on slower overlapping ingress
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

### Scenario 2 Package Timeline: Strike Only

1. Bomber ingress
   - strike craft depart origin on a smooth readable approach
   - there is no fighter beat and no screen beat
2. Terminal approach
   - bomber package lines up on the target without freezing or artificial repositioning
3. Flak
   - surviving strike craft take flak on terminal approach if flak is present
4. Strike release
   - only surviving strike craft release ordnance
   - the attack path remains smooth, with a visible target pass and release moment
5. Bomber egress
   - surviving strike craft continue away from the target on a clear exit path

### Scenario 3 Package Timeline: Strike Plus Interceptors, No Escorts

1. Interceptor-first contact
   - interceptors depart CAP or scramble origin and orient toward the bomber approach lane
   - they establish contact before or ahead of the bombers
2. Bomber ingress under threat
   - strike craft continue visible ingress while interceptors close
   - the bombers do not freeze for a separate combat stage
3. Direct bomber interception
   - hostile fighters attack the strike craft directly because no escort screen exists
   - fighter passes are simultaneous within the beat
   - bomber defensive fire occurs during these passes where applicable
4. Fighter break and separation
   - surviving interceptors break away on readable return arcs rather than drifting randomly
   - surviving strike craft continue toward the target from their actual post-combat positions
5. Flak
   - surviving strike craft that still reach the target lane take flak on terminal approach
6. Strike release
   - only surviving strike craft release ordnance
7. Bomber egress
   - surviving bombers exit clearly after the attack run

### Scenario 4 Package Timeline: CAP Patrol / CAP Clash

1. CAP ingress or establish-on-station beat
   - opposing CAP packages enter from their own patrol origins or protected sectors
   - both sides establish a readable patrol presence over the contested airspace
2. Patrol read
   - each CAP package traces a readable holding arc or patrol loop over the protected area
   - this beat must make the airspace ownership contest visually clear before the merge
3. CAP merge
   - opposing CAP packages tighten their arcs and commit toward a common engagement space
   - there is no bomber corridor in this scenario
4. CAP dogfight
   - fighter combat occurs as a simultaneous melee between the CAP packages
   - the show should read as air-superiority combat, not bomber interception
5. Air-superiority resolution beat
   - the surviving side briefly owns the patrol center or sweeps through it to signal control of the airspace
6. CAP egress
   - surviving CAP aircraft exit on readable return arcs after the patrol or clash beat completes

### Scenario 5 Package Timeline: Full Engagement

1. Ingress
   - interceptors depart origin and orient from player position toward enemy position
   - bomber package departs origin toward the first contested point or target area with escorts
   - escorts stay close to the bomber package during approach
   - interceptors/CAP approach the bomber package from their own patrol origin
2. Escort screen exchange
   - escorts move ahead of the bomber package and engage hostile fighters first
   - fighter combat is simultaneous within the beat
3. Bomber defense pass
   - surviving hostile fighters press through escorts toward the strike craft
   - interceptors make a pass at the bomber package while bomber defensive turret fire occurs
   - interceptors and escorts egress and return to their origins as bombers approach target and reach flak range
4. Flak
   - surviving strike craft that will reach the target area are engaged by flak on terminal approach
   - flak impacts and explosions occur
5. Strike release
   - only surviving strike craft release ordnance
   - bombers make a wide turn one hex before target as ordnance falls
   - ordnance impacts and explodes
6. Bomber egress
   - surviving bomber aircraft continue away from the combat area and exit the scene clearly

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

- `BattleScreen` orchestrates collection, grouping, sequencing, and camera timing
- the renderer owns the full linked package show for any complex contested air battle
- no package may split bomber ownership, escort ownership, or interceptor ownership across multiple unrelated playback paths
- no aircraft should disappear and later reappear because ownership switched between systems

Current implementation anchors:

- `src/ui/screens/BattleScreen.ts`
- `src/rendering/HexMapRenderer.ts`

### 3. One Package, One Visible Story

A linked strike package is the atomic storytelling unit for contested strike playback.

Within a package:

- ingress, combat, flak, strike, and egress are one continuous story
- aircraft roles stay visually legible
- survivors continue from where the previous beat ended
- destroyed aircraft exit continuously rather than vanishing instantaneously

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

These are target behavior rules for readability, not excuses for brittle hard-coding.

### Timing Principles

- fighters arrive first or establish contact first
- bombers arrive more slowly and may overlap with the fighter battle
- dogfight survivors should transition into bomber interception with effectively no visible dead stop
- bombing runs and interception passes may overlap when the package demands it
- total duration should feel brisk and readable rather than dragging

### Typical Contested Package Shape

A typical contested package should read approximately like this:

1. fighter ingress begins
2. bomber ingress begins while fighters are still arriving
3. escort screen combat starts as bombers continue approach
4. survivors arc into bomber defense or bomber interception
5. bombing run and intercept passes overlap where appropriate
6. egress begins immediately after the strike window closes

### Continuity Requirement

Every phase transition must be seamless.

The next phase begins from the aircraft's actual end position from the previous phase, not from a preselected staging point that creates teleporting or jerky redirection.

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
- tests already assert CAP-first ordering and escort participation in package interception
- mission update hooks and mission-report plumbing exist
- the system already exposes arrivals, engagements, and reports as distinct artifacts

### Not Yet Aligned

- `BattleScreen.playAirOperations()` still contains legacy orchestration and mixed playback paths
- `HexMapRenderer.playLinkedStrikePackage()` is still a structural stub rather than the full authoritative package renderer
- contested-package playback ownership is not yet fully consolidated
- CAP-only patrol presentation is still less explicit than the other package scenarios

This means the engine center of gravity is mostly correct, while the playback center of gravity is still drifting.

## Realignment Priorities

These priorities capture the most important lessons from prior planning and evaluation.

### Priority 1: Unify Playback Ownership

Before tuning path parameters or polishing visuals further:

- consolidate contested linked-package playback under one visible owner path
- stop splitting bomber lifecycle across separate playback systems
- eliminate any remaining path where a complex package is partly rendered by a fallback system

This is the first correction priority because most visible defects are downstream symptoms of ownership split.

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
- Air Support UI, reports, and activity log all reflect the same outcome as playback
- automated tests cover engine ordering, escort inclusion, live-target resolution, and playback sequencing
- the visible result reads as a coherent air battle rather than disconnected effects
