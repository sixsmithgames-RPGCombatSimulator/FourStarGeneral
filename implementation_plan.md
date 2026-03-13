# Implementation Plan: River Crossing Watch Pacing and Escalation Surfacing

## Context
The next commercial-polish slice for River Crossing Watch should move beyond objective correctness and difficulty-aware turn limits into authored runtime pacing. The safest vertical slice is to expose the mission's authored phase changes at runtime so the commander can see when the patrol is still in probing contact, when the enemy commits across multiple crossings, and when reserve pressure is triggered.

## Goals
1. Extend River Watch mission rules so they report authored pacing phases.
2. Respect difficulty gating for the authored escalation table, specifically suppressing Phase 3 reserve pressure on Easy.
3. Update `BattleScreen` to announce phase changes once and reflect the active phase in the mission summary panel.
4. Add focused regressions covering mission-rule phase transitions and player-facing battle announcements.
5. Update `docs/commercial-polish-work-statement.md` with Workstream 7 progress for the pacing/escalation slice.

## Steps
1) Extend `src/state/missionRules.ts` with a typed River Watch phase model and difficulty-aware escalation logic.
2) Update `src/ui/screens/BattleScreen.ts` to pass selected difficulty into the mission rules controller, announce phase changes, and append active phase detail to the mission summary.
3) Add regressions in `tests/MissionRules.riverWatch.test.ts` and `tests/BattleScreen.missionFlow.test.ts`.
4) Run typecheck, touched-file lint, and the full test suite.
5) Update the commercial polish work statement with the completed slice and remaining authored-pacing gaps.

## Impact/Blast Radius
- High-risk file: `src/ui/screens/BattleScreen.ts`. Affects live mission-status announcements and the battle briefing panel for runtime River Watch battles.
- Supporting files: `src/state/missionRules.ts`, targeted mission tests, and `docs/commercial-polish-work-statement.md`.
- Consumers at risk: mission objective HUD rendering, battle announcement live region behavior, and any future mission-rule consumers depending on `MissionStatus`.
- Visual behaviors that could shift: battle mission summary text, mission announcement cadence, and the perceived pacing of River Watch mid-battle escalation.

## Validation
- Type/lint: `npx tsc --noEmit` and touched-file ESLint with zero warnings.
- Tests: `npm test` plus the new focused mission-rules and battle-flow regressions.
- Manual checklist:
  - River Watch briefing starts in probe state and does not spam repeated announcements
  - turn 4 shifts the mission summary/announcement into commitment pressure
  - two turns of blocking all three fords on Normal/Hard surface reserve-pressure messaging
  - Easy difficulty never surfaces the Phase 3 reserve-pressure message
