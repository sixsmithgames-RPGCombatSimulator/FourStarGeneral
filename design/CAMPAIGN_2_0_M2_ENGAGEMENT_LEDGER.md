# Campaign 2.0 M2 — Engagement Ledger and Frozen Battle Package

**Work item:** C20-021  
**Status:** Implemented  
**Depends on:** C20-012 atomic runtime transactions, C20-015 complete tactical saves, C20-020 persistent formation substrate  
**Unlocks:** C20-022 tactical result extraction, C20-023 campaign consequence application, C20-033 strategic counterattacks, C20-053 tactical environment generation

## Outcome

An engagement is no longer just a mutable queue entry. It now has an append-only campaign ledger record. When the player confirms precombat, one validated runtime transaction freezes the exact battle package and commits the exact persistent formations that may appear tactically.

The boundary guarantees:

- precombat planning does not reserve or spend formations;
- commitment succeeds only against the campaign revision the player reviewed;
- attacker and defender formation identities are explicit;
- tactical generation cannot silently substitute a different defender roster after commitment;
- the same commitment request returns the original package without another campaign revision;
- a changed request cannot overwrite an existing package;
- tactical saves bind to the package ID and integrity hash;
- one result ID is accepted at most once;
- terminal ledger history survives removal of the live engagement from the map queue.

## Player contract

The player experience is deliberately simple:

1. Queueing an engagement opens a **planning package**. No formation is locked yet.
2. Precombat shows the forces available from the campaign, the intelligence assessment, and the discretionary support reserve.
3. The launch control reads **Commit Forces & Begin Battle**.
4. Pressing it validates that the campaign has not changed, locks the chosen formations, freezes support, and launches the tactical battle.
5. Returning from precombat before commitment clears the plan and returns to the campaign map.
6. Tactical saves remain attached to this exact committed package.
7. When combat ends, headquarters accepts one result receipt. Repeated delivery of the same receipt is a no-op; a conflicting second result is rejected.

The UI does not expose package hashes as gameplay. Those identities exist for integrity, diagnostics, saves, and recovery.

## Authority model

```text
CampaignRuntimeState
 ├─ engagements[id]                 live opportunity/planning wrapper
 ├─ engagementLedger[id]            append-only lifecycle authority
 │   ├─ status
 │   ├─ CampaignBattlePackage|null
 │   ├─ appliedResolutionIds[]
 │   └─ resolutionSummaryHash|null
 └─ formations[id]                  persistent force truth
      └─ status = committed while package is active

CampaignBattlePackage
 ├─ sourceRevision / committedRevision
 ├─ frozen engagement + context
 ├─ exact allocation lines
 ├─ exact attacker/defender formation commitments
 ├─ support/resource commitments
 ├─ idempotency key
 └─ integrity hash

Tactical battle/save
 ├─ stable tactical unit provenance
 ├─ commitmentPackageId
 └─ commitmentIntegrityHash
```

The live engagement may be removed after resolution. Its ledger row is retained. Tactical objects never own or mutate the ledger.

## Lifecycle

```text
opportunity → planned → committed → inBattle → resolved
     │           │          └──────────────→ abandoned
     └───────────┴─────────────────────────→ cancelled
```

This increment uses these states as follows:

- `opportunity`: engagement exists; no current precombat plan;
- `planned`: active precombat selection; no package and no formation lock;
- `committed`: supported by the schema for future asynchronous launch boundaries;
- `inBattle`: package exists and its formation commitments are locked;
- `resolved`: one result receipt was accepted and the live queue entry can be removed;
- `cancelled`: an uncommitted live opportunity was removed;
- `abandoned`: reserved for recovery of a committed tactical session that cannot safely resume.

Current precombat commits and launches in one user action, so the transaction moves from `planned` directly to `inBattle`.

## Planning boundary

`CampaignState.setActiveEngagementId(id)` now enters `planned`, not tactical combat. Campaign runtime remains in `planning` status. This distinction matters because:

- formation status remains unchanged;
- the player can return to the campaign map safely;
- a later campaign revision invalidates the reviewed plan;
- save and UI code can distinguish a selected opportunity from an actual tactical continuation.

Legacy v2 saves may contain an active engagement that predates frozen packages. Migration retains it as `legacyUnfrozen`. This is an explicit recovery state and never masquerades as a current first-class commitment.

## Commitment request

Precombat submits:

- engagement ID;
- expected campaign revision captured when precombat opened;
- normalized positive allocation lines;
- allocation category;
- unit RP cost.

The service sorts allocation lines by allocation key before hashing them. DOM order and object insertion order cannot change package identity.

## Validation and lock algorithm

The commitment transaction:

1. resolves the live engagement and its ledger row;
2. normalizes unique allocation lines;
3. hashes the frozen engagement context and normalized request;
4. returns the original package if that request was already committed;
5. rejects a different request when a package already exists;
6. verifies `expectedRevision === runtime.revision`;
7. verifies the engagement is the active precombat plan;
8. selects attacker formations in the provenance order frozen into `availableForces`;
9. verifies each selected campaign cap is backed by eligible persistent identities;
10. selects every mapped defender formation from the frozen enemy pool;
11. rejects unavailable, ordered, missing, duplicate, or foreign formations;
12. records a before-state hash and stable tactical unit ID for every formation;
13. separates non-formation allocations into support commitments;
14. bounds support RP and air-sortie reservations by campaign context;
15. creates the package ID, commitment idempotency key, and integrity hash;
16. changes every committed formation to `committed` and appends lifecycle history;
17. marks the engagement and ledger `inBattle`;
18. commits exactly one campaign revision.

Any failure discards the transaction and leaves the reviewed campaign state authoritative.

## Frozen package fields

### Identity

- package schema version;
- package ID;
- campaign ID and scenario key;
- engagement ID;
- source revision;
- committed revision;
- committed segment;
- commitment idempotency key;
- request hash;
- engagement-context hash;
- package integrity hash.

### Strategic snapshot

- complete pending engagement snapshot;
- complete structured engagement context;
- intelligence briefing already frozen inside that context;
- mission, contested hex, attacker, defender, front, and objective links.

### Force package

Each formation commitment records:

- formation ID;
- faction;
- attacker/defender role;
- tactical allocation key;
- source campaign hex;
- deterministic tactical unit ID;
- before-state hash.

The before-state hash covers the campaign formation immediately before its status becomes `committed`. C20-022 also freezes the readable condition baseline beside that hash so extraction can produce exact before/after deltas.

### Support and resources

The package freezes:

- every normalized allocation line;
- non-formation support/consumable quantities and RP;
- requisition-point reservation;
- air-sortie reservation.

This increment records those claims without applying final consumption or refunds. C20-023 owns consequence reconciliation.

## Integrity and idempotency

Package integrity is `fsg-battle-package-v2-` plus the canonical content hash of every package field except the stored integrity value. Validation recomputes it before tactical use or save hydration.

Commitment idempotency is request based:

- same engagement + same context + same normalized allocations → original package, no new revision;
- same engagement + different request → rejected;
- stale expected revision before first commitment → rejected.

Result receipt idempotency is resolution-ID based:

- first resolution ID → accepted and recorded;
- same resolution ID again → duplicate no-op;
- different resolution ID after one was accepted → rejected.

The C20-023 typed battle-end path now applies exact formation/support/economy consequences in the same authoritative transaction as the result receipt. The coarse Player-only economy/front bridge remains only for legacy battles that have no frozen typed package.

## Tactical generation

Before commitment, precombat may render an opportunity preview. Once a package exists:

- the campaign battle-generator cache key includes package integrity;
- the opportunity preview cache is cleared at launch;
- BattleScreen regenerates the scenario from the committed package;
- defender generation iterates exact defender commitments rather than aggregate group counts;
- persistent defender provenance uses the package source revision and segment;
- friendly deployment units are created only from exact attacker commitments.

This ensures the tactical order of battle matches the campaign lock.

## Tactical saves

`CampaignBattleSavePackage` now carries:

- `commitmentPackageId`;
- `commitmentIntegrityHash`;
- a campaign bridge containing the frozen `battlePackage`.

Hydration rejects:

- a missing frozen package;
- cross-campaign, cross-scenario, or cross-engagement packages;
- a package-ID mismatch;
- an integrity mismatch;
- a tactical continuation attached to a different current campaign commitment.

Legacy-unfrozen recovery remains explicitly tolerated so older active-engagement saves are not silently discarded.

## Runtime and save invariants

Runtime validation now rejects:

- ledger order/record divergence;
- invalid ledger identities or statuses;
- duplicate or empty result IDs;
- a live engagement whose lifecycle differs from its ledger;
- a terminal ledger without a terminal revision;
- a current committed/in-battle ledger without a package, except explicit legacy recovery;
- an invalid package revision or integrity hash;
- missing, foreign, relocated, or duplicate formation commitments;
- a committed formation not owned by exactly one active package;
- invalid resource reservations;
- active-engagement/runtime-status mismatch.

Campaign save structural validation requires both ledger collections before invoking runtime invariants.

## Recovery rules

- An uncommitted plan can be cleared safely and returns its engagement to `opportunity`.
- A current committed package cannot be cleared through the precombat back action.
- A legacy active engagement without a package is marked `legacyUnfrozen`.
- Terminal ledger records remain after live engagement removal.
- Duplicate result delivery never repeats effects.
- Conflicting result delivery fails loudly and retains the last safe state.

## Scope boundary

Implemented in C20-021:

- engagement ledger schema and runtime collections;
- planning versus in-battle lifecycle;
- atomic exact formation commitment;
- frozen package and integrity validation;
- support/resource reservation records;
- package-driven friendly and enemy tactical generation;
- package-bound tactical saves;
- result receipt idempotency;
- exact release, lifecycle transition, or terminal retirement of committed formations through C20-023;
- player-facing commitment copy and campaign-return behavior;
- legacy-unfrozen migration compatibility.

Integrated follow-on:

- C20-022 now extracts and retains authoritative personnel, equipment, supply, experience, objective, infrastructure, and faction-private observed-evidence deltas; see `design/CAMPAIGN_2_0_M2_TACTICAL_RESULT_EXTRACTION.md`.
- C20-023 now applies exact formation/support/economy consequences and retains an integrity-bound consequence audit beside the tactical result; see `design/CAMPAIGN_2_0_M2_CONSEQUENCE_RESOLVER.md`.

Deferred deliberately:

- C20-024 through C20-027: retreat/control/fronts, infrastructure, objectives/end states, campaign AAR, and post-battle autosave;
- C20-033: strategic AI-initiated packages and counterattacks;
- C20-043: full formation roster/detail screens;
- C20-053: weather/ground/support fields added to the frozen package and tactical rules.

## Acceptance proof

- [x] Planning does not mutate formation availability.
- [x] Commitment requires the revision shown during precombat.
- [x] Exact attacker and defender formation IDs are frozen.
- [x] Before-state hashes and tactical unit IDs are stable.
- [x] Missing or conflicting persistent identities reject the whole transaction.
- [x] Identical commitment replay is a no-op.
- [x] Changed recommitment is rejected.
- [x] Package integrity is recomputed at validation boundaries.
- [x] Tactical generation uses only committed defender identities.
- [x] Friendly deployment uses only committed attacker identities.
- [x] Tactical saves bind to package identity and integrity.
- [x] Ledger and package round-trip through campaign saves.
- [x] One resolution ID is accepted once; duplicate delivery is a no-op.
- [x] Typed results replace temporary locks with exact persistent formation lifecycle consequences.
- [x] Runtime validation detects orphaned, duplicated, foreign, or unowned commitments.
- [x] Existing migration, persistence, campaign, tactical, typecheck, lint, build, and browser flows remain certified.

## Follow-on readiness

The ledger now retains the frozen commitment, complete tactical result, and complete C20-023 consequence audit. C20-024 can resolve retreat, occupation, tile control, and fronts from those immutable records without touching tactical state.
