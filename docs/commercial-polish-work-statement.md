# Four Star General - Commercial Polish Work Statement

## Purpose

This document defines the work required to move **Four Star General** from an advanced playable prototype into a **professional, gamer-ready browser tactics app** that can:

1. accelerate playtesting and development
2. showcase the game and the quality of the work behind it
3. attract players to the site
4. create a credible path toward monetization

This statement is grounded in the current repo state, the existing standards, and the mission-design authority already present in the project.

Primary references reviewed while writing this document:

- `CODING_STANDARDS.md`
- `README.md`
- `docs/four_star_general_mission_creation_agent_spec.md`
- `docs/mission-development-process.md`
- `docs/missions/river-crossing-watch.md`
- `src/ui/screens/LandingScreen.ts`
- `src/ui/screens/PrecombatScreen.ts`
- `src/ui/screens/BattleScreen.ts`
- `src/ui/components/DeploymentPanel.ts`
- `src/state/UIState.ts`
- `src/data/scenarioRegistry.ts`
- `src/data/scenario01.json`
- `src/data/scenario_river_watch.json`
- `src/data/unitTypes.json`

## Audience

This document is for:

- product direction and prioritization
- design and systems planning
- engineering implementation sequencing
- public-demo readiness decisions
- future commercial planning

## Strategic Goals

The game is not just trying to become "more complete." It is trying to satisfy four different outcomes at the same time.

### Goal A - Accelerate playtesting and development

The browser app should let you test mission design, force composition, deployment, pacing, and UX assumptions quickly.

### Goal B - Showcase your work professionally

The app should communicate craft, taste, and systems depth. It should feel like deliberate game development, not a rough prototype uploaded for convenience.

### Goal C - Attract gamers to your site

The experience must be trustworthy, readable, and memorable enough that a first-time player understands the game quickly and wants to keep exploring.

### Goal D - Create a viable monetization path

Monetization should come after trust, clarity, and replayability. A rough build can gather curiosity; it does not earn purchases.

## Current Product Classification

**Current state:** advanced playable prototype / internal vertical slice  
**Not yet:** public-demo-ready product  
**Target next state:** polished showcase vertical slice suitable for embedded site traffic and external playtesters

That distinction matters. The project already has meaningful gameplay systems, but it still behaves like a prototype in several places that public players will notice immediately.

## Repo-Verified Snapshot

The following points are directly supported by the current repo review:

- The app has a real playable flow: landing screen, commander selection, precombat setup, deployment, battle flow, and campaign routing.
- There is meaningful automated coverage, including battle, deployment, rendering, air-support, campaign, and mission-rules tests.
- `npm test` passes.
- `npm run build` passes.
- The production build currently emits a large-chunk warning:
  - `dist/index.js` builds to roughly `656.70 kB` minified
- The production build also warns that `campaign01.json` is both dynamically and statically imported, reducing chunking effectiveness.
- Mission routing is not fully content-distinct yet:
  - `src/data/scenarioRegistry.ts` routes `patrol_river_watch` to a dedicated scenario
  - all other missions currently resolve to the default scenario
- `BattleScreen.computeDefaultSelectionKey()` still prefers the legacy zone keys `zone-alpha` and `zone-bravo`.
- Critical deployment flow still contains prototype-style error handling:
  - `BattleScreen.handleAssignBaseCamp()` still uses `alert(...)`
  - other failures rely on announcements or console output
- `GameEngine.serialize()` and `GameEngine.fromSerialized(...)` exist, so persistence hooks are present at the engine layer, but the repo review did not surface a finished player-facing save/resume UX.
- `scenario_river_watch.json` is `14 x 12` with a single allied deployment zone of `12` hexes.
- `unitTypes.json` contains long-range assets such as:
  - `Flak_88` with `rangeMax: 8`
  - `Howitzer_105` with `rangeMax: 8`
  - `Rocket_Artillery` with `rangeMax: 14`

## Goal-by-Goal Readiness Assessment

### Goal A - Accelerate playtesting and development

**Status:** partially achieved

What is already working:

- playable browser flow exists
- missions can be selected and routed
- precombat allocations exist
- deployment and battle systems exist
- automated tests already support iteration confidence

What is still blocking faster development:

- mission routing is still too fallback-heavy
- there is no authoritative scenario validation gate
- mission scale doctrine is not enforced
- stale-state and selection risks still exist during mission transitions
- critical failures do not surface in a structured, playtester-friendly way

### Goal B - Showcase your work professionally

**Status:** partially achieved, but not yet ready for external first impressions

What is already working:

- the project has a distinctive concept and meaningful systems
- the codebase shows real engine and UI architecture, not a mockup
- the battle map, deployment, and mission framing already communicate tactical ambition

What still hurts showcase quality:

- several screens still feel prototype-functional rather than premium and intentional
- some mission identity is stronger in docs than in executable content
- hardcoded mission assumptions and fallback behavior reduce trust
- large first-load bundle and public-demo polish gaps weaken perceived craftsmanship

### Goal C - Attract gamers to your site

**Status:** not yet achieved

The game can already intrigue a curious visitor, but it is not yet optimized to convert that curiosity into confidence.

Missing pieces include:

- a strong first-minute value proposition
- a polished vertical slice that reliably delivers on the pitch
- stronger onboarding and debrief loops
- screenshot-worthy clarity and presentation
- a cleaner path from "what is this?" to "I want another mission"

### Goal D - Monetize the game

**Status:** premature to implement directly

The right near-term goal is not monetization features. The right near-term goal is **product trust**:

- reliable sessions
- coherent mission design
- strong first-run experience
- replayability
- retention signals
- clear audience fit

Monetization should begin only after the app is strong enough that asking players for money would feel credible.

## Executive Summary

Four Star General already has the foundation of a compelling browser tactics game:

- a clear command fantasy
- real tactical systems
- a mission-driven flow
- browser-playable implementation
- automated tests and build discipline
- promising mission and content documentation

But the current app is best understood as a **promising prototype with strong systems direction**, not yet as a professional gamer-facing product.

The biggest commercial-polish issue is not visual style. It is **trust**.

A public tactics app must make the player feel that:

- the rules are coherent
- the mission they chose is the mission that actually loaded
- the map scale matches the unit scale and the command fantasy
- deployment space supports believable planning
- the UI is always synced to the mission state
- failures are clear, contextual, and actionable

### Progress update - current implementation status

- scenario validation now fails fast during scenario resolution instead of allowing tactically invalid content to load silently
- `Coastal Push` metadata has been corrected so authored size matches the actual tile matrix
- `River Crossing Watch` player deployment frontage has been widened from a `12`-hex west-bank patch to a `20`-hex line of departure
- `PrecombatScreen` and `BattleScreen` now register the same finalized deployment-zone geometry instead of diverging between planned and raw hex sets

Until those contracts are enforced, added visuals alone will not produce a truly professional result.

## Core Product Recommendation

Do **not** try to polish every mission equally right away.

The most effective path is to create a **public-facing vertical slice**:

- one excellent showcase mission
- one clean onboarding path
- one reliable mission flow from landing to debrief
- one polished visual identity
- one trustworthy build that external players can finish without confusion

That vertical slice can then serve all four strategic goals at once:

- faster playtesting
- better showcase value
- stronger player acquisition
- a credible base for later monetization

## Recommended Public Demo Scope

The minimum viable public build should be intentionally narrow.

### Recommended public-demo shape

- one flagship mission:
  - `River Crossing Watch` is the strongest current candidate because it already has dedicated design documentation and a dedicated scenario
- one training/onboarding path
- one polished landing-to-battle-to-debrief session
- one clear difficulty selector
- one clean settings/help surface
- one public-facing CTA after play:
  - wishlist, mailing list, follow, devlog, or "play the next build"

### Public-demo requirements

Before embedding this on a site or using it as a serious portfolio/game-attraction tool, the build should meet this bar:

- no mission-routing deception
- no stale mission UI state after changing scenarios
- no critical action that fails silently or vaguely
- no obviously cramped or tactically incoherent showcase mission
- clear first-session understanding within the first minute
- stable build on target browsers
- strong enough presentation that screenshots and short clips look intentional

## Current Findings

### 1. Mission routing and content differentiation are not yet fully trustworthy

This is a major product issue, not just a code issue.

Observed implementation evidence:

- `src/data/scenarioRegistry.ts` routes `patrol_river_watch` to a dedicated scenario.
- Other missions currently fall back to the default scenario.

Result:

- mission identity is stronger in the docs than in the executable build
- players may choose different missions and still experience the same underlying battlefield
- this weakens both playtesting value and showcase credibility
- public users will quickly sense when mission variety is mostly framing rather than content

### 2. Scenario scale mismatch is undermining the intended command fantasy

The project documentation describes a game that wants to support more than tiny skirmishes. The currently authored scenarios do not consistently enforce that.

Observed examples:

- `docs/four_star_general_mission_creation_agent_spec.md` describes patrol, assault, and campaign missions using larger tactical or operational framing.
- `docs/missions/river-crossing-watch.md` describes a tactically meaningful frontage around multiple river crossings.
- `src/data/scenario_river_watch.json` still uses a compact `14 x 12` map, but now exposes a widened `20`-hex player deployment frontage to better support ford coverage.
- `src/data/scenario01.json` uses `20 x 16` while `src/data/unitTypes.json` contains globally available long-range assets such as:
  - `Flak_88` with `rangeMax: 8`
  - `Howitzer_105` with `rangeMax: 8`
  - `Rocket_Artillery` with `rangeMax: 14`

Result:

- battalion/regiment semantics are being framed on maps that still behave like compressed skirmish boards
- maneuver space collapses too quickly
- long-range assets can dominate boards that are too shallow for the intended command scale
- the player fantasy and the actual battlefield geometry are drifting apart

### 3. There is no enforced weapon-range-to-map-size contract

Unit range values live globally in `src/data/unitTypes.json`.
Scenario size lives independently in scenario JSON.
There is no validation layer establishing whether:

- a mission footprint can support the longest weapon ranges expected in that mission
- deployment depth is sufficient relative to indirect-fire range
- objective spacing is large enough to create maneuver instead of immediate compression
- force density is appropriate for the map frontage

Result:

- scenarios can be technically valid JSON while still being tactically invalid game content
- balance problems become content-pipeline problems instead of obvious engine failures
- mission authoring will continue drifting unless validation is formalized

### 4. Deployment zones are still prototype-style patches rather than command-scale systems

The current zone model supports deployment, the mission layer now exposes reusable deployment defaults, and deployment doctrine now drives runtime capacity/frontage normalization, but authored zones still begin as hand-tuned seed patches rather than fully generated command-scale systems.

Observed example:

- `River Crossing Watch` originally provided one player deployment zone with `capacity: 12` and a narrow west-bank footprint.
- The current implementation now widens that zone to `capacity: 20`, derives that minimum from shared mission deployment doctrine, and shares finalized zone geometry between `PrecombatScreen`, `BattleScreen`, and scenario validation.
- `src/data/missions.ts` now exposes a shared `MissionProfile` contract with mission category, deployment-focus metadata, and doctrine thresholds so new missions can declare their line-of-departure defaults and minimum frontage/depth expectations without adding screen-local branching.

Result:

- frontage risk has been reduced for the flagship patrol mission and new missions now have an explicit place to declare deployment intent and minimum geometry
- runtime deployment quality is less fragile because authored seed patches can now be normalized up to mission doctrine instead of being trusted blindly
- scenario authors still begin from hand-tuned seed patches because the engine is not yet generating full frontage/depth layouts from higher-level doctrine templates alone
- the player is closer to a polished "commander establishes a line of departure" experience, but the presentation and posture framing are still more generic than commercial-showcase quality

### 5. Battle-screen mission transitions now have an explicit mission-session reset, but richer deployment UX normalization is still pending

`BattleScreen.handleScreenShown()` now refreshes the scenario, keys battle re-entry by mission + difficulty + scenario, resets mission-derived UI state, rehydrates mission briefing copy, and rebuilds the engine/deployment mirrors when the mission session changes.

The highest-risk stale-state paths have been addressed, but richer deployment UX still depends on deliberate panel rebuilds and future mission-specific presentation work.

Observed implementation evidence:

- `BattleScreen` now exposes a single `resetMissionDerivedUiState()` contract that clears mission rules, phase state, selection state, activity state, and deployment-panel scenario state
- mission re-entry is now keyed by a full mission session identity instead of scenario name alone, so changing difficulty on the same mission no longer reuses stale HUD/engine state
- `BattleScreen.computeDefaultSelectionKey()` now prefers the authored mission deployment default from `MissionProfile` before falling back to generic player zones

Result:

- stale selected-hex, default-selection, phase, and briefing state are much less likely when changing missions or difficulty
- the browser showcase app is more trustworthy on first load and re-entry because mission-session identity now matches runtime difficulty and scenario context
- remaining risk is concentrated in richer deployment-panel UX and future mission-specific presentation, not in the old mission-session identity bug

### 6. Default selection is now mission-safe, but deployment posture presentation is still generic

Observed implementation evidence:

- `BattleScreen.computeDefaultSelectionKey()` now asks the authored `MissionProfile` for a preferred deployment zone first
- `River Crossing Watch` can declare `allied-start` as its deployment default while baseline missions continue to use `zone-alpha`

That removes the old legacy assumption, but the surrounding deployment UX still presents a mostly generic status model.

Result:

- keyboard navigation and initial focus no longer depend on hidden hardcoded zone names
- new mission authoring is safer because deployment defaults live in a shared mission catalog
- the remaining polish gap is presenting those authored defaults with stronger mission-specific posture copy and visual framing

### 7. Critical deployment failures are still reported too softly

Current failure handling relies too heavily on announcements, console output, and in at least one important path, `alert(...)`.

That is acceptable for low-stakes informational updates, but too weak for critical deployment gates such as:

- invalid base-camp assignment
- invalid zone selection
- over-capacity deployment attempts
- mission-state mismatch during deployment initialization
- missing scenario data or invalid zone metadata

Commercial polish requires:

- in-panel error states
- clear operator-facing messages
- structured logging
- explicit corrective action
- no reliance on a transient announcement stream for critical failure understanding

### 8. Save confidence exists at the engine layer, not yet at the player layer

Observed implementation evidence:

- the engine exposes serialization and hydration hooks
- the reviewed repo state did not surface a finished, player-facing save/resume loop for tactical sessions

Result:

- internal persistence capability exists
- player confidence does not yet benefit from it
- browser players are less likely to trust a longer session without explicit save/resume support or a deliberately short-session design

### 9. The product still lacks a formal first-session and audience-conversion layer

Even after the rules contracts are fixed, a professional browser tactics app still needs:

- a stronger first-minute value proposition
- cleaner entry into the game loop
- player-facing "how to play" confidence
- stronger debrief and replay prompts
- an explicit audience funnel after the session ends

Without this layer, the app may still be interesting, but it will not convert interest into retention or site value efficiently.

## Product Goal

The target state is:

> **A reliable, visually polished, tactically coherent browser wargame vertical slice that communicates command-scale intent clearly, loads missions safely, explains failures cleanly, and delivers a memorable first session that players trust enough to replay, share, follow, and eventually pay for.**

## Commercial Polish Principles

All polish work should follow these principles.

### 1. Rule coherence before cosmetics

Visual polish matters, but it cannot mask broken scale assumptions, fallback-heavy mission logic, or unreliable interaction state.

### 2. No silent recovery paths

The project standards already reject hidden fallbacks. Commercial polish should strengthen that policy:

- validate early
- fail clearly
- tell the player or developer what was attempted
- tell them how to correct it

### 3. Product honesty matters

If only one mission is truly showcase-ready, present one mission beautifully instead of pretending that four missions are equally finished.

### 4. Feature work and refactor work must be split

Per `CODING_STANDARDS.md`, the project should not mix behavior changes with structural cleanup in the same change set.

### 5. Mission quality must be enforced, not merely documented

The mission spec is strong. The next step is turning it into a real authoring and validation contract.

### 6. The player experience must feel intentionally designed at every layer

That includes:

- landing
- mission selection
- precombat
- deployment
- battle
- debrief
- return flow

## Required Workstreams

## Workstream 1 - Define the Product and Public Demo Strategy

### Objective

Lock the intended first public build so the team polishes toward a specific product, not an abstract idea of completeness.

### Why this matters

The app has multiple ambitions. Without a single public-build definition, work can spread thinly across systems, content, and polish without creating a presentable result.

### Required next steps

- Decide the exact intended public build:
  - private playtest
  - site-embedded playable demo
  - public alpha
  - premium vertical slice
- Define the target audience for the next build:
  - strategy veterans
  - curious general gamers
  - history/wargame audience
  - portfolio reviewers and collaborators
- Define the first-session promise in one sentence.
- Choose one flagship mission for the public vertical slice.
- Decide whether short-session design can substitute for full save/resume in the first public build.
- Define the player CTA after the session:
  - mailing list
  - follow/devlog
  - next build signup
  - wishlist

### Deliverables

- public-demo strategy note
- target audience definition
- flagship mission selection
- first-session promise statement
- public-build scope boundary

### Acceptance criteria

- The team can say exactly what the next public build is and is not.
- Work can be prioritized against a specific audience and session goal.
- "Professional gamer-ready" has a concrete scope instead of a vague aspiration.

## Workstream 2 - Establish an Authoritative Scale Doctrine

### Objective

Create a single source of truth for battlefield scale so map size, force density, objective spacing, and weapon ranges align with the command fantasy.

### Why this matters

Without this doctrine, every new mission risks becoming an ad hoc exception.

### Required next steps

- Define explicit scale classes for `training`, `patrol`, `assault`, and `campaign`.
- For each scale class, define:
  - intended command fantasy
  - expected unit count range
  - recommended map width/depth bands
  - objective cluster count
  - minimum deployment frontage
  - minimum deployment depth
  - safe first-contact window
  - acceptable range envelope relative to footprint
  - recommended turn-limit bands
- Decide whether the current game is:
  - platoon/company tactics on compact maps
  - battalion/regimental commands on broader maps
  - a hybrid model by mission type
- Choose one doctrine and enforce it.
- Add an authoritative scale contract under `docs/` or `design/`.

### Deliverables

- scale doctrine document
- mission size-class table
- frontage/depth guidance per mission type
- force-density guidance per mission type

### Acceptance criteria

- Every mission type has a documented size class.
- Every mission author can determine whether a map is too small before JSON authoring is complete.
- The battalion/regiment-vs-skirmish mismatch is resolved explicitly.

## Workstream 3 - Build Scenario Validation and Authoring Gates

### Objective

Prevent tactically invalid scenarios from entering the playable build.

### Why this matters

Today, scenario JSON can be syntactically valid while still being tactically wrong.

### Required next steps

- Add a scenario validation layer that runs in development and CI.
- Validate at least the following:
  - map dimensions against mission type and declared size class
  - longest expected weapon range versus map depth and objective spacing
  - deployment zone capacity versus available player roster count
  - deployment zone passability and usable hex count
  - objective count and spacing versus mission type
  - base-camp legality where required
  - first-contact safety assumptions where codifiable
  - zone keys referenced by UI/default-selection logic
- Introduce mission metadata required for validation, such as:
  - mission size class
  - intended force density
  - allowed unit-role envelope
  - expected max-range envelope
  - intended deployment model
- Fail fast with actionable messages. Do not silently coerce or auto-correct invalid authoring.
- Create validation tests for all current scenario files.

### Deliverables

- scenario validation module
- CI validation step
- mission/scenario metadata extensions
- test suite covering valid and invalid scenarios

### Acceptance criteria

- A mission that is too small for its declared role fails validation.
- A mission with insufficient deployment frontage fails validation.
- A mission using incompatible unit ranges for its footprint fails validation.
- Validation output tells the author what is wrong and how to fix it.

## Workstream 4 - Finish Mission Routing and Mission-Safe State Contracts

### Objective

Make mission choice truthful and make every mission transition rebuild both engine state and UI state safely.

### Why this matters

You cannot pitch multiple mission types publicly if mission routing still relies on default-scenario fallbacks or if mission-specific UI state can leak.

### Required next steps

- Replace scenario-registry fallbacks with explicit mission-to-scenario mapping rules.
- Decide which missions are fully distinct now versus intentionally unavailable.
- Define a battle-screen mission activation contract that explicitly resets:
  - `selectedHexKey`
  - `defaultSelectionKey`
  - selected terrain and zone labels
  - deployment-panel selected hex and locked-zone context
  - deployment highlight state
  - queued deployment actions or pending reserve interaction
  - selection intel overlays derived from prior mission state
  - any announcement or mission-end context that should not persist
- Add a dedicated normalization method invoked whenever the scenario changes.
- Ensure normalization order is explicit:
  - refresh scenario
  - reset mission-derived UI state
  - rebuild engine
  - rebuild map
  - re-register zones
  - rebuild deployment mirrors
  - compute mission-safe default selection
  - resume interactivity
- Add regression tests for:
  - app boot -> mission select -> precombat -> battle
  - mission A -> back out -> mission B -> battle
  - repeated battle entries for the same mission

### Deliverables

- explicit scenario registry plan
- battle-screen normalization contract
- regression tests for mission transitions
- manual QA checklist for mission switching

### Acceptance criteria

- Every selectable mission maps to the scenario the player expects.
- No selection, highlight, or zone label survives from a previous mission unless intentionally persistent.
- Entering battle always reflects the currently selected mission.

## Workstream 5 - Replace Static Deployment Patches with a Deployment Frontage System

### Objective

Turn deployment from hand-tuned tiny patches into a reusable command-scale deployment framework.

### Why this matters

Deployment is one of the first places players judge professionalism. If opening placement feels cramped, arbitrary, or mission-fragile, the whole game feels less trustworthy.

### Required next steps

- Define deployment doctrine by mission type:
  - training deployment doctrine
  - patrol deployment doctrine
  - assault deployment doctrine
  - campaign deployment doctrine
- Replace tiny authored-zone assumptions with derived or semi-derived rules based on:
  - mission role
  - map scale class
  - player force density
  - safe approach count
  - terrain passability
  - river/coast/landing requirements
  - reserve model and base-camp rules
- Expand the planner to reason about:
  - frontage width
  - depth
  - passable hex count
  - contiguous or semi-contiguous zone structure
  - reserve staging space
  - line-of-departure shape
- Separate three concepts clearly:
  - authored mission intent
  - derived zone generation or augmentation
  - battle UI rendering of the finalized deployment area
- Add validation to ensure:
  - zones have enough usable hexes
  - zone capacity matches tactical expectations
  - the opening does not collapse into one tiny funnel unless intentional and documented

### River Crossing-specific next steps

- Re-evaluate whether the widened `20`-hex allied deployment frontage feels sufficient in live play.
- Verify that the new frontage truly lets the player credibly cover multiple river crossings.
- Ensure at least two viable opening deployments exist:
  - central anchor with flexible reaction
  - distributed screening posture

### Current implementation progress

- completed: widened `River Crossing Watch` player deployment frontage from `12` to `20` hexes
- completed: battle and precombat now consume the same finalized deployment-zone geometry
- completed: validation now rejects River Watch frontage/capacity regressions
- remaining: lift the current River Watch-specific improvement into a doctrine-driven system for all mission types

### Deliverables

- deployment doctrine document
- updated planner rules
- updated scenario authoring guidance
- mission-by-mission deployment audits

### Acceptance criteria

- Deployment zones feel sized for the force and mission role.
- Players can form a credible opening line or screen.
- Mission authors are not forced to micromanage every zone as a brittle patch.

## Workstream 6 - Make Default Selection and Critical Error UX Professional

### Objective

Remove legacy assumptions from focus behavior and upgrade critical failures from prototype-style notifications into professional UX.

### Why this matters

Hardcoded zone names and weak error presentation damage polish immediately, especially in a public browser game where the user has no patience for ambiguous failure states.

### Required next steps

- Replace hardcoded legacy zone keys in `computeDefaultSelectionKey()`.
- Source default selection from actual registered player deployment zones.
- Define explicit priority rules, for example:
  - first legal player deployment zone
  - base-camp zone if already locked
  - first valid objective-adjacent actionable hex if post-deployment
  - only then a neutral fallback that is documented and safe
- Add failure handling for "no valid player zone available" that clearly reports the scenario problem.
- Classify errors by severity:
  - informational updates
  - recoverable player errors
  - blocking deployment errors
  - developer/data integrity errors
- For critical deployment problems, add in-panel error presentation with:
  - title
  - detail
  - corrective action
  - retry guidance
- Ensure all critical failures also log with structured console context.
- Remove `alert(...)` and announcement-only handling from critical deployment gates.

### Current implementation progress

- completed: `BattleScreen.computeDefaultSelectionKey()` now resolves from registered player deployment zones instead of raw scenario JSON
- completed: default selection now prefers an assigned base-camp hex when it is inside a registered player zone
- completed: missing player deployment context now surfaces as a blocking in-panel mission-state error instead of silently degrading focus behavior
- completed: begin-battle validation failures now route through structured deployment-panel messaging with console context instead of `alert(...)`
- completed: battle mission-end now hands results back to headquarters through shared campaign status instead of a browser `alert(...)`
- completed: campaign sidebar now renders the post-battle headquarters handoff as in-context live-region status copy
- completed: `CampaignScreen` no longer uses browser `alert(...)` for redeployment, editor, import/export, or save/load status messaging; these now surface through structured in-screen status copy
- completed: Workstream 6 prototype alert cleanup is now closed for battle and campaign player-facing flows

### Deliverables

- mission-safe selection resolver
- error taxonomy
- battle/deployment error presentation pattern
- tests for selection initialization and critical failure UX

### Acceptance criteria

- Default selection always points to a valid mission-specific context.
- Keyboard users get a reliable first focus target.
- Critical errors are visible in context and tell the user what to do next.

## Workstream 7 - Build the Flagship Mission into a Finished Vertical Slice

### Objective

Turn one mission from "scenario exists" into "this feels like a finished tactics product."

### Why this matters

One excellent mission is far more valuable for playtesting, showcasing, acquisition, and monetization groundwork than four half-finished mission labels.

### Required next steps

- Choose the flagship public-demo mission.
- Audit it against `docs/four_star_general_mission_creation_agent_spec.md`.
- Ensure completeness of:
  - identity
  - gameplay role
  - map logic
  - objective package
  - force composition package
  - deployment package
  - AI behavior package
  - pacing package
  - difficulty tuning package
  - UI copy package
  - debrief package
  - QA package
- Ensure the briefing always matches battlefield reality.
- Build proper debrief outcomes so players get closure and narrative reward.
- Add a second mission only after the flagship mission meets public-demo quality.

### Current implementation progress

- started: `River Crossing Watch` has been selected as the flagship public-demo mission candidate because it already has dedicated scenario data, dedicated design documentation, explicit mission routing, and the most mature deployment package
- started: a first audit matrix now exists at `docs/flagship-mission-audit-river-crossing-watch.md`
- identified: current strengths are mission identity, routing, map foundation, and deployment package maturity
- identified: the highest-value remaining gaps are executable ford-hold objective logic, optional objective tracking, fuller force composition, AI/pacing escalation, mission-specific debriefs, and difficulty variants
- completed: `BattleScreen` now uses live mission-status data to produce the flagship mission's headquarters handoff instead of relying on prompt-driven objective entry when River Crossing Watch resolves normally
- completed: River Crossing Watch optional objectives now settle to `completed` or `failed` at mission resolution instead of remaining stuck in `inProgress`
- completed: River Watch mission-rules regressions are now registered in the main test suite alongside a battle-flow regression proving the flagship mission end report uses computed objective state
- completed: River Crossing Watch now seeds real mission-status data from battle start so the objective panel shows ford counters and optional-objective state before the first turn advance
- completed: battle-flow regression coverage now proves the flagship mission status panel overrides static fallback objectives with the seeded River Watch objective board on initialize
- completed: River Crossing Watch precombat and battle briefing data now flow through a shared authored mission package in `src/data/missions.ts` instead of a screen-local fallback table
- completed: the flagship mission briefing copy now matches the authored mission document more closely, including the dawn foothold framing and a patrol-specific logistics summary for the precombat-to-battle handoff
- completed: precombat regression coverage now proves River Crossing Watch setup mirrors the authored mission package into both the DOM and `BattleState` handoff payload
- completed: River Crossing Watch now honors the authored difficulty-specific extraction windows (Easy 14 / Normal 12 / Hard 11) in precombat summaries, battle scenario normalization, and mission-resolution timing
- completed: the flagship mission handoff now keeps its extraction-window logistics copy synchronized with the selected difficulty so the battle HUD and mission rules read the same timer
- completed: new precombat and battle regressions now prove Hard difficulty reduces River Watch to an 11-turn extraction window instead of leaving the mission fixed to Normal timing
- completed: `src/data/missions.ts` now exposes a reusable `MissionProfile` contract so new missions can declare category and deployment-default metadata in one authored location instead of relying on screen-local mission branching
- completed: battle re-entry now keys off a full mission-session identity (mission + difficulty + scenario) so changing difficulty on the same mission forces a clean scenario/engine/UI refresh
- completed: `BattleScreen.resetMissionDerivedUiState()` now clears mission rules, phase state, selection state, and deployment-panel scenario state before rebuilding the new mission session
- completed: default battle focus is now driven by authored mission deployment defaults instead of hidden legacy zone-name assumptions, reducing fragility for future mission authoring
- completed: new precombat and battle-flow regressions now prove the reusable mission profile contract and difficulty-aware mission-session refresh behavior
- completed: mission deployment doctrine now lives in `src/data/missions.ts` and defines minimum player capacity/frontage/depth plus per-zone doctrine thresholds for future mission authoring
- completed: `finalizeDeploymentZone()` now accepts mission context so precombat and battle register doctrine-normalized player zones instead of trusting raw authored capacity alone
- completed: scenario validation now measures doctrine-driven finalized deployment geometry, allowing recoverable authored seed patches while still rejecting impossible capacity declarations
- completed: new deployment planner and scenario validation regressions now prove River Watch can recover a narrow authored seed patch to its 20-slot frontage through mission doctrine
- completed: River Watch mission rules now surface authored pacing phases at runtime so the flagship mission can distinguish probe, commitment, and reserve-pressure states instead of exposing only objective counters
- completed: River Watch phase 3 reserve-pressure messaging is now difficulty-aware, staying suppressed on Easy while Normal/Hard escalate after turn 4 once all three fords stay blocked for two turns
- completed: `BattleScreen` now announces River Watch phase changes exactly once and folds the active phase detail into the battle mission summary so commanders can read escalation state mid-mission
- completed: new River Watch mission-rules and battle-flow regressions now prove phase 2 commitment, phase 3 reserve pressure, and Easy suppression behavior
- remaining: evolve doctrine-normalized seed patches into richer mission-authored posture generation and UI framing, and bind River Watch pacing phases to concrete enemy composition or reinforcement/smoke events so authored mission metadata drives both battlefield pressure and commander-facing presentation

### Deliverables

- flagship mission audit matrix
- revised mission package
- debrief and commander-intent copy standards
- showcase demo script for the mission

### Acceptance criteria

- The mission feels intentionally designed from landing to debrief.
- The player can understand the tactical problem quickly.
- The mission is strong enough to be recorded, streamed, or embedded as a site showcase.

## Workstream 8 - Build a Production-Quality UX and Presentation Layer

### Objective

Make the app feel like a premium strategy product rather than a prototype with working systems.

### Why this matters

A gamer-ready app must feel legible, deliberate, and satisfying before the player understands the architecture underneath.

### Required next steps

- Audit and improve visual hierarchy across:
  - landing screen
  - mission selection
  - precombat
  - deployment panel
  - battle HUD
  - debrief / end mission flow
- Standardize typography, spacing, color roles, and component states.
- Improve map readability:
  - clearer selection states
  - clearer deployment overlays
  - more readable objective markers
  - stronger hover/focus affordances
  - clearer reserve/base-camp feedback
- Improve panel readability:
  - unit cards
  - role labels
  - deployment status copy
  - error states
  - objective summaries
- Add polished feedback loops where missing:
  - subtle animation
  - transition timing consistency
  - confirmation states for critical actions
  - audio plan, even if implementation comes later
- Design a strong first-run flow:
  - landing fantasy
  - clear mission choice
  - understandable precombat summary
  - trustworthy deployment onboarding

### Deliverables

- UI polish backlog by screen
- component consistency pass
- visual QA checklist
- feedback/audio integration plan

### Acceptance criteria

- The game is visually coherent screen-to-screen.
- Important information is easy to find within seconds.
- Interaction feedback feels deliberate and satisfying.

## Workstream 9 - Performance, Accessibility, and Browser Reliability

### Objective

Meet the baseline expectations of a public-facing browser strategy game.

### Why this matters

A polished browser game must perform well, load reliably, and be usable by more than one kind of player on more than one kind of machine.

### Required next steps

- Define performance budgets for:
  - initial load
  - mission transition
  - battle-screen entry
  - map pan/zoom
  - overlay redraws
- Reduce production-build risk areas already visible:
  - large first-load JS chunk
  - mixed static/dynamic imports blocking chunking
  - unnecessary eager loading for non-showcase paths
- Profile and fix hotspots related to:
  - map rendering
  - repeated DOM rebuilds
  - battle-screen initialization
  - large scenario loading
- Add accessibility standards for:
  - keyboard navigation
  - focus visibility
  - button and panel semantics
  - readable status messaging
  - contrast checks
- Test target browsers explicitly.
- Add comfort settings where appropriate:
  - animation intensity
  - sound volume
  - keybind visibility
  - UI scale if feasible

### Deliverables

- performance budget sheet
- browser support matrix
- accessibility checklist
- optimization backlog

### Acceptance criteria

- Battle entry and map interaction feel responsive on target hardware.
- Keyboard-only interaction is viable for core flows.
- The app has a clear browser support baseline.

## Workstream 10 - Save Confidence, QA Discipline, and Release Readiness

### Objective

Move from prototype verification to release-style quality discipline.

### Why this matters

Commercial polish depends on reliability and repeatability, not just feature breadth.

### Required next steps

- Decide the public-build session model:
  - short-session demo with no save requirement
  - or explicit save/resume as a player-facing feature
- If save/resume is required, build the UI flow on top of existing engine serialization hooks.
- Expand automated coverage for:
  - mission selection and routing
  - scenario validation
  - battle transition normalization
  - deployment legality
  - reserve and base-camp flows
  - mission end conditions
- Add deterministic regression tests wherever engine/state behavior changes.
- Add visual/manual QA scripts for:
  - map alignment
  - deployment overlays
  - transition correctness
  - objective markers
  - battle log and panel sync
- Define release checklists for:
  - content completeness
  - UI consistency
  - scenario validation pass
  - smoke tests
  - browser checks
- Create a golden-path smoke suite for the first-session experience:
  - open app
  - choose mission
  - enter precombat
  - enter battle
  - deploy units
  - assign base camp
  - begin battle
  - finish or exit cleanly

### Deliverables

- expanded test plan
- release checklist
- first-session smoke suite
- save/resume decision note
- manual verification templates

### Acceptance criteria

- Regressions in mission routing or deployment flow are caught before release.
- Every public demo build passes the same checklist.
- The team can say exactly what "ready to show publicly" means.

## Workstream 11 - Audience Growth and Monetization Groundwork

### Objective

Prepare the app to support public audience growth and future monetization without compromising the core game.

### Why this matters

You want the app to accelerate development, showcase your work, attract gamers, and monetize. That requires product-facing structure beyond internal correctness.

### Required next steps

- Define the intended audience funnel after the first session:
  - follow devlog
  - join mailing list
  - return for next scenario
  - wishlist future release
- Plan community-facing UX:
  - screenshot-worthy states
  - streamer-friendly readability
  - clear post-battle summary
  - patch-note/devlog hooks
- Decide what monetization stage comes next:
  - donations/supporter tier
  - premium full version later
  - cosmetic/supporter perks
  - campaign pack / mission pack later
- Keep monetization work explicitly downstream of:
  - trust
  - clarity
  - replayability
  - vertical-slice polish

### Deliverables

- audience funnel note
- showcase-readiness backlog
- community-facing UX checklist
- monetization prerequisites checklist

### Acceptance criteria

- A new player can understand what the game is within the first minute.
- The app feels presentable enough to embed on a site and direct traffic toward.
- Monetization planning is staged after trust, clarity, and replayability are established.

## Recommended Implementation Sequence

The following order is designed to minimize rework and align the project with its stated goals.

## Phase 0 - Lock the Product Definition

### Goal

Define the next public build before polishing individual systems.

### Immediate next steps

- Define the public-demo scope.
- Choose the flagship mission.
- Write the one-sentence first-session promise.
- Decide whether the next build is short-session-only or requires save/resume.

### Exit criteria

- Public build strategy approved.
- Flagship mission selected.
- Product scope boundary documented.

## Phase 1 - Reliable Playtest Foundation

### Goal

Stop invalid content and stale mission state from undermining trust.

### Immediate next steps

- Write and approve the scale doctrine.
- Implement scenario validation.
- Remove scenario-routing ambiguity.
- Implement mission-safe default selection.
- Implement battle-screen transition normalization.
- Add regression tests for mission transitions and routing.

### Exit criteria

- Invalid scenarios fail fast.
- Mission selection is truthful.
- Mission changes do not leak stale UI state.

## Phase 2 - Flagship Mission Hardening

### Goal

Turn one mission into a polished, trustworthy tactics session.

### Immediate next steps

- Rework deployment frontage for the flagship mission.
- Improve objective readability and pacing.
- Upgrade critical error UX.
- Tighten precombat summary and debrief presentation.
- Tune AI, copy, and difficulty for one end-to-end polished session.

### Exit criteria

- The flagship mission feels tactically coherent and intentionally authored.
- The deployment opening supports the intended command fantasy.
- Critical errors are visible, actionable, and professional.

## Phase 3 - Public Demo Presentation Pass

### Goal

Reach public-facing quality for the first session.

### Immediate next steps

- Execute UI consistency pass across landing, precombat, battle, and debrief.
- Improve first-load and chunking behavior.
- Complete browser and accessibility checks.
- Add help/settings/player-confidence surfaces needed for the demo.
- Add audience CTA after the session.

### Exit criteria

- The game looks coherent and responsive.
- The first minute communicates value clearly.
- The app feels deliberate, not fragile.

## Phase 4 - Audience Growth and Commercial Groundwork

### Goal

Use the polished vertical slice to support growth and validate future monetization.

### Immediate next steps

- Launch the public-facing build on the site.
- Gather external playtest feedback and retention signals.
- Add the second mission only after the first proves strong.
- Define the monetization path for the next product milestone.

### Exit criteria

- The app is confident enough for ongoing public showcase.
- External feedback is informing roadmap decisions.
- Monetization planning is grounded in a trusted player experience.

## Detailed Immediate Priorities

These are the next actions that should happen first.

### Priority 1 - Define the public vertical slice

- Pick the flagship mission.
- Define the next build as a specific player promise.
- Decide whether to expose only finished mission types in the public build.

### Priority 2 - Lock scale and validation

- Write the scale doctrine.
- Add scenario validation for size, range, frontage, zone capacity, and objective spacing.
- Validate current mission files against the doctrine.

### Priority 3 - Remove mission-trust liabilities

- Replace scenario-registry fallback dependence with explicit routing.
- Replace hardcoded zone keys in `BattleScreen.computeDefaultSelectionKey()`.
- Add a single battle-screen normalization method for mission-derived UI state.

### Priority 4 - Rework flagship deployment and error UX

- Expand and validate deployment frontage for the showcase mission.
- Add in-panel critical error surfaces.
- Remove `alert(...)` and vague "check console" behavior from player-critical flows.

### Priority 5 - Polish the first-session experience

- Improve landing value proposition.
- Improve precombat clarity.
- Improve battle HUD hierarchy.
- Add debrief and replay/follow-up prompts.

## Recommended Ownership Split

If this work is executed across multiple focused changes, the cleanest split is:

- **Product track**
  - public-demo definition
  - audience definition
  - first-session promise
  - monetization prerequisites

- **Design track**
  - scale doctrine
  - deployment doctrine
  - flagship mission audit
  - mission copy and debrief

- **Systems track**
  - scenario validation
  - mission routing cleanup
  - mission-safe selection
  - battle-screen normalization
  - error taxonomy

- **Presentation track**
  - visual hierarchy
  - first-run UX
  - accessibility
  - performance
  - browser QA

## Risks If This Work Is Not Done

- new missions will continue to feel inconsistent in scale and quality
- the app will feel prototype-fragile during public demos
- deployment and routing bugs will be mistaken for core game weakness
- long-range assets will continue to distort small maps
- mission identity will remain weaker in the build than in the docs
- public players may bounce before seeing the game’s real strengths
- monetization efforts will arrive before the product has earned trust

## Success Metrics for the Next Public Build

The next public-facing build should be considered successful if it can show evidence of the following:

- external players can complete the flagship mission without needing developer intervention
- first-session confusion is low enough that major failure points are design issues, not UI ambiguity
- testers can clearly describe the game fantasy after one session
- the build is stable across the chosen browser support baseline
- players are willing to replay, follow, subscribe, or ask for the next mission

## Definition of Commercial-Polish Done for the First Public Build

This game is polished enough for serious public showcasing when all of the following are true:

- the next public build is explicitly defined
- the flagship mission is fully truthful to its briefing and design intent
- scenario scale is governed by explicit doctrine
- invalid mission content fails validation before release
- mission routing is explicit and trustworthy
- battle-screen mission transitions never leak stale state
- default selection and focus are mission-safe
- deployment zones support the command fantasy and roster size
- critical deployment and mission errors are presented clearly and professionally
- the landing-to-battle-to-debrief session is visually coherent
- the app performs reliably on supported browsers
- automated and manual release checks exist and are used consistently
- the first session is strong enough to make a new player want another one

## Final Recommendation

Treat the current app as a **strong tactical prototype with genuine vertical-slice potential**, then execute commercialization work in this order:

1. define the public vertical slice
2. lock scale and validation contracts
3. fix mission routing and mission-safe state handling
4. harden deployment and critical error UX
5. polish one flagship mission end to end
6. execute the presentation, performance, and browser pass
7. layer in audience funnel and later monetization groundwork

That sequence creates a professional browser tactics app for the right reason: because the rules, content, UX, and product framing all reinforce the same command fantasy instead of fighting each other.
