# Tutorial Alignment QA

## Issue

Post-deployment tutorial steps drifted out of alignment once initiative play began. Several steps pointed at broad map containers or stale selectors, so the spotlight could frame the wrong area, miss the real control, or leave the modal blocking the action being taught.

## Fix Standard

- Tutorial copy should be direct, short, and player-facing.
- The player should not be addressed with inconsistent labels inside ordinary tutorial text.
- Each step should anchor to the actual UI element or tactical area being taught.
- Wait-gated steps must leave the real battlefield control clickable.
- If an order is conditional, such as fire or smoke, the tutorial must say when the order may not appear.
- Deployment should identify Zone Alpha as the only valid deployment sector for this mission.
- Post-deployment camera focus should stay on the active friendly group until the player has enough context to act.

## Visual Checklist

- Base camp step highlights Zone Alpha and does not cover the map hexes or Assign Base Camp.
- Deployment options step sits near Deploy Evenly and Deploy Grouped.
- Begin Battle step highlights the real button and allows the player to click it.
- Initiative Status step points to the initiative status line and explains who acts now.
- Active Group and Choose A Formation steps highlight only units that can act.
- Movement, Fire Orders, Unit Intel, Smoke Orders, and Finish This Formation stay near the edge of the battlefield and avoid covering the target area.
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
