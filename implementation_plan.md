## Smoke Screen Implementation Plan

### Intent
Add smoke as a free tactical action for tanks, vehicles, artillery, and smoke-capable infantry. Firing smoke on a chosen hex edge blocks LOS across that edge for ground units for one full turn. Smoke requires ammo but does not consume movement or attack actions. Expires at the start of the following player turn.

### Scope
- `src/core/types.ts` — add `"smoke"` to `HexModificationType`; add `expiresOnTurn?: number` to `HexModification`
- `src/core/LOS.ts` — extend `Lister` with optional `smokeEdgeBlocksLOS(from, to): boolean`; apply smoke-edge check in `losClearAdvanced`
- `src/core/balance.ts` — register `"smoke"` in `TRAIT_EFFECTS`
- `src/game/GameEngine.ts` — `resolveLaySmokeAvailability`, `laySmoke()`, smoke expiry at turn start, smoke-aware `createLosLister()`
- `src/rendering/HexMapRenderer.ts` — `appendSmokePuffs()` + `"smoke"` case in `buildHexModificationOverlay()`
- `src/ui/screens/BattleScreen.ts` — `"laySmoke"` action card + handler; reuse fortification facing dialog

### Risk
HexMapRenderer and GameEngine are high-risk. Changes are additive only — no existing code paths modified.

### Verification
`npm run build`, `npm run lint`, `npm run test` must all pass. Manual: lay smoke → edge visual appears → LOS blocked on next attack → smoke clears at turn start.

---

## Deployment Panel Reserve Guard Plan

### Intended behavior
- A deployment click should consume a reserve at most once.
- If the UI is stale and a requested reserve no longer exists in the live engine queue, the battle screen must refresh from engine truth and provide a clear, actionable message instead of throwing an opaque engine error.

### Current behavior
- `BattleScreen` forwards deployment panel clicks directly to `engine.deployUnitByKey(...)`.
- When the same deployment request is processed after the reserve was already consumed, `GameEngine.findReserveIndexByUnitKey(...)` throws and the user receives a generic deployment failure.
- `BattleScreen.bindPanelEvents()` does not guard against repeated binding, which increases the risk of duplicate deploy handling if the screen is rebound in future flows.

### Expected new behavior
- `BattleScreen` performs a live reserve preflight before issuing a deployment command.
- If the target hex is already occupied by the just-placed unit and the reserve is gone, the second event is treated as a duplicate and ignored after a mirror refresh.
- If the reserve is genuinely absent, the user receives a structured deployment-panel error that explains what was attempted, what went wrong, and what to do next.
- Panel event binding is idempotent.

### Edge cases
- Duplicate deploy events for the same hex and unit key.
- Stale UI state where the panel still advertises a reserve that the engine has already consumed.
- Mixed reserve queues where the requested unit key must still be matched through scenario-type aliasing.

### Impact analysis
- Systems consuming this output:
  - `DeploymentPanel` event stream into `BattleScreen`
  - `DeploymentState` mirror refresh flow
  - `GameEngine.deployUnitByKey(...)`
- Events depending on this structure:
  - Deployment panel `deploy` events
  - `battleState.emitBattleUpdate("deploymentUpdated")`
- Visual behaviors that could shift:
  - Deployment failures should now refresh the panel back to live reserve counts before presenting an error.
  - Duplicate deploy clicks should no longer surface a false-negative panel error after a successful placement.

### Verification
- Add a focused regression test in `tests/BattleScreen.missionFlow.test.ts` covering duplicate/stale deploy handling.
- Run `npm run build`.
- Run the focused battle-screen test harness.

## AT Gun Preview Transparency Plan

### Intended behavior
- The attack confirmation modal should distinguish between authored unit stats and the range-adjusted combat math actually used for the shot.
- Anti-tank previews should explicitly show when `hardAttack` and armor penetration both influence the final damage-per-hit result.

### Current behavior
- `BattleScreen` labels the already range-adjusted accuracy term as `Base`, which reads like the unit's authored `accuracyBase`.
- The damage breakdown omits the attack-type scalar and the AP-vs-armor scalar, so anti-tank fire looks like it is skipping `hardAttack` or penetration even when the engine is applying both.

### Expected new behavior
- The preview should show the authored range-table value, the per-unit accuracy scalar, and the resulting base accuracy as separate steps.
- The damage breakdown should show the attack scalar (`softAttack` or `hardAttack`) and the penetration scalar (`effectiveAP` vs `facingArmor`) before commander bonuses.
- The modal should also surface the attacking weapon inputs (`accuracyBase`, attack stat, and AP) so the player can reconcile the preview with the unit card.

### Edge cases
- Soft targets should show `Soft attack` instead of `Hard attack`.
- Unarmored targets should explicitly indicate that no armor resistance applied.
- High-experience anti-tank units should still show their AP bonus separately from the authored AP stat.

### Impact analysis
- Systems consuming this output:
  - `BattleScreen` attack confirmation modal
  - Shared combat previews returned by `GameEngine.previewAttack(...)`
- Events depending on this structure:
  - Attack-confirmation modal refresh when a player selects a target
  - Stance re-preview refresh triggered by the attack dialog buttons
- Visual behaviors that could shift:
  - The detailed breakdown text in the attack modal becomes more explicit about range-base accuracy and armor-penetration math.
  - AT-gun previews should no longer look like they are using the wrong unit's base accuracy.

### Verification
- Add a focused combat test proving AT-gun damage responds to both `hardAttack` and AP.
- Add a battle-screen preview test asserting the modal text exposes range-table accuracy and penetration math.
- Run `npm run build`.
- Run a focused harness pass for the new AT-gun combat and preview tests.

## AT Gun Sustainment Balance Plan

### Intended behavior
- The 50mm AT-gun battery should model four guns sustaining materially higher fire volume per turn.
- The unit should carry enough ammunition to support that increased fire schedule without immediately exhausting the battery.

### Current behavior
- The shared towed AT profile uses `6` shots per turn.
- `AT_Gun_50mm` carries `5` ammo.

### Expected new behavior
- The towed AT profile should resolve `120` shots per turn, reflecting four guns firing roughly 30 rounds per minute across the turn window.
- `AT_Gun_50mm` should carry `6` ammo.
- The tuning entry should document that the battery's tow trucks keep enough rounds close at hand to sustain the higher fire plan.

### Impact analysis
- Systems consuming this output:
  - Shared combat resolution in `src/core/Combat.ts`
  - Player attack previews and activity summaries
  - AI combat simulations using the same attack resolver
- Visual behaviors that could shift:
  - AT-gun previews and combat results will show substantially higher expected damage than the prior 6-shot abstraction.

### Verification
- Update the focused AT-gun combat regression to the new shot-volume expectation.
- Run `npm run build`.
- Run the focused compiled harness for the AT-gun tests.

## Artillery Observer Tempo Plan

### Intended behavior
- Calling off-map heavy artillery should not consume the observing unit's action for the turn.
- Canceling a queued artillery strike should preserve the caller's real movement/attack state instead of resetting it.

### Current behavior
- `queueSupportActionFromUnit(...)` commits the caller through `resolveCommittedFieldActionFlags(...)`.
- `cancelQueuedSupport(...)` resets the caller back to default action flags, which can incorrectly restore movement or attacks that were already spent before the support order.

### Expected new behavior
- Queueing an artillery support action should leave the caller's movement and attack flags unchanged.
- Canceling a queued artillery support action should only clear the queued marker and support asset state, while keeping the caller's action flags intact.

### Impact analysis
- Systems consuming this output:
  - `BattleScreen` artillery targeting flow
  - `GameEngine.getUnitCommandState(...)`
  - Idle-unit registry and selection intel refresh after support scheduling/canceling
- Visual behaviors that could shift:
  - A unit can call artillery and still retain its normal command options for the turn.
  - Canceling a queued artillery strike no longer falsely refreshes the caller to a fully unused state.

### Verification
- Add a focused regression proving queued artillery leaves the caller's action state untouched.
- Run `npm run build`.
- Run a focused compiled harness for the updated command-state test.

## Connected Supply Upkeep Plan

### Intended behavior
- Units that remain connected to supply should only lose onboard ammo when they actually fire and only lose onboard fuel when they actually move.
- Passive supply upkeep should represent depot consumption, not silent depletion of the unit's carried magazines or fuel tanks.

### Current behavior
- `applyUpkeepForUnit(...)` charges the faction stockpile first, but when the depot runs short it falls back to draining the connected unit's onboard ammo and fuel.
- In missions with many linked defenders such as Town Defense, this makes units look like they are spending ammo faster than they fire.

### Expected new behavior
- Connected-unit upkeep should debit only the faction stockpile.
- If the depot cannot cover upkeep, the shortfall remains a logistics problem instead of silently reducing the unit's onboard ammo or fuel.
- Town Defense's authored `AT_Gun_50mm` loadout should match the updated six-round baseline.

### Impact analysis
- Systems consuming this output:
  - `GameEngine` supply tick and logistics snapshots
  - Unit intel panels reading live onboard ammo and fuel
  - Scenario-authored Town Defense unit loadouts
- Visual behaviors that could shift:
  - Connected defenders stop losing ammo between turns unless they actually fired.
  - Town Defense AT guns now spawn with the same six-round ammo load as the shared unit definition.

### Verification
- Add a focused logistics regression proving a connected unit keeps its onboard ammo when depot ammo is empty.
- Run `npm run build`.
- Run a focused compiled harness for the logistics regression.

## Precombat Depot Handoff Plan

### Intended behavior
- Ammunition and fuel packages bought during precombat should increase the live player depot stock that the battle logistics panel and supply engine read on turn one.
- The logistics resupply queue should use compact single-line rows, with the active selector state carrying the priority instead of redundant prose.

### Current behavior
- Precombat only hands deployable unit entries into battle; `ammo` and `fuel` purchases affect budget math but never reach the engine depot baseline.
- The logistics priority list renders large stacked cards and repeats the selected priority in text even though the active button already shows it.

### Expected new behavior
- Precombat allocation summaries should retain the purchased depot package.
- Battle initialization should inject that package into the player's initial depot stock.
- The logistics popup should render each priority target as a compact row with status, demand summary, and priority buttons on one line where space allows.

### Impact analysis
- Systems consuming this output:
  - `PrecombatScreen` allocation summary persistence
  - `BattleScreen` engine bootstrap configuration
  - `GameEngine` player depot baseline seeding
  - `PopupManager` logistics queue rendering
- Visual behaviors that could shift:
  - Depot ammo and fuel now start higher when the commander bought supply packages in precombat.
  - Logistics priority entries become much denser and no longer show a separate "Current priority" line.

### Verification
- Add a focused logistics regression proving initial depot stock augments the turn-one logistics snapshot.
- Run `npm run build`.
- Run a focused compiled harness for the logistics regression suite.

## Enemy Hex Intel Plan

### Intended behavior
- Clicking a hex with a visible enemy contact should keep showing terrain context while also surfacing a minimal enemy summary for the player.
- That summary should expose only the enemy unit type and strength, not hidden ammo or fuel state.

### Current behavior
- Non-player hex selection falls through to terrain intel only, even when the selected hex contains a spotted enemy formation.

### Expected new behavior
- The selection overlay should prepend an enemy-contact note when the selected hex matches a tracked enemy contact.
- The battle status line should also reflect that visible enemy contact in concise form.

### Impact analysis
- Systems consuming this output:
  - `BattleScreen` map selection feedback
  - `SelectionIntelOverlay` terrain-intel rendering
- Visual behaviors that could shift:
  - Enemy-held hexes now display a simple contact note such as unit type and current strength estimate.

### Verification
- Add a focused selection-intel overlay regression covering terrain intel with an enemy contact note.
- Run `npm run build`.
- Run a focused compiled harness for the selection-intel overlay test.

## Initiative Group Selection Cursor Stability Plan

### Intended behavior
- During an active player initiative group, selecting a different eligible unit in that same group should persist.
- UI sync should not force selection back to the queue head unless the current selection is no longer eligible.

### Current behavior
- `BattleScreen.ensureFocusedPlayerInitiativeUnit(...)` can overwrite an explicit non-current selection if the initiative cursor still points at the current activation.
- The result is visible "snap back" to the current unit after the player clicks another in-group unit.

### Expected new behavior
- If the player has explicitly selected a unit that is still in the active selectable initiative set, the initiative cursor should follow that unit and remain stable across sync ticks.
- Automatic refocus to current activation should occur only when the explicit selection is missing or no longer valid for the group.

### Scope
- `src/ui/screens/BattleScreen.ts`
- `tests/BattleScreen.initiativeFlow.test.ts`

### Impact analysis
- Systems consuming this output:
  - Initiative selection sync in `BattleScreen`
  - Initiative UI controls that read cursor/selection state
- Events depending on this structure:
  - Periodic initiative control sync that calls `ensureFocusedPlayerInitiativeUnit(...)`
- Visual behaviors that could shift:
  - Selecting a non-current unit inside the active initiative group now remains selected instead of snapping back.

### Verification
- Added regression test: `BATTLESCREEN_INITIATIVE_SYNC_PRESERVES_EXPLICIT_NON_CURRENT_GROUP_SELECTION`.
- Ran `npm run test` successfully.
- Ran `npm run lint`; existing repository-wide warnings remain, with no new errors introduced.

## Initiative Retaliation Pacing And Skip-Copy Plan

### Intended behavior
- Initiative bot attack and retaliation sequences should fully play, with readable camera focus transitions, before the queue advances to the next activation.
- Skip-group messaging should describe skipped activations/sentry behavior without "hold" or "waiting" phrasing.

### Current behavior
- Initiative retaliation playback had minimal settle pacing and did not explicitly refocus on the retaliating impact target before continuation.
- Skip-group UI messaging used "hold" language and some initiative-gate copy used "waiting" language after skip scenarios.

### Expected new behavior
- Initiative bot combat flow should include explicit focus/settle beats for attacker, target, and retaliation impact before completion.
- Skip-group message should read as a skip/continue instruction, and null-initiative gate messaging should avoid "waiting" phrasing.

### Scope
- `src/ui/screens/BattleScreen.ts`
- `src/ui/components/EnhancedInitiativeTurnControls.ts`
- `tests/BattleScreen.animations.test.ts`
- `tests/BattleScreen.initiativeFlow.test.ts`

### Impact analysis
- Systems consuming this output:
  - Initiative bot activation playback in `BattleScreen`
  - Initiative command controls copy in `EnhancedInitiativeTurnControls`
- Events depending on this structure:
  - Bot activation listener sequencing from `GameEngineInitiativeMethods`
- Visual behaviors that could shift:
  - Slower, clearer camera settles around retaliation moments.
  - Updated skip-group and initiative-gate wording in commander-facing prompts.

### Verification
- Added regression test: `BATTLESCREEN_INITIATIVE_BOT_RETALIATION_WAITS_FOR_FOCUS_PACING`.
- Added regression test: `BATTLESCREEN_INITIATIVE_SKIP_GROUP_USES_SKIP_COPY_NOT_HOLD`.
- Run `npm run test`.

## Experience AP Plan

### Intended behavior
- Experience should improve crew performance through hit chance and damage efficiency, but it should not change authored armor penetration or armor values.

### Current behavior
- `calculateEffectiveAP(...)` adds an experience-based AP bonus, causing otherwise identical AT guns to show different penetration values when one has EXP and the other does not.
- Armor values already remain authored and fixed.

### Expected new behavior
- Effective AP should match the unit definition's authored AP regardless of experience.
- Experience should continue to affect accuracy and damage-per-hit through the existing veteran crew scalars.

### Impact analysis
- Systems consuming this output:
  - Core combat resolution in `src/core/Combat.ts`
  - Attack previews and combat detail readouts
  - Focused AT-gun and preview regressions
- Visual behaviors that could shift:
  - Veteran anti-tank guns no longer display inflated AP values in previews.
  - Damage into armor may drop slightly where the old EXP-derived AP bonus previously improved penetration margin.

### Verification
- Update focused AT-gun combat tests and attack-preview text tests to authored AP behavior.
- Run `npm run build`.
- Run focused compiled harness passes for the updated AT-gun and attack-preview tests.

## Experience Veteran Tuning Plan

### Intended behavior
- Experience should make veteran crews substantially more accurate while only modestly improving the damage each successful hit causes.
- The tuning rationale should be documented where the shared combat knobs live so future balance passes keep the same doctrine.

### Current behavior
- Accuracy gains only `+3%` per EXP, which undersells how quickly practiced crews improve ranging, fire control, and shot placement.
- Damage per hit gains `+10%` per EXP, which overstates how much experience changes terminal effect after a round already lands.

### Expected new behavior
- Accuracy gains `+10%` per EXP.
- Damage per hit gains `+3%` per EXP.
- Shared combat comments should explain that accuracy is the skill that grows faster with experience, while post-hit lethality improves more slowly.

### Impact analysis
- Systems consuming this output:
  - Core combat resolution in `src/core/Combat.ts`
  - Shared combat tuning in `src/core/balance.ts`
  - Focused AT-gun regressions and mocked attack-preview tests
- Visual behaviors that could shift:
  - Veteran-unit previews will show larger hit-chance increases.
  - Veteran units will show smaller damage-per-hit deltas than before.

### Verification
- Update focused combat and preview regressions to the new experience scalars.
- Run `npm run build`.
- Run focused compiled harness passes for the updated AT-gun and attack-preview tests.

## Counterfire Depth Plan

### Intended behavior
- Defending units should be able to retaliate multiple times during a turn instead of exhausting all return-fire capacity after the first exchange.
- Each retaliation should continue to consume ammunition, and a unit with no remaining ammo should stop retaliating even if it has unused retaliation slots.

### Current behavior
- The engine hard-caps ground and air defensive fire at one retaliation per turn through repeated `>= 1` checks in preview and resolution flows.
- Ammo spending already happens per retaliation, but the one-shot cap prevents that resource rule from mattering in sustained enemy contact.

### Expected new behavior
- Shared counterfire tuning should allow up to six retaliations per turn.
- Player previews, player-initiated combat, and bot-initiated combat should all read the same retaliation cap.
- Once a unit has spent its ammo on retaliation, further attacks in the same turn should not trigger return fire.

### Impact analysis
- Systems consuming this output:
  - Shared counterfire tuning in `src/core/balance.ts`
  - Player attack preview retaliation checks in `src/game/GameEngine.ts`
  - Player and bot combat resolution retaliation gates in `src/game/GameEngine.ts`
  - Focused command-state combat regressions
- Visual behaviors that could shift:
  - Attack previews will continue to show return fire deeper into a turn until the defender reaches six retaliations or runs dry.
  - Defensive units under repeated attack will now keep spending ammo across multiple return-fire exchanges.

### Verification
- Add a focused regression proving a defending unit can retaliate six times and then stops once ammo is exhausted.
- Run `npm run build`.
- Run a focused compiled harness pass for the updated command-state test.

## Towed Gun Tempo Plan

### Intended behavior
- Towed gun formations should alternate between `deployed` and `towed` postures instead of using generic vehicle move-and-fire rules.
- A deployed battery must choose `Move Out` before towing, which spends half its movement to hook up.
- A towed battery gets full movement at the start of the turn, must `Deploy` before firing, and loses the rest of the turn if it deploys after already spending movement.

### Current behavior
- Towed guns have no explicit limbered/unlimbered state.
- Artillery-class batteries are globally blocked from attacking after any movement, which prevents the deploy-after-tow flow the design calls for.
- The battle UI has no `Move Out` or `Deploy` commands for towable batteries.

### Expected new behavior
- Towable batteries persist a `towState` of `deployed` or `towed`.
- `Move Out` switches a deployed battery to `towed` and spends half its movement allowance.
- `Deploy` switches a towed battery back to `deployed`; if the battery already spent movement this turn, deployment commits the rest of the turn.
- A battery that starts the turn already towed can deploy and fire in the same turn as long as it has not moved first.

### Impact analysis
- Systems consuming this output:
  - Shared scenario-unit state in `src/core/types.ts`
  - Player movement and attack gating in `src/game/GameEngine.ts`
  - Player command-state and action cards in `src/ui/screens/BattleScreen.ts`
  - Focused command-state regressions for towable batteries
- Visual behaviors that could shift:
  - Towed batteries now show explicit `Towed` or `Deployed` status chips.
  - Battle intel actions now include `Move Out` and `Deploy` for towable batteries.

### Verification
- Add focused regressions for move-out, deploy-after-movement, and deploy-then-fire flows.
- Run `npm run build`.
- Run a focused compiled harness pass for the updated command-state tests.

## Battle Messaging Plan

### Intended behavior
- Move failures should explain both the blocking rule and the corrective action instead of logging a generic failure.
- The battle intel overlay should keep its expanded mode across unit and hex selection changes until the commander explicitly switches back to compact mode.

### Current behavior
- Player move failures collapse to a generic "Move failed" message even when the engine already provided a specific reason.
- Fresh battle intel forces the overlay back to compact mode on every selection change.

### Expected new behavior
- Move failure announcements and activity-log entries should mirror the engine reason and append the next step the player can take.
- Expanded battle intel should stay expanded while selecting another unit on the same hex or another occupied hex; only the user toggling `Compact` should collapse it.

### Impact analysis
- Systems consuming this output:
  - Player move error handling in `src/ui/screens/BattleScreen.ts`
  - Persistent selection overlay state in `src/ui/announcements/SelectionIntelOverlay.ts`
  - Focused battle-screen and overlay regressions
- Visual behaviors that could shift:
  - System activity entries now explain why a move failed and how to recover.
  - The intel card no longer snaps back to compact mode when the commander keeps reviewing different units.

### Verification
- Add a focused regression for tow-state move failure messaging.
- Add a focused regression proving expanded intel survives a selection change.
- Run `npm run build`.
- Run focused compiled harness passes for the updated selection-intel tests.

## Facing Direction Unification Plan

### Intended behavior
- Unit facing and hex-edge facing should use the same six labels: `NW`, `NE`, `E`, `SE`, `SW`, `W`.
- Movement, combat, fortification checks, rendering, scenario validation, and authored data should all consume that same edge-based facing vocabulary.

### Current behavior
- Unit facings used a legacy vertex-style set with `N` and `S`, while fortifications already used edge labels with `E` and `W`.
- Several engine, renderer, adapter, scenario, and test paths still authored or defaulted to the legacy literals.

### Expected new behavior
- `FacingDirection` becomes the shared type for unit facings and edge facings.
- Legacy authored `N` and `S` values normalize to `NW` and `SE` only at compatibility boundaries.
- Runtime movement and combat heading resolution should emit the shared edge labels directly.

### Impact analysis
- Systems consuming this output:
  - Shared facing types and compatibility normalization in `src/core/types.ts`
  - Directional armor math in `src/core/Combat.ts`
  - Engine facing defaults and heading resolution in `src/game/GameEngine.ts`
  - Sprite rotation and fortification rendering in `src/rendering/HexMapRenderer.ts`
  - Authored scenario, adapter, and focused test data using unit facings
- Visual behaviors that could shift:
  - Units now rotate using the same label set shown in directional fortification logic.
  - Newly spawned or allocated units default to `NW` instead of the removed legacy `N`.

### Verification
- Add focused regressions for legacy facing normalization and edge-direction heading resolution.
- Run `npm run build`.
- Run a focused harness pass for the new facing-direction tests.

## Airshow Corridor Architecture Plan

### Intended behavior
- One corridor, one clock, one planned lifecycle per sprite.
- Build one authoritative corridor from HQ/origin to target/egress.
- Place every plane into stable lanes in that corridor at time zero.
- Compute fighter groupings once: 1:1, 2:1, 3:1, etc. No "extra" orbiting fighters.
- Drive all actors from one global timeline, then slice it into renderer phases only after the full motion is planned.
- Keep bombers moving the whole time. Fighter timing adapts to bomber ETA, not the other way around.
- Dogfight is not looping orbit behavior. It should be: head-on pass with tracers, peel/re-pair, tight turn, straight tracer pass, tight turn, straight tracer pass.
- Interceptors that survive then immediately attack bombers while bombers defend. No waiting period.
- Flak runs continuously around sampled bomber positions during the approach/target run, tapering after ordnance. Not interval bursts behind the target.
- Flak only runs when bombers are about eight hexes away from the flak unit.
- Bomber sprites turn before reaching the target so that they do not fly directly over the target hex, but not too soon as to look like they never got close enough.

### Current behavior
- The airshow has separate phase-local path repairs, timing patches, "gap/hold" phases, and static clash positions.
- Sprites look like they teleport, wait, circle, or disappear because each phase is trying to fix the last one.
- Fighters have a "bomber-ingress" wait phase where they hold position before attacking.
- Flak is split between defense and target phases with fixed intervals.
- Dogfight uses looping orbit behavior rather than aggressive head-on passes.

### Expected new behavior
- Fighter assignments in `bomber-ingress` phase now immediately attack bombers (no waiting period).
- Escort-clash-merge phase uses aggressive head-on pass with sharp peel-off after convergence.
- Escort-clash-scramble phase uses re-pair maneuver and second head-on pass before transitioning to bomber attack.
- Dogfight tracers fire during head-on convergence (0.5-0.7 in merge, 0.2-0.8 in scramble) with increased burst count and range.
- Flak is now continuous: sampled at bomber positions throughout approach phases (6 samples in approach, 4 in target run).
- Flak only fires when bombers are within 8 hex range (`HEX_WIDTH * 8`).
- Bomber target run path maintains existing turn-before-target behavior (turnEntry at -78px, nearTarget at -30px).

### Edge cases
- Fighters without escort opponents should still ingress and attack bombers immediately.
- Flak batteries beyond 8 hex range should not fire even if bombers are in other phases.
- Surviving interceptors from scramble phase must seamlessly transition to bomber attack without position jumps.

### Impact analysis
- Systems consuming this output:
  - `AirShowPlaybackPlanner.ts` contested airshow choreography
  - `HexMapRenderer.ts` airshow rendering via `PlannedAirShowScene`
  - Fighter/bomber animation paths and timing
- Events depending on this structure:
  - Airshow phase playback timing
  - Tracer burst rendering during dogfight phases
  - Flak burst rendering during approach and target phases
- Visual behaviors that could shift:
  - Fighters no longer hold position during bomber-ingress phase; they attack immediately.
  - Dogfight shows more aggressive head-on passes with continuous tracer fire.
  - Flak appears continuously during approach rather than in discrete bursts.
  - Bombers maintain existing turn-before-target behavior.

### Risk
AirShowPlaybackPlanner.ts is high-risk. Changes are to existing `buildCorridorContestedAirShowPlan` function only — no new code paths added, existing fallback planning path preserved as fallback (will be removed once corridor plan proves stable).

### Verification
- `npm run build`, `npm run lint`, `npm run test` must all pass.
- Visual verification: fighters attack immediately after escort clash; dogfight shows head-on passes; flak appears continuously during approach.
