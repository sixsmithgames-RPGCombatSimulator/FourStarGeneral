# Combat Stance System Implementation Guide

## Overview

The combat stance system adds tactical depth for infantry-type units (infantry, AT infantry, engineers, recon bikes) by modeling realistic WWII infantry doctrine: fire-and-maneuver, assault at close range, suppressive fire, and defensive preparation.

## Design Requirements (User Specified)

### Core Mechanics

**1. ASSAULT Stance**
- Infantry closes to 0-50m during the 5-minute turn
- **+50% accuracy boost to BOTH attacker and defender** (physics: closer range = easier to hit)
- **Attacker loses ALL terrain cover** (exposed while charging)
- **Defender keeps terrain cover**
- High risk / high reward melee engagement
- Cannot assault if "pinned" (suppressed by 2+ units)

**2. SUPPRESSIVE FIRE Stance (default)**
- Uses actual range (150-250m based on weapon)
- Current accuracy values (15-25% base)
- Both sides keep terrain cover
- Applies "suppressed" status to defender
- Multiple suppressors → "pinned" (can't assault, movement restricted)
- Suppression lasts until attacker's next turn

**3. DIG IN Stance**
- No attack this turn
- Gain entrenchment bonus (+1 or +2)
- Better defensive position for future turns

### Infantry Unit Scope
- All infantry types: regular infantry, AT infantry, engineers
- Recon bikes (infantry on wheels)
- **EXCLUDE**: vehicles, tanks, artillery (they always fire from range)

### Bot AI Behavior
- **Dig in**: When on objective AND outnumbered
- **Suppress**: When on objective (maintain position)
- **Assault**: When trying to take objectives

### UI Requirements
- Stance toggle in attack confirmation dialog
- **Prominent placement** at top of dialog
- Clear visual indicator of current stance
- Show tactical tradeoffs (accuracy boost, cover loss, etc.)

## Technical Architecture

### Type Definitions

**Location**: `src/core/types.ts`

```typescript
/**
 * Combat stance for infantry-type units (infantry, AT infantry, engineers, recon bikes).
 * Determines engagement behavior and tactical tradeoffs.
 */
export type CombatStance = "assault" | "suppressive" | "digIn";

export interface ScenarioUnit {
  // ... existing fields ...

  /** Array of unit IDs that are currently suppressing this unit. Multiple suppressors result in pinned status. */
  suppressedBy?: string[];
}
```

**Location**: `src/core/Combat.ts`

```typescript
export interface DefenderContext {
  // ... existing fields ...
  stance?: "assault" | "suppressive" | "digIn"; // Combat stance (infantry only)
}

export interface AttackerContext {
  hex: Axial;
  stance?: "assault" | "suppressive" | "digIn"; // Combat stance (infantry only)
}
```

### Combat Resolution Logic

**Location**: `src/core/Combat.ts` → `calculateAccuracy()`

**Key Changes** (✅ COMPLETED):

```typescript
export function calculateAccuracy(request: AttackRequest): AccuracyBreakdown {
  const attacker = request.attacker;
  const defenderCtx = request.defenderCtx;
  const attackerCtx = request.attackerCtx;
  let distance = hexDistance(attackerCtx.hex, defenderCtx.hex);

  // If attacker is using assault stance, engagement happens at close range (0-50m, use 25m midpoint)
  const isAssault = attackerCtx.stance === "assault";
  const ASSAULT_CLOSE_RANGE_METERS = 25;
  if (isAssault) {
    distance = ASSAULT_CLOSE_RANGE_METERS; // Override actual distance
  }

  // Step 1: Get realistic base accuracy from range table
  const baseAccuracy = getBaseAccuracyByRange(attacker.unit.class, distance);

  // ... experience, commander bonuses ...

  // Step 3: Apply terrain modifier multiplicatively
  // NOTE: Attacker loses cover if assaulting (handled via defenderCtx.isRushing in terrainAccMod)
  const terrainMod = terrainAccMod(defenderCtx.terrain, defenderCtx.isRushing);
  const terrainMultiplier = 1 + terrainMod / 100;
  const afterTerrain = combinedAfterCommander * terrainMultiplier;

  // Step 4: Apply spotted target penalty
  const spottedMultiplier = defenderCtx.isSpottedOnly ? 0.5 : 1.0;
  let afterSpotted = afterTerrain * spottedMultiplier;

  // Step 5: Apply assault stance accuracy boost (+50% for close range physics)
  const assaultMultiplier = isAssault ? 1.5 : 1.0;
  const finalPreClamp = afterSpotted * assaultMultiplier;

  // Step 6: Clamp to bounds
  const finalAccuracy = clamp(finalPreClamp, combatBalance.accuracy.min, combatBalance.accuracy.max);

  // ...
}
```

**Critical Implementation Notes**:

1. **Both sides get accuracy boost**: When attacker assaults, BOTH the attacker and defender use close range (25m) for accuracy calculations. This is achieved by:
   - Attacker's accuracy: Set `attackerCtx.stance = "assault"` → uses 25m range → gets +50% boost
   - Defender's retaliation: Also uses 25m range in retaliation calculation → gets +50% boost

2. **Cover loss**: Attacker loses cover via `defenderCtx.isRushing = true` (existing mechanism)

3. **Defender keeps cover**: Defender's `defenderCtx` should NOT have `isRushing` set

## Implementation Status

### ✅ COMPLETED (Commit a392bb6)

1. **Type definitions**:
   - Added `CombatStance` type to `src/core/types.ts`
   - Added `suppressedBy` array to `ScenarioUnit`
   - Added `stance` field to `AttackerContext` and `DefenderContext`

2. **Combat resolution logic**:
   - Modified `calculateAccuracy()` to handle assault stance
   - Close range override (25m) when assaulting
   - +50% accuracy multiplier applied
   - Cover loss already handled via existing `isRushing` mechanism

### 🚧 TODO: Remaining Implementation

#### 1. Wire Stance Through GameEngine

**Location**: `src/game/GameEngine.ts`

**Changes Needed**:

**A. Add stance parameter to previewAttack()**:

```typescript
previewAttack(
  attackerHex: Axial,
  defenderHex: Axial,
  stance: CombatStance = "suppressive" // NEW PARAMETER
): CombatPreview | null {
  // ... existing code ...

  // Build attacker context
  const attackerCtx: AttackerContext = {
    hex: attackerHex,
    stance: stance // Pass stance through
  };

  // Build defender context
  const defenderCtx: DefenderContext = {
    // ... existing fields ...
    isRushing: stance === "assault", // Attacker loses cover when assaulting
    stance: stance === "assault" ? "assault" : undefined // Defender also at close range
  };

  // ... rest of preview logic ...
}
```

**B. Update resolvePlayerAttack() to accept and pass stance**:

```typescript
resolvePlayerAttack(
  attackerHex: Axial,
  defenderHex: Axial,
  stance: CombatStance = "suppressive" // NEW PARAMETER
): AttackResolution {
  // ... existing code ...

  // Build contexts with stance
  const attackerCtx: AttackerContext = {
    hex: attackerHex,
    stance: stance
  };

  const defenderCtx: DefenderContext = {
    // ... existing fields ...
    isRushing: stance === "assault",
    stance: stance === "assault" ? "assault" : undefined
  };

  // ... rest of resolution logic ...
}
```

**C. Handle retaliation at close range**:

In retaliation calculation section:

```typescript
// If attacker used assault, retaliation also happens at close range
const retaliationReq: AttackRequest = {
  attacker: defenderCombatState,
  defender: attackerCombatState,
  attackerCtx: {
    hex: defenderHex,
    stance: stance === "assault" ? "assault" : undefined // Defender also fires at close range
  },
  defenderCtx: {
    hex: attackerHex,
    terrain: attackerTerrain,
    class: attackerDef.class,
    facing: attacker.facing,
    isRushing: stance === "assault", // Attacker was charging (exposed)
    stance: stance === "assault" ? "assault" : undefined
  },
  // ... rest of retaliation request ...
};
```

**D. Apply suppression status**:

After attack resolution:

```typescript
// Apply suppression to defender
if (stance === "suppressive" && !defenderDestroyed) {
  const defender = this.getUnitAtHex(defenderHex);
  if (defender) {
    const attackerUnitId = attacker.unitId ?? `${attackerHex.q},${attackerHex.r}`;
    if (!defender.suppressedBy) {
      defender.suppressedBy = [];
    }
    if (!defender.suppressedBy.includes(attackerUnitId)) {
      defender.suppressedBy.push(attackerUnitId);
    }
  }
}
```

**E. Clear suppression at turn start**:

In `advanceTurn()` or turn phase transition:

```typescript
// Clear suppression for units whose suppressors have had their turn
private clearSuppression(faction: TurnFaction): void {
  const placements = faction === "Player" ? this.playerPlacements : this.botPlacements;

  placements.forEach(unit => {
    // Clear suppressedBy array at start of unit's turn
    if (unit.suppressedBy && unit.suppressedBy.length > 0) {
      unit.suppressedBy = [];
    }
  });
}
```

#### 2. Update BattleScreen UI

**Location**: `src/ui/screens/BattleScreen.ts`

**Changes Needed**:

**A. Add stance state**:

```typescript
export class BattleScreen {
  // ... existing fields ...

  private currentAttackStance: CombatStance = "suppressive";

  // ... rest of class ...
}
```

**B. Update attack preview to use stance**:

```typescript
private refreshAttackPreview(): void {
  // ... existing code ...

  const preview = engine.previewAttack(
    this.selectedHex,
    this.highlightedHex,
    this.currentAttackStance // Pass current stance
  );

  // ... rest of preview logic ...
}
```

**C. Update attack execution to use stance**:

```typescript
private executePlayerAttack(): void {
  // ... existing code ...

  const resolution = engine.resolvePlayerAttack(
    attackerHex,
    defenderHex,
    this.currentAttackStance // Pass current stance
  );

  // ... rest of execution logic ...
}
```

#### 3. Add Stance Toggle to Attack Dialog

**Location**: `index.html` (attack confirmation dialog)

**Current Dialog Structure** (approximate line 800-900):

```html
<div id="battleAttackConfirmDialog" class="modal-overlay hidden" role="dialog">
  <div class="modal-content">
    <h2 class="modal-title">Confirm Attack</h2>

    <!-- ADD STANCE TOGGLE HERE -->
    <div class="attack-stance-selector">
      <label>Combat Stance:</label>
      <div class="stance-buttons">
        <button id="stanceAssault" class="stance-button" data-stance="assault">
          <span class="stance-icon">⚔️</span>
          <span class="stance-label">ASSAULT</span>
          <span class="stance-desc">Close to 0-50m • +50% accuracy for both • Lose cover</span>
        </button>
        <button id="stanceSuppressive" class="stance-button stance-active" data-stance="suppressive">
          <span class="stance-icon">🎯</span>
          <span class="stance-label">SUPPRESSIVE</span>
          <span class="stance-desc">Fire from range • Apply suppression • Safe</span>
        </button>
      </div>
    </div>

    <!-- Existing preview content -->
    <div id="battleAttackPreviewContent"></div>

    <!-- Existing buttons -->
    <div class="modal-actions">
      <button id="battleAttackConfirmAccept">ATTACK</button>
      <button id="battleAttackConfirmCancel">CANCEL</button>
    </div>
  </div>
</div>
```

**CSS Styling** (add to `styles.css`):

```css
.attack-stance-selector {
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
}

.attack-stance-selector label {
  display: block;
  font-weight: bold;
  margin-bottom: 0.5rem;
  color: #e0e0e0;
}

.stance-buttons {
  display: flex;
  gap: 0.5rem;
}

.stance-button {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem;
  background: rgba(40, 40, 40, 0.8);
  border: 2px solid rgba(100, 100, 100, 0.5);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.stance-button:hover {
  background: rgba(60, 60, 60, 0.8);
  border-color: rgba(150, 150, 150, 0.8);
}

.stance-button.stance-active {
  background: rgba(100, 120, 140, 0.5);
  border-color: #4a9eff;
  box-shadow: 0 0 8px rgba(74, 158, 255, 0.3);
}

.stance-icon {
  font-size: 1.5rem;
  margin-bottom: 0.25rem;
}

.stance-label {
  font-weight: bold;
  font-size: 0.9rem;
  color: #fff;
  margin-bottom: 0.25rem;
}

.stance-desc {
  font-size: 0.75rem;
  color: #b0b0b0;
  text-align: center;
  line-height: 1.2;
}

.stance-button.stance-disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}
```

**JavaScript Event Binding** (in BattleScreen.ts):

```typescript
private bindAttackDialogStanceButtons(): void {
  const assaultBtn = document.getElementById("stanceAssault");
  const suppressiveBtn = document.getElementById("stanceSuppressive");

  const stanceButtons = [assaultBtn, suppressiveBtn];

  stanceButtons.forEach(btn => {
    btn?.addEventListener("click", () => {
      const stance = btn.dataset.stance as CombatStance;

      // Check if assault is allowed (not pinned)
      if (stance === "assault") {
        const defender = this.getDefenderAtHex(this.highlightedHex);
        if (defender && defender.suppressedBy && defender.suppressedBy.length >= 2) {
          this.announceBattleUpdate("Cannot assault - defender is pinned by multiple units");
          return;
        }
      }

      // Update stance
      this.currentAttackStance = stance;

      // Update button states
      stanceButtons.forEach(b => b?.classList.remove("stance-active"));
      btn?.classList.add("stance-active");

      // Refresh preview with new stance
      this.refreshAttackPreview();
    });
  });
}
```

Call this in attack dialog setup:

```typescript
private showAttackDialog(): void {
  // ... existing code ...

  // Reset stance to default
  this.currentAttackStance = "suppressive";

  // Update button states
  document.getElementById("stanceAssault")?.classList.remove("stance-active");
  document.getElementById("stanceSuppressive")?.classList.add("stance-active");

  // Bind stance buttons if not already bound
  if (!this.stanceButtonsBound) {
    this.bindAttackDialogStanceButtons();
    this.stanceButtonsBound = true;
  }

  // ... rest of dialog setup ...
}
```

#### 4. Display Suppression/Pinned Status

**A. Add suppression indicator to unit info panel**:

In unit info rendering:

```typescript
private renderUnitInfo(unit: ScenarioUnit): string {
  let statusHTML = "";

  if (unit.suppressedBy && unit.suppressedBy.length > 0) {
    const isPinned = unit.suppressedBy.length >= 2;
    const statusLabel = isPinned ? "PINNED" : "SUPPRESSED";
    const statusColor = isPinned ? "#ff4444" : "#ffaa00";

    statusHTML = `
      <div class="unit-status-indicator" style="color: ${statusColor}">
        ${statusLabel} (${unit.suppressedBy.length} units)
      </div>
    `;
  }

  return `
    ${statusHTML}
    <!-- ... rest of unit info ... -->
  `;
}
```

**B. Add visual indicator on map**:

In `HexMapRenderer.renderUnit()` or overlay system:

```typescript
// Add suppression marker overlay
if (unit.suppressedBy && unit.suppressedBy.length > 0) {
  const isPinned = unit.suppressedBy.length >= 2;
  const icon = isPinned ? "📌" : "⚠️";

  // Render icon over unit hex
  this.addOverlayIcon(hexKey, icon, isPinned ? "#ff4444" : "#ffaa00");
}
```

#### 5. Bot AI Stance Logic

**Location**: `src/game/bot/BotPlanner.ts` or `src/game/GameEngine.ts`

**Add stance decision logic**:

```typescript
function chooseBotAttackStance(
  botUnit: PlannerUnitSnapshot,
  targetHex: Axial,
  objectives: readonly { hex: Axial; owner: "Player" | "Bot"; vp: number }[],
  occupancy: ReadonlyMap<string, "bot" | "player">,
  allBotUnits: readonly PlannerUnitSnapshot[],
  allPlayerUnits: readonly PlannerUnitSnapshot[]
): CombatStance {
  // Only infantry-type units can use non-default stances
  const canUseStances = ["infantry", "recon"].includes(botUnit.definition.class);
  if (!canUseStances) {
    return "suppressive";
  }

  // Check if bot is on an objective
  const botKey = axialKey(botUnit.unit.hex);
  const isOnObjective = objectives.some(obj => axialKey(obj.hex) === botKey);

  if (isOnObjective) {
    // Count nearby enemies within 6 hexes
    const nearbyEnemies = allPlayerUnits.filter(p =>
      hexDistance(p.unit.hex, botUnit.unit.hex) <= 6
    );

    // Dig in if outnumbered
    if (nearbyEnemies.length > allBotUnits.length) {
      return "digIn";
    }

    // Otherwise suppress to hold position
    return "suppressive";
  }

  // Check if target is an objective
  const targetKey = axialKey(targetHex);
  const targetIsObjective = objectives.some(obj => axialKey(obj.hex) === targetKey);

  if (targetIsObjective) {
    // Assault to take objectives
    return "assault";
  }

  // Default to suppressive fire
  return "suppressive";
}
```

**Integrate into bot attack execution**:

```typescript
// In executeHeuristicBotTurn() or equivalent
for (const plan of plans) {
  if (plan.attackTarget) {
    const stance = chooseBotAttackStance(
      plan.unit,
      plan.attackTarget,
      input.objectives,
      occupancy,
      input.botUnits,
      input.playerUnits
    );

    // Execute attack with chosen stance
    const resolution = this.resolveBotAttack(
      plan.origin,
      plan.attackTarget,
      stance
    );

    // ... rest of attack handling ...
  }
}
```

#### 6. Dig In Implementation

**Location**: `src/game/GameEngine.ts`

**Add digIn action**:

```typescript
digInUnit(hex: Axial): boolean {
  const unit = this.playerPlacements.get(axialKey(hex));
  if (!unit) return false;

  // Only infantry can dig in
  const def = this.getUnitDefinition(unit.type);
  if (!["infantry", "recon"].includes(def.class)) {
    return false;
  }

  // Increase entrenchment (max 2)
  unit.entrench = Math.min(2, unit.entrench + 1);

  // Mark unit as having acted (no attack this turn)
  // This may need to be tracked separately depending on your action system

  return true;
}
```

**Add UI button** (in battle controls or unit context menu):

```html
<button id="battleDigInBtn" class="control-button">
  🛡️ DIG IN
</button>
```

```typescript
// Event binding
document.getElementById("battleDigInBtn")?.addEventListener("click", () => {
  if (this.selectedHex) {
    const success = engine.digInUnit(this.selectedHex);
    if (success) {
      this.announceBattleUpdate("Unit is digging in for defensive position");
      this.refreshUI();
    }
  }
});
```

## Testing Checklist

### Manual Testing

1. **Assault Mechanics**:
   - [ ] Engineer attacks enemy at 250m with suppressive fire → ~17% accuracy
   - [ ] Same Engineer attacks with assault → ~25-30% accuracy (50% boost)
   - [ ] Defender retaliation also shows ~25-30% accuracy (both at close range)
   - [ ] Attacker takes more damage (lost cover)
   - [ ] Defender takes more damage (higher accuracy on both sides)

2. **Suppression**:
   - [ ] Suppressive fire applies suppressed status to defender
   - [ ] Unit info shows "SUPPRESSED (1 units)"
   - [ ] Second suppressor → "PINNED (2 units)"
   - [ ] Pinned unit cannot assault (button disabled)
   - [ ] Suppression clears at start of attacker's next turn

3. **Dig In**:
   - [ ] Infantry can dig in (no attack that turn)
   - [ ] Entrenchment increases by +1 (max 2)
   - [ ] Future attacks show improved defensive stats

4. **Bot AI**:
   - [ ] Bot digs in when on objective and outnumbered
   - [ ] Bot suppresses when on objective
   - [ ] Bot assaults when attacking objectives
   - [ ] Bot console logs show chosen stances

5. **Edge Cases**:
   - [ ] Vehicles/tanks cannot change stance (always suppressive)
   - [ ] Assault stance disabled when pinned
   - [ ] Stance resets to suppressive when dialog reopens
   - [ ] Retaliation accuracy matches assault if attacker charged

### Automated Testing

Add to `tests/Combat.test.ts`:

```typescript
describe("Combat Stance System", () => {
  it("should boost accuracy by 50% when assaulting", () => {
    const request: AttackRequest = {
      // ... setup request with assault stance ...
      attackerCtx: { hex: { q: 0, r: 0 }, stance: "assault" },
      defenderCtx: {
        hex: { q: 1, r: 0 },
        terrain: plainsTerrain,
        class: "infantry",
        facing: "N",
        isRushing: false,
        stance: "assault" // Defender also at close range
      }
    };

    const result = resolveAttack(request);

    // Accuracy should be ~50% higher than suppressive fire at same range
    // Add specific assertions based on your balance values
  });

  it("should remove attacker cover when assaulting", () => {
    // Test that isRushing removes terrain cover
  });

  it("should apply suppression status", () => {
    // Test suppressedBy array management
  });
});
```

## Balance Considerations

### Accuracy Values Reference

From `src/core/balance.ts`:

```typescript
accuracy: {
  baseByRange: {
    infantry: [
      { range: 0, accuracy: 50 },    // Point blank
      { range: 50, accuracy: 40 },   // Close
      { range: 100, accuracy: 25 },  // Medium
      { range: 200, accuracy: 15 },  // Long
      { range: 300, accuracy: 8 }    // Max
    ]
  }
}
```

**Assault Calculations** (25m range):
- Base accuracy at 25m (interpolated): ~45%
- With +50% boost: ~67.5%
- With experience/commander bonuses: Can exceed 70%

**Suppressive Fire** (250m range):
- Base accuracy: ~12%
- No assault boost
- Standard modifiers apply

### Risk/Reward Balance

**Assault**:
- ✅ Much higher accuracy (both sides)
- ✅ Can quickly eliminate enemies
- ❌ Lose all terrain cover
- ❌ Take significantly more damage in return
- ❌ Cannot assault if pinned

**Suppressive**:
- ✅ Safe (keep cover)
- ✅ Apply suppression (tactical control)
- ✅ Can pin enemies
- ❌ Low accuracy (slow attrition)
- ❌ Low damage output

**Dig In**:
- ✅ Improved defense for next turn
- ✅ Good for holding objectives
- ❌ No attack this turn
- ❌ Loses initiative

## Known Issues / Edge Cases

1. **Air units**: Should always use suppressive (no close combat)
2. **Artillery**: Should always use suppressive (long-range only)
3. **Mixed stance battles**: If defender is already in assault stance when attacked, both use close range regardless of attacker stance
4. **Suppression decay**: Currently clears at turn start - may need more granular timing
5. **Pinned movement**: Not yet implemented - pinned units should have movement restrictions

## File Modification Summary

### Files Modified (✅ Done):
- `src/core/types.ts` - Added CombatStance type, suppressedBy field
- `src/core/Combat.ts` - Added stance fields, assault accuracy logic

### Files To Modify (🚧 TODO):
- `src/game/GameEngine.ts` - Wire stance through attack/preview/retaliation
- `src/ui/screens/BattleScreen.ts` - Add stance state, update attack calls
- `index.html` - Add stance toggle UI to attack dialog
- `styles.css` - Add stance button styling
- `src/game/bot/BotPlanner.ts` - Add bot stance decision logic
- `src/rendering/HexMapRenderer.ts` - Add suppression visual indicators (optional)

## Commit Strategy

Recommended commits:

1. ✅ **DONE** - Foundation (types + combat math)
2. GameEngine stance wiring
3. BattleScreen UI stance toggle
4. Suppression status tracking
5. Bot AI stance logic
6. Dig in functionality
7. Visual indicators and polish

## Next Steps

1. Start with **GameEngine wiring** (Section 1 above)
2. Then **BattleScreen UI** (Section 3 above)
3. Test assault mechanics manually
4. Add suppression tracking (Section 4 above)
5. Implement bot AI stances (Section 5 above)
6. Add dig in action (Section 6 above)
7. Final polish and testing

---

**Document Version**: 1.0
**Last Updated**: 2026-03-21
**Commit Reference**: a392bb6 (foundation complete)
**Author**: Claude Code
