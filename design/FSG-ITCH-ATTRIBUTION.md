# FSG itch.io Attribution

## Task intake

- **Task ID:** FSG-ITCH-ATTRIBUTION
- **Goal:** Preserve privacy-safe itch.io acquisition context when a player moves from Four Star General to Sixsmith Games sign-in or pricing.
- **Scope:** `src/utils/marketingAttribution.ts`, `src/utils/guestMode.ts`, `src/data/unlocks.ts`, and focused attribution tests.
- **Out of scope:** Gameplay state, engine rules, battle UI, persistent visitor identity, cookies, storage, and external itch.io listing changes.
- **Acceptance criteria:**
  - itch.io referrals produce stable `utm_source=itchio`, `utm_medium=game_listing`, and `utm_campaign=four_star_general` tags.
  - Other in-game exits remain attributable to Four Star General.
  - Existing redirect and SKU parameters remain intact.
  - No identity, typed content, or persistent storage is introduced.

## Context

- The live itch.io listing opens `fsg.sixsmithgames.com`.
- Existing sign-in and purchase links point to the main site without campaign tags, so the main site can see FSG as a referrer but cannot preserve the original itch.io source.
- The game is a single-page browser app, so the initial referrer remains available for the in-page conversion links.

## Plan

- Add a pure attribution resolver with a small allowlist grammar.
- Append the resolved tags to sign-in and purchase URLs at the existing URL-builder boundary.
- Preserve explicit campaign tags when the game itself was opened with safe UTM values.
- Verify itch.io, direct FSG, and unsafe-value branches with the existing test harness.

## Alternatives considered

- **Cookie or local-storage first-touch state:** Rejected because the requested first phase should maximize useful pre-consent evidence without persistent anonymous tracking.
- **Hard-code itch.io on every FSG exit:** Rejected because direct and other acquisition sources would be mislabeled.
- **Edit only the itch.io listing URL:** Rejected because pricing and sign-in still need to retain the source after the game hop.

## Test plan

- Unit-test itch.io hostname detection.
- Unit-test safe explicit UTM propagation.
- Unit-test unsafe UTM rejection and the default FSG attribution.
- Run lint, build, and the focused unlock/attribution test suite.

## Impact

- No engine, state, rendering, or performance path changes.
- URL construction adds three bounded query parameters only when leaving the game for the main site.
- Rollback is isolated to the attribution helper and its two callers.
