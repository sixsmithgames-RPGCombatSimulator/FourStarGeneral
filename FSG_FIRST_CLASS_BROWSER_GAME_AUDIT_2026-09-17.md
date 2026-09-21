# Four Star General: First-Class Browser Game Audit

**Audit date:** September 17–21, 2026<br>
**Repository:** `C:\FourStarGeneral`<br>
**Audited revision:** `85249d7a99b76325608c0fd52d209d199b68337c` on `main`, plus the existing uncommitted working-tree changes<br>
**Scope:** product quality, player journey, browser delivery, visual polish, accessibility, persistence, test integrity, and engineering sustainability

## Executive verdict

**No—not yet. Four Star General is a deep, unusually ambitious browser strategy game and a credible late-beta/release-candidate, but it is not currently a certifiably first-class browser game.**

The distinction matters. FSG already has much of the difficult game underneath: deterministic tactical combat, a strategic campaign, exact formation identity, fog-safe AI, logistics, persistent consequences, save recovery, reports, an extensive tutorial, responsive command interfaces, and hundreds of automated contracts. At audit time, the campaign suite passed **411/411**, and the complete registered suite passed **828/828**. The War Room, tutorial, AI-score, air-show, startup-boundary, Firefox/WebKit browser fixes, no-split-brain review, and architecture follow-ups now leave the campaign certificate at **449/449**, the complete registered suite at **949/949**, and the complete browser matrix at **365 passed / 34 intentional project skips / 0 failures** locally.

However, “first-class” is an end-to-end player promise, not a subsystem count. Initial delivery is no longer a blocker: the landing script is now **81.18 kB raw / 21.91 kB gzip**, with both campaign and the entire tactical/battle stack behind lifecycle-safe dynamic boundaries. The remaining product-level gaps are browser-local rather than account-level progress, unoptimized multi-megabyte assets and deferred battle chunks, incomplete assistive-technology and device/network certification, substantial legacy core-module debt, and the absence of one current live release certificate at the time this project record was committed. The War Room context/action defect, tutorial initiative race, non-finite AI score, missing explosion reference, severe air-animation stacking, WebKit compact-layout anchoring, and casualty-reporting disagreement are fixed locally. Self-tested no-growth, no-new-coupling, canonical-owner, asset-completeness, initial-bundle, lazy-boundary, and air-spacing ratchets now turn those fixes into release-stopping contracts.

### Bottom line

- **Game design and simulation depth:** first-class potential; several systems are already first-class.
- **Current player-facing release:** polished in places, but inconsistent at important seams.
- **Browser-product readiness:** below first-class because load, persistence, accessibility, and live certification are not yet release-grade as a whole.
- **Recommended status:** **late beta / release candidate; do not market as fully first-class until the release gates in this document pass on one exact deployed build.**

### September 21 release-candidate certification

The candidate now has one clean local certificate across deterministic simulation, campaign integration, production bundling, Airshow visual/cadence coverage, and the complete three-browser matrix. The remaining release action is to deploy the exact committed SHA and perform same-artifact live acceptance. This materially raises confidence from subsystem-complete to release-candidate-complete, but it does not erase the account persistence, accessibility, asset-weight, and large-core-file gaps listed below.

## Scorecard

| Area | Grade | Assessment |
|---|---:|---|
| Tactical game depth | A- | Rich combat, initiative, terrain, logistics, support, damage, recovery, and save contracts. |
| Campaign depth | A- | Strategic AI, geography, formations, objectives, engagements, consequences, AAR, and persistence are substantial. |
| Tutorial/onboarding | B | The full governed command journey now passes locally at all three required viewport sizes; live deployment replay and the broader rail/accessibility matrix remain open. |
| Visual presentation | B+ | Strong art direction and command-room identity; the known aircraft stacking is corrected and governed, while exact deployed painted-frame review remains open. |
| Reliability and save safety | B | Deterministic coverage and immutable save work are strong; progress is still tied to one browser profile rather than the signed-in account. |
| Performance and delivery | B+ | The 81.18 kB raw / 21.91 kB gzip landing script is build-gated and campaign/tactical stacks load on demand; multi-megabyte assets, large deferred chunks, and device/network profiling remain. |
| Accessibility/responsiveness | B- | Considerable semantic, keyboard, and compact-layout work exists and the local three-viewport journey is green; the tactical map still creates a very large accessibility tree and live assistive-technology certification remains open. |
| Engineering maintainability | B | Broad tests, cycle-safe seams, canonical-owner contracts, lazy lifecycle contracts, and a build-enforced architecture ratchet reduce further drift. `HexMapRenderer` has fallen to 6,557 physical lines, but `GameEngine` remains nearly 18,000 lines and four grandfathered UI-to-engine pairs remain. |
| Release evidence | B | The complete local release matrix is green; deployment and same-artifact live acceptance remain the final external gates. |
| **Overall** | **B / late beta** | **A real game with first-class systems and startup delivery, not yet a fully certified first-class product experience.** |

## Audit method and evidence limits

This audit combined source inspection, repository history, current build/test execution, the governed tutorial validator, and the governed campaign-live preflight.

### Current results

| Check | Result | Meaning |
|---|---|---|
| `npm run test:campaign` | **PASS — 449/449** | Strong deterministic campaign and campaign/tactical integration coverage, including detached workspaces, War Room boundaries, shared segment-time ownership, persistence-busy action state, tactical handoff, and exact survivor/casualty reporting. |
| `npm test` | **PASS — 949/949** | Broad registered coverage for tactical rules, canonical projections, seeded Player/Bot transactions, campaign command surfaces, save/recovery, tutorial handoff, Airshow ownership, responsive presentation, and lifecycle boundaries. |
| `npm run verify:gates` | **PASS** | Gate self-tests, 48 file budgets, seven coupling/symbol ceilings, one canonical type-owner contract, 22 canonical runtime-owner contracts, 41 inherited oversized-method ceilings, the exact 4-pair UI-to-engine allowlist, startup import restrictions, and 348 explicit asset references are enforced. |
| Production build | **PASS with deferred-chunk advisory** | TypeScript, repository gates, Vite, and bundle verification pass. The 81,182-byte initial script is under budget, campaign and tactical entry stay lazy, and the bundle has no static chunk cycles; multi-megabyte image assets and the 1,310.90 kB HexMapRenderer chunk remain optimization targets. |
| `npm run lint -- --max-warnings=0` | **PASS** | Current configured rules pass; the rules themselves are materially weaker than `CODING_STANDARDS.md`. |
| Complete Playwright matrix | **PASS — 365 passed; 34 intentional project skips; 0 failed** | Chromium, Firefox, and WebKit all pass shared campaign, requisition, tactical geometry, full tutorial, and War Room journeys. Chromium additionally owns the calibrated Airshow screenshot and temporal certificates. |
| Air-show deterministic gates | **PASS — 87/87 diagnostics; 22/22 director; 8/8 renderer visual; 16/16 browser visual; 1/1 choreography** | The live `AirShowDirector` is the only production timeline authority, the anomaly report is clean, and `npm run test:airshow` passes end to end across desktop, large-map, mobile, and real BattleScreen replay. |
| Current live release | **PENDING DEPLOYMENT** | The exact certified local candidate must still be committed, deployed, matched to its production SHA, and accepted in the retained production browser tab. |

This report evaluates the release-candidate working copy plus the local War Room, architecture, browser, tutorial, campaign, and Airshow remediations. It does not claim deployment before the exact release commit exists.

### September 19 architecture continuation: single authority, not copied rules

This continuation deliberately treats split-brain behavior as a release defect. `BattleAttackOutcomeProjection.ts` is now the one pure assembler for player summaries, Bot summaries, and ground-combat report payloads; each large attack method delegates exactly once, while `GameEngine` remains the sole owner of validation, RNG sequence, ammunition/resources, damage mutation, retaliation, initiative, aftermath, and event order. Source characterization rejects the former duplicate inline projections.

`CampaignLogisticsWorkspaceProjection.ts` is the one player-safe Logistics projection for stock/held copy, production capability, air readiness, and naval-source presentation. `CampaignScreen` performs the authorized `CampaignState` reads and retains DOM, event, focus, and navigation ownership. Naval availability comes only from the authoritative naval-support view; the legacy economy scalar cannot reconstruct readiness.

The War Room now performs one `BattleState.getWarRoomInputSnapshot()` read. `BattleState` is the sole tactical UI snapshot/cache boundary, `GameEngine` remains the live tactical authority, and `BattleWarRoomDataProvider` has no direct-engine import or fallback. The unused second supply cache was deleted, its identifier is held at an executable zero-count budget, and the provider import exception was removed. The resulting boundaries are tested for exact delegation, detachment, cache reset, campaign timing, subscription disposal, and absence of fallback behavior.

The old War Room Playwright check depended on an unsupported `?codex-test=warroom` route and therefore tested neither the lazy runtime nor the component. It has been replaced with a shipped-DOM/browser certificate that constructs the real overlay and asserts every authored hotspot is uniquely identified, accessible, visible, non-zero-sized, and contained by its layer. This removes a false-green/false-red test seam without adding another production runtime path.

The next architecture tranche extends that rule to three more presentation boundaries. `AirCombatContracts.ts` is now the sole declaration owner for nine mission/event types; `GameEngine` and `BattleSidebarEngine` provide compatibility re-exports only, and the three air-show consumers no longer import `GameEngine`. `UnitStackPresentation.ts` is the sole pure owner of visible-stack priority, actor count, formation geometry, sprite/facing selection, and status-decoration facts; `HexMapRenderer` only paints the returned plan. `CampaignSituationWorkspaceProjection.ts` is the sole detached Situation projection for objectives, fronts, priorities, alerts, timeline, brief/outlook, score, and checkpoint data; `CampaignScreen` retains authorized state reads and DOM/event/focus/navigation ownership. An adversarial review found duplicate alert severity rankings during integration; both timeline and command priority now use one module-level comparator, with a table-driven parity test across all four severities.

The next tranche moves retaliation preparation, air-show dogfight/intercept geometry, and Campaign Operations presentation behind three more canonical functions. Cross-agent adversarial review caught and corrected a sentry-retaliation semantic/RNG drift before integration: simultaneous sentry fire still uses the pre-hit defender even when the incoming hit breaks or destroys it, while preview and live pin/tow priority retain their distinct historical ordering. Renderer tests now exercise both directions through the real adapter, and the duplicate corridor shape is removed. Operations tray and cancellation review use one detached projector.

The September 20 continuation closes three more regression seams. `BattleAirEngagementProjection.ts` is now the sole event-payload projector for all nine flak, air-to-air, and CAP-clash producers; its derived facts cannot disagree, and executable seeded Player/Bot attacks lock complete consumed-event digests, post-state, and RNG checkpoints. Populated tactical roster markup now comes from one detached, escaped presenter, while `PopupManager` retains empty state, DOM, events, focus, and lifecycle; the shared initials fallback also has one owner. Most importantly, adversarial review found that the attempted egress extraction belonged to an uncalled legacy planner while production used `AirShowDirector`. The dormant 3,899-line planner and its orphaned rail/phase/finalizer/diagnostic subtree were deleted rather than certified. `AirShowDirector.planAirShowTimeline` is now the build-gated canonical choreography entrypoint. Repository-wide AST gates require all nine canonical runtime entry functions to remain declared exactly once by their expected owners.

The next September 20 tranche removes three more live coordinator seams. `BattleAttackerPreparation.ts` now owns the detached facing/sentry normalization, unit-ammunition commitment, and next action flags shared by Player and Bot attacks; real seeded transactions lock complete post-state/report hashes and prove the projector consumes no RNG. `CampaignCommandHexProjection.ts` now owns authored campaign tile, friendly-base action, infrastructure, geography, force, capability, objective/front, and briefed-site presentation while `CampaignScreen` remains the sole state reader and DOM/event owner; nontrivial axial-to-offset and mutation-isolation tests prevent coordinate or alias drift. In the live air-show authority, escort-arrival synchronization fell from 126 to 34 lines through bounded internal helpers. Multi-bomber tests now prove nonzero retiming and exact flak/bomb/impact attachment, and unchanged Chromium snapshots plus temporal traces certify the visible result.

The latest tranche adds three more canonical seams and demonstrates why adversarial review is mandatory. `CampaignCommandSummaryProjection.ts` now owns detached priority-force summaries, command-status precedence, unread aggregation, terminal outcome/service ordering, and advance copy; `CampaignScreen` still performs all state reads and owns rendering, commands, DOM, focus, and lifecycle. In the live `AirShowDirector`, `buildInterceptorPasses` fell from 144 to 38 lines while deterministic geometry moved to one private 103-line helper; nine-interceptor mirrored lanes, exact actor order, stable hashes, and fighter-clash continuation are locked without creating another planner. The first combat extraction exposed a real ordering regression: it classified suppression before attributing the new suppressor. Review corrected this by making `BattleSuppressionState.ts` the one classifier and routing preview, Player, and Bot post-damage projection through it. A low-strength formation receiving its second suppressor now becomes broken and routes consistently, while destroyed formations never emit a false broken transition.

The final September 20 tranche closes the next three coordinator seams. `BattleAttackerDispositionProjection.ts` is the one pure decision owner for destroyed, hold, and eligible ground-assault advance outcomes, while `GameEngine` retains removal, relocation, supply, recovery-site, action-flag, report, event, and RNG ordering; both Player and Bot call it exactly once. `CampaignCommandShellViewProjection.ts` now owns detached empty/loaded final shell assembly while `CampaignScreen` remains the sole state reader and render/event/focus/lifecycle owner. In the production air director, `buildFighterClash` fell from 181 to 88 lines. Adversarial review then found that scramble geometry was still calculated independently for candidate scoring and publication; one private 14-line helper now owns both paths, and a mirrored 12-fighter Player-interceptor/Bot-escort hash prevents faction-direction drift. No alternate planner, state authority, or choreography publisher was introduced.

The closing architecture tranche attacks the remaining coordinator hotspots without creating split-brain authorities. `AirShowDirector.planAirShowTimeline` fell from 159 to 101 lines by extracting only private planning context; it remains the sole exported live timeline planner and publisher. Its all-fallback path is locked by golden `c4747fe1662f979c2988e16e97c8926b9c3e2ceb0a000a740f476b5a158cfd37`. Reachability analysis then removed 150 unreachable legacy Airshow methods from `HexMapRenderer`, reducing it from 14,766 to 8,027 lines and from 364 to 214 class methods; source guards require the renderer to import and call the live planner exactly once. `BattleAircraftAttackReadinessProjection.ts` now stages maneuver readiness before ammunition readiness for both Player and Bot attacks, preserving the historical rule that a movement rejection cannot initialize or mutate an absent ammo registry; `GameEngine` retains live reads, mutation, RNG, resources, reports, and publication and now sits at 17,987 lines, with attack coordinators at 618 and 596 lines. `CampaignCommandShellWorkspaceProjection.ts` assembles the five workspaces once in their established order while `CampaignScreen` remains the only state/DOM/lifecycle owner; `renderCommandShell` fell from 193 to 38 lines and the screen from 4,458 to 4,437.

The Air Support continuation removes another split-brain presentation path. `AirSortieTargetTilePresentation.ts` now exclusively owns target-card markup, copy, accessibility state, action enablement, and attribute encoding. `PopupManager` keeps live target state, engine-backed labels, validation, commands, DOM, focus, and lifecycle, but its adapter is only 23 AST lines. The unused alternate renderer and five-method legacy form closure were deleted. Source guards prevent their return, hostile quote-bearing identifiers are DOM-certified, and `PopupManager` fell from 4,450 to 4,008 lines.

Release-test orchestration was also hardened. The complete Playwright matrix now uses one worker locally and in CI because painted-frame and temporal certificates measure real browser cadence and become nondeterministic under competing browser load. The training requisition helper waits for the live non-hidden tutorial overlay and for its base container to become hidden after Skip, removing the race where precombat became visible before the welcome overlay was published. Requisition assertions now use the canonical formation catalog and budget-conservation invariants rather than duplicated historical prices or budget values. Focused allocation coverage passes **9/9**.

The focused Firefox run then exposed a real main-thread hang after precombat publication. The observed viewport path called `SVGTransformList.consolidate()` from a `MutationObserver`; Firefox normalized the watched SVG transform during that nominal read, feeding the observer back into itself. `ViewportTransform.ts` now performs a pure, read-only parse of the exact transform forms emitted by `MapViewport`, while the observer ignores same-value notifications. The source gate forbids `.consolidate()` in `HexMapRenderer`, and regression coverage proves repeated reads produce zero attribute mutations.

Precombat no longer pays for or owns a second stateful battle renderer. `PrecombatMiniMapRenderer.ts` produces one inert theater overview using the same canonical `HexMapLayout.ts` geometry and `TerrainFillPalette.ts` terrain semantics as the battle map, while preserving authored roads, rivers, crossings, and terrain metadata. `PrecombatScreen` is only the DOM adapter and owns no alternate coordinate or fill rules. The architecture gate now locks **48/7/1/22/41/4** file, coupling, type-owner, function-owner, oversized-method, and grandfathered-import counts. The complete browser matrix passes **365** tests with **34** intentional project skips and zero failures. Deployment and live release validation remain separate gates.

## What is already excellent

### 1. This is no longer a prototype in substance

The current repository contains a full strategic-to-tactical loop: campaign map operations, exact formation commitments, AI offensives, Player defense, precombat allocation, tactical combat, AAR, persistent consequences, repairs/recovery, objectives, scoring, and save migration. The old README still calls it a tactical prototype, but the implementation has moved far beyond that description.

### 2. The deterministic core is unusually well covered

The 449 campaign tests exercise map truth, fog-safe projections, strategic AI, exact formation identity, battle package generation, tactical return, reports, save integrity, migration, outcome logic, recovery paths, shared time projection, persistence state, lazy route entry, and detached workspace/final-shell projections. The 949-test full runner adds tactical rules, canonical attacker preparation, readiness, disposition and reporting, suppression/rout classification and retaliation, air engagement, roster and Air Support projection, tutorial initiative handoff, UI behavior, production Airshow planning, canonical ownership, read-only viewport transforms, inert shared-layout precombat rendering, lazy lifecycle ordering, facade detachment, finite-score boundaries, and regression coverage. For a browser game of this size, that is a major asset.

### 3. Persistence engineering is stronger than the average browser game

Campaign 2.0 saves use immutable envelopes, checksums, copy-on-write records, atomic slot-pointer updates, quarantine, recovery candidates, migration, and deterministic in-memory tests. The implementation in `src/game/campaign/persistence/CampaignSaveBackend.ts` is careful and failure-aware.

### 4. The game has a distinct, coherent identity

The command-rail, map, War Room, historical formation names, reconnaissance language, campaign geography, and AAR presentation form a recognizable product rather than a generic web interface. The failed tutorial screenshot still shows a convincing strategy-game frame with clear top-level command areas, tactical intel, a readable map, and an activity record.

### 5. Prior live work proves meaningful parts of the loop

The existing campaign evidence records a natural 35-turn Omaha-Gold tactical victory, campaign result application, AAR, campaign continuation, resource consequences, save checkpoints, recovery, and later AI defense setup. It also records substantial keyboard, compact-layout, and 200% zoom work. This is valuable proof; it just does not yet amount to one current, complete, clean full-campaign certificate.

## Gaps, priority, and why they matter

### P0 — Release certificate is currently red or unavailable

#### AUD-001: Governed tutorial journey — resolved locally

- **Status:** **Resolved locally on 2026-09-17; deployment replay remains pending.**
- **Original defect:** the final top-rail objective had `data-state="inProgress"` but visibly and accessibly displayed `Open`.
- **Fix:** unoccupied actionable objectives now present `In Progress` consistently in visible text, title, accessible name, and data state. The real browser replay then exposed and drove two compact-layout fixes: the header reserves the visible 44px activity-toggle target, and the map-covering activity drawer starts collapsed through the same 980px breakpoint used by its CSS while larger desktop layouts remain expanded.
- **Prevention:** direct objective semantics and real activity-log state are characterized at 390px, 800px, and 1024px. Failure-only browser geometry diagnostics retain exact bounding-box evidence without weakening the acceptance assertion.
- **Verification:** the complete governed first-turn command sequence passes locally in Chromium at **1680×857, 1440×900, and 390×844 (3/3)**, including deployment, selection, movement, engineering, smoke, artillery, combat, initiative, objective state, settings, and rail mini-tutorials.
- **Why it matters:** this restores the first-session acceptance certificate locally. The exact public deployment must still replay cleanly before release certification.

#### AUD-002: The current deployed full journey is not certified

- **Evidence:** `test-results/campaign-playtest/FSG-CAMPAIGN-20260917-114436/issue-log.md` and `browser-bootstrap-blocker.txt`.
- **Observed:** external Chrome was installed, running, enabled, and correctly registered, but all browser requests failed before navigation with `Unable to load browser request-header policy`.
- **Historical evidence:** recent ledgers contain focused passes, local passes, blockers, and an August 29 full-audit failure. The September implementation ledger proves a natural tactical result and many subsequent slices, while explicitly leaving the full campaign outcome and final live sweep open.
- **Why it matters:** local tests cannot prove CDN assets, authentication, production storage, actual rendering, browser zoom, focus behavior, request failures, or the natural emotional/interaction flow of a long campaign.
- **Required fix:** repair the external-browser connection, identify the exact live build, and run campaign Gates 0–11 without substituting a local or headless surface.

### P1 — Player-visible quality and correctness risks

#### AUD-003: Air-show sprite stacking — resolved locally and hard-gated

- **Status:** **Resolved locally on 2026-09-17; exact deployed painted-frame replay remains pending.**
- **Original evidence:** the diagnostic reported **96% / 2.6 px overlap** and **331 proximity events**, printed `CRITICAL`, and still passed. Same-flight fighters alternated turn sides and folded through one another; the report also assumed every aircraft was 60 px wide and grouped different painted instants into coarse 50 ms buckets.
- **Fix:** members of one fighter formation now keep a coherent deterministic fold. Escorts use a faction-separated clearance lane before rejoining the bomber screen. Actor/loss identity, seeded RNG ownership, phase/cue order, role-speed budgets, tracer/flak/bomb behavior, and leader turn-mask selection are unchanged.
- **Prevention:** `AIR_SHOW_SPATIAL_SEPARATION_REPORT` is now a release-stopping assertion over exact same-time timeline samples and each actor's rendered size. Non-exempt overlap may not exceed **75%**, center distance may not fall below **25% of the smaller rendered sprite diameter**, and events at or above 40% overlap may not grow beyond the ratcheted **41**. Exemptions are limited to opposing head-on, fighter-combat, and bomber-interception attack crossings.
- **Verification:** the governed scenario now reaches a non-exempt worst case of **75% / 11.6 px** with **41** notable events. Focused fighter motion passes **19/19**, the current air diagnostic runner passes **87/87**, renderer visual coverage passes **8/8**, the anomaly report has no findings, and current Chromium painted-frame baselines pass **7/7** across standard, large-map, and mobile captures.
- **Why it matters:** air combat is spectacle. This closes both the visible choreography defect and the more dangerous test-integrity defect that allowed a critical result to look green.

#### AUD-004: Missing large-explosion reference — resolved locally and build-gated

- **Status:** **Resolved locally on 2026-09-17; deployment verification remains pending.**
- **Original defect:** `SpriteSheetAnimator` advertised a 24-frame `FSG_Explosion_Large.png` sheet that did not exist. The active large-bomb path already returned through the characterized small-impact bomb-stick effect, while a mocked layout test kept the dormant registry entry looking valid.
- **Fix:** removed the nonexistent URL, obsolete registry entry, dead timing helper, and dead procedural-effect case. The active five-impact bomb-stick behavior and timing remain unchanged. The layout test now asserts that the runtime cannot advertise the missing sheet.
- **Prevention:** `npm run verify:assets` validates 348 explicit references, including import-meta URLs, composed unit/formation sprites and direction variants, runtime JSON, public audio, and sound catalogs. Its self-tests prove missing and dynamically composed references fail closed.
- **Verification:** focused animation coverage, TypeScript, zero-warning lint, production build, campaign **418/418**, and complete suite **864/864** pass. Vite no longer reports the missing asset.

#### AUD-005: Non-finite tactical AI scores — resolved locally

- **Status:** **Resolved locally on 2026-09-17; deployment replay remains pending.**
- **Root cause:** tactical threat projection multiplied optional `def.ap` directly. The shipped `Infantry_42` definition has no top-level AP value, so `undefined * 0.7` poisoned an otherwise finite attack estimate and plan score with `NaN`.
- **Fix:** absent AP contributes zero, the planner rejects non-finite final candidates before publication and sorting, and Bot/Ally execution defensively filters non-finite plans before prioritization, logging, or mutation. Legitimate finite negative scores remain valid.
- **Prevention:** registered characterization covers the real `Infantry_42` path, malformed estimator quarantine, valid negative scores, and the engine log boundary.
- **Verification:** focused finite-score tests pass **2/2**, broader planner/save integration passes **18/18**, campaign passes **418/418**, and the formerly malformed infantry logs now report finite score **88.6**. RNG, combat estimates, movement, initiative, events, and mutation order are unchanged.

#### AUD-006: War Room surfaces contained incomplete interactions and false campaign context — resolved locally

- **Status:** **Resolved locally on 2026-09-17; deployment and live replay remain pending.**
- **Original campaign-mode defect:** the provider hard-coded campaign mode false, so campaign combat displayed standalone mission-turn copy.
- **Fix:** the provider now derives campaign day, historical date, three-hour window, and tactical-engagement phase from the frozen campaign battle package. Standalone missions retain mission-turn copy, and missing package timing produces an explicit recovery state rather than fabricated context.
- **Original dead action:** Command Orders rendered an enabled `Acknowledge` control with no behavior.
- **Fix:** acknowledgement now changes the directive to a disabled `Acknowledged` state and announces the result through the War Room live region. The state is intentionally presentation-local until an authoritative provider mutation exists.
- **Why it matters:** buttons that do nothing and campaign battles presented as standalone missions erode trust in a premium command interface.
- **Verification:** focused War Room regressions **3/3**, campaign certificate **418/418**, production build passed, and zero-warning lint passed. Exact live deployment verification remains open.

#### AUD-007: Initial JavaScript delivery — resolved locally; asset and deferred-chunk work remains

- **Initial script:** `dist/index.js` is now **81.18 kB minified / 21.91 kB gzip**, down approximately **2,981.20 kB raw / 737.17 kB gzip** (approximately **97.3% / 97.1%**) from the historical 3,062.38 kB / 759.08 kB build. Campaign and tactical entry remain lazy.
- **Code splitting:** campaign and tactical startup now cross separate explicit asynchronous lifecycle boundaries. The campaign chunk is **428.19 kB / 112.68 kB gzip**. Battle construction, BattleState singleton creation, precombat, BattleScreen, War Room, map renderer, tutorial overlay, and air-show runtime are deferred until a tactical route is actually requested. Landing-to-training, direct `?mode=campaign`, campaign-to-precombat, save hydration ordering, failed-load retry, and direct air-show harness readiness are characterized.
- **Prevention:** production verification rejects an initial script above **100 KiB raw**, requires a distinct tactical bootstrap chunk, and rejects static output-chunk cycles. The repository gate self-tests and architecture/asset checks run automatically before every production build.
- **Assets:** `src/assets` contains 253 files totaling **49.9 MiB**. Individual PNGs reach 3.0 MB; the War Room image is 2.26 MB and campaign maps are approximately 2.3 MB each.
- **Markup/CSS:** `index.html` is 352,787 bytes and 10,552 lines, with much of the application's screen scaffold centralized there. The single primary CSS file is also large.
- **Why it matters:** the first-load parse/compile blocker is closed locally. Remaining risk has shifted to the latency of the first tactical transition, large-image decode/memory cost, and performance on ordinary laptops, tablets, and constrained networks.
- **Remaining fix:** measure the deferred tactical transition on representative devices; split or prefetch its largest chunks where traces justify it; convert/compress large images where quality permits; remove archive assets from production delivery; and establish cold/warm route plus asset budgets.

#### AUD-008: Signed-in identity does not provide signed-in progress continuity

- **Evidence:** campaign saves use browser IndexedDB (`src/game/campaign/persistence/CampaignSaveBackend.ts:234-265`); general roster and several preferences use `localStorage`.
- **Current capability:** save export/import and robust local recovery reduce risk, but there is no account-keyed cloud sync in the production source reviewed.
- **Why it matters:** a paid/account-gated browser game creates a reasonable expectation that progress survives device changes, browser cleanup, and profile loss. Local-only saves make the most valuable player data fragile and complicate support.
- **Required fix:** add versioned, conflict-aware cloud saves keyed to the authenticated user with the local store as an offline cache; until then, state prominently that saves are local and make export backup unavoidable and understandable.

### P2 — Sustainability, accessibility, and release-discipline gaps

#### AUD-009: Core modules have become regression multipliers

**Status: mitigated and ratcheted; incremental decomposition remains required.**

Largest source files in the current working copy:

| File | Lines |
|---|---:|
| `src/game/GameEngine.ts` | 17,987 (was 18,889) |
| `src/rendering/HexMapRenderer.ts` | 7,969 (was 16,068) |
| `src/ui/screens/BattleScreen.ts` | 14,641 (was 15,484) |
| `src/ui/airshow/AirShowDirector.ts` | 1,991 (canonical production planner) |
| `src/ui/screens/CampaignScreen.ts` | 4,437 (was 5,284) |
| `src/ui/components/PopupManager.ts` | 4,008 |
| `src/state/CampaignState.ts` | 4,022 |

`BattleScreen.ts` now calls `ensureGameEngine()` 63 times, down from 76, and `tryGetGameEngine()` 3 times, down from 6. UI modules still import engine types and behavior directly in 4 grandfathered file/module pairs, down from 11. This remains in tension with `CODING_STANDARDS.md:19-29`, which prohibits UI imports of engine internals and requires state/event boundaries.

The problem is not aesthetics. These files combine orchestration, state reads, rendering, input, tutorial flow, persistence, animation, audio, and domain translation. Changes gain a huge blast radius; code review becomes less reliable; lazy loading becomes harder; and tests compensate for architecture rather than benefiting from it.

**Implemented slices:** mission reporting is now a pure game-layer capability fed by an immutable `BattleState` projection, while damage, roster, initials, and generic activity formatting live in focused presentation modules. Supply projection now lives in a pure logistics builder; deterministic terrain/fringe SVG markup and unit-stack presentation live outside the renderer coordinator; and tactical-save session orchestration lives in a controller that consumes detached state projections rather than a `GameEngine` reference. Support targeting uses cycle-safe battle contracts and a strict state command boundary. Popup/reserve UI reads now pass through a cached state-owned facade that returns detached readonly models and delegates commands exactly. War Room consumes one detached `BattleState` snapshot with no direct-engine fallback, and the dead parallel supply cache is removed. Shared air-result scaling, player/Bot attack-outcome assembly, attacker preparation, staged maneuver/ammunition readiness, attacker disposition, ordered retaliation preparation, and all air-engagement event projection live in pure battle-domain services while `GameEngine` retains validation, RNG, mutation, resources, initiative, aftermath, and event publication. Campaign Reports/AAR, persistent formation roster, Intelligence, Logistics, Situation, Operations, command-hex, command-summary, final shell, and ordered workspace coordination use detached typed projections. Campaign and tactical entry cross separate retryable lazy bootstrap boundaries. The unreferenced 3,138-line duplicate reserve implementation, the dormant 3,899-line air-show planner plus its orphaned helper subtree, and 150 unreachable renderer Airshow methods were deleted. Production choreography has one owner in `AirShowDirector`; context, escort-arrival, interceptor, and fighter-clash coordination are decomposed without adding another planner.

`npm run build` now begins with self-tested repository gates. The architecture gate enforces 48 file budgets, caps direct `BattleScreen` engine access at 63 `ensureGameEngine()` and 3 `tryGetGameEngine()` calls, requires the removed `supplySnapshotByFaction` duplicate cache, mutating viewport `.consolidate()` read, and old full-renderer precombat roots to remain at zero occurrences, and requires the canonical air types plus 21 runtime entry functions to have exactly one repository-wide declaration owner. It rejects new `.ts`/`.tsx` static imports, re-exports, import-equals, or literal dynamic imports of `GameEngine` outside the exact four-pair allowlist, freezes the 46 inherited methods/functions still over 120 lines, and rejects any new oversized method/function in tracked files. A tracked-file reduction fails until its baseline is lowered, preventing a later regression from surrendering the gain. See `ARCHITECTURE_RATCHET.md` and `tools/architecture-baseline.json`.

**Remaining fix:** continue the same approach without a rewrite. Lower a recorded ceiling or remove an allowlisted import with every vertical extraction; next priorities are transactional attack-resolution coordination around the canonical preparation/readiness/disposition/retaliation/outcome/event seams, the four remaining UI-to-engine import pairs, and the 4,008-line PopupManager. The Air Support target-tile seam is complete; the live air-show planner and campaign-shell coordinator are below the 120-line ceiling. Their next work should be behavior-led, not decomposition for its own sake. The battle/War Room/air-show startup boundary is complete; the next performance work should be trace-led chunk shaping and asset delivery rather than moving ownership back into the entry point.

#### AUD-010: Tooling policy does not enforce the written standards

- `tsconfig.json` correctly uses `strict: true`.
- The build now self-tests and enforces bidirectional architecture budgets, exact UI-to-engine import pairs, and source/public asset completeness.
- `eslint.config.js` disables `@typescript-eslint/no-explicit-any`, `no-console`, and several other safeguards.
- Current `src` contains approximately 241 `any` tokens, 62 `as any` assertions, 202 `console.log`, 133 `console.warn`, and 107 `console.error` calls.
- The repository standard says to avoid `any`, prohibits direct coupling, and requires zero warnings. The configured lint gate cannot enforce much of that contract.
- The zero-warning lint run passed but was very slow and memory-heavy, adding iteration and CI cost.

**Why it matters:** when policy and enforcement diverge, “green” stops meaning what the team thinks it means. Production console volume also masks real failures and can expose internal state.

**Required fix:** lint production source separately from generated/evidence directories; re-enable rules incrementally with a tracked baseline; extend the new architecture checks as extractions land; route diagnostics through a build-strippable logger; and reserve console warnings/errors for actionable failures.

#### AUD-011: Accessibility has strong foundations but is not fully certified

The tutorial accessibility snapshot shows meaningful buttons, statuses, tabs, and command labels. It also contains hundreds of verbose terrain nodes such as terrain/density/recon descriptions. A list alternative exists, but the raw interaction tree is dense enough to make screen-reader traversal risky. The local tutorial now completes at all three required viewport sizes, but the live 200%/keyboard/screen-reader matrix was unavailable in this audit.

**Required fix:** expose the map as one understandable application/grid surface with deliberate navigation rather than hundreds of ordinary browse stops; test screen-reader task completion, not just accessible names; and require keyboard, 200% zoom, reduced motion, and all three tutorial viewports on the exact release build.

#### AUD-012: Documentation and test truth are fragmented

- `README.md:4-16` still describes a tactical prototype and future persistence helpers.
- Later documents describe shipped campaign, recovery, local certificates, live slices, open findings, and multiple superseded counts.
- The former critical air-overlap report is now a hard failure, but other diagnostics and historical ledgers still do not share one generated release manifest.
- Recent campaign ledgers mix complete slices, blocked runs, local-only verification, and one broader failure; there is no single current release manifest tying commit, deployment, test totals, open exceptions, and live gates together.

**Why it matters:** a first-class game needs a trustworthy release story. Stale docs waste engineering time; non-gating diagnostics create false confidence; and support cannot know what is actually deployed.

**Required fix:** make one release manifest authoritative, generate test totals instead of hand-copying them, archive superseded plans, refresh the README, and make every severity threshold machine-enforced or explicitly non-release-gating.

## Why these gaps keep FSG below first-class

The remaining work is not primarily “add more game systems.” FSG already has more systems than many released browser games. The gap is coherence:

1. **The first hour must be internally consistent.** Tutorial state, objective language, dead buttons, and campaign context cannot disagree.
2. **The browser must feel native to the product.** Fast startup, progressive loading, stable zoom behavior, and clean assets are part of game quality, not web infrastructure trivia.
3. **Player progress must be trustworthy.** Robust local storage is excellent engineering, but an account product needs account-level continuity or an explicit local-only contract.
4. **Visual spectacle must have visual acceptance gates.** A report that says “CRITICAL” and passes is not a certificate.
5. **The team must be able to change the game safely.** Giant cross-layer files and permissive lint make every polish fix more expensive and make regressions harder to localize.
6. **One deployed build must pass one complete story.** Focused slices are useful, but first-class status requires a clean first session, campaign operation, Player attack, AI attack/Player defense, save/resume, recovery, outcome, and final error sweep on the same build.

## Recommended execution plan

### Phase 0 — Restore release truth (1–3 days)

1. ~~Resolve the tutorial `Open` versus `In Progress` contract and pass all three governed viewports.~~ **Resolved locally 2026-09-17: consistent semantics plus responsive drawer/header repairs; governed Chromium passes 3/3.**
2. ~~Reject non-finite bot scores and add a focused regression for the observed infantry plan.~~ **Resolved locally 2026-09-17: source arithmetic corrected, planner/engine boundaries fail closed, and finite-score characterization is registered.**
3. ~~Turn the air-show spatial report into a real gate and correct the choreography.~~ **Resolved locally 2026-09-17: exact-frame, rendered-size assertions now stop the release above the governed overlap/distance/event limits; exact deployed painted-frame replay remains required.**
4. ~~Resolve or remove the missing large-explosion URL; prove the active effect path has no 404.~~ **Resolved locally 2026-09-17 and protected by the self-tested 348-reference asset gate; deploy and replay before release certification.**
5. ~~Remove, disable, or implement the War Room `Acknowledge` action; wire campaign timing accurately.~~ **Resolved locally 2026-09-17; deploy and replay on the exact live build before release certification.**
6. Create a machine-readable release manifest containing commit, dirty/clean state, exact test totals, bundle measurements, deployment ID, and open waivers.

### Phase 1 — Make the browser delivery first-class (1–2 weeks)

1. ~~Split campaign and tactical startup from the landing route.~~ **Resolved locally 2026-09-19: campaign and tactical construction are separate characterized, retryable lazy boundaries; War Room and air-show runtime arrive with the tactical route.**
2. Lazy-load large images and audio only when their screen/effect becomes reachable.
3. Compress or replace oversized PNGs; exclude archives and unused source art from the production artifact.
4. Measure cold and warm startup on a mid-range laptop and mobile-class CPU/network; set budgets from those traces.
5. Add production checks for missing assets, request failures, unhandled rejections, console errors, and unexpected console warnings.

### Phase 2 — Close the player-trust gaps (2–6 weeks)

1. Implement cloud save/roster sync or formally ship local-only progress with prominent backup/export UX.
2. Run task-based accessibility validation with keyboard and a real screen reader; reduce the map's accessibility-tree noise.
3. Complete the natural AI-defense outcome, recovery, save/resume, and campaign-outcome path on one exact deployed build.
4. Add crash-safe telemetry for startup, save failures, battle handoff, and campaign completion without leaking hidden game state.

### Phase 3 — Reduce the cost of quality (ongoing, incremental)

1. Continue the typed battle-facade migration. Popup/reserve and War Room reads now use detached state-owned contracts; four grandfathered UI-to-engine import pairs remain.
2. Continue extracting tutorial orchestration and air-show coordination from `BattleScreen`; tactical-save and support-command orchestration are now behind characterized boundaries.
3. Continue splitting rendering preparation from SVG/DOM mutation; map markup, unit-stack presentation, and timeline inspection are now pure modules outside `HexMapRenderer`.
4. Divide attack resolution and other stable domains from `GameEngine`; supply projection and support contracts are already extracted.
5. Tighten lint rules against a baseline while retaining the new bidirectional architecture and asset ratchets.

## First-class release gates

FSG can reasonably claim first-class browser-game quality when one exact, clean deployed revision satisfies all of the following:

- [ ] Production build has no unresolved asset URLs or unexplained warnings.
- [x] Tutorial passes locally at 1680×857, 1440×900, and 390×844, including every rail mini-tutorial; replay on the exact deployed release remains required.
- [ ] Campaign Gates 0–11 pass through the public URL in the external browser.
- [ ] A Player-created attack and an AI-created attack/Player defense both reach natural tactical outcomes.
- [ ] Save, close/reload, resume, AAR, recovery, and later campaign advance preserve exact identities and resources.
- [ ] A natural campaign victory or defeat is reached without console/network errors.
- [x] Every published/executed tactical Bot or Ally plan is finite; the observed infantry source path and malformed-candidate boundary are regression-tested locally.
- [x] Air-show spacing thresholds are asserted against exact painted instants and actual rendered sizes locally; exact deployed painted-frame replay remains required.
- [ ] No visible enabled control is inert.
- [ ] Keyboard-only, native 200% zoom, reduced-motion, and screen-reader task checks pass.
- [ ] Initial JavaScript and critical assets meet an explicit measured load budget; major game screens are lazy-loaded. **Initial JavaScript and screen boundaries pass locally (81.18 kB raw / 21.91 kB gzip under a 100 KiB raw build gate); critical-asset and first-tactical-transition budgets remain open.**
- [ ] Save locality is either solved by cloud sync or clearly disclosed with a tested backup/restore path.
- [ ] The release manifest matches the deployed SHA, artifact fingerprint, test totals, and open issues.

## Suggested measurable budgets

These are starting engineering targets, not externally benchmarked claims:

- Initial JavaScript: **PASS locally — 21.91 kB gzip**, with a stricter build-enforced **≤100 KiB raw** ceiling and required tactical async chunk. Add separate budgets for first campaign and first tactical route latency before release.
- Unresolved runtime asset references: **0**.
- Unexpected console warnings/errors during governed journeys: **0**.
- Non-finite gameplay values at module boundaries: **0**.
- Enabled controls without a state-changing or navigational result: **0**.
- Severe aircraft overlap events above the agreed failure threshold: **0** in governed scenarios.
- Tutorial viewport pass rate: **3/3**.
- Live campaign gate pass rate: **12/12** on the same deployment.

## Required tutorial assessment

| Category | Result |
|---|---|
| Launch and precombat | **Passed** at all three local Chromium viewports. |
| Deployment and begin mission | **Passed** at all three viewports. |
| Selection, movement, engineering, smoke, artillery, and fire | **Passed** at all three viewports. |
| Tutorial completion | **Passed** at all three viewports. |
| Post-tutorial top rail | **Passed** with consistent `In Progress`/`Secured` semantics and collision-free command/toggle geometry. |
| Rail mini-tutorials/settings | **Passed** at all three viewports. |
| 1440×900 | **Passed**. |
| 390×844 | **Passed** with compact activity drawer initially collapsed and its 44px toggle reachable. |

**Local certificate:** 3/3 governed Chromium journeys. The retained original failure artifact remains useful regression evidence; public deployment replay is still required.

## Current campaign live-gate status

All gates are **BLOCKED BY BROWSER**, not failed by the game, for this audit:

0. Live preflight — blocked before page access.
1. First ten seconds — not run.
2. Orientation/map literacy — not run.
3. First operation — not run.
4. Reports/alerts/time — not run.
5. Player-created attack — not run.
6. AI offensive/Player defense — not run.
7. Consequences/recovery — not run.
8. Campaign/tactical persistence — not run.
9. Natural campaign outcome — not run.
10. Viewports/keyboard/motion — not run.
11. Final live sweep — not run.

The run ledger is at `test-results/campaign-playtest/FSG-CAMPAIGN-20260917-114436/`.

## Final assessment

FSG's biggest risk is no longer that it lacks a game. It has one. The risk is that the team's enormous feature and test investment can create a misleading sense of completion while the seams—first-run clarity, production rendering, performance, live save trust, accessibility, and release truth—remain uneven.

The fastest route to first-class is therefore not another system. It is to make the existing systems arrive as one coherent, fast, trustworthy browser product, and to make every red diagnostic actually stop the release.
