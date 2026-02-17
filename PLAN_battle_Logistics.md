# Battle Sidebar Plan – Logistics Panel

<!-- STATUS: 📋 PLANNING - This file contains the design plan for implementing the Logistics panel in the battle screen sidebar. This is a planned feature that has not yet been implemented. It provides specifications for supply throughput, depot capacity, convoy status, and logistics metrics dashboard. -->

## Purpose
- **Mission** Deliver a command-level dashboard summarizing theater logistics: convoy throughput, depot capacity, production queues, and bottlenecks impacting readiness.

## Current State
- **UI** `popupContentRegistry` registers a `logistics` entry with static copy but no dynamic rendering.
- **Engine** `GameEngine` tracks supply mirrors (`playerSupply`, `botSupply`) and executes attrition via `applySupplyTick()` but does not expose aggregate logistics metrics.
- **Auxiliary Data** No dedicated logistics module; placeholder functions live in `WarRoomOverlay.buildDetailBody()` when `dataKey === "logisticsSummary"`.

## Target Experience
- **Primary View** Split layout with supply throughput gauge, depot occupancy bars, and convoy status list.
- **Secondary Sections**
  - Delay tracker showing rail/road nodes at risk.
  - Maintenance backlog (unit repairs, refits, replacements).
  - Alerts panel for urgent logistics events (stockouts, sabotage).
- **Interactivity** Filters (frontline vs. reserve depots), time range toggles (current turn vs. rolling 3 turns).

## Data Requirements
- **Aggregation** Extend `GameEngine` with `getLogisticsSnapshot()` returning:
  - Network supply strength by source (base camp, HQ, depots).
  - Stockpile levels for ammo, fuel, spare parts.
  - Convoy incidents and ETA per route.
- **Historical Data** Persist recent supply ticks (perhaps via `battleState` or new `LogisticsTimelineStore`).
- **External Modules** Consider reusing `WarRoomOverlay` sample data structures (`LogisticsDigest`).

## UI Implementation Tasks
1. **Template** Update `popupContentRegistry` logistics body with semantic containers (`logistics-throughput`, `logistics-depots`).
2. **Rendering Function** Add `renderLogisticsPanel()` in `PopupManager` similar to `renderArmyRoster()` but reading the new snapshot.
3. **Charts** Use lightweight SVG/Canvas microcharts for throughput and stockpiles.
4. **Responsive Layout** Define CSS grid under `.logistics-panel` with mobile collapse behavior.

## Logic & Wiring Tasks
- **Snapshot Hook** Implement `GameEngine.getLogisticsSnapshot()` with derived metrics.
- **State Bridge** Store latest snapshot in `battleState` to avoid recalculating on every open.
- **Refresh Triggers**
  - After `endTurn()` supply tick completes.
  - When a convoy/resupply event occurs (future hooks).
- **PopupManager Integration** Register logistics renderer and call it from `openPopup("logistics")`.

## Testing Strategy
- **Unit Tests** Validate snapshot aggregation accuracy (e.g., depot totals, stockpile trends).
- **Integration Tests** Simulate supply tick and verify UI updates after `PopupManager.openPopup("logistics")`.
- **Visual Regression** Capture layout snapshots to guard against CSS regressions.

## Documentation & Comments
- **Code Comments** Document snapshot composition inside `GameEngine.getLogisticsSnapshot()` describing each metric’s source per user guidance.
- **Developer Docs** Add logistics data flow section to `DEVELOPER_2_GUIDE.md` or new `BattleUI_Logistics.md`.

## Open Questions
- **Data Source Ownership** Should convoy incidents live in engine or separate logistics service?
- **Fog of War** How much detail should be hidden when recon coverage is low?
- **AI Usage** Will the bot need similar logistics intel for fairness?
