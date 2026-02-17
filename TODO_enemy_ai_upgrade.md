# TODO: Enemy Bot Tactical Overhaul

## Overview
Enhance the enemy AI loop in `GameEngine` to move beyond the current "nearest-unit pursuit" heuristic and adopt a heuristic planner that evaluates multiple action candidates per unit. Preserve existing turn sequencing, combat resolution, and supply integrations.

## Primary Files to Touch
1. `src/game/GameEngine.ts` — replace the simple pursuit logic with a modular planner and improved pathfinding utilities. @src/game/GameEngine.ts#3769-3910
2. `src/game/bot/BotPlanner.ts` *(new)* — host pure planning helpers (context building, action generation, scoring) to keep `GameEngine` focused on orchestration.
3. `tests/bot/BotPlanner.test.ts` *(new)* — regression tests covering plan generation, scoring weights, and fallback behavior.
4. `tests/BattleScreen.animations.test.ts` — extend coverage to ensure the new planner still triggers move/attack animations already verified for the current implementation. @tests/BattleScreen.animations.test.ts#1-200

## Implementation Steps
1. **Extract tactical context builder**  
   - Create `buildBotTacticalContext(gameState)` that snapshots bot/player unit states, supply, terrain passability, and outstanding objectives.  
   - Ensure it is read-only: it should not mutate existing placements or supply mirrors.  
   - Return pre-computed threat maps (e.g., range overlays for player AT units) to avoid recalculating per action.

2. **Model candidate actions**  
   - Define `BotAction` union types (e.g., Hold, Advance, Flank, Capture, Retreat).  
   - Implement `planBotActions(unit, context)` returning scored candidates with supporting metadata (target hex, required path, projected combat outcome).  
   - Keep data pure so `executeBotTurn` can consume and apply mutations using existing helpers (`planBotPath`, `resolveBotAttack`, `updateBotSupplyPosition`).

3. **Implement action scoring heuristics**  
   - Create `scoreBotAction(action, context)` incorporating:
     1. **Unit purpose alignment** — infantry vs. armor vs. artillery vs. AT; prioritize targets they are designed to counter (e.g., AT guns focus on armored defenders).  
     2. **Expected inflicted damage** — heavily weight actions with the highest projected damage using a dry-run through `resolveBotAttack` or a new lightweight estimator that reuses combat tables.  
     3. **Expected retaliation losses** — estimate counter-fire or exposure after movement; reduce the score by projected damage received.  
   - Normalize scores to allow cross-unit comparison. Include comments explaining each weighting so future tuning is straightforward.

4. **Upgrade path selection**  
   - Replace the straight-line `planBotPath` with a cost-aware search (BFS or A*).  
   - Respect terrain costs, impassable tiles, and avoid ending on occupied hexes.  
   - Maintain the existing `Axial[] | null` return signature so move execution code remains intact.

5. **Coordinate actions globally**  
   - Before executing, reserve target hexes to prevent unit collisions.  
   - Allow multiple units to focus-fire only when the scoring deemphasizes mutual interference (e.g., combined attacks on high-value targets).  
   - Preserve the existing turn summary shape (`BotTurnSummary`).

6. **Feature flag & integration**  
   - Add a configuration toggle (e.g., `botStrategyMode: "Simple" | "Heuristic"`) defaulting to the new planner but allowing fallback during testing.  
   - Ensure `BattleScreen` hooks survive unchanged; if adjustments are necessary, guard them behind the same flag.

7. **Testing & validation**  
   - Unit tests: verify action scoring ranking, ensure AT units prioritize armor, confirm damage/retaliation weighting adjusts scores as expected.  
   - Integration tests: extend battle animation tests to cover the heuristic mode, ensuring move/attack announcements stay in sync.  
   - Manual QA checklist: run a full bot turn with mixed unit types, confirm no regression in supply updates or animation sequencing.

8. **Documentation**  
   - Update `UNIT_DOCUMENTATION.MD` with a brief note on the new AI behavior and any strategy implications for players.  
   - Record tuning parameters and default weights so designers can tweak without diving into code.

## Definition of Done
- All tests (existing + new) pass.  
- Bot turn behaviors exhibit diverse actions (attack choices vary by unit purpose, pathfinding respects terrain).  
- Feature flag enables reverting to legacy AI if issues arise.  
- Documentation reflects the new planner and weight rationale.
