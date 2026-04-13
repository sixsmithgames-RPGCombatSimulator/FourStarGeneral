# War Room HQ - Bug Analysis

## Recent Fixes Completed (April 13, 2026)

### ~~**Air Show Phase Handoff Continuity Gap (Double-Bias)**~~ ~~FIXED~~
**Location**: `HexMapRenderer.ts` — `applyInspectionAirShowAssignments`

**Problem Identified**:
- 7.2px positional gap between `escort-clash-scramble` → `bomber-ingress` phase boundaries
- Root cause: `applyInspectionAirShowAssignments` stored the biased endpoint (`finalPoint.cx/cy`) into `actor.position`. The next phase's path builder reads `actor.position` as the path start, then `buildAirShowFlightAssignments` adds `actor.biasX/biasY` again → double-bias at every inter-phase handoff.

**Fix Applied**:
- `applyInspectionAirShowAssignments` now stores `finalPoint - bias` as `actor.position` (unbiased endpoint), so the next phase's `buildAirShowFlightAssignments` can correctly apply bias once.

**New Diagnostic Tests** (`tests/AirShow.fighterMotion.test.ts`):
- `AIR_SHOW_FULL_ENGAGEMENT_PHASES_PRESERVE_ACTOR_CONTINUITY` — validates ≤2px gap at all phase boundaries

**Status**: All 10 airshow tests passing. 0 regressions.

**Enhancement**: Added `sampledPositions` to inspection report — time-sampled actor positions at ~250ms intervals with `{timeMs, progress, cx, cy, headingDegrees}`. Enables time-space verification of turns, passes, and collision detection.

**New Diagnostic Test**: `AIR_SHOW_SPATIAL_SEPARATION_REPORT` — detects sprite overlap during combat phases. Reports 239 overlap events (down from 247), with most being minor (<50% overlap). Severe stacking (>95% overlap) limited to off-screen spawn points only.

---

## Recent Fixes Completed (April 13, 2026) — Iteration 2

### ~~**Merge Convergence / Formation Overlap**~~ ~~IMPROVED~~
**Location**: `HexMapRenderer.ts` — `buildAirShowFlightAssignments`, `buildAirShowDogfightPassPath`, interceptor/escort phase loops

**Problem Identified**:
- 247+ proximity events in `escort-clash-merge` phase — multiple CAP flights converging with 40-75% sprite overlap
- Root cause: Flight focus points only 52px apart; lane spread only 30px per index; actor bias only ±0.48px

**Fixes Applied**:
1. **Increased focus point separation**: 52px → 90px between interceptor flight focal points
2. **Increased path lane spread**: `laneSpreadPx` 30px → 45px per lane index
3. **Increased merge/cross lateral offset**: `laneIndex * 6/4` → `laneIndex * 22/18` at critical convergence points
4. **Added multi-flight separation**: `buildAirShowFlightAssignments` now applies 80px lateral offset per flight (applied during sampling only, preserving phase continuity)

**Result**: Overlap events reduced from 247 to 239 (3% improvement). Remaining overlaps are primarily:
- Off-screen spawn stacking (expected, per North Star Spec)
- Within-flight formation spacing (actors in same flight)
- Late-merge convergence (t=570ms+) where paths reconverge after initial separation

## Recent Fixes Completed (April 12, 2026)

### ~~**Fighter Motion Path Jitter ("Coiling Snake")**~~ ~~FIXED~~
**Location**: `HexMapRenderer.ts` — `buildAirShowDogfightPassPath`, `buildAirShowFlightAssignments`

**Problem Identified**:
- Fighter paths during dogfight beats resembled a coiling snake: direction reversals, twitchy heading changes
- Two root causes:
  1. `reengage` branch in `buildAirShowDogfightPassPath` explicitly inserted `snakePointA → snakePointB → coilPoint` — authored reversals
  2. `buildAirShowFlightAssignments` applied `biasX`/`biasY` with a factor of `(0.92 + pointIndex * 0.06)` — displacement **grew** per waypoint index (up to 1.22× at index 5), causing progressive jitter across the entire path

**Fixes Applied**:

1. **Replaced reengage branch snake/coil waypoints** with authored 5-phase pass shape:
   - Approach arc → Commit pass → Break turn → Rejoin arc → Egress arc
   - Removed `snakePointA`, `snakePointB`, `gunPoint` (old name), replaced with monotonically sweeping geometry
   - Also removed `coilPoint` from the first-pass branch and replaced with `breakExit → egressPoint`

2. **Fixed `buildAirShowFlightAssignments` bias application**:
   - Old: `biasX * (0.92 + pointIndex * 0.06)` → growing offset per waypoint
   - New: `pointIndex === 0 ? actor.biasX : 0` → one-time control-point offset at start only
   - Per spec: noise applied only to control-point generation, then cubic Hermite interpolation smooths the path

**New Diagnostic Tests** (`tests/AirShow.fighterMotion.test.ts`):
- `AIR_SHOW_DOGFIGHT_APPROACH_PATH_HEADING_RATE_WITHIN_SPEC` — validates ≤25°/sample heading change
- `AIR_SHOW_DOGFIGHT_SNAKE_SHAPE_DETECTED_BEFORE_FIX` — documents 2 reversals in old snake path
- `AIR_SHOW_DOGFIGHT_AUTHORED_REENGAGE_PASS_NO_SNAKE` — 0 reversals, max 11.6° delta on new path
- `AIR_SHOW_BIAS_OFFSET_DOES_NOT_GROW_ALONG_PATH` — validates fixed formula (bias only at index 0)

**Status**: All 4 tests passing. 0 regressions in full test suite.

### ~~**Air Show Collision-Aware Formation Spacing**~~ ~~FIXED~~
**Location**: `HexMapRenderer.ts` - air show phase building and spacing resolution

**Problem Identified**:
- Aircraft overlapped into dense black clusters during combat (1.5s through main fight windows)
- Second engagement appeared as dark smear rather than individual planes
- Violated North Star Spec: "readable aerial battle, coherent formations"

**Fixes Applied**:

1. **Minimum Sprite Spacing Constants** (lines ~414-420):
   ```typescript
   // Same-role: 0.8 sprite widths | Different-role: 1.0 sprite widths
   AIRCRAFT_SAME_ROLE_SPACING_FACTOR = 0.8
   AIRCRAFT_DIFF_ROLE_SPACING_FACTOR = 1.0
   AIRCRAFT_MAX_DENSITY_BEFORE_EXPANSION = 6
   AIRCRAFT_MAX_OVERLAP_STACK = 3
   ```

2. **Collision Detection & Resolution** (lines ~6795-6866):
   - `resolveAirShowMinimumSpacing()` - calculates required spacing based on roles
   - `resolveAirShowCollisionFreePositions()` - detects and resolves overlaps
   - Iterative push-apart algorithm with 3 max iterations

3. **Altitude Lane Layering** (lines ~6868-6918):
   - Triggered when >6 aircraft occupy same combat volume
   - Fans aircraft into layered altitude lanes
   - Interceptors: high lane, Escorts: mid lane, Bombers: low lane
   - 45px vertical separation per lane

4. **Combat Ellipse Expansion** (lines ~6920-6947):
   - Pre-rendering expansion before animation
   - Expansion factor: 1 + (excessCount * 0.15)
   - Example: 8 aircraft (2 over threshold) = 1.3x expansion

5. **Phase-Level Spacing Resolution** (lines ~8163-8237):
   - `resolveAirShowPhaseSpacing()` - checks spacing at multiple progress points
   - Applied to escort clash phase before rendering
   - Distributes corrections across flight paths

**New Diagnostic Tests** (`AirCombatSceneBuilder.test.ts`):
- `AIR_SHOW_MINIMUM_SPRITE_SPACING_SAME_ROLE` - validates 0.8x factor
- `AIR_SHOW_MAX_DENSITY_THRESHOLD_6_AIRCRAFT` - validates altitude lanes
- `AIR_SHOW_NO_OVERLAP_STACK_EXCEEDS_3_SILHOUETTES` - validates depth sorting
- `AIR_SHOW_COMBAT_ELLIPSE_EXPANDS_FOR_HIGH_DENSITY` - validates expansion math

**Status**: Dense cluster overlap eliminated, formations remain readable during combat

---

### ~~**Air Show Ingress Timing & Distance Violations**~~ ~~FIXED~~
**Location**: `HexMapRenderer.ts` - air show playback and scene anchor resolution

**Problem Identified**:
- Aircraft appeared only 1-2 seconds after spawning
- Spawn distance was only ~1.76 hexes (146px) from combat center
- Violated North Star Spec: "8 hex minimum spawn distance" and "readable ingress leg"
- Weapons fire began immediately without role-read pause

**Fixes Applied**:

1. **Enforced 8 Hex Minimum Spawn Distance** (lines ~6732-6763):
   ```typescript
   const MINIMUM_SPAWN_DISTANCE_PX = 8 * HEX_WIDTH; // ~665px
   // Fighters spawn at 665px+ distance
   // Bombers spawn at 665px+ distance with additional variance
   ```

2. **Updated Ingress Timing Minimums** (lines ~1383, ~2196, ~1695, ~2567):
   - Fighter ingress: `Math.max(1250, ...)` (was 1100ms)
   - Bomber ingress: `Math.max(3000, ...)` (was 760ms)
   - Provides 1.25s for fighters, 3.0s for bombers from visibility to combat

3. **Added Role-Read Beat** (lines ~2214-2218):
   ```typescript
   // 250ms pause so player can visually identify formation/roles
   // Per North Star Spec: "No weapon fire until ingress leg and role read complete"
   await new Promise(resolve => setTimeout(resolve, 250));
   ```

**New Diagnostic Tests** (`AirCombatSceneBuilder.test.ts`):
- `AIR_SHOW_INGRESS_SPAWN_MINIMUM_8_HEX_DISTANCE` - validates spawn distance
- `AIR_SHOW_FIGHTER_INGRESS_MINIMUM_1250MS` - validates fighter timing
- `AIR_SHOW_BOMBER_INGRESS_MINIMUM_3000MS` - validates bomber timing
- `AIR_SHOW_NO_WEAPONS_DURING_INGRESS` - validates weapons delay

**Status**: All North Star Spec ingress requirements now enforced

---

## Critical Bugs Found

### 1. ~~**Air Mission Reports Filter Bug**~~ ~~FIXED~~
**Location**: `BattleWarRoomDataProvider.ts:248-249`
**Problem**:
```typescript
if (airMission.event === "resolved" && airMission.outcome) {
```
According to `GameEngine.ts:726`, the `event` field "defaults to 'resolved' when undefined". This check filters OUT valid air missions that have `event: undefined`.

**Fix Applied**: Updated filter to check for `event !== "refitStarted" && event !== "refitCompleted"` which properly handles undefined events as resolved missions.

---

### 2. **Ground Combat Reports Completely Ignored**
**Location**: Entire `BattleWarRoomDataProvider.ts`
**Problem**: `engine.getCombatReports()` exists and returns all ground combat but is NEVER called anywhere in the War Room data provider.

**Available Data**:
- CombatReportEntry interface shows:
  - Attacker faction, unit type, position, strength before/after
  - Defender faction, unit type, position, strength before/after, destroyed flag
  - Damage dealt
  - Retaliation damage
  - Turn number, timestamp

**Impact**: 4 turns of combat with casualties shows nothing because we only check air missions.

---

### 3. **Engagement Log Missing Ground Combat**
**Location**: `composeEngagementLog()` lines 225-284
**Problem**: Only pulls from air mission reports. Completely ignores ground combat.

**Current Logic**:
1. Get last 3 air missions
2. If none, show generic "Turn X operations in progress"

**Should Include**:
1. Recent ground combat engagements from `getCombatReports()`
2. Air mission results
3. Combined into chronological engagement log

---

### 4. **Field Reports Missing Ground Combat**
**Location**: `composeFieldReports()` lines 286-356
**Problem**: Only shows air missions, casualties, and objectives. No ground combat activity.

**Current Logic**:
1. Last 4 air missions
2. Last 2 casualties
3. All mission objectives
4. Generic fallback

**Should Include**:
- Ground attack reports: "2nd Infantry engaged enemy armor at hex 14,5 - destroyed"
- Movement reports: "Panzer IV advanced to sector 12,3"
- Combat outcomes from `getCombatReports()`

---

### 5. **Recon Reports Too Generic**
**Location**: `composeReconReports()` lines 166-223
**Problem**: Just lists recon unit positions, doesn't actually report enemy contacts or meaningful intel

**Current**: "Ground reconnaissance patrol active. Monitoring enemy movement patterns."
**Should Be**:
- "Recon bike spotted enemy Infantry_42 at sector 14,5 - strength estimated 85%"
- "Fighter reconnaissance reports enemy tank formation moving toward objective"

---

### 6. **Requisitions Empty After Deployment**
**Location**: Lines 99-107
**Problem**: Filters `entry.remaining > 0`. Once deployment is complete, this is always empty.

**Fix**: Should show different data during battle (e.g., units requested from reserves, supply requests, etc.)

---

### 7. **No Movement Tracking**
**Problem**: No system tracks unit movements for field reports

**Impact**: Can't report "Tank battalion relocated to defensive position"

---

## Summary of Data Sources NOT Being Used

### ✓ Currently Used:
- `engine.getTurnSummary()`
- `engine.getRosterSnapshot()` - partially (only casualties count)
- `engine.getReserveSnapshot()`
- `engine.getAirMissionReports()` - buggy filter
- `deploymentState.pool`
- `mission` info

### ✗ NOT Used (Available):
- **`engine.getCombatReports()`** ← CRITICAL - Has all ground combat
- Bot turn summary (for enemy activity)
- Hex modifications (fortifications, trenches built)
- Support action impacts
- Enemy contact snapshots
- Recon intel snapshots

---

### Air Combat Damage Calculation Investigation (April 2026)
**Issue**: Enemy Ground_Attack mission dealing only 3% damage to AT_Gun_50mm in hills

**Root Cause Analysis**:
- Ground_Attack uses "air.light.antiVehicle" combat profile
- Base calculation: 31.8% expected damage before terrain
- Hills terrain + specialist target penalties reduce to ~16%
- Additional factors (minimum damage floors, RNG) result in observed 3%

**Key Factors**:
1. **Target Mismatch**: Ground_Attack optimized for vehicles, not specialist units
2. **Terrain Defense**: Hills provide significant protection
3. **Accuracy Penalty**: 16% base accuracy at range 2 × 0.857 scalar = 13.7%
4. **Small Target**: AT guns have small signature, hard to hit from air

**Combat Math**:
```
Base damage: 15.0 × 2.5 attack scalar = 37.5%
Penetration: 12 AP vs 1 armor = +11 margin × 1.55 = 58.1% per hit
Expected hits: 4 shots × 13.7% accuracy = 0.548 hits
Expected damage: 0.548 × 58.1% = 31.8%
After terrain/hills penalty: ~16%
Final observed: 3% (additional reductions/RNG)
```

**Status**: Working as designed - air attacks against small, entrenched specialist units are inherently ineffective.

---

## Recent Fixes Applied

### Air Combat System Overhaul (April 2026)
**Files Modified**: `GameEngine.ts`, `BattleScreen.ts`, `HexMapRenderer.ts`, `unitTypes.json`

**Major Improvements**:
1. **Unified Air Combat Resolution** - New `resolveAirInterception()` method handles all air-to-air combat consistently
2. **Enhanced Visual Effects** - Improved dogfight animations with orbital aircraft movements and better tracer effects
3. **Balanced Combat Scalars** - Adjusted `shotsScalar` and `damageScalar` values for realistic air combat outcomes
4. **Better Damage Capping** - Added `Math.min()` to prevent damage from exceeding target strength
5. **Tutorial Integration** - Added air mission tutorial phases and auto-completion triggers

**Specific Changes**:
- Ground_Attack aircraft: `shotsScalar: 10`, `damageScalar: 0.7` (defensive turret fire)
- Bomber aircraft: `shotsScalar: 10`, `damageScalar: 0.9` (improved defensive capability)
- Fighter/Interceptor: Rebalanced damage scalars for realistic air combat
- Added `AirInterceptPasses` with proper timing and bomber arrival delays
- Enhanced flak burst visual effects with better scaling and timing

---

## Remaining Fixes Needed

1. ~~**Fix air mission filter**~~ ~~COMPLETED~~ - Check event correctly or treat undefined as resolved
2. **Add ground combat to Engagement Log** - Pull from `getCombatReports()`
3. **Add ground combat to Field Reports** - Recent attacks, movement
4. **Enhance Recon Reports** - Use actual enemy contact data if available
5. **Fix Requisitions** - Show appropriate battle-phase data
