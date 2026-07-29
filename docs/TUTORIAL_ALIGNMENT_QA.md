# Tutorial Alignment QA

## Issue

Post-deployment tutorial steps drifted out of alignment once initiative play began. Several steps pointed at broad map containers or stale selectors, so the spotlight could frame the wrong area, miss the real control, or leave the modal blocking the action being taught.

## Fix Standard

- Tutorial copy should be direct, short, and player-facing.
- The player should not be addressed with inconsistent labels inside ordinary tutorial text.
- Each step should anchor to the actual UI element or tactical area being taught.
- Wait-gated steps must leave the real battlefield control clickable.
- Wait-gated steps must not flash an enabled Continue button during automatic advancement.
- If an order is conditional, such as fire or smoke, the tutorial must select a formation that can legally perform it.
- Deployment should identify Zone Alpha as the only valid deployment sector for this mission.
- Post-deployment camera focus should stay on the active friendly group until the player has enough context to act.

## Visual Checklist

- Base camp step highlights Zone Alpha and does not cover the map hexes or Assign Base Camp.
- First requisition step combines the welcome and budget explanation, spells out requisition points (RP), and does not push presets.
- Requisition handoff step tells the player to click Begin Battle and highlights only that button.
- Deployment options step sits near Deploy Evenly and Deploy Grouped.
- Begin Battle step highlights the real button and allows the player to click it.
- Initiative Status step points to the initiative status line and explains who acts now.
- Choose A Formation highlights the Recon Bike Patrol when it is the intended first formation.
- Movement, Fire Orders, engineer orders, artillery, and smoke prompts use the same upper dock and avoid covering the target area.
- Mobile layout keeps tutorial panels compact and below the current map/action focus.

## June 2026 Follow-up

Post-deployment tutorial QA found that several combat steps still used broad camera framing after the initiative system landed. The player could see the parchment background instead of the hex map, or the map was too far out to read unit counters. Fire and smoke steps could also select a formation that did not have the order being taught.

Additional fixes:

- Deployment camera focus now stays on Zone Alpha and the visible hex tile map.
- Initiative and active-group steps zoom to the friendly formations instead of the whole battlefield.
- Movement copy now matches the actual legal-move treatment: green dashed hexes.
- Fire, smoke, engineer, artillery, and flak steps select a formation that can demonstrate the order when possible.
- Smoke instruction expands a smoke-capable unit card before pointing at Lay Smoke.
- The redundant battle-routine step was removed; the final message is a short sendoff.
- Visual QA should include desktop and narrow viewport screenshots for steps 18, 20, 21, 23, 24, 26, 33, 34, and the final step.

## July 2026 Certification

- The 37-step journey now completes through real requisition, deployment, movement, fortification, artillery, fire, initiative, and smoke actions.
- Engineer training marks one legal edge facing the nearest enemy and requires that edge during the lesson.
- Fire completes before the player advances the initiative group.
- Smoke training waits for a legal tank or artillery formation; infantry no longer exposes Lay Smoke.
- Repeated initiative loops use named drill labels, while fixed requisition and deployment lessons retain stable step numbers.
- The final card says "Good luck, General [name]." and offers only Dismiss.
- Full walkthroughs pass at 1680x857, 1440x900, and 390x844.
- OPS, General, Recon, Air, Logistics, and Roster briefs fit the same three viewports. Logistics priority and Roster requisition steps require the real modal controls.
