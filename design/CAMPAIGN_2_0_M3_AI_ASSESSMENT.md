# Campaign 2.0 Milestone 3 — belief-constrained operational AI assessment

**Work package:** C20-030  
**Status:** Implemented and certified  
**Depends on:** C20-003 determinism, C20-013 frozen faction views, C20-020 formation substrate, C20-025 infrastructure/logistics effects, C20-026 objectives/end states  
**Next:** C20-031 AI plan candidates, portfolio scoring, and operational memory

## Purpose

C20-030 gives the strategic opponent an operational picture before it is allowed to choose an operation or issue an order. The assessor converts legal faction-local information into a deterministic, save-stable statement of:

- strategic posture;
- force health and assessed force balance;
- reserve availability and reserve requirement;
- logistics condition;
- intelligence uncertainty;
- public objective pressure and deadline risk;
- ranked threats;
- ranked opportunities;
- a private explanation trace that can reproduce the conclusion.

This work package does not move formations or start battles. C20-031 will consume the assessment to generate and score operational plan portfolios, and C20-032 will translate selected plans into behaviors and common typed orders.

## Player contract

The assessor is campaign-owned and intentionally indirect from the player's perspective. It is the enemy headquarters' private reasoning step, not a new omniscient panel for the player.

Once the planning and behavior work packages land, the player should experience this system as an opponent that:

- notices reported concentrations near important objectives;
- values deadlines and score instead of merely chasing the closest counter;
- distinguishes a dangerous contact from an uncertain or stale one;
- preserves weakened forces and short supplies;
- maintains a reserve instead of committing every formation;
- identifies exposed objectives and reported enemy weakness;
- reacts after its information reaches headquarters, not in the same instant hidden truth changes;
- leaves readable evidence in later after-action reporting without revealing its live plan beforehand.

The current milestone creates the complete factual and explanation substrate for those behaviors. It does not expose the Bot's current posture, target ranking, reserve threshold, or rationale in production campaign UI.

## Campaign view versus tactical battle

Operational assessment belongs to campaign simulation.

| Layer | Responsibility |
|---|---|
| Campaign intelligence | Gather, fuse, age, dispute, and project enemy contacts separately for each faction. |
| Campaign segment transaction | Freeze the legal start-of-segment picture for every faction. |
| Operational assessment | Interpret friendly truth, projected contacts, public objectives, resources, and existing friendly orders. |
| AI planning/behavior | Future C20-031/C20-032 consumers choose plans and issue ordinary typed campaign orders. |
| Engagement generation | Future C20-033 turns legal Bot commitments into campaign engagements and player defensive battles. |
| Tactical battle | Resolve the committed local battle package; it never runs the strategic assessor. |
| Campaign AAR | Later explain observed enemy intent and consequences after the operation is no longer secret. |

Tactical results can change formation condition, resources, control, infrastructure, objectives, and intelligence evidence. Those committed campaign consequences influence the next operational assessment. Tactical AI remains a separate local battlefield system.

## Resolution and reaction timing

One assessment is generated inside the ordinary three-hour segment transaction:

```text
authoritative start boundary
        │
        ▼
deeply frozen faction projection
  ├── exact friendly formation condition
  ├── exact friendly economy and orders
  ├── sanitized map and friendly installations
  ├── faction-local projected contacts only
  └── public objective/phase/score facts
        │
        ▼
deterministic operational assessment
        │
        ├── posture
        ├── force/reserve/logistics/intelligence summaries
        ├── objective pressure
        ├── ranked threats and opportunities
        └── private rationale
        │
        ▼
integrity validation and transaction commit
        │
        ▼
next planning cycle may consume assessment
```

The intelligence phase may also resolve new reconnaissance reports during that segment, but the assessment still uses the frozen start-boundary view. This is deliberate:

- movement, logistics, intelligence, and AI cannot observe intermediate same-segment mutation;
- a new report is available to the next command cycle;
- a hidden opposing movement cannot cause an instantaneous reaction;
- save/reload and uninterrupted play retain the same reaction schedule.

This one-boundary command delay is the baseline anti-omniscience policy. Later difficulty policies may add longer reaction delays, but no difficulty may remove the faction projection boundary.

## Information-security contract

`assessCampaignAITheater` accepts only `CampaignAIAssessmentInput`. Its public signature has no `CampaignRuntimeState`, full scenario/map tile record, opposing control truth, opposing formation registry, opposing economy, opposing transport capacity, opposing orders, engagement truth, or raw intelligence claims.

### Exact friendly inputs

The faction projection contains:

- stable friendly formation identity and name;
- campaign unit type and current campaign location;
- lifecycle status;
- effective personnel/equipment strength percentage;
- readiness, cohesion, fatigue, and sustainment;
- whether the formation is mobile;
- whether it already has an active order;
- the faction's exact economy;
- the faction's existing typed orders;
- intelligence collection capacity.

The projection deliberately summarizes formation status instead of passing tactical object graphs or mutable campaign records into AI code.

### Opposing inputs

Enemy information consists exclusively of a narrowed operational picture containing collection coverage/capacity and `CampaignEnemyContactView` records already sanitized by campaign intelligence:

- contact identity local to the observing faction;
- reported location and uncertainty radius;
- knowledge level and current/stale/disputed state;
- confidence band;
- classification and strength only when the knowledge level permits them;
- readiness and supply only at assessed knowledge;
- movement reporting, observation age, source labels, and analyst notes.

The projection strips raw correlation keys and persistent opposing formation identity. A hidden opposing formation may change name, readiness, equipment, personnel, supply, or order without changing the assessment until legal evidence changes the observing faction's contact picture.

### Public campaign inputs

The assessor receives only visible objectives. An unresolved `secretUntilResolved` objective is omitted. For every visible objective it receives stable identity, label, location, owner, required faction, whether territorial control is actually relevant, current projected controller, category, lifecycle state, progress, deadline, and score value.

The current operation phase and public score summary are also included. This allows future planners to reason about campaign direction without reading hidden opposing state.

## Formation assessment

Effective strength is projected once at the security boundary:

1. personnel effectiveness counts fit personnel fully and injured personnel at half value;
2. equipment effectiveness counts operational platforms fully and damaged platforms at half value;
3. available personnel/equipment ratios are averaged;
4. the result cannot exceed formation readiness;
5. the final result is an integer percentage from 0 to 100.

The assessor reports active, combat-ready, and committed formation counts plus average effective strength, readiness, cohesion, and fatigue.

Projected enemy pressure uses only contact bands. Unclassified contacts receive a conservative middle estimate. Strength is adjusted by confidence, age, current/stale/disputed state, assessed readiness, and assessed supply. The aggregate is compared with total friendly effective strength to produce:

- `unknown` when no enemy contacts exist;
- `critical`;
- `unfavorable`;
- `even`;
- `favorable`;
- `dominant`.

`unknown` does not mean safe. It is carried separately into posture and rationale so future planning can buy reconnaissance or retain caution.

## Reserve assessment

A formation is available as a baseline reserve when it is:

- active and `ready`;
- not assigned an active order;
- at least 60% ready;
- at least 60% effective strength.

The baseline reserve requirement is 20% of active formations, rounded up with a minimum of one when forces exist. Each critical projected threat can add a bounded requirement, to a maximum of two additional formations. The assessment records available, required, deficit, and adequacy values.

This is a command estimate, not a reservation. C20-031 must allocate reserves through explicit operational plans, and C20-032 must use ordinary formation reservations/orders before any force becomes committed.

## Logistics assessment

The logistics result combines theater economy with average formation sustainment. It reports `critical`, `strained`, `adequate`, or `secure` and identifies low resource categories without reading opposing stocks.

Resource thresholds scale with active friendly formation count. Supplies, ammunition, fuel, and manpower use separate critical and strained multipliers. Formation sustainment includes rations and parts plus applicable carried ammunition/fuel pools.

Rules are deliberately banded because the campaign does not yet model route-by-route days of supply. C20-032 can act on this result now; later logistics-route systems can replace the band inputs without changing the assessment contract.

## Intelligence assessment

The intelligence summary records:

- visible contact count;
- current contact count;
- stale/disputed contact count;
- high-confidence contact count;
- currently available collection capacity;
- low, moderate, or high aggregate uncertainty.

No-contact situations are high uncertainty rather than proof of no enemy. A contact picture dominated by stale/disputed reporting or lacking any high-confidence reports is also high uncertainty. This makes reconnaissance a rational future plan candidate rather than an authored exception.

## Objective pressure

Territorial objective alignment is interpreted from the public required faction:

- if the AI faction is required to control the objective, its control protects the objective;
- if another faction is required to control it, preventing that required control protects the AI's operational interest;
- an objective not in the protected state is a potential secure/contest opportunity;
- a projected contact within its uncertainty-inflated influence range can threaten a protected objective.

Non-territorial resource, formation-preservation, survival, linked-objective, and operation-result goals still contribute to deadline/score awareness, but they cannot create a fabricated capture or contest opportunity merely because they have a display marker.

The aggregate records active objectives, currently protected objectives, threatened objectives, deadlines within eight segments, score at risk, and the nearest deadline distance.

This is not a hidden-objective cheat. The assessor sees the same visibility-filtered objective facts that may lawfully enter the faction projection.

## Threat ranking

Each projected contact can produce one threat finding. Its score combines:

- assessed contact pressure from visible strength/condition/supply bands;
- report confidence, age, and contact state;
- proximity to a protected objective;
- public objective score value;
- proximity to friendly formations;
- reported movement or preparation.

Findings retain only projected contact IDs and public objective keys. Each finding includes a stable ID, target hex, 0–100 score, routine/important/urgent/critical priority, confidence band, summary, detail, and ordered factors. Results use deterministic score order followed by stable-ID tie breaking and are bounded to eight entries.

## Opportunity ranking

Two opportunity families are implemented:

1. **Objective action:** secure an objective required by the faction or contest an objective required by its opponent. Score uses objective category/value, friendly distance, deadline pressure, and projected resistance near the objective.
2. **Exploit reported weakness:** consider a contact only when projected reporting indicates disrupted/degraded readiness or isolated/strained supply. Score uses friendly distance and the visible severity of that weakness.

An opportunity is an assessed candidate, not permission to attack. C20-031 still has to build a viable portfolio, forecast downside, preserve reserves, and obtain legal order previews.

## Posture policy

Posture is selected after all subordinate assessments:

| Posture | Baseline trigger |
|---|---|
| `preserve` | No active force, very low effective strength, critical logistics, or critical assessed force balance. |
| `delay` | Critical threat with inadequate reserve, threatened urgent objective, or unresolved critical objective pressure. |
| `balanced` | No stronger preservation, delay, or offensive trigger. |
| `pressure` | A meaningful opportunity exists with usable logistics and adequate reserve. |
| `decisiveOffensive` | A very strong opportunity, healthy force, secure logistics, adequate reserve, and non-adverse assessed balance align. |

The policy is deterministic and heuristic. It has no opaque learning model and consumes no random stream. Difficulty-dependent planning breadth and tie-breaking belong to C20-031, while disclosed scenario resource handicaps remain separate.

## Persistence and integrity

The runtime stores the latest assessment by AI-controlled faction in `aiAssessmentsByFaction`. The field is optional only for Campaign 2.0 runtime-version-1 saves created before C20-030; new runtimes initialize an empty record.

Every assessment stores:

- version and stable assessment ID;
- faction;
- source revision and segment;
- generated segment;
- canonical hash of the complete legal input;
- every subordinate assessment and finding;
- private rationale;
- canonical integrity hash over all assessment content.

Runtime invariants reject invalid ownership, missing faction records, future or impossible assessment timing, malformed hashes, invalid posture/scores/findings, duplicate finding IDs, and changed content without a matching integrity hash.

The segment transaction commits the assessment alongside its generic operational-command event. The event does not disclose posture, targets, threat scores, opportunities, or rationale to the player log.

## UI and explanation policy

### Production player UI

C20-030 adds no enemy-thought panel. Showing a live Bot posture, target, or reason would reveal information the player has not earned. Production UI may later surface:

- observable behavior such as concentration, withdrawal, or reserve commitment;
- intelligence analysts' interpretation of those observations, with confidence;
- after-action explanation once secrecy is no longer relevant;
- authored tutorial explanations that do not expose live hidden state.

### Development diagnostics

`CampaignState.getCampaignAIAssessment(faction)` returns a defensive snapshot for C20-031 and development tooling. No current campaign component renders it. A future debug inspector must remain development-only and must never copy truth-comparison data into production DOM, ARIA text, logs, exports, or AARs.

### Accessibility

When player-visible observed-intent and post-action explanation arrive, they must use text and semantic priority labels in addition to color. Ranked findings already carry stable summaries, details, priority, confidence, and factor lists suitable for accessible presentation after visibility policy permits it.

## Determinism and failure behavior

- The service is pure with respect to its input and consumes no RNG.
- Input arrays are ranked with deterministic secondary keys.
- Stable IDs derive from campaign, faction, revision, segment, projected identities, and input content.
- Canonical hashes are independent of object property insertion order.
- Any assessment exception aborts and rolls back the complete segment transaction.
- Any post-assessment invariant failure restores the exact pre-segment runtime.
- JSON serialization preserves assessment identity and integrity.
- New intelligence resolved during the transaction cannot alter the already frozen input.

## Certification

Automated C20-030 coverage proves:

- identical projected inputs create byte-equivalent assessments;
- changing hidden opposing formation identity/condition does not change the Bot projection or assessment;
- hidden opposing formation IDs and names do not enter serialized assessment content;
- exact friendly condition does change force assessment;
- a massed high-confidence contact near a decisive deadline objective produces critical objective pressure;
- projected weakness reduces threat and creates an exploitation opportunity;
- critical logistics forces `preserve` posture;
- segment resolution stores the assessment from its exact frozen-view checkpoint;
- the intelligence phase report accounts for the assessment record;
- JSON round-trip retains a valid assessment;
- modifying assessment content without regenerating integrity is rejected.

The full TypeScript suite and production build remain required because expanding frozen faction views changes deterministic segment checkpoint hashes and serialized runtime content across campaign systems.

## Code map

| File | Responsibility |
|---|---|
| `src/game/campaign/ai/CampaignAIAssessmentTypes.ts` | Legal projected input, summaries, findings, posture, and persisted assessment contracts. |
| `src/game/campaign/ai/CampaignAIAssessmentService.ts` | Pure scoring, ranking, posture policy, stable IDs, and integrity hashing. |
| `src/game/campaign/runtime/CampaignSegmentResolver.ts` | Friendly/objective projection, frozen input construction, reaction timing, and atomic assessment commit. |
| `src/game/campaign/runtime/campaignRuntimeTypes.ts` | Optional backward-compatible runtime assessment record and invariant issue code. |
| `src/game/campaign/runtime/CampaignScenarioAdapter.ts` | New-runtime initialization. |
| `src/game/campaign/runtime/CampaignInvariantValidator.ts` | Ownership, timing, score, finding, and integrity validation. |
| `src/state/CampaignState.ts` | Defensive strategic-planning/development selector. |
| `tests/CampaignAI.assessment.test.ts` | No-leak, determinism, posture, ranking, transaction, persistence, and tamper certification. |

## Deliberate limits and next work

C20-030 does not yet:

- create plan candidates or choose a coordinated portfolio;
- store multi-segment operational memory, commitment, abort, or exploitation triggers;
- reserve formations/resources for AI use;
- issue typed campaign orders;
- model behavior-specific defense, offense, reserve, logistics, or intelligence plans;
- initiate Bot counterattacks or generate player defensive tactical missions;
- run long seeded campaign-day soak tests;
- expose live enemy rationale to production UI.

C20-031 is now unblocked. It should consume only `CampaignAITheaterAssessment` plus legal common-order previews, generate multiple operational plan candidates, score a bounded portfolio, persist operational memory and rationale, and retain enough hysteresis to prevent order oscillation.
