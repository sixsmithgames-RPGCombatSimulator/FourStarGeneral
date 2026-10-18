# Tactical hex outline clarity — 2026-10-18

## Intent

Make legal moves, attack targets, and the selected formation readable over textured terrain. The previous short dashed strokes could blend into grass and forests and be overpainted by subsequently rendered neighboring terrain.

## Scope

- `HexOutlinePresentation.ts` builds an inert, inset outline for every real hex from the same canonical points as its terrain tile.
- `HexMapRenderer.ts` places that layer above terrain and below combat effects, mirrors the existing highlight classes, caches outline nodes, and restores idle/initiative highlighting when references are rebuilt. Selection reuses the existing highlight toggle. The renderer stays within a tightened 6,462-line architecture budget, down from 6,466.
- `index.html` supplies dark border casing, mint dashed movement, solid coral-red targets, solid gold selection, blue idle formations, and distinct gold initiative/deployment dashes. All strokes stay a constant screen width during pan/zoom; the regular grid becomes quieter. Selection takes precedence over overlapping target states, and active artillery/smoke order targets take precedence over ordinary attack eligibility. The outline layer adds no terrain tint, blur, or pulse.
- Renderer, browser paint, and tutorial assertions cover the new painted surface. Existing hex classes, input targets, and game commands remain intact.
- The integrated training run exposed an earlier compact-card bug: generic tutorial decoration changed the floating card and Expand button to relative positioning, moving the button outside its clipped frame. A narrow CSS override preserves absolute positioning. Dedicated desktop/mobile cases reproduced the original failure before the fix; the tutorial sequence and state remain unchanged.

## Risk assessment

This changes map presentation and DOM ordering inside the existing camera root. No engine rules, movement/attack legality, hidden-contact discovery, coordinate conversions, events, save formats, tutorial steps, or combat timing change. Outline geometry is a visual inset of the existing points, and both layer and child polygons reject pointer events. Old cells retain their hit targets and data attributes. Combat effects stay above the new borders.

## Verification

- Production build, repository gates, and architecture checks: passed.
- Repository lint with zero permitted warnings: passed.
- Final Chromium, Firefox, and WebKit outline/color/card matrix: 24/24 passed, including reduced motion, selected-state precedence, active-order precedence, click-through, three zoom levels, actual painted-pixel changes after clearing an outline, and six highlighted-card interaction cases.
- Focused real-renderer regression for layer order, canonical points, highlight state, clearing, viewport identity, and rerender continuity: passed within the full harness run.
- Full registered regression suite: 1,260/1,260 passed.
- Production-build Chromium training journeys: 3/3 passed at 1680 × 857, 1440 × 900, and 390 × 844, including all main lessons and six command-board mini tutorials. Final run completed in 4.2 minutes.
- Visually inspected grass/forest/mountain fixtures at 0.55×, 1×, and 1.7× zoom. Evidence: `diagnostics/hex-outlines/`.
- Visually inspected real training movement and Fire Orders captures, including the mobile battlefield. Full gameplay evidence: `diagnostics/hex-outline-tutorial/`; the matching desktop outline preview is `fire-order-map.png` in the wide-desktop case. The earlier highlighted-card failure is preserved in `diagnostics/hex-outlines-before-card-fix/`.

## Known limitations

Local browser and automated gameplay verification are separate from manual live-game acceptance. Existing unrelated generated files and prior release receipts remain untouched.

## Lighter border revision and release

The user requested thinner borders before deployment. Reduce every tactical color stroke by 40%: movement 1.2px, idle 1.35px, initiative/order targets 1.5px, attacks 1.65px, selection 1.8px. Reduce dark casing overhead from 2px to 1px and its opacity from 0.86 to 0.65. Preserve geometry, colors, patterns, state precedence, zoom behavior, and input handling.

The lighter revision passed the existing 24-case Chromium/Firefox/WebKit paint and interaction matrix and the production build. Visually inspected the thinner borders at normal zoom. The full 1,260-test harness and three complete training journeys above certify the unchanged renderer and behavior. The user explicitly authorized production deployment of this lighter version. Authenticated release preflight confirmed the existing Four Star General project, team, production domain, and Git-connected main branch at 37187e9; no other deployment was in progress. Release only the scoped source/test/report files and verify served-build parity after release.

Final styling lint passed with zero permitted warnings: `npm run lint -- --max-warnings 0 --ignore-pattern '.codex-*/**' --ignore-pattern 'diagnostics/**' --ignore-pattern 'tmp/**'`. This includes project source and tests while excluding old scratch copies and generated evidence. The first simultaneous lint attempt hit a transient directory removal while Playwright recreated its evidence folder; a subsequent unfiltered traversal was stopped after spending several minutes scanning scratch files. No lint configuration or product source was changed to resolve that scan.
