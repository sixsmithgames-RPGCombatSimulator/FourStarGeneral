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

The implementation has passed focused local checks. The complete release-command run is recorded below when finished. All deployed acceptance exercises remain OPEN; local proof is not live certification.

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

The player-safe location contract changes presentation only. Persistent formation IDs and offset navigation keys remain unchanged; coordinate conversion is used only for exact authored lookup. No `BattleScreen.ts`, `HexMapRenderer.ts`, coordinate-math implementation or `src/engine` changes were required.

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

## Risk controls

- Naval eligibility and commitment must use the same pure result; source identity survives reservations, cancellation, expenditure and resume.
- UI projections receive only player-authorized records. Geography labels never alter entity or save identity.
- Additive persisted domain changes require an idempotent content migration and fingerprint review.
- Local automated Playwright is required explicitly by the implementation plan; it is not evidence of deployed live acceptance.
- Existing build/test scripts share `dist-tsc`; workers use isolated output directories and final suites run sequentially.
- No tactical engine, BattleScreen or coordinate-math edits are planned. If necessary, record dedicated impact analysis before editing.

## Verification record

Focused local verification is complete: 20 browser checks passed in `diagnostics/campaign-audit-geometry/local-final-report.json`, and 48 naval/domain and existing persistence/result/consequence/AAR checks passed during domain review. The campaign integration run passed 305 selected cases before the last three producer checks were added; those three also passed their isolated interaction run. These focused counts are not a substitute for the unfiltered release commands.

The final six commands run sequentially from a clean worktree. Logs and the tested commit are retained in `diagnostics/campaign-audit-release/release-results.json`. The integration owner verifies the absolute `dist` and `dist-tsc` cleanup paths before invoking the existing scripts. Final results pending.

## Release certification

**Release verdict: FAIL / live certification OPEN.** No push or deployment has been performed. Section 7 explicitly separates implementation authorization from deployment authorization. The complete natural campaign journey, supported and unsupported engagement, actual 20+ turn tactical battle, natural AI defense, external-browser viewport evidence, live build fingerprint and console/request sweep remain required. Existing unit tests for no arbitrary campaign turn cap and AI response are not evidence of that full player journey.

Independent reviewers have binary veto authority. McClintock returned explicit **local UI/UX PASS** after re-viewing the corrected 1280×720 toolbar, checking direct campaign entry, and verifying the saved 20/20 browser report with no failures, skips or flaky results. The final architecture verdict and complete release commands remain pending. No local screenshot, entitlement fixture, headless browser test or successful build is described as deployed certification.
