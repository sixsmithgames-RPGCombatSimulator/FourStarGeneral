# Compact unit intel redesign — 2026-10-17

## Intent

Reduce the selected unit card's footprint and replace its oversized expand row and separate rounded stat tiles with a compact tactical instrument panel.

## Scope

- `index.html`: compact battle-card styling, shared identity/control row, fixed 44px expand and dismiss targets, instrument strip, strength meter, status tags, stack selectors, and container-based narrow-card reflow.
- `src/ui/announcements/SelectionIntelOverlay.ts`: accessible expand/compact names and tooltips, full-name title tooltip, and presentation-only strength fill and condition tone.
- `tests/e2e/tactical-command-geometry.spec.ts`: allow the intentionally shorter compact body while retaining the expanded-body minimum, and enforce a maximum desktop compact-card height.

## Risk assessment

Presentation changes remain in the existing selection overlay. Engine state, commands, event dispatch, map rendering, drag positioning, selection persistence, and tutorial selectors are unchanged. The expand button retains its ID, text, native button behavior, and `aria-expanded` state. Its compact appearance uses an icon with an explicit accessible name and tooltip. Existing commands continue through the established selection-action event handling.

Narrow cards wrap stats into four columns. Long formation names remain visible and can increase card height. Shared-hex selectors and all status chips remain available.

## Verification

- Production build and repository architecture/asset gates: passed.
- Repository lint: passed without warnings.
- Full custom regression harness: 1,259/1,259 passed.
- Chromium selected-intel geometry and keyboard matrix: 34/34 passed across eight viewport sizes from 600 × 900 through 1920 × 1080, including short landscape screens, long defensive formation names, both turn states, and keyboard entry without accidental orders.
- Updated TypeScript files also passed a targeted ESLint run with zero allowed warnings.
- Preview fixtures verified that fractional resource and movement values fit without clipping.
- Visually inspected the real rendered component with engineering, damaged armor, long formation names, and shared-hex selectors.
- Matched 520px viewport comparison using the same engineering data and shipped component: 400 × 248.58px before; 400 × 151.19px after (39.2% lower height).
- Preview evidence: `diagnostics/compact-intel-preview/`; browser geometry evidence: `diagnostics/compact-intel/`.

## Known limitations

Gameplay layout verification uses local Chromium rendering and the shipped battle-markup fixture. Unrelated pre-existing working-directory changes were preserved.

## Production release — 2026-10-18

The user explicitly requested deployment of the tested compact card. Preflight confirmed the existing Vercel project `fourstargeneral` (`prj_OfsbVMolgcUfE5P7I4Ffg5dTVjhg`) under `team_MV7H5Yr78mJD46i3lMjAMjOc`, with production domain `fsg.sixsmithgames.com`. Remote main and the latest ready production deployment both match baseline `b39d2113c27db6b79eebd02473cf99f51f4b6ec3`; no recent queued or building deployment was present. The source, tests, and this report will be released through the existing Git-connected main branch. A local receipt will record deployment status and served-artifact verification after release.
