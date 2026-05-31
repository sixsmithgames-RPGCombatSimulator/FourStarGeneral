# Tutorial Flow Postmortem

## Issue Summary

The training tutorial had drifted from the current battle UI. Several steps were technically present, but they interrupted play instead of teaching the command loop:

1. Main tutorial anchoring could open sidebar panels while trying to find highlight targets, so Air Support or Roster appeared before the player clicked those sidebar icons.
2. Map-action prompts were large fixed panels over the battlefield, especially during movement, fire, and smoke instruction.
3. Base camp assignment accepted the default focused hex, so the player could advance without deliberately choosing a deployment-zone hex.
4. Smoke instruction happened before the player had selected a smoke-capable unit or expanded the unit intel card.
5. Deployment selection could leak into combat tutorial state, causing Movement to advance without a deliberate unit pick.
6. Initiative order and initiative groups were not explained after the battle system changed, leaving the player without a clear "who acts now" command loop.
7. On narrow mobile screens, the requisition toolbar forced the allocation cards wider than the viewport.

## Root Cause

The tutorial controller tried to be helpful by opening missing UI targets automatically. That worked for simple anchored popups, but it broke the rule that sidebar command briefs should only start from deliberate sidebar clicks.

The battle tutorial also treated map actions like ordinary modal steps. That forced players to interact with the map while the guidance panel occupied the same tactical space. Finally, deployment had a default selected hex for status context, and the tutorial did not distinguish that passive focus from an intentional player choice. The same stale selection could survive into the first combat step and satisfy Movement before the player acted.

The initiative update added a new command language without a matching tutorial update. The player needed to understand initiative order, same-rating initiative groups, active friendly formations, enemy tempo, sentry/skip decisions, and round handoff before movement and fire orders could make sense.

## Fix

- Sidebar mini tutorials now trigger only from real sidebar button opens.
- The main tutorial no longer includes sidebar-only phases.
- Map-action tutorial panels are compact and docked near the edge of the viewport on desktop and mobile.
- Base camp tutorial flow clears the passive default selection and requires the player to pick a highlighted deployment-zone hex before assigning camp.
- Base camp and combat action steps now focus the required map hexes after layout settles, so the legal target is in view before the player acts.
- Combat tutorial now opens with initiative order, active group, and active formation selection before movement and fire.
- Movement clears deployment-era selection, highlights the current friendly initiative group, and waits for a fresh active-formation click.
- Smoke is now taught as a conditional unit-card order, not a forced gate. The action gate spends the active recon patrol on Sentry so the tutorial can advance even when the current formation cannot lay smoke.
- Initiative controls now expose a concise status line showing the current initiative band, faction control, and remaining formations.
- Enemy tempo, Next Unit, Skip Group, and round handoff are now explained in the main command loop.
- The final Command Certified step renders before dismissal instead of being skipped by terminal tutorial state.
- Mobile requisition layout now constrains the toolbar, allocation grid, and cards to the phone viewport.

## Verification Checklist

- Requisition tutorial advances through each required allocation.
- Proceeding to battle does not open Roster, Air Support, or Logistics panels.
- Base camp cannot advance from the tutorial's passive default focus.
- Deploy Evenly completes Place The Line and advances to Begin Battle.
- Begin Battle advances to Initiative Order, then Active Group, then Choose A Formation.
- Active group selection only advances from a fresh click on a currently active friendly initiative-group unit.
- Movement keeps the player line visible and does not auto-complete from stale deployment selection.
- Movement, Fire Orders, Smoke, Engineer, Artillery, Flak, initiative controls, and round handoff prompts stay compact and leave the battlefield clickable.
- Smoke explanation does not require an impossible Lay Smoke action from a non-smoke-capable active unit.
- Spending Sentry advances the tutorial to enemy tempo and the next initiative band.
- Command Certified appears before the tutorial dismisses.
- Mobile requisition cards fit within a 390px viewport without horizontal clipping.
- Sidebar mini tutorials remain available when the player clicks the relevant command rail icon outside the active main tutorial.
