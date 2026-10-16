# Air Brief 3 arrow repair — 16 October 2026

## Intent, scope and risk

Fix the observed Air Brief 3 arrow that faces away from the highlighted sortie board after its prompt flips sides. Keep tutorial progression, authored instructions, target selection, gameplay state, saves and popup geometry unchanged. This is a bounded behavior repair in `TutorialOverlay`, not an architecture refactor.

Original behavior: `positionPanel` clamps and flips the prompt around its target, but `updateArrow` uses the original authored direction and is not called by subsequent resize/scroll positioning. Two presentation decisions can disagree.

Expected behavior: arrow direction is a projection of final prompt/target geometry in the existing positioning pass. No saved direction, new state store, Air-specific override, timer or alternate layout authority is introduced. Existing intentional suppression for top-docked battle lessons and mobile layouts is retained.

Regression risks: all main/sidebar prompts share this component. Cover flipped left/right/top/bottom placements, resize without step advancement, actual Air Brief 1–4 transitions, and the full three-viewport tutorial journey. Missing/hidden targets must not leave a misleading arrow. No code outside tutorial rendering should need to change.

## Findings

**Fixed and locally verified — Low — camera/spotlight — Air Brief 3, Prepare The Sortie.** After opening Air and choosing a mission, the prompt was pushed to the right of the sortie content but its painted triangle still pointed right. Expected: it points left toward the highlighted content. Owner: `src/ui/components/TutorialOverlay.ts`, panel placement and arrow projection. Prior screenshot: `diagnostics/gameplay-audit-20261015/air-commander-release-results/tutorial-flow-Training-tut-e6343-command-sequence-on-desktop-webkit/sidebar-air-brief.png`. Corrected full-journey evidence: `diagnostics/tutorial-arrow-20261016-acceptance-results/tutorial-flow-Training-tut-e6343-command-sequence-on-desktop-webkit/sidebar-air-brief.png`, visually inspected after the run reached the originally affected state.

Additional existing findings noticed during the required manual review, **not changed by this bounded arrow repair**:

- **Low — camera/spotlight — Logistics Brief 4, Follow The Convoys.** After setting the first formation to Critical, the brief highlights a Medical Detachment support-team row while describing convoy cargo/destinations. Expected: highlight a convoy row, or explicitly describe the support team when no convoy exists. The authored `.logistics-convoy-item` selector in `src/data/sidebarMiniTutorials.ts:204` also matches support teams (`PopupManager.ts:3461`). Reproduction: complete the training battle lessons, open Logistics, finish Brief 3, inspect Brief 4. Recommended correction: scope the selector under `[data-logistics-convoys]`, with a separately authored empty state. Neither file was modified in this repair.
- **Low — copy/tone — General Brief 2, Recon Brief 3, Roster Brief 2.** The General brief refers to reconnaissance bonuses although the four visible modifiers are accuracy, damage, mobility and supply. Recon requests age/confidence checks although the sampled current-contact row displays position, activity, tracking source and estimated strength. Roster promises movement, but the sampled frontline row shows strength, experience, ammo, fuel and detailed readiness. Expected: instructions name fields actually available in these panels. Evidence: manual rail-click progression and the unchanged authored definitions in `src/data/sidebarMiniTutorials.ts`; corresponding `sidebar-{general,recon,roster}-brief.png` frames are in the acceptance output. Recommended correction: align copy with the real panel contract and add semantic field checks. These do not block the taught interactions.
- **Low — copy/tone — General board Service Notes, visible during General Brief 3.** Zero victories renders as `0 victoryies`. Expected `0 victories`. Evidence: normal General-board opening after training; the unchanged pluralization at `src/ui/components/PopupManager.ts:2618` concatenates `victory` and `ies`. Correct the singular/plural word choice in a separate copy repair.

## Verification plan

1. Run the tutorial skill's baseline build, zero-warning lint and complete Chromium journey.
2. Demonstrate the new painted-arrow assertions fail on the deployed implementation before repair.
3. Repair the existing renderer, inspect new reference frames, then rerun the visual comparisons without updating references.
4. Run build/strict compilation/architecture/assets, zero-warning lint, all registered tests, all three browsers' complete tutorial journeys and relevant Air/evidence geometry checks.
5. Attempt the manual first-player walkthrough in a task-owned browser tab, close that tab when finished, and disclose any tooling blocker separately from automated acceptance.
6. Deploy one reviewed commit only after applicable checks pass. Verify production commit/alias, public assets and available error logs. Do not describe deployment integrity as a manual gameplay certificate.

## Implementation and regression evidence

`TutorialOverlay.positionPanel` now updates the pointer after every completed positioning branch. The pointer is derived from the final panel and highlighted-target rectangles; authored direction only opts into showing a pointer. Resize, scroll and existing mutation-driven re-anchoring use that same projection. Identical classes are not rewritten, avoiding redundant arrow mutations. Missing targets suppress orphan pointers. There is no second state owner, saved field, new timer, per-Air special case, gameplay change or CSS geometry change.

The new `tutorial-arrow.spec.ts` uses the production overlay, authored steps, real Air popup and shipped styles. Nine full-frame image references cover Chromium, Firefox and Windows Playwright WebKit at 1680×857, 1440×900 and 390×844. All nine were individually inspected. The wide prompt stays left and points right; the 1440px prompt flips right and points left; mobile retains its intentional arrow-free layout. Assertions inspect painted triangle borders and attachment edges, not only CSS classes. Additional contracts cover all four directions, actual mutation-driven re-anchoring, resize without step advancement, missing targets, intentional docked suppression, and a negative opposite-triangle mutation. The complete tutorial journey now checks the real Air Brief 3 arrow too.

Before repair, five valid new contracts fail on the old renderer (Air desktop, three flipped placements, and missing target). A sixth initial failure was an invalid test expectation about intentionally hidden deployment arrows, not a product defect. Early repaired runs also exposed a mistaken test assumption that 1680px should flip like 1440px. That expectation was corrected without altering the layout. Reference creation is recorded separately from acceptance; no passing certificate is based on updating expected images.

## Completed acceptance

- Baseline tutorial skill runner: build, strict/architecture/assets checks, zero-warning lint, and three complete Chromium journeys pass (4.0 minutes).
- Repaired source: production build, strict compilation, architecture/assets checks, zero-warning full lint and **1,078/1,078 registered tests pass**. Existing build chunk-size advisory remains; no budget was increased.
- Frozen source at 18:59:17 UTC: 562 source/test/tool files, SHA-256 `1c53e05e76e57a6634555784cfaef4d4d77f3f2829791a60430a02a28d03bf50`. Reference hashes are frozen separately. Only documentation/evidence may change during acceptance.
- Fresh acceptance: **72/72 passed in 24.6 minutes**, zero failures, zero skipped, zero flaky cases and zero runner errors across all three browsers. One worker, zero retries, screenshot updating disabled, zero changed-pixel allowance. This includes 27 arrow cases, nine complete tutorial/sidebar journeys, 27 Air-readiness contracts and nine tutorial-evidence contracts. Existing timing assertions and shared configuration are unchanged. WebKit's three complete journeys take 14.0 minutes in total; they are neither skipped nor given extended assertion deadlines.
- Manual normal-player walkthrough at 1440×900: **all 37 main steps and all six sidebar briefs completed** through normal requisition, base camp, all 13 deployed units, both recon movements, enemy responses, engineer fortification, artillery request, direct fire, Next Group and smoke. No hidden progression mutation, forced click or force preset was used. The SVG edge picker was selected from its visible edge after the semantic locator could not click its zero-width path; this was not a rejected game order. Air Brief 3 was inspected at 1440, then resized to 1680 and 390 without changing the step. Arrows face the target on both desktop layouts and remain hidden on mobile. After desktop-to-mobile resize, the popup required ordinary scrolling to expose the sortie content; no claim of automatic resize scrolling is made. It remained readable and the next action worked. Captured browser warnings/errors: **none**. The task-owned tab was closed and viewport override reset; existing user tabs were untouched.
- Additional screenshot review: Chromium wide/mobile deployment, recon destination, fortification edge, artillery command, fire target, smoke command, completion and all six sidebar brief frames were inspected. These complement the complete manual desktop journey and nine individually inspected arrow references; they are not a frame-by-frame animation certificate.

Evidence prefix: `diagnostics/tutorial-arrow-20261016-` (`baseline.log`, `before-*`, `green-*`, `reference-*`, `acceptance-*`, `build.log`, `lint.log`, `unit-compile.log`, `unit.log`, `frozen-source.json`, `reference-hashes.json`). Failed development runs remain preserved and are not counted as acceptance passes.

JSON reporters resolve their supplied path relative to the ignored configuration directory, so the authoritative acceptance JSON is `diagnostics/diagnostics/tutorial-arrow-20261016-acceptance-report.json`. Its start is 18:59:20.282 UTC and duration 1,474,927.83ms. The 19:24:41 UTC source fingerprint still matches the original freeze and all nine reference hashes are unchanged. The preview process was checked by exact command/port and stopped after acceptance; no user-owned preview was stopped.

Reproduce the browser acceptance with the normal project configuration on Windows (it owns and closes its preview server):

```powershell
npx playwright test tests/e2e/tutorial-arrow.spec.ts tests/e2e/tutorial-flow.spec.ts tests/e2e/air-readiness-geometry.spec.ts tests/e2e/tutorial-evidence.spec.ts --workers=1 --retries=0 --update-snapshots=none
```

This run used an ignored configuration that imports the same project configuration, selects the task-owned preview on port 54087, and writes separately named evidence. It does not edit the shared configuration, assertions, deadlines or visual tolerances.

## Release status and limits

**Local acceptance complete; authorized production release pending.** Starting production is `6916e9bf7df82a67b017356e9d69d34176a62304`; authenticated preflight confirms the existing Vite project/team and `https://fsg.sixsmithgames.com`. Local and remote main still match that starting commit, and no active production build was returned. Release one reviewed commit through the existing Git-connected production workflow, then verify READY status, exact commit/alias ownership, artifacts and available error logs. Existing unrelated generated changes and the prior local release receipt are preserved. The production receipt will be appended after the release rather than triggering a second documentation-only deployment.

This is bounded tutorial-pointer acceptance, not a new certification of every mission, live campaign, populated-sortie controls, subjective audio or native Safari. Windows browser-specific image references do not certify other operating systems. The separately named tutorial playthrough report has still not been supplied; this repair closes the directly observed arrow issue, not an unread report's entire contents.

The skill's full unit gate was executed from a fresh, ignored `dist-tsc-check/tutorial-arrow-20261016` compilation instead of invoking `npm test` through `-Full`, because that script overwrites the user's already-dirty tracked `dist-tsc-jest` output. The same registered runner completed all 1,078 tests. Full manual journeys at 1680 and 390, manual tutorial pan/zoom stress, and a comprehensive Class A certificate are not claimed. Prioritized non-blocking follow-up: fix the Logistics target scope, align the three stale panel descriptions, correct Service Notes pluralization, then extend manual coverage and populated-sortie acceptance.
