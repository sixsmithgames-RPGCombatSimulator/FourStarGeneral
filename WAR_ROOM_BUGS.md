# War Room HQ - Bug Analysis

> **Note**: Air Show / BattleScreen bugs and fixes are tracked in `docs/AIR_SHOW_NORTH_STAR_SPEC.md`
> 
> This document tracks War Room (strategic HQ) bugs only.

## Active War Room Bugs

### 1. **Ground Combat Reports Completely Ignored**
**Location**: `BattleWarRoomDataProvider.ts`  
**Problem**: `engine.getCombatReports()` returns all ground combat but is NEVER called in the War Room data provider.

**Impact**: Combat with casualties shows nothing because we only check air missions.

**Fix**: Call `getCombatReports()` and include in data pipeline.

---

### 2. **Engagement Log Missing Ground Combat**
**Location**: `composeEngagementLog()` lines 225-284  
**Problem**: Only pulls from air mission reports. Ignores ground combat entirely.

**Should Include**:
1. Recent ground combat from `getCombatReports()`
2. Air mission results
3. Combined chronological log

---

### 3. **Field Reports Missing Ground Combat**
**Location**: `composeFieldReports()` lines 286-356  
**Problem**: Only air missions, casualties, objectives. No ground combat activity.

**Should Include**:
- Ground attacks: "2nd Infantry engaged enemy armor at hex 14,5 - destroyed"
- Movement: "Panzer IV advanced to sector 12,3"

---

### 4. **Recon Reports Too Generic**
**Location**: `composeReconReports()` lines 166-223  
**Problem**: Lists recon positions but no actual enemy contacts or intel.

**Current**: "Ground reconnaissance patrol active. Monitoring enemy movement patterns."  
**Should Be**: "Recon bike spotted enemy Infantry_42 at sector 14,5 - strength 85%"

---

### 5. **Requisitions Empty After Deployment**
**Location**: Lines 99-107  
**Problem**: Filters `entry.remaining > 0`. Empty once deployment complete.

**Fix**: Show battle-phase data (reserve requests, supply requests).

---

### 6. **No Movement Tracking**
**Problem**: No system tracks unit movements for reports.

**Impact**: Can't report "Tank battalion relocated to defensive position".

---

## Data Sources Status

| Source | Status | Notes |
|--------|--------|-------|
| `getTurnSummary()` | ✓ Used | |
| `getRosterSnapshot()` | ✓ Partial | Only casualty counts |
| `getReserveSnapshot()` | ✓ Used | |
| `getAirMissionReports()` | ✓ Used | Filter fixed |
| `getCombatReports()` | ✗ **CRITICAL** | Has all ground combat, never called |
| Bot turn summary | ✗ Unused | Enemy activity |
| Hex modifications | ✗ Unused | Fortifications, trenches |
| Recon intel | ✗ Unused | Enemy contacts |

---

## Air Show / BattleScreen Note

All air show and battle screen bugs, fixes, and implementation status are tracked in:  
**`docs/AIR_SHOW_NORTH_STAR_SPEC.md`** — Section: "Implementation Status & Recent Fixes"
