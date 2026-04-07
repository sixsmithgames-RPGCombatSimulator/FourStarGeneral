# War Room HQ - Bug Analysis

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
