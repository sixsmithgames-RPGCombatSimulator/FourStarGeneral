# Campaign 2.0 Milestone 3 — shared AI behavior and typed-order execution

**Work package:** C20-032  
**Status:** Implemented and certified  
**Depends on:** C20-012 common typed orders and reservations, C20-013 frozen segment boundary, C20-020 persistent formations, C20-030 assessment, C20-031 operational planning  
**Next:** C20-033 Bot-initiated engagements and player defensive battles

## Purpose

C20-032 closes the gap between a private AI operational plan and an action that can change the campaign. The strategic opponent no longer receives special movement, intelligence, production, or resource mutations. Every selected plan is translated into the same typed campaign drafts used by the player, checked by the same validators, arbitrated through the same reservation ledger, charged to the same economy and transport capacities, and advanced by the same segment lifecycle.

The command cycle is now:

```text
frozen faction-safe view
        │
        ▼
belief-constrained assessment (C20-030)
        │
        ▼
coordinated plan portfolio (C20-031)
        │
        ▼
behavior directive
        │
        ├── typed redeployment
        ├── typed reconnaissance / counterintelligence
        └── typed production allocation
        │
        ▼
shared validation + reservations + costs + atomic commit
        │
        ▼
ordinary future segment resolution
```

This package deliberately stops an offensive at the legal friendly staging line. Crossing into opposed territory and creating an engagement belongs to C20-033, where formation commitment and player defensive-battle routing can be handled through the engagement ledger.

## Player-facing behavior

The player does not see the enemy's live plan record or behavior rationale. The feature is experienced through legal, observable campaign effects:

- enemy formations concentrate near a threatened objective;
- exposed formations withdraw to safer friendly ground;
- reserves move toward reported pressure;
- reconnaissance or verification operations consume enemy intelligence capacity;
- operational-security activity protects enemy logistics;
- reserve rebuilding changes the enemy's real production allocation;
- committed movement takes time, consumes stocks, occupies transport capacity, and can be interrupted only under the same lifecycle rules as player movement.

The existing campaign map, intelligence reports, order outcomes, engagement flow, and after-action reports remain the only production surfaces from which a player infers enemy intent. Private targets, contact IDs, candidate scores, assigned formation IDs, blocked reasons, and hashes are never added to player DOM, accessibility text, alerts, exports, or analytics.

## Campaign and tactical scope

C20-032 is a campaign-layer system. It issues campaign orders and advances exact campaign formations. Tactical code does not call the behavior service.

The tactical layer participates only after the campaign creates an engagement package. C20-033 will convert a legal Bot offensive or counterattack at the staging boundary into an engagement-ledger opportunity and, when required, a player defensive tactical battle. Tactical results then return through the existing result, consequence, control, infrastructure, objective, and AAR pipeline before the next AI assessment.

## Plan-to-order mapping

| Operational plan | Common action produced by C20-032 | Current legal endpoint |
|---|---|---|
| `defendObjective` | exact-formation redeployment | closest friendly staging tile to the reported threat/objective |
| `reinforceFront` | exact-formation redeployment | closest friendly staging tile to reported pressure |
| `prepareOffensive` | exact-formation redeployment | closest friendly staging tile to the projected objective |
| `counterattack` | exact-formation redeployment | closest friendly staging tile to the projected opportunity |
| `withdraw` | exact-formation redeployment | friendly tile farthest from the reported threat |
| `rebuildReserve` | production-allocation order | next legal production boundary |
| `protectLogistics` | `opsec` counterintelligence order | assigned friendly asset/location |
| `interdictSupply` | `verify` reconnaissance order | projected contact/location |
| `gatherIntelligence` | `groundRecon` order | projected uncertainty area |

If every assigned formation is already on the legal staging tile, the directive is recorded as `holding`; no zero-distance or free order is fabricated. If a common draft becomes illegal, the directive is recorded as `blocked` and its draft reservations are removed.

## Exact formation commitment

Player redeployment historically selected aggregate unit counts. Strategic AI requires a stable relationship between its plan assignment and the formation that actually moves, so redeployment payloads now support an optional `formationIds` list without breaking legacy orders.

For an exact redeployment:

1. each formation must exist, belong to the issuing faction, be ready, have no current order, occupy the origin tile, and match the selected unit-type counts;
2. the draft creates `formation-id:<id>` reservations instead of anonymous unit-count reservations;
3. common order validation rejects duplicate, mismatched, unavailable, already ordered, or incorrectly located formations;
4. commit sets each formation's `currentOrderId` and `inTransit` status;
5. the compatibility movement decision carries the exact IDs while retaining aggregate selections for the legacy projection;
6. arrival moves those exact records to the destination and clears their order/status lock;
7. blocked execution or legal pre-execution cancellation releases those same exact formations;
8. aggregate force counts are reconciled from the persistent formation registry after movement.

Orders without `formationIds` continue to use the established aggregate selection behavior. This keeps prior saves and player-facing redeployment compatible while giving AI planning exact identity conservation.

## One common commit path

`commitCampaignOrderDrafts` is now the sole authoritative commit implementation for player and AI campaign drafts. It performs a final whole-book revalidation and then applies each requested draft within the caller-owned transaction.

The common path handles:

- supply, fuel, ammunition, and manpower affordability;
- transport-capacity occupation;
- production-slot exclusivity;
- exact or aggregate formation reservations;
- intelligence capacity and assigned-asset reservations;
- reconstruction facility and engineer reservations;
- compatibility execution adapters;
- committed status, execution references, validation revision, and consumed reservations.

Any missing, stale, or invalid requested draft throws. Because both player order commits and AI behavior execution run within campaign runtime transactions, the entire requested set rolls back rather than partially spending resources or committing only part of a portfolio.

## Behavior arbitration

For each selected plan, the behavior service performs the following deterministic arbitration:

1. reuse still-active committed or executing orders linked to the same persistent plan ID;
2. otherwise create the appropriate common typed draft;
3. revalidate the complete order book so existing orders and reservations participate in conflicts;
4. remove every sibling draft for an invalid plan and release its proposed reservations, preventing partial execution of a multi-origin maneuver;
5. classify the plan as `ordered`, `holding`, or `blocked`;
6. atomically commit every remaining valid behavior draft;
7. persist a plan-to-order trace tied to the exact C20-031 planning record.

Stable ordering is based on plan IDs, origin locations, unit types, and formation IDs. There is no wall-clock or unseeded-random ordering.

Continuing plans can retain their formations while a previous order is committed or executing. The planner's continuity pool recognizes only the formations assigned to that same active plan; an unrelated plan cannot claim them. This preserves hysteresis without creating a double commitment.

## Segment timing

Assessment, planning, and behavior translation consume the frozen start-of-segment faction boundary. Behavior orders are committed after the current segment's movement phase and therefore cannot move immediately on the information that created them. Their earliest effect is the next legal segment.

This preserves all three timing guarantees:

- no same-segment reaction to newly resolved intelligence;
- no same-segment teleportation after an AI decision;
- no hidden extra AI action between player-visible campaign boundaries.

## Persistence and integrity

`CampaignRuntimeState.aiBehaviorsByFaction` stores the latest private behavior record per AI faction. It remains optional for backward compatibility with earlier runtime-version-1 saves; new campaigns initialize an empty record.

Each record contains:

- schema version and stable behavior ID;
- owning faction;
- exact source planning ID, revision, and segment;
- one directive per selected operational plan;
- directive status, common order IDs, and private explanation;
- the complete unique committed-order list;
- the complete blocked-plan list;
- a canonical source hash and an integrity hash.

Runtime validation rejects:

- Player or Neutral ownership;
- a missing or mismatched current planning record;
- source revision/segment drift;
- duplicate, missing, or extra plan directives;
- unsupported plan kinds or directive statuses;
- `ordered` directives without orders;
- `holding` or `blocked` directives with orders;
- missing, draft, or cross-faction linked orders;
- duplicate or inconsistent committed/blocked lists;
- malformed or recomputed hash mismatch.

The behavior record and its typed orders commit in the same segment transaction. A behavior or order invariant failure rolls the complete segment back.

## UI and UX contract

C20-032 intentionally adds no enemy-plan panel. First-class UI for strategic opposition should communicate evidence and consequences, not omniscient internals.

Production surfaces should use these rules:

- show enemy movement only when campaign visibility rules reveal it;
- describe contacts as estimates until evidence confirms them;
- present a defensive-battle interruption when C20-033 creates one;
- explain observed pressure, concentration, interdiction, and objective danger in intelligence briefs and AARs;
- never expose current behavior status, exact assignments, target contact IDs, source hashes, or blocked validation reasons;
- keep full rationale available only to development diagnostics and deterministic test output.

## Certification

Focused automated coverage proves that:

- a frozen Bot plan creates common typed orders rather than direct campaign mutations;
- committed behavior orders belong to the Bot and pass ordinary validation;
- exact formation IDs match the plan assignment and are unique;
- exact formations become `inTransit` with the common order ID;
- the persisted behavior trace links one directive to every selected plan;
- behavior integrity recomputes exactly;
- runtime invariants pass with the committed portfolio;
- a second segment resolves movement through the normal movement adapter;
- exact formations arrive at the intended legal friendly tile;
- arrival clears `currentOrderId` and restores `ready` status;
- the active plan remains legal across the in-transit boundary;
- tampering with planning or behavior content fails closed.

## Code map

| File | Responsibility |
|---|---|
| `src/game/campaign/ai/CampaignAIBehaviorTypes.ts` | Private plan directive, status, order-link, and behavior record contracts. |
| `src/game/campaign/ai/CampaignAIBehaviorService.ts` | Deterministic plan translation, active-order reuse, arbitration, atomic common-order commit, and integrity. |
| `src/game/campaign/orders/CampaignOrderTypes.ts` | Backward-compatible exact redeployment formation identities. |
| `src/game/campaign/orders/CampaignOrderService.ts` | Exact validation/reservations and the shared Player/AI commit path. |
| `src/game/campaign/runtime/CampaignSegmentResolver.ts` | Behavior execution at the frozen command boundary and exact movement arrival/release. |
| `src/game/campaign/runtime/campaignRuntimeTypes.ts` | Optional behavior persistence and invariant issue type. |
| `src/game/campaign/runtime/CampaignScenarioAdapter.ts` | New-runtime behavior record initialization. |
| `src/game/campaign/runtime/CampaignInvariantValidator.ts` | Planning linkage, common-order linkage, status, identity, list, and integrity enforcement. |
| `src/state/CampaignState.ts` | Shared player commit use, exact cancellation release, and defensive behavior selector. |
| `tests/CampaignAI.planning.test.ts` | Two-segment shared-order, exact-formation, persistence, and integrity certification. |

## Deliberate limits and next work

C20-032 does not yet:

- cross an enemy-controlled boundary;
- create Bot-initiated engagement opportunities;
- commit attackers and defenders through the engagement ledger;
- interrupt time advancement for a mandatory player defensive battle;
- resolve a Bot offensive through tactical play or delegation;
- classify downstream operational plans as completed, failed, or aborted;
- expose a development-only rationale inspector;
- run the 500-seed campaign-day soak gate;
- replace aggregate player redeployment selection with a formation-roster UI.

C20-033 should consume a legally staged `prepareOffensive` or `counterattack` directive, identify the projected target without consulting hidden opposing formation truth, create an engagement opportunity through the existing ledger, commit exact Bot attackers and legally available defenders, and route a Player defense through the same pre-battle, tactical save, consequence, control, objective, and AAR systems already certified in Milestone 2.
