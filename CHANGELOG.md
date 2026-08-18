# Changelog

## Campaign first-class interface — FCI-4 common order planning

- Added one authoritative action registry for redeployment, production, infrastructure repair, and all reconnaissance/counterintelligence operations, including stable blocker codes and corrective actions.
- Standardized shipped order composers around intent, target/route, participants, timing/support, effects, conflicts, and draft review while retaining domain-specific controls.
- Made previews account for existing formation, resource, transport, intelligence-capacity, asset, engineering, infrastructure, and production-slot holds before a draft is submitted.
- Expanded the persistent tray with complete route/area, cost, timing, risk, objective, dependency, reservation, next-transition, conflict, edit/remove, priority, and cancellation facts.
- Added atomic replacement rollback, non-mutating Player-only commit preflight, explicit preservation feedback on rejection, and separate Commit/Advance messaging.
- Added in-game cancellation review with exact released reservations, refunds or sunk cost, delay, exposure, and production supersession guidance.
- Added focused action-registry, composer, tray, priority, replacement, preview/commit parity, faction-isolation, and cancellation certification.

## Campaign first-class interface — FCI-3 Situation, alerts, reports, and outcomes

- Rebuilt Situation as a command synthesis board with a phase brief, exactly one dominant priority, objective deadlines/dependencies/loss meaning, projected grade/score, explicit loss conditions, Player-safe front posture, command traffic, and a bounded recent-resolution record.
- Added save-stable campaign-alert acknowledgement validated against retained advance records; acknowledgement changes review state without revising simulation truth or resolving required decisions.
- Unified the Reports shortcut around the Situation alert center with direct intelligence and after-action archive routes, visible unread aggregation, typed deep links, and sticky compact close/focus restoration.
- Added event aggregation to recent checkpoints while retaining the full save-stable resolution timeline and exact stop reasons.
- Added AAR Continue-to-required-consequence behavior while preserving separate report acknowledgement and shared map/entity navigation.
- Expanded campaign outcomes with retained formations, existing formation service records, checkpoint guidance, and Review, Save, authored Continue, and Return paths.
- Added structural ten-second, persistence, AAR continuation, terminal-path, desktop, compact, and effective-200%-zoom certification with live next-report generation and no horizontal overflow.

## Campaign first-class interface — FCI-2 current map/inspector slice

- Added five projection-safe operational-map layers with truthful Supply, Air/Naval, and Environment feature gates, dynamic legends/filters, color-independent emphasis, and searchable keyboard list parity.
- Added typed operational-hex, front, contact, and persistent-formation inspector routes while preserving domain-owned redeployment and tactical-engagement legality.
- Projected Player formation readiness, cohesion, fatigue, personnel, equipment, supply, experience, honors, history, order, and campaign location into the command interface without exposing opposing truth.
- Corrected runtime axial formation locations before campaign offset-map highlighting and certified the live 272-formation roster.
- Added generation-aware indexing for the 4,650-hex live theater and kept 100 measured overlay switches below one frame at p95.
- Corrected desktop inspector focus when a player reselects an entity from an already-open map list and retained compact sheet exclusivity/inert behavior.
- Added projected after-action-report location actions that close the archive, highlight the rendered map hex, and open the shared hex inspector without exposing runtime axial coordinates.
- Added 119-test campaign certification, targeted TypeScript/ESLint gates, production build verification, and desktop/compact visual evidence.

## Campaign 2.0 C20-032 — Shared AI behavior and typed-order execution

- Added deterministic translation from every selected AI operational plan family into ordinary redeployment, reconnaissance, counterintelligence, or production orders, with explicit ordered, holding, and blocked outcomes.
- Unified Player and AI draft commitment behind one authoritative validation, reservation, cost, capacity, formation, intelligence, and execution-adapter path.
- Added backward-compatible exact formation identities to redeployment orders, including identity reservations, precommit validation, in-transit locks, exact arrival, blocked release, cancellation release, and aggregate force reconciliation.
- Preserved active-plan continuity across committed and executing orders without allowing unrelated plans to double-assign the same formation.
- Persisted private planning-linked behavior records with stable order traces, canonical hashes, defensive state access, and fail-closed runtime validation.
- Added a two-segment certification proving legal Bot order creation, exact formation commitment, ordinary movement resolution, arrival release, plan continuity, persistence, and integrity.

## Campaign 2.0 C20-031 — Operational plan portfolios and memory

- Added nine belief-constrained operational candidate families covering defense, reinforcement, offense, counterattack, withdrawal, reserve recovery, logistics protection, supply interdiction, and intelligence collection.
- Added explainable scoring for objective value, force adequacy, urgency, logistics, confidence, reserve health, continuity, exposure, downside, and bounded repetition.
- Added coordinated portfolio selection with unique formation assignments, explicit headquarters reserve, provisional resource/intelligence budgets, and deterministic difficulty policies that never change legal knowledge.
- Added stable multi-segment commitments, reinforce/exploit/abort/withdraw triggers, recent-plan history, hysteresis, and repetition penalties to prevent one-segment order oscillation.
- Persisted assessment-linked private planning records atomically with canonical hashes, defensive state access, runtime ownership/allocation/memory validation, and fail-closed tamper detection.
- Added focused determinism, no-leak, resource/reserve, double-commitment, continuity, transaction, persistence, and integrity certification.

## Campaign 2.0 C20-030 — Belief-constrained operational AI assessment

- Added deterministic strategic posture, force balance, reserve, logistics, intelligence uncertainty, objective-pressure, threat, and opportunity assessments for AI-controlled campaign factions.
- Expanded deeply frozen faction views with exact friendly formation condition and visibility-filtered public objective/phase/score facts while retaining fused-contact-only opposing information.
- Enforced a one-boundary command reaction delay: assessments use the start-of-segment projection and cannot react to intelligence or hidden truth that changes during the same segment.
- Added stable finding/assessment identities, private rationale traces, canonical input and integrity hashes, checksummed persistence, defensive state access, and fail-closed runtime invariants.
- Added belief-versus-truth, determinism, posture, projected-weakness, objective-pressure, transaction, JSON persistence, and tamper certification.

## Campaign 2.0 C20-027 — After-action reports and post-battle recovery

- Added immutable, integrity-bound campaign AARs generated after formation, economy, control, infrastructure, objective, score, and end-state consequences commit.
- Added Player-safe friendly formation before/after condition, aggregate opponent confirmation, resource charges/shortfalls, operational effects, tactical objectives, campaign objective changes, and deterministic follow-up decisions.
- Added an accessible automatically presented report dialog, newest-first battle archive, explicit acknowledgement, combined command-inbox unread count, responsive layout, and direct decision routing to campaign workspaces or affected map locations.
- Added a bounded copy-on-write post-battle campaign autosave chain that is awaited before returning from tactical combat and restores to the resolved battle location with no stale active battle.
- Added visible autosave success/failure reporting while preserving already-committed battle consequences and instructing a manual save if storage fails.

## Campaign 2.0 C20-026 — Objectives, score, and end states

- Replaced decorative campaign objective status inference with authoritative locked/active/completed/failed runtime records, exact progress explanations, dependencies, hold durations, deadlines, and typed condition evaluation.
- Added ordered operation phases, transparent earned/available score, projected and recorded victory grades, visible defeat rules, deterministic victory/defeat records, and mandatory automation stops.
- Applied typed resource, power, and unlock rewards exactly once through stable award keys; retained complete phase, score, objective, and outcome truth in checksummed saves.
- Evaluated campaign objectives after both segment control resolution and atomic tactical-result consequence/control/infrastructure resolution, so tactical results affect strategic progress without bypassing occupation or damage rules.
- Upgraded the Situation workspace with objective status/progress/deadline/score cards and added an accessible victory/defeat record dialog with review and authored non-scoring continuation policy.
- Authored the baseline beachhead and port as real operational objective tiles with a two-phase campaign arc and an optional forward-airfield score goal.

## Campaign 2.0 C20-025 — Persistent infrastructure and reconstruction

- Added persistent campaign integrity, damage states, capture provenance/disruption, and operational effectiveness for forts, air/naval bases, logistics hubs, supply routes, and intelligence nodes.
- Bound tactical structural damage to an immutable post-battle infrastructure audit after consequence and control resolution, with replay, conservation, save, and fog-of-war validation.
- Applied installation effectiveness to daily throughput, air sorties, derived air/naval/intelligence power, tactical fortification integrity, and defender entrenchment.
- Added typed reconstruction drafts with exact supply/personnel cost, on-site formation supervision, facility/engineer reservations, atomic commitment, cancellation/refund policy, and segment-by-segment recovery.
- Added a friendly-only campaign inspector card with condition meter, capacity, capture-disruption expiry, repair requirements, exact ETA, blocking reasons, and order-tray integration.

## Campaign 2.0 C20-023 — Battle consequence resolver

- Added one atomic, replay-safe campaign transaction for exact formation personnel, equipment, readiness, fatigue, supply, experience, lifecycle, and battle history consequences.
- Added deterministic support utilization, recoverable resource-pool RP refunds, air/naval loss accounting, and both-faction campaign stock reconciliation without double-charging manpower.
- Added explicit zero-bounded resource shortfalls instead of negative stock or silent loss of tactical consumption facts.
- Added immutable integrity-checked consequence reports retained beside tactical results in terminal engagement ledgers and campaign saves.
- Removed typed results from the coarse Player-only economy/front bridge; territory, fronts, infrastructure, objectives, evidence fusion, and AAR presentation now remain explicit follow-on handoffs.

## Campaign 2.0 C20-022 — Tactical result extraction

- Added immutable, integrity-checked campaign battle result packages with exact formation, support, resource, objective, infrastructure, and faction-private evidence deltas.
- Upgraded frozen battle commitments with readable pre-battle formation condition baselines and development-save migration.
- Preserved destroyed units' final tactical status pools as serialized casualty tombstones.
- Replaced campaign mission-end estimates with deterministic extraction from complete tactical engine truth while retaining the full result for C20-023.
- Added rejection gates for missing/duplicated/cross-bound identities, result tampering, and intelligence identity leakage.

## Campaign 2.0 — Engagement ledger and frozen battle packages

- Added an append-only engagement ledger with explicit opportunity, planning, commitment, battle, terminal, and legacy-recovery states.
- Added atomic revision-bound formation commitments, frozen attacker/defender/support packages, deterministic IDs, before-state hashes, and package integrity validation.
- Bound tactical generation and tactical saves to exact committed package identity rather than mutable aggregate campaign force pools.
- Added result-receipt idempotency so repeated battle handoff cannot apply campaign effects twice.
- Updated campaign precombat with explicit commitment language, stale-plan feedback, and a safe return-to-campaign path before forces are locked.

## 2026-08-04

### Added

- Added Campaign 2.0 advance modes for three hours, next report, dawn, dusk, and one day, all orchestrated over ordinary one-revision segment transactions.
- Added deterministic mandatory event stops, a pause-after-every-resolution accessibility preference, bounded next-report safety, Player-safe severity alerts, and a validated save-stable resolution ledger.
- Upgraded the campaign order tray with a labeled advance selector, mode-aware primary action, stop summary, persistent alert panel, linked review actions, and an expandable resolution timeline.
- Added complete campaign-owned tactical snapshots covering all factions, stacks, action/initiative state, logistics, air/support queues, intelligence, mission-rule closures, logs, deterministic RNG/counters, and tactical UI resume context.
- Added strict campaign/revision/scenario/engagement binding, stable save-boundary checks, exact battle hydration, and direct campaign-load routing back into an active tactical battle.
- Replaced wall-clock unit/event identities and rule-relevant random ordering with persisted deterministic tactical streams and logical counters.
- Added a first-class Tactical Save Center with named manual battle checkpoints, explicit overwrite, integrity-checked load, earlier-save recovery, and quarantine diagnostic export.
- Added visible safe-boundary save queuing, serialized storage writes, three rotating turn-start autosaves, and a stable before-exit checkpoint.
- Added Resume Saved Battle entry points on the landing page and campaign command bar, returning directly to the saved tactical decision point.
- Restored tactical viewport, selection, popup, activity history, animation preference, accessibility reference, and keyboard focus after load.
- Added campaign-owned persistent formation records with deterministic legacy-count conversion, stable placement, personnel/equipment/supply/experience state, lifecycle history, and strict projection invariants.
- Added campaign-to-tactical formation provenance for friendly precombat reserves and generated enemy rosters, including deterministic tactical IDs and save-preserved status pools.
- Preserved formation identity through aggregate compatibility movement, retained terminal records after destruction/capture, and serialized the complete registry in Campaign 2.0 saves.

## 2026-08-03

### Added

- Added the authoritative deterministic campaign-segment resolver with deeply frozen faction-safe views, eleven stable resolution phases, simultaneous movement deltas, frozen-control daily production, symmetric intelligence resolution, and typed-order lifecycle finalization.
- Added persisted segment resolution reports with frozen-view hashes, phase/event accounting, one-revision time advancement, exact exception/invariant rollback, checksummed save/load continuity, and player-facing Advance 3 Hours outcome feedback.
- Added authoritative typed campaign orders for redeployment, production, reconnaissance, and counterintelligence, with deterministic identities and checksummed save/load continuity.
- Added machine-readable validation plus draft reservations and conflicts for resources, transport, intelligence capacity, formations, assigned assets, and the production slot.
- Added all-or-nothing multi-order commit, draft removal/rebalancing, and exact pre-execution redeployment/intelligence cancellation refunds.
- Upgraded the Campaign 2.0 order tray with live draft/committed counts, conflict reasons, reserved-stock displays, explicit Commit/Remove/Cancel controls, status, and ETA/effective time.
- Added the canonical deterministic air-show director, immutable measured timeline, one-clock SVG player, strict geometry/timing verifier, and 10x10/20x20 desktop/mobile certification harness.
- Added low-overhead 100ms air-show temporal certification logs with every painted aircraft position, cue counters, lifecycle/speed/turn audits, tutorial impact continuity, and human-readable pass/fail summaries.

### Fixed

- Kept tutorial bombers continuously visible through impact effects and egress.
- Centered opposing merge lanes per faction, selected deterministic break patterns that switch fighter pairings, replaced corrective escort weaves with measured racetrack returns, synchronized escort screens to bomber target runs at role speed, and replaced grouped flak volleys with independently timed lingering puffs.

## 2026-08-02

### Added

- Began Campaign 2.0 implementation with a behavior-preserving, versioned runtime foundation, deterministic named random streams, legacy scenario adapter, invariant validation, and atomic transaction contracts.
- Added Campaign 2.0 checksummed save envelopes, atomic IndexedDB slot storage, bounded history, corruption quarantine/recovery candidates, and pure version-1/version-2 legacy campaign migration.
- Cut the live campaign over to authoritative Campaign 2.0 runtime truth, transactional compatibility reconciliation, verified IndexedDB Save/Load, non-destructive legacy write-through, and explicit recovery confirmation.
- Replaced the shipped campaign sidebar presentation with the first Campaign 2.0 command workspace: theater bar, six keyboard workspaces, projection-safe map stage, context inspector, responsive order timeline, explicit redeployment planning, and developer-gated editor controls.
- Documented the complete Campaign 2.0 product, architecture, delivery milestones, acceptance gates, and release strategy.

## 2026-06-30

### Fixed

- Prevented existing crew or vehicle damage from dampening later concrete platform damage in readiness projections.
- Kept the training tutorial in the recon lesson until every player-controlled initiative-7 patrol has acted.
- Prevented stale inactive-unit movement highlights from blocking selection of the current initiative group.

## 2026-06-29

### Fixed

- Transferred every predeployed allied formation to player control when `Begin Mission` is selected.
- Preserved allied unit identity, damage status, supply state, stacking, and logistics tracking during transfer.
- Ensured transferred allied formations enter the opening player initiative queue without requiring map contact.

## 2026-06-28

### Fixed

- Replaced the initiative `Commit Orders` action with a group-scoped `Next Group` command.
- Prevented group advancement from placing formations in later initiative groups on sentry.
- Exposed `End Turn` only after every initiative group in the round is complete.

## 2026-06-21

### Fixed

- Corrected Recon Bike patrols to use soft-target attack values and exposed-recon hit distributions.
- Prevented platform equipment damage from masking later personnel casualties in readiness calculations.
- Capped abstract expected damage at the defender's remaining strength.
- Unified attack-type reporting between the engine, activity log, and expanded combat breakdown.
