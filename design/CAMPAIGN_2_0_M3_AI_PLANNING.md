# Campaign 2.0 Milestone 3 — operational plan portfolios and memory

**Work package:** C20-031  
**Status:** Implemented and certified  
**Depends on:** C20-012 common order/reservation rules, C20-013 frozen faction views, C20-030 belief-constrained assessment  
**Next:** C20-032 behavior adapters and shared typed-order generation (implemented; see `CAMPAIGN_2_0_M3_AI_BEHAVIORS.md`)

## Purpose

C20-031 turns the enemy headquarters' situation assessment into a coordinated, save-stable operational intent. It adds the missing middle layer between “the Bot understands the theater” and “the Bot issues campaign orders.”

Each AI command cycle now:

1. consumes the deeply frozen faction-local view and its C20-030 assessment;
2. generates several operational candidates from reported threats, opportunities, uncertainty, reserve pressure, and logistics condition;
3. assigns only exact friendly formations legally available to that faction;
4. scores each candidate with an inspectable heuristic forecast;
5. chooses a portfolio that fits force, reserve, resource, intelligence-capacity, and difficulty-policy constraints;
6. persists active commitments, triggers, recently retired plans, and bounded repetition memory;
7. commits the assessment and portfolio atomically in the same segment transaction.

This package does not itself mutate campaign orders. C20-032 now translates selected plans through `CampaignOrderService`, so AI and player orders use identical validation, reservations, costs, and lifecycle rules.

## Player contract

The portfolio is private headquarters intent. A player experiences it indirectly through later legal enemy behavior: concentration, defense, reconnaissance, withdrawal, reserve commitment, and counterattack. The production campaign UI does not reveal live plan targets, formation assignments, scores, abort triggers, or rationale.

This secrecy policy is deliberate:

- assessment facts are already constrained by the Bot's own fog of war;
- a legal private plan must remain private until observable behavior or later evidence reveals it;
- development diagnostics receive defensive snapshots only;
- future after-action explanation may describe observed intent after secrecy no longer matters;
- private planning content must never enter production DOM, ARIA text, player event summaries, analytics, or exports.

## Campaign versus tactical scope

Operational planning runs only at the campaign layer. Tactical battles receive committed formations and support through the engagement package. Tactical AI does not call the operational planner, and tactical results cannot rewrite an active portfolio directly. Results first commit through the campaign consequence, control, infrastructure, objective, intelligence, and AAR pipeline; the next frozen command boundary then reassesses and replans.

## Information boundary

`planCampaignAIOperations` accepts only `CampaignAIPlanningInput`:

- the faction-owned C20-030 assessment;
- exact friendly formation projections already present in the frozen faction view;
- that faction's economy;
- legally available intelligence collection capacity;
- its prior private planning record;
- an explicit behavioral difficulty policy.

Its signature has no `CampaignRuntimeState`, scenario tile truth, opposing formation registry, opposing economy, opposing transport, opposing orders, raw intelligence claims, truth-comparison data, or hidden objective definition.

Enemy references remain projected contact IDs and reported offset-map locations copied from assessment findings. No selected plan contains an opposing formation ID or name.

## Candidate behaviors

The planner can currently evaluate all nine Campaign 2.0 operational plan families:

| Plan kind | Generated from | Baseline allocation intent |
|---|---|---|
| `defendObjective` | threat near a protected public objective | hold/concentrate forces and ammunition |
| `reinforceFront` | reported sector pressure without a direct objective threat | move an available formation toward the sector |
| `prepareOffensive` | public objective opportunity | concentrate adequate mobile force and stocks |
| `counterattack` | high-value threat/opportunity under offensive posture | commit a bounded local striking force |
| `withdraw` | preserve/delay posture under reported pressure | trade space to preserve an exposed formation |
| `rebuildReserve` | reserve deficit | retain manpower and supplies for reserve recovery |
| `protectLogistics` | strained/critical sustainment | protect hubs/routes and restore operational support |
| `interdictSupply` | reported weak/disrupted/isolated contact | exploit projected logistics weakness with collection support |
| `gatherIntelligence` | moderate/high uncertainty | reserve collection capacity before a larger commitment |

C20-031 records intent and allocation only. A candidate is not a free movement, combat, repair, production, or intelligence action.

## Candidate scoring

Every candidate stores a bounded 0–100 score and its complete factor trace:

- objective value;
- force adequacy;
- urgency;
- logistics support;
- intelligence confidence;
- reserve health;
- continuity bonus;
- exposure penalty;
- downside penalty;
- repetition penalty.

Positive factors are weighted before explicit penalties. Support plans receive contextual value only when the corresponding problem exists: reserve deficit, critical logistics, or high uncertainty.

Viability is separate from desirability. A high-scoring candidate is rejected when it lacks enough legally available friendly formations, exceeds the planning resource budget, lacks collection capacity, or consumes protected reserve below the permitted emergency floor.

Candidate ordering is score-descending with stable-ID tie breaking. IDs and hashes depend on campaign/faction/source boundary and projected content, never wall-clock time or unseeded randomness.

## Formation allocation and reserve discipline

A formation enters the ordinary available pool only when it is:

- owned by the planning faction;
- `ready`;
- not assigned an active order;
- placed at a known friendly runtime location;
- at least 45 readiness;
- at least 45 percent effective strength.

Preference ranking uses legal target distance, mobility for movement-heavy plans, readiness, effective strength, and stable formation identity.

Portfolio selection owns the final allocation. It prevents:

- the same formation appearing in two selected plans;
- held reserve formations appearing in a selected plan;
- a selected plan receiving fewer formations than requested;
- ordinary plans reducing the reserve below its assessed requirement;
- emergency critical-threat plans drawing more than one formation below that requirement.

The reserve list is explicit, persisted, and integrity-bound. C20-032 now turns selected assignments into common order reservations before commitment; held headquarters reserve remains a private planning constraint until a dedicated hold/refit order exists.

## Resource portfolio

Planning uses a bounded share of current friendly stocks rather than treating all theater resources as disposable:

- 40 percent of supplies, fuel, and ammunition;
- 30 percent of manpower;
- currently available intelligence collection capacity.

Each plan kind carries an explicit provisional resource request. The portfolio accumulates those requests and rejects candidates that would exceed any category. These values are planning allocations, not consumption. C20-032 common order preview and reservation rules are authoritative at execution.

## Difficulty policy

Difficulty is explicit behavior policy, not a knowledge cheat:

| Policy | Horizon | Candidate breadth | Portfolio size | Commitment | Minimum score | Risk tolerance |
|---|---:|---:|---:|---:|---:|---:|
| Easier | 2 segments | 6 | 2 plans | 2 segments | 48 | 35 |
| Standard | 4 segments | 9 | 3 plans | 3 segments | 42 | 55 |
| Harder | 6 segments | 12 | 4 plans | 4 segments | 38 | 70 |

All policies use the same faction projection. No policy shortens reaction below the frozen start-boundary delay, reveals hidden truth, grants free resources, or changes combat math.

## Operational memory and hysteresis

The saved memory contains:

- current selected plans and stable plan IDs;
- assigned formations and provisional resource allocations;
- start, review, and minimum-commitment segments;
- reinforce, exploit, abort, and withdraw triggers;
- a newest-first archive of up to 12 retired plans;
- bounded repetition counts by plan signature.

A still-relevant active plan gains a continuity bonus and retains its plan ID. If its assessment signal temporarily disappears before the minimum commitment expires, the planner generates a continuity candidate from its own prior legal memory. This prevents one-segment score noise from causing unrealistic order oscillation.

Plans not retained move to recent history as `superseded`. C20-032/C20-034 can later record `completed`, `failed`, or `aborted` outcomes. Repeated retired signatures accumulate a bounded penalty so headquarters does not alternate endlessly between the same two operations.

## Segment timing and atomicity

Planning occurs beside assessment inside the intelligence phase of the ordinary three-hour transaction:

```text
authoritative start boundary
        │
        ▼
deeply frozen faction projection
        │
        ├── exact friendly condition/economy/orders
        ├── fused projected contacts
        └── public objective/score facts
        │
        ▼
C20-030 theater assessment
        │
        ▼
C20-031 candidate generation and portfolio selection
        │
        ├── formation/resource/reserve constraints
        ├── prior private operational memory
        └── explicit difficulty policy
        │
        ▼
assessment + planning integrity validation
        │
        ▼
single transaction commit
```

New intelligence resolved in the same segment cannot alter this cycle because both assessment and planning consume the pre-segment frozen view. The next cycle may react to the new report.

Any generation, scoring, canonicalization, or invariant failure aborts the complete segment transaction. No partial portfolio or assessment replaces the last valid runtime.

## Persistence and integrity

`CampaignRuntimeState.aiPlanningByFaction` stores the latest planning record. It is optional only for runtime-version-1 saves written before C20-031; newly created runtimes initialize an empty record.

Every record stores:

- version, stable ID, faction, and exact assessment ID;
- source revision/segment and generated segment;
- the assessment integrity hash;
- a canonical hash of all legal planning inputs;
- explicit policy;
- evaluated candidates;
- selected portfolio, resource totals, and held reserve;
- active/recent operational memory;
- one canonical integrity hash over the complete record.

Runtime validation rejects ownership mismatch, assessment mismatch, impossible timing, malformed hashes, unsupported plan kinds/policies, duplicate candidate/plan/formation identities, opposing formation allocation, selected plans without candidates, reserve overlap, malformed resources/scores/memory, or changed content without regenerated integrity.

Save envelopes require no version bump because the runtime-version-1 contract already permits additive optional fields and checksum validation covers the complete payload. JSON round-trip retains planning identity and integrity.

## UI and diagnostics

`CampaignState.getCampaignAIPlanningRecord(faction)` returns a defensive clone for C20-032 and development tooling. There is intentionally no production player panel for live enemy intent.

Future development diagnostics may show candidate scores and rejection reasons only behind a development gate. Future production surfaces must use observed or resolved evidence, such as:

- intelligence estimates of enemy concentration;
- observable movement or reserve commitment;
- AAR explanation after an operation resolves;
- tutorial text that does not expose current hidden plans.

## Certification

Automated C20-031 coverage proves:

- identical projected inputs create byte-equivalent planning records;
- integrity recomputation matches the stored proof;
- evaluated and selected portfolios contain no hidden opposing formation identities;
- one formation cannot be assigned to two selected plans;
- held reserve cannot overlap selected assignments;
- provisional resource totals cannot exceed the explicit planning budget;
- an active matching plan retains stable identity and receives continuity value;
- operational memory mirrors the selected portfolio;
- assessment and planning records commit together at the exact frozen segment boundary;
- serialized runtime validates after round-trip;
- changing a candidate score without regenerating integrity is rejected as `AI_PLANNING_INVALID`.

## Code map

| File | Responsibility |
|---|---|
| `src/game/campaign/ai/CampaignAIPlanningTypes.ts` | Plan kinds, policy, resources, candidates, selected plans, portfolio, memory, and narrow input contracts. |
| `src/game/campaign/ai/CampaignAIPlanningService.ts` | Deterministic generation, scoring, allocation, portfolio selection, hysteresis, memory, IDs, and integrity. |
| `src/game/campaign/runtime/CampaignSegmentResolver.ts` | Frozen planning input and atomic assessment/portfolio command cycle. |
| `src/game/campaign/runtime/campaignRuntimeTypes.ts` | Optional backward-compatible planning record. |
| `src/game/campaign/runtime/CampaignScenarioAdapter.ts` | New-runtime planning initialization. |
| `src/game/campaign/runtime/CampaignInvariantValidator.ts` | Ownership, timing, allocation, memory, and integrity enforcement. |
| `src/state/CampaignState.ts` | Defensive private planning selector. |
| `tests/CampaignAI.planning.test.ts` | Determinism, fog safety, coordination, hysteresis, transaction, persistence, and tamper certification. |

## Deliberate limits and next work

C20-031 does not yet:

- create or commit common typed orders;
- hold authoritative formation/resource/capacity reservations;
- move, refit, repair, or fight with selected formations;
- initiate Bot engagements or player defensive missions;
- evaluate weather that has not yet been implemented;
- classify plan completion/failure from downstream outcomes;
- expose live enemy rationale to production UI;
- run the 500-seed full campaign-day soak gate.

C20-032 is implemented and certified in `CAMPAIGN_2_0_M3_AI_BEHAVIORS.md`. C20-033 should now use committed opposing-force operations to create campaign engagements and player defensive tactical battles.
