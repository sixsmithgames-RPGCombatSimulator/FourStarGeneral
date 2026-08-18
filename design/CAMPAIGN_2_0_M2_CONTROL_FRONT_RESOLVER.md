# Campaign 2.0 Milestone 2 — operational control and front resolver

**Work package:** C20-024  
**Status:** Implemented and certified  
**Depends on:** C20-004 atomic transactions, C20-020 formation substrate, C20-021 engagement ledger, C20-022 tactical result extraction, C20-023 consequence resolver  
**Next:** C20-025 infrastructure integrity/capture/repair (implemented); C20-026 objective/end-state evaluator

## Purpose

C20-024 makes a tactical result change the operational map. It decides whether the winning side can physically occupy the battle hex, where displaced survivors retreat, what happens when no route remains, which formations become isolated from supply, and where the front actually lies after control changes.

The resolver is deliberately separate from C20-023 accounting. The tactical result records battle facts; C20-023 applies formation condition and economic cost; C20-024 applies geography. All three records remain separately integrity-bound in the same terminal engagement ledger.

## Player contract

After a typed campaign battle result is accepted:

- winning is not enough to capture territory: a surviving, ready participant must be able to occupy the battle hex;
- an uncommitted enemy formation still on the battle hex blocks occupation;
- a displaced formation retreats only through an adjacent friendly-controlled, stack-legal tile;
- supplied, open fallback positions away from the battle are preferred deterministically;
- retreat costs readiness, cohesion, fatigue, fuel, rations, and recovery of disabled equipment;
- a formation with no legal route is captured and removed from the map, while its persistent record and history remain;
- the complete friendly-control graph determines whether ready formations are supplied or isolated;
- fronts are exact shared borders between opposing controlled tiles, not authored lines that move cosmetically;
- the campaign map redraws those exact borders and the event timeline explains occupation, retreat, capture, and isolation;
- replaying the same result cannot move a formation, change control, or apply retreat wear twice.

The immutable control report is available to the campaign AAR increment so its later presentation can show the battle result, operational consequence, rejected retreat options, abandoned equipment, and before/after border in one review.

## Atomic authority flow

```text
frozen CampaignBattlePackage
            +
verified CampaignBattleResultPackage
            │
            ▼
CampaignBattleConsequenceResolver (C20-023)
  exact formation/economy/support state
            │
            ▼
CampaignBattleControlResolver (C20-024)
  1. verify package/result/consequence binding
  2. determine desired controller
  3. select and validate an occupier
  4. resolve displaced formation retreat/capture
  5. transfer control and move occupier
  6. recompute supply isolation
  7. derive fronts from control adjacency
  8. store integrity-bound control audit
  9. emit control/movement/logistics events
            │
            ▼
runCampaignRuntimeTransaction
  validate complete candidate → commit one revision
  any failure → retain exact source runtime
```

`CampaignState.applyCampaignBattleResult()` runs C20-023 and C20-024 inside one transaction callback. There is no persisted state in which the result has charged losses but territorial placement is only partly resolved. The result package, consequence report, control report, engagement receipt, events, and revision commit together.

## Outcome and control policy

The battle result first identifies the controller that would normally hold the battle hex:

| Result | Desired controller | Control behavior |
|---|---|---|
| `attackerVictory` | Frozen package attacker | Transfer only after valid occupation |
| `defenderVictory` | Frozen package defender | Defender holds; occupation is needed only if the tile was not already defender-controlled |
| `withdrawal` | Frozen package defender | Defender holds under the same physical-occupation rule |
| `stalemate` | Current controller | Preserve control |

If the desired controller already owns the tile, occupation is `notRequired`. Otherwise the resolver requires an eligible occupier and no uncommitted enemy presence. Failure preserves the prior controller rather than granting a cosmetic victory flag.

### Eligible occupier

An occupying formation must:

- be a non-terminal C20-023 participant for the desired faction;
- have the correct attacker/defender role for the result;
- be in persistent `ready` status with surviving personnel;
- not have ended in the tactical casualty list;
- still have a legal campaign placement within one hex of the battle;
- for amphibious battles, have ended tactically deployed rather than still in reserve.

Candidates are ranked by already being on the battle hex, deployed tactical disposition, higher readiness, and stable formation ID. The selected formation moves into the battle hex. A move from an adjacent source adds five fatigue and consumes one fuel and one ration; no extra cost is charged when it already occupies the hex.

### Enemy-presence gate

Committed enemy participants can be displaced by the result and therefore do not automatically block the transfer. Any other live enemy formation still present on the battle tile does block it. The audit distinguishes:

- `satisfied`;
- `failedNoEligibleOccupier`;
- `failedEnemyPresence`;
- `notRequired`.

On a satisfied transfer, the tile controller changes and `controlSinceSegment` becomes the current segment. On failure or no required transfer, both remain unchanged.

## Retreat policy

Only a surviving participant physically placed on a tile that will be enemy-controlled is displaced. Adjacent attackers and defenders do not teleport merely because they participated; they return to or hold their frozen campaign source unless chosen to occupy.

### Legal candidate gate

The resolver assesses all six adjacent axial neighbors. A destination is legal only when it:

- exists in the authored campaign runtime;
- is controlled by the retreating formation's faction;
- is not the battle hex;
- contains fewer than six placed formations, the current operational stack limit.

Every candidate remains in the report with its occupied count, distance from battle, supply status, legal flag, and rejection reason (`missingTile`, `enemyControl`, or `stackLimit`). That makes the decision explainable rather than storing only the winning destination.

### Deterministic ranking

Legal candidates are ordered by:

1. connection through friendly-controlled tiles to a friendly supply source;
2. empty tile before occupied tile;
3. greater distance from the battle;
4. lower current formation count;
5. authored tile order as the stable tie-break.

A supply source is a friendly-controlled tile with positive `supplyValue` or the `logisticsHub`, `airbase`, or `navalBase` role. Connectivity uses the same six-neighbor friendly-control graph later used by isolation.

### Retreat wear and abandonment

A legal retreat moves the same formation identity and applies:

| Effect | Rule |
|---|---|
| Readiness | −10, floor 0 |
| Cohesion | −10, floor 0 |
| Fatigue | +10, cap 100 |
| Fuel | −1, floor 0 |
| Rations | −1, floor 0 |
| Disabled equipment | Half of each disabled pool, rounded up, becomes destroyed |

The formation retains the tactical personnel/equipment facts applied by C20-023 except for the explicitly audited disabled-equipment abandonment. A shattered formation can retreat and remains shattered; retreat does not pretend it has reorganized.

### No-route result

If no legal neighbor remains, the displaced formation becomes `captured`, loses its map placement, and receives a permanent retirement history entry. Its status pools, origin, commander link, honors, battle history, and stable identity remain available for the AAR and service record. This deterministic initial rule avoids illegal mixed-faction placement and silent destruction. Later scenario policy may add severity-based surrender/destruction variants without changing the placement gate.

## Supply isolation

After all movement and control changes, each non-neutral faction builds a supply network from its controlled supply-source tiles through adjacent tiles it controls. Every placed `ready` or `isolated` formation is then reconciled:

- outside the reachable graph → `isolated`;
- back inside the reachable graph → `ready`.

Shattered, committed, in-transit, destroyed, and captured formations are not silently reorganized by this pass. A faction with no authored supply source is skipped for compatibility with legacy/scenario fixtures; C20-025 and logistics content validation can make missing sources an explicit scenario defect rather than isolating an entire old map unexpectedly.

Each transition is retained in `isolationChanges`, formation history, and a logistics event. Isolation currently establishes lifecycle truth and the first-class UI warning surface. Its ongoing attrition, surrender pressure, and recovery action costs belong to the logistics/formation lifecycle increments.

## Derived-front geometry

### Source of truth

The resolver enumerates every shared edge between adjacent, non-neutral tiles with different controllers. It groups edges by opposing faction pair and connected component. Each component becomes one `CampaignFrontLine`.

`CampaignFrontLine.edges` is the authoritative derived geometry:

```ts
{
  friendlyHexKey: string; // odd-q offset key on the initiative side
  opposingHexKey: string; // adjacent odd-q offset key on the other side
}
```

`hexKeys` remains as a compatibility list of initiative-side tiles for existing selectors and intelligence distance calculations. It is no longer interpreted as territorial truth.

### Stable identity and initiative

- A prior front with overlapping tiles and a compatible initiative preserves its key, label, and modifiers.
- A new component receives a content-stable ID derived from campaign identity, faction pair, and sorted boundary edges.
- A just-resolved attacker/defender victory prefers the victorious faction as initiative when it belongs to the component.
- Ordinary segment recomputation preserves compatible prior initiative; otherwise Player is preferred when present, then stable faction ordering.

### Rendering

`CampaignMapRenderer` draws one short line directly across each shared border, perpendicular to the line between the two adjacent hex centers. The segments are non-interactive and carry `data-front-edge` identity for diagnostics. Legacy authored fronts without `edges` continue to render as center-to-center polylines during content migration.

The segment control phase also rebuilds all fronts from live tile ownership. It no longer extends a front after an arbitrary number of segments of sustained control. Territory controls the front immediately and deterministically.

## Immutable control audit

`CampaignBattleControlReport` contains:

- campaign/scenario/engagement/resolution identity;
- hashes binding the tactical result and C20-023 consequence report;
- source/applied revisions and segment;
- battle hex and result;
- controller and control timestamp before/after;
- complete control-state hashes before/after;
- occupation requirement, outcome, and selected formation;
- one final operational disposition for every non-terminal C20-023 participant;
- every assessed retreat option and abandoned-equipment count;
- isolation transitions;
- complete fronts before/after;
- its own integrity hash.

The validator rejects identity mismatch, revision mismatch, modified integrity, missing/duplicate participant dispositions, malformed supply/condition values, inconsistent occupation accounting, malformed retreat legality, duplicate border edges, non-adjacent edge endpoints, or front edges not represented by the initiative-side compatibility keys.

The ledger now retains three independent immutable facts:

1. tactical result — what happened in battle;
2. consequence report — what condition/resources/accounting changed;
3. control report — where survivors went and how the operational map changed.

Development saves created before C20-024 receive `controlReport: null` during ledger reconciliation. Old accepted receipts are not replayed because doing so could create a second territorial result under newer rules.

## Events and current UX

The transaction emits deterministic scalar events for:

- battle-hex control held or changed;
- each occupation, retreat, or no-route capture;
- each isolation/restored-supply transition;
- derived-front rebuild count;
- the ordinary transaction commit.

After commit, `CampaignState` rebuilds its compatibility projection and notifies `engagementLedgerUpdated` and `scenarioLoaded`. Current campaign consumers therefore receive the new control, formation placement/status, exact border geometry, and timeline facts together. `getCampaignBattleControlReport()` supplies a defensive copy for the planned C20-027 first-class campaign AAR; that UI is a deliberate presentation increment, not hidden logic still missing from C20-024.

## Idempotency, saves, and rollback

- The tactical `resolutionId` remains the single idempotency key.
- Duplicate delivery exits before opening a transaction.
- C20-024 also returns its stored report as a duplicate if called again inside service-level recovery logic.
- The report `appliedRevision`, consequence `appliedRevision`, engagement `terminalRevision`, and committed runtime revision must agree.
- Runtime validation rechecks result → consequence → control binding during every transaction commit and save hydration.
- Any resolver exception or invariant issue discards occupation, retreat wear, control, isolation, front, ledger, and event changes together.

## Certification coverage

- [x] Attacker victory requires a ready surviving participant to occupy.
- [x] An uncommitted enemy formation blocks control transfer.
- [x] Successful occupation moves the formation, charges movement wear, and timestamps control.
- [x] A legal supplied retreat is selected deterministically.
- [x] Retreat applies readiness/cohesion/fatigue/supply wear and disabled-equipment abandonment.
- [x] A no-route displaced formation becomes captured without losing persistent identity.
- [x] Disconnected ready formations become isolated from the actual friendly-control supply graph.
- [x] Exact opposing-control edges create derived front components.
- [x] Removing the last opposing edge removes the obsolete front.
- [x] Renderer draws derived front edges on the shared border and retains legacy fallback.
- [x] Result, consequence, and control reports remain integrity-bound in the terminal ledger.
- [x] Duplicate result delivery changes no campaign truth or revision.
- [x] Existing C20-023 economy/support conservation remains exact after operational resolution.
- [x] Type checking, focused resolver tests, renderer tests, save validation, and production build pass.

## Deliberate handoffs

- **C20-025:** implemented tactical infrastructure damage mapping, captured-facility disruption, typed reconstruction, and shared capacity effects; see [`CAMPAIGN_2_0_M2_INFRASTRUCTURE.md`](./CAMPAIGN_2_0_M2_INFRASTRUCTURE.md).
- **C20-026:** evaluate objectives, phases, score, victory, and defeat after the new control graph is committed.
- **C20-027:** present the retained result/consequence/control facts as a first-class post-battle AAR and decision transition.
- **C20-040:** apply time-based reorganization, replacement, repair, and refit actions to shattered/isolated survivors.
- **C20-032/C20-033:** let the strategic opponent anticipate retreat routes, defend supply corridors, exploit isolation, and launch counterattacks under projected knowledge.

## Follow-on readiness

C20-025 now maps infrastructure damage against the final controller and legal occupying formation. C20-026 can evaluate objectives against real post-battle territory and persistent installation condition. C20-027 can explain not only casualties and cost, but also who occupied, who escaped, who was trapped, who became isolated, why the front moved, and what capacity/reconstruction consequences followed.
