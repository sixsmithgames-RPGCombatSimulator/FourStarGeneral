# Campaign 2.0 — first-class game product and engineering plan

**Date:** 2026-08-02  
**Status:** Approved implementation baseline; Milestones 0–2 certified; Milestone 3 assessment, operational planning, common-order behavior, and Bot-initiated defensive battles certified; first-class interface FCI-0 through FCI-4 engineering-certified  
**Owner:** Four-Star General campaign product and engineering  
**Primary target:** The campaign becomes a complete operational command game whose decisions create, shape, and remember tactical battles  
**Related:** [Competitive feature benchmark](./COMPETITIVE_FEATURE_BENCHMARK_2026-08-01.md), [campaign battle generation](./CAMPAIGN_BATTLE_GENERATION_DESIGN.md), [campaign intelligence/counterintelligence/fog](./CAMPAIGN_INTELLIGENCE_COUNTERINTELLIGENCE_FOG_PLAN.md), [first-class interface implementation plan](./CAMPAIGN_FIRST_CLASS_INTERFACE_IMPLEMENTATION_PLAN.md), [original campaign map design](../design/CAMPAIGN_MAP_DESIGN.md), and [Class A+ gap review](./CAMPAIGN_CLASS_A_PLUS_GAP_REVIEW.md)

## Implementation record

| Date | Scope | Status | Evidence |
|---|---|---|---|
| 2026-08-02 | C20-001 through C20-004: scenario/runtime split, stable identity, deterministic named RNG streams, events, invariants, and atomic transaction shell | Implemented and certified as an isolated, behavior-preserving foundation | [`CAMPAIGN_2_0_M0_RUNTIME_FOUNDATION.md`](../design/CAMPAIGN_2_0_M0_RUNTIME_FOUNDATION.md) |
| 2026-08-02 | C20-005 and C20-006: checksummed envelopes, atomic IndexedDB slots, bounded history, quarantine/recovery, and pure v1/v2 migration | Implemented and certified as an isolated persistence layer | [`CAMPAIGN_2_0_M0_SAVE_PERSISTENCE_AND_MIGRATION.md`](../design/CAMPAIGN_2_0_M0_SAVE_PERSISTENCE_AND_MIGRATION.md) |
| 2026-08-02 | C20-007 and C20-008: authoritative runtime behind CampaignState, compatibility reconciliation, live IndexedDB Save/Load, verified legacy write-through, and explicit recovery | Implemented and certified; Milestone 0 exit gates passed | [`CAMPAIGN_2_0_M0_LIVE_COMPATIBILITY_CUTOVER.md`](../design/CAMPAIGN_2_0_M0_LIVE_COMPATIBILITY_CUTOVER.md) |
| 2026-08-02 | C20-010 and C20-011: command bar, six-workspace rail, projection-safe map stage, context inspector, compatibility order timeline, selection-only map interaction, responsive and keyboard behavior, and developer editor gating | Implemented and certified as the first Milestone 1 vertical slice | [`CAMPAIGN_2_0_M1_COMMAND_SHELL.md`](../design/CAMPAIGN_2_0_M1_COMMAND_SHELL.md) |
| 2026-08-03 | C20-012: runtime-owned typed redeployment, production, reconnaissance, and counterintelligence drafts; shared validation; resource/capacity/formation/asset reservations; conflict arbitration; atomic commit; pre-execution cancellation; save/load continuity; and live order-tray controls | Implemented and certified as the authoritative Milestone 1 planning loop | [`CAMPAIGN_2_0_M1_TYPED_ORDERS.md`](../design/CAMPAIGN_2_0_M1_TYPED_ORDERS.md) |
| 2026-08-03 | C20-013: deeply frozen legal faction views; single-revision segment advancement; stable phase reports; simultaneous movement deltas; frozen-control production; symmetric intelligence resolution; typed lifecycle finalization; exact rollback; save/load continuity; and player-facing outcome feedback | Implemented and certified as the authoritative Milestone 1 execution boundary | [`CAMPAIGN_2_0_M1_SEGMENT_TRANSACTION.md`](../design/CAMPAIGN_2_0_M1_SEGMENT_TRANSACTION.md) |
| 2026-08-04 | C20-014: three-hour, next-report, dawn, dusk, and one-day advance modes; deterministic event stops; mandatory interruption; persistent Player-safe alerts; save-stable resolution timeline; accessibility pause; and first-class command-tray controls | Implemented and certified as the Campaign 2.0 time-control loop | [`CAMPAIGN_2_0_M1_ADVANCE_CONTROLS.md`](../design/CAMPAIGN_2_0_M1_ADVANCE_CONTROLS.md) |
| 2026-08-04 | C20-015: complete tactical snapshots, stable-boundary proof, deterministic hydration, strict campaign binding, and direct active-battle routing | Implemented and certified as the tactical persistence authority | [`CAMPAIGN_2_0_M1_TACTICAL_SAVE_COMPLETENESS.md`](../design/CAMPAIGN_2_0_M1_TACTICAL_SAVE_COMPLETENESS.md) |
| 2026-08-04 | C20-016: tactical Save Center, named manual slots, queued safe-boundary saves, three rolling turn autosaves, landing/campaign browse-and-resume, explicit recovery, quarantine export, and focus restoration | Implemented and certified as the player-facing tactical save experience | [`CAMPAIGN_2_0_M1_SAVE_UX.md`](../design/CAMPAIGN_2_0_M1_SAVE_UX.md) |
| 2026-08-05 | C20-020 through C20-022: persistent formation substrate, frozen engagement ledger/package, complete tactical result extraction, casualty tombstones, and faction-private evidence facts | Implemented and certified as the tactical-to-campaign truth boundary | [`CAMPAIGN_2_0_M2_FORMATION_SUBSTRATE.md`](../design/CAMPAIGN_2_0_M2_FORMATION_SUBSTRATE.md), [`CAMPAIGN_2_0_M2_ENGAGEMENT_LEDGER.md`](../design/CAMPAIGN_2_0_M2_ENGAGEMENT_LEDGER.md), [`CAMPAIGN_2_0_M2_TACTICAL_RESULT_EXTRACTION.md`](../design/CAMPAIGN_2_0_M2_TACTICAL_RESULT_EXTRACTION.md) |
| 2026-08-05 | C20-023: atomic formation condition/lifecycle, support consume/refund, both-faction economy conservation, explicit shortfall, immutable consequence audit, and replay-safe campaign handoff | Implemented and certified as the campaign battle-consequence authority | [`CAMPAIGN_2_0_M2_CONSEQUENCE_RESOLVER.md`](../design/CAMPAIGN_2_0_M2_CONSEQUENCE_RESOLVER.md) |
| 2026-08-05 | C20-024: occupation gates, legal retreat/no-route capture, retreat wear, supply isolation, tile-control transfer, derived front geometry, immutable control audit, and shared-border rendering | Implemented and certified as the operational control/front authority | [`CAMPAIGN_2_0_M2_CONTROL_FRONT_RESOLVER.md`](../design/CAMPAIGN_2_0_M2_CONTROL_FRONT_RESOLVER.md) |
| 2026-08-05 | C20-025: persistent infrastructure integrity, tactical damage mapping, capture disruption, shared capacity effects, typed reconstruction orders, campaign inspector UX, immutable audits, and fog-safe projections | Implemented and certified as the infrastructure/capacity authority | [`CAMPAIGN_2_0_M2_INFRASTRUCTURE.md`](../design/CAMPAIGN_2_0_M2_INFRASTRUCTURE.md) |
| 2026-08-05 | C20-026: typed objective conditions, dependencies, phases, hold/deadline progress, idempotent rewards, transparent score/grade, victory/defeat, terminal advance stops, save continuity, Situation UX, and outcome presentation | Implemented and certified as the campaign objective/end-state authority | [`CAMPAIGN_2_0_M2_OBJECTIVES_END_STATES.md`](../design/CAMPAIGN_2_0_M2_OBJECTIVES_END_STATES.md) |
| 2026-08-06 | C20-027: immutable Player-safe after-action reports, before/after formation/logistics/control/infrastructure/objective history, required decisions, automatic archive UX, acknowledgement, and post-battle recovery autosaves | Implemented and certified as the campaign battle-review and recovery boundary | [`CAMPAIGN_2_0_M2_AFTER_ACTION_REPORTS.md`](../design/CAMPAIGN_2_0_M2_AFTER_ACTION_REPORTS.md) |
| 2026-08-10 | C20-030: belief-constrained posture, force/reserve/logistics/intelligence/objective assessment, ranked threats/opportunities, private rationale, persistence, and anti-omniscience certification | Implemented and certified as the strategic opponent's legal situation boundary | [`CAMPAIGN_2_0_M3_AI_ASSESSMENT.md`](../design/CAMPAIGN_2_0_M3_AI_ASSESSMENT.md) |
| 2026-08-13 | C20-031: nine operational candidate families, explainable scoring, coordinated force/resource/reserve portfolio selection, difficulty policy, stable commitments, bounded memory, persistence, and tamper validation | Implemented and certified as the strategic opponent's private planning layer | [`CAMPAIGN_2_0_M3_AI_PLANNING.md`](../design/CAMPAIGN_2_0_M3_AI_PLANNING.md) |
| 2026-08-13 | C20-032: plan-to-order behavior translation, exact formation reservations, shared Player/AI order commit, legal movement/intelligence/production actions, multi-segment continuity, and private behavior integrity | Implemented and certified as the strategic opponent's common-rules execution layer | [`CAMPAIGN_2_0_M3_AI_BEHAVIORS.md`](../design/CAMPAIGN_2_0_M3_AI_BEHAVIORS.md) |
| 2026-08-14 | C20-033: belief-safe Bot offensive/counterattack initiation, exact attacker/defender ledger commitment, mandatory campaign interruption, Player defensive precombat, reoriented tactical maps, and role-correct result attribution | Implemented and certified as the strategic opponent's tactical-contact and Player-defense layer | [`CAMPAIGN_2_0_M3_AI_ENGAGEMENTS.md`](../design/CAMPAIGN_2_0_M3_AI_ENGAGEMENTS.md) |
| 2026-08-15 | FCI-001 through FCI-015: first-class interface baseline, ephemeral UI state/events, unified navigator, immutable Player-safe views, CSS tokens, feature fallback, leak assertions, extracted command frame, synchronized selection, typed safe inspectors, compact interaction-tree management, focus restoration, and initial Situation priority | FCI-0 and FCI-1 certified; FCI-2 overlay/map parity and the remaining Situation migration are next | [`CAMPAIGN_FIRST_CLASS_INTERFACE_BASELINE_2026-08-15.md`](./CAMPAIGN_FIRST_CLASS_INTERFACE_BASELINE_2026-08-15.md) |
| 2026-08-15 | FCI-020 through FCI-026 for current domain projections: stable operational-map registry, five projection-safe layers, truthful domain gates, typed hex/front/formation/report inspectors with domain-owned actions, AAR-to-map focus, searchable 272-formation roster, coordinate-safe highlighting, accessible entity lists, compact exclusivity, container responsiveness, and generation-aware performance cache | FCI-2 current-domain exit gate certified; unavailable Supply/Air-Naval/Environment projections remain explicit future gates | [`CAMPAIGN_FIRST_CLASS_INTERFACE_FCI2_MAP_2026-08-15.md`](./CAMPAIGN_FIRST_CLASS_INTERFACE_FCI2_MAP_2026-08-15.md) |
| 2026-08-18 | FCI-030 through FCI-035: commander's brief, one dominant priority, objective/deadline/loss outlook, Player-safe front posture, unified command traffic, persistent acknowledgement, recent/full resolution record, AAR consequence continuation, and outcome save/review/exit/service-record paths | FCI-3 engineering exit gate certified; formal external ten-second participant metric remains a release study | [`CAMPAIGN_FIRST_CLASS_INTERFACE_FCI3_SITUATION_2026-08-18.md`](./CAMPAIGN_FIRST_CLASS_INTERFACE_FCI3_SITUATION_2026-08-18.md) |
| 2026-08-18 | FCI-040 through FCI-046: authoritative common-action discovery, schema-driven planning, draft-aware preview/holds, full editable/reorderable order tray, atomic Player-only commitment, reviewed cancellation, and explicit advance boundary | FCI-4 engineering exit gate certified; formal external thirty-second participant metric remains a release study | [`CAMPAIGN_FIRST_CLASS_INTERFACE_FCI4_ORDERS_2026-08-18.md`](./CAMPAIGN_FIRST_CLASS_INTERFACE_FCI4_ORDERS_2026-08-18.md) |

The current player-facing campaign runs on authoritative Campaign 2.0 runtime and persistence foundations behind a compatibility projection and presents the first Campaign 2.0 command workspace. Redeployment, production, reconnaissance, counterintelligence, and infrastructure reconstruction enter a runtime-owned typed order tray as non-spending drafts with visible holds/conflicts; one explicit commit applies every valid draft atomically, and eligible pre-execution orders can be cancelled with exact refunds. The player can advance three hours, to the next report, to dawn or dusk, or one day; every mode orchestrates ordinary deterministic segment transactions, stops for mandatory decisions, and writes Player-safe alerts plus the exact pause reason into a save-stable timeline. Campaign battles expose named manual checkpoints, visible queued saving at the next stable decision boundary, three rolling turn-start autosaves, landing/campaign browse-and-resume entry points, explicit quarantined-save recovery, and a post-battle autosave chain. Tactical structural damage persists on the campaign map, reduces operational/tactical capacity, receives capture disruption, and can be repaired through exact-cost, on-site supervised reconstruction. Objectives evaluate committed post-battle/post-control truth, drive phases and deadlines, apply typed rewards once, expose score/grade progress, and stop the campaign on recorded victory or defeat. Every resolved campaign battle now files an immutable Player-safe AAR with exact friendly condition, aggregate opponent evidence, resource/control/infrastructure/objective changes, an automatic report archive, and explicit follow-up decisions. The legacy redeployment decision exists only as a typed order's execution adapter. Existing localStorage progress migrates only after verified IndexedDB write-through and remains untouched; only a separate migration marker is added.

## Executive decision

Campaign 2.0 is an overhaul of the campaign product loop, interface, and runtime model. It is not a larger sidebar around the current map.

The campaign must let a player repeatedly:

1. understand a changing theater from incomplete information;
2. form an operational plan;
3. commit formations, logistics, air/naval support, and intelligence effort;
4. advance time and face an opponent acting under the same knowledge rules;
5. fight or delegate battles created by those plans;
6. absorb territorial, material, organizational, and political consequences;
7. rebuild a persistent force and adapt the next plan;
8. win or lose a legible campaign with a remembered service record.

The canonical command loop is:

```text
ASSESS THEATER
      ↓
PLAN OPERATIONS
      ↓
COMMIT ORDERS
      ↓
ADVANCE TIME / RESOLVE BOTH SIDES
      ↓
FIGHT OR DELEGATE ENGAGEMENTS
      ↓
REVIEW CONSEQUENCES
      ↓
REFIT, REPLACE, UPGRADE, AND ADAPT
      └──────────────────────────────→ ASSESS THEATER
```

Five systems close the current genre-critical gaps:

- a consequence engine, objective engine, strategic AI, and campaign end states;
- player-facing named saves, rolling autosaves, and resumable tactical battles;
- persistent core formations with survivors, replacements, upgrades, commanders, honors, and history;
- dynamic weather and accumulated ground conditions that affect campaign and tactical play;
- a campaign command interface built around situation, intent, orders, time, and consequences.

Campaign intelligence, counterintelligence, and fog are already implemented. They are a foundation and must remain the only route through which the player UI and strategic AI learn opposing state.

## Product promise

The player should be able to say:

> “I chose where to concentrate, what risk to accept, and which veterans to commit. The enemy reacted to what it could learn. The battle reflected the place, forces, weather, and support I created. Its survivors and losses changed the next operational problem.”

The campaign is successful when the map is not merely a mission selector. A tactical victory that exhausts the core, loses irreplaceable armor, consumes the air effort, or arrives too late can be an operational failure. A tactical withdrawal that preserves veterans, delays an offensive, and buys reinforcement time can be strategically sound.

## Current-state baseline

This plan is grounded in the repository as of 2026-08-02.

| Capability | Current state | Campaign 2.0 requirement |
|---|---|---|
| Campaign map, control, fronts, resources | Implemented, but mutable scenario definition and runtime state overlap | Separate authored definition, authoritative runtime, and faction-projected view |
| Three-hour campaign segments | Implemented as manual single-step advancement | Add explicit planning/commit/resolution states and event-driven advance controls |
| Strategic redeployment and transport capacity | Implemented | Convert into inspectable orders resolved consistently for both factions |
| Production allocation | Implemented | Connect output to replacements, refit, repair, upgrades, and AI decisions |
| Campaign intelligence/counterintelligence/fog | Core loop implemented | Preserve projection boundary; expand sources only through the intelligence model |
| Campaign-generated tactical battles | Implemented for context, templates, and enemy spawning | Add commitment ledger, environment package, stable formation provenance, and result reconciliation |
| Battle consequences | Placeholder economy deductions and cosmetic front edits | Return survivors, transfer control, retreat, consume support, damage infrastructure, recompute fronts, and emit an AAR |
| Strategic opponent | No autonomous operational opponent | Add a knowledge-limited AI using the same orders, constraints, time, and resources |
| Campaign objectives and end state | Authored objectives exist; no completion engine | Add visible primary/secondary objectives, deadlines, score, victory, defeat, and post-campaign record |
| Campaign saving | One local browser slot, save version 2 | Add a versioned envelope, named slots, autosaves, migrations, integrity checks, and recovery |
| Tactical saving | `GameEngine.serialize()`/`hydrateFromSerialized()` are a partial substrate | Make serialization complete and expose save/load/autosave/resume UX |
| Persistent formation identity | Tactical `unitId`, experience, `formationKey`, and status pools exist | Add campaign-owned formation records and reconcile the same identity through battles |
| Weather and ground state | Authored muddy terrain art exists; no dynamic environment | Add forecasts, weather transitions, accumulated ground state, rules effects, and tactical handoff |
| Campaign interface | Large map plus a long utility sidebar and visible internal editor | Replace with a command workspace; gate authoring tools behind developer mode |
| Testing | Intelligence/generation/render/status tests exist; risky state transitions are thin | Add deterministic simulations, save round trips, consequence invariants, AI soak tests, accessibility, and end-to-end certification |

### Existing assets to reuse

- `CampaignState` already owns segment advancement, economies, redeployment, engagements, and faction knowledge.
- `CampaignIntelligence` and `CampaignMapViewModel` already establish the truth-versus-knowledge boundary.
- `EngagementContextBuilder` and `CampaignBattleGenerator` already translate strategic location and forces into tactical context.
- `GameEngine` already has stable tactical unit IDs, formation status pools, earned/base experience, casualty records, supply systems, bot-planning patterns, and partial serialization/hydration.
- `CampaignMapRenderer`, `MapViewport`, and the existing campaign art provide the map substrate.
- The tactical War Room and after-action surfaces provide presentation patterns that can be adapted rather than duplicated.

### Technical debt this plan resolves

1. `CampaignScenarioData` currently contains both authored content and mutable state such as tile control, forces, and economies.
2. `CampaignState.advanceSegment()` directly mutates several systems in a fixed method without an explicit resolution report or transaction boundary.
3. `CampaignDecision.payload` is free-form, so legal orders, previews, migrations, replay, and AI parity cannot be guaranteed.
4. engagement commitment is not an authoritative reservation; the same force can remain available while a battle is active.
5. `applyBattleOutcome()` applies coarse player-only economy losses and visually edits a front polyline rather than resolving territory and formations.
6. the current bridge sends broad campaign snapshots instead of a narrow engagement package and typed result contract.
7. the existing tactical serialization does not yet prove full restoration of supply ledgers, initiative state, action flags, ally state, reports, support queues, UI context, and deterministic random state.
8. the original campaign design alternates between 5 km and 10 km per hex. `CAMPAIGN_HEX_SCALE_KM` and current battle-generation assumptions use 10 km. Campaign 2.0 makes `scenario.hexScaleKm` authoritative and defaults legacy content to 10 km.

## Product pillars

### 1. Decisions before decoration

Every major campaign panel must answer at least one command question. Weather art, medals, reports, and map animation exist to improve a decision or communicate a consequence.

### 2. One war, two scales

Campaign and tactical play share formation identity, environment, resources, intelligence, and outcomes. Neither layer fabricates a disconnected version of the other.

### 3. Symmetric rules, asymmetric judgment

The strategic AI uses the same order definitions, legal validation, capacity, weather, deadlines, and faction-specific intelligence as the player. Difficulty changes planning quality, risk tolerance, coordination, and error—not hidden information or free resources unless a scenario explicitly declares a handicap.

### 4. Consequences are inspectable

Before commitment, the UI previews known costs, estimated risks, timing, and affected formations. After resolution, the AAR explains what changed and why. Hidden dice may create uncertainty; they may not create unexplained state changes.

### 5. Persistence creates attachment

Formations are named records with histories, not fungible purchase tokens. Loss, refit, promotion, equipment change, and honors remain visible across battles.

### 6. Time is a resource

Orders take segments. Forecasts expire. Reinforcements arrive later. Refitting veterans can leave a front weak. Campaign objectives use deadlines and hold durations to make “when” as important as “where.”

### 7. Failure remains playable

Most defeats change the problem rather than immediately end the campaign. Retreat, fallback objectives, emergency replacements, altered branches, and recovery operations support a campaign story with setbacks.

## Scope

### Required for Campaign 2.0

- authoritative runtime state and deterministic segment resolution;
- typed campaign orders with preview, draft, commit, cancellation, and completion states;
- real battle commitment and complete result reconciliation;
- dynamic territory control, retreat, encirclement/isolation hooks, infrastructure state, economy consequences, and front recomputation;
- primary, secondary, and optional objective evaluation with campaign victory/defeat;
- strategic AI capable of defense, concentration, offensives, reserves, logistics protection, intelligence operations, and counterattacks;
- named manual saves and rolling autosaves for campaign and tactical battle;
- exact battle restoration at supported save boundaries;
- campaign formation registry, replacements, refit, upgrades, honors, commanders, and unit history;
- campaign weather, forecast uncertainty, ground accumulation, and tactical environment handoff;
- first-class campaign shell, workspaces, order tray, alerts, AAR, onboarding, keyboard operation, and responsive behavior;
- schema migrations from current local campaign saves;
- tests and telemetry necessary to tune and safely release the loop.

### Deliberately deferred

- real-time multiplayer, PBEM, and hotseat;
- public campaign/scenario editor and mod packaging;
- cloud saving and cross-device conflict resolution, although storage interfaces must permit them later;
- diplomacy and multiple independent strategic factions;
- a grand-strategy national economy, research tree, or political simulation;
- fully simulated individual soldiers and vehicles at campaign scale;
- freeform tactical battle replay;
- generative campaign content or random theater generation;
- naval tactical combat beyond existing support abstractions;
- weather physics; the environment is a deterministic, data-driven game model.

## Campaign rhythm and arc

### Segment rhythm

One campaign segment remains three hours. The player does not click through every quiet segment by default.

Supported advance commands:

- **Advance 3 hours:** resolve exactly one segment.
- **Advance to next report:** stop for arrival, contact, completed operation, material weather change, objective change, engagement, or critical alert.
- **Advance to dawn / dusk:** stop at the next named time boundary.
- **Advance one day:** stop early for any blocking event.
- **Pause after every resolution:** accessibility and high-control option.

The game always stops for:

- a tactical engagement requiring player choice;
- a primary objective state change;
- an order that cannot continue and requires a decision;
- a formation at risk of destruction due to retreat/isolation;
- campaign victory or defeat;
- a save/load integrity problem.

It may notify without stopping for routine arrivals, production, low-severity reports, forecast changes, and completed low-risk orders, according to player alert preferences.

### Operational rhythm

A typical operation lasts one to several campaign days:

1. reconnaissance and concentration;
2. support allocation and logistics preparation;
3. commitment to an axis or defensive line;
4. one or more tactical engagements;
5. exploitation, consolidation, or withdrawal;
6. replacement/refit and reassessment.

### Campaign arc

Each scenario definition declares phases rather than relying on one 999-turn sandbox:

- **Opening:** establish the situation, initial constraints, and immediate objective.
- **Expansion:** unlock multiple operational choices and optional objectives.
- **Crisis:** enemy reaction, weather shift, supply pressure, or a deadline changes priorities.
- **Decision:** primary objectives and force preservation determine victory grade.
- **Resolution:** service record, formation history, unlocks, and branch selection are presented.

Campaign phase changes can be driven by time, objective state, control, strength, event, or a combination. They are content data evaluated by the same objective engine, not hard-coded screen transitions.

## Campaign command interface

The complete delivery architecture, work-package backlog, acceptance gates, verification matrix, rollout strategy, and legacy-retirement plan are maintained in [`CAMPAIGN_FIRST_CLASS_INTERFACE_IMPLEMENTATION_PLAN.md`](./CAMPAIGN_FIRST_CLASS_INTERFACE_IMPLEMENTATION_PLAN.md). The requirements below remain the authoritative product contract; the interface plan defines how they are implemented and certified.

### Information architecture

The screen becomes a command workspace with stable regions:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ THEATER · DAY/TIME · WEATHER · COMMAND STATUS · RESOURCES · SAVE/SETTINGS  │
├──────────┬──────────────────────────────────────────────┬───────────────────┤
│ Situation│                                              │ Context Inspector │
│ Forces   │              OPERATIONAL MAP                 │ selected hex,     │
│ Logistics│        truth-safe faction projection        │ formation, front, │
│ Intel    │                                              │ objective, order  │
│ Air/Naval│                                              │ or report         │
│ HQ       │                                              │                   │
├──────────┴──────────────────────────────────────────────┴───────────────────┤
│ ORDER TRAY / TIMELINE · drafts · conflicts · ETA · COMMIT · ADVANCE        │
└─────────────────────────────────────────────────────────────────────────────┘
```

On narrow screens, the left rail becomes a bottom workspace switcher, the inspector becomes a dismissible sheet, and the order tray remains a persistent compact bar. The map never shrinks below its minimum useful interaction area to preserve a desktop sidebar.

### Top command bar

Always visible:

- campaign/scenario title and current campaign phase;
- day, segment, local time, and next daylight boundary;
- current weather plus the next forecast change and confidence;
- command state: Planning, Orders Ready, Resolving, Engagement, or Campaign Ended;
- compact player resource deltas with trend indicators;
- unread critical report count;
- save state: Saved, Autosaving, Unsaved, Save Failed;
- pause/settings and save browser access.

The bar does not expose exact opposing economy or forces. Enemy pressure is expressed through objectives, observed contacts, reports, and assessed front strength.

### Left workspace rail

The rail switches the map overlay, list content, and default inspector without changing screens.

#### Situation

- primary and secondary objectives with progress and deadlines;
- fronts, initiative, assessed pressure, and recent change;
- critical alerts and operation summary;
- campaign score projection and loss conditions;
- recommended next action as onboarding assistance, never an automatic order.

#### Forces

- persistent formation roster grouped by core, attached, reserve, committed, in transit, refitting, and destroyed/disbanded;
- filters for type, readiness, experience, commander, location, and availability;
- compare, locate, reinforce, refit, upgrade, rename, and inspect history actions;
- clear distinction between authorized strength, present strength, readiness, and supply.

#### Logistics

- supply sources, throughput routes, interdiction risk, transport capacity, stockpiles, and production;
- map overlays for supply reach, bottlenecks, and projected consumption;
- replacement/refit queues and expected completion;
- industrial allocation and production forecast.

#### Intelligence

- retain Situation, Contacts, and Operations from the shipped intelligence drawer;
- make it a full workspace rather than a secondary drawer;
- show contact provenance, age, confidence, uncertainty, contradictions, and collection coverage;
- allow collection/counterintelligence orders to enter the common order tray.

#### Air and Naval

- airbase/port capacity, ready/in-mission/refitting assets, range, weather availability, and sortie budget;
- allocate reconnaissance, cover, interdiction, ground support, airlift, naval lift, and shore support;
- surface the tactical support a planned engagement will receive and what remains elsewhere.

#### Headquarters

- campaign brief, phase narrative, commander's record, policies/difficulty, doctrine, event log, and tutorials;
- save browser and campaign exit live here and in the top-bar menu;
- developer editor appears only when a build-time or authenticated developer flag is enabled.

### Operational map

The map is the primary planning canvas and supports mutually exclusive overlay modes:

- operational/control;
- forces and readiness;
- objectives and deadlines;
- supply and transport;
- intelligence contacts and collection coverage;
- weather and ground conditions;
- air/naval range and commitments;
- planned orders and predicted paths.

Overlays share a consistent legend and never communicate state by color alone. Unknown and stale enemy state use the existing faction-view projection. Tooltips and DOM attributes may contain only the selected faction's knowledge.

Map interaction rules:

- single click selects without immediately issuing or moving;
- double click focuses and opens the full inspector;
- right click or an Order button opens legal orders for the selection;
- drag selects formations only in Forces mode;
- path/area previews appear before a draft order is added;
- Escape cancels the current gesture, not committed orders;
- orders are never committed by a map click alone;
- invalid destinations explain the blocking rule in place;
- keyboard focus can traverse visible hex markers, fronts, objectives, and formations.

This deliberately removes the current “first friendly click primes movement; second click may execute” ambiguity.

### Context inspector

The right panel uses a stable hierarchy:

1. identity and location;
2. current status;
3. what the player knows and when it was known;
4. consequences and dependencies;
5. legal actions;
6. history and supporting detail.

Selection types:

- **Hex:** control assessment, terrain, ground state, weather, infrastructure, supply, known contacts, legal area orders.
- **Formation:** identity, personnel/equipment/readiness, experience, commander, honors, supply, current order, replacement/refit/upgrade actions.
- **Front:** assessed balance, objectives, orders, reserves, supply posture, recent events.
- **Objective:** conditions, progress, deadline, rewards/penalties, related fronts.
- **Order:** issuer, target, participants, route, cost, start/ETA, risk, dependencies, conflicts, cancellation consequence.
- **Report/contact:** source, time, confidence, uncertainty, contradictions, linked operation.
- **Weather zone:** current/forecast conditions, confidence, ground trend, operational effects.

### Order tray and timeline

All player actions use a shared typed order workflow:

1. choose an action;
2. configure targets, participants, timing, posture, and optional support;
3. preview cost, ETA, known risk, objective effect, and conflicts;
4. add a draft to the order tray;
5. resolve conflicts or remove/reorder drafts;
6. commit all valid drafts;
7. advance time.

The tray displays:

- draft/committed/executing/blocked/completed/cancelled state;
- formation and capacity reservations;
- earliest start and estimated completion;
- resource cost now versus projected consumption;
- warning severity and explicit acknowledgements for extraordinary risk;
- dependency links such as “offensive waits for air reconnaissance”;
- a single Commit Orders action and a separate Advance action.

Committed orders can be cancelled only when their definition permits it. The UI previews sunk cost, delay, and exposure before cancellation.

### Alerts and reports

Notifications have four severities:

- **Routine:** logged, no interruption.
- **Notable:** toast and event feed.
- **Critical:** persistent banner and optional stop.
- **Decision required:** time stops and a choice is presented.

Every alert links to the relevant map location, formation, objective, engagement, or order. Duplicate low-level events are aggregated (“3 redeployments arrived”) while losses and objective changes remain individually inspectable.

### First-session onboarding

The first campaign uses contextual objectives instead of a long modal tutorial:

1. inspect the primary objective;
2. select a formation and read readiness;
3. switch to Intelligence and inspect a contact;
4. draft reconnaissance or redeployment;
5. commit and advance to a report;
6. create an engagement;
7. review the battle consequence AAR;
8. replace losses or begin refit.

Onboarding can be replayed, skipped, and resumed. Tooltips define domain terms such as readiness, assessed strength, committed, isolated, and ground state.

## Authoritative campaign architecture

### Architectural invariants

1. Authored scenario data is immutable after campaign creation.
2. All mutable campaign truth lives in one versioned `CampaignRuntimeState`.
3. Player UI and strategic AI receive faction-specific projections, never raw opposing truth.
4. All state changes occur through typed commands and deterministic resolvers.
5. A segment resolves from a frozen start-of-segment snapshot so neither faction reacts to same-segment hidden movement.
6. Every material mutation emits a typed domain event and appears in a resolution report.
7. Tactical battles receive a frozen engagement package and return a typed result package.
8. Stable IDs, not array positions or display labels, connect formations, orders, objectives, engagements, and events.
9. Save files include deterministic random state and are written only at stable transaction boundaries.
10. Derived values—front polylines, map projections, summaries, warnings—are recomputed and are not competing sources of truth.

### Layer separation

```text
CampaignScenarioDefinition (authored, immutable)
                 +
CampaignRuntimeState (authoritative mutable truth)
                 ↓
       CampaignDomainServices
                 ↓ emits
        CampaignDomainEvent[]
                 ↓ projects
 CampaignViewModel(faction)     StrategicAIInput(faction)
                 ↓                         ↓
               UI                   typed AI orders
```

The current `CampaignScenarioData` is migrated into these layers. Existing JSON remains loadable through an adapter; content authors do not have to rewrite every scenario at once.

### Proposed top-level contracts

Names are normative; field details may be refined during implementation without weakening the invariants.

```ts
interface CampaignScenarioDefinition {
  schemaVersion: number;
  key: string;
  title: string;
  description: string;
  hexScaleKm: number;
  map: CampaignMapDefinition;
  factions: CampaignFactionDefinition[];
  initialState: CampaignInitialStateDefinition;
  objectives: CampaignObjectiveDefinition[];
  phases: CampaignPhaseDefinition[];
  events: CampaignEventDefinition[];
  climate: CampaignClimateDefinition;
  difficultyPolicies: CampaignDifficultyPolicy[];
}

interface CampaignRuntimeState {
  runtimeVersion: number;
  campaignId: string;
  scenarioKey: string;
  scenarioContentHash: string;
  status: "planning" | "resolving" | "engagement" | "victory" | "defeat";
  currentSegment: number;
  currentPhaseKey: string;
  rng: SerializedRandomState;
  factions: Record<string, CampaignFactionRuntime>;
  tiles: Record<string, CampaignTileRuntime>;
  infrastructure: Record<string, CampaignInfrastructureRuntime>;
  formations: Record<string, CampaignFormationRecord>;
  orders: Record<string, CampaignOrder>;
  engagements: Record<string, CampaignEngagementRecord>;
  objectives: Record<string, CampaignObjectiveRuntime>;
  weather: CampaignWeatherRuntime;
  knowledgeByFaction: Record<string, CampaignKnowledgeState>;
  eventLog: CampaignDomainEvent[];
  lastResolution: CampaignResolutionReport | null;
}

interface CampaignTileRuntime {
  hexKey: string;
  controller: CampaignFactionKey;
  controlSinceSegment: number;
  contestState: "secure" | "threatened" | "contested";
  formationIds: string[];
  infrastructureIds: string[];
  ground: CampaignGroundState;
}

interface CampaignFactionRuntime {
  faction: CampaignFactionKey;
  economy: CampaignEconomyRuntime;
  transport: CampaignTransportRuntime;
  airNaval: CampaignAirNavalRuntime;
  replacementPools: CampaignReplacementPools;
  commandPolicy: CampaignCommandPolicy;
  score: CampaignScoreRuntime;
}
```

### Domain services

| Service | Responsibility |
|---|---|
| `CampaignOrderService` | Create, validate, preview, reserve, commit, cancel, and query typed orders |
| `CampaignSegmentResolver` | Own the deterministic segment transaction and aggregate its report |
| `CampaignMovementResolver` | Route progress, contact, delay, retreat, and arrival |
| `CampaignLogisticsService` | Stockpiles, throughput, consumption, transport, isolation, production, repair/refit queues |
| `CampaignConsequenceResolver` | Apply tactical results to formations, control, infrastructure, support, economy, and events |
| `CampaignControlService` | Resolve contested control and recompute derived fronts from tile ownership |
| `CampaignObjectiveEvaluator` | Evaluate progress, phase changes, score, victory, and defeat |
| `StrategicAIPlanner` | Produce legal typed orders from a faction projection and policy |
| `FormationLifecycleService` | Create formations, apply losses/experience, replace, refit, upgrade, honor, attach, and disband |
| `CampaignWeatherService` | Generate deterministic weather, forecasts, transitions, accumulation, and environment effects |
| `CampaignIntelligenceService` | Existing faction knowledge, operations, decay, deception, briefing, and projections |
| `CampaignSaveService` | Envelope creation, validation, atomic slot writes, migrations, recovery, and metadata |
| `CampaignViewProjector` | Produce sanitized campaign UI/AI read models |
| `CampaignEventLog` | Append immutable, typed, localized event facts and build AAR timelines |

### Typed order model

Replace free-form `CampaignDecision.payload` for game actions. A legacy adapter may convert existing queued redeploy decisions.

```ts
type CampaignOrder =
  | RedeployOrder
  | OffensiveOrder
  | DefendOrder
  | FortifyOrder
  | ReconnaissanceOrder
  | CounterIntelligenceOrder
  | AirOperationOrder
  | NavalSupportOrder
  | ReplacementOrder
  | RefitOrder
  | UpgradeOrder
  | ProductionOrder;

interface CampaignOrderBase {
  id: string;
  faction: CampaignFactionKey;
  kind: string;
  status: "draft" | "committed" | "executing" | "blocked" | "completed" | "cancelled";
  issuedSegment: number;
  earliestStartSegment: number;
  targetHexKeys: string[];
  formationIds: string[];
  dependencies: string[];
  reservationIds: string[];
  acknowledgementKeys: string[];
}
```

Order-specific types define their complete payload. Validation returns machine-readable error codes plus player copy. The same validator is used by UI, AI, tests, and save hydration.

### Deterministic segment resolution

Each segment is a transaction:

1. validate runtime invariants and create the pre-resolution autosave;
2. freeze each faction's legal start-of-segment view;
3. have the strategic AI produce orders from its frozen faction projection;
4. commit valid player and AI drafts and lock reservations;
5. advance weather and apply forecast/ground-state transitions scheduled for this boundary;
6. activate eligible orders and calculate environment-adjusted progress;
7. resolve movement simultaneously, then contact, interception, arrival, and retreat;
8. resolve logistics flow, consumption, isolation, production, replacement, refit, and upgrade work;
9. resolve air/naval/intelligence operations and update faction knowledge;
10. create, update, or cancel engagement opportunities based on contact and orders;
11. apply queued delegated/tactical result packages through the consequence resolver;
12. resolve tile control and recompute fronts from control adjacency;
13. evaluate objectives, phase transitions, score, victory, and defeat;
14. append events, create a `CampaignResolutionReport`, refresh projections, and write the post-resolution autosave.

Within a step, records resolve in a documented stable sort such as priority, start segment, then ID. Random draws come from named deterministic streams (`weather`, `movement`, `intelligence`, `aiTieBreak`, `delegatedCombat`) so changes to one subsystem do not silently reroll all others.

If a resolver throws or violates an invariant, the transaction is discarded, the pre-resolution state remains authoritative, and the player receives a recoverable error with a diagnostic ID.

## Complete consequence loop

### Engagement lifecycle

```text
opportunity → planned → committed → inBattle → resolved
                         ↘ cancelled     ↘ abandoned/recovered
```

- **Opportunity:** contact and orders create a possible battle; no formations are reserved.
- **Planned:** player has configured commitment and support in a draft.
- **Committed:** formation, transport, sortie, and supply reservations are authoritative.
- **In battle:** a frozen `CampaignBattlePackage` owns the committed state; campaign time is paused for that engagement in the initial release.
- **Resolved:** a validated result package has been applied exactly once.
- **Cancelled:** reservations are released according to cancellation rules.
- **Abandoned/recovered:** a save-safety state for an interrupted or invalid tactical session; it cannot duplicate returns.

Every engagement has an idempotency key. Applying the same result twice is a no-op with a diagnostic event.

### Commitment rules

- Committed formations remain in the campaign registry but enter status `committed` and cannot receive another incompatible order.
- The commitment ledger stores pre-battle personnel, equipment, supply, experience, location, and support reservations.
- Tactical units spawned from a formation carry `campaignFormationId` and a stable `campaignElementId` when one campaign formation creates multiple tactical elements.
- Available tactical allocation is bounded by committed formations. Requisition purchases cannot create uncommitted combat formations.
- Consumables and temporary support are separately reserved from faction economy and capacity.
- Air/naval support reserves sortie/capacity windows; it is not consumed as a ground formation unless the battle result reports actual losses.
- An engagement cannot launch until all reservations validate against the same campaign revision.

### Tactical result contract

```ts
interface CampaignBattleResultPackage {
  packageVersion: number;
  engagementId: string;
  campaignRevision: number;
  resolutionId: string;
  result: "attackerVictory" | "defenderVictory" | "stalemate" | "withdrawal";
  endedAtTacticalTurn: number;
  objectiveResults: TacticalObjectiveResult[];
  formationDeltas: FormationBattleDelta[];
  supportDeltas: CampaignSupportDelta[];
  resourcesConsumed: CampaignResourceDelta;
  infrastructureDamage: CampaignInfrastructureDamage[];
  observedEvidenceByFaction: Record<string, TacticalEvidenceReport[]>;
  honorsRecommended: CampaignHonorRecommendation[];
  integrityHash: string;
}

interface FormationBattleDelta {
  campaignFormationId: string;
  committedElementIds: string[];
  personnelBefore: number;
  personnelAfter: number;
  equipmentBefore: Record<string, number>;
  equipmentAfter: Record<string, number>;
  readinessAfter: number;
  cohesionAfter: number;
  fatigueGained: number;
  experienceGained: number;
  supplyAfter: CampaignFormationSupply;
  status: "survived" | "shattered" | "destroyed" | "captured" | "withdrew";
}
```

The result package contains facts observed by each faction separately. It does not automatically reveal the complete opposing order of battle.

### Applying a battle result

The consequence resolver performs these steps atomically:

1. verify the engagement, campaign revision, package version, integrity hash, and unused resolution ID;
2. reconcile every committed formation and reject unknown or duplicate provenance;
3. apply personnel, equipment, supply, readiness, cohesion, fatigue, experience, and commander changes;
4. return survivors to their origin, exploitation destination, reserve, or a legal retreat hex according to the engagement result and order posture;
5. mark destroyed, captured, or shattered formations and preserve their history records;
6. apply air/naval losses and release remaining capacity;
7. consume reserved resources and refund only explicitly unused recoverable stock;
8. apply infrastructure damage and capture rules;
9. resolve contested tile control and retreat paths;
10. recompute fronts from actual control;
11. update faction knowledge using only faction-specific evidence;
12. evaluate objectives and campaign state;
13. create a consequence AAR and post-battle autosave.

### Territory and control

Control is a tile runtime field, not a front-line drawing.

- attacker victory normally transfers the battle hex after defenders retreat or are eliminated;
- defender victory preserves control and may force the attacker back;
- stalemate leaves control contested and applies posture-specific fallback;
- withdrawal yields control only when the opposing faction can occupy it;
- empty territory does not automatically change hands at arbitrary distance; legal occupation/supply rules apply;
- amphibious and airborne operations require a valid lodgment or surviving extraction/transport;
- control changes stamp `controlSinceSegment` for hold-duration objectives;
- fronts are a derived view of opposing controlled adjacency and are never manually shortened to simulate movement.

### Retreat, isolation, and destruction

Initial rules:

- retreat prefers a friendly-controlled, supplied, unoccupied or stack-legal adjacent hex away from observed enemy pressure;
- fallback orders and designated rally points influence selection;
- a formation with no legal retreat may become isolated, shattered, captured, or destroyed based on result severity and scenario rules;
- retreat consumes movement/readiness and may abandon damaged heavy equipment;
- the player sees the predicted retreat hierarchy before committing when enough information is available;
- encirclement penalties are introduced through supply/isolation and retreat legality, not an unexplained combat multiplier.

### Infrastructure and economy

Infrastructure runtime tracks owner, integrity, capacity, damage, repair work, and disabled state.

- captured infrastructure may begin damaged and unavailable;
- ports/airbases/logistics hubs change supply, transport, sortie, and production capacity;
- battle and air-operation damage is explicit in the result/event package;
- repair requires supplies, manpower/engineering capacity, and time;
- demolition/scorched-earth is scenario-controlled and produces a visible order and consequence;
- campaign casualties do not subtract manpower a second time if they are already reconciled through formation personnel;
- equipment loss, replacements, fuel, ammo, and general supplies use distinct ledgers.

### After-action report

The campaign AAR is a required transition, not a toast. It contains:

- result and tactical objective summary;
- map before/after with control and front changes;
- committed formations and survivor/loss changes;
- promoted, honored, shattered, destroyed, or leaderless formations;
- equipment lost, recovered, captured, or newly available;
- resources and support capacity consumed;
- infrastructure captured/damaged;
- intelligence gained and uncertainty that remains;
- campaign objective/phase/score changes;
- immediate decisions required and recommended next review.

“Continue” returns to the Situation workspace focused on the most consequential change. The full report remains in the event log.

## Objectives, victory, defeat, and campaign score

### Objective definitions

```ts
type CampaignObjectiveCondition =
  | ControlHexCondition
  | HoldHexCondition
  | PreserveFormationCondition
  | DestroyOrReduceFormationCondition
  | MaintainSupplyCondition
  | CompleteOperationCondition
  | SurviveUntilCondition
  | ResourceThresholdCondition
  | CompositeCondition;

interface CampaignObjectiveDefinition {
  key: string;
  title: string;
  description: string;
  category: "primary" | "secondary" | "optional" | "failure";
  visibility: "briefed" | "revealedByEvent" | "secretUntilResolved";
  conditions: CampaignObjectiveCondition[];
  completionMode: "all" | "any" | "score";
  deadlineSegment?: number;
  holdSegments?: number;
  score: number;
  rewards: CampaignRewardDefinition[];
  failureConsequences: CampaignConsequenceDefinition[];
}
```

The evaluator is data-driven and produces progress explanations. Examples: “Hold Caen for 5 more segments,” “2 of 3 supply hubs operational,” “7th Armored must retain 35% equipment,” or “Port capacity is below the required threshold.”

### Campaign end-state rules

- **Victory:** required victory expression is satisfied and no terminal failure condition overrides it.
- **Defeat:** a terminal failure expression is satisfied, command viability is lost, or a required deadline expires.
- **Continue after outcome:** optional sandbox continuation may be offered by scenario policy, clearly separated from the recorded result.
- **No surprise end:** critical failure conditions are visible from the beginning or explicitly revealed by a narrative event before they can fire.

### Victory grades

Default grades:

- **Decisive victory:** all primary objectives, high optional score, key formation preservation, and deadline standard.
- **Victory:** required primary objectives completed.
- **Costly victory:** campaign won with severe force, time, or infrastructure penalties.
- **Draw / negotiated result:** scenario-specific score band.
- **Defeat:** terminal failure or insufficient score.

Grades affect service record, branch/unlock data, formation honors, and future starting resources where the campaign content supports continuation. Difficulty does not erase a valid victory; it is recorded alongside the grade.

### Score transparency

The Situation workspace shows:

- completed and remaining objective score;
- deadline pressure;
- force preservation and collateral/infrastructure factors if used;
- the current projected grade as an estimate;
- the exact rule source for every awarded or lost point after it resolves.

## Strategic campaign AI

### Player-facing standard

The opponent must create an operational problem, not just move toward the nearest weak hex. It should:

- protect decisive objectives and supply nodes;
- identify threatened sectors from its own reports;
- concentrate enough force instead of feeding units piecemeal;
- retain and commit reserves;
- attack when local conditions and timing support it;
- withdraw or trade space when preservation is better;
- exploit player overextension and supply disruption;
- use reconnaissance, counterintelligence, concealment, and deception;
- account for weather, ground, daylight, support, and arrival times;
- produce counterattacks and generated defensive tactical battles;
- have readable intent in AARs without exposing hidden plans beforehand.

### Information boundary

`StrategicAIPlanner` receives:

- complete friendly truth for its faction;
- known map and scenario briefing facts;
- its faction's `CampaignKnowledgeState` and projected enemy contacts;
- public objective and event state;
- its own committed plans and policies;
- legal order previews from common services.

It does not receive raw opposing formations, economy, transport, orders, or unobserved control. Debug builds may compare belief to truth in a separate inspector that cannot enter production UI or logs.

### Planning hierarchy

The planner works at four levels:

1. **Strategic posture:** preserve, delay, balanced, pressure, or decisive offensive based on objectives, time, score, and estimated force health.
2. **Operational plans:** defend objective, reinforce front, prepare offensive, counterattack, withdraw, rebuild reserve, protect logistics, interdict supply, or gather intelligence.
3. **Resource allocation:** assign formations, support, logistics, reconnaissance, and replacement/refit capacity across plans.
4. **Typed orders:** create legal orders using the same `CampaignOrderService` as the player.

### Candidate generation and scoring

For each planning cycle:

1. build a belief-constrained situation assessment;
2. identify objective urgency, threats, opportunities, and uncertainty;
3. generate several legal operational plan candidates;
4. simulate a coarse, bounded forecast over a few segments using assessed ranges rather than hidden truth;
5. score candidates for objective value, local force adequacy, time, supply, weather, exposure, reserve health, information confidence, and downside;
6. choose a portfolio that fits command/resource constraints;
7. translate it into typed orders and retain a private rationale trace.

Initial scoring is heuristic and data-driven. It does not require an opaque learning model. Deterministic tie-breaking makes failures reproducible.

### Operational memory

The AI stores:

- active plan IDs and intended phases;
- assigned formations and reserve thresholds;
- assumptions made from contacts;
- triggers for continue, reinforce, exploit, abort, or withdraw;
- observed plan outcomes and recent failures;
- a bounded repetition penalty to avoid oscillating orders.

It does not instantly abandon a multi-segment concentration because one score changed slightly. Hysteresis and commitment thresholds make behavior legible.

### Difficulty policy

| Dimension | Easier | Standard | Harder |
|---|---|---|---|
| Planning horizon | Short | Moderate | Longer bounded forecast |
| Candidate breadth | Few | Several | More coordinated portfolios |
| Intelligence prioritization | Sometimes inefficient | Competent | Strong corroboration and collection timing |
| Reserve discipline | Loose | Sound | Strong, objective-aware |
| Risk tolerance | Predictable/conservative | Contextual | Contextual with feints and calculated risks |
| Reaction delay | Longer | Normal | Shorter, never same-segment omniscience |
| Logistics planning | Basic | Protects main routes | Proactive redundancy/interdiction |
| Mistakes | Explicit policy budget | Occasional | Rare |

Resource or combat bonuses are separate scenario handicaps and must be disclosed. They are not silently bundled into intelligence or planner difficulty.

### Strategic battle delegation

The first release may require the player to fight all critical battles. If autoresolve/delegation is added, it must:

- use the same committed formation and environment package;
- resolve with a deterministic, inspectable model;
- produce the same result contract and consequence pipeline;
- avoid better outcomes merely because the battle was not played;
- communicate expected result ranges before delegation;
- be disabled for tutorial or authored set-piece battles when required.

### AI quality gates

- no truth access in production planner inputs;
- no illegal or free orders;
- no double commitment of formations/capacity;
- can defend, reinforce, attack, counterattack, withdraw, and refit in scripted fixtures;
- completes 500 seeded campaign-day soak runs without invariant failure;
- does not oscillate the same formation between two orders beyond the configured threshold;
- creates meaningful engagements in the baseline campaign without designer scripting;
- decision time stays inside the performance budget;
- rationale traces reproduce every chosen order in development builds.

## Save, load, autosave, and recovery

### Product requirements

Players can:

- save a campaign to multiple named manual slots;
- see campaign title, day/time, phase, last event, play time, result/difficulty, and thumbnail metadata;
- overwrite, rename, duplicate, delete, import, and export with confirmation where destructive;
- resume the most recent safe state from the landing screen;
- save a tactical battle at supported moments and resume directly into it;
- understand when saving is temporarily unavailable and how long until the next stable boundary;
- recover from a corrupted newest autosave using older rolling autosaves;
- keep current local progress through schema migrations.

### Unified save envelope

```ts
interface FourStarSaveEnvelope {
  envelopeVersion: number;
  saveId: string;
  slotType: "manual" | "autosave" | "checkpoint";
  gameMode: "campaign" | "battle";
  createdAt: string;
  updatedAt: string;
  buildVersion: string;
  contentVersion: string;
  scenarioKey: string;
  campaignId: string | null;
  engagementId: string | null;
  display: SaveDisplayMetadata;
  payload: CampaignSavePayload | StandaloneBattleSavePayload;
  checksum: string;
}

interface CampaignSavePayload {
  runtime: CampaignRuntimeState;
  activeBattle: ActiveCampaignBattleSave | null;
  commanderRosterLink: string | null;
  uiResumeContext: CampaignUIResumeContext;
}

interface ActiveCampaignBattleSave {
  engagementPackage: CampaignBattlePackage;
  battle: CompleteSerializedBattleState;
  tacticalUI: TacticalUIResumeContext;
}
```

Campaign saves own campaign-linked battle saves. A tactical save cannot be copied into another campaign or applied to a different engagement revision.

### Tactical serialization completeness gate

The existing `SerializedBattleState` is a useful starting point, not acceptance proof. Before exposing the save button, serialize and hydrate all authoritative battle state, including:

- player, Bot, Ally, reserve, airborne, and stacked placements with stable IDs/status;
- battle phase, active faction, turn, initiative queue/current activation, and acted/action flags;
- supply stocks, per-unit ammo/fuel, depots, convoy reservations, priorities, histories needed for rules, maintenance/care work;
- air missions, assignments, refit, ammunition, AA counters, and reports;
- objectives, ownership/progress, awarded keys, result status, turn limit, and campaign package link;
- intelligence contacts, reports, counterintelligence operations/resources, and faction separation;
- support assets, queued actions, impact events needed for future resolution, cooldowns, and requisitions;
- entrenchment, tow/sentry/suppression/facing, hex modifications, smoke lifetime, and fortification integrity;
- bot/ally planner state required for deterministic continuation;
- deterministic RNG state and monotonic ID counters;
- combat and event logs required by the current AAR;
- precombat allocation, commander, mission metadata, and campaign bridge package;
- minimal UI resume context: selected formation/hex, overlay, open panel, camera/zoom, animation speed, and accessibility settings reference.

Ephemeral visual effects, audio playback positions, hover state, caches, and derived previews are intentionally excluded. Loading recreates them safely.

### Stable save boundaries

Manual battle saving is allowed:

- during deployment after a completed placement action;
- during a player decision phase when no combat/air animation or resolver transaction is active;
- at the start or end of a complete activation/initiative group;
- after turn resolution and before the next player action.

If the player requests a save during an animation or atomic resolution, the UI shows “Save queued” and writes at the next stable boundary. It never snapshots half-applied damage.

### Autosave policy

Keep rolling autosaves by campaign:

- `campaign-before-segment` — immediately before a committed resolution;
- `campaign-after-segment` — after a successful resolution;
- `campaign-before-battle` — after commitment, before tactical initialization;
- `battle-turn-start` — at the start of each player tactical turn;
- `battle-before-exit` — before returning to title/closing when stable;
- `campaign-after-battle` — after consequence reconciliation;
- `campaign-checkpoint` — phase transition or primary objective milestone.

Default retention: three recent segment pairs, three tactical turn starts, the latest pre/post battle pair, and authored checkpoints. Retention is data/configurable and bounded by storage quota.

### Integrity and atomicity

- serialize to a temporary record;
- validate schema and invariants;
- compute checksum;
- persist payload;
- read back and verify checksum;
- atomically update the slot index pointer;
- only then retire an older rolling save.

Browser storage implementation should use IndexedDB for payloads and localStorage only for a small index/migration marker. Storage is behind `SaveRepository`, enabling a future cloud repository.

On corruption:

1. quarantine the bad record;
2. retain its metadata and diagnostic reason;
3. offer the newest verified earlier autosave;
4. never silently start a new campaign or overwrite the corrupt slot;
5. support exporting the quarantined file for diagnosis.

### Save migrations

Migrations are ordered, pure transformations tested with checked-in fixtures.

- Current `fourstar.campaign.save.v1` snapshots migrate from `saveVersion` 1/2 into the new runtime.
- Authored scenario definition is resolved by key and content hash; mutable tile control, forces, economies, engagements, segment, and knowledge move into runtime state.
- Legacy aggregate force counts receive deterministic formation IDs.
- Missing environment state is seeded from scenario climate at the saved segment, using a migration seed that does not reroll after load.
- Missing objective runtime is evaluated from migrated control/state without granting duplicate rewards.
- Existing pending engagements become opportunities unless they can be proven committed; no forces are silently removed.
- Unknown future versions are rejected read-only with a clear compatibility message.

Migration never mutates the original save until the new envelope validates. The old record remains available until the player successfully loads and a new save is written.

## Persistent core formations

### Product model

A campaign formation is a stable organizational record. Tactical `ScenarioUnit` objects are battle representations of that record, not the campaign source of truth.

```ts
interface CampaignFormationRecord {
  id: string;
  faction: CampaignFactionKey;
  ownership: "core" | "attached" | "auxiliary";
  name: string;
  formationKey: string;
  equipmentPackageKey: string;
  locationHexKey: string | null;
  status: "ready" | "committed" | "inTransit" | "isolated" | "refitting" | "shattered" | "destroyed" | "captured";
  personnel: CampaignPersonnelState;
  equipment: CampaignEquipmentState;
  readiness: number;
  cohesion: number;
  fatigue: number;
  experience: CampaignExperienceState;
  supply: CampaignFormationSupply;
  commanderId: string | null;
  honors: CampaignHonorAward[];
  battleHistory: CampaignFormationHistoryEntry[];
  currentOrderId: string | null;
  createdSegment: number;
  retiredSegment: number | null;
}
```

Reuse tactical `FormationStatus` concepts for authorized personnel/equipment and condition, but define an explicit adapter. Campaign state must not import and mutate live `ScenarioUnit` instances.

### Core, attached, and auxiliary

- **Core:** persists through the full linked campaign; player can name, refit, upgrade, and build history.
- **Attached:** persists while assigned by campaign content; retains losses/history and may become unavailable later.
- **Auxiliary:** created for a specific battle/operation; consequences still matter to objectives and score, but it does not consume core slots or necessarily continue.

The UI marks provenance clearly. Players are never surprised that an attached formation left after an operation.

### Experience and cohesion

- Tactical intentional actions continue to earn experience through existing base/earned experience mechanisms.
- Battle result reconciliation converts earned tactical experience into the campaign record exactly once.
- Replacements dilute experience based on the proportion and quality of incoming personnel/equipment.
- Cohesion represents organizational integrity and recent disruption; fatigue represents accumulated exertion.
- Readiness is derived from personnel, equipment, cohesion, fatigue, supply, commander, and current work state.
- Rest restores fatigue quickly when supplied; cohesion and heavy equipment take longer.
- Experience is capped and banded for UI; exact internal values remain available in detailed inspection.

### Replacements

Replacement is an order with cost, location, capacity, and time.

- requires a valid supply connection or eligible logistics hub;
- draws personnel and equipment from separate pools;
- can prioritize emergency personnel, equipment recovery, or full rebuild;
- takes longer and costs more for heavy/specialized formations;
- may reduce experience and cohesion;
- cannot instantly repair a formation currently committed or isolated;
- previews restored strength, expected readiness, completion segment, resource cost, and experience dilution;
- supports player-set priority across a queue;
- uses the same rules for AI.

Shattered formations can be rebuilt if their cadre survives and scenario policy permits it. Destroyed formations remain in history; purchasing a replacement creates a new identity unless a specific reconstitution rule preserves lineage.

### Refit and repair

- **Rest:** reduces fatigue with minimal cost.
- **Reorganize:** restores cohesion and integrates replacements.
- **Repair:** restores damaged recoverable equipment using parts/supplies and workshop capacity.
- **Refit:** combines reorganization, repair, and resupply; formation unavailable for its duration.
- **Emergency refit:** faster, less efficient, caps resulting readiness.

The Forces and Logistics workspaces show queue position, capacity bottleneck, time, and interruption cost.

### Equipment upgrades

Upgrades are data-defined paths between compatible equipment packages.

- availability is gated by date/event/objective/scenario policy, not a hidden global list;
- cost is the net equipment/manpower/training requirement, with recovery credit for returned equipment when appropriate;
- upgrade requires an eligible location and downtime;
- the UI compares attack/defense/mobility/supply implications using existing formation definitions;
- changing equipment does not erase formation identity, history, commander, or honors;
- major role conversion may impose a larger cohesion/readiness penalty;
- AI uses the same upgrade availability and queue.

### Commanders, leaders, and honors

- formation commanders are distinct from the player's theater general;
- commander effects are bounded, visible, and tied to formation role/readiness rather than large opaque bonuses;
- commanders can gain traits through authored triggers and repeated behavior;
- wounds, removal, transfer, and replacement are campaign events;
- honors use data-defined triggers evaluated from battle/campaign facts;
- recommended honors are confirmed by the consequence resolver to prevent duplicates;
- honors primarily create identity and modest specialization, not runaway power;
- formation history records engagements, result, losses, experience, commander, equipment, objective contribution, and awards.

### Formation management UX

The formation card shows at a glance:

- name/type/ownership and location;
- personnel and key equipment versus authorized strength;
- readiness, cohesion, fatigue, and supply;
- experience band and commander;
- current order/status and availability time;
- recent loss/change badge.

The detail view adds replacement sources, equipment breakdown, upgrade comparison, complete history, honors, and exact causes of readiness limits. Bulk replacement/refit is supported, but every queued action remains inspectable before commitment.

## Dynamic weather and ground conditions

### Product standard

Weather is an operational forecast, a campaign constraint, a tactical condition, and an accumulated effect on the ground. It is not a random combat modifier or visual tint.

The player must be able to answer:

- what is happening now;
- what is forecast and how certain it is;
- when a change is expected;
- which routes, formations, air missions, and battles it affects;
- whether the ground is improving or deteriorating;
- how the forecast influenced a delayed or risky order.

### Environment model

```ts
type CampaignWeatherKind =
  | "clear" | "fair" | "overcast" | "rain" | "heavyRain"
  | "storm" | "fog" | "snow" | "heavySnow" | "blizzard";

type CampaignGroundKind = "dry" | "damp" | "wet" | "mud" | "frozen" | "snow" | "deepSnow" | "thaw";

interface CampaignWeatherCell {
  id: string;
  zoneKey: string;
  kind: CampaignWeatherKind;
  intensity: number;
  temperatureC: number;
  windDirection: number;
  windSpeed: number;
  visibilityKm: number;
  cloudCeilingM: number | null;
  startedSegment: number;
  expectedEndSegment: number | null;
}

interface CampaignGroundState {
  kind: CampaignGroundKind;
  moisture: number;
  snowDepthCm: number;
  frozenDepth: number;
  lastChangedSegment: number;
}

interface CampaignWeatherForecast {
  issuedSegment: number;
  validFromSegment: number;
  validToSegment: number;
  zoneKey: string;
  predictedKind: CampaignWeatherKind;
  confidenceBand: "low" | "moderate" | "high";
  timingWindowSegments: number;
}
```

Weather zones allow different conditions across a large theater without per-hex simulation. Ground state remains per tile or compressed region and accumulates from precipitation, temperature, terrain drainage, traffic, and time.

### Deterministic generation

- scenario climate defines season, regional transition tables, daylight, temperature ranges, and exceptional events;
- named RNG streams select transitions at scheduled boundaries;
- neighboring zones influence movement of weather cells;
- saves persist current cells, forecasts, ground state, and RNG state;
- reloading never rerolls weather;
- authored scenarios can pin or schedule conditions for set pieces while still using the same effects system.

### Forecasts

- current weather is known in friendly-observed areas and at friendly installations;
- theater forecasts cover broader zones with confidence and timing windows;
- meteorological capability can be scenario-static initially and later modified by airfields/intelligence;
- forecasts may be wrong within declared bounds, never retroactively deceptive;
- orders preview both current effects and forecast risk across their expected duration;
- material forecast changes generate reports and may stop “advance until event.”

### Rules effects

All effects live in data tables and use named modifiers. Initial categories:

| Condition | Campaign effects | Tactical effects |
|---|---|---|
| Clear/fair | Baseline movement, collection, air operations | Baseline visibility/combat |
| Overcast | Lower aerial collection confidence, some sortie limits | Lower spotting/air effectiveness |
| Rain | Reduced off-road movement, route wear, lower air availability | Reduced visibility/accuracy, movement changes |
| Heavy rain/storm | Delays transport, degrades supply throughput, grounds some missions | Severe visibility, air/support restrictions, wet-ground movement |
| Fog | Conceals movement and contacts; can delay air/naval timing | Short visibility, air missions restricted, engagement ranges affected |
| Snow | Slower movement/supply, visible tracks may aid collection | Movement/visibility and equipment reliability effects |
| Blizzard | Major delay/isolation risk, air operations mostly unavailable | Severe visibility, movement, readiness/fatigue pressure |
| Mud | Strong off-road movement and throughput penalty | Terrain movement and vehicle reliability penalty |
| Frozen ground | Improves some off-road movement; cold readiness cost | Mobility improvement on soft ground plus cold effects |
| Thaw | Rapid mud growth and route degradation | Escalating mobility/reliability penalty |

Implementation rules:

- avoid blanket percentage stacks; central services calculate an explained composite effect;
- road movement and off-road movement are distinct;
- tracked, wheeled, foot, air, and naval assets respond differently;
- weather affects intelligence source reliability/availability through the existing report pipeline;
- campaign and tactical effects reference the same environment definitions but use scale-appropriate values;
- mission UI lists active effects and their sources;
- AI order preview uses identical effect calculations.

### Tactical handoff and transitions

`CampaignBattlePackage` includes a frozen `BattleEnvironmentPlan`:

- battle-start weather and ground state for the battle location;
- daylight and local start time;
- a deterministic tactical weather timeline for plausible changes during a long battle;
- effect-definition version;
- forecast shown to the player before commitment.

The tactical engine owns that frozen plan while the battle is active. It does not query live campaign weather. On return, the campaign advances only according to explicit battle-duration policy; it does not apply tactical weather back to unrelated campaign zones.

Tactical requirements:

- environment appears in briefing, HUD, map rendering, tooltips, and combat/movement previews;
- transitions occur only at stable tactical boundaries and are announced;
- combat, LOS/spotting, movement, supply, air, and AI query a central `BattleEnvironmentService`;
- weather visuals never obscure selection, legal moves, objectives, or text contrast;
- reduced-motion settings replace animated precipitation with static indicators;
- save/load preserves the exact environment timeline and current index.

### Weather workspace UX

- top bar shows current local condition and next material forecast;
- weather overlay displays zones, motion arrows, timing ranges, and ground shading;
- timeline scrubbing previews forecasts, clearly styled as prediction rather than truth;
- route/order previews list affected segments and expected delay range;
- inspector explains current modifiers in plain language;
- AAR attributes weather-caused delays or availability changes to the exact condition.

## Campaign-to-tactical integration

### Narrow bridge

Replace broad `CampaignBridgeState` use for battle launch with a purpose-built package:

```ts
interface CampaignBattlePackage {
  packageVersion: number;
  campaignId: string;
  campaignRevision: number;
  engagementId: string;
  battleHexKey: string;
  attacker: CampaignFactionKey;
  defender: CampaignFactionKey;
  mission: CampaignMissionType;
  templateKey: string;
  objectivePackage: CampaignTacticalObjectivePackage;
  committedFormations: CampaignFormationCommitment[];
  supportCommitments: CampaignSupportCommitment[];
  resourceReservation: CampaignResourceReservation;
  playerBriefing: CampaignIntelligenceBriefing;
  botBriefing: CampaignIntelligenceBriefing;
  environment: BattleEnvironmentPlan;
  contentHash: string;
}
```

The battle generator may use true committed enemy facts to instantiate the engine, but player-facing precombat reads only `playerBriefing`. No true enemy force ratio enters player markup, analytics, logs, or accessible text.

### Formation adapter

`CampaignFormationBattleAdapter`:

- converts each commitment into one or more tactical `ScenarioUnit` records;
- preserves stable provenance IDs;
- maps campaign personnel/equipment/readiness to tactical status pools;
- applies equipment package and commander effects;
- marks core/attached/auxiliary ownership for AAR presentation;
- converts complete tactical end state back into `FormationBattleDelta`;
- verifies conservation rules for personnel, equipment, experience, supply, and IDs.

### Battle duration policy

Initial release: campaign time pauses while the player fights a tactical engagement, and the result applies at the engagement's campaign segment. Tactical turn count may affect fatigue and local time/weather within the battle but does not allow other campaign formations to move concurrently.

This avoids save, concurrency, and “multiple active battle” ambiguity. A later multi-engagement mode can advance other operations only after it defines deterministic scheduling and conflict rules.

## Content and data authoring changes

Each Campaign 2.0 scenario must declare:

- canonical hex scale;
- faction definitions and starting economy/replacement pools;
- initial persistent formations with ownership and stable authored IDs where story-significant;
- infrastructure instances and capacity/integrity;
- climate profile, zones, season, daylight, and optional scheduled weather;
- campaign phases and events;
- primary, secondary, optional, and failure objectives;
- victory grade thresholds and continuation/branch rules;
- strategic AI policy and scenario-specific priorities;
- replacement/upgrade availability;
- battle template compatibility;
- onboarding and alert defaults where needed.

Validation tooling must reject:

- duplicate IDs or invalid references;
- objectives that can never resolve;
- formations without a battle mapping;
- invalid upgrade paths;
- weather zones that do not cover playable land;
- AI objectives unavailable to its faction;
- starting capacity below already committed requirements;
- hidden failure conditions that can fire before reveal;
- content that references an unsupported newer rules version.

The existing in-game map editor remains developer-only. Supporting Campaign 2.0 authoring is a later dedicated editor project, not part of the player shell overhaul.

## Requested-gap traceability

| Requested gap | Player-facing outcome | Authoritative systems | Milestone and proof |
|---|---|---|---|
| Complete campaign consequences | Battles return survivors/losses, capture or preserve territory, damage/capture infrastructure, consume support and supplies, update intelligence, and explain the result in an AAR | Commitment ledger, battle/result packages, consequence/control/retreat/infrastructure services | M2; conservation, idempotency, control/front, retreat, AAR, and recovery tests |
| Strategic AI | An enemy protects objectives, concentrates, attacks, counterattacks, withdraws, gathers intelligence, and manages reserves/logistics under the same rules | Faction projector, `StrategicAIPlanner`, typed order service, operational memory | M3; no-leak fixtures, legal-order tests, behavior scenarios, and 500-day seeded soak suite |
| Victory conditions and campaign arc | Visible objectives, deadlines, phases, score projection, victory grades, defeat, and service record give the campaign direction | Objective evaluator, phase/event definitions, score service, end-state presentation | M2; objective/reward idempotency and automated victory/defeat journeys |
| Player-facing battle saves and autosaves | Named campaign saves, tactical saves at stable boundaries, direct battle resume, rolling autosaves, and corruption recovery | Complete battle serialization, save envelope/repository, migrations, integrity checker | M0–M1; same-next-action determinism, save matrix, migration, quota/interruption recovery |
| Persistent core formations | Named veterans survive battles, retain history, accept replacements, refit, upgrade, earn honors, and can be lost | Formation registry/lifecycle, tactical provenance adapter, replacement/equipment pools | M2 substrate and M4 complete game; multi-battle stable-identity and conservation journey |
| Dynamic weather and ground conditions | Forecasts shape timing and routes; rain, mud, snow, fog, freezing, and thaw affect campaign and tactical decisions | Campaign weather/ground services, effect tables, frozen battle environment plan/service | M5; deterministic transitions, preview/effect parity, campaign-to-battle and save tests |
| First-class campaign interface | Player assesses, plans, commits, advances, fights, reviews, and rebuilds through one coherent command workspace | Command shell, workspace modules, projection-safe map, context inspector, order tray, timeline/AAR | M1 shell plus M6 certification; first-operation, keyboard, responsive, accessibility journeys |

No requested gap is accepted based on a screen or schema alone. Each requires a playable decision loop, persistence, opponent parity where applicable, explanations, and end-to-end proof.

## Delivery strategy

### Release principles

- Build migrations and saves before adding more mutable state.
- Deliver vertical slices that can be played, tested, and tuned.
- Keep the current campaign launchable behind a compatibility adapter until Campaign 2.0 reaches the release gate.
- Use a feature flag for the new shell/runtime during development.
- Never maintain two independent consequence or AI rule paths; compatibility adapters feed the new services.
- Update the benchmark and gap documents when each capability actually ships.

### Dependency graph

```text
M0 Runtime contracts, IDs, deterministic RNG, events, migrations
 ├── M1 Save platform + campaign command shell + typed orders
 │     └── player-facing tactical save/resume
 ├── M2 Formation identity substrate + complete consequence/objective loop
 │     └── territory, fronts, AAR, victory/defeat
 ├── M3 Strategic AI using common orders and faction projection
 │     └── counterattacks and player defensive battles
 ├── M4 Full formation lifecycle and force-management UX
 └── M5 Weather/ground and tactical environment integration
          ↓
      M6 Onboarding, balance, accessibility, performance, migration rollout
```

M2 introduces the minimum formation records required for correct consequence accounting. M4 completes the player-facing replacement, refit, upgrade, commander, honor, and history game.

## Milestone 0 — runtime and persistence foundation

**Goal:** establish one authoritative, versioned, deterministic campaign model before adding feature state.

### Deliverables

- `CampaignScenarioDefinition` / `CampaignRuntimeState` split and legacy adapter;
- stable campaign, formation, infrastructure, objective, order, engagement, event, and resolution IDs;
- named deterministic RNG streams and serialized state;
- typed domain events and campaign revision/idempotency support;
- runtime invariant validator and transactional segment-resolver shell;
- scenario content hash and rules/content version policy;
- new save envelope, IndexedDB repository, slot index, checksum, and atomic write path;
- migrations and fixtures for current save versions 1 and 2;
- compatibility projection into current `CampaignScreen` while the new UI is built.

### Exit criteria

- current `campaign01` starts through the legacy adapter with equivalent visible friendly state;
- saving, reloading, and advancing a migrated campaign produces the same deterministic result as uninterrupted play;
- raw opposing truth does not appear in Player or Bot projections;
- invalid runtime mutations roll back without corrupting the last save;
- old saves remain untouched until a validated new save is written;
- canonical hex scale discrepancy is resolved in code and documentation.

## Milestone 1 — command shell, typed orders, and complete saves

**Goal:** make campaign interaction legible and player progress trustworthy before deeper systems arrive.

### Deliverables

- top command bar, workspace rail, map overlay controller, context inspector, and bottom order tray;
- responsive layouts and keyboard focus model;
- typed redeploy, production, and existing intelligence/counterintelligence orders;
- preview/validation/reservation/commit/cancel workflow;
- event-driven advance controls and stop conditions;
- named manual campaign saves, rolling autosaves, save browser, resume card, and recovery UX;
- tactical serialization completeness work, battle save/load menu, queued save state, and turn-start autosaves;
- developer gating for Edit/Export/editor surfaces;
- basic campaign onboarding through the first committed order.

### Exit criteria

- no normal campaign action mutates state directly from a map click;
- UI and AI-callable validators return the same legal result for an order fixture;
- campaign can be saved/loaded from every stable command state;
- a battle saved at each supported boundary restores exact units, stocks, phase, initiative, objectives, environment placeholder, and next deterministic result;
- a corrupted latest autosave can recover from the previous verified save;
- all controls work without a pointer and at supported desktop/tablet widths;
- internal editor controls are absent from normal player DOM.

## Milestone 2 — consequences, territory, objectives, and end states

**Goal:** make every generated battle materially and correctly change the campaign.

### Deliverables

- minimum campaign formation registry and tactical provenance adapter;
- authoritative commitment/reservation ledger;
- versioned `CampaignBattlePackage` and `CampaignBattleResultPackage`;
- complete tactical survivor/loss/resource/support/infrastructure result extraction;
- idempotent consequence resolver;
- retreat, isolation, capture/destruction, and legal return placement;
- tile control resolution and front recomputation;
- infrastructure capture/damage/repair state;
- objective runtime/evaluator, phase transitions, scoring, victory grades, victory/defeat screens;
- full campaign AAR and event-history access;
- generated offensive and defensive mission orientation support.

### Exit criteria

- committed formations cannot be used by another order or engagement;
- every committed formation is reconciled exactly once;
- personnel/equipment/resources are conserved within explicit loss/recovery rules;
- attacker victory captures the intended tile when occupation requirements are met;
- defeat/stalemate produces a legal, explained retreat or destruction outcome;
- fronts match control adjacency after every tested outcome;
- objective progress explains its source and cannot grant rewards twice;
- campaigns reach victory and defeat in authored automated fixtures;
- pre-battle, in-battle, and post-battle autosaves form a recoverable chain.

## Milestone 3 — strategic opponent and counterattacks

**Goal:** turn the campaign from a logistics sandbox into an adversarial operational game.

### Deliverables

- faction-projected strategic AI input;
- strategic posture, threat/opportunity assessment, plan portfolio, typed-order generation, and operational memory;
- defense, reinforce, offensive, counterattack, withdraw, reserve, logistics, and intelligence behaviors;
- shared resource/capacity/order rules;
- difficulty policies and disclosed scenario handicaps;
- private development rationale/debug inspector;
- Bot-initiated engagement flow that creates player defensive battles;
- AI scenario authoring hooks and deterministic soak harness.

### Exit criteria

- AI never consumes raw opposing truth in production path tests;
- AI can complete all core behavior fixtures and uses legal orders only;
- baseline scenario creates credible pressure and at least one counterattack under suitable seeds;
- no systematic double spend, over-capacity use, or same-segment reaction leak;
- 500 seeded campaign-day soak suite has no invariant failures or unresolved engagement deadlocks;
- difficulty changes behavior in measured ways without hidden knowledge;
- player can inspect post-resolution reasons such as observed threat or objective pressure without seeing unrevealed plans.

## Milestone 4 — full persistent formation game

**Goal:** create long-term emotional and strategic attachment to the player's force.

### Deliverables

- core/attached/auxiliary formation rules and full roster migration;
- Forces workspace and formation detail/history;
- personnel/equipment replacement pools and prioritized queues;
- rest, reorganize, repair, refit, and emergency-refit orders;
- data-driven equipment upgrade paths and compare UI;
- experience dilution, cohesion, fatigue, readiness calculation;
- formation commanders, traits, transfer/loss events;
- honor recommendation/award rules and service history;
- AI replacement, refit, preservation, and upgrade decisions;
- AAR promotion, honor, loss, and rebuild moments.

### Exit criteria

- the same core formation can be traced through campaign → battle → campaign with stable identity;
- its losses, experience, commander, supply, and equipment persist through save/load and later battles;
- replacement/refit/upgrade costs and completion are deterministic, previewed, and capacity-limited;
- destroyed formations cannot silently reappear;
- experience cannot be duplicated by replaying/applying a result;
- AI preserves/rebuilds forces using the same lifecycle rules;
- at least one authored multi-battle campaign demonstrates meaningful veteran preservation and an equipment upgrade choice.

## Milestone 5 — dynamic weather and ground warfare

**Goal:** make the environment a forecastable cross-layer command problem.

### Deliverables

- climate/zone/environment definitions and validators;
- deterministic campaign weather service and forecast generation;
- accumulated tile/region ground conditions;
- weather and ground overlays, top-bar status, forecast timeline, and inspector explanations;
- movement, logistics, intelligence, air/naval, readiness, and order-preview integration;
- tactical `BattleEnvironmentService`, briefing/HUD/preview integration, visuals, and transition announcements;
- tactical AI environment awareness;
- environment persistence and exact save restoration;
- scenario schedules for tutorial and regression fixtures.

### Exit criteria

- identical seed/state produces identical weather and ground history across reloads;
- order previews and actual resolution use the same environment modifiers;
- rain-to-mud and freeze/thaw fixtures transition at expected thresholds;
- aerial collection and air operations respond through explicit availability/reliability rules;
- campaign battle launches with the correct local environment and tactical timeline;
- tactical save/load resumes the exact condition and next transition;
- all effects appear in player explanations and AI planning inputs;
- visual weather meets contrast and reduced-motion requirements.

## Milestone 6 — release integration and certification

**Goal:** ship Campaign 2.0 as a coherent, teachable, performant game.

### Deliverables

- complete contextual onboarding and glossary;
- campaign phase/event content and balanced objective deadlines;
- alert aggregation/preferences and polished AAR flow;
- accessibility, localization-readiness, responsive, and controller-adjacent keyboard review;
- performance profiling and state-size budgets;
- migrated-save telemetry and recovery support;
- full campaign end-to-end certification matrix;
- feature-flag rollout, rollback plan, and support diagnostics;
- benchmark/gap/status documentation updates.

### Exit criteria

- a new player can complete the first operation without external instructions;
- a full baseline campaign can reach every supported outcome with no console errors or dead ends;
- release save fixtures from all supported prior versions migrate and play forward;
- no truth leak is present in UI, DOM, logs, accessibility text, analytics, or AI input;
- campaign and battle recovery tests pass under simulated interruption/quota failure;
- performance, accessibility, and browser matrices pass;
- feature flag can revert to compatibility mode without invalidating new saves (new saves remain safely retained/read-only there).

## Engineering backlog map

This is a planning-level epic breakdown, not an estimate. IDs provide stable references for implementation tasks and pull requests.

| Epic | Scope | Depends on |
|---|---|---|
| C20-001 Runtime split | Definition/runtime adapters, state ownership, revision | — |
| C20-002 Stable identity | IDs and legacy deterministic formation conversion | C20-001 |
| C20-003 Determinism | RNG streams, stable ordering, replay diagnostics | C20-001 |
| C20-004 Domain events | Event schema, append log, resolution report | C20-001, C20-002 |
| C20-005 Save repository | Envelope, IndexedDB, checksum, atomic slots | C20-001 |
| C20-006 Save migrations | v1/v2 fixtures, content-hash behavior, rollback | C20-002, C20-005 |
| C20-007 Runtime cutover | CampaignState authority, projection reconciliation, rollback | C20-001, C20-003, C20-004 |
| C20-008 Live persistence cutover | CampaignScreen Save/Load, verified legacy write-through, recovery consent | C20-005, C20-006, C20-007 |
| C20-010 Campaign shell | command bar, rail, map, inspector, tray | C20-001 |
| C20-011 Overlay system | mode/legend/projection-safe rendering | C20-010 |
| C20-012 Typed orders | types, validation, preview, reservation | C20-001, C20-002 |
| C20-013 Segment transaction | frozen views, simultaneous resolution, rollback | C20-003, C20-004, C20-012 |
| C20-014 Advance controls | event stops, alerts, timeline | C20-013 |
| C20-015 Tactical save completeness | authoritative state audit, serialize/hydrate — implemented; see `design/CAMPAIGN_2_0_M1_TACTICAL_SAVE_COMPLETENESS.md` | C20-003, C20-005 |
| C20-016 Save UX | campaign/battle browser, queued save, rolling autosaves, resume, recovery — implemented; see `design/CAMPAIGN_2_0_M1_SAVE_UX.md` | C20-005, C20-006, C20-015 |
| C20-020 Formation substrate | campaign records, tactical provenance adapter — implemented; see `design/CAMPAIGN_2_0_M2_FORMATION_SUBSTRATE.md` | C20-001, C20-002 |
| C20-021 Engagement ledger | commitment, package, idempotency — implemented; see `design/CAMPAIGN_2_0_M2_ENGAGEMENT_LEDGER.md` | C20-012, C20-020 |
| C20-022 Result extraction | tactical deltas and evidence — implemented; see `design/CAMPAIGN_2_0_M2_TACTICAL_RESULT_EXTRACTION.md` | C20-015, C20-021 |
| C20-023 Consequence resolver | survivors, losses, support, economy — implemented; see `design/CAMPAIGN_2_0_M2_CONSEQUENCE_RESOLVER.md` | C20-004, C20-022 |
| C20-024 Control/front resolver | occupation, retreat, isolation, derived fronts — implemented; see `design/CAMPAIGN_2_0_M2_CONTROL_FRONT_RESOLVER.md` | C20-023 |
| C20-025 Infrastructure | integrity, capture, repair, capacity effects — implemented; see `design/CAMPAIGN_2_0_M2_INFRASTRUCTURE.md` | C20-023, C20-024 |
| C20-026 Objectives/end states | evaluator, phases, score, victory/defeat — implemented; see `design/CAMPAIGN_2_0_M2_OBJECTIVES_END_STATES.md` | C20-004, C20-024 |
| C20-027 Campaign AAR | before/after, history, decisions required, report archive, acknowledgement, and post-battle autosave — implemented; see `design/CAMPAIGN_2_0_M2_AFTER_ACTION_REPORTS.md` | C20-023, C20-026 |
| C20-030 AI assessment | projected input, posture, threats/opportunities — implemented; see `design/CAMPAIGN_2_0_M3_AI_ASSESSMENT.md` | C20-013 |
| C20-031 AI planning | portfolios, scoring, operational memory — implemented; see `design/CAMPAIGN_2_0_M3_AI_PLANNING.md` | C20-012, C20-030 |
| C20-032 AI behaviors | defense/offense/reserve/logistics/intelligence — implemented; see `design/CAMPAIGN_2_0_M3_AI_BEHAVIORS.md` | C20-031 |
| C20-033 Counterattacks | Bot engagement initiation/defensive missions — implemented; see `design/CAMPAIGN_2_0_M3_AI_ENGAGEMENTS.md` | C20-021, C20-032 |
| C20-034 AI soak/debug | seeds, rationale, invariant harness | C20-031, C20-033 |
| C20-040 Formation lifecycle | replacements, rest, repair, refit | C20-020, C20-023 |
| C20-041 Upgrades | paths, availability, cost, comparison | C20-040 |
| C20-042 Commanders/honors | leaders, traits, triggers, history | C20-023, C20-040 |
| C20-043 Forces UX | roster, filters, detail, bulk queues | C20-010, C20-040, C20-042 |
| C20-044 AI force management | preservation/refit/upgrade priorities | C20-032, C20-040 |
| C20-050 Campaign environment | climate, cells, forecast, ground | C20-003, C20-013 |
| C20-051 Environment effects | movement/logistics/intel/air/readiness | C20-050 |
| C20-052 Weather UX | overlay, timeline, inspector, explanations | C20-011, C20-050 |
| C20-053 Tactical environment | battle plan, rules, AI, rendering, saves | C20-015, C20-021, C20-050 |
| C20-060 Onboarding | guided first operation and glossary | C20-010, C20-027, C20-043, C20-052 |
| C20-061 Accessibility/responsive | keyboard, focus, contrast, motion, layouts | All UI epics |
| C20-062 Telemetry/balance | metrics, privacy, dashboards/exports | C20-004 |
| C20-063 Release migration | flags, compatibility, rollback, support | All release epics |

## File and module change map

The exact split can evolve, but ownership should follow these boundaries.

### New campaign domain modules

```text
src/game/campaign/runtime/
  CampaignRuntimeState.ts
  CampaignScenarioAdapter.ts
  CampaignInvariantValidator.ts
  CampaignRandom.ts
  CampaignEvents.ts
  CampaignSegmentResolver.ts

src/game/campaign/orders/
  campaignOrderTypes.ts
  CampaignOrderService.ts
  CampaignOrderPreview.ts
  CampaignReservationLedger.ts

src/game/campaign/consequences/
  campaignBattleContracts.ts
  CampaignCommitmentService.ts
  CampaignConsequenceResolver.ts
  CampaignControlService.ts
  CampaignRetreatResolver.ts
  CampaignInfrastructureService.ts

src/game/campaign/objectives/
  campaignObjectiveTypes.ts
  CampaignObjectiveEvaluator.ts
  CampaignScoreService.ts

src/game/campaign/ai/
  StrategicAIPlanner.ts
  StrategicAIAssessment.ts
  StrategicAIPlans.ts
  StrategicAIPolicy.ts
  StrategicAIRationale.ts

src/game/campaign/formations/
  campaignFormationTypes.ts
  FormationLifecycleService.ts
  CampaignFormationBattleAdapter.ts
  FormationHonorService.ts

src/game/campaign/weather/
  campaignWeatherTypes.ts
  CampaignWeatherService.ts
  CampaignGroundService.ts
  CampaignEnvironmentEffects.ts

src/game/persistence/
  saveTypes.ts
  SaveRepository.ts
  IndexedDbSaveRepository.ts
  SaveMigrationRegistry.ts
  SaveIntegrity.ts
```

### UI modules

```text
src/ui/campaign/
  CampaignCommandScreen.ts
  CampaignCommandBar.ts
  CampaignWorkspaceRail.ts
  CampaignOverlayController.ts
  CampaignContextInspector.ts
  CampaignOrderTray.ts
  CampaignTimeline.ts
  CampaignAlertCenter.ts
  CampaignAAR.ts
  workspaces/SituationWorkspace.ts
  workspaces/ForcesWorkspace.ts
  workspaces/LogisticsWorkspace.ts
  workspaces/IntelligenceWorkspace.ts
  workspaces/AirNavalWorkspace.ts
  workspaces/HeadquartersWorkspace.ts

src/ui/saves/
  SaveBrowser.ts
  SaveStatusIndicator.ts
  SaveRecoveryDialog.ts

src/game/environment/
  BattleEnvironmentService.ts
  battleEnvironmentTypes.ts
```

### Existing modules to adapt

- `src/state/CampaignState.ts`: become a facade/store over the new runtime and projectors; remove direct resolver logic in stages.
- `src/core/campaignTypes.ts`: retain compatibility exports, then move authored/runtime/order/result types to focused files.
- `src/ui/screens/CampaignScreen.ts`: compatibility screen while `CampaignCommandScreen` is feature-flagged; retire direct mutations and embedded editor.
- `src/rendering/CampaignMapRenderer.ts`: accept overlay/view models only, never raw truth.
- `src/state/CampaignIntelligence.ts`: keep knowledge engine; route operations through typed orders and add environment source effects.
- `src/game/campaign/EngagementContextBuilder.ts`: evolve into commitment/briefing builder using formation records and narrow battle package.
- `src/game/campaign/CampaignBattleGenerator.ts`: consume `CampaignBattlePackage` and attach provenance/environment.
- `src/state/BattleState.ts`: own complete battle save payload and hydrate workflow, including precombat/commander/bridge metadata.
- `src/game/GameEngine.ts`: complete authoritative serialization and query `BattleEnvironmentService` for rules.
- `src/core/Combat.ts`, movement, LOS, supply, and air systems: consume centralized environment effects rather than ad hoc weather checks.
- `src/main.ts`: replace broad bridge assembly with engagement package orchestration and resume routing.
- `index.html`: remove monolithic campaign markup/styles over time; mount component-owned shell and keep only semantic roots.
- `src/data/campaign01.json`: migrate through adapter, then author phases/objectives/formations/climate/AI policy.

## Test and certification strategy

### Unit and property tests

- order legality, resource/capacity reservations, cancellation, and conflicts;
- deterministic RNG streams and stable ordering;
- movement ETA and environment modifier composition;
- formation conservation across commitment/result/reconciliation;
- retreat selection and no-route outcomes;
- tile control/front derivation;
- objective predicates, deadlines, phase transitions, score, and one-time rewards;
- replacement/refit/upgrade time, cost, dilution, and queue capacity;
- weather transition/forecast and ground accumulation;
- save schema validation, checksum, atomic index behavior, and every migration.

Use property tests or generated fixtures for invariants:

- resources never become negative except an explicitly modeled debt field;
- a formation cannot occupy incompatible statuses simultaneously;
- committed capacity cannot exceed available capacity;
- no result creates personnel/equipment without an explicit source event;
- every live formation has exactly one location/order ownership state;
- front edges always separate opposing controllers;
- rewards and battle results apply at most once;
- faction projections never contain forbidden opposing truth fields.

### Integration tests

- draft → commit → advance → arrival;
- intelligence order → report → knowledge projection → engagement briefing;
- engagement commitment → generated tactical battle → result → territory/AAR;
- battle save → reload → same next action/result;
- campaign save during active battle → reload directly into battle → return to campaign;
- replacement/refit → later battle with preserved identity/status;
- weather forecast → delayed order → local tactical environment;
- Bot plan → common order validation → player defensive battle;
- campaign objective completion and failure through both battle and non-battle events.

### Determinism tests

For checked-in seeds, record hashes after each segment. Verify:

- uninterrupted run equals save/load run;
- different UI navigation does not affect state;
- requesting previews does not consume RNG;
- changing weather implementation does not consume intelligence or AI random streams;
- autoresolve and played battle results are deterministic from their own inputs;
- migrations seed missing systems once and remain stable.

### Strategic AI tests

- scripted tactical/operational fixtures for every behavior;
- belief-versus-truth trap scenarios proving no omniscience;
- objective triage under simultaneous threats;
- reserve preservation and counterattack trigger;
- supply route protection and interdiction;
- weather grounding an otherwise attractive air plan;
- deception and stale-contact response;
- long soak simulations with invariant, performance, repetition, and campaign-end assertions.

### Save matrix

Test every supported browser and save boundary against:

- manual campaign slot;
- pre/post segment autosave;
- pre/in/post battle chain;
- deployment, player activation, initiative boundary, and turn-start tactical saves;
- old v1/v2 campaign fixtures;
- missing optional fields;
- checksum mismatch;
- storage quota failure;
- interrupted temporary write;
- missing/changed content version;
- newer unsupported save;
- duplicate result package after recovery.

### UI/end-to-end certification journeys

1. **First operation:** inspect objective, collect intelligence, move force, commit, advance, fight, review AAR.
2. **Costly victory:** capture target but shatter a veteran; score and formation screens communicate the tradeoff.
3. **Defensive crisis:** AI offensive triggers a defense; player withdraws, preserves force, and sees territory loss.
4. **Recovery:** queue replacements/refit, advance to completion, then re-commit the same formation.
5. **Weather gamble:** forecast rain, launch anyway, experience mud and reduced air support, see explained consequences.
6. **Save recovery:** interrupt a tactical session, resume exact state, finish, and return to the correct campaign revision.
7. **Campaign end:** meet victory and defeat conditions, view grade/service record, and load a pre-decision save safely.
8. **Fog integrity:** inspect every campaign surface and verify no unobserved enemy truth appears.

### Visual and accessibility certification

- map/overlay screenshots at representative zooms and knowledge states;
- 1280×720 minimum supported desktop, common 16:9/16:10, ultrawide, and tablet-width responsive checks;
- keyboard-only completion of the first-operation journey;
- logical focus return after sheets/dialogs/AAR;
- screen-reader labels for map selection alternatives, order status, objective progress, weather, and alerts;
- contrast checks for every faction/overlay/alert state;
- non-color icons/patterns/text for control, confidence, weather, readiness, and severity;
- reduced-motion weather, map focus, and report transitions;
- 200% zoom without clipped command actions.

## Performance and storage budgets

Initial release budgets on the supported baseline desktop:

- map selection/inspector update: under 100 ms perceived response;
- overlay switch: under 200 ms without rebuilding unrelated panels;
- ordinary segment resolution: under 500 ms p95;
- strategic AI planning: under 300 ms p95 standard difficulty, with a visible resolving state for slower devices;
- save serialization plus verified local write: under 2 seconds for a large campaign with active battle;
- campaign load to interactive shell: under 3 seconds from local storage;
- no unbounded event, report, AI rationale, or save growth;
- autosave retention respects a configurable storage budget and never deletes the last verified manual/checkpoint save.

Profile at the full map dimensions and a stress roster, not only the initial scenario. Derived projections should use revision-based memoization. Event logs keep durable strategic events and aggregate/compact routine details after checkpoints while retaining AAR facts.

## Telemetry and balance instrumentation

Telemetry is optional, privacy-respecting, and contains no save payload or hidden enemy truth.

### Funnel and usability

- campaign started/resumed/completed/abandoned;
- time to first inspected objective, first drafted order, first commit, and first battle;
- invalid order code frequency;
- advance mode and stop-reason usage;
- save/manual/autosave/recovery success/failure;
- workspace and overlay usage;
- tutorial step completion/skip.

### Balance

- campaign outcome/grade by scenario and disclosed difficulty;
- objective completion/failure segment;
- territory and estimated force trend over time;
- formation loss, survival, replacement, refit, upgrade, and experience distribution;
- resource bottlenecks and unused surplus;
- battle force assessment versus result, without uploading unrevealed truth to player-facing analytics;
- AI plan mix, abort/replan frequency, reserve ratio, and illegal-order rejection count;
- weather condition frequency, order delays, grounded sorties, and tactical outcome correlation;
- save size/load time and segment/AI performance percentiles.

### Design review cadence

Each milestone receives:

- a fixed-seed playthrough comparison;
- telemetry/event-log review;
- qualitative player comprehension review (“What changed? Why? What can you do?”);
- tuning changes in data, not code, where possible;
- benchmark status update only after acceptance criteria pass.

## Accessibility, localization, and input requirements

- all player-visible strings come from localization-ready keys, including event explanations and AI/AAR rationale templates;
- number/date/time formatting is locale-aware while save timestamps retain ISO data;
- icons have text labels and tooltips; abbreviations such as INT, COV, and RES are not the only accessible names;
- map actions have list/table alternatives in workspaces;
- keyboard shortcuts are discoverable and remappable later; no critical action requires drag;
- focus order follows command bar → workspace → map/list → inspector → order tray;
- danger acknowledgements do not rely on `window.confirm`;
- animation, precipitation, map recentering, and pulsing alerts honor reduced motion;
- alert sounds have visual equivalents and independent volume control;
- colorblind-safe palettes use patterns/shapes and user faction colors consistently.

## Security and information-leak requirements

Fog-of-war correctness is a product and security boundary.

- UI components accept view models, not runtime truth.
- strategic AI accepts only its faction input projection.
- opposing exact force/economy/order state is excluded from DOM, ARIA text, debug logs, analytics, save metadata, and thrown player-visible errors.
- save payload necessarily contains authoritative local truth and is treated as game data, not as a secure anti-cheat boundary; public competitive multiplayer is out of scope.
- development truth inspectors require an explicit non-production flag and use visibly distinct chrome.
- battle packages provide each faction's briefing separately and prevent accidental cross-use with branded types or runtime assertions.
- tests recursively scan projections and serialized player-facing metadata for forbidden fields.

## Rollout and compatibility

### Feature flags

- `campaignRuntimeV2`: new runtime/adapter/save path;
- `campaignCommandUI`: new shell;
- `campaignConsequencesV2`: commitment/result/control/objectives;
- `campaignStrategicAI`: opponent planning and counterattacks;
- `campaignFormationLifecycle`: management systems;
- `campaignEnvironment`: weather/ground and tactical integration.

Flags are development/rollout controls, not permanent alternate rule sets. New saves record enabled rules versions.

### Rollout sequence

1. internal deterministic/migration harness;
2. developer compatibility UI using runtime v2;
3. new command shell with current mechanics;
4. consequences/objectives in a dedicated test scenario;
5. strategic AI closed playtest;
6. formation and environment vertical slices;
7. migrated-save beta cohort;
8. full baseline campaign certification;
9. default-on release with compatibility rollback for launch failures;
10. remove old mutation paths after save-support window and successful migration metrics.

### Rollback

- retain previous verified save records;
- never downgrade-write a runtime-v2 save through old code;
- compatibility mode may display new saves as temporarily unavailable rather than corrupt them;
- feature rollback disables new entry/advance while preserving export/recovery access;
- result idempotency prevents duplicated consequences after a crash or version rollback.

## Major risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Building UI before state ownership | Rework and inconsistent data | Complete M0 contracts/adapter first; UI consumes projections |
| Save format grows with every system | Corruption and impossible migration | Unified envelope, versions, fixtures, pure migration registry, content hashes |
| Tactical serialization appears complete but loses hidden state | Non-deterministic/broken resumes | Explicit completeness checklist and same-next-action determinism tests |
| Formation mapping is lossy | Duplicated or vanished survivors | Stable provenance IDs, conservation validator, idempotent results |
| AI cheats through shared runtime | Unfair campaign and fog leak | Branded faction projection input and recursive no-leak tests |
| AI thrashes or trickles forces | Unconvincing opponent | Operational memory, hysteresis, reserve doctrine, plan-level scoring |
| Too many campaign systems overwhelm players | High abandonment | Stable workspace IA, progressive disclosure, preview/explanation, contextual onboarding |
| Weather becomes random punishment | Frustration | Forecasts, timing windows, inspectable effects, deterministic state, AI parity |
| Persistent veterans snowball | Campaign balance collapse | Replacement dilution, fatigue/cohesion, bounded honors, costly refit/upgrade, scenario force pressure |
| Defeat destroys willingness to continue | Save scumming or abandonment | Playable retreats, fallback objectives, recovery tools, clear consequences |
| Campaign/battle time semantics conflict | Duplicated movement/weather | Initial campaign pause during battle and explicit battle-duration policy |
| Map rendering slows under overlays | Poor command UX | projected overlay models, revision memoization, layer diffing, performance budgets |
| Existing campaign saves cannot migrate | Loss of trust | checked-in fixtures, non-destructive migration, recovery/export, staged rollout |
| Scenario content cannot support new rules | Incomplete release | authoring validator, dedicated vertical-slice scenario, then migrate baseline campaign |

## Decisions made by this plan

1. Campaign 2.0 is a command-workspace overhaul, not a sidebar expansion.
2. Campaign battles remain tactically playable and feed the same consequence path as any future delegation.
3. The campaign pauses while a tactical battle is active in the initial release.
4. The authored scenario definition becomes immutable; runtime truth is separate.
5. Existing fog/intelligence projections remain mandatory for player UI and strategic AI.
6. Strategic AI uses the same typed orders and constraints as the player.
7. `scenario.hexScaleKm` is authoritative; legacy missing values default to the current 10 km constant.
8. Campaign formations own persistence; tactical units are traceable battle representations.
9. Named saves and complete battle resume ship before the most complex new mutable systems.
10. IndexedDB is the local payload store; storage remains abstract for future cloud support.
11. Fronts are derived from tile control, never manually edited as a consequence shortcut.
12. Weather is deterministic, forecastable, cross-layer, and mechanically meaningful.
13. Internal campaign editor tools are developer-only; a public editor is separate future scope.

## Open tuning questions with recommended defaults

These do not block architecture. Defaults should be tested and changed in data.

| Question | Recommended first implementation |
|---|---|
| How many concurrent active tactical engagements? | One; campaign pauses until resolved |
| Can the player autoresolve? | Defer until consequence loop is certified; then add through the same result contract |
| How many named manual saves? | Ten local manual slots plus bounded autosaves/checkpoints |
| Can players save during Bot resolution/animation? | Queue the request and write at the next stable boundary |
| Does every aggregate count become one formation? | Yes for legacy migration, with deterministic IDs; scenario authors may consolidate explicitly later |
| Are core formations permanently lost? | Yes, but shattered cadre reconstruction may be scenario-enabled |
| Can a formation exceed authorized strength? | Not in Campaign 2.0 baseline; overstrength is a later rules option |
| How often does strategic AI replan? | Daily posture review plus event-triggered bounded reassessment; existing committed plans use hysteresis |
| Does weather vary per hex? | Weather by zone, ground state by tile/region |
| Can weather change mid-battle? | Yes, only through the frozen deterministic battle environment timeline |
| Does battle duration advance campaign time? | Not in initial release; tactical time affects local fatigue/environment only |
| Are objective rules fully visible? | Primary/failure conditions visible; authored secret objectives reveal before player agency depends on them |
| Does difficulty grant resources? | Only as a separately disclosed scenario handicap, never silently |

## Definition of done for Campaign 2.0

Campaign 2.0 is complete only when all of the following are true:

- the campaign interface supports the Assess → Plan → Commit → Advance → Fight → Review → Rebuild loop without developer controls;
- a strategic AI acts from its own knowledge using common legal orders and can initiate counterattacks;
- battle commitment prevents reuse and every result reconciles survivors/losses exactly once;
- battle outcomes change actual control, formations, infrastructure, resources, fronts, intelligence, objectives, and history as applicable;
- the baseline campaign has visible objectives, deadlines/arc, victory grades, victory, and defeat;
- campaign and tactical battles have named saves, rolling autosaves, exact supported-boundary restoration, migration, and recovery;
- core formations persist identity, status, experience, equipment, commanders, honors, and history across multiple battles;
- replacements, refit, and upgrades consume capacity/resources/time and are usable by player and AI;
- weather and ground conditions are forecastable, deterministic, mechanically active on both layers, visible, and saved;
- faction truth never leaks through UI, logs, analytics, accessible text, or AI input;
- onboarding, keyboard access, responsive layout, contrast, and reduced motion pass certification;
- deterministic, integration, AI soak, migration, save recovery, visual, accessibility, and end-to-end suites pass;
- a complete baseline campaign can be played from start to every supported end state with no dead ends and with understandable consequences.

## Player-facing feature summary

When Campaign 2.0 ships, describe it to players this way:

> Command the whole operation, not a string of disconnected battles. Read an uncertain theater, issue movement, intelligence, logistics, air, and combat orders, then advance time as the enemy makes plans of its own. The forces you commit are the forces that fight. Survivors return with their experience, damage, commanders, honors, and history; losses, captured ground, damaged bases, spent supplies, and missed deadlines reshape the next decision. Forecasts help you exploit clear skies, prepare for mud, or gamble against a storm, and those same conditions follow your troops into battle. Named saves and rolling autosaves let you resume either the campaign or an active tactical engagement. Win by achieving the operation's objectives while preserving enough force and time to finish the campaign—not merely by winning every tactical map.
