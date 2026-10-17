# Citadel phase and objective-marker repair — 17 October 2026

## Scope and cause

Resolve the dormant authored-scenario test mismatch, register its coverage, and deploy after checks pass. Baseline: `eb3288ff0b2491f5423d96c7251a22b797f70aed`. Status: all release checks passed; production deployment pending. Post-deployment receipt will be retained locally without triggering a second documentation-only deployment.

This was a missing feature, not an incorrect victory assertion. The mission design explicitly calls for approach, breach and counterattack-window presentation plus four strongpoints. The Citadel controller never returned either phase or markers. The three-case `MissionRules.authoredScenarios.test.ts` file was not imported by the default runner. Its original phase assertion fails against the previous release; the failure is preserved in `diagnostics/citadel-contract-20261017/dormant-before.log`.

The omission also creates a player-facing inconsistency: the map can fall back to engine occupancy while the compact objective card reads absent mission marker data and reports a friendly-held tactical point as “In Progress.” Both existing consumers now receive the same canonical marker projection.

## Single-authority contract

| Current snapshot | Advisory phase |
| --- | --- |
| Before turn 5, no friendly strongpoints | Approach |
| Turn 5 onward, or one friendly strongpoint | Breach |
| Turn 9 onward, or two friendly strongpoints | Counterattack Window; takes precedence |

All four markers derive from the controller's existing strongpoint keys and the engine's current occupancy. Player and Ally count as friendly, Bot as enemy, and empty hexes as unoccupied. Their normalized axial positions remain `(16,-4)`, `(16,0)`, `(16,4)` and `(20,-2)`. Vacating or recapturing a point immediately changes the next projection; victory by elimination never invents occupation.

Phases describe current tactical windows, not a new AI order, scheduled event or reinforcement spawn. They may recede after a friendly point is vacated before the corresponding time threshold. Outcomes, command-ridge-plus-two capture rule, deadlines, AI and renderer are unchanged. Save version and serialized fields remain outcome-only; existing resume code reevaluates the restored engine snapshot. No second ownership ledger or phase clock is introduced.

Integration review found that Citadel was excluded from the existing action-completion refresh. The shared hook now reevaluates Citadel after accepted player moves/attacks and completed initiative bot activations. Nonempty initiative support batches also refresh Citadel after playback, including without a renderer. Conventional rounds already reevaluate through `turnAdvanced`; campaign and other missions retain their prior cadence. Citadel now recognizes an existing capture/elimination victory at the completed action rather than waiting for the round boundary. This timing correction prevents stale card/marker states without duplicating rule evaluation inside rendering or adding an ownership tracker. The old action guard fails the new real-consumer regression (`action-before.log`).

## Verification and release

The original three regressions remain intact, including Pointe du Hoc's hold case. Added **43 registered cases** plus **six browser cases**. Coverage includes independent executable-import registration protection (rejecting commented/type-only/deferred imports), phase boundaries, mixed-faction marker states, current-occupancy changes, terminal truth, legacy outcome-only saves, deterministic re-evaluation, real objective-card/SVG consumers, accepted-action refresh and support completion. Local browser visual fixtures are component integration evidence, not full live-mission or campaign playthrough certification.

| Release check | Result |
| --- | --- |
| Strict isolated compilation; final browser-only delta typecheck | Passed |
| Focused mission/action/support checks | 72/72 passed |
| Complete registered regression suite | 1,180/1,180 passed |
| Isolated Jest suite | 30/30 passed |
| Airshow diagnostics and anomaly report | 87/87 passed; no findings |
| Zero-warning repository lint; final browser delta lint | Passed |
| Repository gate self-tests, architecture and assets | Passed; no budgets increased |
| Production build and bundle validation | Passed; six JS files, lazy tactical chunk, no static cycles |
| Chromium, Firefox and WebKit at desktop/mobile sizes | 6/6 passed, one worker, zero retries (40.3 seconds) |

Original red evidence is retained for the dormant phase assertion, accepted-action stale status and missing support-batch refresh. The initial projection-only full suite passed 1,171 cases before the action gap was found; that run is preserved separately, not substituted for final acceptance. Independent reviews found no remaining blocking issue after the action-boundary correction.

Visual review found the preliminary six-pass browser run photographed newly repainted markers during their existing half-second fade-in. The final test-only correction awaits actual finite entrance completion and asserts parent-group opacity 1 before checking or capturing; infinite decorative pulses are ignored, not cancelled. All six cases passed again and desktop Chromium/mobile WebKit screenshots were inspected with clearly visible green/red/gold markers and matching compact cards. The preliminary evidence remains preserved. No CSS, production runtime, screenshot tolerance or deadline changed during this correction.

Frozen implementation/test fingerprint before that final browser-only observation change: 567 files, SHA-256 `b72c94deb49db3eb3004fe24864c524ef5085ac3a1af6f2e33b4e2a9b120b230`. Final source/test/tool/config fingerprint: 567 files, SHA-256 `c4b19cf2ea0940a98ae32cffdf5129413b6ecbc02c5397ecac7208969b3a09d4`. Runtime and registered regression code stayed unchanged between them; the browser-only delta received fresh strict typecheck, lint and all six browser checks. The built runtime is unchanged. Vite's existing large-chunk warning remains; it is not waived or represented as a new failure.

Hosting preflight at 15:27:30 UTC: nine team deployments in the previous day, zero in the last hour/five minutes, none active; remote main still matches the baseline. Deploy one scoped commit only after all checks above.

Evidence directory: `diagnostics/citadel-contract-20261017/`; final screenshots/report are under `citadel-browser-final-*`. Air anomaly receipt: `diagnostics/air-scenario/air-scenario-20261017-112555.txt`. Generated compilation and Jest output are isolated from the preexisting modified `dist-tsc-jest` files. Both automated browser runs closed their owned browsers and preview server; no listener remains on port 54518. At the user's cleanup request, four idle FSG localhost preview tabs were closed through Chrome's tab controls; the existing live FSG tab and unrelated tabs were preserved. No new user-browser tab was opened.

## Acceptance limits

This bounded repair closes the dormant Citadel contract, not the broader skilled-player balance, live campaign completion, subjective audio-mix, or legacy AI compatibility work recorded in the gameplay audit. No claim of whole-game first-class certification is made.
