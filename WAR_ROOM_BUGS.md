# War Room HQ - Bug Analysis

## Critical Bugs Found

### 1. **Air Mission Reports Filter Bug**
**Location**: `BattleWarRoomDataProvider.ts:248-249`
**Problem**:
```typescript
if (airMission.event === "resolved" && airMission.outcome) {
```
According to `GameEngine.ts:726`, the `event` field "defaults to 'resolved' when undefined". This check filters OUT valid air missions that have `event: undefined`.

**Fix**: Check for `event !== "refitStarted" && event !== "refitCompleted"` OR treat undefined as resolved

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

## Immediate Fixes Needed

1. **Fix air mission filter** - Check event correctly or treat undefined as resolved
2. **Add ground combat to Engagement Log** - Pull from `getCombatReports()`
3. **Add ground combat to Field Reports** - Recent attacks, movement
4. **Enhance Recon Reports** - Use actual enemy contact data if available
5. **Fix Requisitions** - Show appropriate battle-phase data
