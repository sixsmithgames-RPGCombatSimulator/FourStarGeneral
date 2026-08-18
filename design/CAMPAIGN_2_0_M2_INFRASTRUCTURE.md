# Campaign 2.0 Milestone 2 — persistent infrastructure and reconstruction

**Work package:** C20-025  
**Status:** Implemented and certified  
**Depends on:** C20-004 atomic transactions, C20-012 typed orders, C20-013 segment resolution, C20-021 engagement ledger, C20-022 tactical result extraction, C20-023 consequence resolver, C20-024 control/front resolver  
**Next:** C20-026 objective/end-state evaluator

## Purpose

C20-025 makes strategic installations durable campaign objects instead of static map art. A fort, airbase, port, logistics hub, supply route, or intelligence node now has persistent structural integrity. Tactical damage lowers that integrity, capture disrupts the installation, reduced condition lowers its actual output, and reconstruction requires an explicit headquarters order, resources, local supervision, and campaign time.

This closes the tactical/campaign loop for infrastructure:

```text
campaign condition
  -> frozen engagement context
  -> tactical fortification condition and defender entrenchment
  -> terminal tactical structural facts
  -> campaign damage/capture audit
  -> reduced operational capacity
  -> typed reconstruction order
  -> segment-by-segment recovery
  -> later campaign and tactical decisions use the restored condition
```

## Player contract

To a player, the rule is:

- installations remember battle damage after the tactical map closes;
- current integrity directly determines current operational capacity;
- capturing an installation does not make it immediately fully useful;
- capture disruption caps its capacity at 50% for eight three-hour segments, or one campaign day;
- structural damage can reduce capacity below that cap;
- a friendly damaged installation can be reconstructed only while a ready formation is stationed on it;
- headquarters shows the entire cost, repair rate, and completion time before the order is committed;
- supply and personnel are charged once when the order is committed;
- reconstruction restores integrity each three-hour segment after frozen logistics for that segment has resolved;
- moving the supervising formation, losing control, or losing the installation interrupts the work;
- cancelling before work begins refunds the commitment; hostile interruption does not refund invested resources;
- the enemy's exact installation condition, repair order, and capacity remain hidden by campaign fog.

The mechanic is cross-layer, not campaign-view-only. Most command and repair decisions happen in the campaign interface, but existing condition shapes tactical battle generation and tactical damage returns to the same campaign record.

## Supported infrastructure

The persistent state is initialized for these campaign tile roles:

| Role | Default maximum integrity | Default repair per 3-hour segment | Current effects |
|---|---:|---:|---|
| Airbase | 120 | 6 | Air sortie capacity and derived air/intelligence contribution |
| Naval base | 140 | 5 | Derived naval/intelligence contribution; audited naval capacity |
| Logistics hub | 110 | 8 | Supply/production throughput and intelligence contribution |
| Supply route | 80 | 12 | Authored supply throughput |
| Intelligence node | 80 | 10 | Intelligence contribution |
| Heavy fortification | 160 | 5 | Tactical fortification/entrenchment strength and authored throughput |
| Light fortification | 100 | 8 | Tactical fortification/entrenchment strength and authored throughput |

Scenario authors can override `infrastructureMaxIntegrity` and `infrastructureRepairRate` on a palette definition. Roles without persistent infrastructure retain their prior behavior.

## Condition model

`CampaignInfrastructureState` is stored on the authoritative runtime tile and projected into friendly campaign views. It records:

- role, maximum integrity, and current integrity;
- named damage state;
- current effectiveness from 0 to 1;
- disabled state;
- last damage, repair, and capture segments;
- prior and current capturing factions;
- capture-disruption expiry;
- the active reconstruction order identity.

Damage-state thresholds are deterministic:

| Structural ratio | State |
|---:|---|
| 100% | Intact |
| 70–99% | Damaged |
| 40–69% | Breached |
| 1–39% | Severely damaged |
| 0% | Destroyed/disabled |

Ordinary effectiveness is `integrity / maximum integrity`. During capture disruption it is the lower of structural effectiveness and 50%. The expiry is normalized immediately after the campaign clock advances, before any subsystem builds a projected scenario.

## Tactical-to-campaign damage mapping

The tactical result extractor records every terminal fortification modification as an immutable `CampaignInfrastructureDamage` fact. It stores tactical coordinates, type, integrity before/after, tactical maximum integrity, and final damage state.

The infrastructure resolver runs after accounting and control resolution in the same public battle-result transaction:

1. validate the result, consequence, and control records and their integrity hashes;
2. locate the authoritative infrastructure on the resolved battle hex;
3. convert tactical remaining-integrity ratio to the campaign installation's maximum-integrity scale;
4. apply only additional loss—later or duplicate facts can never heal the installation;
5. timestamp real damage;
6. apply capture provenance and the eight-segment disruption window when control changed;
7. interrupt an active reconstruction order and release only reusable facility/engineer reservations;
8. recompute condition and capacity;
9. retain an immutable report beside result, consequence, and control facts in the terminal engagement ledger.

For example, a light fort at 100/100 that ends a tactical battle at 35/100 becomes 35/100 in the campaign. A 160-point heavy fort ending at the same tactical ratio becomes 56/160. If campaign integrity was already below the tactical equivalent, the battle fact records `noNewDamage`; it cannot restore points.

If a tactical result contains structural damage but the campaign tile has no supported infrastructure, the report records `noCampaignInfrastructure` rather than inventing a target or dropping the fact silently.

## Capture rules

C20-024 decides whether legal occupation changes control. C20-025 consumes that final result; it never independently awards a captured facility.

On legal control change:

- structural integrity is preserved after tactical damage;
- capture provenance and timestamp are stored;
- capacity is capped at 50% until segment `capture + 8`;
- any active reconstruction order becomes blocked;
- the supervising formation is released from that order;
- non-resource reservations become reusable;
- previously spent reconstruction supply/personnel remain consumed.

The post-battle infrastructure report binds `controllerBefore` and `controllerAfter` to the C20-024 control report. It is invalid if it claims capture without a real control change.

## Capacity consumers

All current consumers use the same effectiveness scalar:

| Consumer | Rule |
|---|---|
| Daily campaign production | Controlled palette `supplyValue × effectiveness`, frozen at the start of the segment |
| Campaign production report | Shows the same effective source value used by resolution |
| Air support | In-range authored sortie capacity is multiplied by airbase effectiveness and rounded down |
| Derived air power | Ten points per full-equivalent controlled airbase, plus aircraft |
| Derived naval power | Ten points per full-equivalent controlled naval base, plus ships |
| Intelligence coverage | Two points per full-equivalent supported base/node |
| Tactical fortifications | Authored fortification integrity and damage state start at the campaign effectiveness ratio |
| Tactical defender posture | Mission entrenchment is multiplied by battle-hex infrastructure effectiveness |
| Audit/AAR data | Supply, sortie, naval, intelligence, and fortification capacity before/after are retained in the report |

Daily production intentionally uses the frozen pre-segment condition. Reconstruction during that segment improves later production; it does not retroactively increase an already resolved delivery.

## Reconstruction order

`infrastructureRepair` is a first-class member of the typed campaign order union. Its persisted payload freezes:

- offset and axial target identity;
- installation role;
- supervising formation identity;
- source and target integrity;
- repair points and authored repair rate;
- start, duration, and completion segments;
- supply and personnel cost.

The deterministic cost is:

```text
supply cost    = missing integrity × 2
personnel cost = missing integrity × 4
duration       = ceiling(missing integrity / repair rate)
```

Draft creation does not spend resources. It creates holds against supply, personnel, the installation, and the supervising formation. Stable order-book arbitration prevents two drafts from claiming the same facility or engineer.

Commit is atomic. It revalidates control, condition, costs, resources, and supervision; subtracts resources once; links the facility and formation to the order; consumes reservations; and enters `committed` state. The first eligible segment changes the order to `executing` and restores up to the authored rate. Completion clears facility/formation links, leaves resource reservations consumed, and releases reusable reservations.

Before the first segment, the player can cancel and receive an exact refund. After execution begins, cancellation is unavailable. Loss of control, missing infrastructure, or loss of the ready on-site supervisor blocks the order and retains the progress already made.

## Campaign UI/UX

Selecting a friendly installation opens an installation-condition card in the context inspector. It shows:

- named condition and an accessible 0–100 effectiveness meter;
- current/maximum integrity;
- exact operational-capacity percentage;
- capture-disruption expiry when active;
- missing integrity and repair rate;
- exact supply/personnel cost;
- estimated completion time;
- assigned on-site formation when available;
- a clear blocking reason when reconstruction is unavailable;
- an explicit **Draft reconstruction** action.

Draft reconstruction does not auto-commit. It adds a visible card to the persistent order tray with installation, integrity change, cost, ETA, validation conflicts, Remove, and eligible Cancel behavior. Map clicks remain selection-only.

Enemy tiles do not project `infrastructure` into faction map views. Exact integrity cannot leak through rendered text, meters, disabled controls, order labels, frozen AI views, or accessibility attributes.

## Immutable infrastructure report

`CampaignBattleInfrastructureReport` retains:

- campaign/scenario/engagement/resolution identity;
- hashes binding the tactical result, C20-023 consequence, and C20-024 control reports;
- source/applied revision and segment;
- battle hex, role, and controller before/after;
- capture and blocked-repair facts;
- complete infrastructure before/after records;
- capacity before/after across current operational domains;
- exactly one assessment for every tactical infrastructure-damage fact;
- a report integrity hash.

The runtime validator rechecks the entire result → consequence → control → infrastructure chain during transactions and save hydration. At the terminal battle revision, the report's after-state must equal the authoritative tile record.

## Persistence, migration, rollback, and idempotency

- New runtimes initialize supported facilities deterministically from authored definitions and optional damage seeds.
- Pre-C20-025 development runtimes are reconciled on load: supported tiles gain normalized full-integrity state and unsupported tiles remain absent.
- Pre-C20-025 engagement ledgers receive `infrastructureReport: null`; old results are not replayed under new rules.
- The report is stored inside the checksummed campaign runtime and survives ordinary save/load.
- Duplicate tactical result delivery exits before a transaction and cannot apply damage twice.
- Resolver/service duplicate handling returns the existing validated report.
- Any exception or invariant failure rolls back result accounting, control, infrastructure, repair interruption, ledger changes, events, and revision together.

## Certification coverage

- [x] Supported authored roles initialize stable default integrity and repair rates.
- [x] Tactical structural ratio maps to campaign integrity without healing prior damage.
- [x] Capture preserves damage and applies an eight-segment, 50%-maximum disruption window.
- [x] Friendly projections expose condition while opposing projections remove exact infrastructure state.
- [x] Damaged logistics throughput changes frozen daily production.
- [x] Air sortie, derived power, tactical fortification, and entrenchment consumers use effectiveness.
- [x] Repair preview exposes exact rate, cost, engineer, and ETA.
- [x] Draft reservations do not spend and prevent facility/engineer conflicts.
- [x] Commit charges resources once and links facility/formation/order atomically.
- [x] Segment resolution progresses at the authored rate and restores capacity.
- [x] Completion releases reusable reservations while retaining consumed-resource history.
- [x] Capture interruption blocks repair without relabeling consumed resources as refunded.
- [x] Reports are identity-, revision-, hash-, and conservation-checked.
- [x] Runtime/save reconciliation accepts older development ledgers without replaying consequences.
- [x] Type checking and focused end-to-end mechanic tests pass.

## Deliberate handoffs

- **C20-026:** use committed control and infrastructure state for objective progress, phase changes, scoring, victory, and defeat.
- **C20-027:** present the infrastructure before/after audit, capacity loss, capture disruption, and required reconstruction in the full campaign AAR.
- **C20-032:** teach strategic AI to damage, defend, capture, bypass, and reconstruct infrastructure using projected knowledge and the same typed order.
- **C20-040:** expand local supervision into specialist engineering capacity and connect installation repair to the broader formation refit/replacement economy.
- **C20-050/C20-051:** apply weather and ground-condition modifiers after structural effectiveness, without replacing persistent damage.

## Follow-on readiness

C20-026 can now evaluate objectives against a map where territory and installations are both durable truth. C20-027 has immutable facts to explain not just who took a hex, but what was damaged, which capabilities were lost, when a captured facility becomes useful, and what reconstruction decision headquarters should make next.
