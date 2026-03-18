# Predeployed Units Bug - Postmortem & Prevention Guide

## Issue Summary
**Date Identified**: March 18, 2026
**Severity**: Critical - Mission unplayable
**Mission Affected**: River Crossing Watch (scenario_river_watch.json)

Predeployed units (marked with `preDeployed: true` in scenario JSON) were not appearing on the battle map. The mission started with 0 player units instead of the 4 predeployed units defined in the scenario.

## Root Cause Analysis

### The Bug
In `GameEngine.initializeFromAllocations()` (`src/game/GameEngine.ts:3292`), the method was **replacing** `this.playerSide.units` with only precombat-purchased units, wiping out scenario-defined predeployed units before `beginDeployment()` could detect and place them on the map.

### Code Flow
1. Player completes precombat screen with allocations
2. `BattleScreen.seedEngineFromDeploymentState()` is called (line 3315)
3. This calls `engine.initializeFromAllocations(scenarioUnits)` (line 3342)
4. **BUG HERE**: `initializeFromAllocations()` replaced `playerSide.units` completely
5. When `beginDeployment()` tried to preserve predeployed units, they were already gone

### Why This Happened
The precombat flow was designed to completely replace scenario units with player-purchased units. This worked fine for missions without predeployed units, but broke when missions used the `preDeployed: true` flag to place units on the map at battle start.

## The Fix

### Primary Fix: Preserve Predeployed Units in initializeFromAllocations()
**File**: `src/game/GameEngine.ts:3292-3311`

```typescript
initializeFromAllocations(units: ScenarioUnit[]): void {
  this.assertPhase("deployment", "Allocations can only be loaded during deployment.");

  // Capture any scenario-predeployed units BEFORE replacing playerSide.units
  const scenarioPredeployed = (this.playerSide.units ?? [])
    .filter((unit) => (unit as { preDeployed?: boolean }).preDeployed === true)
    .map((unit) => structuredClone(unit));

  this.playerSide.units = units.map((unit) => structuredClone(unit));

  // Append preserved predeployed units so beginDeployment can detect and place them
  if (scenarioPredeployed.length > 0) {
    this.playerSide.units.push(...scenarioPredeployed);
    console.log("[GameEngine] initializeFromAllocations preserved predeployed scenario units", {
      count: scenarioPredeployed.length,
      types: scenarioPredeployed.map((u) => u.type)
    });
  }

  this.beginDeployment();
}
```

### Secondary Fixes

**1. Filter Non-Unit Categories** (`src/ui/screens/PrecombatScreen.ts:475-503`)
```typescript
// Only include units category - supplies/support/logistics are not deployable
if (option.category !== "units") {
  continue;
}
```
This prevents "Deployment template missing" errors for ammo/fuel/support items.

**2. Fix Proceed Button Logic** (`src/ui/screens/PrecombatScreen.ts:804-823`)
```typescript
const totalPredeployedUnits = Array.from(this.predeployedCounts.values())
  .reduce((sum, count) => sum + count, 0);
const hasAnyForces = spent > 0 || totalPredeployedUnits > 0;
this.proceedToBattleButton.disabled = remaining < 0 || !hasAnyForces;
```
Missions with only predeployed units can now proceed without purchases.

**3. Fix Invalid Unit Facing** (`src/data/scenario_river_watch.json`)
Changed facing from `"E"` (invalid) to `"SE"` (valid hex direction).
Valid facings: N, NE, SE, S, SW, NW (hex directions only)

## Prevention Guidelines for Future Mission Design

### 1. Understanding Predeployed Units

**Predeployed Units** are scenario-provided forces that:
- Start on the map at specific hex coordinates
- Are marked with `preDeployed: true` in scenario JSON
- Do NOT count against the player's budget
- Are distinct from purchased/allocated units

**Purchased Units** are selected in precombat and:
- Start in reserves, must be deployed during deployment phase
- Cost money from the mission budget
- Are sent through `toDeploymentEntries()` → `DeploymentState` → `GameEngine`

### 2. Scenario JSON Format for Predeployed Units

```json
{
  "sides": {
    "Player": {
      "units": [
        {
          "type": "Infantry_42",
          "hex": [1, 2],
          "strength": 100,
          "experience": 0,
          "ammo": 6,
          "fuel": 0,
          "entrench": 0,
          "facing": "SE",
          "preDeployed": true  // CRITICAL: This flag places unit on map
        }
      ]
    }
  }
}
```

### 3. Testing Checklist for Missions with Predeployed Units

When creating a mission with predeployed units:

- [ ] **Verify unit types exist** in `src/data/unitTypes.json`
- [ ] **Verify facing is valid**: N, NE, SE, S, SW, NW only (NOT E, W, etc.)
- [ ] **Verify hex coordinates** are within map bounds
- [ ] **Set `preDeployed: true`** for each unit that should start on map
- [ ] **Test in precombat screen**: Predeployed units should appear in "Scenario Forces" panel
- [ ] **Test proceed button**: Should be enabled even with $0 spent if predeployed units exist
- [ ] **Test battle start**: All predeployed units visible on map at their hex positions
- [ ] **Test with additional purchases**: Predeployed + purchased units both appear
- [ ] **Test without purchases**: Predeployed-only mission works

### 4. Common Pitfalls to Avoid

❌ **Don't** use cardinal directions for facing (E, W, NE, etc. - only hex directions valid)
❌ **Don't** forget `preDeployed: true` flag (unit will go to reserves instead)
❌ **Don't** assume precombat allocations preserve scenario units (they don't without the fix)
❌ **Don't** include non-unit items (ammo, fuel) in deployment entries
❌ **Don't** set playerBudget to 0 if you want additional purchases allowed

✅ **Do** use hex facings: N, NE, SE, S, SW, NW
✅ **Do** mark scenario units with `preDeployed: true`
✅ **Do** test both predeployed-only and predeployed+purchased scenarios
✅ **Do** verify unit types match adapter templates in `src/game/adapters.ts`
✅ **Do** set appropriate `playerBudget` and `allowedUnits` constraints

### 5. Budget and Unit Restrictions

```json
{
  "playerBudget": 200000,  // Small budget for limited purchases
  "allowedUnits": [        // Restrict to specific unit types
    "infantry",
    "engineer",
    "reconBike",
    "recon"
  ]
}
```

See `docs/MISSION_DESIGN_GUIDE.md` for detailed budget guidelines.

### 6. Mapping Unit Types to Allocation Keys

The system uses two identifiers:
- **Scenario Type**: Engine unit type (e.g., "Infantry_42", "Engineer")
- **Allocation Key**: UI catalog key (e.g., "infantry", "engineer")

Mappings are defined in `src/game/adapters.ts`:
```typescript
{
  key: "infantry",        // Allocation key (UI)
  type: "Infantry_42",    // Scenario type (engine)
  strength: 100,
  // ... other defaults
}
```

Always verify your scenario unit types have corresponding adapter templates.

## Files Modified in This Fix

1. `src/game/GameEngine.ts` - Added predeployed unit preservation
2. `src/ui/screens/PrecombatScreen.ts` - Fixed category filtering and button logic
3. `src/data/scenario_river_watch.json` - Fixed unit facings
4. `docs/MISSION_DESIGN_GUIDE.md` - Already had guidelines (update if needed)

## Lessons Learned

1. **Destructive operations need preservation logic**: When replacing data structures, always check for special cases that must survive the replacement
2. **Test edge cases**: Predeployed-only missions, purchased-only missions, and mixed scenarios
3. **Clear separation of concerns**: Predeployed (scenario) vs purchased (precombat) units serve different purposes
4. **Comprehensive logging**: The debug logs added helped identify the exact point where units were lost

## Related Documentation

- `docs/MISSION_DESIGN_GUIDE.md` - Comprehensive mission design guidelines
- `src/core/types.ts` - Type definitions including `ScenarioUnit.preDeployed`
- `src/game/adapters.ts` - Unit type mappings
- `src/data/unitTypes.json` - Available unit types
