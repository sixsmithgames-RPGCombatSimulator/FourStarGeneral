# Campaign audit implementation and certification ledger

Baseline: `16bc10e591bc52a9bcedde33e20f08b967e7bca3`, the exact audited commit.
Authoritative scope: [audit resolution plan](CAMPAIGN_UI_UX_AUDIT_RESOLUTION_PLAN_2026-08-29.md).
The original run ledger and all evidence under `test-results/campaign-playtest/FSG-CAMPAIGN-20260829-172311` remain untouched.

## Ownership and integration

One integration owner controls the shared checkout, test entrypoints, commits, and release verdict. Workers have disjoint write scopes; none may commit, push, deploy, or drive the live browser independently.

| Package | Owner | Write scope |
|---|---|---|
| Naval authority | Planck | campaign domain, CampaignState, domain contracts and dedicated tests |
| Workspace discovery | Kant | command shell/view contracts, workspace panel, pure workspace projection and tests |
| Location grammar | Darwin | location resolver, view assembler, projection helpers, order presentation and tests |
| Geometry | Linnaeus | campaign CSS, index.html campaign layout extraction, campaign browser suite |
| Public entry | Cicero | public landing and dedicated static contract |
| Integration/navigation | Parent | CampaignScreen producer, inspector, map controller, UI state/navigation, test runners and ledger |

CSS extraction is reviewed and committed before geometry changes. Behavior packages receive separate local commits after review; no per-package pushes. Existing user-owned plan content is preserved.

## Finding traceability

The implementation has passed the complete local release-command sequence recorded below. All deployed acceptance exercises remain OPEN; local proof is not live certification.

| Finding | Primary automated owner | Local acceptance | Live exercise | Status |
|---|---|---|---|---|
| 001 public entry | LandingCampaignIdentity.contract.test.ts / FSG_CAM_080–083 | static identity and owned artwork; browser 081 clicks the real public link into Campaign and preserves standalone tactical entry | desktop and compact entry screenshots | LOCAL PASS; live OPEN |
| 002 scope/state | CampaignNavigationScope.test.ts / FSG_CAM_060–061 | every workspace/layer pair, compact select changes, keyboard rail, exactly one selected control and SVG parity | Forces workspace → Intelligence layer → workspace navigation | LOCAL PASS; live OPEN |
| 003 Forces | CampaignWorkspaceProjection.test.ts / FSG_CAM_068–071 | grouping, search and all postures; discovery 071 and producer 045 prove exact formation selection and real commitment blocking | find ready and committed formations | LOCAL PASS; live OPEN |
| 004 naval | CampaignNavalSupport.test.ts / FSG_CAM_051–059 | eligibility, exact source reservations, real competing commit, tactical charges, per-source RP conservation, migration and hydration; UI 059 consumes actual authority | supported/unsupported engagement, save/resume, AAR | LOCAL PASS; live OPEN |
| 005 Intelligence | CampaignWorkspaceProjection.test.ts / FSG_CAM_072–075 | safe grouped briefing; producer 075 resolves real reconnaissance, marks read through Screen, saves and restores a fresh State/Screen | zero-unread state and changed-contact briefing | LOCAL PASS; live OPEN |
| 006 overlap | e2e/campaign-command-ui.spec.ts / FSG_CAM_076–079 | zero tray/action intersection at 1506×768; toolbar containment and layer/camera non-overlap at all six viewports | queue tactical engagement with tray visible | LOCAL PASS; live OPEN |
| 007 locations | CampaignLocationPresentation.test.ts / FSG_CAM_063–067 | authored labels, subordinate grid, exact identity; objectives, contacts, orders, reports, AAR, precombat and composers use the shared resolver | objectives/contact/order/report/AAR labels | LOCAL PASS; live OPEN |
| 008 compact | e2e/campaign-command-ui.spec.ts / FSG_CAM_076–079 | 71.97px inspector body at 640×360, one scroll owner, real wheel exposes the last target before clicking and keeps it visible after rerender | inspect, act, return to map | LOCAL PASS; live OPEN |
| 009 focus | CampaignNavigationScope.test.ts / FSG_CAM_062 | corrected descendant-owned Escape reproduced a real shell propagation defect; handled events no longer trigger a second focus change | actual keyboard sequence in live browser | LOCAL PASS; live OPEN |

### Baseline reproduction and review corrections

- **001:** Four static tests failed against the original public HTML: generic tactical title, `Play Now` first CTA, no skip-link destination, and OS pictographs. Logs and final eight-viewport landing checks are in `dist-tsc-check/landing-cam-001/`.
- **002/009:** Navigation tests executed against the exact audited checkout. Scope labels and workspace/layer parity failed. Escape from the focused search descendant also failed: the overlay correctly closed, then the shell handled the same already-prevented event and moved focus again. The correction is one `defaultPrevented` guard in the shell, not another overlay focus listener.
- **003/005:** The new workspace interactions failed against baseline shell rendering: persistent formation discovery was absent and the explicit Intelligence read control was missing. Projection tests own grouping/filter logic; higher-level tests own gestures, exact IDs and persisted read state.
- **004:** Baseline Logistics and fleet presentation disagreed. New domain cases own eligibility and conservation. Independent review additionally reproduced mixed expenditure `[2,0]` consuming 140 RP instead of 70, rehashed ground-source save acceptance, expired legacy-history rejection and use of a commit clock before a delayed resolution. All received focused regressions.
- **007:** Baseline primary headings and report references used raw grid labels. Resolver tables and cross-surface contracts now require authored names with subordinate, unchanged grid references. No nearest-place or hidden-state naming was introduced.
- **006/008:** Exact baseline browser reproduction measured 6023.9970703125px² tray/action intersection at 1506×768 and a zero-height inspector body at 640×360. Evidence: `diagnostics/campaign-audit-geometry/baseline-red-summary.json` and `baseline-red/`.
- **Extraction:** `61fcdd6` moves CSS without behavior changes. `extraction-parity.json` compares 880 HTML elements at each of the six release viewports: no computed-style, bounding-box or scroll-metric differences.
- **Independent geometry review:** A new toolbar assertion caught 222px² overlap at 1280×720 even though the initial 19 tests passed. Evidence: `toolbar-red.json` and `toolbar-red/`. Whole control groups now wrap, and the same matrix asserts actual control containment, non-overlap and operation.
- **Integration review:** Added real ready/committed field-formation action coverage, native public-link routing, explicit risk-consent coverage and recovered active-battle resume coverage. Old assertions requiring all movement controls in the fixed footer were replaced with assertions on their reachable inspector-body location and domain-owned availability.
- **Recovery boundary:** The actual Load control's recovery test failed against the prior Screen: the verified earlier active battle restored, but no tactical resume event was dispatched. Primary and recovered checkpoints now share one exact resume handoff. Actual heavy/overwhelming Queue callers and Load recovery prove cancellation preserves state and acceptance hands off once; the five related producer/dialog/caller checks pass together.

### Rules and compatibility

Naval UI and authorization use `CampaignNavalSupportService`; `economy.navalPower` no longer masquerades as available support. A support assignment carries one exact fleet and two actual tactical fire missions. The service evaluates ownership, authored task-force capacity, operational condition, range, target authorization, current reservations and replenishment. Current package v3, result v2 and AAR v2 preserve source identity through tactical assets and returned charge deltas. Consequence v2 accounts for each fleet's reserved, consumed and refunded RP. Older package/report versions remain readable; expired historical claims are retained without creating active holds, while active ambiguous claims fail closed. Hydration validates authored membership before replacing live state.

The player-safe location contract changes presentation only. Persistent formation IDs and offset navigation keys remain unchanged; coordinate conversion is used only for exact authored lookup. Campaign feature work leaves tactical and coordinate algorithms unchanged. The final lint gate includes mechanically verified `HexMapRenderer.ts` cleanup described below; `BattleScreen.ts`, `src/game/GameEngine.ts`, and `src/core/Combat.ts` remain unchanged.

### Reviewable local packages

| Commit | Package |
|---|---|
| `3d78852` | Preserve authoritative plan and establish ownership/evidence ledger |
| `61fcdd6` | Behavior-neutral CSS extraction |
| `88d18a9` | Shared authored location presentation |
| `4ea895d` | Naval authority, reservations, tactical identity and persistence |
| `6b13aae` | Campaign-led public landing and owned artwork |
| `76be1c9` | Headquarters/map-layer state and corrected Escape propagation |
| `895255c` | Forces projection, discovery and status |
| `dc20457` | Intelligence briefing, filters and history |
| `f1b1a96` | Inspector/tray geometry and viewport regressions |
| `7aa9c30` | Per-fleet expenditure and defensive save migration/validation |
| `8682c15` | Consume direct campaign-entry intent at startup |
| `03cd947` | Shared authority wired into Screen, precombat, actions and persisted briefings |
| `41ddd9f` | Register audit owners in the full release suites |
| `d159114` | Toolbar wrap and real native landing-route browser proof |
| `d397136` | Exact recovered tactical resume and real danger/recovery caller regressions |
| `87d0647` | Mechanical zero-warning lint gate, with emitted-code parity and renderer impact review |
| `0ee7285` | Complete test execution, repaired stale fixtures and independently reviewed assertion integrity |

## Risk controls

- Naval eligibility and commitment must use the same pure result; source identity survives reservations, cancellation, expenditure and resume.
- UI projections receive only player-authorized records. Geography labels never alter entity or save identity.
- Additive persisted domain changes require an idempotent content migration and fingerprint review.
- Local automated Playwright is required explicitly by the implementation plan; it is not evidence of deployed live acceptance.
- Existing build/test scripts share `dist-tsc`; workers use isolated output directories and final suites run sequentially.
- No tactical engine, BattleScreen or coordinate-math edits are planned. If necessary, record dedicated impact analysis before editing.

## Verification record

The first clean release run at `a8467b8` passed 92 professional-UI tests, 310 campaign tests, all 20 production-build browser tests, and the build. Lint exposed the nested baseline checkout plus 151 existing warnings in 40 actual source/test files. The baseline worktree now resides at `dist-tsc-check/campaign-audit-baseline`, preserving its audited commit and evidence while using an existing excluded output area. The initial results and warning report are retained as `release-results-first-run.json`, `lint-before-cleanup.log`, and `lint-current.json` in the release diagnostics directory.

To meet the plan's zero-warning requirement, a separate mechanical package removes unused imports/types, marks unused bindings and their writes explicitly, changes never-reassigned locals to const, and removes obsolete lint-disable comments. It preserves every initializer, call, assertion, parameter position, and gameplay expression. No ESLint rule or ignore changes are used. The renderer impact analysis was recorded before editing in `implementation_plan.md`. `all-lint-parity.json` verifies all 40 emitted JavaScript ASTs match the prior candidate after normalizing only documented unused identifier renames and let/const declarations (plus comments/line endings); the renderer-specific report is `renderer-lint-parity.json`.

Focused local verification is complete: 20 browser checks passed in `diagnostics/campaign-audit-geometry/local-final-report.json`, and 48 naval/domain and existing persistence/result/consequence/AAR checks passed during domain review. The campaign integration run passed 305 selected cases before the last three producer checks were added; those three also passed their isolated interaction run. These focused counts are not a substitute for the unfiltered release commands.

The final six commands ran sequentially from clean commit **`0ee7285c6d21c4b16b0f616f44e9289736dfd75d`**, September 5, 2026, 14:05–14:10 EDT. The worktree remained clean through completion. Logs, exact commands, timestamps and the tested commit are retained in `diagnostics/campaign-audit-release/release-results.json`. The integration owner verified the absolute `dist` and `dist-tsc` cleanup paths before invoking the existing scripts. Only this evidence ledger changes after the tested commit.

| Required command | Final result |
|---|---|
| `npm run test:campaign:professional-ui` | PASS — 92/92, exact completion summary |
| `npm run test:campaign` | PASS — 310/310, exact completion summary |
| `npm run test:e2e -- tests/e2e/campaign-command-ui.spec.ts --project=chromium --workers=1` | PASS — 20/20; all six viewports; no failed tests |
| `npm run build` | PASS — zero TypeScript errors; production bundle verified without static chunk cycles; existing advisories recorded below |
| `npm run lint` | PASS — zero ESLint errors or warnings |
| `npm test` | PASS — 701/701, exact completion summary; no filter or exclusions |

Browser artifacts are in `diagnostics/playwright/results/` and `diagnostics/playwright/report/`. The last-run record reports `passed` with an empty failed-test list. This local result certifies the implemented campaign contracts and completed regression execution; it does not replace the open deployed acceptance exercises or certify unrelated air choreography.

### Full-suite completion defect and fixture repair

The repeat release run at `7e1e2b8` returned zero from all six commands, but `npm test` emitted only 67 passes and never finished. That result is **invalid**, not a full-suite pass. The historical output and command record are preserved as `full-test-premature-exit.log` and `release-results-incomplete-full-run.json`.

The old runner launched an unawaited async function. A frame-animation fixture mutated an obsolete CSS position instead of the actual SVG `x` attribute, leaving its fake animation-frame Promise pending without a Node event-loop handle. Node exited successfully before executing the remaining registered tests. The runner now uses top-level await, a retained native per-test watchdog independent of fixture clocks, named failure reporting, and a final exact completion count. Two isolated child-process regressions prove named timeout failure and ordered asynchronous completion. The release helper also rejects a zero exit without a matching positive completion summary. No test filters or exclusions are added to release commands.

The exact audited frame fixture fails under the corrected watchdog (`frame-sequence-baseline-red.log`). Its replacement checks finite SVG geometry, positive width/height, stable playback placement, and rejection of actual SVG anchor drift. The harness and all three frame cases pass together in `harness-and-frame-focused.log`.

Executing the previously unreachable tests revealed additional stale fixtures. These repairs change test code only; they do not alter the tactical engine, BattleScreen, air renderer, tutorial behavior, mission doctrine, or unlock behavior:

| Fixture area | Corrected contract |
|---|---|
| Frame, sprite and viewport geometry | Actual SVG attributes, authored one-pixel sprite trim and inverse-zoom marker scale |
| Battle air playback | Real resolved renderer scenes/options, exact identities and impact ownership; fabricated legacy animation logs removed |
| Mission lifecycle | Actual asynchronous in-game consent, computed resolution, validated campaign application and completed autosave before navigation; constructed screens dispose in `finally` |
| Tutorial and initiative | Real active action phases, valid selected axial/offset pairs and current initiative queue; current authored navigation copy and mobile header clearance |
| Browser API fixtures | jsdom's actual Element and KeyboardEvent constructors; explicit layout-free scroll method adapter, with actual scrolling owned by browser regressions |
| River Watch deployment | Intentional pre-audit capacity reduction from 20 to 16 (`bab490c`); separate explicitly authored 20-capacity expansion case retained |
| Unlock entry | Exact current Unlock link and correct SKU purchase destination, with locked requisition rejection retained |
| Air timing | Actual timeline-v2 actor windows and renderer sampling; overlapping phases are not treated as sequential or shared assignments; missing required scenarios now fail |
| Air combat | Required canonical weapon models and authoritative aircraft salvo/status ledgers; exact readiness preview/application conservation |
| AI air decisions | Heavy-flak fixture uses four real batteries and proves lethal predicted coverage, with an undefended control that launches; target distribution uses equally valuable targets while separate target-priority checks remain |
| Ground actions and logistics | Correct authored forest offset and visible support targets; support impact measured before turn refresh; queue identities use unit IDs; allied transfer compares complete units before legitimate turn resupply |
| Fieldworks and infantry | Actual recognized towable type; exact road costs and move debit; valid combat profiles and status pools; deployed guns remain immobile despite an unspent budget; lethal sentry retaliation conserves the full personnel pool |
| Combat stance severity | One status-derived depleted attacker avoids terminal damage saturation; strict assault severity and exact doubled suppression remain enforced |
| Fighter motion and flak | Actual actor handoffs retain the 2px continuity limit; 100ms headings use current 32° bomber / 67° fighter limits; flak smoke covers actual release and tapers before egress; visibility is checked at real release and impact times |

The infantry suppression fixture contained a historical rule mismatch: May 16 commit `413994c0` added the broken-state test expecting dig-in rejection, but did not add that restriction to the engine. Exact baseline and current engine both allow uncommitted infantry to entrench under suppression. The documented Dig In requirements and current broken-state explanation do not prohibit it. This package preserves shipped behavior and explicitly proves dig-in succeeds once, adds one entrenchment, consumes the activation, retains broken status, and still bars sentry; it does not introduce a tactical rules change.

Additional workers remained restricted to disjoint test files and isolated output directories. Parent-only exploratory filtering allowed work around active worker scopes; those runs are diagnostic and cannot certify the release. The final 42 infantry, stance and fighter-motion checks pass together, and fresh project TypeScript and zero-warning test lint pass. The complete unfiltered diagnostic run then finished with **701/701 passes**, an exact matching summary and exit zero (`full-unfiltered-diagnostic.log`). The final clean-commit sequence above independently repeats the complete suite after review corrections.

Independent test-integrity review then required four assertion corrections: finite guards before numeric comparisons, preservation of the fighter's synchronized scalar ammo check alongside its salvo ledger, independently pinned documented motion limits, and explicit visibility intervals at release/impact. The last correction exposed a genuine old-test false positive: the path sampler returns coordinates after an actor's visual lifetime. The canonical scenario now verifies all five exact surviving bomber identities and eleven explicit destruction lifecycles, rather than calling destroyed aircraft visible. All 30 affected cases pass together in `review-corrections-focused.log`.

### Existing build advisories

Vite reports a large output chunk and an unresolved `FSG_Explosion_Large.png` URL from `SpriteSheetAnimator.ts`. Both are present in the exact audited baseline. The similarly named existing eight-frame image is not a valid replacement for the referenced 24-frame sheet. The renderer's large-explosion branch currently uses `playBombImpactStick` before that older sprite path; this has not established an active missing-asset request. No speculative asset or rendering change is included. The required live console/request sweep must check the deployed effects before certification.

### Full-suite diagnostic limitations

The unfiltered log contains expected rejected-action errors from deliberate negative tests, and `MapViewport` context warnings where jsdom fixtures have no measurable viewport. Browser geometry checks own actual layout proof. Node also emits its existing experimental-loader advisory.

The preexisting `AIR_SHOW_SPATIAL_SEPARATION_REPORT` is a non-asserting diagnostic and prints severe fighter proximity findings; its pass line does not certify air spacing. Investigation with actual simultaneous timeline samples confirms close fighter crossings, including approximately 0.10px between escorts in the coordinated package at 36,000ms (`separation-timeline-probe.log`). `AirShowDirector.ts` and `AirShowTimeline.ts` are byte-identical to the audited baseline; this campaign package does not introduce or correct that choreography. The diagnostic remains visible and unchanged. Natural live tactical verification must assess this existing air-visual limitation; the 701-test completion result must not be represented as a clean air-visual certificate.

## Release certification

**Release verdict: FAIL / live certification OPEN.** No push or deployment has been performed. Section 7 explicitly separates implementation authorization from deployment authorization. The complete natural campaign journey, supported and unsupported engagement, actual 20+ turn tactical battle, natural AI defense, external-browser viewport evidence, live build fingerprint and console/request sweep remain required. Existing unit tests for no arbitrary campaign turn cap and AI response are not evidence of that full player journey.

Independent reviewers have binary veto authority. McClintock returned explicit **local UI/UX PASS** after re-viewing the corrected 1280×720 toolbar, checking direct campaign entry, and verifying the saved 20/20 browser report with no failures, skips or flaky results. Wegener returned explicit **local test-architecture PASS**, closing the naval, recovery and actual danger-consent caller findings, subsequently passed the mechanical lint package `a8467b8..87d0647`, and returned a final **local test-integrity PASS** after all four assertion corrections and the 30/30 focused proof. No actionable review blockers remain in the local package, and all required local release commands pass. No local screenshot, entitlement fixture, headless browser test or successful build is described as deployed certification.
