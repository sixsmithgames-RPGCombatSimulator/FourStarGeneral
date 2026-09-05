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

Every finding starts OPEN. Local proof is not live certification.

| Finding | Primary automated owner | Local acceptance | Live exercise | Status |
|---|---|---|---|---|
| 001 public entry | LandingCampaignIdentity.contract.test.ts / FSG_CAM_080–083 | static identity, semantic DOM, campaign route | desktop and compact entry screenshots | OPEN |
| 002 scope/state | CampaignNavigationScope.test.ts / FSG_CAM_060–061 | workspace/layer transitions and visible scoped names | Forces workspace → Intelligence layer → workspace navigation | OPEN |
| 003 Forces | CampaignWorkspaceProjection.test.ts / FSG_CAM_068–071 | grouping, search, status; selection wiring in discovery test | find ready and committed formations | OPEN |
| 004 naval | CampaignNavalSupport.test.ts / FSG_CAM_051–059 | eligibility, ledger, exact source, tactical result and persistence | supported/unsupported engagement, save/resume, AAR | OPEN |
| 005 Intelligence | CampaignWorkspaceProjection.test.ts / FSG_CAM_072–075 | grouped safe briefing, filters, explicit read; rendering wiring | zero-unread state and changed-contact briefing | OPEN |
| 006 overlap | e2e/campaign-command-ui.spec.ts / FSG_CAM_076–079 | exact rectangle intersection zero at 1506×768 | queue tactical engagement with tray visible | OPEN |
| 007 locations | CampaignLocationPresentation.test.ts / FSG_CAM_063–067 | authored labels, subordinate grid, identity preservation | objectives/contact/order/report/AAR labels | OPEN |
| 008 compact | e2e/campaign-command-ui.spec.ts / FSG_CAM_076–079 | positive inspector body and one scroll owner at 640×360 | inspect, act, return to map | OPEN |
| 009 focus | CampaignNavigationScope.test.ts / FSG_CAM_062 | Escape dispatched from focused list descendant | actual keyboard sequence in live browser | OPEN — method correction pending |

## Risk controls

- Naval eligibility and commitment must use the same pure result; source identity survives reservations, cancellation, expenditure and resume.
- UI projections receive only player-authorized records. Geography labels never alter entity or save identity.
- Additive persisted domain changes require an idempotent content migration and fingerprint review.
- Local automated Playwright is required explicitly by the implementation plan; it is not evidence of deployed live acceptance.
- Existing build/test scripts share `dist-tsc`; workers use isolated output directories and final suites run sequentially.
- No tactical engine, BattleScreen or coordinate-math edits are planned. If necessary, record dedicated impact analysis before editing.

## Verification record

Pending implementation. Record exact commands/results, baseline red evidence, final file/commit ownership, and limitations here before completion.

## Release certification

Not deployed. The plan explicitly separates implementation authorization from deployment authorization. Local work will be completed and made reviewable before any release approval request. The complete natural campaign journey, external-browser viewport evidence, live fingerprint/console/request sweep and independent live UI/UX verdict remain required before the release can be called PASS.
