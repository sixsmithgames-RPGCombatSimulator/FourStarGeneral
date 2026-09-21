# Core Architecture Ratchet

## Purpose

Four Star General still has legacy core modules whose size and cross-layer responsibilities make changes expensive. This is not a rewrite plan. It is an executable rule for reducing that risk one vertical capability at a time while preserving the deterministic test suite.

The production build runs `npm run verify:gates` before TypeScript and Vite. Its architecture verifier fails when:

- a tracked core file grows beyond its recorded line budget;
- a tracked core file shrinks without lowering its recorded budget to lock in the gain;
- `BattleScreen` adds direct `ensureGameEngine()` or `tryGetGameEngine()` access;
- the deleted `supplySnapshotByFaction` duplicate cache name returns to `BattleState`;
- any governed type or runtime entrypoint is not declared exactly once by its canonical owner anywhere under `src`;
- a UI module introduces a new static, re-exported, import-equals, or literal dynamic dependency on a `GameEngine` module;
- a grandfathered method grows beyond its exact recorded size; or
- a new method or module function in a tracked file exceeds 120 lines.

The current baselines live in `tools/architecture-baseline.json`. They are ceilings on inherited debt, not acceptable target sizes.

## No split-brain rule

Every gameplay fact has one authoritative owner. An extraction is complete only when the old implementation delegates to, or is replaced by, the new canonical implementation; copying the rule into a second module is a regression even when both copies currently return the same value.

| Concern | Canonical authority | Allowed downstream role |
|---|---|---|
| Live tactical state, combat mutation, RNG, initiative, resources, and event publication | `GameEngine` | `BattleState` issues commands and returns detached snapshots; UI presents them. |
| Tactical UI boundary and snapshot caching | `BattleState` | UI consumers read one state-owned contract and never fall back to direct engine reads. |
| Strategic campaign truth, orders, time, saves, and consequences | `CampaignState` and its domain services | Campaign projections receive authorized immutable inputs and never reconstruct hidden truth. |
| Campaign Situation presentation | `CampaignSituationWorkspaceProjection` | `CampaignScreen` reads authorized state once, renders the detached result, and owns interaction/lifecycle only. |
| Campaign Operations order-card, reservation, cancellation, and atomic-commit presentation | `CampaignOperationsWorkspaceProjection` | `CampaignScreen` reads authoritative order state and owns DOM, focus, events, commands, and lifecycle. |
| Air mission/event type vocabulary | `AirCombatContracts` | Engine/facade compatibility paths re-export types; air-show consumers import the canonical contract directly. |
| Air-show seeded choreography, actor identity, loss continuity, timing, and cue order | `AirShowDirector.planAirShowTimeline` | `HexMapRenderer` supplies map geometry and plays the verified immutable timeline; no alternate planner is retained. |
| Air-engagement event payloads and derived flak/air-to-air/CAP facts | `BattleAirEngagementProjection` | `GameEngine` owns combat, RNG, mutation, and queue timing; every producer delegates to the one detached projector. |
| Tactical roster entry labels, status/stat/detail markup, and display initials | `RosterEntryPresentation` plus `InitialsPresentation` | `PopupManager` owns empty state, DOM insertion, events, focus, and lifecycle. |
| Air Support target-tile markup, action enablement, ARIA state, and data-attribute encoding | `AirSortieTargetTilePresentation` | `PopupManager` owns live target keys, validation, engine-backed labels, DOM insertion, events, commands, focus, and lifecycle; it delegates presentation once and retains no fallback markup path. |
| Air-show dogfight and bomber-intercept pass decisions | `AirShowCombatPassGeometry` | `HexMapRenderer` supplies viewport-aware geometry services and owns SVG/DOM and animation lifecycle. |
| Retaliation gate ordering, defender snapshot, and player-facing reason projection | `BattleRetaliationProjection` | `GameEngine` supplies live facts and remains sole owner of RNG, ammo/resources, mutation, counts, reports, and events. |
| Tactical unit-stack presentation | `UnitStackPresentation` | `HexMapRenderer` creates and owns SVG/DOM from the deterministic plan. |
| Screen navigation and transition lifecycle | `ScreenManager` plus the campaign/tactical bootstrap boundaries | Screens request navigation; they do not construct competing runtime graphs. |

Required controls for every slice:

1. Delete the displaced inline calculation or state cache; do not leave a fallback implementation.
2. Keep one mutation path and one event publisher. Pure projections may clone and format, but may not own authoritative state.
3. Characterize delegation, input detachment, and parity at the boundary, including failure and resume paths where applicable.
4. Add or lower an executable import, symbol, file, or method budget so the former parallel path cannot return unnoticed.
5. Treat a convenience fallback from a typed boundary back to `GameEngine` or `CampaignState` as a release-blocking architecture failure.

## Operating rule

For feature work that touches a tracked core module:

1. Identify one coherent capability and characterize its existing behavior.
2. Move domain calculation into a pure game-layer module, or expose the required facts through a typed state projection.
3. Keep DOM composition and user interaction in the UI layer.
4. Run focused characterization tests, campaign tests when the boundary participates in campaign play, and the full suite.
5. Lower the affected budget to the new measured value. Do not raise a budget to make a feature fit.

If an extraction temporarily needs an exception, document the intended boundary and complete the extraction in the same change. Do not add a new UI-to-engine import to the allowlist as ordinary feature work.

## Completed slices

The September 17, 2026 slice moved mission-result calculation into `src/game/battle/reporting/BattleMissionReport.ts`, exposed an immutable reporting snapshot through `BattleState`, moved damage/activity formatting into presentation modules, and moved BattleScreen-only structural contracts into `src/contracts/BattleScreenContracts.ts`.

The continuation extracted three more behavior-preserving seams:

- `BattleSupplySnapshot.ts` now owns pure supply-category, trend, alert, intel-copy, and timestamp projection while `GameEngine` retains mutation and sample selection.
- `HexMapMarkupBuilder.ts` now owns deterministic terrain, beach, and inert-fringe SVG markup while `HexMapRenderer` retains DOM lifecycle, caches, recon, viewport, and effects.
- `BattleTacticalSaveController.ts` now owns save-center lifecycle, queued-write polling, autosaves, browsing, load, and recovery orchestration. It receives a detached `BattleState` turn snapshot and never imports `GameEngine`.

The next continuation added and hardened three additional seams:

- `BattleSupportTargeting.ts` owns deterministic support availability and artillery-target projection using cycle-safe contracts in `BattleRuntimeContracts.ts`. `BattleState` owns the command boundary and returns detached support, impact, command-state, and unit projections.
- `BattleSidebarEngineFacade.ts` is a cached, state-owned UI facade. It delegates five commands exactly while returning detached readonly player, Bot, reserve, and report projections. `PopupManager` and `ReserveListPresenter` no longer import the concrete engine, and an unreferenced 3,138-line duplicate `ReserveList.ts`/`PopupManager` implementation was removed.
- `AirShowTimelineInspection.ts` owns the pure timeline-to-inspection projection while `HexMapRenderer` retains playback and DOM lifecycle.
- The build asset gate now validates 348 explicit source/public references, including composed directional and formation sprites, runtime JSON, and sound catalogs. Gate self-tests prove `.tsx`, re-export, import-equals, dynamic-import, dynamic-sprite, public-audio, and runtime-JSON bypasses fail.

The integrated continuation then extracted one deterministic responsibility from each of the remaining extreme coordinators:

- Shared air-show contracts live in the 125-line cycle-free `AirShowPhaseProjectionContracts.ts`. The former phase projector was characterized during migration and later removed with the dormant legacy planner once reachability analysis proved production already used `AirShowDirector`.
- The 31-line `AirAttackResultScaling.ts` owns the shared pure air-result multiplier contract for player attacks, Bot attacks, retaliation, resolved strike missions, and Bot strike estimation. `GameEngine` still owns classification, RNG, ammunition/resource debits, damage/status mutation, initiative, events, and transaction order.
- The 192-line `CampaignReportsWorkspaceProjection.ts` owns the detached after-action Reports workspace projection; its largest function is 90 lines. `CampaignScreen` still owns state reads, map/navigation commands, safe DOM composition, modal/focus lifecycle, and shell rendering.
- The 116-line `CampaignFormationRosterProjection.ts` owns detached persistent-formation identity, posture, placement, condition, availability, history, and capacity-record filtering. `CampaignScreen` retains the authoritative roster read, domain callbacks, DOM, accessibility, selection, navigation, focus, orders, and events.
- `CampaignScreenBootstrap.ts` is now an explicit async screen boundary. Landing and tactical startup no longer eagerly load the strategic screen, renderer, scenario JSON, or map asset; campaign state remains a singleton and direct campaign entry plus campaign-to-precombat handoff are characterized.

The September 19 continuation closed the next three hotspots without moving domain authority:

- The former corridor-finalizer extraction characterized the abandoned planner's order and continuity. It was later removed with that unreachable planner instead of being preserved as a second choreography authority.
- `CampaignIntelligenceWorkspaceProjection.ts` owns the complete detached Intelligence workspace projection: authorized known sites and regions, contacts, brief history, capacity, and strategic geography. `CampaignScreen` retains authoritative state reads, DOM, event, navigation, selection, and focus ownership.
- `TacticalBattleFlowBootstrap.ts` is a retryable, lifecycle-safe dynamic boundary around BattleState creation, precombat, BattleScreen, War Room, map runtime, tutorial overlay, campaign bridge, and save resume. Landing and direct campaign startup remain lightweight; concurrent requests deduplicate and a failed chunk load can be retried.

The single-authority continuation then removed three more parallel paths:

- `BattleAttackOutcomeProjection.ts` is the canonical pure assembler for player attack summaries, Bot attack summaries, and combat-report payloads. Both attack coordinators delegate exactly once and no longer contain their former inline assembly rules. `GameEngine` remains the only owner of command validation, RNG order, ammunition/resources, damage mutation, retaliation, initiative, aftermath, and event publication.
- `CampaignLogisticsWorkspaceProjection.ts` is the canonical player-safe Logistics projection for stock and held values, production capability, air power, and detached naval-source presentation. `CampaignScreen` performs all authorized state reads and retains DOM, event, focus, navigation, and lifecycle ownership. The projection never infers naval readiness from the unrelated legacy economy scalar.
- `BattleWarRoomSnapshot.ts` and `BattleWarRoomSnapshotProjection.ts` define and produce the one detached War Room input. `BattleWarRoomDataProvider` performs exactly one `BattleState.getWarRoomInputSnapshot()` read and has no `GameEngine` import or fallback. The dead `supplySnapshotByFaction` cache is deleted; `supplySnapshotCache` is the sole cache/reset path and the removed identifier has a zero-count symbol budget.

The next continuation established three additional canonical presentation boundaries:

- `AirCombatContracts.ts` is the sole declaration owner for nine air mission/event types. `GameEngine` and `BattleSidebarEngine` retain compatibility re-exports, while all three air-show consumers import the cycle-free type contract directly. The contract emits no runtime dependency, and both architecture and source tests reject duplicate declarations.
- `UnitStackPresentation.ts` owns deterministic visible-member priority, actor count, diamond/corner layout, recon-safe sprite selection, facing, tactical statuses, and decoration offsets. `HexMapRenderer` retains SVG/DOM creation, caches, transforms, effects, and lifecycle. `renderUnitStack` fell from 169 to 61 lines and no longer needs an oversized-method exemption.
- `CampaignSituationWorkspaceProjection.ts` owns the detached player-safe Situation view: objectives, priorities, fronts, counterattack stage, alerts, timeline, brief/outlook, score, and checkpoint data. `CampaignScreen` still owns every state read plus DOM, event, focus, navigation, and lifecycle behavior. Timeline and command priority share one severity comparator; table-driven tests prevent those two surfaces from drifting.

The latest continuation extracted three more canonical decision seams and subjected them to cross-agent adversarial review:

- `BattleRetaliationProjection.ts` owns ordered break, aircraft/ground, tow, pin, range, retaliation-limit, rearm, and ammunition preparation for preview, Player, and Bot attacks. `GameEngine` still owns every state read, RNG call, debit, mutation, retaliation counter, initiative transition, report, and event. Review caught an integration drift where post-hit breakage incorrectly suppressed simultaneous sentry fire; the corrected contract explicitly preserves sentry fire and the historical preview/live pin-versus-tow priority difference.
- `AirShowCombatPassGeometry.ts` owns deterministic dogfight and bomber-intercept path decisions behind injected geometry services. `HexMapRenderer` retains viewport/SVG bounds, DOM, animation, caches, and actor lifecycle. The renderer now aliases the canonical readonly corridor contract instead of maintaining a parallel shape, and real-adapter tests cover forward/reverse bomber paths, goldens, and detachment.
- `CampaignOperationsWorkspaceProjection.ts` owns detached order cards, status/ETA/route/cost/risk/objective/dependency copy, reservation labels, cancellation capability, transport-return presentation, and atomic commit presentation. Both the tray and cancellation review use the same order projector; `CampaignScreen` remains the only state reader and command/DOM/focus/lifecycle owner.
- Repository gate self-tests now prove repository-wide canonical type and runtime-function ownership scanning detects a duplicate in any `src` module. The production gate fixes the six new entry functions to their three expected owner modules; behavior/source tests independently reject displaced inline fallback paths.

The September 20 continuation closed two additional seams and eliminated a false architecture win:

- `BattleAirEngagementProjection.ts` is the sole payload projector for all nine production flak, air-to-air, and CAP-clash event producers. Flak totals/final state derive from ordered battery entries; air-to-air final state derives from the interception result; CAP survivor counts and arrays derive from one final-strength pair. Executable seeded Player/Bot attacks lock complete consumed-event hashes, post-state, and RNG checkpoints.
- `RosterEntryPresentation.ts` owns populated roster labels, status/stat thresholds, support presentation, details, escaping, and markup. `InitialsPresentation.ts` provides the one fallback-initials function shared with general portraits. `PopupManager` retains empty state, DOM/event/focus/lifecycle ownership, and its old markup/initials copies are absent.
- `AirSortieTargetTilePresentation.ts` is the single pure owner of Air Support target-card markup, copy, selectors, ARIA state, action enablement, and attribute-context encoding. `PopupManager` retains authoritative live reads and interaction lifecycle; its adapter fell from 126 to 23 AST lines. The unused alternate target renderer and five-method legacy Air Support form closure were deleted, and source guards forbid all six roots from returning. Quote-bearing identifiers round-trip safely, empty base CAP remains valid, malformed marked CAP remains visible but cannot be submitted, and the twelve-case presentation golden is `5e214529915d91ad98065cfafcf73c861751c304a6a4b6ce9cf33b948a161cd3`.
- Adversarial review proved `AirShowPlaybackPlanner` had no runtime caller while the live renderer used `AirShowDirector`. The dormant 3,899-line planner, attempted egress helper, rail planner, phase projector, corridor finalizer, path verifier, clash diagnostic, dead-path tests, and stale tracked compiled artifacts were deleted. `AirShowDirector.planAirShowTimeline` is now a canonical repository-wide function owner, and its exact file plus four inherited oversized functions are ratcheted.

The following tranche reduced three more live seams without creating alternate state or choreography authorities:

- `BattleAttackerPreparation.ts` is the canonical pure projector for the detached attack-request unit, resolved facing, sentry clearing, clamped unit-ammunition commitment, and next core action flags. Player and Bot attack transactions each delegate exactly once. `GameEngine` still owns RNG, registry-ammunition spending, live mutation, reports, events, initiative, and resource ordering. Seeded end-to-end signatures lock the complete Player and Bot transactions, including pre/post RNG checkpoints; the projector itself consumes no RNG.
- `CampaignCommandHexProjection.ts` is the canonical detached presenter for authored tiles, friendly-base action precedence, infrastructure condition/recovery, geography and water, force/capability/objective/front facts, and supplemental briefed sites. `CampaignScreen` remains the only `CampaignState` reader and retains DOM, callback, focus, and lifecycle ownership. Adversarial axial-versus-offset coverage and bidirectional detachment checks prevent coordinate or alias split-brain.
- The production `AirShowDirector.synchronizeBomberTargetRunsForEscortArrival` coordinator fell from 126 to 34 lines through three bounded internal helpers. No second planner was introduced. A multi-bomber regression proves every bomber is retimed, every flak cue remains inside its referenced actor's visible interval and authored radius, and release/impact cues remain attached to their actors. Existing calibrated painted snapshots and temporal traces pass unchanged.

The next tranche closed three additional seams, including one regression caught by adversarial review:

- `BattleDefenderDamageProjection.ts` owns post-damage suppressor attribution and broken-transition projection for preview, Player, and Bot transactions. Review found the first extraction classified the damaged unit before adding the new suppressor, so a low-strength formation receiving its second suppressor could fail to route. `BattleSuppressionState.ts` is now the sole classifier used by both the projector and the engine's general query delegate. Tests prove second-suppressor preview/live parity, Player and Bot rout/retreat behavior, destroyed-unit exclusion, detachment, and one-owner source structure.
- `CampaignCommandSummaryProjection.ts` owns detached priority-force summaries, command-status precedence, unread totals, terminal outcome and service ordering, and advance status/copy. `CampaignScreen` remains the one state reader and the render/command/DOM/focus/lifecycle owner. Coverage locks offset-location semantics, uncertainty detachment, terminal/engagement/order precedence, sandbox suppression, alert/timeline detachment, automation wording, and stable service ties.
- The live `AirShowDirector.buildInterceptorPasses` coordinator fell from 144 to 38 lines while a private 103-line helper owns deterministic geometry only. Nine-interceptor coverage locks actor order, strictly ordered centered/mirrored lanes, full-track hashing, and exact continuation from fighter-clash tracks. No exported or parallel planner was introduced, and all calibrated browser visuals remain unchanged.

The final September 20 tranche reduced three more production seams and removed an internal split-brain risk found in review:

- `BattleAttackerDispositionProjection.ts` is the 53-line canonical pure owner for destroyed, hold, and eligible ground-assault advance decisions. Player and Bot attack transactions each delegate exactly once; `GameEngine` retains removal, relocation, recovery-site overrun, supply synchronization, action flags, reports, events, and RNG ordering. Destruction precedence, both aircraft gates, entrench reset, detachment, and seeded live hold/advance transactions are locked.
- `CampaignCommandShellViewProjection.ts` is the 110-line canonical detached assembler for both empty and loaded shell views. `CampaignScreen` remains the only `CampaignState` reader and the only render/event/focus/lifecycle owner. Exact payload parity, ordering and status precedence, coordinates, fresh empty collections, and bidirectional nested detachment are characterized.
- The live `AirShowDirector.buildFighterClash` coordinator fell from 181 to 88 lines, and private turn-side projection is 73 lines. Review found the scramble formula was still duplicated between candidate scoring and published tracks; one 14-line `projectFighterScrambleGeometry` helper now owns heading, escort clearance, switched lane, and path construction for both callers. Existing cap/full-engagement hashes remain stable, while a mirrored Player-interceptor/Bot-escort 12-fighter hash locks both faction directions and every continuation. No new exported planner or publisher exists.

The closing September 20 tranche completed the next three live coordinator cuts and removed the renderer's remaining dead choreography fork:

- `AirShowDirector.planAirShowTimeline` fell from 159 to 101 lines through a private planning-context helper. The director remains the sole exported timeline planner and the only publisher of the verified result. The fallback case without headquarters, target, or a supplied seed is locked by golden `c4747fe1662f979c2988e16e97c8926b9c3e2ceb0a000a740f476b5a158cfd37`. A TypeScript call-graph audit then identified and removed the 150-method unreachable Airshow closure in `HexMapRenderer`; the renderer fell from 14,766 to 8,027 lines and from 364 to 214 methods. Source gates require the sole live planner import and call and forbid those deleted roots from returning.
- `BattleAircraftAttackReadinessProjection.ts` stages maneuver readiness before ammunition readiness for both Player and Bot attacks. `GameEngine` performs the movement projection first and only then initializes/reads live ammunition, preserving the historical no-mutation behavior when an attack is rejected for movement. The engine retains validation, live state reads, mutation, RNG, resources, reports, and publication; its exact ceiling is now 17,987 lines, with `resolvePlayerAttack` at 618 lines and `resolveBotAttack` at 596.
- `CampaignCommandShellWorkspaceProjection.ts` coordinates the detached Objectives, Formations, Intelligence, Logistics, and command-hex projections exactly once and in the established order. `CampaignScreen` remains the sole `CampaignState`, DOM, render, focus, and lifecycle owner. `renderCommandShell` fell from 193 to 38 lines and the screen from 4,458 to 4,437 lines; source and real-screen tests lock ordering, single publication, freshness, coordinates, and detachment.

The cross-browser precombat continuation removed a Firefox rendering feedback loop and a second map-rendering responsibility:

- Firefox exposed `SVGTransformList.consolidate()` as a mutating read when invoked from the observed viewport-transform path: consolidation normalized the watched SVG attribute and fed the `MutationObserver` again until the browser main thread stopped responding. `ViewportTransform.ts` now parses only the transform forms emitted by `MapViewport`, directly from the attribute string, and `HexMapRenderer` ignores observer callbacks whose exact transform value has not changed. A zero-count source budget forbids `.consolidate()` from returning to this path. Parser coverage locks identity, translate/scale, matrix, non-finite rejection, unsupported-form rejection, and zero observed writes.
- `HexMapLayout.ts` is the single geometry/layout owner used by both battle rendering and the briefing map. `TerrainFillPalette.ts` is the single terrain-fill owner with explicit battle and briefing themes. `PrecombatMiniMapRenderer.ts` builds and applies the dedicated inert precombat overview from those shared owners; `PrecombatScreen` no longer constructs the stateful full `HexMapRenderer`, owns no fallback palette, and contains no resize rerender loop. The miniature preserves authored roads, rivers, crossings, and terrain metadata without importing battle sprites, effects, caches, input, or lifecycle state.
- Canonical-owner gates fix `buildHexMapLayout`, `buildPrecombatMiniMapPresentation`, `renderPrecombatMiniMap`, `resolveTerrainFill`, and `parseViewportTransform` to their expected modules. Zero-count budgets reject both the mutating transform read and the removed full-renderer minimap roots, preventing a second geometry, palette, or precombat-render authority.
- The focused Firefox requisition journey passes **9/9**, including a post-entry event-loop heartbeat. This certifies the repaired precombat transition specifically; the final complete cross-browser E2E matrix remains a separate release gate.

Measured result:

| Measure | Earlier baseline | Current exact ceiling | Locked reduction |
|---|---:|---:|---:|
| `GameEngine.ts` lines | 18,889 | 17,987 | 902 |
| `HexMapRenderer.ts` lines | 16,068 | 7,969 | 8,099 |
| `HexMapRenderer` class methods | 364 | 214 | 150 unreachable Airshow methods deleted |
| `BattleScreen.ts` lines | 15,484 | 14,641 | 843 |
| Dormant `AirShowPlaybackPlanner.ts` | 6,376 | deleted | 6,376 plus orphan helpers |
| Live `AirShowDirector.ts` lines | untracked | 1,991 | exact canonical ceiling established |
| `AirShowDirector.planAirShowTimeline` lines | 159 | 101 | 58 |
| `CampaignScreen.ts` lines | 5,284 | 4,437 | 847 |
| `CampaignScreen.renderCommandShell` lines | 193 | 38 | 155 |
| `GameEngine.resolvePlayerAttack` lines | 622 | 618 | 4 |
| `GameEngine.resolveBotAttack` lines | 597 | 596 | 1 |
| `BattleState.ts` lines | 688 | 680 | 8 |
| `PopupManager.ts` lines | 4,594 | 4,008 | 586 |
| Direct `ensureGameEngine()` calls in `BattleScreen.ts` | 76 | 63 | 13 |
| Direct `tryGetGameEngine()` calls in `BattleScreen.ts` | 6 | 3 | 3 |
| `BattleSidebarEngine.ts` lines | 397 | 332 | 65 |
| Grandfathered UI-to-engine import pairs | 11 | 4 | 7 |
| New UI-to-engine imports allowed | unguarded | 0 | fail closed |

Across these slices, 9,844 lines have left the three largest coordinators (`GameEngine`, `HexMapRenderer`, and `BattleScreen`), in addition to the deleted 3,138-line reserve duplicate and the dormant 3,899-line air-show planner plus orphan helpers. CampaignScreen has independently shed 847 lines, and PopupManager has shed 586 lines from its first recorded ceiling. The architecture verifier currently enforces 48 file budgets, 7 coupling/symbol ceilings, 1 canonical type-owner contract, 22 canonical runtime-owner contracts, 41 exact inherited oversized-method ceilings, the 120-line limit for new methods/functions in tracked files, and the exact 4 grandfathered UI-to-engine import pairs. Separate campaign and tactical bootstrap boundaries reduced the initial script from the historical 759.08 kB gzip to 21.91 kB gzip; production verification requires the tactical chunk and rejects any initial script above 100 KiB raw. The current release-candidate build emits an 81,182-byte initial script, a 439.07 kB lazy CampaignScreen chunk, a 357.55 kB tactical bootstrap, a 765.25 kB map/runtime chunk, and a 1,310.90 kB HexMapRenderer chunk with no static chunk cycles.

Characterization coverage locks mission losses and objectives, deployed-and-reserve survivor reporting, supply projection and history semantics, deterministic map markup and repeated rendering, canonical unit-stack and combat-pass presentation, tactical-save session ordering, support-command forwarding and detachment, sidebar facade delegation and detachment, War Room single-read delegation/cache reset/subscription disposal, air-contract ownership and compatibility, all nine air-engagement event paths, attacker preparation, staged aircraft readiness, and disposition, suppression/rout parity, and seeded transaction signatures, roster and Air Support projection/escaping/events, live AirShowDirector timing/continuity/egress/interceptor/clash/fallback geometry, read-only viewport-transform parsing, inert precombat-map layout/terrain sharing, retaliation gate and sentry/RNG semantics, exactly-once Player/Bot outcome delegation, Reports/Intelligence/Logistics/Situation/Operations/final-shell/workspace presentation, shared campaign segment-time ownership, persistence-busy action state, tutorial initiative handoff, shared Situation severity ordering, and lazy-route load/retry/resume ordering. Campaign tests pass **449/449**, the complete registered suite passes **949/949**, and Airshow Jest passes **30/30** (**22/22** direct director plus **8/8** renderer visual). Airshow certification passes **87/87** diagnostics with no findings, a clean anomaly report, **16/16** browser visual scenarios, and **1/1** choreography; `npm run test:airshow` passes end to end. The complete Playwright matrix passes **365** tests with **34** intentional project skips and zero failures across Chromium, Firefox, and WebKit. Deployment and live acceptance remain separate release gates.

## Remaining debt

This ratchet prevents the architecture from getting worse; it does not make the legacy modules small by itself. The next useful slices are:

1. Continue decomposing the authoritative transaction coordination around `GameEngine.resolvePlayerAttack` (618 lines) and `resolveBotAttack` (596 lines). Attacker preparation, staged readiness, post-combat disposition, post-damage suppression/rout projection, outcome/report assembly, retaliation preparation, and engagement-event projection are complete; choose a coherent calculation seam without moving RNG, resources, mutation, initiative, or publication out of the engine.
2. Reduce the remaining 4,008-line `PopupManager` by extracting complete typed presentation capabilities rather than moving mutable engine ownership into UI helpers. The Air Support target-tile seam is complete and must remain single-owned.
3. Continue migrating the four grandfathered UI-to-engine import pairs through detached state-owned facades.
4. Profile the first tactical transition now that battle, War Room, map, tutorial, and air-show startup are deferred. Shape or prefetch the 1,335.18 kB BattleScreen chunk only from measured route latency, while preserving the 100 KiB initial-script ceiling and lifecycle boundary.

Every completed slice should reduce at least one recorded ceiling or remove an allowlisted UI-to-engine import.

## Verification

Run:

```powershell
npm run verify:architecture
npm run verify:assets
npm run verify:gates:self-test
npm run build
npm run lint -- --max-warnings=0
npm run test:campaign
npm test
npm run test:jest
npm run test:airshow
npm run test:e2e
```

The combined self-tested architecture and asset gate is deliberately part of `npm run build`, so a normal production build cannot bypass either ratchet accidentally.
