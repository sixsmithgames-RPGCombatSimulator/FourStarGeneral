# TODO: Recon & Intel Live Integration

<!-- STATUS: 🔲 PLANNING - Tracks work required to replace placeholder recon/intel data with live battlefield feeds and complete UI wiring. -->

## Subsystems & Owners
- **Engine Recon Pipeline (Game Systems)**
- **Event Dispatch & State Bridge (Frontend Platform)**
- **UI Rendering & Lifecycle (Battle UI Team)**
- **Styling & Design System (UI Platform)**
- **Localization & Content (Localization Team)**
- **QA & Telemetry (Quality Engineering)**

## Actionable Tasks

1. **Engine Recon Pipeline**
   - **Document Sensors:** Inventory recon-capable units, LOS routines, and any asynchronous intel services currently available in `GameEngine` or adapters.
   - **Design Snapshot Builder:** Specify how raw recon events map into `ReconIntelSnapshot` sectors/briefs/alerts, including ID conventions and coordinate formats.
   - **Implement Aggregators:** Add engine-side services that collect turn-based recon events, merge them with intel analyst hooks, and output normalized snapshot objects.
   - **Schedule Generation:** Decide trigger strategy (end of turn, timed polling, or on-demand) and implement hooks that call `GameEngine.updateReconIntelSnapshot()` accordingly.
   - **Test Fixtures:** Create sample recon event streams for automated tests validating snapshot composition and edge cases (no data, conflicting reports).

2. **Event Dispatch & State Bridge**
   - **Define Event Contract:** Write TypeScript types for `battle:reconIntelUpdated` payloads and document when the event fires.
   - **Emit Events:** Update engine or state layer to dispatch `document.dispatchEvent(new CustomEvent("battle:reconIntelUpdated", { detail: snapshot }))` whenever snapshots refresh.
   - **BattleState Sync:** Ensure `BattleState` caches the latest snapshot and exposes change notifications for UI consumers (avoiding redundant DOM events when engine unavailable).
   - **Teardown Safety:** Plan for removing listeners when screens unmount or the app resets to prevent memory leaks.

3. **UI Rendering & Lifecycle**
   - **PopupManager Disposal:** Add `dispose()` removing the recon intel listener, and ensure `main.ts`/`BattleScreen` invoke it during teardown or screen switch.
   - **Live Refresh Flow:** Update `PopupManager.onReconIntelUpdate()` to handle partial payloads, optimistic updates, and maintain filter state between refreshes.
   - **Empty/Error States:** Define UI responses for “no recon data,” stale data warnings, and API failure fallbacks.
   - **Accessibility Review:** Confirm filter buttons, alert banners, and cross-link highlights meet ARIA/keyboard requirements.

4. **Styling & Design System**
   - **Create Stylesheet:** Move current inline `.recon-intel-*` rules into `src/ui/styles/reconIntel.css` (or equivalent module).
   - **Bundler Wiring:** Update Vite/entry imports so the stylesheet loads with the battle bundle.
   - **Design Audit:** Sync with design system to match typography, spacing, and color tokens; replace hardcoded colors with design variables.
   - **Responsive Behavior:** Verify tablet/mobile layouts and document breakpoints in the stylesheet comments.

5. **Localization & Content**
   - **Introduce Helper:** Implement a minimal `t(key: string, fallback: string)` utility and ensure it is tree-shake friendly.
   - **Create Resource File:** Add `src/i18n/en/reconIntel.json` (or similar) housing all static copy for the panel and snapshot builder.
   - **Refactor Strings:** Replace literals in `popupContentRegistry`, `PopupManager`, and new snapshot builders with localization calls.
   - **Content Guidelines:** Coordinate with narrative design on tone, severity labels, and action phrasing for alerts.

6. **QA & Telemetry**
   - **Unit Coverage:** Add automated tests validating filter logic, alert selection, and recon/intel cross-linking.
   - **Integration Scenarios:** Script end-to-end tests emitting synthetic recon updates to confirm UI refreshes without reloads.
   - **Telemetry Hooks:** Decide if recon panel interactions should emit analytics (e.g., filter toggles, alert acknowledgements) and instrument accordingly.
   - **Performance Budget:** Measure snapshot generation and DOM update cost; document thresholds and optimization strategies if exceeded.

## Dependencies
- Completion of `TODO_deployment_state_engine_bridge.md` to ensure engine↔UI mirroring works consistently.
- Availability of localization scaffolding shared across the app (`TODO_localization_framework.md` if created).
- Coordination with design system for shared CSS token usage.

## Definition of Done
- Live recon/intel snapshots populate the panel during battle with verified data sources.
- `battle:reconIntelUpdated` reliably refreshes the UI without memory leaks.
- Styles are served via shared CSS, passing responsive and accessibility audits.
- All recon/intel strings resolved through localization utility with fallback copy.
- Automated tests cover snapshot assembly, UI filters, and event handling.
