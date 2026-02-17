# ENEMY_TURN_ANIM_MOVE_HELPER

## Context
- Enemy turn animation TODO requires a reusable movement helper before sequencing logic can call it.@TODO_enemy_turn_animation.md#19-34
- `HexMapRenderer` already tracks hex centers and unit icon elements, making it the right layer to produce a temporary sprite animation.@src/rendering/HexMapRenderer.ts#34-206,@src/rendering/HexMapRenderer.ts#500-686
- No existing helper moves unit sprites, so callers would otherwise duplicate DOM math and cleanup repeatedly.

## Plan
- Extend `HexMapRenderer` with `animateUnitMove(fromKey, toKey, durationMs)` returning a promise; method will read cached hex centers, build an SVG ghost sprite, and tween it with `requestAnimationFrame` while hiding the source icon.
- Store map icon dimensions to keep sprite centered, clamp missing data to defaults, and gracefully bail if prerequisites (SVG, hex data) are absent.
- Provide inline comments summarizing intent, edge cases, and cleanup behavior per user coding standards.
- Add a unit test that renders a tiny scenario, places a unit via `renderUnit`, stubs `requestAnimationFrame`, and asserts the helper creates/removes the ghost and restores the original icon after animation.
- Update the TODO checklist item in `TODO_enemy_turn_animation.md` to mark the movement helper task complete.

## Alternatives Considered
1. **CSS transition on existing unit icon** – Rejected because engine re-renders would interrupt the transition and we need a temporary visual independent of state timing.
2. **Canvas-level translation wrapper** – Rejected since continuous pan/zoom transforms are not yet centralized, and it would require larger refactors to viewport math.

## Test Plan
- `tests/HexMapRenderer.animateUnitMove.test.ts`: verifies promise resolution, ghost cleanup, and icon opacity restoration.

## Impact
- **Performance:** Single ghost element per move; uses linear interpolation and removes DOM nodes immediately, so minimal impact.
- **Accessibility:** Visual-only effect; original icons reappear promptly, no focus changes.
- **Docs:** TODO checklist updated; no CHANGELOG required for TODO work yet.
