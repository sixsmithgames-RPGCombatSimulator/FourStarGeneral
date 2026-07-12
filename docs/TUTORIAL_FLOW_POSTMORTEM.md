# Tutorial Flow Postmortem

## Issue Summary

The training tutorial had fallen out of step with the initiative battle system. The visible prompts, camera, and underlying turn state could disagree:

1. The armor requisition spotlight enclosed three distant cards as one oversized target.
2. Recon movement was artificially restricted to adjacent hexes, hiding the unit's defining speed.
3. The tutorial advanced after the recon moved but left its initiative activation open.
4. Engineer, smoke, fire, and artillery lessons sometimes described controls without requiring a legal order.
5. Fire and smoke could be shown on formations that lacked a valid target or capability.
6. A premature End Turn lesson interrupted the natural first-turn sequence.
7. Phase-specific prompt sizing caused inconsistent typography and clipped battle instructions.
8. Repeated camera recentering could pull the map away while the player was inspecting it.
9. Camera motion could reinterpret a quick second click as an unintended recon move.
10. Recon movement outlines could remain visible after initiative passed.
11. The training infantry did not expose smoke orders, leaving the smoke lesson without a legal actor.
12. Enemy-response fallback timing could advance the tutorial before a visible enemy animation finished.
13. Guided selection steps could stall when setup had already selected the required formation and the player clicked that same highlighted unit.
14. Smoke target highlights used axial engine keys as offset DOM keys, so the visible target and the hex submitted to the engine could differ.
15. Smoke was implemented as a free order but the initiative UI treated it as a spent activation, removing the only guaranteed firing unit from the lesson.
16. Guided markers were attached before a zone-highlight repaint, which replaced the SVG node and erased the marker.
17. A global Enter shortcut could fire through an edge-selection dialog and open an unrelated initiative warning.
18. Compact mobile prompts imposed a fixed text height, clipping longer instructions instead of growing with their copy.
19. The mobile battle screen behaved like a stacked web page: the command rail, tutorial panel, and deployment panel could consume the viewport while the map became too small or blocked.
20. Desktop floating drawer toggles could paint over the mobile command rail, making the rail look misaligned and failing visual fit checks.
21. Sidebar tutorials were single information cards that neither explained each modal's sections nor asked the player to use its controls.

## Root Cause

The tutorial was organized as a list of UI explanations instead of a legal sequence of battle actions. Individual steps could look correct in isolation while the initiative queue, selected formation, available orders, and camera state had already moved elsewhere.

The requisition overlay also treated every selector match as one spotlight. That works for a compact control group, but not for three unit cards spread through a scrolling list.

The battle UI also crossed two coordinate systems without converting at the boundary. Engine target lists are axial keys; map elements use offset keys. Because both serialize as `x,y`, the mismatch looked valid until the smoke order reached range validation.

## Fix

- Armor requisition now highlights only the next unfilled company card and follows the list as each company is added.
- Recon receives its full legal movement range. The lesson explains speed, observation, weak protection, map panning, and zoom.
- Completing the guided recon move also completes that formation's tutorial activation, allowing the enemy response and next initiative band to proceed.
- The combat tutorial now follows one legal first-turn sequence:
  1. Read the initiative status.
  2. Select and move Recon.
  3. Watch the enemy response.
  4. Select Engineers, expand their order card, and build fieldworks.
  5. Select smoke-capable infantry and lay smoke.
  6. Select a formation with a legal target and confirm an attack.
  7. Select an eligible observer and call artillery.
  8. Receive mission orders and dismiss the tutorial.
- Engineer, smoke, fire, and artillery phases advance only after the engine accepts the required action.
- Optional initiative controls and the premature End Turn lesson were removed from the main walkthrough.
- Battle prompts now share one compact upper dock and consistent typography on desktop and mobile.
- Camera framing includes the acting unit and required targets, then stops recentering so the player can inspect the map.
- Guided camera transitions queue one intended click and replay it after the view settles, preventing both accidental orders and silently discarded input.
- Guided unit-selection steps mark one exact legal formation instead of spotlighting an entire initiative band.
- The guided recon activation clears its selection and tactical outlines before the Engineer group begins.
- Infantry battalions can use their integral mortar element to lay smoke, giving the training lesson a legal order.
- Enemy-response fallback waits beyond the normal animation window and cannot race visible enemy movement.
- Guided unit-selection steps advance on the player's click even if the intended formation was already selected by setup.
- Smoke target keys convert from engine axial coordinates to map offset coordinates before highlighting or click handling.
- Smoke remains a free order after consuming ammunition, so the same active infantry formation can proceed naturally into the direct-fire lesson.
- Selection phases clear stale intel first, repaint tactical highlights, and attach the guided marker last so SVG updates cannot erase it.
- The fortification lesson uses direct language and retargets its spotlight to the interactive edge hexagon, where the player is told to fortify the side facing the enemy.
- Infantry smoke copy identifies the battalion mortar company as the source of smoke rounds, distinguishing it from vehicle smoke systems.
- Global initiative shortcuts ignore handled events and keyboard input originating from buttons, controls, or modal dialogs.
- Map-targeting orders close the expanded unit card before asking the player to click a hex.
- Mobile action prompts grow with their content; the walkthrough asserts that every panel fits the viewport and no tutorial copy is clipped.
- Mobile battle layout now uses the visual viewport as a game surface: compact command rail, map-first sizing, a shorter deployment drawer, and camera avoidance for visible lower drawers.
- The battle settings menu includes a user-triggered Fullscreen control where the browser supports the Fullscreen API.
- Desktop drawer toggles are hidden on phone-width battle screens so they cannot overlap the command rail.
- Sidebar mini tutorials remain separate and open only when the player deliberately selects the matching command-rail icon.
- Each of the six command-rail modals now has a three- or four-step brief with focused spotlights. Command Post report selection and Air Support mission selection use the real controls before advancing.
- Sidebar briefs are persisted only after completion or deliberate closure. Required panel actions use a clear instruction strip while the live modal remains interactive.

## Verification Checklist

- Requisition spotlight follows Medium Tank, Heavy Tank, and Tank Destroyer one card at a time.
- Training allocation completes without an oversized multi-card border.
- Deployment remains usable at desktop and phone widths.
- Recon shows its full legal movement range and the map remains pannable and zoomable.
- A guided click made while the camera is settling is replayed once after the camera stops.
- A successful recon move hands initiative to the enemy without an extra End Turn click.
- Recon movement and attack outlines clear before the Engineer lesson.
- Enemy response returns control to the active Engineer group.
- Fortify requires selecting an edge and advances only after fieldworks are built.
- Smoke requires a smoke-capable active infantry formation, a target hex, and an edge.
- Each guided selection spotlight identifies only the formation that can perform the next required order.
- Clicking an already-selected guided formation advances the selection lesson.
- Fire requires an active formation with a legal target and advances only after attack confirmation.
- Artillery requires an eligible active observer and advances only after a target is queued.
- No Air, Logistics, Roster, or other sidebar modal opens during the main tutorial.
- Tutorial prompts remain near the upper command area without covering required map targets.
- Desktop and mobile walkthroughs reach the final mission message without duplicate steps, stale selections, or camera jumps.
- Every tutorial panel remains inside the viewport and its content has no hidden overflow at 1440x900 and 390x844.
- At 390x844, the base-camp hex, deployment buttons, initiative rail, movement target, artillery order, and battle settings menu remain visible and clickable without horizontal page drift.
- OPS, General, Recon, Air, Logistics, and Roster briefs complete at 1440x900 and 390x844 with every spotlight aligned to one visible control or record.
