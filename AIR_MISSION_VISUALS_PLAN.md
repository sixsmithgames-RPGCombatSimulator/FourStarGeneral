# Air Mission Visuals & UX Plan

## Goals

- Make air missions feel like a distinct "air phase" with clear, readable visuals.
- Support multiple concurrent missions (strike, escort, CAP) per turn.
- Show a mini "aerial ballet" for each mission:
  - Bomber ingress along a visible arc.
  - Escorts converging and engaging interceptors before they reach the bomber.
  - Interceptors attacking at one or more intercept points.
  - Bomber striking the target.
  - Bomber and escorts egressing along return arcs.
- Ensure the Air Support modal and activity log clearly show:
  - All scheduled missions for the current turn.
  - Status transitions (Queued → In Flight → Resolving → Completed).
  - High-level outcomes (success/partial/aborted, damage, target destroyed).

## Current Behavior (Summary)

### Engine

- Air missions are scheduled via `tryScheduleAirMission` and stored in `scheduledAirMissions`.
- `consumeAirMissionArrivals()` returns `AirMissionArrival[]` for missions that just entered the `inFlight` state this turn.
- `consumeAirEngagements()` returns `AirEngagementEvent[]` for air-to-air engagements triggered during mission resolution.
- `getAirMissionReports()` returns `AirMissionReportEntry[]` capturing mission outcomes and refit events.

### BattleScreen

- After `endPlayerTurn()` and before bot ground actions, `executeTurnAdvance` calls:
  - `triggerAirMissionArrivals(summary)`
    - `consumeAirMissionArrivals()` → `playAirMissionArrivals(arrivals)`
    - For each arrival: camera focuses target; a single straight-line `animateAircraftFlyover(origin → target)` plays.
  - `triggerAirEngagements(summary)`
    - `consumeAirEngagements()` → `playAirEngagements(events)`
    - For each engagement: camera focuses on engagement location; bomber, interceptors, escorts fly straight to that point concurrently; then `playDogfight`.

### UI

- Air Support modal uses `getScheduledAirMissions()` to render the mission list.
- Mission outcomes are available via `getAirMissionReports()`.
- `BattleScreen.syncAirMissionLogs()` pulls reports and publishes activity log entries, but depends on battle updates (`engineInitialized`, `missionUpdated`).

## Desired Behavior

### Per Mission Timeline

For each mission ID (strike / escort / airCover):

1. **Ingress**
   - Bomber departs origin hex along a curved arc toward either:
     - The first intercept location (if engagements exist), or
     - The target hex (if no engagements).
   - Escorts depart their respective origins along arcs that converge at the same intercept/target points.

2. **Interceptions** (0 or more)
   - For each `AirEngagementEvent` associated with the mission:
     - Camera focuses on `e.location`.
     - Bomber, escorts, and interceptors fly along arcs to the engagement location concurrently.
     - `playDogfight` runs at that location.
     - Surviving bomber/escorts proceed from this engagement location toward the next engagement or target.

3. **Strike** (for strike missions)
   - Camera focuses on `mission.targetHex`.
   - Bomber flies along an arc through the target hex.
   - Ground strike effect plays over the target.

4. **Egress / Return**
   - Bomber and escorts fly along arcs away from the target back toward their origin side (either exact origin or one hex beyond as an off-map exit).
   - Aircraft do not disappear at the target; they exit the scene clearly.

### Multiple Missions in One Turn

- When several missions are scheduled for the active faction:
  - The air phase plays **each mission timeline in sequence**:
    - Mission A: ingress → intercept(s) → strike → egress.
    - Mission B: ingress → intercept(s) → strike → egress.
  - Within a single mission, bomber, escorts, and interceptors are animated concurrently at each engagement/strike point to convey a coordinated package.

### UI Expectations

- **Air Support modal**:
  - Shows all missions scheduled this turn, including completed missions (for at least the current turn).
  - Each row shows: kind, unit type, origin hex, target hex or protected hex/unit, status, and once completed, a short outcome summary.
- **Action tracker / activity log**:
  - A clear log entry for each mission resolution, including:
    - Kind, target, and result (SUCCESS / PARTIAL / ABORTED).
    - Damage dealt and whether the defender was destroyed.
    - Optional metadata (interceptions, kills, bomber attrition).

## Implementation Plan

### 1. Engine & Data Flow

1. **Mission/engagement association**
   - If not already present, extend `AirEngagementEvent` to include `missionId` so the UI can group engagements per mission.

2. **Arrival semantics**
   - Ensure `consumeAirMissionArrivals()` produces one `AirMissionArrival` per mission when it enters `inFlight` status.
   - Add tests in `AirMissions.arrivals.test.ts` to assert that N scheduled strike missions → N arrivals.

3. **Mission report & update events**
   - On mission resolution, ensure:
     - An `AirMissionReportEntry` is recorded with `outcome` populated (result, details, damage, defenderDestroyed, etc.).
     - A battle update reason (e.g., `"missionUpdated"`) is emitted so `BattleScreen` can refresh the Air Support modal and sync logs.

4. **Completed mission visibility**
   - Keep completed missions in `scheduledAirMissions` until the end of the current turn with `status: "completed"`, **or**
   - Add a UI-friendly API (e.g., `getRecentAirMissionReports()`) that returns the last N mission reports for display in the modal.

### 2. BattleScreen Orchestration

1. **Unified air phase**
   - Replace separate calls to `triggerAirMissionArrivals` and `triggerAirEngagements` with a single `playAirPhase` step in `executeTurnAdvance`:
     - `const arrivals = consumeAirMissionArrivals();`
     - `const engagements = consumeAirEngagements();`
     - Group both by `missionId`.

2. **Mission timelines**
   - For each mission ID:
     - Build a `MissionTimeline` structure containing:
       - Mission kind, origin axial, target axial.
       - Ordered list of engagement events for that mission.
     - Call `await playSingleMissionTimeline(timeline);`.

3. **`playSingleMissionTimeline`**
   - Responsibilities:
     - Animate bomber + escorts ingress from origin to first engagement or target using curved paths.
     - For each engagement:
       - Focus camera on engagement location.
       - Animate bomber, escorts, and interceptors along arcs to that location concurrently.
       - Play dogfight effect.
     - Animate bomber from last engagement (or origin) to target along an arc; play strike effect.
     - Animate bomber and escorts along return arcs back toward origin/off-map.

4. **Camera sequencing**
   - Before each engagement: focus on engagement hex.
   - Before strike: focus on target hex.
   - Optionally insert short delays between major phases so the player can read the visuals.

5. **Log synchronization**
   - After `playAirPhase` completes:
     - Call `syncAirMissionLogs()` to push mission outcomes into the activity panel.
     - Ensure the battle update handler for `"missionUpdated"` also triggers Air Support modal refresh if open.

### 3. Renderer Enhancements

1. **Curved flight paths**
   - Add support for animating aircraft along an arc between two hexes:
     - Either via `animateAircraftArc(fromKey, toKey, scenarioType, options)` or by extending `animateAircraftFlyover` with a curve option.
     - Implement using a quadratic Bézier curve with a control point offset perpendicular to the straight line between start and end.

2. **Round-trip helper**
   - Provide a helper such as `animateRoundTrip(fromKey, toKey, scenarioType, options)`:
     - Ingress arc: `from → to`.
     - Optional short pause at `to`.
     - Egress arc: `to → from` (or to an off-map exit hex in the origin direction).

3. **Engagement visuals**
   - Update `playAirEngagements` to use arc-based animation for bomber, escorts, and interceptors converging on the engagement point, while preserving concurrent animation via `Promise.all`.

### 4. Air Support Modal & Activity Log

1. **Mission list**
   - Ensure `renderAirMissionList`:
     - Shows queued, in-flight, resolving, and completed missions for at least the current turn.
     - Includes outcome badges and short outcome text for completed missions.
     - Optionally falls back to `getAirMissionReports()` when missions are no longer present in `getScheduledAirMissions()`.

2. **Multiple flights visibility**
   - Verify that scheduling multiple missions results in multiple clearly distinct rows in the Missions list, each with its own status and outcome.

3. **Log entries**
   - Leverage enhanced `syncAirMissionLogs` so each resolved mission yields a concise, informative log entry:
     - `Air mission strike resolved — target 5,7 [SUCCESS] — 4 damage dealt, Target destroyed!`

## Milestones

1. **Milestone 1 – Data & Events**
   - Engine emits consistent arrivals, engagements (with mission IDs), and reports.
   - Completed missions are visible to UI for at least the current turn.

2. **Milestone 2 – Orchestrated Air Phase**
   - Unified `playAirPhase` with per-mission timelines.
   - Sequential mission playback with per-mission engagement/strike/egress.

3. **Milestone 3 – Curved & Round-Trip Animations**
   - Renderer supports curved paths and round trips.
   - Engagements and strikes use arcs instead of straight lines.

4. **Milestone 4 – UI Polish**
   - Air Support modal and activity log reliably show all missions and outcomes.
   - Verified by scheduling multiple mixed missions (strike + escort + CAP) in a test scenario.
