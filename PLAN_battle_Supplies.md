# Battle Sidebar Plan – Supplies Panel

<!-- STATUS: 📋 PLANNING - This file contains the design plan for implementing the Supplies panel in the battle screen sidebar. This is a planned feature that has not yet been implemented. It provides specifications for ammunition, fuel, medical supplies dashboard with consumption tracking and alerts. -->

## Purpose
- **Mission** Present commanders with a consumables dashboard covering ammunition, fuel, medical stock, and emergency reserves, highlighting burn rate and projected depletion turns.

## Current State
- **UI** No dedicated supplies popup; supply details appear only via general logistics placeholders and war room overlays.
- **Engine** `GameEngine.playerSupply` and `GameEngine.botSupply` track per-unit resources but lack aggregated summaries or trend analysis functions.
- **UX Gap** Commanders cannot assess resource sustainability without inspecting individual units.

## Target Experience
- **Primary Metrics**
  - Ammunition reserve (total, frontline vs. reserves).
  - Fuel stores & consumption rate.
  - Medical supplies and casualty support capacity.
- **Trend Visualization** Display burn rate spark lines or mini charts for last 3 turns.
- **Alerts** Automatic callouts for critical thresholds (e.g., <2 turns of ammo).
- **Controls** Tabs or toggles to switch between player, allied, and recon-estimated enemy supplies (if intel available).

## Data Requirements
- **Aggregation Function** Extend `GameEngine` with `getSupplySnapshot()` returning totals, per-category averages, consumption deltas, and estimated depletion turns.
- **Historical Buffer** Maintain rolling history (e.g., array of last N turns) to calculate trends—possibly stored in `battleState` or a new `SupplyHistoryStore`.
- **Intel Integration** Gate enemy estimates behind recon/intel quality; fallback to “unknown” messaging.

## UI Implementation Tasks
1. **Template Structure** Update `popupContentRegistry` with a specific supplies entry containing sections for ammo, fuel, med, and emergency reserve.
2. **Rendering Helper** Add `renderSuppliesPanel()` in `PopupManager` to map snapshot data into HTML tables/charts.
3. **Visual Components**
   - Gauge bars with color-coded thresholds.
   - Inline charts using `<canvas>` or simple SVG.
4. **Responsive Layout** `.supplies-panel` CSS to handle column vs. stacked layout.

## Logic & Wiring Tasks
- **Engine API** Implement `getSupplySnapshot()` returning structured data (totals, per-unit average, consumption rate, alerts array).
- **State Sync** After each `endTurn()` call, persist the snapshot to `battleState` and trigger any event bus notifications.
- **UI Refresh** When the popup opens or when supply change events fire, ensure `PopupManager` rerenders content.
- **Alert Hooks** Optionally tie into HUD to flash warnings outside popup when thresholds crossed.

## Testing Strategy
- **Unit Tests** Validate snapshot calculations (burn rate, depletion turn estimation) across different force compositions.
- **Integration Tests** Simulate supply consumption across multiple turns; ensure UI displays expected values.
- **Accessibility Review** Confirm ARIA labels for gauges/alerts.

## Documentation & Comments
- **In-code** Comment formulae for burn rates and depletion estimates inside new engine helpers.
- **Docs** Add section to `GameRulesArchitecture.md` describing supply dashboard metrics and assumptions.

## Open Questions
- **Production vs. Consumption** Should production events (e.g., captured depots) appear here or in logistics?
- **Allies** Do allied forces share player stockpile or maintain separate pools requiring multi-faction support?
- **Intel Accuracy** Decide whether enemy supply estimates degrade with poor recon.
