# Gameplay quality audit follow-up — 17 October 2026

## Scope and current status

Continue the remaining issues in the gameplay quality audit, protect each repair with regression tests, and deploy one checked release. Baseline production is `94cf013f7ae3856e0fcbd8b6e8526d092ff7e7d4`. This document owns the new release evidence; prior audit results remain dated evidence rather than fresh checks of this candidate.

Status: repairs implemented; integrated code and affected-browser release checks pass. Production deployment and public artifact verification remain pending. No first-class certification is claimed.

## Demonstrated defects and ownership

- **Mission reporting:** Pointe du Hoc and Citadel Ridge legitimately award elimination victory while their primary objectives remain in progress. The real debrief reports a contested objective and service history records zero primary completions. The existing mission controller must derive terminal objective state and explanation from its canonical outcome without inventing captures or hold turns. Citadel's visible order must say command ridge plus two additional strongpoints, matching its existing three-total rule.
- **Audio variation:** `mg_fire_02.mp3` and `mg_fire_03.mp3` are identical recordings (SHA-256 `3cfb74fd04b729e72021e688823363839def87f694a046b8c494773fd0a12500`). Distinct pool indices allow repeat selection of the same recording and double its weight. Remove the duplicate from active selection and catalog preload, preserving the original asset files. Keep selection and cooldown in the existing CombatSoundManager.
- **Audio metadata:** catalog lengths of 180–820 ms disagree with decoded 1,000/2,000 ms clips. Correct informational full-clip metadata in both public and bundled copies. It must not become a gameplay clock or delay playback.

No engine strategy, difficulty, combat damage, movement, animation choreography, scheduler, save schema, audio gain or mixer changes belong to this release. No reference-image or timing-tolerance updates are planned.

Production bootstrap passes the bundled catalog object to the renderer/manager; it does not fetch the public catalog independently of its code version. Both copies are nevertheless equality-checked, and the duplicate binary remains available for an already-loaded older bundle. This preserves one playback owner without creating a second catalog reconciliation or timing authority.

## Compatibility-path clarification

Normal newly started UI battles explicitly choose Heuristic and transfer all allied formations to Player before initiative. The audit's legacy Simple and autonomous Allied executor concerns are therefore compatibility-path risks, not evidence that the live enemy uses those flawed paths. No affected old production save was found. Catalog-wide real-engine handoff coverage will strengthen this boundary without rewriting a second executor or silently changing API defaults.

## Live campaign preflight

Fresh read-only checks at 10:00 EDT reproduce the tooling blocker: installed Browser and Chrome packages `26.1013.31256` declare skill directories but both are empty, so their required external-browser startup instructions are unavailable. Chrome is running; the extension is installed/enabled and native-host checks pass. No extension reinstall, package mutation, substitute browser, player action, tab creation or save change was attempted.

Ledger: `test-results/campaign-playtest/FSG-CAMPAIGN-20261017-AUDIT-PREFLIGHT/issue-log.md`. Gate 0 is blocked; gates 1–11 are unrun. The campaign skill's existing package-integrity rule already covers this failure. Automated local browser tests are separate developer regression evidence, not substitutes for live campaign acceptance.

## Verification and deployment

Frozen candidate: **566 files**, SHA-256 `13339aea90a73a7553f88c04be92e862150b02ed592d896b7aa2ef619879b683`, confirmed at 14:06:28 UTC and after integrated checks. Scope is the existing source/test/tool/config fingerprint; public catalog separately hashes to `222c8253eea07ea7fe673ac0627a1c7a7a0cab4814580b1598ac8dd0b2602235`. The last mission-test assertion landed after the first provisional hash but before compilation; the compiled test explicitly contains that assertion. No production change occurred in that interval.

Fresh integrated results:

| Check | Result |
| --- | --- |
| Strict isolated compilation and all registered tests | **1,134/1,134 passed**, including 47 new cases |
| Isolated Jest suite | **30/30 passed** |
| Airshow diagnostics and anomaly report | **87/87 passed**, no anomaly findings |
| Zero-warning ESLint | Passed |
| Repository architecture, asset and gate self-tests | Passed |
| Production build/bundle gate | Passed; six JavaScript files, 82,205-byte initial script, no static chunk cycles |
| Real browser audio decode | **Chromium and Firefox pass** for all 14 active files; **one explicit Windows WebKit skip** because that runtime exposes no Web Audio codec API |
| Chromium Airshow visual/choreography suite | **17/17 passed**, zero skips/failures/flaky cases, 618.701 seconds |
| Deployed public artifacts | Pending |

The build retains its existing large-chunk advisory; no warning limit, reference image, timing threshold or runtime error handling was relaxed. This is the affected-browser release matrix, not a rerun of all 519 historical browser cases. Fresh decoded-duration error is at most 0.022676 ms in Chromium and zero in Firefox. Peaks still reach approximately 1.139 before existing playback gain; no audio bytes or gain values changed, and these measurements are not a final-mix clipping certificate.

Both fresh Airshow temporal certificates pass with no findings or actor gaps: the nine-aircraft engagement records 766 samples over 76.480 seconds, and the zero-strength training strike records 806 samples over 80.507 seconds. Both have median 100 ms sampling, maximum 117 ms gaps and zero delayed-gap findings. These are sampling-cadence measurements, not rendered FPS. Named copies are preserved under `diagnostics/gameplay-quality-20261017/airshow-traces/` so later runs cannot replace this evidence.

All seven existing painted-frame references pass unchanged. Root inspected each fresh merge, scramble, bomber-ingress, target-run, large-map and mobile frame. The combined affected-browser matrix is **19 passed, one explicitly unsupported WebKit-audio skip, zero failed/flaky cases**. The test runner closed its isolated browsers and preview server; port 54517 has no listener. No user-browser tabs were opened. Final post-test fingerprint still matches at 14:19:34 UTC.

Release preflight at 14:19:20 UTC: intended Vercel team/project match `.vercel/project.json`; eight deployments in the last 24 hours, none in the last hour/five minutes and none building/queued/initializing. Git main and origin main remain at the known baseline before the scoped release commit. One batched production push is planned; unrelated generated files and earlier local audit receipts are excluded.

Before-fix evidence: initial mission contracts produced exactly three failures (two unresolved primaries and Citadel wording), plus 17 passing controls. Additional terminal-detail contracts fail old code; optional-reason cases fail the first repair and pass the final guard. The two audio regressions fail old code for byte-identical selectable variants and repeated public-manager recording at cue 4. All 24 new mission cases, five audio cases and 18 catalog handoff cases pass in the integrated suite. The allied missing-transfer negative control also fails as intended. Independent reciprocal reviews found no actionable issues.

Evidence: `diagnostics/gameplay-quality-20261017/` (integrated logs and browser reports), `diagnostics/mission-quality-20261017-*` (mission red/green receipts), `dist-tsc-check/audio-quality-20261017/` (audio red/green receipts), and `diagnostics/remaining-bot-review-20261017/` (handoff checks). Generated output was isolated from the preexisting dirty `dist-tsc-jest` files.

### Separate dormant-test finding

An additional probe of **unregistered** `tests/MissionRules.authoredScenarios.test.ts` fails its expectation that Citadel victory returns `phase3_escalation` and four objective markers. The same test fails against the prior certified compiled production source (`diagnostics/mission-quality-20261017-dormant-baseline.log`); this repair changes neither phases nor markers. The test remains untouched and unregistered as it was before this task. This is an open legacy test/feature-contract mismatch, not counted as a passing check or hidden by weakened expectations. Resolving the intended Citadel phase/marker behavior and registering that coverage is separate follow-up work.

## Remaining acceptance limits

Live campaign completion and save/resume, authentic skilled-player mission balance, subjective listening to overlapping final audio, and the explicitly legacy AI compatibility paths remain unclosed. This bounded repair does not certify the entire game first-class. Existing large-orchestrator reduction should remain a separate behavior-preserving task, not be mixed into these rule fixes.
