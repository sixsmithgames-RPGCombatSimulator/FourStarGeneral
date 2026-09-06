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

**Live certification remains OPEN.** The user explicitly authorized deployment and the live audit after the local certificate. One push released commit `a015e4579db432f3b034a164b91e798af2910fe2`; Vercel production deployment `dpl_8UwJhYREYQTTkKKQpkgx8XKW9qhN` is READY and its `fsg.sixsmithgames.com` alias is confirmed. Shared-team preflight found no active deployment and no deployments in the preceding 24 hours. The complete natural campaign journey, supported and unsupported engagement, actual 20+ turn tactical battle, natural AI defense, authenticated external-browser viewport evidence and final console/request sweep remain required. Existing unit tests for no arbitrary campaign turn cap and AI response are not evidence of that full player journey.

Independent reviewers have binary veto authority. McClintock returned explicit **local UI/UX PASS** after re-viewing the corrected 1280×720 toolbar, checking direct campaign entry, and verifying the saved 20/20 browser report with no failures, skips or flaky results. Wegener returned explicit **local test-architecture PASS**, closing the naval, recovery and actual danger-consent caller findings, subsequently passed the mechanical lint package `a8467b8..87d0647`, and returned a final **local test-integrity PASS** after all four assertion corrections and the 30/30 focused proof. No actionable review blockers remain in the local package, and all required local release commands pass. No local screenshot, entitlement fixture, headless browser test or successful build is described as deployed certification.

### Live audit follow-up

Run `FSG-CAMPAIGN-20260905-160156` uses one connected external Chrome driver, with independent agents reviewing saved evidence and the focused repair. Its authoritative ledger and screenshots are under `test-results/campaign-playtest/FSG-CAMPAIGN-20260905-160156/`.

The deployed campaign-led landing and real `/play?mode=campaign` entry render correctly. The initial guest session reached normal return-to-landing, Sign In and Google authentication. That access boundary was subsequently resolved through the user-authorized computer-tool sign-in flow; authenticated gameplay continued through the same external Chrome extension with one live driver. Existing tactical saves remain preserved.

Two live access defects were recorded before edits: FSG-CAM-001, missing direct sign-in recovery for existing subscribers; and FSG-CAM-002, a missing modal interaction boundary. One Tab focuses the Reports control behind the gate. At 640×360 and 800×900, workspace/tray layers obstruct the gate and its recovery actions. This compact recovery failure warrants one capacity-checked follow-up release after a focused repair, independent review and all six local release checks. No entitlement or gameplay authority change is authorized by these findings.

The added local `FSG_CAM_082` compact browser regression fails against the unchanged pre-fix production bundle, proving the missing accessible dialog. Six viewport cases cover actual recovery hit targets, native forward/reverse Tab, the sign-in return URL, and clean return/re-entry. The campaign validation skill's preflight now explicitly requires these signed-out access checks; its `quick_validate.py` passes. The authoritative live run ledger records deployment and exact live reproduction results separately from the local checks below.

The focused repair passes all six browser cases and three access-lifecycle cases. The first complete local attempt at `99f2b14` stopped on an existing gameplay-dialog fixture that had silently used guest access: the strengthened gate correctly retained focus on Sign In. The isolated gameplay Screen fixture now supplies its own entitled UnlockState before initialization, without changing any confirmation, cancellation, focus, runtime-state or fail-closed assertions. The professional UI suite then completed **95/95**. Guest denial, authentication without entitlement, access grant/revocation, transition completion and cleanup remain independently exercised by the new access tests. No failed candidate was deployed.

The complete follow-up sequence passed from clean commit **`c11722d6c77fabbe81f29cd7e5d676519c5358e6`**, September 5, 16:31–16:36 EDT: professional UI **95/95**, campaign **313/313**, browser **26/26**, production build PASS, lint **zero warnings/errors**, and unfiltered full tests **704/704** with exact completion summary. The worktree and commit remained unchanged during the run. Exact commands, times and results are in `diagnostics/campaign-audit-release/access-release-results.json`. Wegener returned final **LOCAL architecture/test-integrity PASS** for that exact commit; parent reviewed both compact correction frames. Only this ledger changes after the tested commit. Existing build advisories and unverified air choreography remain as recorded above.

### Authenticated campaign corrections

Production `128dd03` / `dpl_EA1smPK8ZxwejvFjgG7Uqr8htXAR` closed live access findings FSG-CAM-001/002. The authenticated continuation then exercised all four workspaces, a real Portland -> Exeter truck order through preview, draft, commit and arrival, the Omaha-Gold attack briefing and normal return, naval range/source disclosure, six inspector viewports, and Escape from an active map-list search. The ledger records these separately from full tactical/campaign certification, which remains open.

Four run-scoped findings drive this next consolidated candidate:

| Live issue | Responsible presentation boundary | Regression owner |
|---|---|---|
| FSG-CAM-003: selected contact lost on Verify entry; recovery loops | Screen synchronizes canonical authorized contact selection into preview/draft and returns recovery to focused contact list | Real Screen contact/planner/navigation contracts |
| FSG-CAM-004: duplicated active objective and front decisions buried after backlog | Shell merges active objective progress with its priority action, preserves all objective access, places fronts first in DOM order, suppresses an unexplained zero-progress forecast | Situation first-frame contracts plus existing navigation integration |
| FSG-CAM-005: arrived formation and returning transport appear contradictory; raw internal coordinates in history | Screen reads the current execution record and structured movement history, preserves the distinct transport-return lifecycle and formats named player locations | Actual movement/arrival/return with in-memory save/load and rendered inspector |
| FSG-CAM-006: moving formation lacks route context in Forces/inspector | Pure Forces projection and inspector consume the exact active movement order's supplied route/ETA without assigning a map position | Projection identity/arrival/cancellation negatives and inspector consumer contract |

The movement engine is correct: formations arrive at segment one, while trucks remain reserved until segment two. No engine, coordinate math, save schema, grading, entitlement or strategic truth changes are included. Independent integration review found two stale composer paths (contact -> same map-list hex; contact -> priority objective); shared synchronization now fixes both, and actual Screen controls prove correct preview/draft targets. Agents retain disjoint file ownership; the parent alone commits, runs the full release sequence, checks shared deployment capacity, pushes and drives the live browser.

The validation skill now requires the exact new semantic regressions and explicit autosave namespace checks. Its UTF-8 `quick_validate.py` run passes. Existing checkpoint IDs were read only from their visible UI elements. An offline raw-content diagnostic predicted a distinct namespace but did not reproduce the fully normalized live identity. The live Save Center subsequently confirms the new audit autosave and named manual checkpoint use `campaign_8719ded1`, with all 13 original checkpoints still present under their previous identities. Replacement of the separate primary campaign slot remains pending user input.

Focused proof: contact/selection/arrival/history **6/6** (`diagnostics/fsg-cam-003/navigation-green.log`); first-frame and existing routing **6/6**; Forces projection **9/9**; inspector-route plus prior selection/base contracts **3/3**. Original failures were reproduced before fixes. The first-frame red transcript is retained in tool output, while other focused evidence includes preserved diagnostic logs/bundles. Scoped TypeScript and zero-warning lint pass. Wegener returned conditional **LOCAL architecture/test-integrity PASS** for the integrated presentation diff, contingent on clean-commit full verification.

The same live attack has now reached turn two, with eight infantry, two engineers and a supply convoy deployed, plus Western Naval Force's two support charges. Its named turn-one save succeeded. A newly observed tactical roster count of six despite eleven deployed formations is under separate source diagnosis; this presentation checkpoint does not certify or resolve that finding. Candidate full verification and deployment results will be recorded after all current release blockers are resolved. No focused agent result is presented as a full-suite or deployed pass.

### Stacked tactical reporting and actual browser zoom

Live FSG-CAM-007 is a reporting defect: all eleven persistent formations remain in the engine, initiative, stacks, and tactical checkpoint. The old roster reads one primary unit per occupied hex and synthesizes colliding type/hex IDs; current supply reads reuse a historical deployment sample. Moving one engineer out of its stack raises the displayed roster from six to seven without adding a formation, confirming the mismatch through normal play.

The bounded repair changes only three read projections in `GameEngine.ts`: roster and supply enumerate the canonical faction units, roster rows retain stable unit IDs, and current supply is computed without appending or rewriting history. The selection summary in `BattleScreen.ts` now describes the absence of legal options without inferring that a fresh blocked formation has spent its actions. The high-risk impact analysis was recorded before editing. Movement, combat, initiative, supply spending, save schema and AI rules remain unchanged.

Six stacked-reporting regressions fail against the original projections and pass after repair, covering eleven units/sixty ammo, same-type identity, exact-member movement, hydration, conventional and initiative phase starts, faction isolation, and read purity. The actual selection caller also fails on the original false action sentence; all six selection tests pass after repair. Isolated compilation and scoped zero-warning lint pass. Evidence is under `dist-tsc-check/fsg-stacked-reporting/` and `diagnostics/battle-selection-options/`; independent integration review and clean-commit release gates remain pending.

FSG-CAM-008 was reproduced with actual Chrome 200% zoom, set through the user-authorized computer tool and inspected through the external browser after removing viewport emulation. At CSS 753×356 / DPR 2.5, End Turn lies at x963–1058 outside the viewport, with no horizontal page scroll recovery. Chrome has been restored to 100%. A separate owner is repairing only responsive tactical layout and adding browser geometry coverage. The live screenshot and exact bounds are retained in the run evidence. This is an open release blocker, not a passing equivalence check.

The tactical CSS repair is now frozen for review. Its six-size local browser regression uses shipped markup/styles and the real initiative component, exercising both active-group and End Turn states, native keyboard activation, unobstructed hit targets, text containment and retained map space. The original CSS fails all six cases (compact overflow and undersized desktop buttons); the corrected CSS passes all six/twelve states. At 753×356, End Turn fits at x568–691 with a 44px height. The compact map retains 59–61px; actual map/selected-unit overlay usability still requires deployed inspection. Evidence is in `diagnostics/tactical-header-geometry/{red-matrix,green-final}`. This fixture excludes map rendering, external fonts/assets and expanded panels; it is local layout proof only.

Independent review rejected the first supply refresh implementation: comparing current stock with the just-recorded sample erased consumption/depletion information and duplicated the current trend point. That candidate has not been released. The owner is preserving the intended recorded comparison and adding a real consumption-boundary regression before the release sequence.

The corrected supply projection now refreshes the newest observation against its preceding sample, while recording continues to append normally. Three additional real end-turn consumption regressions fail on the rejected implementation and pass after correction, including stable/warning/critical states, burn, depletion, alerts, trend, repeated reads and load purity. All nine stacked-reporting tests pass (`review-red.log` / `review-green.log` in the same evidence directory). Wegener returned conditional LOCAL architecture/test-integrity PASS for FSG-CAM-007 and conditional LOCAL UX/test-integrity PASS for FSG-CAM-008; full release gates and exact deployed checks remain required.

Run-scoped FSG-CAM-009 corrects one additional naval feedback sentence. The hit:false event proves that no defender remained at the impact hex, but the old subscriber always claimed movement. The replacement reports “no target remained at impact,” retaining exact source name and displayed hex without inventing enemy history. An actual event-subscriber regression fails on the original sentence and preserves successful hit/destruction copy and renderer calls; both focused cases pass (`diagnostics/fsg-cam-009/{red,green}.log`). No naval rules, charge, timing or rendering behavior changes. This run-scoped issue is distinct from the original plan's same-numbered focus test finding.

The authentic Omaha-Gold battle reached turn twenty-one with enemy-held objectives and ordinary active initiative, confirming no automatic turn-twenty result on the preceding production build. Both Western Naval Force missions resolved at the advertised initiative and consumed their two charges; neither retained a target at impact, so damage-on-target and AAR reconciliation remain unproved. A separate manual checkpoint, `UI UX audit Sep 6 — Omaha turn 21 after naval fire`, was saved successfully alongside the turn-one audit checkpoint and all thirteen pre-existing checkpoints. The separate primary campaign slot remains untouched. These checkpoints provide exact preceding-build resume and roster reproductions for the consolidated deployment.

The first clean release attempt at `944363f` passed professional UI **117/117**, then stopped after 81 campaign passes when the old neutral-intelligence fixture omitted its required `enemyContacts` collection. The resulting exception occurred before its assertions. The test-only correction supplies an empty collection in both fixture views; all assertions and production code remain unchanged. Its fourteen focused cases, scoped TypeScript and zero-warning lint pass (`diagnostics/campaign-status-fixture/`). The failed full attempt remains in `authenticated-release-results.json`; the complete repeat uses separate `authenticated-r2` evidence. Final independent review of `322baa6..944363f` returned conditional LOCAL UX/architecture/test-integrity PASS, pending the complete release commands and deployed acceptance.

At clean `f50d29d`, professional UI **117/117**, campaign **336/336**, campaign browser **26/26**, tactical geometry **6/6**, build and zero-warning lint passed. A Windows path-length error during artifact copying was recovered under `diagnostics/release-r2-tactical` before continuing on the identical clean commit. The unfiltered full suite then stopped after 583 passes: the new stacked-reporting fixture leaked its exact 8/2/1 committed deployment pool into the unchanged minimal air-arrivals fixture. The fix is confined to per-test setup and `finally` cleanup in the owning new fixture; every assertion and all production code remain unchanged. The ordered nine-case-to-arrivals sequence reproduces the original failure and now passes **10/10**, with nine individual isolation pairs also passing. Evidence is in `dist-tsc-check/fsg-stacked-reporting/isolation-{red,green}.log`. The failed `authenticated-r2` record remains intact; the final clean repeat uses `authenticated-r3` paths and shorter browser archive paths.

### Consolidated authenticated release verification

All six required commands plus the tactical geometry gate passed sequentially from clean, unchanged commit **`26477a8e881f9b41f8a6d5eeba902a1e8a6b173e`**, September 6, 00:46:50–00:54:24 EDT. Professional UI **117/117**, campaign **336/336**, campaign browser **26/26**, tactical browser **6/6**, production build with zero TypeScript errors and static-cycle verification PASS, lint with zero errors/warnings, and unfiltered full tests **729/729** with 729 matching pass lines and one exact completion summary. No filters, skipped cases or waived failures were used. The source and worktree remained unchanged through completion.

Exact commands, timestamps and results are retained in `diagnostics/campaign-audit-release/authenticated-r3-release-results.json`; complete browser artifacts are preserved separately in `diagnostics/r3-e2e/` and `diagnostics/r3-tactical-geometry/`. Prior failed attempts remain available. The integrated runtime, corrected neutral fixture and deployment-state isolation each received explicit independent LOCAL review PASS, with final release verification satisfying their local test conditions. Only this evidence ledger changes after the tested commit. Existing build advisories and broader live limitations recorded above remain applicable; all corrected deployed reproductions and the natural campaign journey still require live verification.

### Corrected production acceptance and remaining live findings

Release `99a3df14a050c461ed98b8cc8cd94ffc3e7d3ae9` is READY as `dpl_2hwXeASdFDvsFFhYRa5HoayX5xG7` on `fsg.sixsmithgames.com`. The external browser confirms CSS `/assets/index-Dr6fHPKx.css`. A fresh shared-team capacity check found two deployments in the preceding 24 hours and zero active; one push released the complete reviewed batch.

Live retests confirm the selected-contact Verify preview/draft and recovery focus, objective-priority consolidation/front ordering, Portland-to-Exeter route/ETA during transit, named arrival history, and explicit separation of formation arrival from truck return. Restoring the preceding-build turn-one audit checkpoint now reports all eleven deployed formations and sixty rounds of ammunition; moving one stack member preserves the eleven-formation count. Exact evidence remains in the run ledger.

The actual 200% Chrome retest exposed the limit of the tactical geometry fixture: all decisive buttons fit, but the real selected-unit card is only 39px high inside a 71px map and clips its statistics even when expanded. FSG-CAM-008 therefore remains open. The CSS owner is extending the regression with the real populated SelectionIntelOverlay and a usable scrollable short-window layout. A new run-scoped FSG-CAM-010 records that cold tactical resume displays a raw-coordinate battle title; its bounded display-only repair must preserve the stored mission title because mission-session identity includes that field. High-risk impact analysis precedes the edit, and independent review explicitly guards against accidental engine reset. No corrected local fixture result will close either live finding.

### Natural battle result and campaign continuation

The supported Omaha-Gold battle ended naturally on turn 35 when the 6th Engineer Special Brigade captured the fourth objective at 23,16. The player-facing End Mission action applied the result and saved this audit campaign's post-battle checkpoint. The AAR reports 118 friendly personnel lost, 232 confirmed enemy personnel lost, and charges of 110 supply, 87 fuel and 6 ammunition. Both Western Naval Force missions were expended. A separate saved replay branch proved an actual 13.65-damage naval impact after the first mission correctly reported that no target remained; FSG-CAM-009 is live-verified on `99a3df1`.

The audit preserved six named tactical checkpoints and all thirteen original checkpoints. Testing HQ Load revealed that it immediately loads the primary campaign rather than offering the post-battle recovery slot. It did not write the primary slot. Restoring the audit's own pre-result tactical checkpoint and repeating the final natural capture restored its exact post-battle stocks without changing the original saves. This replay does not constitute a same-revision duplicate-application test.

Two ordinary campaign advances reached D+1 09:00–12:00. Hold Normandy completed for 100 points and its 15,000-supply reward; the Portland-to-Exeter truck return completed; Western Naval Force visibly restored its two fire missions. The expected Caen-Orne defense did not appear at either 06:00 or 09:00. Source diagnosis confirms that Omaha's Player victory overrides initiative on unrelated rebuilt fronts, removing Caen from the ordinary counterattack scheduler. FSG-CAM-014 is a P1 release blocker; its fix must preserve unrelated identity, orientation and cadence and account safely for already affected checkpoints.

Three further run-scoped findings remain open: FSG-CAM-011, the post-battle report loses the authored Omaha sector name after front reconstruction and formation history exposes an internal engagement ID; FSG-CAM-012, the required Recover action opens a shattered formation with no recovery order; and FSG-CAM-013, the saved campaign post-battle checkpoint has no visible loader. Separate owners are implementing the bounded presentation/picker and domain repairs after recorded impact analysis. The current browser error/warning read is empty, but final deployed checks remain required. The campaign is not yet certified.

### Reviewed follow-up commits and interaction checks

Local `f0d5141` fixes populated tactical intel at short viewports and preserves native modified-Tab/dialog traversal; its strengthened browser contract passes **19/19**, with **9/9** existing component cases. Parent reviewed the actual 753×356 and 640×360 screenshots and the source/test boundary. `ed0672b` fixes display-only resumed mission titles, with **11/11** handoff cases and a mutation test that rejects any alteration of the stored session title. Both received independent LOCAL review PASS; exact deployed acceptance is still pending.

Behavior-neutral extractions remain separate commits: `aadc1cc` exposes the unchanged medical/equipment pool transitions, verified by **2,376** exact tactical-wrapper comparisons; `bdf95d0` shares the existing friendly supply graph, preserving retreat/isolation policy, faction boundaries and read purity. No tactical combat or normalization rule changes accompany these extractions.

`1ed1256` corrects unrelated-front initiative and adds the verified-load repair. Its **15/15** focused cases include seven new regressions, existing control/playability cases and supply isolation. Original checkpoints generated by unmodified production `99a3df1` reproduce both an already-missed Caen window and an already-resolved counterattack. The actual old State load fails the new regression; current State load, save, fresh load and ordinary advance preserve all immutable reports and original stored records, apply one evidence-bound revision, open the precise overdue defense, and retain deduplication. Parent independently reviewed the conservative repair guards and returned LOCAL architecture/test-integrity PASS. Full gates and live verification remain required.

Live FSG-CAM-015 records AAR focus escaping to background controls/body and the hidden battle's global shortcut handler capturing headquarters keys. The UI repair adds one temporary report interaction boundary, preserves focus through acknowledgement, closes before destination navigation, and excludes hidden targets and inactive tactical controls. FSG-CAM-016 corrects the score wording: the existing evaluator reports the maximum still-achievable grade, which the UI had labeled as a forecast. Scoring remains unchanged.

The first new AAR/picker browser run returned **12/12**, but screenshot review rejected the picker result: inherited tactical columns truncated checkpoint labels and surface scrolling hid its title/close control. Those results are not final acceptance. The owner is correcting the picker-specific layout while the browser tests gain explicit text, clipping-ancestor, header, focus and hit-target checks. Review also caught late asynchronous load responses opening recovery UI after navigation; lifecycle guards and actual deferred-response tests are required before this package freezes.

Formation recovery domain is frozen and committed as 2c1dc29. Twelve focused recovery tests and 34 selected existing order, segment, logistics and consequence regressions pass, with isolated TypeScript and zero-warning lint. Parent independent architecture/test-integrity review is PASS: one State quote/draft authority, existing shared supply graph, exact identity and stock reservations, atomic commit/cancel, real segment treatment, permanent-loss conservation and checksummed save/resume. Two interruptions preserve workshop service across 1+2+5 segments; a time-only continuation costs zero, while remaining treatment has an explicit new charge. Captured, destroyed, relocated and externally changed formations retain their control-owned state. This is local evidence; actual deployed recovery remains pending.

Wegener independently returned LOCAL architecture/test-integrity PASS for the frozen historical-location, checkpoint-loader and recovery UI package. Its actual Screen tests pass20/20, including delayed backend load, recovery confirmation after exit, real access revocation and a zero-cost recovery continuation. The report matrix exposed another real800px containing-pane overflow: max-width alone does not constrain the implicit grid track. The first11/12 result and screenshot are retained; the same sole stylesheet owner is making the bounded track correction before release.


The recovery notification follow-up fab11da closes a missed integration branch: completion is labeled Formation recovery, categorized as logistics and routed to the exact order; an interruption retains its mandatory order stop. Actual State segment, next-report and day advances prove the retained alerts, save/load and deduplication. Fourteen recovery cases plus five existing advance cases pass19/19, with independent parent review PASS.

The final report/picker matrix passes12/12 across640x360,753x356 atDPR2.5,800x900,1280x720,1506x768 and1920x1080. It uses native keyboard traversal and checks actual formation text, every clipping ancestor, hit targets, acknowledgement rerenders, disclosure controls, exact invoker restoration and explicit checkpoint selection. The corrected CSS uses shrinkable report tracks and reflows formation rows according to the report pane's width. Parent independently reviewed the800report,640finalactions and753picker images and returns LOCAL UX/test-integrity PASS. Evidence: diagnostics/fsg-cam-015/browser-final-green-r2.log and its matching artifact directory. Earlier false-positive and failing candidates remain preserved.

The Screen/picker/recovery/legacy-report package is frozen with22/22 focused cases; the separate report/score package passes6/6 new and9/9 existing cases, with scoped TypeScript and zero-warning lint. FSG-CAM-017 replaces unbound historical contact coordinates with neutral report copy and retains the canonical current-assessment route. Its actual Screen regression creates the original alert through ordinary resolution, moves the current contact through a validated saved fixture, and proves the original alert/runtime/storage remain unchanged by rendering or navigation. No historical location is inferred from a mutable contact.

Fresh origin/main synchronization on September6 confirms production99a3df1 remains the remote head with no divergent commits. All source owners are frozen. The complete clean-commit R4 release sequence, exact deployment and deployed acceptance remain pending; these local results do not close the live findings.
