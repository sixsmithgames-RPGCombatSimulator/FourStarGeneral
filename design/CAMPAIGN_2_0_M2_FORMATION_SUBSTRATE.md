# Campaign 2.0 M2 — Persistent Formation Substrate

**Work item:** C20-020  
**Status:** Implemented  
**Depends on:** C20-001 runtime split, C20-002 stable identity, C20-003 deterministic records, C20-005 save envelope

## Outcome

Campaign formations are now durable campaign-owned records. A force counter on a map tile is a compatibility projection of those records; it is no longer sufficient identity for a unit that moves, fights, survives, or is destroyed. Tactical units created for a campaign engagement carry explicit, save-stable provenance back to the campaign formation that produced them.

This is the minimum authoritative substrate for C20-021 through C20-023. It deliberately does not apply battle losses or implement player replacement/refit/upgrade queues. Those mechanics can now operate on stable records without inventing a second identity system.

## Player promise established by this iteration

- A formation is the same organization after it moves to another campaign hex.
- A campaign-generated tactical unit can identify the exact campaign formation it represents.
- Formation names, personnel/equipment state, supply, experience, ownership, commander link, honors, and history survive campaign saves.
- A destroyed or retired formation remains in the registry and history; it is not silently replaced by a newly generated token.
- Legacy campaign content remains playable: every authored aggregate count deterministically becomes one formation.

The formation roster, named-unit selection, battle reconciliation, replacements, refit, upgrades, commanders, honors, and full forces workspace remain subsequent work items.

## Authority model

```text
CampaignFormationRecord (authoritative identity and condition)
        │
        ├── locationHexKey ───────────────┐
        │                                 │
        ├── personnel/equipment/supply    │
        │                                 ▼
        │                         CampaignTileRuntime.formationIds
        │                                 │
        │                                 ▼
        │                         tile.forces compatibility counts
        │
        └── CampaignFormationBattleAdapter
                                          │
                                          ▼
                               ScenarioUnit.campaignProvenance
```

`CampaignRuntimeState.formations` and `formationOrder` own formation truth. `CampaignTileRuntime.formationIds` owns placement. `CampaignTileRuntime.forces` remains temporarily because shipped campaign rules and UI consume aggregate groups; runtime invariants require it to exactly match the active formation records placed on that tile.

No campaign service stores or mutates a live tactical `ScenarioUnit`. Tactical units are defensive battle representations created by the adapter.

## Record contract

Each `CampaignFormationRecord` stores:

- stable ID, faction, core/attached/auxiliary ownership, player-facing name, and legacy source provenance;
- campaign unit type, tactical formation/allocation key, and equipment package key;
- current campaign location, lifecycle status, current order, creation time, and retirement time;
- detailed personnel and equipment status pools compatible with the tactical damage model;
- readiness, cohesion, fatigue, and campaign supply;
- base/earned experience and battle count;
- commander link, honors, and immutable history entries.

Fields needed by later mechanics are present now so save identity does not have to change when those mechanics arrive. C20-040 through C20-042 will own the rules that mutate replacement, refit, upgrade, commander, and honor state.

## Deterministic legacy conversion

For each tile in authored tile order, and each aggregate force group in authored group order:

1. materialize one formation per `count`;
2. derive its ID from campaign ID, faction, axial tile key, unit type, group index, and ordinal;
3. derive its tactical formation key through the existing campaign-to-allocation mapping;
4. seed personnel/equipment/status and supply from the authoritative tactical formation template when one exists;
5. create a formation history origin entry;
6. append the ID to the tile placement list.

The same campaign input always yields the same formation order, IDs, names, pools, and initial tactical representation. Types with no tactical analogue still become campaign records; their tactical adapter returns no combat unit rather than fabricating one.

## Compatibility reconciliation

Existing campaign code still performs some mutations against aggregate force counts. At each such certified boundary, the lifecycle service reconciles counts back into records using this order:

1. preserve records already matching faction, type, and destination;
2. move unmatched records of the same faction/type to remaining destinations in stable formation order;
3. create a new record only for a genuine aggregate increase;
4. retire unmatched records only for a genuine aggregate decrease;
5. rebuild tile placement IDs and aggregate force projections;
6. reject the transaction if identity, placement, pool, or projection invariants fail.

This ensures a redeployment changes location, not identity. The adapter is transitional: new campaign orders should name `formationIds` directly and will eventually remove the need to infer record changes from aggregate counts.

## Tactical provenance contract

`ScenarioUnit.campaignProvenance` contains:

- campaign ID and formation ID;
- engagement ID;
- source campaign revision and segment;
- campaign faction, ownership, player-facing formation name, and campaign unit type.

The tactical unit ID is deterministically derived from campaign ID, engagement ID, and formation ID. Campaign personnel/equipment pools, supply, and experience are copied defensively into the tactical unit. Tactical mutation therefore cannot alter campaign truth before a result package is validated and reconciled.

Friendly precombat allocations select eligible formation records in stable order for the requested allocation key. Generated enemy rosters use the same adapter when provenance is available. Legacy/non-campaign battles continue using ordinary deployment templates.

## Lifecycle boundaries

Implemented in C20-020:

- deterministic create/legacy seed;
- placement and aggregate projection;
- relocate while preserving identity;
- lifecycle status transition with terminal-state protection;
- retirement without record deletion;
- append-only formation history;
- campaign-to-tactical adaptation and tactical provenance extraction.

Integrated follow-on work:

- C20-021: authoritative engagement commitment/reservation and frozen battle packages;
- C20-022: complete tactical survivor/loss/resource delta extraction and destroyed-unit tombstones;
- C20-023: idempotent exact condition/lifecycle application, battle history, terminal retirement, and aggregate reprojection.

Deferred to later work:

- C20-024: legal retreat/return placement, isolation, occupation, control, and derived fronts;
- C20-040: replacement, rest, repair, reorganization, and refit queues;
- C20-041: equipment upgrade paths and conversion costs;
- C20-042: commander careers, traits, honor triggers, and awards;
- C20-043: first-class Forces workspace and formation-selection UX.

## Save and migration behavior

Campaign 2.0 is still an unreleased working tree in this delivery stream, so the current runtime schema version is extended before its first release. Legacy shipped localStorage save versions 1 and 2 already pass through `createCampaignRuntime()` and therefore receive deterministic formation records during migration. New named saves serialize the complete registry and tile placement lists inside the existing checksummed envelope.

A loaded runtime is rejected when:

- formation ordering and record keys differ;
- IDs, factions, types, names, source provenance, times, pools, supply, experience, honors, or history are malformed;
- a formation is placed on zero or multiple tiles inconsistently with `locationHexKey`;
- a retired/destroyed/captured formation remains placed;
- a tile references a missing or foreign formation;
- aggregate force counts differ from its formation placement.

## Acceptance criteria and proof

- [x] Every positive legacy force count creates exactly one stable formation per count.
- [x] Repeated creation from identical inputs produces identical records and order.
- [x] Moving an aggregate force preserves formation ID and history while changing placement.
- [x] Aggregate force totals and formation placements are conserved and invariant-checked.
- [x] Retired records remain addressable and are excluded from tile force projections.
- [x] Campaign saves round-trip formation identity and lifecycle data.
- [x] Friendly deployment and generated enemy rosters can carry deterministic tactical provenance.
- [x] Tactical adaptation is defensive and does not share mutable status pools with campaign truth.
- [x] Runtime validation rejects duplicate, missing, foreign, retired, and count-divergent placement.
- [x] Existing legacy campaign projections, typed orders, segment resolution, persistence, tactical saving, lint, typecheck, build, and full tests remain green.

## Follow-on readiness

C20-023 now consumes each retained provenance delta exactly once and mutates these records through the lifecycle service. C20-024 can finalize the operational placement of non-terminal survivors from the retained `heldAtSourcePendingControl` handoff.
