# Tutorial Validation Report

**Date:** July 29, 2026
**Scope:** Complete training tutorial, deployment, first-turn command sequence, command rail, and all six sidebar mini tutorials.

## Result

The tutorial journey is complete and playable from requisition through the first practical command lessons. The certified path requires the player to perform the same actions taught by the tutorial; no lesson is passed by silently changing game state.

No critical or high-severity tutorial defects remain in the validated journey.

## Certified Journey

1. Requisition a complete training force with separate reconnaissance and howitzer lessons.
2. Review the mission, assign Zone Alpha, choose a deployment method, and begin the mission.
3. Read initiative order and identify the active formation group.
4. Select and move the Recon Bike Patrol using a highlighted legal destination.
5. Select the Engineering Corps, choose Fortify, and build on the marked edge facing the enemy.
6. Select an observer, request Corps Artillery, and mark a legal target.
7. Select a formation with a clear shot, preview the target, and fire.
8. finish the active group with the real command-rail control.
9. Select a smoke-capable formation, choose Lay Smoke, select a legal hex, and choose the screen edge.
10. Complete training and open each command-rail board.
11. Follow the General, Reconnaissance, Air Support, Logistics, Roster, and Operations mini briefs through their real controls.

## Visual Coverage

The complete journey passed at:

- Wide desktop: 1680 x 857
- Desktop: 1440 x 900
- Mobile: 390 x 844

Screenshots were captured throughout requisition, deployment, movement, fortification, artillery, fire, smoke, completion, command-rail settings, and every sidebar mini tutorial. Evidence is stored under `diagnostics/playwright/results`.

The mobile pass confirms that:

- Tutorial cards remain readable without covering the required map target.
- Requisition and deployment controls remain available.
- Camera focus keeps the relevant formation and legal target at a useful scale.
- Fortification edge selection fits the viewport.
- The command rail and sidebar boards remain operable.

## Automated Checks

- Production build: passed.
- Tutorial-focused lint with zero warnings: passed.
- Unit test suite: passed.
- Three-viewport Playwright tutorial journey: passed.

The repository-wide zero-warning lint command still reports 163 pre-existing warnings in unrelated initiative, bot, air-show, renderer, and legacy test files. It reports no errors. Those warnings are outside this tutorial change and are not concealed by the tutorial-focused clean lint run.

## Remaining Low-Risk Notes

- The training force does not include an air squadron. The Air Support mini brief therefore teaches mission selection and explains squadron selection conditionally, while still requiring the player to use the real board.
- The unit-test environment logs failed relative asset fetches because it has no browser origin. The tests pass and the assets load during browser validation.

## Standards Enforced

- Direct, concise tutorial language suitable for a WWII command game.
- No unexplained abbreviations.
- No disabled button that turns live immediately before automatic advancement.
- No Back control on stateful action lessons.
- Consistent top-positioned battle prompts unless a target requires otherwise.
- Named lesson indicators instead of repeated or ambiguous step numbers.
- Camera movement only when it helps reveal the next action.
- Capability lessons select a formation that can perform the required action.
- Sidebar mini tutorials teach real use, not only identify the board.
