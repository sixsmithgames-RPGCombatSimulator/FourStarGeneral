# TODO: Enemy Turn Animation & Playback Enhancements

## Goal
Make bot turns readable and enjoyable by animating each enemy move and attack while recentering the battle map and coordinating announcements.

## Definitions
1. **Bot Turn Playback** – Sequence from `BattleScreen.handleEndTurn()` to the moment player controls are re-enabled, encompassing enemy movement, attacks, supply updates, and announcements.
2. **BotTurnEvent** – Normalized representation of a bot action originating from `BotTurnSummary` (movement entries `{ unitType, from, to }`; attack entries `{ attackerType, defenderType, from, target, inflictedDamage, defenderDestroyed }`).
3. **Animation Pipeline** – Combined camera focus, sprite motion, visual/audio effects, state resynchronization (`renderEngineUnits()`), and announcement timing executed per `BotTurnEvent`.
4. **Skip Mechanism** – Player control that cancels in-progress playback, applies final engine state immediately, and publishes outcome announcements without animations.

## Tasks

### 1. Baseline Validation
- [ ] Document the current call flow (`GameEngine.endTurn()` → `executeBotTurn()` → `BotTurnSummary` consumption in `BattleScreen`) with file references @src/game/GameEngine.ts#1220-1254 and @src/ui/screens/BattleScreen.ts#1008-1043.
  - **Owner:** Gameplay engineer
  - **Success Criteria:** Written trace confirming the summary is handled synchronously and only produces text announcements today.

### 2. Movement Animation Subsystem
- [ ] Implement `HexMapRenderer.focusOnHex(hexKey, options?)` to recenter the viewport within ≤250 ms using smooth scrolling or SVG transforms. @src/rendering/HexMapRenderer.ts#521-633
  - **Owner:** Rendering engineer
  - **Dependencies:** Scroll container/SVG layer access
  - **Success Criteria:** Manual verification that calling the method recenters view with easing; fallback when smooth scrolling unsupported.
- [x] Create a reusable `animateUnitMove(fromKey, toKey, durationMs)` helper that interpolates unit sprites, cleans up temporary nodes, and resolves a promise when complete.
  - **Owner:** Rendering engineer
  - **Success Criteria:** Demo move lasts 400–600 ms and ends with `renderEngineUnits()` assuring canonical placement.
- [ ] Add `BattleScreen.playBotMovementSequence(events: BotMoveSummary[])` to iterate moves: focus camera, animate, await completion, and disable player input during playback.
  - **Owner:** UI engineer
  - **Dependencies:** Focus + animation helpers
  - **Success Criteria:** Sequential moves play without overlap; controls are disabled/re-enabled safely.
- [ ] Provide visual feedback (highlight origin/target hexes, optional breadcrumb path) during movement animations and clear styling afterwards.
  - **Owner:** UX/UI engineer
  - **Success Criteria:** Highlights appear per move and leave no residual classes once finished.

### 3. Attack Animation Subsystem
- [ ] Build attack effect utilities (`playAttackEffect(fromKey, toKey, options)`) producing projectile/beam plus impact pulse with automatic cleanup.
  - **Owner:** Rendering engineer
  - **Success Criteria:** Effect duration ≤500 ms, reusable across attacks, no leftover DOM nodes.
- [ ] Implement damage indicators (floating numbers, destruction cue) with ARIA-friendly messaging; ensure destroyed units fade/explode before removal.
  - **Owner:** UI engineer
  - **Dependencies:** Attack effect utilities
  - **Success Criteria:** Indicator visible for ~1 s; accessible text emitted once; destroyed units visibly leave the board.
- [ ] Add `BattleScreen.playBotAttackSequence(events: BotAttackSummary[])` to focus camera, run effects, wait for overlays, and trigger `renderEngineUnits()` post-resolution while queuing announcements until animations finish.
  - **Owner:** UI engineer
  - **Success Criteria:** No text announcement fires before its animation; state reflects casualties immediately after sequence.

### 4. Sequencing & Control
- [ ] Introduce `BattleScreen.playBotTurnAnimations(summary: BotTurnSummary)` orchestrating movement → attack → supply report, with robust error handling and guaranteed control re-enable.
  - **Owner:** UI engineer
  - **Dependencies:** Movement + attack sequences
  - **Success Criteria:** Player cannot act until playback completes; summary text matches final state.
- [ ] Add a “Skip Enemy Turn” control that cancels animations (use `AbortController` or similar), jumps to final state via `renderEngineUnits()`, and publishes a concise summary.
  - **Owner:** UX/UI engineer
  - **Success Criteria:** Skip completes in <250 ms and leaves UI consistent.
- [ ] Expose `BattleState.awaitEnemyPlayback(): Promise<void>` (or equivalent event) so other systems can defer work until enemy turn visuals finish.
  - **Owner:** Gameplay engineer
  - **Success Criteria:** Consumers can await playback without direct BattleScreen coupling.

### 5. Configuration & Accessibility
- [ ] Centralize animation timing constants (move, attack, camera focus, pauses) in a dedicated module for easy tuning.
  - **Owner:** Gameplay engineer
  - **Success Criteria:** Updating constants updates playback globally.
- [ ] Add a “Reduce enemy animations” option; when enabled, skip visuals but keep announcements and state synchronization.
  - **Owner:** UX/Accessibility specialist
  - **Success Criteria:** QA verifies toggle bypasses animations while preserving ARIA updates.
- [ ] Ensure all new methods include clear, human-readable comments describing purpose and rationale (per user requirement).
  - **Owner:** All contributors
  - **Success Criteria:** Code review checklist confirms comment coverage.

### 6. Risk Mitigations
- [ ] Prevent excessively long enemy phases by capping total playback duration (e.g., auto-skip if >8 s).
  - **Owner:** Gameplay engineer
  - **Success Criteria:** Timer triggers skip and logs warning when threshold exceeded.
- [ ] Add automated or scripted test verifying post-animation board state matches engine snapshots (guards against desync).
  - **Owner:** QE engineer
  - **Success Criteria:** Test fails if rendered units diverge from engine placements after playback.
- [ ] Reduce camera jitter by skipping re-centering when target hex is already within the viewport radius.
  - **Owner:** Rendering engineer
  - **Success Criteria:** Camera adjustments only occur when necessary; manual test shows no unnecessary jumps.

### 7. Documentation & Rollout
- [ ] Update relevant README or developer guides summarizing the enemy turn playback flow and available settings.
  - **Owner:** Documentation lead
  - **Success Criteria:** New section outlines playback steps and configuration knobs for future contributors.
