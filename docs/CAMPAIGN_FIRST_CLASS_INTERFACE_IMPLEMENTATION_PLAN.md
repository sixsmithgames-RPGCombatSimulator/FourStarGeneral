# Campaign first-class interface — complete implementation plan

**Date:** 2026-08-15

**Status:** Implementation in progress; FCI-0 through FCI-4 engineering-certified for current domain projections; FCI-5 complete workspaces are next

**Owner:** Four-Star General campaign product and engineering

**Scope:** Player-facing campaign command interface, interaction model, presentation, onboarding, accessibility, responsive behavior, and interface certification

**Authoritative product plan:** [`CAMPAIGN_2_0_FIRST_CLASS_GAME_PLAN.md`](./CAMPAIGN_2_0_FIRST_CLASS_GAME_PLAN.md)

**System verification baseline:** [`CAMPAIGN_VERIFICATION_2026-08-15.md`](./CAMPAIGN_VERIFICATION_2026-08-15.md)

## Implementation record

| Date | Scope | Status | Evidence |
|---|---|---|---|
| 2026-08-15 | FCI-001 through FCI-007: golden captures, DOM/keyboard inventory, ephemeral UI state, typed events, shared navigator, immutable view assembly, CSS tokens/scaffold, presentation flag/fallback, and DOM leak assertions | Implemented and certified; FCI-0 exit gate passed | [`CAMPAIGN_FIRST_CLASS_INTERFACE_BASELINE_2026-08-15.md`](./CAMPAIGN_FIRST_CLASS_INTERFACE_BASELINE_2026-08-15.md) |
| 2026-08-15 | FCI-010 and FCI-011: `CampaignCommandScreen` composition root and extracted command-bar component | Implemented and certified against the existing campaign shell | `CampaignCommandFoundation.test.ts`, campaign suite, production build, and browser captures |
| 2026-08-15 | FCI-012 through FCI-015: extracted workspace rail and pane, shared selection/focus routing, typed Player-safe inspector routes, mutually exclusive compact sheets, interaction-tree synchronization, and invoker/fallback focus restoration | Implemented and certified; FCI-1 exit gate passed | [`CAMPAIGN_FIRST_CLASS_INTERFACE_BASELINE_2026-08-15.md`](./CAMPAIGN_FIRST_CLASS_INTERFACE_BASELINE_2026-08-15.md), managed desktop/compact captures, foundation tests, campaign suite, and production build |
| 2026-08-15 | FCI-020 through FCI-026 for current domain projections: stable map registry/controller, five safe overlays, truthful Supply/Air-Naval/Environment gates, dynamic legends/filters, accessible list parity, typed hex/front/formation/report routes with domain-owned actions, report-to-map focus, 272-formation live roster, coordinate projection, container-responsive controls, compact exclusivity, and generation-aware 4,650-hex cache | Implemented and certified; FCI-2 current-domain exit gate passed | [`CAMPAIGN_FIRST_CLASS_INTERFACE_FCI2_MAP_2026-08-15.md`](./CAMPAIGN_FIRST_CLASS_INTERFACE_FCI2_MAP_2026-08-15.md), 119-test campaign suite, live browser captures, automated AAR navigation, roster search, and 100-switch performance sample |
| 2026-08-15 | FCI-030 initial vertical slice: Situation command-priority card derived from Player-safe active alerts, order conflicts, or the active primary objective | Superseded by the complete FCI-3 implementation | Managed interface captures and campaign shell rendering |
| 2026-08-18 | FCI-030 through FCI-035: full Situation synthesis, objective/phase/front/outlook presentation, unified command traffic, save-stable alert acknowledgement, aggregated recent record, full timeline, AAR Continue routing, and no-dead-end outcome/service-record presentation | Implemented and engineering-certified; formal external ten-second participant metric remains a release study | [`CAMPAIGN_FIRST_CLASS_INTERFACE_FCI3_SITUATION_2026-08-18.md`](./CAMPAIGN_FIRST_CLASS_INTERFACE_FCI3_SITUATION_2026-08-18.md), campaign suite, production build, desktop/compact/200%-zoom browser journeys |
| 2026-08-18 | FCI-040 through FCI-046: authoritative action registry, stable reason/corrective codes, shared seven-stage composers, draft-aware path/area/cost/hold previews, editable and reorderable full order tray, atomic commit preflight/feedback, cancellation review, and explicit commit-versus-advance contract | Implemented and engineering-certified; formal external thirty-second participant metric remains a release study | [`CAMPAIGN_FIRST_CLASS_INTERFACE_FCI4_ORDERS_2026-08-18.md`](./CAMPAIGN_FIRST_CLASS_INTERFACE_FCI4_ORDERS_2026-08-18.md), focused order/shell tests, campaign suite, TypeScript, and ESLint |

### Current work-package state

| Work package | State | Notes |
|---|---|---|
| FCI-001–FCI-007 | Complete | FCI-0 certified; compatibility fallback retained |
| FCI-010 | Complete | Presentation composition root contains no campaign rules |
| FCI-011 | Complete | Command bar extracted without duplicating listeners or truth |
| FCI-012 | Complete | Rail and workspace pane are separate presentation components with existing roving focus, shortcuts, and responsive sheet behavior preserved |
| FCI-013 | Complete | Map hexes, force locations, objectives, orders, alerts, reports, contacts, and entity deep links converge on the shared selection/navigation state |
| FCI-014 | Complete | Objective, order, report, formation, contact, and hex selections resolve through one Player-safe inspector router or an explicit safe empty state |
| FCI-015 | Complete | Compact sheets are mutually exclusive, off-canvas regions are inert and `aria-hidden`, Escape/close synchronizes state, and focus returns to the invoking control or map fallback |
| FCI-020 | Complete | Stable overlay registry/controller, workspace defaults, dynamic legends, and truthful filters certified |
| FCI-021 | Complete | Operational, Objectives, Forces, Intelligence, and Orders layers consume only Player-safe projections and use color-independent emphasis |
| FCI-022 | Complete for current domain boundary | Supply, Air/Naval, and Environment are explicit feature gates and are not presented as implemented controls |
| FCI-023 | Complete | Hex, formation, front, objective, order, report, and contact routes are typed; hex/front routes retain domain-owned legal actions, and AAR/report locations focus the canonical projected map hex |
| FCI-024 | Domain-gated; non-blocking | Environment layer and safe empty state remain truthful gates until a projected weather-zone/forecast service exists |
| FCI-025 | Complete for available layers | Fronts, objectives, forces, contacts, and Player orders have map/list/keyboard selection parity |
| FCI-026 | Complete for shipped scale | Generation-aware hex index and dirty-class guard; live 4,650-hex theater recorded 5.2 ms p95 across 100 layer switches, and live 272-formation search completed in approximately 9.5 ms |
| FCI-030 | Engineering complete; formal user study pending | Full Situation board and one-dominant-priority structural gate pass; external 80%/ten-second metric remains a release study |
| FCI-031 | Complete for current domain projections | Objective progress/deadline/dependency/score/loss meaning plus phase and Player-safe front posture are explicit |
| FCI-032 | Complete | Unified alert center, source counts, severity hierarchy, typed routes, and save-stable acknowledgement are live; acknowledgement never resolves domain state |
| FCI-033 | Complete | Bounded recent record and save-stable full resolution timeline preserve aggregation and exact stop causes |
| FCI-034 | Complete | AAR map focus, acknowledgement, before/after consequences, decisions, and Continue-to-consequence routing pass |
| FCI-035 | Complete for existing service-record domains | Outcome exposes grade/score/objectives/retained formations/history plus review/save/continue/exit paths with no dead end |
| FCI-040 | Complete | Every shipped common action resolves through one registry backed by authoritative availability previews and stable reason/corrective codes |
| FCI-041 | Complete | Redeployment, production, intelligence/counterintelligence, and repair use the same seven-stage planning grammar and Add/Replace draft semantics |
| FCI-042 | Complete for shipped common orders | Selection highlighting and exact route/area, cost, timing, resource, formation, asset, capacity, and production-slot hold previews are draft-aware |
| FCI-043 | Complete | Active orders expose full planning facts, conflict repair, inspect/edit/remove/cancel, deterministic priority movement, and bounded terminal history |
| FCI-044 | Complete | Non-mutating Player-only preflight and atomic commit feedback preserve every draft and authoritative value on rejection |
| FCI-045 | Complete for cancellable shipped kinds | In-game review explains legality, released reservations, refund/sunk cost, delay, exposure, and production supersession policy |
| FCI-046 | Complete | Commit and Advance remain distinct; uncommitted drafts are called out and existing save-stable stop/timeline UX remains authoritative |

## Executive decision

The campaign interface will become a first-class operational command game through an incremental, feature-flagged replacement of the current compatibility shell. This is not a cosmetic reskin and not a framework rewrite.

The finished interface must let the player complete this loop through one coherent command surface:

```text
ASSESS → PLAN → PREVIEW → DRAFT → COMMIT → ADVANCE → RESPOND/FIGHT → REVIEW → REBUILD
```

The existing Campaign 2.0 runtime remains authoritative. The interface consumes faction-safe projections, creates typed orders through existing services, and presents deterministic consequences. It must never duplicate campaign rules, mutate truth directly, or reveal hidden enemy state.

The implementation is complete only when a new player can finish a representative first operation without external instructions, a returning player can understand the most important theater change within ten seconds, and all supported campaign decisions can be made without developer controls or raw-data interpretation.

## Product outcomes

The program must produce these player-visible outcomes:

1. **Immediate comprehension.** The campaign opens with a legible situation, current priorities, and explicit decisions—not a wall of controls.
2. **Map-led command.** The operational map is the primary planning surface, while every critical map action has a list or inspector alternative.
3. **One interaction grammar.** Every action follows Select → Understand → Preview → Draft → Review → Commit.
4. **Inspectable uncertainty.** Enemy contacts show confidence, source, age, contradictions, and uncertainty without leaking truth.
5. **Persistent attachment.** Forces are named formations with condition, commanders, history, honors, replacements, and upgrades.
6. **Visible sustainment.** Logistics explains supply reach, bottlenecks, stockpiles, production, repair, replacement, and forecast consumption.
7. **Operational support planning.** Air and naval assets show readiness, range, capacity, weather, mission commitments, and opportunity cost.
8. **Consequences with causality.** Alerts, timelines, AARs, and inspectors explain what changed, why it changed, and what requires a response.
9. **Game-quality presentation.** Hierarchy, motion, audio, map feedback, reports, campaign phases, and outcomes feel authored and dramatic without slowing command.
10. **Commercial usability.** Keyboard, reduced motion, color-independent state, responsive layouts, localization readiness, recovery, and performance are release requirements.

## Non-goals

- Replacing the Campaign 2.0 runtime, order services, intelligence model, save repository, strategic AI, or tactical bridge.
- Migrating the application to React, Vue, or another UI framework as part of this work.
- Encoding campaign rules in UI components.
- Showing controls for mechanics that do not yet have authoritative domain services.
- Making mobile phones a primary campaign platform; narrow layouts remain functional, but the minimum supported command surface is tablet/compact laptop class.
- Providing perfect enemy information to make the interface easier.
- Retaining the legacy sidebar as a permanent alternative product experience.

## Current-state audit

### Working foundations to preserve

The repository already provides a strong functional substrate:

- a top command bar, six-workspace rail, operational map region, context inspector, order tray, advance controls, timeline, AAR archive, and campaign outcome surface;
- Player-safe campaign projections and fog-safe map rendering;
- typed drafts, validation, reservations, atomic commit, legal cancellation, and deterministic segment advancement;
- intelligence contacts, operations, confidence, staleness, uncertainty, and counterintelligence;
- campaign saves, tactical saves, autosaves, recovery, active-battle routing, and post-battle checkpoints;
- persistent formation identity and exact tactical provenance;
- campaign consequences, control, infrastructure, objectives, end states, strategic AI, and defensive tactical handoff;
- keyboard workspace switching, responsive shell behavior, selection-only map clicks, and developer editor gating;
- 119 deterministic campaign tests plus real browser certification in both campaign-to-tactical directions and at desktop/compact interface breakpoints.

### Interface gaps

The current shell is a functional vertical slice rather than a complete command game:

- `CampaignScreen.ts` is approximately 3,033 lines and mixes orchestration, rendering, event wiring, editor compatibility, planners, intelligence UI, and status formatting.
- `CampaignCommandShell.ts` is approximately 1,140 lines and imperatively composes every major region.
- campaign markup and styling remain embedded in the large `index.html`, making visual iteration, ownership, and regression control difficult;
- several workspaces are summary cards around legacy controls rather than complete workspace modules;
- Forces is an aggregate location list, not an operational order of battle;
- Logistics exposes stocks and production but not a complete supply network, consumption forecast, replacement/refit queue, or bottleneck workflow;
- Intelligence remains primarily a secondary drawer opened from its workspace;
- Air/Naval currently presents two power totals and explicitly defers mission allocation;
- Headquarters mixes session controls, records, and developer compatibility rather than presenting intent, policies, campaign history, and settings coherently;
- the operational map now has the certified Operational/Objectives/Forces/Intelligence/Orders registry, legends, filters, and list parity; Supply, Air/Naval, and Environment remain truthfully gated on missing projections;
- the context inspector now has typed Player-safe routes for the synchronized FCI-1 selection contract, while legacy hex/action detail remains until each later workspace and composer migration reaches its exit gate;
- common order planning lacks a unified multi-step composer and consistent risk/dependency presentation across every order kind;
- onboarding, glossary, localization readiness, complete responsive certification, and campaign-specific Playwright journeys are not yet release-complete;
- dynamic formation management and weather interfaces depend on the unfinished Campaign 2.0 Milestones 4 and 5 domain services.

### Current-state verdict

The interface foundation is safe and usable. The next work is a component and experience overhaul over that foundation—not another shell rewrite and not additional panels inside the existing monolith.

## First-class player contract

At any moment, the interface must answer five questions:

1. **What changed?**
2. **What matters now?**
3. **What can I do?**
4. **What will it cost, risk, reserve, and take?**
5. **What happened because of my decision?**

The contract applies to map selections, workspace lists, alerts, order composers, time advancement, tactical interruptions, save recovery, and AARs.

### Ten-second situation test

Within ten seconds of loading or returning from battle, a player must be able to identify:

- the campaign phase and time;
- the highest-priority objective or loss condition;
- the most consequential recent change;
- whether a decision is required before time can advance;
- the current save/recovery state.

### Thirty-second common-order test

From either the map or a workspace list, an experienced player must be able to draft a common redeployment, reconnaissance, repair, replacement, or support order within thirty seconds while understanding its ETA, reservations, and principal risk.

### No unexplained state test

Every material resource, formation, control, objective, intelligence, support, or timing change must link to a report, order, battle, or rule explanation. Hidden random resolution can create uncertainty; it cannot create unexplained UI changes.

## Target information architecture

### Desktop command frame

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ THEATER · PHASE · TIME · WEATHER · COMMAND STATE · RESOURCES · REPORTS · SAVE│
├──────────┬──────────────────┬───────────────────────────────┬────────────────┤
│ Workspace│ Workspace list / │                               │ Context        │
│ rail     │ operational tools│       OPERATIONAL MAP         │ inspector      │
│          │                  │                               │                │
├──────────┴──────────────────┴───────────────────────────────┴────────────────┤
│ ORDER TRAY · RESERVATIONS · CONFLICTS · ETA · COMMIT · ADVANCE · TIMELINE   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Stable regions

#### Command bar

Always visible:

- theater title and campaign phase;
- day, local time, segment, daylight boundary;
- current weather and next material forecast change when environment systems ship;
- command state: Planning, Orders Ready, Resolving, Engagement, Campaign Ended;
- compact resource values with trend/delta and bottleneck emphasis;
- highest-severity decision indicator and unread report count;
- save/autosave/recovery state;
- settings, save browser, and pause/exit access.

The command bar is a status surface, not a second workspace. Selecting a value opens the relevant workspace or inspector.

#### Workspace rail and workspace pane

The rail changes:

- workspace list content;
- default map overlay;
- available filters and bulk actions;
- default inspector presentation.

It does not navigate away from the campaign screen or discard map selection.

#### Operational map

The map remains the primary spatial planning surface. It accepts only faction-safe overlay view models. Selection is shared with lists and inspector. It never commits an order by itself.

#### Context inspector

The inspector uses a stable hierarchy:

1. identity and location;
2. status and trend;
3. what is known, source, and age;
4. constraints, dependencies, and consequences;
5. legal actions;
6. history and advanced detail.

#### Order tray and timeline

The bottom region is the persistent operational plan. It separates drafts from committed/executing orders and separates Commit from Advance. It exposes reservations, conflicts, dependencies, risks, cancellation consequences, and the latest stop reason.

### Compact and tablet layouts

At compact widths:

- the workspace rail becomes a bottom tab switcher;
- the workspace pane becomes a dismissible sheet or split pane;
- the inspector becomes a separate dismissible sheet;
- the order tray collapses to counts, highest conflict, Commit, Advance, and an expandable plan sheet;
- only one sheet can cover the map at a time;
- map selection and critical actions remain usable without hover, right click, or drag;
- the map retains a minimum useful viewport rather than shrinking between two permanent sidebars.

## Global interaction model

### Canonical action flow

Every order kind must use the same stages:

```text
1. Select subject or area
2. Choose legal action
3. Configure target, participants, timing, posture, and support
4. Preview costs, reservations, ETA, risk, and dependencies
5. Add non-spending draft
6. Review the complete plan and resolve conflicts
7. Commit valid drafts atomically
8. Advance time separately
9. Stop for decisions, reports, or engagements
10. Review consequences and issue follow-up orders
```

### Selection rules

- A single click selects.
- A second click on a different item changes selection; it does not implicitly move a force.
- Double click focuses and opens the full inspector.
- Right click may open the legal-action menu on desktop; every action remains available through buttons and keyboard.
- Drag selection is optional and limited to Forces mode; it cannot be the only bulk-selection method.
- Escape cancels the current gesture or closes the topmost sheet. It never cancels committed orders.
- Selection persists while switching workspaces where the selected entity remains meaningful.
- Alerts and report links set workspace, overlay, selection, map focus, and inspector through one navigation service.

### Error and blocking rules

Every disabled or rejected action must identify:

- the blocking rule;
- the affected subject/resource/capacity;
- whether the problem is temporary or permanent;
- the direct corrective action, when one exists.

Generic “invalid order,” silent no-ops, and raw exceptions are not acceptable player feedback.

### Confirmation rules

- Ordinary orders are confirmed through draft → commit; they do not require repeated modal confirmations.
- Extraordinary irreversible or high-risk decisions use an inline acknowledgement in the order review.
- Cancellation previews sunk cost, delay, released reservations, and exposure.
- `window.confirm` is not used for campaign decisions.

## Shared UI state and navigation

The interface needs a small, non-authoritative UI store separate from campaign truth.

```ts
type CampaignWorkspaceId =
  | "situation"
  | "forces"
  | "logistics"
  | "intelligence"
  | "airNaval"
  | "headquarters";

type CampaignOverlayId =
  | "operational"
  | "forces"
  | "objectives"
  | "supply"
  | "intelligence"
  | "environment"
  | "airNaval"
  | "orders";

type CampaignSelection =
  | { kind: "hex"; hexKey: string }
  | { kind: "formation"; formationId: string }
  | { kind: "front"; frontId: string }
  | { kind: "objective"; objectiveId: string }
  | { kind: "order"; orderId: string }
  | { kind: "contact"; contactId: string }
  | { kind: "report"; reportId: string }
  | { kind: "weatherZone"; zoneId: string }
  | null;

interface CampaignCommandUIState {
  workspace: CampaignWorkspaceId;
  overlay: CampaignOverlayId;
  selection: CampaignSelection;
  focusedHexKey: string | null;
  workspaceSheetOpen: boolean;
  inspectorOpen: boolean;
  orderTrayExpanded: boolean;
  timelineOpen: boolean;
  activeComposer: { orderKind: string; draftId: string | null } | null;
  filters: Readonly<Record<CampaignWorkspaceId, unknown>>;
}
```

Rules:

- UI state stores selection and preferences only; it never owns campaign resources, orders, formations, contacts, or objectives.
- Campaign save data does not need to change for the interface overhaul. Optional view preferences may use a separate versioned local preference record.
- An alert/navigation target is resolved through a central `CampaignCommandNavigator`, not component-specific DOM queries.
- Components receive immutable Player-safe view models.

## Projection and information-safety architecture

### Mandatory boundary

```text
Campaign runtime truth
        ↓
Faction projectors and explanation services
        ↓
CampaignCommandViewAssembler
        ↓
Immutable workspace / overlay / inspector view models
        ↓
UI components
```

### Rules

- Components do not import or query raw campaign runtime state.
- Enemy force arrays, exact enemy economies, private AI rationale, hidden orders, and hidden infrastructure state never enter player-facing view models.
- DOM attributes use stable projected IDs only.
- ARIA labels, tooltips, logs, errors, analytics, and test snapshots are scanned for forbidden fields.
- Legal actions are projected by an action registry that calls authoritative preview/validation services.
- Explanation strings are derived from typed reason codes rather than reconstructed from UI guesses.

## Component architecture

### Target file ownership

```text
src/ui/campaign/
  CampaignCommandScreen.ts          # screen-level composition only
  CampaignCommandUIState.ts         # ephemeral selection/layout/preferences
  CampaignCommandNavigator.ts       # alert/report/list/map deep navigation
  CampaignCommandViewAssembler.ts   # Player-safe view assembly
  CampaignActionRegistry.ts         # legal actions and composer routing
  CampaignUIEvents.ts               # typed component events

  components/
    CampaignCommandBar.ts
    CampaignWorkspaceRail.ts
    CampaignOperationalMap.ts
    CampaignMapLegend.ts
    CampaignContextInspector.ts
    CampaignOrderComposer.ts
    CampaignOrderTray.ts
    CampaignAdvanceControl.ts
    CampaignTimeline.ts
    CampaignAlertCenter.ts
    CampaignAfterActionCenter.ts
    CampaignOutcomeView.ts
    CampaignSaveMenu.ts
    CampaignEmptyState.ts
    CampaignMetric.ts
    CampaignStatusBadge.ts
    CampaignProgress.ts

  inspectors/
    HexInspector.ts
    FormationInspector.ts
    FrontInspector.ts
    ObjectiveInspector.ts
    OrderInspector.ts
    ContactInspector.ts
    ReportInspector.ts
    WeatherZoneInspector.ts

  workspaces/
    SituationWorkspace.ts
    ForcesWorkspace.ts
    LogisticsWorkspace.ts
    IntelligenceWorkspace.ts
    AirNavalWorkspace.ts
    HeadquartersWorkspace.ts

  overlays/
    CampaignOverlayRegistry.ts
    OperationalOverlay.ts
    ForcesOverlay.ts
    ObjectivesOverlay.ts
    SupplyOverlay.ts
    IntelligenceOverlay.ts
    EnvironmentOverlay.ts
    AirNavalOverlay.ts
    OrdersOverlay.ts

  onboarding/
    CampaignOnboardingService.ts
    CampaignOnboardingOverlay.ts
    CampaignGlossary.ts

  styles/
    campaign-tokens.css
    campaign-shell.css
    campaign-map.css
    campaign-workspaces.css
    campaign-inspector.css
    campaign-orders.css
    campaign-reports.css
    campaign-responsive.css
    campaign-accessibility.css
```

### Ownership rules

- `CampaignCommandScreen` coordinates state, render revisions, and services. It contains no domain rules and minimal HTML.
- Workspaces render lists, filters, summaries, and actions for one player job.
- Inspectors render one selection type.
- Overlay modules produce renderer inputs and legend entries; they do not manipulate unrelated DOM.
- The order composer is schema-driven by typed order-kind configuration and authoritative previews.
- Shared components use semantic DOM and text-safe rendering.
- Styles move out of `index.html` incrementally as each region is replaced.
- `CampaignScreen.ts` remains a compatibility adapter until the last region migrates, then shrinks to screen lifecycle and bridge orchestration.

## Workspace specifications

### Situation workspace

#### Player job

Understand what changed, what is at risk, and what requires attention now.

#### Required sections

- Commander's brief: one concise generated summary from Player-safe events.
- Decision required: blocking choices and mandatory engagements first.
- Objectives: primary, secondary, optional, failure conditions, deadlines, progress, score effects.
- Fronts: assessed pressure, initiative, last material change, supply posture, nearby reserves.
- Recent changes: aggregated timeline with filters and links.
- Campaign outlook: phase, projected grade, time pressure, explicit loss conditions.
- Suggested next action: contextual onboarding only; never auto-issues an order.

#### Map behavior

- Defaults to operational or objectives overlay depending on the highest-priority item.
- Selecting an objective focuses related hexes/fronts and opens ObjectiveInspector.
- Selecting a critical alert routes to its owning workspace and selection.

#### Acceptance

- Passes the ten-second situation test.
- No more than one dominant decision-required surface at a time.
- Routine events are aggregated; losses and objective changes remain individually inspectable.

### Forces workspace

#### Player job

Understand force availability and preserve, concentrate, rebuild, or commit the correct formations.

#### Required sections

- Operational order of battle grouped by core, attached, reserve, committed, in transit, refitting, shattered, and destroyed/disbanded.
- Search plus filters for class, location/front, readiness, supply, experience, commander, availability, and current order.
- Sort by readiness, strength, ETA, experience, location, or command priority.
- Formation row: name, symbol, class, authorized/present strength, readiness, supply, experience, location, order, ETA, warning.
- Compare view for two or more formations.
- Bulk actions for compatible replacement, refit, rest, and assignment workflows.
- History/archive view that retains destroyed formations.

#### Formation inspector

- identity, lineage, commander, honors, and role;
- personnel/equipment/readiness/cohesion/fatigue/supply;
- authorized versus present strength;
- experience and replacement dilution preview;
- current order, reservations, location, and route;
- replacement/refit/upgrade options with cost, capacity, ETA, and interruption consequence;
- battle and campaign history.

#### Dependency

Full functionality depends on C20-040 through C20-043. Before those services ship, the workspace may show truthful identity/condition/history and current orders, but must not display nonfunctional management actions.

### Logistics workspace

#### Player job

Understand what can be sustained, where the bottleneck lies, and which investment changes the plan.

#### Required sections

- Stockpiles with current value, recent delta, committed holds, expected income, and forecast consumption.
- Supply sources, routes, throughput, disruption, interdiction risk, and isolated consumers.
- Transport capacity by mode, committed capacity, next release, and bottleneck reason.
- Production allocation with forecast output and effective time.
- Repair/reconstruction, replacement, refit, and upgrade queues.
- Capacity lanes for engineers, workshops, depots, airbases, ports, and replacement pools.
- Forecast panel at next report, dawn, one day, and selected order completion.

#### Supply overlay

- source and route network;
- reach and throughput bands;
- bottlenecks and disruption patterns;
- projected route/consumption impact for a selected draft;
- color-independent line/pattern encodings.

#### Acceptance

- Every resource total reconciles value, holds, forecast gains, and projected spending.
- Selecting a bottleneck identifies affected formations/orders and the remedy.
- Forecast values state their time boundary and assumptions.

### Intelligence workspace

#### Player job

Decide what to believe, what to verify, where to collect, and what to conceal.

#### Required sections

- Situation: briefing changes and collection summary.
- Contacts: filterable list by level, class, confidence, age, source, contradiction, and priority.
- Operations: draft, active, completed, cancelled, and inconclusive collection/counterintelligence operations.
- Source/capacity status: available assets, analyst capacity, committed capacity, refit/availability.
- Report archive with provenance and linked contact history.
- Deception/OPSEC status without confirming enemy belief.

#### Contact card and inspector

- contact level and classification;
- strength/readiness/supply/movement bands only when supported;
- last known location and uncertainty area;
- age and confidence trend;
- sources and reliability;
- corroboration or contradictions;
- legal Verify, Observe, Recon, SIGINT, Counter-recon, OPSEC, and Deception actions;
- explicit statement that absence of a marker is not proof of safety.

#### Migration

The existing intelligence drawer content moves into the workspace module. A compact quick-look drawer may remain as a global report affordance, but it becomes a view onto the same components and state rather than a second intelligence UI.

### Air and Naval workspace

#### Player job

Allocate scarce theater support while understanding readiness, reach, timing, weather, and what is left uncovered.

#### Required sections

- Assets grouped by base/port, mission role, readiness, mission, refit, damage, and next availability.
- Airbase/port capacity and queue.
- Range/reach overlay with target legality.
- Sortie/lift/shore-support budget and reserved commitments.
- Weather/daylight availability and risk.
- Mission composer for reconnaissance, cover, interdiction, ground support, airlift, naval lift, and shore support as supported by domain services.
- Engagement support summary showing what a planned battle receives and what remains elsewhere.
- Recent mission reports and losses.

#### Dependency

The first release can project existing air/naval power and engagement support. Full mission planning requires authoritative campaign support-order and asset-readiness services; no placeholder button ships ahead of those services.

### Headquarters workspace

#### Player job

Set intent, understand the campaign record, manage preferences/saves, and access learning/support tools.

#### Required sections

- Campaign brief, current phase narrative, commander's intent, objective doctrine, and loss conditions.
- Commander's service record, grade projection, completed campaigns, and difficulty/policy disclosure.
- Event/report archive and AAR center.
- Save browser, autosave/recovery status, and active tactical battle entry.
- Tutorials, glossary, keyboard reference, accessibility, audio, and alert preferences.
- Campaign exit and safe return.
- Developer editor only under explicit development authorization, visually separated from player chrome.

#### Acceptance

- Save and recovery state is always understandable.
- Developer controls never appear in ordinary production DOM or accessibility trees.
- Settings do not hide active campaign decisions or discard drafts.

## Operational map implementation

### Overlay registry

Each overlay definition provides:

- stable ID and label;
- owning/default workspace;
- renderer layer inputs;
- legend entries with color, shape, pattern, and text;
- supported selection types;
- optional filter schema;
- projection-safety assertion;
- performance cache key based on campaign revision and relevant UI filters.

### Required overlays

1. **Operational:** control, fronts, infrastructure, engagements, primary routes.
2. **Forces:** friendly locations, readiness, supply, current order, commitment.
3. **Objectives:** objective areas, dependencies, deadlines, control/hold progress.
4. **Supply:** sources, throughput, reach, isolation, transport routes, bottlenecks.
5. **Intelligence:** contacts, confidence, uncertainty, age, collection coverage.
6. **Environment:** weather zones, motion, forecast timing/confidence, ground state.
7. **Air/Naval:** bases/ports, range, capacity, missions, commitments, unavailable areas.
8. **Orders:** draft and committed paths/areas, dependencies, conflicts, ETA.

### Renderer rules

- Layer groups are persistent and toggled/updated rather than rebuilding the full SVG on every overlay switch.
- Selection, focus, objectives, and critical alerts remain readable over every overlay.
- Patterns and symbols supplement color.
- Tooltips use projected view models only.
- At far zoom, detail aggregates; at near zoom, formation/contact detail increases.
- Unknown enemy state remains unknown even when switching overlays.
- Weather/ground rendering never obscures actionable symbols or text contrast.

### Map/list parity

Every actionable map entity appears in an accessible workspace list. Selecting from either surface updates the same shared selection. The list provides the non-pointer alternative for locate, inspect, and initiate action.

## Context inspector implementation

### Selection-specific modules

| Selection | Required content | Primary actions |
|---|---|---|
| Hex | control assessment, terrain, infrastructure, supply, weather/ground, contacts, events | area recon, repair, move/assign target |
| Formation | identity, condition, supply, experience, commander, order, history | redeploy, replace, refit, upgrade, rest |
| Front | assessed balance, initiative, objectives, reserves, supply, events | assign reserve, recon, plan engagement |
| Objective | conditions, progress, deadline, score, dependencies | focus related entities, plan response |
| Order | participants, route, cost, ETA, dependencies, risk, state | inspect, remove draft, cancel when legal |
| Contact | level, age, source, confidence, uncertainty, contradictions | verify, recon, observe, prioritize |
| Report | time, source, facts, consequences, linked entities | acknowledge, navigate, create response |
| Weather zone | current/forecast, confidence, movement, ground trend, effects | focus forecast, revise affected orders |

### Progressive disclosure

The default inspector shows identity, status, most important constraint, and primary legal actions. Advanced details—history, calculation explanations, equipment breakdown, source chains—use expandable sections with remembered preferences.

## Order composer, tray, and time controls

### Action registry

The `CampaignActionRegistry` maps projected selection and workspace context to legal action descriptors:

```ts
interface CampaignActionDescriptor {
  id: string;
  label: string;
  selectionKinds: readonly string[];
  orderKind: string;
  availability: "available" | "blocked" | "hidden";
  reasonCode: string | null;
  reason: string | null;
  correctiveAction: string | null;
}
```

The registry queries authoritative preview/validation services. It does not infer rules from rendered values.

### Composer steps

The common composer supports order-specific schemas but preserves this structure:

1. Subject and intent
2. Target/area/route
3. Participants and priorities
4. Timing/posture/support
5. Cost, reservations, ETA, risk, objective effect
6. Conflicts/dependencies
7. Add draft

### Preview contract

Every preview presents, where applicable:

- resource cost now and expected later consumption;
- formation/asset/capacity reservations;
- earliest start, duration, ETA, and uncertainty;
- route/area and projected overlay;
- known operational risk and intelligence limitations;
- objective interaction;
- dependencies and conflicts;
- cancellation policy.

### Tray behavior

- Drafts can be inspected, edited, removed, and reordered when priority rules support it.
- Conflicted/blocked drafts are visually distinct and link to the blocking field/entity.
- Commit is disabled when any included draft is invalid and explains the first blocker plus total blocker count.
- Atomic commit success moves every accepted draft to committed state.
- Atomic failure preserves drafts and provides typed failure explanations.
- Committed orders show state, next transition, ETA, and cancellation rules.
- Completed/cancelled history compacts into the timeline instead of growing the horizontal tray forever.

### Advance behavior

- Advance remains unavailable during unresolved mandatory decisions, active commit, load/save recovery, or campaign end.
- Mode choices: 3 hours, next report, dawn, dusk, one day.
- The UI previews what “next report” includes.
- The resolving state locks mutation controls but keeps cancellation-safe navigation and progress/status feedback.
- Stop reason and highest-severity consequence remain persistent until reviewed or superseded.

## Alerts, reports, AAR, and outcomes

### Severity model

- **Routine:** event log only.
- **Notable:** unobtrusive toast plus event feed.
- **Critical:** persistent banner and default time stop according to preference/rule.
- **Decision required:** time stops and the required action surface opens.

### Aggregation

- Repeated low-level events aggregate by time boundary and kind.
- Formation losses, objective changes, engagements, save failures, and campaign outcomes remain individually inspectable.
- Every alert has a typed navigation target.
- Acknowledgement is separate from resolution; acknowledging does not complete a required decision.

### AAR flow

The AAR opens on return from battle and presents:

1. outcome and tactical objectives;
2. friendly losses and formation condition;
3. confirmed/estimated opponent effects;
4. territory, infrastructure, supply, resource, and score changes;
5. objective/phase changes;
6. decisions required;
7. post-battle checkpoint status.

Continue routes to the highest-priority consequence in the appropriate workspace. The full report remains in Headquarters and the timeline.

### Campaign outcome

Victory/defeat presentation includes grade, score, completed/failed objectives, force preservation, significant formation history, service record effects, continue-without-scoring policy, save access, and return options.

## Visual design system

### Direction

The campaign should feel like a living theater headquarters: map table, operations board, dispatches, status lamps, formation cards, and concise command annotations. It must remain readable and contemporary rather than imitating low-contrast paper documents.

### Tokens

Create centralized tokens for:

- surfaces and elevation;
- friendly, allied, enemy-contact, neutral, warning, critical, and decision-required state;
- typography scale and data/tabular numerals;
- spacing, radius, border, and density;
- control, focus, selection, disabled, and loading states;
- overlay patterns and line styles;
- animation durations/easing;
- compact/standard/comfortable density.

### Hierarchy rules

- One primary action per region.
- Critical decisions outrank routine resources and history.
- Labels state the player meaning, not internal system names.
- Numbers include units, time boundary, and trend when relevant.
- Enemy estimates avoid false precision.
- Cards are used for distinct decisions/entities, not as decoration around every value.

### Iconography

- Use a consistent symbol set for formation class, readiness, supply, order state, confidence, weather, objective state, and severity.
- Every icon has a text or accessible label.
- Critical state never relies on icon or color alone.

## Motion, audio, and game feel

### Motion

Use concise animation to explain change:

- order path draws and reservation changes;
- formation arrival/departure and front/control transitions;
- reconnaissance sweep and contact confidence change;
- weather movement/ground transition;
- objective progress/completion;
- alert focus and AAR before/after comparison.

Motion must not delay input after the state is understandable. Reduced-motion mode replaces travel/pulse effects with fades or immediate state changes.

### Audio

Campaign audio events require visual equivalents and independent volume control:

- routine dispatch/report;
- order drafted/removed;
- orders committed;
- order blocked/commit failed;
- intelligence update;
- formation arrival/refit completion;
- enemy offensive/decision required;
- objective success/failure;
- save success/failure;
- campaign outcome.

Avoid constant UI clicks and overlapping alerts. Critical cues use priority/ducking rules.

### Feedback latency

- Selection: immediate highlight and inspector skeleton/content.
- Draft added: immediate tray entry, overlay, and reservation update.
- Commit: visible resolving state within one frame.
- Advance: clear progress/state before any long resolver or AI work.
- Save: status transitions Unsaved → Saving → Saved/Failed.

## Onboarding and glossary

### First-operation journey

Contextual onboarding guides, but does not automate:

1. Inspect the primary objective.
2. Select and inspect a formation's readiness and supply.
3. Open Intelligence and inspect a contact's confidence/source.
4. Draft reconnaissance or redeployment.
5. Review reservations/conflicts and commit.
6. Advance to the next report.
7. Respond to or create an engagement.
8. Review the AAR and navigate to a consequence.
9. Begin repair, replacement, or refit when the domain system supports it.

### Requirements

- replayable, skippable, resumable;
- state-aware and safe across save/load;
- never blocks emergency/decision-required actions;
- keyboard and screen-reader operable;
- does not point at unavailable controls;
- records completion by semantic step, not brittle DOM selectors.

### Glossary

Terms including readiness, cohesion, assessed, committed, isolated, throughput, replacement, refit, ground state, and confidence receive concise definitions linked from labels and the Headquarters reference.

## Accessibility and input requirements

### Keyboard

- Logical focus: command bar → rail → workspace → map/list → inspector → order tray.
- Roving tab focus for workspace and overlay tabs.
- Discoverable 1–6 workspace shortcuts; Escape closes/cancels only the topmost transient interaction.
- Full order composition, commit, advance, AAR, save, and recovery without pointer input.
- Map has list-based entity alternatives and focus-visible markers.

### Screen reader

- Semantic landmarks, headings, tab/tabpanel relationships, dialogs/sheets, status regions, and progress values.
- Selection announcements identify entity, location, status, and principal constraint without hidden truth.
- Alert announcements are severity-aware and avoid repeating routine updates.
- Charts/overlays have equivalent summaries and list access.

### Visual

- WCAG AA text/control contrast target.
- Color-independent control, confidence, readiness, weather, and severity encodings.
- 200% zoom with no clipped critical actions.
- Visible focus over every surface and map state.
- User font scaling does not make Commit/Advance inaccessible.

### Motion/audio

- `prefers-reduced-motion` and an in-game motion preference.
- No essential information exists only in animation or sound.
- Alert audio can be independently reduced/disabled.

## Responsive requirements

Certification targets:

- 1280×720 minimum desktop;
- 1366×768 common laptop;
- 1440×900 and 1440×1000 standard development targets;
- 1920×1080 and ultrawide;
- 800–1024 px tablet/compact width;
- 200% browser zoom on minimum desktop.

For every target:

- map retains usable minimum area;
- no horizontal page scroll;
- Commit, Advance, decision-required actions, save status, and critical alerts remain reachable;
- sheets trap and restore focus correctly;
- only one compact overlay sheet covers the map at once;
- no functionality depends only on hover or right click.

## Localization readiness

- Player strings move from interpolated component literals to stable message keys in phases.
- Dates, times, numbers, percentages, and resource units use formatting helpers.
- UI reserves expansion space for longer labels.
- Text is not embedded in icons or map art.
- Generated reports use templates with typed variables, not concatenated fragments that assume English order.
- Save data stores stable IDs and facts, not localized labels as authoritative values.

## Performance budgets

Initial supported-baseline budgets:

- selection to visible highlight/inspector response: under 100 ms perceived;
- workspace switch: under 100 ms excluding intentional motion;
- overlay switch: under 200 ms without full unrelated DOM/map rebuild;
- order preview response from local services: under 150 ms p95;
- ordinary segment resolution: under 500 ms p95, with resolving state immediately visible;
- strategic AI planning: under 300 ms p95 standard difficulty, with visible progress for slower devices;
- campaign save: under 2 seconds for a large state with active battle;
- campaign load to interactive: under 3 seconds local;
- no unbounded DOM growth from orders, reports, alerts, or history;
- no frame-long synchronous render caused by rerendering every workspace on an unrelated revision.

Implementation requirements:

- revision-based memoization for projection/view assembly;
- keyed updates for large rosters/contact/report lists;
- persistent renderer layers and cached overlay geometry;
- virtualized or paged history only when stress data proves necessary;
- performance marks around projection, workspace render, overlay render, segment resolution, AI, save, and load.

## Implementation strategy

### Strangler migration

1. Freeze the current shell as the compatibility reference.
2. Add the new UI state, navigator, view assembler, tokens, and component root behind `campaignCommandUIV2`.
3. Replace one semantic region/workspace at a time while reusing authoritative callbacks/services.
4. Keep the old region available only as flag fallback until the replacement passes its exit gates.
5. Move that region's styles out of `index.html` when ownership transfers.
6. Remove legacy DOM queries and compatibility markup only after browser, projection-safety, and save/resume journeys pass.
7. Retire the old shell flag after release soak; retain new saves safely if rollback occurs.

### No dual authority

- New and legacy surfaces may render the same projection during development, but only one receives player input.
- UI migration does not introduce alternate order or save formats.
- Compatibility callbacks delegate to the same CampaignState/domain services.
- A region cannot be declared migrated while it still reads its values from legacy DOM.

### Feature dependencies

| Interface capability | Domain dependency | Interim behavior |
|---|---|---|
| Situation/objectives/AAR | Implemented C20-026/C20-027 | Build immediately |
| Typed plan/tray/time | Implemented C20-012–014 | Build immediately |
| Intelligence workspace | Implemented intelligence system | Build immediately |
| Formation roster/history | Implemented substrate/consequences | Build identity/condition/history immediately |
| Replacement/refit/upgrade | C20-040/C20-041 | Hide management actions until authoritative services ship |
| Commanders/honors | C20-042 | Reserve view contracts; no fake values |
| Logistics network/forecast | Existing economy/infrastructure plus remaining lifecycle flow | Build stocks/production/repair now; add supply forecast with service |
| Air/Naval mission planning | Support asset/order services | Present truthful readiness/support now; add composers with services |
| Weather/ground interface | C20-050–053 | Do not ship inactive environment controls |
| Onboarding | Stable migrated journeys | Implement after core flows stop changing structurally |

## Milestones and work packages

Task IDs below are stable planning identifiers. They do not imply calendar estimates.

### FCI-0 — baseline, state, and design system foundation

**Goal:** Create safe component boundaries without changing campaign behavior.

| ID | Deliverable | Acceptance |
|---|---|---|
| FCI-001 | Golden browser captures and DOM/keyboard inventory for desktop/compact | Current behavior documented and reproducible |
| FCI-002 | `CampaignCommandUIState` and typed UI events | Selection/layout state has no campaign truth |
| FCI-003 | `CampaignCommandNavigator` | Alert/list/map/report targets route through one service |
| FCI-004 | `CampaignCommandViewAssembler` | Immutable Player-safe component view models; no raw runtime imports |
| FCI-005 | Campaign tokens and CSS extraction scaffold | New components use tokens; no new campaign CSS added to `index.html` |
| FCI-006 | `campaignCommandUIV2` flag and compatibility mount | Either UI mounts exclusively; saves unchanged |
| FCI-007 | Projection/DOM information-leak test helpers | Forbidden opposing truth fails tests |

**Exit gate:** New empty component frame can render the live campaign projection under the flag, switch back safely, and pass existing campaign tests/build.

### FCI-1 — command frame and synchronized selection

**Goal:** Replace shell-level orchestration and establish the universal navigation model.

| ID | Deliverable | Acceptance |
|---|---|---|
| FCI-010 | `CampaignCommandScreen` composition root | Lifecycle/render coordination only; no domain rules |
| FCI-011 | Componentized command bar | Correct phase/time/resources/reports/save state and deep links |
| FCI-012 | Componentized workspace rail/pane | Roving focus, shortcuts, responsive switcher |
| FCI-013 | Shared selection/focus synchronization | Map/list/inspector/workspace remain in sync |
| FCI-014 | Typed context-inspector router | Every supported selection resolves or shows explicit safe empty state |
| FCI-015 | Compact sheet manager and focus restoration | One sheet at a time; Escape/focus contract passes |

**Exit gate:** A selection can originate from map, list, alert, order, or report and produce identical workspace/overlay/focus/inspector state.

### FCI-2 — operational map and inspector system

**Goal:** Make the map a legible, extensible planning canvas.

| ID | Deliverable | Acceptance |
|---|---|---|
| FCI-020 | Overlay registry/controller | Stable modes, workspace defaults, legends, filters |
| FCI-021 | Operational, objectives, forces, intelligence, and orders overlays | Projection-safe, color-independent, selection readable |
| FCI-022 | Supply, Air/Naval, and environment overlay adapters | Feature-gated until domain projections exist |
| FCI-023 | Hex, formation, front, objective, order, contact, report inspectors | Stable hierarchy and legal actions |
| FCI-024 | Weather inspector adapter | Feature-gated; consumes projected forecasts only |
| FCI-025 | Accessible map/list parity | Every map action has list/keyboard route |
| FCI-026 | Overlay/selection performance cache | Budget passes at stress map/roster |

**Exit gate:** All currently implemented entities can be located, selected, understood, and acted on through both map and list without truth leaks.

### FCI-3 — Situation, alerts, reports, and outcomes

**Goal:** Make the campaign immediately understandable and consequence-driven.

| ID | Deliverable | Acceptance |
|---|---|---|
| FCI-030 | Full Situation workspace | Ten-second test passes in user review |
| FCI-031 | Objective/front/phase presentations | Progress, deadline, dependencies, score, loss conditions clear |
| FCI-032 | Alert center and aggregation | Severity/interruption/acknowledgement rules pass |
| FCI-033 | Resolution timeline | Stops and causes remain inspectable and bounded |
| FCI-034 | AAR center migration | Before/after consequences and decisions route correctly |
| FCI-035 | Campaign outcome/service record presentation | Victory/defeat/continue/save paths have no dead end |

**Exit gate:** Load, advance, enemy interruption, post-battle return, and campaign end each land on an understandable priority with a direct next action.

### FCI-4 — common order planning experience

**Goal:** Give every campaign action one high-quality planning and commitment workflow.

| ID | Deliverable | Acceptance |
|---|---|---|
| FCI-040 | Action registry and reason-code explanations | Legal/blocked actions come from authoritative previews |
| FCI-041 | Schema-driven order composer | Common stage structure, order-specific fields |
| FCI-042 | Map path/area preview and reservation preview | Preview parity with committed order |
| FCI-043 | Full order tray | Edit/remove/conflict/dependency/reservation behavior |
| FCI-044 | Atomic commit feedback | Success/failure preserves correct drafts/state |
| FCI-045 | Cancellation preview/flow | Sunk cost, delay, exposure, released reservations shown |
| FCI-046 | Advance/resolving/stop UX | Commit distinct from Advance; mandatory stops unmissable |

**Exit gate:** Redeployment, production, intelligence, counterintelligence, and infrastructure repair all pass the thirty-second/order-preview parity tests.

### FCI-5 — complete workspaces

**Goal:** Replace every summary/legacy workspace with its full player job.

| ID | Deliverable | Depends on | Acceptance |
|---|---|---|---|
| FCI-050 | Forces roster, filters, compare, detail/history | Existing substrate | Roster/location/condition/order parity |
| FCI-051 | Replacement/refit/upgrade/commander/honor UX | C20-040–043 | Multi-battle identity and queue journey |
| FCI-052 | Logistics stocks, holds, production, repair | Existing services | Resource reconciliation and bottleneck navigation |
| FCI-053 | Supply/consumption/queue forecast | Lifecycle/logistics projection | Forecast parity at resolution boundary |
| FCI-054 | Full Intelligence workspace migration | Existing intelligence | Drawer parity then drawer becomes quick-look only |
| FCI-055 | Air/Naval readiness/support workspace | Existing support projections | No fake missions; correct engagement support |
| FCI-056 | Air/Naval mission composers | Campaign support order services | Range/capacity/weather/reservation parity |
| FCI-057 | Headquarters, saves, records, settings, glossary | Existing save/AAR/outcome | Recovery and production DOM gating pass |

**Exit gate:** Each workspace answers its defined player question, synchronizes map/inspector/tray, and contains no “later slice” placeholder copy.

### FCI-6 — weather, ground, and formation-game integration

**Goal:** Surface Campaign 2.0 Milestones 4 and 5 as first-class decisions rather than appended panels.

| ID | Deliverable | Depends on | Acceptance |
|---|---|---|---|
| FCI-060 | Formation lifecycle integration | C20-040–043 | replace/refit/upgrade/history journey passes |
| FCI-061 | Weather command-bar summary | C20-050 | current/next/confidence accurate |
| FCI-062 | Environment overlay and forecast timeline | C20-050/C20-052 | forecast/state parity and contrast pass |
| FCI-063 | Weather/ground explanations in inspectors/orders | C20-051 | reason codes match effects |
| FCI-064 | Air/logistics/intelligence weather availability | C20-051 | blocked/degraded action explanations correct |
| FCI-065 | Tactical environment handoff presentation | C20-053 | precombat/battle/AAR environment continuity |

**Exit gate:** The weather-gamble and formation-recovery end-to-end journeys pass with deterministic save/load continuity.

### FCI-7 — game feel, onboarding, accessibility, and localization

**Goal:** Convert the complete command system into a teachable, polished product.

| ID | Deliverable | Acceptance |
|---|---|---|
| FCI-070 | Final visual hierarchy and component states | Design review across all workspaces/states |
| FCI-071 | Motion and reduced-motion implementation | Change is explained; input not delayed |
| FCI-072 | Campaign audio event routing/preferences | Priority, visual equivalents, no overlap spam |
| FCI-073 | Contextual first-operation onboarding | replay/skip/resume/save/load/keyboard pass |
| FCI-074 | Glossary and contextual definitions | Domain terms accessible from owning surfaces |
| FCI-075 | Keyboard/screen-reader/contrast/zoom remediation | Full accessibility matrix passes |
| FCI-076 | Localization key migration and formatters | No new hard-coded player strings in migrated components |
| FCI-077 | Responsive/compact final pass | Target resolution matrix passes |

**Exit gate:** A new player completes the first operation without external instruction; keyboard-only and reduced-motion journeys pass.

### FCI-8 — certification, rollout, and legacy retirement

**Goal:** Prove the complete interface and remove compatibility debt safely.

| ID | Deliverable | Acceptance |
|---|---|---|
| FCI-080 | Component/integration test completion | All view/action/state contracts covered |
| FCI-081 | Campaign Playwright first-operation spec | Browser → state → tactical → campaign story passes |
| FCI-082 | Defensive crisis/costly victory/recovery/weather/save/outcome specs | All canonical journeys pass |
| FCI-083 | Visual regression matrix | Desktop/compact/zoom/fog/weather states approved |
| FCI-084 | Performance/stress certification | Budgets pass on full map/roster/history |
| FCI-085 | Information-leak certification | UI/DOM/ARIA/log/analytics scans clean |
| FCI-086 | Feature-flag rollout and rollback drill | Rollback retains new saves safely |
| FCI-087 | Legacy DOM/style/controller removal | No production references; tests/build/browser clean |
| FCI-088 | Support diagnostics and documentation update | Actionable export without enemy truth leak |

**Exit gate:** `campaignCommandUIV2` becomes the only player interface, the compatibility shell is removed, and the release definition of done is met.

## Dependency and sequencing map

```text
FCI-0 Foundation
      ↓
FCI-1 Command frame/selection
      ↓
FCI-2 Map/inspectors ─────→ FCI-3 Situation/reports
      ↓                              ↓
FCI-4 Common order workflow ─────────┘
      ↓
FCI-5 Complete workspaces
      ├──────── depends on C20-040–043 formation lifecycle
      ├──────── depends on campaign Air/Naval order services
      └──────── uses implemented intelligence/logistics/save services
      ↓
FCI-6 Weather/formation integration ← depends on C20-050–053
      ↓
FCI-7 Onboarding/polish/accessibility/localization
      ↓
FCI-8 Certification/rollout/legacy retirement
```

FCI-0 through FCI-4 and substantial parts of FCI-5 can proceed with the current implemented campaign systems. Formation-management and environment controls must wait for their authoritative domain services, but their view-model contracts can be designed earlier.

## Testing strategy

### Unit tests

- UI state transitions and navigation targets;
- view assembler projection safety and stable formatting;
- action registry availability/reason codes;
- order composer schema and preview mapping;
- workspace filters, sort, aggregation, and empty/error/loading states;
- inspector routing and progressive disclosure;
- overlay registry and legend contracts;
- alert aggregation and acknowledgement;
- onboarding semantic-step transitions;
- localization formatters and missing-key behavior.

### Integration tests

- map/list/inspector selection parity;
- workspace → overlay defaults and selection preservation;
- preview → draft → reservation → conflict → commit parity;
- failed atomic commit preserves drafts;
- alert/report deep links;
- time advance resolving/stop behavior;
- AAR decision routes;
- save/load restores campaign truth while UI preferences remain non-authoritative;
- compact sheet and focus restoration;
- developer controls absent from production DOM;
- recursive enemy-truth scan over every player view.

### Browser end-to-end journeys

1. **First operation:** objective → formation → intelligence → draft → commit → advance → battle → AAR → consequence.
2. **Player attack:** campaign engagement identity and exact formation package reach tactical battle.
3. **Defensive crisis:** strategic AI offensive interrupts time and launches mandatory defense.
4. **Costly victory:** objective captured but veteran formation shattered; Situation/Forces/AAR explain the trade.
5. **Recovery:** replacements/refit complete and the same formation identity returns to battle.
6. **Weather gamble:** forecast, order risk, mud/air effect, tactical handoff, and AAR explanation remain consistent.
7. **Save recovery:** interrupt, resume exact tactical/campaign state, finish, return to correct revision.
8. **Campaign end:** victory and defeat, grade/service record, map review, safe load.
9. **Fog integrity:** inspect every workspace, overlay, inspector, tooltip, ARIA label, log, and report for hidden truth.
10. **Compact/keyboard:** complete the first-operation journey without pointer at supported compact width.

### Visual states

Capture and approve:

- fresh campaign, quiet planning, orders ready, resolving, engagement, campaign ended;
- empty and stress rosters/orders/contacts/reports;
- routine/notable/critical/decision-required alerts;
- all eight overlays at far/medium/near zoom;
- low/high confidence and stale/disputed contacts;
- supply isolation and bottlenecks;
- replacement/refit/upgrade comparisons;
- weather/ground states;
- save failure/recovery;
- desktop, compact, 200% zoom, reduced motion, and high-contrast-relevant states.

## Acceptance metrics

### Comprehension

- At least 80% of internal/user-test participants identify the top campaign priority and required decision in ten seconds.
- At least 80% can explain why a selected action is blocked without facilitator help.
- At least 80% correctly distinguish exact friendly state from estimated enemy information.

### Efficiency

- Median experienced-player time to draft a common order: ≤30 seconds.
- Median first-operation completion after onboarding starts is tracked and reviewed for abandonment points.
- Repeated navigation between alert → entity → action requires no more than one explicit Review/Act link plus target focus.

### Reliability

- Zero dead ends in canonical browser journeys.
- Zero unexplained campaign state changes in acceptance review.
- Zero opposing truth leaks in automated scans and manual fog review.
- Zero console errors in release campaign journeys.
- Save/recovery and active-battle resume pass under simulated interruption/quota failures.

## Telemetry and diagnostics

Optional privacy-respecting telemetry may record:

- workspace/overlay usage;
- time to first objective inspection, first formation inspection, first draft, first commit, first battle;
- invalid/blocked action reason-code frequency;
- draft removal, conflict, commit failure, and cancellation frequency;
- advance mode and stop-reason usage;
- alert review and decision completion;
- onboarding completion/skip/resume;
- save/autosave/recovery success/failure;
- render/projection/overlay/preview/segment/AI/save/load performance marks.

Telemetry must not contain save payloads, exact hidden enemy state, private AI rationale, free-form player text, or unprojected identifiers.

Support diagnostics should export:

- version/feature flags;
- save envelope metadata and integrity state without payload truth;
- current campaign revision/phase/time;
- active UI workspace/overlay/selection kind;
- recent typed error/reason codes;
- bounded performance summaries;
- migration/recovery status.

## Rollout and rollback

### Feature flag

Use `campaignCommandUIV2` as a temporary development and rollout flag.

- The flag changes presentation only.
- Saves record rules versions, not UI choice.
- New UI preferences use a separate versioned preference record.
- Rollback mounts the compatibility shell against the same campaign state.
- New campaign saves remain retained and readable according to existing save compatibility; rollback never deletes them.

### Rollout sequence

1. Developer flag with deterministic harness and projection scans.
2. Internal browser dogfood with both interfaces available only to developers.
3. Default-on development build after FCI-5 core workspaces.
4. Release-candidate rollout after FCI-7 acceptance.
5. Default-on production with compatibility fallback during soak.
6. Remove fallback only after FCI-8 rollback drill, save compatibility, and support diagnostics pass.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Interface runs ahead of mechanics | Dead buttons and fake depth | Feature-gate actions; truthful unavailable states; wait for domain services |
| UI duplicates campaign rules | Preview/result divergence | Action registry calls authoritative preview/validation; parity tests |
| Fog leaks through secondary surfaces | Core mechanic invalidated | Projected view models, DOM/ARIA/log scans, no raw runtime imports |
| Monolithic migration destabilizes campaign | Regressions and stalled work | Region-by-region strangler migration with flag fallback |
| Too much information overwhelms players | Abandonment | Stable workspace jobs, progressive disclosure, ten-second test, onboarding |
| Map becomes too small | Planning becomes frustrating | Compact sheets, minimum map area, list alternatives |
| Visual polish harms readability/performance | Slower command and inaccessible states | Tokens, budgets, reduced motion, contrast gates, persistent layers |
| Workspaces drift into inconsistent patterns | Relearning and maintenance cost | Shared components, action grammar, view-model conventions, review checklist |
| Legacy DOM remains indefinitely | Double maintenance | Explicit per-region retirement gate and final FCI-087 task |
| Browser E2E becomes brittle | False confidence or ignored tests | Semantic selectors, deterministic setup services, separate visual/behavior assertions |

## Definition of done

The campaign interface is first-class only when all statements are true:

- The player completes Assess → Plan → Commit → Advance → Fight → Review → Rebuild through one coherent interface.
- Situation passes the ten-second comprehension test.
- Common orders pass the thirty-second drafting test.
- Every implemented campaign mechanic has a complete, inspectable player workflow.
- No production workspace contains placeholder “future slice” actions or developer controls.
- Map, lists, inspector, order tray, alerts, and reports share one selection/navigation model.
- Enemy information remains faction-safe in UI, DOM, ARIA, logs, analytics, and errors.
- Order previews match committed reservations, timing, legality, and consequences.
- Persistent formations, replacements/refit/upgrades, commanders/honors/history, weather/ground, and Air/Naval support are presented when their authoritative services ship.
- Critical interruptions and required decisions cannot be missed or bypassed by time advancement.
- Save, autosave, active battle, recovery, and campaign outcome states are always understandable.
- Keyboard-only, screen-reader, reduced-motion, color-independent, compact, and 200%-zoom journeys pass.
- Performance budgets pass at stress map, roster, order, contact, and report sizes.
- Canonical Playwright journeys and deterministic campaign suites pass with no console errors.
- The compatibility shell, legacy campaign markup/styles, and obsolete controller paths are removed.

## Immediate implementation start

The first executable slice is FCI-0 followed by FCI-1:

1. capture the current shell at 1440×1000, 1280×720, and 800×900;
2. introduce `CampaignCommandUIState`, typed UI events, and `CampaignCommandNavigator`;
3. introduce the Player-safe `CampaignCommandViewAssembler` around the current shell view construction;
4. create campaign CSS tokens and prohibit new campaign rules/styles in `index.html`;
5. mount a feature-flagged `CampaignCommandScreen` that renders the current command bar/rail regions without behavior change;
6. certify selection, save/load, order tray, time advancement, Player attack, and enemy defensive interruption before migrating the first workspace.

Situation is the first workspace to migrate because it establishes the hierarchy and navigation contract used by every later workspace. The common order composer follows after shared selection/map/inspector behavior is stable.
