# Air Support System – Implementation Plan

## Scope Overview
- **Goal**: Replace tile-by-tile air movement with an off-map sortie system driven from a new "Air Support" panel.
- **Non-goals**: Do **not** modify ground-unit movement, naval logic, or existing deployment-state persistence unless specifically flagged below. Avoid altering `src/core/Combat.ts` tables beyond hooks explicitly mentioned.

---

## Game Engine (src/game/GameEngine.ts and collaborators)
1. **Introduce sortie scheduling API** — **Status: Complete**
   - Implemented in `GameEngine.scheduleAirMission` with supporting helpers in @src/game/GameEngine.ts.
   - Serialization/hydration updated to persist mission catalog without breaking existing save keys.

2. **Mission resolution routines** — **Status: Complete**
   - `resolveAirStrikeMission`, escort, and CAP handlers live in @src/game/GameEngine.ts with shared combat hooks.
   - Player and bot attacks now flow through the same interception-aware helpers, avoiding duplicated damage math.

3. **Interception hooks** — **Status: Complete**
   - CAP interceptions block bomber strikes for both factions; arrival queue integrated with turn start animations.
   - `AirEngagementEvent` emits multi-flight encounters (bomber + multiple interceptors + escorts) for synchronized animations.
   - Escorts absorb CAP damage before the bomber and spend ammo per engagement; per‑mission interception caps enforced.
   - Layered interceptions supported (multiple CAP flights with sequential escort responses).
   - Bot retaliation logic preserved; existing ground retaliation checks remain intact.

4. **Ammo/fuel/refit integration** — **Status: Complete**
   - Player and bot ammo gating unified; `spendAircraftAmmo` now decrements both factions and flags refit requirements post-sortie.
   - Scout roles remain ammo-less per `createInitialAircraftAmmo` guards.

5. **Mission persistence & summaries** — **Status: Complete**
   - Mission arrivals queued via `pendingAirMissionArrivals` and exposed through `consumeAirMissionArrivals`.
   - Sortie reports expanded via `recordAirMissionReport` with event tags (`resolved`, `refitStarted`, `refitCompleted`), escort engagement tallies, CAP interception count, and bomber attrition.
   - Refit timers persisted and decremented each turn; refit start/finish are logged.
   - HUD consumption supported by `getAirSupportSummary()` and existing `getAirMissionReports()` public APIs.

6. **Validation rules** — **Status: Complete**
   - `tryScheduleAirMission` returns structured error codes (e.g., `PHASE_INVALID`, `ROLE_NOT_ELIGIBLE`, `OUT_OF_RANGE`, `AIRBASE_CAPACITY_EXCEEDED`) with human‑readable reasons.
   - Guardrails for escorts: requires friendly target present and not already airborne; distance checks enforced.
   - Optional airbase capacity per hex enforced when provided by config.

## Data & Metadata (src/data)
7. **Augment unit definitions** — **Status: Complete**
   - `AirSupportProfile` populated for aircraft in `src/data/unitTypes.json` (roles, cruise speed, combat radius, refit turns).
   - No additional factory wiring required for current flows; localization remains optional.

8. **Mission templates** — **Status: Complete**
   - Externalized mission catalog in `src/data/airMissions.ts` and imported by the engine.
   - Templates include labels, descriptions, allowed roles, and duration; serialization references `kind` and uses data‑driven templates at runtime.

## UI / UX (src/ui)
9. **Air Support panel** — **Status: Complete**
   - Implemented: popup content, summary chips (Queued/In Flight/Resolving/Completed/Refit), mission list with cancel for queued, schedule-first form wired to `tryScheduleAirMission`, refresh control.
   - Engine hooks used: `listAirMissionTemplates()`, `getScheduledAirMissions()`, `getAirSupportSummary()`, `tryScheduleAirMission()`, `cancelQueuedAirMission()`.
   - Follow-up polish (non-blocking): roster view with status badges, tooltips, empty-state copy.

10. **Mission assignment flow** — **Status: Complete**
    - Scheduling UI now appears first in the Air Support panel and uses three dropdowns to streamline orders:
      - Mission dropdown (first step).
      - Squadron dropdown listing only player aircraft eligible for the selected mission (based on `AirSupportProfile.roles`).
      - Target dropdown:
        - Strike/Air Cover: enemy targets (based on current known enemy positions; future: refine by recon sectors regardless of confidence).
        - Escort: friendly bomber hex from scheduled Strike missions; Escort option disabled until a bomber strike is queued.
    - Manual coordinate inputs removed; orders are issued by selecting the three dropdowns.
    - Confirmation step summarizes refit impact using `getAircraftRefitTurns`.
    - Bad intel/vanished target handling: at resolution, if the target no longer exists the mission aborts and the sortie log records the failure reason (engine uses `AirMissionOutcome.result = "aborted"`).
    - Range preview overlay remains available for future enhancements; current scheduling flow does not require it.

11. **Status updates & HUD** — **Status: Complete**
    - `BattleScreen` consumes mission arrivals and plays aircraft flyovers; air-to-air engagements trigger synchronized bomber/interceptor flyovers plus dogfight effects.
    - Topbar Air HUD widget added (queued, in-flight, resolving, completed, refit) with quick-open to Air Support panel; updates on `engineInitialized`, `turnAdvanced`, and `missionUpdated`.
    - Combat log lines wired from `airMissionReports` into the activity feed; idempotent with a seen-id set.

12. **Animations/Overlays** — **Status: Complete**
    - Implemented: segmented multi-leg path helper `HexMapRenderer.animateAircraftPathByHex`, target marker overlay `playTargetMarker`, and map click broadcast `battle:hexClicked`.
    - Existing: arrivals flyovers and dogfight effects.
    - Remaining: optional silhouettes/fallback art polish (non-blocking).

## AI & Turn Flow
13. **AI mission scheduling** — **Status: Partially Complete**
   - Implemented: heuristic air ops adds escort pairing for queued bot strikes and strategic CAP over player-held objectives; falls back to local CAP.
   - Remaining: bomber selection aware of ammo/refit, layered CAP priorities by unit value, additional smoke tests.

14. **Turn resolution adjustments** — **Status: In Progress**
    - Mission stepping occurs during faction turns with arrival queueing; supply tick sequencing untouched so far.
    - Need final validation once AI scheduling and longer missions are introduced; add regression tests ensuring supply and reinforcement ticks remain ordered after mission resolution.

## Testing & Documentation
15. **Unit tests** — **Status: In Progress**
    - Added: arrivals queue test, CAP parity test, layered interceptions test, HUD summary + cancel test (`tests/AirSupport.summary.test.ts`).
    - Remaining: mission rearm timers decrement and complete; serialization round-trip with live missions (airMissions, airMissionRefits, airMissionReports); animation trigger snapshots; AI scheduling smoke.

16. **Developer docs** — **Status: Not Started**
    - Planned deliverables: Air Support section in `GameRulesArchitecture.md` (API surface, lifecycles), mission assignment workflow in `UNIT_DOCUMENTATION.MD`, and UI how-to for arrivals/engagement hooks.

---

## Working Notes (incremental analysis captured during implementation)
- Engine APIs are stable: `tryScheduleAirMission` returns structured codes; `getAirSupportSummary`, `getScheduledAirMissions`, `getAirMissionReports`, `consumeAirMissionArrivals`, `consumeAirEngagements` power UI.
- Refit lifecycle now logs start/complete; `airMissionRefitTimers` hydrate/serialize round trip added in engine.
- PopupManager: Air Support panel now prioritizes the scheduling form and uses dropdowns for mission/squadron/target selection. Escort is disabled until a bomber strike exists. Confirmation summarises refit impact. Cancel action wired for queued.
- Map picking: kept available for future workflows; not required in the new scheduling UX.
- Overlays: segmented path, target marker, and range preview (circular within radius) are available; overlay cleared on selection or cancel.
- AI: minimal CAP scheduling added; extend with escort logic for bot strikes in a follow-up iteration.
- Lints: addressed unused imports/types, const preferences, args naming; restored required LOS types; PopupManager axial key comparison fixed.

## Completion
- Schedule-first mission UI with three dropdowns implemented (Mission → Squadron → Target); Escort disabled until bomber scheduled.
- Panel, HUD, and logs confirmed working; confirmation dialog shows refit impact.
- AI heuristic air operations added (escort pairing + strategic CAP); further bomber selection logic to follow.
- Lints handled in GameEngine and UI touched by the new UX.

## Next Steps
- AI Heuristics: extend BotPlanner/engine to prefer CAP over high-value units, pair escorts with active bombers, and select bombers factoring ammo/refit timers.
- Lint cleanup: address unused imports/types and const preferences in GameEngine and UI modules introduced by the new UX.

17. **Safeguards** — **Status: On Track**
    - Ground combat tables and LOS routines untouched; deployment/reserve systems remain the source of squadron state.

---

## Implementation Order (Suggested)
1. Data model updates (unit metadata, mission templates).
2. Engine scheduling + resolution logic.
3. UI panel and mission assignment flow.
4. AI hooks and turn-flow integration.
5. Testing, documentation, and polish (overlays, logs).

Following this roadmap keeps the new Air Support system isolated, minimizes regressions, and documents exactly where changes occur.
