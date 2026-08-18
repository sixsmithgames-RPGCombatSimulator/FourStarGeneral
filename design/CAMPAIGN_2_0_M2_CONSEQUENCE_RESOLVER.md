# Campaign 2.0 Milestone 2 — battle consequence resolver

**Work package:** C20-023  
**Status:** Implemented and certified  
**Depends on:** C20-004 atomic transactions, C20-020 formation substrate, C20-021 engagement ledger, C20-022 tactical result extraction  
**Next:** C20-024 control/front resolver and C20-025 infrastructure (implemented); C20-026 objective/end-state evaluator

## Purpose

C20-023 turns a completed tactical battle into durable campaign truth. It is the boundary where casualties stop being a mission-end message and become the actual personnel, equipment, condition, supply, experience, support, and economy state used by the next campaign decision.

The resolver accepts only an integrity-checked `CampaignBattleResultPackage`. It never reads the live `GameEngine`, tactical screen, DOM, HQ copy, or mutable aggregate force counters. Every mutation occurs on the defensive draft owned by `runCampaignRuntimeTransaction()` and either commits as one revision or disappears completely.

## Player contract

After a campaign battle:

- every formation comes back with the personnel, equipment, readiness, fatigue, experience, ammunition, and fuel it actually had when the battle ended;
- a shattered formation remains in the order of battle but is visibly shattered;
- a destroyed or captured formation disappears from the map without disappearing from campaign history;
- tactical ammo, fuel, rations, parts, support use, air/naval losses, and recoverable support stock affect the appropriate campaign accounts;
- casualties do not also remove abstract manpower a second time;
- a support allocation that returned unused recoverable material refunds the unused share of its requisition reservation;
- insufficient stock never produces a negative resource or silently erases expenditure—the consequence audit records the amount charged and the emergency shortfall separately;
- reloading, resuming, or delivering the same battle result again cannot apply any consequence twice;
- territory and front movement are not faked by shortening a polyline. The next control resolver receives an explicit pending handoff.

The complete consequence audit is retained in the engagement ledger for the campaign AAR and save recovery. C20-027 will expose that audit as the first-class post-battle review screen.

## Authority flow

```text
frozen CampaignBattlePackage
            +
verified CampaignBattleResultPackage
            │
            ▼
CampaignBattleConsequenceResolver
  1. validate package/result/unused receipt
  2. recheck every live formation baseline
  3. apply exact formation condition
  4. resolve persistent lifecycle state
  5. reconcile support use and refunds
  6. reconcile both faction economies
  7. build integrity-bound consequence audit
  8. close engagement and record receipt
  9. emit formation/logistics events
            │
            ▼
runCampaignRuntimeTransaction
  validate complete candidate → commit one revision
  any failure → retain byte-identical source runtime
```

`CampaignState.applyCampaignBattleResult()` owns the public handoff. It validates the result, short-circuits an already-applied resolution without opening a transaction, runs the consequence resolver, hydrates the compatibility projection from the committed runtime, clears the active battle save, and notifies campaign consumers.

## Persistent formation reconciliation

### Frozen-baseline gate

Before a formation is changed, the resolver requires:

- a matching formation commitment and tactical delta;
- the formation still exists under the same faction;
- its lifecycle state is `committed`;
- its location still matches the frozen source hex;
- its personnel and equipment pools, readiness model, readiness, cohesion, fatigue, supply, and experience still match the readable pre-battle baseline;
- the delta's before-state pools and scalar values still match that baseline.

This catches a stale or cross-written campaign formation even when the result package itself has a valid checksum. A baseline mismatch throws inside the transaction draft, so no other formation, economy, ledger, or event change survives.

### Exact condition application

For each formation, the campaign receives the result's exact:

- personnel status pools;
- equipment status pools;
- readiness model and readiness;
- cohesion;
- fatigue;
- carried ammunition, fuel, rations, and parts;
- base/earned experience and battle count.

No aggregate casualty estimate is used. `personnelLost` and equipment losses are audit values derived from the result's before/after facts; the status pools remain authoritative.

### Lifecycle policy

| Tactical result status | Persistent status after C20-023 | Placement after C20-023 |
|---|---|---|
| `survived` | `ready` | Frozen source hex, pending C20-024 |
| `withdrew` | `ready` | Frozen source hex, pending C20-024 retreat placement |
| `shattered` | `shattered` | Frozen source hex, pending C20-024 control/isolation rules |
| `destroyed` | `destroyed` | Removed from tile and aggregate projection; record retained |
| `captured` | `captured` | Removed from tile and aggregate projection; record retained |

C20-023 does not guess a retreat route or transfer a battle hex. Non-terminal formations remain at their source as an explicit temporary operational state. The consequence report marks them `heldAtSourcePendingControl`; terminal formations are marked `terminallyRemoved`.

Every participant receives an engagement-bound `battle` history entry. Status transitions are also recorded. Destroyed and captured formations receive a terminal `retired` history entry while retaining their pools, honors, commander link, origin, battle record, and stable identity.

## Support reconciliation

Each result support line must match exactly one frozen commitment by allocation key, category, quantity, and reserved requisition points.

### Tracking policy

| Tracking mode | Consumption policy | Refund policy |
|---|---|---|
| `resourcePool` | Allocate authoritative tactical ammo/fuel/rations/parts consumption against the committed payload in stable package order | Refund the unused proportional RP share; consumed RP is rounded up |
| `tacticalElements` | The committed service/asset entered the battle | Full RP cost is consumed; surviving/lost element counts remain explicit |
| `reservationOnly` | Tactical identity is insufficient to prove unused capacity | Full RP cost is consumed; no speculative refund |

`chargesUsed / committedQuantity` can raise resource-pool utilization when a support action is tracked by charges rather than payload. A refund occurs only when result facts positively establish unused recoverable material.

The initial campaign conversion is one consumed support RP to one campaign `supplies` unit. This is a balance constant in policy, not a claim that an RP is a literal physical unit. Tactical ammo and fuel are charged to their own economy pools separately.

Tactical battle RP earned and spent during combat is retained in the audit but does not charge the campaign again. It was earned inside that battle rather than drawn from the pre-battle campaign reservation.

Reserved air sorties are reconciled as capacity: committed air support consumes the matching reserved sorties and any uncommitted remainder is released. Tracked lost air or naval support elements reduce `airPower` or `navalPower`; surviving capacity is not treated as a loss.

## Economy reconciliation

The resolver processes every engaged faction, not only the Player.

| Tactical/campaign fact | Campaign charge |
|---|---|
| Ammo ledger consumption | `economy.ammo` |
| Fuel ledger consumption | `economy.fuel` |
| Rations + parts consumption | `economy.supplies` |
| Consumed support RP | `economy.supplies` |
| Tracked lost air elements | `economy.airPower` |
| Tracked lost naval elements | `economy.navalPower` |
| Formation personnel casualties | Formation personnel pools only; no second manpower charge |

Each faction audit retains:

- complete before and after economy snapshots;
- tactical consumption;
- support RP reserved, consumed, and refunded;
- tactical-only RP spending;
- air sorties reserved, consumed, and released;
- requested campaign charge;
- amount actually charged;
- explicit shortfall.

When requested consumption exceeds stock, the authoritative battle is still accepted. The available stock is reduced to zero and the missing amount is retained as an emergency shortfall in the immutable report and logistics event. This avoids negative resources and avoids silently pretending the battle used less than tactical truth recorded. A later logistics/alert increment can turn that retained shortfall into ongoing operational penalties or mandatory decisions.

## Consequence audit

`CampaignBattleConsequenceReport` is versioned and integrity-bound. It contains:

- campaign, scenario, engagement, and resolution identity;
- tactical result integrity hash;
- source and applied campaign revisions;
- applied segment and battle result category;
- exact formation consequences;
- exact support consume/refund consequences;
- exact faction economy conservation accounts;
- explicit counts for rules handed to subsequent services;
- its own integrity hash.

The report validator checks identity, revision order, integrity, exact formation/support/faction coverage, result-to-report equality, lifecycle and placement policy, RP and sortie conservation, economy equations, and deferred handoff counts.

The terminal engagement ledger retains both:

1. the immutable tactical fact package; and
2. the immutable campaign consequence report.

This distinction matters. The result says what happened in battle. The consequence report says what campaign rules charged, refunded, changed, and deferred.

## Idempotency and atomicity

The tactical `resolutionId` remains the idempotency key.

- First delivery runs one campaign transaction and stores one receipt, one result package, and one consequence report.
- An identical later delivery returns `duplicate: true` without opening a transaction or incrementing the campaign revision.
- A different result after any accepted receipt is rejected.
- A result accepted by a pre-C20-023 development build without a consequence audit is never back-applied; doing so could duplicate its old coarse economy effects.
- Any exception or invariant failure returns the exact source runtime with no partial formation, economy, ledger, event, or RNG mutation.

The engagement's `terminalRevision`, consequence `appliedRevision`, committed runtime revision, and event revision must agree.

## Event and save behavior

The committed transaction emits:

- one engagement consequence summary;
- one formation condition/lifecycle fact per participant;
- one logistics reconciliation fact per engaged faction;
- an explicit shortfall value when applicable;
- the ordinary transaction-commit event.

All event details remain scalar and deterministic. The full high-cardinality accounting stays in the consequence report.

Campaign saves serialize the report inside the terminal engagement ledger. Runtime invariant validation rechecks both stored package checksums and the result/consequence binding during transaction commit and save hydration. Duplicate behavior therefore survives reload.

Development ledgers that predate the consequence field receive `consequenceReport: null` during ledger reconciliation. Existing C20-022-only receipts remain historical receipts and are not charged twice.

## Compatibility behavior

The old `applyBattleOutcome()` bridge remains only for legacy or unbound battles. A typed result passed to that API is immediately routed to `applyCampaignBattleResult()`.

Typed C20-023 results no longer:

- deduct Player manpower from a casualty estimate;
- charge Player supplies with an ammo estimate;
- ignore Bot losses and stock use;
- shorten or extend a compatibility front polyline;
- fuse intelligence by rereading unrestricted scenario truth.

The aggregate `tile.forces` arrays are refreshed only as projections of persistent formation placement. They are never consequence authority.

## Deliberate handoffs

C20-023 retains the full inputs for, but does not perform:

- **C20-024:** retreat routes, isolation, legal return placement, occupation, tile control, and fronts derived from control adjacency;
- **C20-025:** implemented tactical-to-campaign infrastructure mapping, integrity, capture disruption, typed repair, and capacity effects;
- **C20-026:** objective/phase/end-state evaluation and faction-private tactical evidence fusion;
- **C20-027:** the player-facing campaign after-action report and post-battle review transition;
- **C20-040:** replacement, recovery, rest, repair, and refit actions;
- **C20-042:** honor confirmation and commander effects.

The consequence audit makes each handoff explicit rather than losing facts or applying a placeholder.

## Certification coverage

- [x] Exact tactical pools replace persistent formation condition.
- [x] Every formation is reconciled exactly once against its frozen baseline.
- [x] Survived and shattered formations preserve identity and placement for C20-024.
- [x] Destroyed formations leave map projections while retaining full identity and history.
- [x] Formation casualties do not subtract abstract manpower again.
- [x] Both factions' ammo, fuel, rations/parts, and support costs reconcile.
- [x] Recoverable resource-pool support produces deterministic proportional refunds.
- [x] RP, material, and sortie accounting conserves reserved = consumed + released/refunded.
- [x] Insufficient stock produces zero-bounded resources plus an explicit shortfall.
- [x] Typed results do not mutate compatibility fronts.
- [x] Duplicate delivery changes no revision or campaign truth.
- [x] Stale formation baselines roll back the whole transaction.
- [x] Result and consequence packages survive checksummed campaign save validation.
- [x] Runtime invariants validate terminal result/consequence/revision binding.

## Follow-on readiness

C20-024 now consumes the terminal ledger's battle package, tactical result, and consequence audit in the same public campaign transaction. See [`CAMPAIGN_2_0_M2_CONTROL_FRONT_RESOLVER.md`](./CAMPAIGN_2_0_M2_CONTROL_FRONT_RESOLVER.md) for the implemented legal retreat/return placement, isolation, occupation, tile-control, and derived-front rules.
