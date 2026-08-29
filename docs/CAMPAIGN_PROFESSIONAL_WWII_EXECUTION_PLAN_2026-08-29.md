# Four Star General Campaign Professionalization Plan

**Status:** Authoritative corrective execution plan  
**Date:** 2026-08-29  
**Scope:** All findings FSG-CAM-001 through FSG-CAM-045 in the 2026-08-28 campaign playtest ledger  
**Product target:** A professional, historically grounded, first-class WWII operational campaign—not a dressed-up prototype or a modern dashboard over a map.

This document is the corrective delivery plan for the existing Campaign 2.0 and first-class interface plans. It does not discard their sound architecture. It reopens any milestone whose previous completion claim is contradicted by the live audit, especially map literacy, inspector behavior, formation identity, persistence, and cohesive campaign play.

Primary inputs:

- [`CAMPAIGN_2_0_FIRST_CLASS_GAME_PLAN.md`](./CAMPAIGN_2_0_FIRST_CLASS_GAME_PLAN.md)
- [`CAMPAIGN_FIRST_CLASS_INTERFACE_IMPLEMENTATION_PLAN.md`](./CAMPAIGN_FIRST_CLASS_INTERFACE_IMPLEMENTATION_PLAN.md)
- [`CAMPAIGN_CLASS_A_PLUS_GAP_REVIEW.md`](./CAMPAIGN_CLASS_A_PLUS_GAP_REVIEW.md)
- [`FSG-CAMPAIGN-20260828-081217/issue-log.md`](../test-results/campaign-playtest/FSG-CAMPAIGN-20260828-081217/issue-log.md)

## 1. Current verdict

The campaign is **not yet first-class**.

The independent UI/UX review is a release-blocking `FAIL`. The test review found substantial coverage—221 campaign tests across 33 imported files—but also found tests that certify broken presentation and data assumptions. The historical/data review found that formation identity is partly derived from mutable scenario position and ordinal data, while the scenario content hash does not distinguish rules changes from presentation changes. Moving sites, splitting bases, or rewriting the order of battle before resolving those constraints would risk save corruption and unstable formation identity.

The remediation must therefore proceed in this order:

1. Freeze compatibility and assign one nonredundant test owner to every requirement.
2. Establish authoritative geography, identity, capacity, posture, and action contracts.
3. Migrate existing content and saves safely.
4. Rebuild the campaign map and inspector on those contracts.
5. Correct tactical battle, persistence, recovery, and campaign-loop defects.
6. Certify the complete natural campaign journey locally and on the live deployment.

## 2. Product contract

The following are nonnegotiable release requirements.

### Historical command experience

- The player is addressed and informed as a WWII theater commander, not as a content author or modern business-dashboard user.
- Place names, commands, formations, equipment, sites, initial positions, availability, and known enemy installations are source-backed for the represented date.
- Exact historical formations use dated identities and parent commands. Deliberate strength abstractions are labeled as abstractions under a real command; they are not given fabricated route-, beach-, base-, type-, or ordinal-derived names.
- The English staging system, ports, airfields, depots, fleets, airborne positions, beach lodgments, known German defenses, roads, railways, rivers, towns, and operational objectives reflect the full Normandy theater represented by the map.
- The background image is geographic evidence, not decoration. Markers and hex data must agree with its coastline, land/water, settlements, and transport contours.
- `scenario.hexScaleKm` is canonical. The current campaign is planned and validated at **10 km per operational hex** unless a separately reviewed source/calibration change proves otherwise.
- Beachheads receive troops and materiel; they are not treated as manufacturing centers. Production and theater support originate in appropriate Allied staging abstractions, principally Britain, with U.S. support represented at theater level where the map does not include North America.

### Campaign and battle rules

- Campaign mode has no arbitrary turn limit. Completion comes from campaign objectives, defeat conditions, or player choice.
- Tactical battles must naturally support 20+ turns. They end because battlefield conditions or objectives are resolved, not because a short hard cap expires.
- The player can understand the operational chain: inspect → decide → issue order → review commitment → resolve → receive report → respond to consequences.
- The strategic AI must mount a natural defense and react through the same rules-bearing campaign model rather than scripted presentation shortcuts.

### Interface grammar

- One entity has one visual owner, one hit target, one accessible name, one selection state, and one primary inspector route.
- The map remains the largest and most legible region. Empty command UI does not permanently consume play space.
- Every selected hex answers, in this order: **where is this, what is here, what is known, and what can I do?**
- Hover is supplemental. Everything needed to play is also available by focus, click/tap, the inspector, or the map list.
- Use owned period-appropriate sprites and vector UI artwork. No emoji, OS pictographs, native browser gameplay tooltips, neon selection slabs, or authoring-language labels.
- The same formation, posture, count, blocker, and place identity must agree across map, inspector, planner, order tray, timeline, report, AAR, tactical handoff, save, and resume.

## 3. Authority and ownership

No implementation work package may certify itself.

| Role | Responsibility | Required release statement |
|---|---|---|
| Main integrator | Own dependency order, implementation boundaries, issue ledger, and release decision | Every issue has an owner, primary test, evidence, and closed/live-verified state |
| UI/UX evaluator | Independently inspect behavior, hierarchy, visual grammar, responsiveness, keyboard operation, and clarity | Binary `PASS` or `FAIL`, with any failure linked to a visible state and acceptance clause |
| Test architecture evaluator | Ensure one primary automated owner per rule and reject redundant or misleading assertions | `PASS: no conflicting, tautological, or unnecessarily duplicated coverage` |
| Historical/data reviewer | Approve source matrix, geography registration, OOB identity, abstraction boundary, and dated posture | `PASS` with source/confidence coverage and every deliberate abstraction named |
| Save/migration reviewer | Verify old-save conversion, idempotence, rules hashes, and fail-closed behavior | `PASS` for all certified save generations and fixtures |
| Live browser driver | Exercise the deployed production build through the external-browser extension only | Full live gate ledger with screenshots, build fingerprint, console/request sweep, and binary verdict |

The UI/UX evaluator and test architecture evaluator report to the main integrator after every work package. Their verdicts are evidence, not advisory prose.

## 4. Architecture decisions

### 4.1 Strategic geography

Add immutable, source-backed records for:

- `CampaignHexGeography`: locality, land/water, terrain, coastline, road, railway, river/crossing, port, airfield, and sources.
- `CampaignStrategicSiteDefinition`: stable site key, authoritative cell, role, local facilities, sources, confidence, rules contribution, and permitted terrain.
- `CampaignTheaterRegionDefinition`: broad context that has no map marker, control, capacity, placement, movement origin, or orders.

Authoring validation must reject water/land mismatches, duplicate interactive claims on one cell, remote facilities bundled as one 10 km site, missing source anchors, and site/background disagreements. Retire `historicalNetwork` once adapter parity is proven.

### 4.2 Formation and capacity model

- A persistent formation is a real command that can move, fight, recover, receive orders, and accumulate history.
- Port throughput, embarkation lift, supply columns, replacement flow, transport pools, and reinforcement schedules are capacity/reservation records unless a sourced military formation truly exists.
- A dated D+1 OOB catalog owns stable `identityKey`, period name, parent, echelon, type, posture, availability, sources, confidence, and abstraction status.
- One central identity resolver supplies all player-facing formation presentation. Stored legacy names remain migration data, not rendering authority.

### 4.3 Posture, action, and selection projections

One domain projection owns these mutually exclusive formation states:

- Scheduled
- Ready and orderable
- Assigned
- Committed
- In transit
- Arriving
- Recovering/unavailable: isolated, refitting, shattered, reorganizing
- Retired: destroyed or captured

It also owns `presentAtHex`, `canReceiveOrders`, readiness counts, one blocker code, concise explanation, availability time, and corrective step. Map, inspector, planner, and combat eligibility render this projection without reinterpretation.

`CampaignCommandUIState` owns typed selection and reapplies it after every map reconstruction: selected entity/hex, movement origin, selected front/target, previews, map-list state, inspector route, and accessibility state.

### 4.4 Save and content compatibility

- Freeze representative pristine, progressed, active-order, in-transit, refitting, active-battle, and post-battle saves before content changes.
- Add `rulesContentHash` for topology, sites, control, capacities, objectives, OOB identities, and availability.
- Add `presentationContentVersion` for names, summaries, citations, sprites, and display hierarchy.
- Use an explicit migration registry keyed by scenario and old/new rules hash. Unknown or ambiguous rules states fail closed with a recoverable compatible-build message.
- Add `identityKey` without changing stable formation IDs. Legacy identity resolution uses the complete origin tuple and must reject ambiguous matches.
- If typed selection replaces the current string-only save field, migrate it in a versioned envelope.

## 5. Target campaign UI/UX

### Map grammar by scale

| Scale | Resting state | Hover/focus | Selected state |
|---|---|---|---|
| Theater | Recognizable 18–24 px installation silhouette; collision-safe clusters only when needed; no permanent roster labels | Historical name and one honest status/count line in a bounded screen-space card | One thin brass angular locator; no cyan tile fill or enlarged duplicate |
| Normal | Installation centered in its authoritative hex; subordinate strength cue remains inside the marker | Marker grows no more than 10%; up to three command summaries may fan into the clearest adjacent quadrant | Same screen-space locator; inspector opens |
| Close | Installation remains within 68% of the host hex; unit strength sprites stay within a safe inset | Named parent commands and exact status counts may expand without covering neighboring centers | No new selection vocabulary, thickened grid, duplicate ring, or tile recolor |

At every supported scale, visible marker art has an 18 px floor. Desktop hit targets are at least 36 CSS px; compact/touch targets are at least 44 CSS px. A target may not capture an adjacent hex or overlap another marker center. Selection and focus are distinct and do not rely on color alone.

### Inspector grammar

```text
Fixed header
  Base/place or formation name
  Back to parent when drilled down

Scrollable body
  Place and strategic geography
  Installation: purpose, condition, contribution
  Formations and assessed contacts
    Ready
    Committed
    In transit
    Arriving
    Recovering / unavailable
  Advanced detail: genuinely local facilities, history, provenance

Fixed Orders footer
  One legal action
  or one state-owned blocker, availability time, and corrective step
```

Only the body scrolls. Selecting a new entity starts it at the top. Formation drill-down preserves the base route, order context, and a fixed `Back to [base]` control. On compact layouts and at 200% zoom, the inspector becomes one dismissible sheet with a sticky header and footer.

### Disclosure and accessibility grammar

- Interactive campaign markers have an `aria-label` and no competing SVG `<title>`.
- One custom disclosure appears within 200 ms, remains inside the viewport, and contains only place/site identity plus one player-safe assessment.
- Detailed sources live behind a deliberate provenance action.
- Tab reaches visible markers and the map list; focus reveals the same concise disclosure; Enter/Space selects; Escape closes only the topmost transient surface and restores focus.
- Reduced-motion behavior, keyboard paths, and 200% zoom are release gates.

## 6. Delivery program

Behavior changes and structural refactors are separate commits. Each phase starts with a failing owner test, updates the issue log before product edits, and ends with independent UI/UX and test-architecture verdicts.

### Phase 0 — Freeze, trace, and correct the test contract

**Goal:** Make subsequent changes safe and measurable without duplicating the suite.

Deliverables:

1. Freeze scenario fingerprints and representative save/replay fixtures.
2. Add a traceability registry: requirement → issue → work package → primary automated owner → optional integration proof → live proof.
3. Create shared fixtures: `mixed-status-base`, `legacy-location-alias-save`, `complex-strategic-hex`, `three-zoom-base`, `rules-fingerprint-opening`, and `site-registration-matrix`.
4. Split tests that currently certify wrong assumptions:
   - replace formula-only theater marker checks with screen-pixel geometry contracts;
   - stop deriving `ready` from authored force counts;
   - split the monolithic shipped-theater test into geography, OOB, economy, and intelligence contracts;
   - replace sampled label checks with a complete OOB manifest validator;
   - stop converting every aggregate count into a persistent formation;
   - remove custom-disclosure instructions and gameplay `<title>` expectations.
5. Keep the compiled deterministic campaign harness as the domain/replay runner, document it as an explicit standards exception, tag its entry points, and compile it once per CI job. Do not clone its assertions into Vitest.
6. Add Playwright only for browser composition and visual contracts, not domain permutations.

Exit gates:

- Every FSG-CAM issue has exactly one primary automated owner.
- No old test requires the UI/data behavior the report rejects.
- Frozen fixtures round-trip through the current loader before migrations begin.
- Test evaluator issues a nonredundancy `PASS`.

### Phase 1 — Establish historical and domain truth

**Goal:** Build the authoritative data layer on which the map and campaign rules depend.

Deliverables:

1. Implement separate rules and presentation fingerprints plus the migration registry.
2. Add strategic geography/site/region schemas, validators, registration evidence, and background/10 km calibration.
3. Build the sourced D+1 OOB catalog and formation identity resolver.
4. Separate support capacity, reservations, and arrival schedules from persistent formations.
5. Implement authoritative posture/readiness and action/blocker projections.
6. Migrate legacy aliases, capacity records, saved identities, and typed selection without changing stable IDs or progress.
7. Replace the German 105 mm battery’s incorrect U.S. artwork with a directional, transparent, faction-correct sprite.

Issues owned: **FSG-CAM-002, FSG-CAM-004, FSG-CAM-018, FSG-CAM-035, FSG-CAM-039, FSG-CAM-040, FSG-CAM-041, FSG-CAM-042, FSG-CAM-044, FSG-CAM-045**.

Exit gates:

- Every selectable formation passes the dated OOB manifest; fabricated names fail the build.
- Every interactive site has credible registration evidence and legal land/water placement.
- No capacity record appears in selection, formation history, battle commitment, or formation counts.
- Identity, posture, readiness, and blockers agree across all projections.
- Certified old saves migrate idempotently; ambiguous/unknown rules saves fail closed.
- Presentation copy or sprite changes do not change `rulesContentHash`; site, capacity, or OOB rules changes do.

### Phase 2 — Rebuild the map and inspector as one command surface

**Goal:** Make the full theater readable, uncluttered, and immediately actionable.

Deliverables:

1. Replace triple-owned base rendering with one installation marker that owns identity, hit target, hover/focus, and selection.
2. Present stationed forces as subordinate strength cues and bounded progressive disclosure, not competing entities.
3. Replace whole-hex cyan selection and nested circles with one screen-space brass locator.
4. Implement geometry floors, safe insets, collision handling, truthful clustering, and map-list parity.
5. Remove native gameplay tooltips and build one viewport-clamped disclosure.
6. Reapply selection/origin/front/preview state after every scenario, intelligence, time, layer, and movement rerender.
7. Rebuild the inspector with geography-first hierarchy, honest formation groups, stable drill-down route, and fixed Orders footer.
8. Keep the idle command strip at roughly 56 px and move details into deliberate drawers.

Issues owned: **FSG-CAM-001, FSG-CAM-003, FSG-CAM-005, FSG-CAM-034, FSG-CAM-036, FSG-CAM-037, FSG-CAM-038, FSG-CAM-039, FSG-CAM-041, FSG-CAM-042, FSG-CAM-043, FSG-CAM-044**.

Exit gates:

- One base produces exactly one interactive node at theater, normal, and close zoom.
- Every selected complex hex explains place, geography, site, occupants/contacts, and actions.
- Counts and posture labels match the authoritative roster at the same campaign revision.
- Base → formation → order → back preserves route, focus, selection, and order context.
- Independent UI/UX evaluator returns `PASS` at 1440×900, 1280×720, 800×900, 640×360, and 200%-equivalent layout.

### Phase 3 — Make persistence and consequence handling trustworthy

**Goal:** Save, load, resume, reports, recovery, and captured state must preserve the exact campaign and battle truth.

Deliverables:

1. Enable clear tactical Save/Load behavior from Turn 1 and restore active initiative controls.
2. Preserve campaign/battle identity, turn, selected formation, camera timing, deployment state, and activity-log state on cold resume.
3. Make objective ownership persist after capture and vacancy, including save/load.
4. Route AAR actions to the correct named site/hex without exposing internal coordinates as primary identity.
5. Distinguish structural reconstruction from temporary intact-capture reorganization; explain condition, capacity, cause, and automatic return visibly.
6. Ensure cross-surface identity equality after every supported save migration.

Issues owned: **FSG-CAM-006, FSG-CAM-007, FSG-CAM-009, FSG-CAM-010, FSG-CAM-020, FSG-CAM-021, FSG-CAM-022, FSG-CAM-026, FSG-CAM-045**.

Exit gates:

- Fresh and migrated saves preserve stable IDs, active orders, reservations, history, initiative, objective control, and selection.
- Save-at-segment-N/load/continue matches uninterrupted deterministic replay hashes.
- Intact disruption never creates a false reconstruction decision.
- Cold resume reaches the same campaign and battle identity with no stale or empty UI column.

### Phase 4 — Bring tactical battles to professional quality

**Goal:** Make a 20+ turn battle readable, deterministic, responsive, and free of UI/rules contradictions.

Deliverables:

1. Replace OS pictographs with owned vector persistence/interface icons.
2. Show only destinations the authoritative movement engine accepts.
3. Replace placeholder objectives with authored field orders, exact markers, accurate status, and pointer-transparent decoration.
4. Refresh initiative and objective control immediately after authoritative state changes.
5. Make visual effects fail safely; an animation failure cannot block attack resolution.
6. Drive playback from elapsed time, skip stale frames after throttling, and release authoritative combat promptly.
7. Gate auto-deploy, sidebar, and Begin Mission from the settled authoritative deployment snapshot with one DOM owner per control.
8. Keep the formation heading and accessible name synchronized on every selection.

Issues owned: **FSG-CAM-008, FSG-CAM-011, FSG-CAM-012, FSG-CAM-013, FSG-CAM-014, FSG-CAM-015, FSG-CAM-016, FSG-CAM-017, FSG-CAM-019, FSG-CAM-023, FSG-CAM-027, FSG-CAM-032, FSG-CAM-033**.

Exit gates:

- A deterministic 20+ turn battle completes with no stale phase, objective, heading, deployment, or control state.
- Legal destinations, markers, pointer behavior, and order commitment agree with the engine.
- Background-tab/throttled playback cannot stretch sub-second resolution into a gameplay stall.
- Zero unresolved attacks after effect failures.

### Phase 5 — Complete the campaign loop and command presentation

**Goal:** Prove that the campaign can be played naturally from D+1 opening through attack, defense, recovery, save/resume, and outcome.

Deliverables:

1. Make stated hold and force-collapse objectives complete from authoritative battlefield state; support convoys cannot keep a destroyed combat force alive.
2. Make AAR formation summaries concise, sourced, and focused on material changes, with unchanged exact rows behind an honest disclosure.
3. Stop the reserve roster from interrupting every turn; keep availability visible passively.
4. Treat `End Mission` as the result confirmation and avoid a second modal confirmation.
5. Derive attack and defense availability from exact battle-ready persistent formations and current physical/posture truth.
6. Recompute stale precombat truth after battles; distinguish unavailable attackers from defenders that must participate when attacked.

Issues owned: **FSG-CAM-024, FSG-CAM-025, FSG-CAM-028, FSG-CAM-029, FSG-CAM-030, FSG-CAM-031**.

Exit gates:

- The player can initiate a genuine campaign attack with the formations the UI advertises.
- The AI can mount a natural strategic defense and the battle can reach both stated objective types.
- Recovery changes future availability and is honestly visible.
- A campaign outcome occurs from rules and objectives, not from a test shortcut or arbitrary turn limit.

### Phase 6 — Cohesion, accessibility, performance, and production certification

**Goal:** Verify the whole experience as one game, not a collection of individually passing screens.

Deliverables:

1. Run visual and interaction matrices across all supported viewports, theater/normal/close zoom, keyboard, focus, reduced motion, and 200% zoom.
2. Verify map/list/inspector parity, stable focus return, disclosure clamping, no collision capture, and one topmost transient surface.
3. Run the complete local regression stack and deterministic campaign replay.
4. Make one capacity-checked batched push to `main`; wait for the single Vercel production deployment to become Ready.
5. Run the full campaign-validation skill on the live deployed site with one external-browser extension driver and no Computer Use, state injection, or substitute browser.
6. Perform a final UI/UX evaluator review and test-architecture nonredundancy review against the production build.

Exit gates:

- All FSG-CAM-001 through FSG-CAM-045 are `Closed / live verified` with before/after evidence.
- No console errors, unhandled requests, hidden compatibility guidance, browser-native gameplay UI, stale identity, or inaccessible blocker remains.
- Full natural journey passes: opening comprehension → first order → report/time → player attack → strategic AI defense → consequence/recovery → save/resume → natural outcome.
- UI/UX evaluator: `PASS`.
- Test architecture evaluator: `PASS: no conflicting or redundant coverage`.
- Live campaign skill: `PASS` on the production build fingerprint.

## 7. Complete issue-to-work-package matrix

| Issue | Work package | Primary proof owner |
|---|---|---|
| FSG-CAM-001 Base hover/inspector overload | P2 Map/inspector | Inspector composition + visual matrix |
| FSG-CAM-002 Ahistorical generated labels | P1 Identity/OOB | Full OOB manifest validator |
| FSG-CAM-003 Empty order tray consumes map | P2 Command surface | Responsive layout/component test |
| FSG-CAM-004 Authoring language in map list | P1 Presentation contract | Period-language content validator |
| FSG-CAM-005 Protruding Orders trigger | P2 Command surface | Geometry/layout contract |
| FSG-CAM-006 Turn 1 Save/Load disabled | P3 Persistence | Tactical save integration |
| FSG-CAM-007 Resume omits initiative controls | P3 Persistence | Resume state/UI integration |
| FSG-CAM-008 OS pictographs | P4 Tactical UI | Visual regression/accessibility |
| FSG-CAM-009 Resume changes campaign identity | P3 Migration | Cold-resume fixture |
| FSG-CAM-010 Resume camera/log timing | P3 Persistence | Local browser resume journey |
| FSG-CAM-011 UI highlights illegal movement | P4 Tactical rules UI | Movement engine/UI agreement |
| FSG-CAM-012 Placeholder objectives | P4 Objective contract | Shipped-content validator |
| FSG-CAM-013 Focus has no objective marker | P4 Objective UI | Marker DOM/geometry test |
| FSG-CAM-014 Marker blocks its own hex | P4 Objective UI | Pointer-event integration |
| FSG-CAM-015 Stale new-turn phase | P4 Tactical state | Initiative state projection test |
| FSG-CAM-016 Capture stays neutral | P4 Tactical state | Objective ownership test |
| FSG-CAM-017 Effect failure blocks combat | P4 Combat resilience | Fault-injected deterministic test |
| FSG-CAM-018 Wrong artillery art | P1 Historical art | Asset manifest + visual approval |
| FSG-CAM-019 Throttled effect stalls combat | P4 Playback | Fake-clock/background-throttle test |
| FSG-CAM-020 AAR exposes/wrongly routes hex | P3 AAR/persistence | Entity routing integration |
| FSG-CAM-021 Intact capture becomes repair | P3 Recovery | Recovery domain contract |
| FSG-CAM-022 Recovery hidden from player | P3 Recovery UI | Inspector/report DOM test |
| FSG-CAM-023 Premature auto-deploy | P4 Deployment | Deployment state/action test |
| FSG-CAM-024 Hold objective cannot complete | P5 Campaign outcome | Natural deterministic campaign case |
| FSG-CAM-025 Repeated AAR labels | P5 AAR presentation | AAR hierarchy/component test |
| FSG-CAM-026 Vacated objective forgets owner | P3 Persistence | Capture/vacate/save test |
| FSG-CAM-027 Stale formation heading | P4 Tactical UI | Selection/accessibility test |
| FSG-CAM-028 Reserve roster interrupts turns | P5 Campaign command | Event/visibility integration |
| FSG-CAM-029 Double exit confirmation | P5 Mission flow | Result-to-HQ browser journey |
| FSG-CAM-030 Advertised units cannot attack | P5 Combat eligibility | Formation eligibility contract |
| FSG-CAM-031 Defender counts block legal attack | P5 Precombat truth | Post-battle recomputation test |
| FSG-CAM-032 Sidebar toggle cancels itself | P4 Deployment UI | Single-owner click/keyboard test |
| FSG-CAM-033 Begin Mission remains disabled | P4 Deployment UI | Settled snapshot integration |
| FSG-CAM-034 Triple-owned selected base | P2 Map geometry | Three-zoom marker contract |
| FSG-CAM-035 Route aliases as formations | P1 Identity/OOB | Complete formation manifest |
| FSG-CAM-036 Dual/native site tooltip | P2 Disclosure | Renderer DOM + clamped visual |
| FSG-CAM-037 Tiny theater targets | P2 Map geometry | Screen-pixel bounds JSON |
| FSG-CAM-038 Selection lost on rerender | P2 UI state | Selection persistence test |
| FSG-CAM-039 No strategic geography | P1/P2 Geography | Hex projection + inspector order |
| FSG-CAM-040 Remote sites in one 10 km cell | P1 Geography | Site registration matrix |
| FSG-CAM-041 Presence called readiness | P1/P2 Posture | Mixed-status projection fixture |
| FSG-CAM-042 Recovery called transit | P1/P2 Posture | Exclusive status table test |
| FSG-CAM-043 Drill-down abandons Orders | P2 Inspector | Base → formation → order journey |
| FSG-CAM-044 Repair blocker disappears | P1/P2 Action projection | Blocker state/component test |
| FSG-CAM-045 Names diverge after save | P1/P3 Identity migration | Cross-surface legacy save test |

## 8. Nonredundant testing architecture

Each requirement has one primary owner at the lowest trustworthy layer and at most one composition proof where wiring can fail.

| Layer | Owns | Does not own |
|---|---|---|
| Pure domain/state | Geography, OOB identity, capacity separation, posture groups, blockers, content fingerprints | CSS, layout, screenshots |
| DOM/component | Semantic structure, ARIA, route/back behavior, selected-state restoration, fixed Orders, blocker visibility | Rebuilding game rules in UI assertions |
| Geometry contract | Screen-pixel bounds, hit targets, anchor centering, collision and disclosure clamping | Subjective art quality |
| Visual regression | Approved compositions at supported viewports and zooms | Save semantics or rule truth |
| Save migration | Stable IDs/orders/history, presentation vs rules changes, idempotence, fail-closed behavior | Inspector layout |
| Deterministic replay | Campaign rules, RNG streams, hashes, save/load continuation | Pixel appearance |
| Local browser E2E | Authentic built-app wiring | Exhaustive domain permutations |
| External live certification | Deployed assets, comprehension, game feel, responsive/keyboard behavior, console/request cleanliness | Fixture injection or duplicated source assertions |

Only three local campaign browser specifications are added:

1. `campaign-map-inspector.spec.ts`: map/list selection, single disclosure, rerender continuity, and base → formation → order.
2. `campaign-save-identity.spec.ts`: compatible old save through visible load and identity parity across surfaces.
3. `campaign-map.visual.spec.ts`: selected/unselected base and known site at three zoom levels and supported viewports.

Chromium behavior and visual jobs use one worker and no retries. Firefox/WebKit are nightly/release compatibility checks, not duplicate PR behavior coverage. Visual tests prove visual invariants only; domain tests prove data/rule invariants only.

The deterministic D+1 replay must cross the first scheduled-arrival boundary. UI inspection, map navigation, previews, and name resolution must consume no RNG and change no campaign state hash. Presentation-only changes leave the rules fingerprint unchanged; rules-bearing changes require a reviewed golden update.

## 9. Verification commands and budgets

The final names may be wired during Phase 0; equivalent existing commands remain authoritative until then.

| Gate | Command | Target budget |
|---|---|---:|
| Type safety | `npm run typecheck` | 60 s |
| Zero-warning lint | `npm run lint -- --max-warnings=0` | 60 s |
| Campaign contracts | `npm run test:campaign:contracts` | 30 s |
| Campaign DOM | `npm run test:campaign:dom` | 45 s |
| Save migrations | `npm run test:campaign:migrations` | 30 s |
| Deterministic replay | `npm run test:campaign:replay` | 90 s |
| Full campaign suite | `npm run test:campaign` | 180 s |
| Production build | `npm run build` | 120 s |
| Chromium behavior | `npm run test:campaign:e2e` | 180 s |
| Chromium visuals | `npm run test:campaign:visual` | 180 s |
| Full repository | `npm test` | 15 min |
| Cross-browser campaign | `npm run test:campaign:e2e:cross-browser` | 12 min |

PR/local tranche gate: typecheck, zero-warning lint, owning focused tests, full campaign suite, and build.  
Final local gate: deterministic replay, Chromium behavior, Chromium visuals, and full repository suite.  
Production gate: the external-browser live certification only after the batched deployment is Ready.

Every closed issue must include the named failing-then-passing regression, a traceability row, visual/geometry or migration/replay evidence where applicable, and a production-ledger entry for live-visible behavior.

## 10. Deployment discipline

Vercel Hobby deployment capacity is shared across the team: 100 per rolling 24 hours, 100 per hour, 60 per five minutes, and one concurrent deployment. Preview, production, and Git-triggered deployments all count.

- Work in dependency-ordered local commits.
- Do not push documentation-only, test-fix, screenshot, or micro-fix commits individually.
- Do not use preview deploys or empty commits as deployment triggers.
- Before release, confirm that no team deployment is running and that shared rolling capacity remains.
- Target **one** fully locally certified push to `main` for this campaign program.
- Permit at most one additional push only for a blocker found exclusively on the live production environment.
- Wait for the single deployment to reach Ready before opening the external-browser certification run.

This plan itself does not justify consuming a deployment.

## 11. Definition of done

The campaign is certified first-class only when all of the following are true:

- All 45 ledger issues are `Closed / live verified`; no waiver is silently treated as a pass.
- The historical/data reviewer approves the D+1 source matrix, site registration, OOB identity, capacity abstraction, and starting posture.
- The independent UI/UX evaluator issues a binary `PASS` for every required viewport, zoom, input mode, and complete command journey.
- The independent test evaluator confirms every requirement has one primary owner and no obsolete test certifies rejected behavior.
- Certified old saves preserve progress and stable identities; ambiguous/unknown rules states fail safely without mutation.
- `npm run test:campaign`, `npm test`, `npm run build`, zero-warning lint, migrations, replay, Chromium behavior, and Chromium visual gates pass.
- The live deployed build passes every campaign-validation gate through the connected external browser: first ten seconds, map literacy, first order, reports/time, genuine player attack, natural AI defense, consequences/recovery, persistence, natural outcome, supported viewports/keyboard/motion, and final console/request sweep.
- No arbitrary campaign turn cap exists, and a natural 20+ turn tactical battle is demonstrably playable.
- The campaign map, inspector, planner, battle, AAR, and save/resume flow feel like one coherent WWII command game.
