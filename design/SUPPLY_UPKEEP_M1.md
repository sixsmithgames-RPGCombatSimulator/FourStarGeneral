# SUPPLY_UPKEEP_M1 — Supply Upkeep Implementation Design Note

## Context
- Supply snapshots currently mirror only unit-held ammo/fuel and rely on per-turn deltas, so the Supplies panel lacks true stockpile data.
- `applySupplyTick` only checks for cutoff attrition via `supplyTick`; there is no upkeep draw when units are connected to supply.
- No faction-level supply state exists to track production, shipments, or ledger entries for UI reporting.

## Plan
- Extend `core/balance.ts` with upkeep rates per unit class, baseline production values, stockpile seeding multipliers, and a ledger cap.
- Enhance `core/Supply.ts` with helpers to compute upkeep draws and expose a targeted `applyInSupplyUpkeep` routine while keeping attrition in place for cut-off units.
- Introduce richer structures in `core/SupplyState.ts` to own stockpile inventory, production scheduling, ledger entries, and shipment queues; include helper functions (`createSupplyState`, `accumulateProduction`, `applyShipment`, `recordConsumption`, `enforceLedgerLimit`).
- Update `GameEngine` turn flow: initialize supply states from current unit totals, run `advanceFactionSupplyState`, apply upkeep or attrition per unit, mirror results into placements/reserves, and store extended `SupplySnapshot` details (including stockpile totals and ledger history). Ensure resets/invalidation keep mirrors consistent.
- Feed refreshed supply snapshots to `BattleState` so UI bridges pick up true inflow/outflow without recomputation.

## Alternatives Considered
- **Option A: Recompute stockpile math inside UI layer** — rejected because duplicating logistics math outside the engine risks drift and violates single source of truth.
- **Option B: Treat upkeep as attrition-only (reduce unit ammo/fuel directly)** — rejected since it hides depot consumption, preventing planners from seeing burn versus production in the ledger.
- **Option C: Batch changes into a single mega-structure update** — rejected to maintain incremental, reviewable diffs per guardrails.

## Test Plan
- Add unit tests around new `SupplyState` helpers ensuring production accumulation, consumption recording, and ledger trimming behave deterministically.
- Extend engine regression tests to cover upkeep application when in supply, attrition fallback when stockpiles empty, and supply history snapshots reflecting stockpile deltas.
- Manual verification: run a short battle scenario, end turns to observe Supplies panel burn/production values and confirm no runtime errors.

## Impact
- **Performance:** Minor per-turn bookkeeping for upkeep; negligible impact within turn budget.
- **Accessibility:** None (no UI surface changes beyond data accuracy).
- **Docs:** Update CHANGELOG with supply upkeep milestone summary after implementation; this note documents design context.
