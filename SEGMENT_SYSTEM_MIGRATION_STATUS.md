# Campaign Segment System Migration Status

## Overview
Migrating from **1-day** turns to **3-hour segment** turns with **10km hexes** (was 5km).

Time: 1 segment = 3 hours, 8 segments = 1 day
Distance: 1 hex = 10 km

---

## ✅ COMPLETED

### 1. Core Constants Updated
- `CAMPAIGN_HEX_SCALE_KM = 10` (was 5)
- `CAMPAIGN_SEGMENT_HOURS = 3`
- `SEGMENTS_PER_DAY = 8`

### 2. Resource System Updated
- Added `ammo` field to `CampaignFactionEconomy`
- Updated all economy definitions in data files
- Ammo is cargo (transported, not consumed during movement)

### 3. Transport Modes Redefined
Created 7 transport modes with realistic consumption:

| Mode | Speed (hex/seg) | Fuel/hex | Supply/hex | Notes |
|------|----------------|----------|------------|-------|
| **Foot** | 1 | 0 | 1/man | Infantry only |
| **Truck** | 3 | 3/truck | 1/truck + 1/man | 100 men per truck |
| **Armor** | 2 | 25/vehicle | 5/vehicle | Tanks, APCs |
| **Naval Transport** | 3 | 1750/ship | 70/ship | 500 men per ship |
| **Warship** | 3 | 2250/ship | 1500/ship | Combat vessels |
| **Fighter** | 75 | 300/plane | 1/plane | 75 hex one-way, 35 round-trip |
| **Bomber** | 75 | 750/plane | 5/plane | 75 hex one-way, 35 round-trip |

### 4. Time Tracking in CampaignState
- Changed `currentDay` → `currentSegment`
- Added `getCurrentSegment()`, `getCurrentDay()`, `getSegmentOfDay()`
- Added `getCurrentTimeDisplay()` → "Day 5, 09:00-12:00"
- Added `segmentToTimeDisplay(segment)` helper
- `advanceSegment()` advances by 1 segment (3 hours)
- `advanceDay()` now legacy wrapper (8 segments)
- Daily resource generation runs every 8 segments
- Save/load supports both new and legacy formats

---

## ⚠️ PARTIALLY COMPLETE / NEEDS WORK

### 5. Cost Calculation System
**Status:** Transport mode definitions are correct, but `scheduleRedeploy()` still uses old formula.

**Current Problem:**
```typescript
// OLD (wrong):
const fuelCost = Math.ceil(totalUnits * distance * transportMode.fuelCostPerUnitPerHex);
```

This treats "totalUnits" as an abstract number, but the new system needs:
- **Infantry:** Cost per man per hex
- **Trucks:** Cost per truck PLUS cost per man being carried
- **Armor:** Cost per vehicle per hex
- **Naval/Air:** Cost per ship/plane per hex

**Required Fix:**
Need to calculate costs based on unit classification:

```typescript
// EXAMPLE: Moving 200 infantry 10 hexes by truck
// Trucks needed: ceil(200 / 100) = 2 trucks
// Truck fuel: 2 * 10 * 3 = 60 fuel
// Truck supply: 2 * 10 * 1 = 20 supplies
// Infantry supply: 200 * 10 * 1 = 2000 supplies
// TOTAL: 60 fuel, 2020 supplies

// EXAMPLE: Moving 5 tanks 10 hexes (self-propelled)
// Tank fuel: 5 * 10 * 25 = 1250 fuel
// Tank supply: 5 * 10 * 5 = 250 supplies
```

**Action Required:**
Rewrite `scheduleRedeploy()` cost calculation to use unit classification.

### 6. ETA Calculations
**Status:** Partially updated, but needs segment-based ETAs.

**Current State:**
```typescript
// Speed is now "hex per segment", not "hex per day"
const timeDays = Math.max(1, Math.ceil(distance / transportMode.speedHexPerDay));
```

**Required Fix:**
```typescript
const timeSegments = Math.max(1, Math.ceil(distance / transportMode.speedHexPerDay));
const etaSegment = this.currentSegment + timeSegments;
```

Also need to update:
- `returnEtaSegment` calculation
- Redeployment processing to check `etaSegment` not `etaDay`

### 7. Control Since Tracking
**Status:** Partially migrated.

**Current:**
- `setScenario()` now sets `controlSinceSegment`
- `moveForces()` still sets `controlSinceDay` (line 378)
- `updateFrontsForHeldTiles()` still checks `controlSinceDay`

**Action Required:**
- Replace all `controlSinceDay` with `controlSinceSegment`
- Update front expansion logic (currently requires 2 days = 16 segments)

---

## ❌ NOT STARTED

### 8. Campaign Sidebar UI
**Status:** Not updated yet.

**Required Changes:**

**HTML (`index.html`):**
- Change "Day X" display to show `getCurrentTimeDisplay()`
- Change "Advance Day" button to "Advance 3 Hours"
- Add ammo display to resource section
- Professional layout for resources (table format?)

**JavaScript (`CampaignScreen.ts`):**
- Update `updateEconomyPanel()` to call `campaignState.getCurrentTimeDisplay()`
- Change button handler from `advanceDay()` to `advanceSegment()`
- Display ammo in economy panel
- Format resources with labels and thousands separators

### 9. Redeployment Modal UI
**Status:** Uses old cost calculation system.

**Required Changes:**
- Update cost preview to show realistic per-unit/per-vehicle costs
- Display in "X segments (Y hours)" format instead of "X days"
- Show ETA as `segmentToTimeDisplay(etaSegment)`
- Example: "ETA: Day 2, 15:00-18:00 (in 5 segments)"

### 10. Documentation
**Status:** Old docs exist but are outdated.

**Files to Update:**
- `design/CAMPAIGN_LOGISTICS_TRANSPORT.md`
- `TRANSPORT_SYSTEM_SUMMARY.md`
- Create segment system migration guide

---

## 🔧 CRITICAL FIXES NEEDED NOW

### Priority 1: Fix moveForces() to use segments
Line 378 in CampaignState.ts:
```typescript
dest.controlSinceDay = this.currentDay; // WRONG
```
Should be:
```typescript
(dest as any).controlSinceSegment = this.currentSegment;
```

### Priority 2: Fix updateFrontsForHeldTiles()
Currently checks `controlSinceDay` and requires 2 days hold.
Should check `controlSinceSegment` and require 16 segments (2 days).

### Priority 3: Fix redeployment ETA calculations
Change all `etaDay`, `returnEtaDay` to `etaSegment`, `returnEtaSegment`.

### Priority 4: Fix cost calculations
Rewrite to use unit classification (see section 5).

---

## Testing Checklist

Once all fixes are complete:

- [ ] Can advance by 3-hour segments
- [ ] Time displays as "Day X, HH:00-HH:00"
- [ ] Daily resource generation happens every 8 segments
- [ ] Moving infantry on foot costs 1 supply/man/hex, 0 fuel
- [ ] Moving infantry by truck costs 3 fuel/truck + supplies for truck and men
- [ ] Moving tanks costs 25 fuel + 5 supply per tank per hex
- [ ] Redeployments complete at correct segment
- [ ] Transport capacity released at correct time
- [ ] Front expansion works with segment-based control timing
- [ ] Save/load preserves segment counter
- [ ] UI shows ammo in resources

---

## Implementation Order Recommendation

1. **Fix controlSince references** (quick, prevents bugs)
2. **Fix ETA to use segments** (moderate, needed for redeployments)
3. **Rewrite cost calculations** (complex, but critical)
4. **Update sidebar UI** (moderate, user-facing)
5. **Update redeployment modal UI** (moderate, user-facing)
6. **Update documentation** (easy, but time-consuming)

---

## Notes

- `speedHexPerDay` is a misnomer now (it's actually hex per segment), but kept for compatibility
- Legacy save files with `currentDay` are automatically converted to segments
- All segment-based logic assumes segment 0 = Day 1, 00:00-03:00
