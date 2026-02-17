# TODO: Player Turn Animation & Feedback Enhancements

## Goal
Deliver satisfying, readable visuals for player-issued movements and attacks by animating unit actions, coordinating camera focus, and synchronizing UI overlays and announcements.

## Definitions
1. **Player Action Pipeline** – Flow from a player command (move/attack input in `BattleScreen`) to engine mutation, visual playback, and confirmation messaging. @src/ui/screens/BattleScreen.ts
2. **ActionEvent** – Structured data describing a pending player move (`{ unit, from, to }`) or attack (`{ attacker, defender, damagePreview }`) built before invoking `GameEngine.moveUnit()` / `attackUnit()`. @src/game/GameEngine.ts#1586-1719
3. **Playback Controller** – UI layer responsible for sequencing camera focus, sprite motion, combat effects, and supply/announcement updates after each player command.
4. **Preview vs. Resolution State** – Preview uses reachability/attack targeting overlays before commitment; resolution animates actual engine state changes afterward.

## Tasks

### 1. Baseline Audit
- [ ] Document current player move/attack flow (`BattleScreen.applySelectedHex()`, `moveUnit`, `attackUnit` dialogs) noting where visuals snap without animation. @src/ui/screens/BattleScreen.ts#1467-1675
  - **Owner:** Gameplay engineer
  - **Success Criteria:** Short design note mapping user inputs to engine calls and final `renderEngineUnits()` refresh.

### 2. Movement Animation Enhancements
- [ ] Introduce `BattleScreen.playPlayerMoveAnimation(event)` that:
  - Centers camera on origin hex (reuse `HexMapRenderer.focusOnHex`).
  - Animates the unit sprite from origin to destination using shared movement helper.
  - Waits for completion before calling `renderEngineUnits()`.
  - **Owner:** UI engineer
  - **Dependencies:** Camera focus helper (from enemy TODO).
  - **Success Criteria:** Player move plays smooth animation (≤500 ms) before board re-renders.
- [ ] Highlight movement path and destination during preview and fade out after animation.
  - **Owner:** UX/UI engineer
  - **Success Criteria:** Highlight clears even if action is canceled.
- [ ] Gate subsequent commands during playback (disable panels, keyboard). Re-enable when animation promise resolves.
  - **Owner:** UI engineer
  - **Success Criteria:** No double-execution when player double-clicks.

### 3. Attack Animation Enhancements
- [ ] Build `BattleScreen.playPlayerAttackAnimation(event)` mirroring enemy attack effects:
  - Focus camera on attacker.
  - Render projectile/impact using shared attack utilities.
  - Show damage numbers; if defender destroyed, fade sprite before engine refresh.
  - **Owner:** UI engineer
  - **Dependencies:** Attack effect utilities (shared with enemy playback).
  - **Success Criteria:** Visual sequence completes before confirmation dialog closes; destroyed units visibly removed.
- [ ] Queue announcements/voice text after visuals complete to maintain timing consistency.
  - **Owner:** UI engineer
  - **Success Criteria:** ARIA live region updates after animation, not before.

### 4. Preview Feedback Improvements
- [ ] Upgrade reachable/attackable overlays to include motion arrows or tooltips showing cost/chance.
  - **Owner:** UX designer
  - **Dependencies:** Existing `playerMoveHexes` / `playerAttackHexes` data. @src/ui/screens/BattleScreen.ts#1481-1603
  - **Success Criteria:** Preview reveals move count and attack odds without initiating animation.
- [ ] Implement hover previews on hex map that trace intended path before confirmation dialog opens.
  - **Owner:** UI engineer
  - **Success Criteria:** Path disappears when cursor leaves hex or action canceled.

### 5. Action Confirmation Flow
- [ ] Enhance attack confirmation dialog with miniature animation preview or static illustration reflecting expected outcome.
  - **Owner:** UX/UI engineer
  - **Dependencies:** Existing dialog markup. @src/ui/screens/BattleScreen.ts#101-211
  - **Success Criteria:** Dialog visually differentiates attack types; accessible description explains effect.
- [ ] After player confirms action, transition dialog out only once animation begins (to avoid abrupt changes).
  - **Owner:** UI engineer
  - **Success Criteria:** Dialog closes smoothly as animation starts.

### 6. Shared Utilities & Settings
- [ ] Consolidate animation helpers (focus, movement, attack effects) into shared module consumed by both player and enemy pipelines.
  - **Owner:** Gameplay engineer
  - **Success Criteria:** Single source of truth; no duplicate logic.
- [ ] Expose configurable animation durations for players via the same timing constants module used by enemy playback.
  - **Owner:** Gameplay engineer
  - **Success Criteria:** Changing constants affects both pipelines.
- [ ] Honor “Reduce animations” accessibility toggle for player actions (skip visuals but still show supply/announcement updates).
  - **Owner:** Accessibility specialist
  - **Success Criteria:** Toggle bypasses animation while maintaining ARIA output.

### 7. Risk Mitigations & Testing
- [ ] Prevent state desync by asserting engine/unit positions after animation; add regression test verifying `renderEngineUnits()` matches engine placements.
  - **Owner:** QE engineer
  - **Success Criteria:** Test fails if UI diverges from engine state.
- [ ] Provide fallback for interrupted animations (e.g., dialog closed mid-playback) by catching promise rejections and forcing board resync.
  - **Owner:** UI engineer
  - **Success Criteria:** No lingering partial animations after cancel.
- [ ] Update QA checklist covering player move/attack flows with and without reduced-animation setting.
  - **Owner:** QA lead
  - **Success Criteria:** Checklist published alongside TODO completion.

### 8. Documentation
- [ ] Add section to developer docs describing player action animation flow, shared utilities, and configuration toggles.
  - **Owner:** Documentation lead
  - **Success Criteria:** README or developer guide updated with code references.
