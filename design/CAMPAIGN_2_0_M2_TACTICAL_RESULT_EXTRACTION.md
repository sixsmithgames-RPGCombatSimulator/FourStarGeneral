# Campaign 2.0 M2 — Tactical Result Extraction

**Work item:** C20-022  
**Status:** Implemented  
**Depends on:** C20-015 tactical save completeness, C20-020 formation substrate, C20-021 engagement ledger  
**Unlocks:** C20-023 consequence resolver, C20-024 control/front resolution, C20-027 campaign AAR

## Outcome

A campaign battle now ends by producing one typed, deterministic, integrity-checked `CampaignBattleResultPackage`. The package contains exact tactical facts for every committed persistent formation, non-persistent support, consumed supplies, objectives, damaged battlefield works, and faction-private observed evidence.

The extractor is deliberately read-only. It does not decide retreat paths, capture territory, refund campaign resources, award honors, or mutate persistent formations. Those are C20-023 and later policy decisions. C20-022 supplies their complete authoritative input.

## Player contract

1. The formations shown as committed before battle are the formations reconciled afterward.
2. Surviving personnel, wounded personnel, disabled equipment, destroyed equipment, ammunition, fuel, fatigue, and earned experience come from tactical state—not an estimated casualty percentage.
3. A formation removed from the tactical map retains a final casualty tombstone, so headquarters does not lose its last status pools.
4. Undeployed reserves are reconciled explicitly and cannot be mistaken for destroyed units.
5. Tactical objectives and consumed resources are returned with the formation results.
6. Battlefield observations update only the observing faction's evidence. The player does not receive hidden enemy formation IDs through the result package.
7. Replaying the same terminal tactical state produces the same result and resolution IDs.
8. Missing, duplicated, foreign, or modified tactical identities block reconciliation instead of silently guessing.

## Authority boundary

```text
Frozen CampaignBattlePackage
            +
Complete SerializedBattleState
            +
Terminal mission objective state
            ↓
CampaignBattleResultExtractor (pure/read-only)
            ↓
CampaignBattleResultPackage + integrity hash
            ↓
CampaignState result receipt (accepted once)
            ↓
Terminal engagement ledger retains full result package
```

The extractor never reads current campaign formations. Its only pre-battle authority is the immutable baseline frozen into the engagement package. Its only post-battle authority is the complete serialized engine state. UI counters, roster panels, animations, notifications, and service-record summaries are not result inputs.

## Battle-package baseline upgrade

`CampaignBattlePackage` advances from version 1 to version 2 before Campaign 2.0's first release. Every `CampaignFormationCommitment` now freezes:

- personnel status pools;
- equipment status pools;
- readiness model and readiness;
- cohesion and fatigue;
- ammunition, fuel, rations, and parts;
- base/earned experience and prior battle count;
- the existing complete formation before-state hash.

This readable baseline is protected by the battle package integrity hash. It exists because a hash can prove identity but cannot reconstruct before/after values.

Development saves containing a C20-021 version-1 package are upgraded during engagement-ledger reconciliation. The formation is still campaign-locked at that point, so its non-lifecycle condition remains the safe baseline source. The original before-state hash remains unchanged.

## Tactical completeness gate

Extraction requires:

- `completeStateVersion === 1`;
- player, Bot, reserve, airborne-reserve, and casualty collections;
- Player and Bot supply-state ledgers;
- enemy-contact evidence;
- battlefield modification/damage state;
- a valid tactical turn;
- a valid version-2 frozen campaign package.

A committed tactical ID must appear exactly once across live placements, ground reserve, airborne reserve, or casualty tombstones. Appearance in multiple collections is rejected. Absence is rejected. A missing unit is never assumed destroyed.

## Destroyed-unit tombstones

The tactical engine now records the normalized final unit snapshot at the instant damage reduces readiness to zero. The tombstone includes stable unit/provenance identity, personnel and equipment status pools, experience, supply, and deterministic timestamp.

The casualty log is serialized as part of the complete tactical save, so save/reload immediately before mission end yields the same extraction result. Repeated destruction signals for the same stable unit ID are deduplicated.

This is materially different from counting units that disappeared from a placement map: a tactically defeated formation may still contain wounded personnel and recoverable disabled equipment. C20-023 can therefore distinguish shattered survivors from total destruction.

## Formation delta rules

One `CampaignFormationBattleDelta` is emitted for every frozen commitment, in commitment order.

Validation binds each delta to:

- campaign, engagement, package, and source revision;
- campaign formation ID;
- deterministic tactical unit ID;
- campaign faction and attacker/defender role;
- source campaign hex;
- original before-state hash.

The delta contains full before/after personnel and equipment pools plus player-readable totals. `personnelAfter` excludes killed personnel; `equipmentAfter` excludes destroyed equipment. Damaged and disabled equipment remains present for later recovery rules.

Readiness is recalculated from the final tactical pools. Tactical fatigue and earned experience are retained. Tactical combat does not yet maintain an independent cohesion pool, so extraction explicitly preserves the pre-battle cohesion value instead of inventing a change.

Current extracted statuses are:

- `survived`: the tactical element remains deployed or in reserve;
- `shattered`: the tactical element became a casualty but retains personnel or recoverable equipment;
- `destroyed`: the casualty has neither surviving personnel nor recoverable equipment.

The schema reserves `captured` and `withdrew`; C20-024 will produce those strategic dispositions from control, occupation, and retreat rules. C20-023 already knows how to persist either disposition when a later result source supplies it.

## Support and consumables

Every non-formation `CampaignSupportCommitment` emits one `CampaignSupportDelta`.

Tracking modes are explicit:

- `tacticalElements`: battle-owned units with the committed allocation key were found; surviving and lost elements are counted;
- `resourcePool`: the commitment contributed an ammunition/fuel/rations/parts depot payload;
- `reservationOnly`: the current tactical engine exposes no stable element or resource-pool identity for that support.

The extractor never attributes unrelated generic support charges to a campaign commitment. `chargesUsed` therefore remains zero until those tactical assets receive commitment IDs. This is safer than charging the player for similarly typed placeholder support assets.

## Resource consumption

Resource use is calculated from negative entries in each tactical faction's authoritative supply ledger. Production and deliveries do not hide expenditure by making an ending stockpile larger than its opening value.

The result includes:

- ammo, fuel, rations, and parts consumed by each campaign faction;
- Player battle requisition points spent;
- engagement RP and air-sortie reservations for later consume/refund policy.

The package reports facts only. C20-023 determines which campaign pools pay, what unused reserved stock is recoverable, and whether captured or abandoned supplies transfer ownership.

## Objectives and infrastructure

Mission objective IDs, labels, tiers, states, and details are copied from terminal mission-rule state.

Damaged tactical hex modifications are returned with tactical coordinate, modification type, remaining/max integrity, and damage state. C20-025 will map relevant entries to persistent campaign infrastructure IDs and apply capture/repair capacity rules.

## Faction-private evidence

`observedEvidenceByFaction` is not a truth dump.

Each faction receives:

- the common battle outcome;
- common objective results;
- complete condition evidence for its own committed formations;
- only its recorded enemy-contact observations.

Enemy-contact evidence can contain observed unit type, estimated strength, last-known tactical hex, source, and confidence. It cannot contain an opposing campaign formation ID. The integrity validator rejects cross-faction `ownFormationId` records.

The current engine persists Player enemy-contact state. Bot evidence therefore contains common facts and its own formation condition but no fabricated symmetric contact picture. Strategic AI observation expansion belongs with the strategic-intelligence/AI milestones.

## Integrity and idempotency

Result identity is stable over:

- frozen battle package ID;
- canonical complete tactical-state hash;
- result category;
- terminal tactical turn.

The result integrity hash covers every field except itself. Validation rejects:

- the wrong battle package or campaign revision;
- modified tactical facts;
- missing or duplicate formation deltas;
- tactical IDs or before-state hashes that differ from commitment;
- cross-faction evidence identity leaks;
- malformed terminal turn/state collections.

`CampaignState.applyCampaignBattleResult()` validates the result before opening the engagement transaction. The engagement ledger stores the full immutable result package and accepts its resolution ID once. An identical replay is a no-op and cannot create another campaign revision.

## Integrated consequence path

C20-023 now consumes this package in one atomic typed transaction:

- exact formation pools and lifecycle replace aggregate casualty estimates;
- both factions' tactical consumption enters the appropriate campaign stocks;
- personnel losses remain in formation pools and do not subtract manpower twice;
- support reservations receive deterministic consume/refund accounting;
- the legacy front polyline is not edited; C20-024 receives an explicit control handoff;
- the full result and consequence audit remain together in the terminal ledger.

The coarse compatibility bridge remains only for legacy battles that have no frozen typed package.

## Save and recovery behavior

- Destroyed-unit tombstones are in complete tactical saves.
- Version-2 commitment baselines are in campaign saves and tactical campaign bindings.
- Accepted result packages remain in terminal engagement-ledger records.
- Result integrity is revalidated by campaign runtime invariants and save hydration.
- Duplicate delivery after save/load remains a no-op because the resolution ID and full result are retained.
- A result with a valid checksum but the wrong engagement/package binding is rejected.

## Implemented scope

- version-2 readable formation commitment baselines;
- terminal tactical result type and integrity contract;
- exact persistent formation delta extraction;
- destroyed-unit final-state tombstones;
- reserve and airborne-reserve reconciliation;
- support tracking modes and committed depot payloads;
- ledger-based faction resource consumption;
- tactical objective and fortification-damage extraction;
- faction-private evidence projection;
- campaign receipt/storage integration;
- exact mission-end handoff from `BattleScreen`;
- development package migration and runtime invariant validation.

## Integrated follow-on

- C20-023 now applies exact formation condition/lifecycle, support consume/refund, both-faction campaign economy, history, and an immutable consequence audit in one replay-safe transaction; see `design/CAMPAIGN_2_0_M2_CONSEQUENCE_RESOLVER.md`.

## Deferred deliberately

- C20-024: territory occupation, retreat paths, isolation, and derived fronts;
- C20-025: persistent infrastructure mapping, capture, repair, and capacity effects;
- C20-027: complete player-facing campaign AAR;
- C20-042: honor recommendation and award rules;
- strategic AI/Bot contact-evidence parity;
- stable identity for generic off-map tactical support charges.

## Acceptance proof

- [x] Every committed persistent formation emits exactly one delta.
- [x] Deployed, reserve, airborne-reserve, and casualty sources are mutually exclusive.
- [x] Missing committed tactical identities reject extraction.
- [x] Provenance is campaign/package/revision/faction checked.
- [x] Before and after status pools, readiness, fatigue, experience, ammo, and fuel are retained.
- [x] Destroyed tactical elements retain final survivor and equipment pools.
- [x] Negative supply-ledger entries produce exact faction consumption despite production/delivery.
- [x] Objectives, support commitments, depot payloads, and tactical damage are included.
- [x] Enemy contact reports do not expose opposing campaign formation identity.
- [x] Identical tactical truth produces identical resolution and integrity IDs.
- [x] Modified result packages fail integrity validation.
- [x] The full result persists in the terminal engagement ledger.
- [x] Duplicate result handoff creates no second campaign revision or consequence.

## Follow-on readiness

C20-023 now retains an integrity-bound consequence audit beside this result package. C20-024 can determine legal retreat/return placement, isolation, occupation, tile control, and derived fronts without reconstructing formation or economy facts.
