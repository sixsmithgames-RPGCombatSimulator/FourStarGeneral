# Four Star General Campaign UI/UX Audit Resolution Plan

**Status:** Authoritative implementation and certification plan  
**Date:** 2026-08-29  
**Audit baseline:** `FSG-CAMPAIGN-20260829-172311` at production commit `16bc10e591bc52a9bcedde33e20f08b967e7bca3`  
**Scope:** The nine findings in the latest live campaign audit, including the public entry, campaign command interface, rules-to-UI consistency, responsive behavior, and release certification  
**Release verdict at baseline:** `FAIL`

This document is the release-blocking delta plan for the broader [Campaign Professionalization Plan](./CAMPAIGN_PROFESSIONAL_WWII_EXECUTION_PLAN_2026-08-29.md). That plan remains the architectural and historical foundation. This plan resolves the concrete defects found in the latest deployed build and defines the proof required before anyone may describe the campaign as a first-class professional WWII game.

Primary evidence:

- [Latest live issue ledger](../test-results/campaign-playtest/FSG-CAMPAIGN-20260829-172311/issue-log.md)
- `test-results/campaign-playtest/FSG-CAMPAIGN-20260829-172311/evidence/`
- [Campaign First-Class Interface Implementation Plan](./CAMPAIGN_FIRST_CLASS_INTERFACE_IMPLEMENTATION_PLAN.md)
- [Repository coding standards](../CODING_STANDARDS.md)

## 1. Required outcome

The campaign must present one coherent command experience from the public landing page through campaign resolution:

1. The player immediately understands that Four Star General includes a persistent Operation Overlord campaign and can enter it directly.
2. The command screen clearly separates headquarters workspaces from map layers.
3. Forces, intelligence, logistics, objectives, and locations present decision-ready information rather than data dumps.
4. The same rules-bearing state produces the same answer everywhere, especially for naval support, readiness, commitment, and availability.
5. Named places and operational sectors lead; grid references support precision without becoming the player's primary language.
6. The map, inspector, actions, order tray, and timeline remain readable and operable at every supported viewport.
7. Keyboard, focus, scrolling, save/resume, battle handoff, reports, and campaign continuation are proven in the deployed build.

The target is not merely the absence of obvious bugs. The interface must help the player form a plan, understand the consequence of an order, and trust the result.

## 2. Finding disposition

Audit identifiers below are qualified by run `FSG-CAMPAIGN-20260829-172311` because an older audit used the same short identifiers.

| Finding | Severity | Release disposition | Owning layer | Primary proof |
|---|---:|---|---|---|
| `FSG-CAM-001` Public entry presents a generic tactical product and uses OS emoji | Medium | Fix | `public/landing/index.html`, landing assets and static contract | Landing contract plus live screenshots at desktop and compact sizes |
| `FSG-CAM-002` Headquarters navigation and map layers expose duplicate `FOR`/`INT` labels and ambiguous selection | Medium | Fix | Campaign workspace rail, overlay controller, UI state, responsive CSS | State-transition component tests plus live keyboard/visual inspection |
| `FSG-CAM-003` Forces workspace is a location dump without useful discovery or readiness grouping | Medium | Fix | Player-safe force projection and Forces workspace UI | Projection tests, interaction tests, and live operational decision task |
| `FSG-CAM-004` Logistics reports zero naval support while a fleet reports support available | High | Fix first | Authoritative naval-support eligibility projection and all consumers | Cross-surface invariant tests, save/resume tests, and a live supported engagement |
| `FSG-CAM-005` Intelligence shows repetitive coordinate cards and an active read action when unread count is zero | Medium | Fix | Intelligence briefing projection and workspace UI | Projection/read-state tests and live briefing comprehension check |
| `FSG-CAM-006` Order tray overlaps the tactical-engagement action at 1506×768 | High | Fix before release | Campaign shell/inspector/tray layout | Automated bounding-box invariant and live screenshot at the exact failing viewport |
| `FSG-CAM-007` Raw coordinates are primary player-facing labels | Medium | Fix comprehensively | Shared player-safe location presentation | Resolver tests and cross-surface UI contract |
| `FSG-CAM-008` Compact inspector has a zero-height body, clipped content, and conflicting scroll owners | Medium | Fix before release | Responsive campaign layout and inspector behavior | Compact geometry/scroll tests and live 640×360 task completion |
| `FSG-CAM-009` Escape appeared not to return focus to Map list | Low | Revalidate before changing product | Browser test method and map-list focus contract | Correct keyboard sequence from an active list descendant; product fix only if it fails |

### Audit-method correction for `FSG-CAM-009`

Source inspection shows that `CampaignMapOverlayController.setListExpanded(false, true)` already restores focus to the list toggle. The audit automation pressed Escape on the trigger after refocusing it, rather than on an active descendant inside the open list. This finding remains open only for a correct reproduction. The team must not add speculative focus code or duplicate listeners. If the corrected test passes locally and live, close the finding as a test-method false positive and retain the focused regression test.

## 3. Architecture contracts

### 3.1 One authoritative support model

`economy.navalPower`, a displayed fleet, and an engagement entitlement must not independently answer “is naval support available?” Introduce one pure campaign-domain eligibility service that evaluates player-owned task forces, readiness, range, commitment, expenditure, and the target context. It returns a structured, player-safe view such as:

- ready task-force identities;
- available fire missions or support capacity;
- committed, expended, damaged, or out-of-range state;
- effective range and, where applicable, next availability;
- the exact support source authorized for a queued engagement.

The Logistics workspace, fleet inspector, engagement builder, precombat briefing, tactical asset, order commitment, AAR, and save/resume path must consume this authority. A scalar economy value may remain for a distinct economic purpose, but it may not be labeled or interpreted as the same support availability.

### 3.2 One player-facing location grammar

Add a shared presentation resolver that accepts authored campaign geography and returns:

- `primaryLabel`: known place, objective, approach, sector, base, or operational front;
- `secondaryGridReference`: exact grid coordinate for precision;
- `confidence/status`: only when intelligence uncertainty materially affects the decision.

Never invent a place name to conceal missing content. If no named place is authored, use the front or sector as the primary label and show the grid as subordinate detail. Apply this grammar to objectives, fronts, contacts, orders, reports, map list entries, AAR references, and inspector headings. Entity IDs and coordinate keys remain stable underneath; this is a presentation change, not a save-identity migration.

### 3.3 Workspace and map-layer state remain separate

The left rail is headquarters navigation. The controls over the map are map layers. Their visible labels, accessible names, and selected treatments must state those scopes explicitly.

- Use full labels at normal desktop widths: `Operational`, `Objectives`, `Forces`, `Intelligence`, and `Orders`.
- At constrained widths, use one labeled `Map layer` control rather than repeating unexplained abbreviations.
- Changing workspace may choose that workspace's sensible default map layer.
- Changing the layer afterward must not falsely alter the workspace selection.
- The rail, overlay control, SVG classes, and inspector context must agree with the stored UI state after every transition.

### 3.4 Decision-ready workspaces

The Forces and Intelligence workspaces require player-safe projections rather than direct rendering of raw arrays.

Forces defaults to active operations and groups commands by front or objective. Each group exposes named location, command count, strength/readiness summary, and material status. Search supports command, formation, and location names. Filters cover `All`, `Ready`, `Committed`, `In transit`, `Arriving`, and `Recovering`. A deliberate `Entire theater` view retains access to rear-area forces without making that full roster the default.

Intelligence defaults to a briefing: new or materially changed information grouped by active front, sector, threat, and priority. Zero unread reports produces a calm authored state and no active “mark read” action. Contacts are grouped by named sector and can be filtered by priority, currency, staleness, and uncertainty. Read history remains available in a collapsed secondary area. The projection must never reveal hidden engine truth.

### 3.5 One responsive layout owner

Campaign layout rules must have one source of truth. First separate duplicated campaign layout declarations from inline `index.html` rules into `src/ui/campaign/styles/campaign-command.css` without changing behavior. Commit and verify that extraction independently. Only then change geometry.

The corrected layout contract is:

- the shell's grid rows own header, command content, and order tray;
- the tray occupies its row and never overlays actionable inspector content;
- the inspector is a shrinkable grid item with `min-height: 0`;
- the inspector body is the only normal vertical scroll owner;
- the action footer remains within the inspector row and stays reachable;
- compact mode presents the inspector as a bounded sheet above the compact command controls;
- compact mode preserves a nonzero information body, a reachable action, one scroll owner, and an unclipped route back to the map;
- no fix is accepted merely because smaller text or a hidden label makes the collision disappear.

## 4. Implementation sequence

Each work package is a separately reviewable local commit. No work package is pushed or deployed alone. Refactoring and behavior changes are never combined in the same commit.

### Phase 0 — Freeze evidence and make tests honest

1. Preserve the audit ledger, screenshots, viewport measurements, build fingerprint, and reproduction routes.
2. Reproduce every finding locally against the audited commit or its current equivalent.
3. Add failing tests for confirmed defects at the lowest appropriate layer.
4. Re-run the `FSG-CAM-009` keyboard sequence correctly: open Map list, move focus into the panel, press Escape from the active descendant, and assert that the list closes and focus returns to the toggle.
5. Create a traceability table mapping each finding to one primary automated owner and one live acceptance exercise.

**Exit:** Eight confirmed defects have honest red tests; `FSG-CAM-009` is either confirmed by a valid reproduction or recorded as a false-positive audit method with its regression retained.

### Phase 1 — Restore rules-to-interface trust

Resolve `FSG-CAM-004` before presentation polish.

1. Add the pure naval-support eligibility service and tests.
2. Make engagement authorization and the player-safe availability view consume the same result.
3. Replace ambiguous Logistics copy with task-force/fire-mission status derived from that view.
4. Show the same readiness, range, and commitment state in the selected fleet inspector.
5. Carry the exact source identity through commitment, tactical handoff, AAR, expenditure/refund, save, and resume.
6. Test simultaneous reservations so support cannot be spent twice.

**Acceptance:** Logistics, fleet inspector, precombat briefing, tactical availability, AAR, and resumed campaign agree for ready, out-of-range, committed, expended, and restored cases.

### Phase 2 — Correct command language and information architecture

Resolve `FSG-CAM-002`, `FSG-CAM-003`, `FSG-CAM-005`, and `FSG-CAM-007` as four reviewable changes.

1. Clarify headquarters workspaces versus map layers and prove every state transition.
2. Add the shared location presentation resolver and migrate all primary player-facing labels.
3. Build the Forces operational projection, search, status filters, active-front default, and entire-theater disclosure.
4. Build the Intelligence briefing projection, calm zero-unread state, grouped contacts, useful filters, and collapsed history.
5. Verify that selection from a workspace or list focuses the exact same map entity and opens the same inspector context.

**Acceptance:** A new player can answer “where is it, what is there, what is ready, what changed, and what can I do?” without decoding an abbreviation, scrolling a theater-wide dump, or treating a coordinate as a place name.

### Phase 3 — Repair campaign shell geometry

Resolve `FSG-CAM-006` and `FSG-CAM-008` after content shapes stabilize.

1. Perform and verify the behavior-neutral CSS ownership extraction.
2. Correct desktop grid shrinkage, inspector minimum sizing, footer containment, and tray row behavior.
3. Implement the compact bounded-sheet layout with one vertical scroll owner.
4. Preserve semantic DOM order, focus order, target size, contrast, and reduced-motion behavior.
5. Add geometry assertions at every release viewport.

**Acceptance:** The selected location, its information, its primary action, pending orders, timeline, and advance control are reachable without overlap or clipping at 1920×1080, 1506×768, 1440×900, 1280×720, 800×900, and 640×360. At 1506×768 the intersection between the order tray and `Queue Tactical Engagement` is exactly zero. At 640×360 the open inspector body has positive height and one vertical scroll owner.

### Phase 4 — Replace the generic public entry

Resolve `FSG-CAM-001` independently from the command UI.

1. Rewrite title, metadata, hero, and first call to action around the Operation Overlord campaign.
2. Make `Enter Campaign` the primary route and present tactical battles as a secondary mode.
3. Replace OS emoji with owned project artwork or deliberately authored, source-controlled vector marks.
4. Preserve accessible text, correct heading order, keyboard operation, responsive composition, and a clear route to help.
5. Add a static landing contract so campaign identity cannot silently disappear in later marketing edits.

**Acceptance:** Before scrolling, the player can identify the game, the campaign, its WWII command role, and how to enter campaign mode. No emoji or native OS pictographs remain.

### Phase 5 — Integrated campaign certification

The previous audit found interface defects before completing the full natural campaign journey. Fixing the visible findings is necessary but not sufficient for a first-class claim.

1. Run the complete local suite and targeted browser regression.
2. Complete a fresh campaign journey: public entry, campaign start, map and workspaces, save/resume, order planning, supported engagement, tactical battle, AAR, return to campaign, report handling, and continued operation.
3. Prove a natural AI defense and at least one 20+ turn tactical battle without an arbitrary campaign turn cap.
4. Verify state parity before battle, in battle, in the AAR, after return, and after save/resume.
5. Check console errors, warnings, failed requests, broken assets, and deployed build fingerprint.
6. Record a new run ledger and screenshots. Every old finding receives `FIXED`, `NOT REPRODUCED — METHOD CORRECTED`, or remains release-blocking `OPEN`.

**Exit:** All first-class gates pass in the live deployed build. “Mostly fixed” is `FAIL`.

## 5. Nonredundant test architecture

One requirement has one primary automated owner. Higher-level tests prove wiring and experience, not the same implementation detail again.

| Requirement | Primary automated owner | Integration proof | Live proof |
|---|---|---|---|
| Naval support eligibility, range, reservation, expenditure | Domain unit tests for the eligibility service and campaign ledger | Engagement-context and save/resume tests | Queue and resolve one supported and one unsupported engagement |
| Workspace/layer state | UI-state and controller component tests | Campaign shell transition contract | Mouse and keyboard transitions in production |
| Force grouping/search/status | Pure projection tests | Workspace selection-to-map test | Find and inspect a ready and committed formation |
| Intelligence grouping/read state | Pure projection tests | Workspace rendering/read-action test | Review zero-unread and new-contact states |
| Location naming | Location resolver table tests | Cross-surface contract for objective, contact, order, report, and AAR | Confirm named location with subordinate grid reference |
| Tray/inspector geometry | Playwright bounding-box and scroll-owner assertions | Exact viewport workflow | External-browser screenshots and action completion |
| Landing identity | Static DOM/content/accessibility contract | Route test | Live desktop and compact inspection |
| Map-list focus | Focused controller interaction test | Shell keyboard test only if necessary | Escape from an active list descendant |

Rules for the suite:

- Do not duplicate domain truth in UI fixture constants.
- Do not use snapshots as the primary proof of behavior or visual quality.
- Do not certify CSS class presence when the requirement is geometry or usability.
- Do not test a private helper again in every consumer; test each consumer's contract with the authoritative output.
- Do not accept a browser test that dispatches keys to an element that would not own focus in real use.
- Every regression must fail against the audited behavior and pass only after the relevant correction.
- Remove or rewrite assertions that currently bless the defective wording, coordinate-first labels, repeated cards, or contradictory naval values.

Proposed automated contract identifiers begin at `FSG_CAM_051` to avoid colliding with existing campaign professional-UI tests. The live run-scoped issue IDs remain separate.

## 6. Verification commands and evidence

Run focused tests while implementing, then execute the complete release sequence from a clean worktree:

```powershell
npm run test:campaign:professional-ui
npm run test:campaign
npm run test:e2e -- tests/e2e/campaign-command-ui.spec.ts --project=chromium --workers=1
npm run build
npm run lint
npm test
```

Release verification requires zero TypeScript errors, zero ESLint warnings, and no unexplained console or request errors. A successful build is not visual certification.

Required evidence for each finding:

- exact reproduction or test route;
- before and after viewport/state;
- owning code and primary regression;
- expected versus observed behavior;
- live deployed screenshot or interaction note;
- final issue state and any limitation.

## 7. Commit, push, and Vercel deployment discipline

The Hobby-team deployment allowance is shared across projects: 100 deployments in a rolling 24-hour window, 100 per hour, 60 per five minutes, and one concurrent deployment. Every Git-triggered preview or production deployment counts.

Therefore:

1. Make local commits by work package for reviewability and rollback.
2. Do not push after each phase.
3. Rebase or update from `origin/main` once before final certification and rerun affected checks.
4. Confirm no unrelated local changes, no concurrent deployment, and sufficient shared-team allowance.
5. Push one fully certified release candidate to `main`, producing one intended production deployment.
6. Wait for that deployment to finish before opening the external-browser certification run.
7. Do not create empty commits or retry pushes to force a deploy.
8. A second push is permitted only for a newly discovered live release blocker, after the fix and full local certification are complete and quota has been checked again.

This plan itself does not authorize a deployment. Implementation and live certification are separate execution work.

## 8. Risks and required controls

| Risk | Control |
|---|---|
| UI-only naval fix conceals a rules contradiction | One eligibility service feeds rules and every presentation consumer |
| Support can be reserved or spent twice | Ledger-level atomic reservation tests and save/resume proof |
| Intelligence grouping leaks hidden enemy state | Player-safe projection built only from discovered/authorized intelligence |
| Force filters hide formations and create apparent loss | Always retain an explicit entire-theater view and exact search |
| Location polish invents false geography | Authored names only; subordinate grid fallback when unknown |
| CSS cleanup changes behavior while moving rules | Behavior-neutral extraction commit and visual parity check before geometry work |
| Desktop fix breaks compact mode or vice versa | Shared geometry matrix and exact viewport assertions |
| New content breaks old saves | Preserve entity IDs; if any rules/schema meaning changes, bump the proper fingerprint and add an idempotent migration |
| High-risk battle code changes accidentally expand scope | If `BattleScreen.ts`, `HexMapRenderer.ts`, coordinate math, or `src/engine` must change, add a dedicated impact analysis, replay test, and manual checklist before editing |
| Automated checks pass while experience remains confusing | Independent UI/UX live evaluation retains binary veto authority |

## 9. Definition of done

The campaign may be called first-class only when all of the following are true:

- All eight confirmed findings are closed and live-verified.
- `FSG-CAM-009` is either correctly reproduced and fixed or closed with documented test-method correction.
- The public entry is campaign-led, period-appropriate, accessible, and free of emoji.
- Headquarters workspaces and map layers are unmistakably separate.
- Forces and Intelligence support real decisions without dumps, repetition, or contradictory state.
- Naval support agrees across Logistics, fleet inspection, engagement authorization, tactical use, AAR, and resume.
- Player-facing locations use authored names with subordinate grid references.
- No action, inspector body, order, timeline, or navigation control overlaps or clips at any release viewport.
- A player can complete the full campaign-to-battle-to-campaign loop, including save/resume and natural AI response.
- Campaign mode has no arbitrary turn limit, and long tactical battles remain playable.
- The nonredundant automated suite, full build, lint, and tests pass from a clean worktree.
- A single intended production deployment is certified through the connected external browser with a clean console and request sweep.
- The independent UI/UX evaluator and test-architecture evaluator both return explicit `PASS` verdicts.

Until every clause is evidenced, the release verdict remains `FAIL`.
