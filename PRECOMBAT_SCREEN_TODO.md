# Precombat Screen Implementation TODO

<!-- STATUS: 🔲 PENDING IMPLEMENTATION - This file contains detailed specifications for implementing the precombat allocation UI. The unit allocation data module and UI logic need to be created. This is a high-priority feature for core gameplay. -->

## Issue Identified

The precombat screen currently shows minimal placeholders instead of the full allocation interface shown in the original screenshots.

### What's Missing (Based on Screenshots)

**Screenshot #2 Analysis:**
1. **Budget Display** - "FUNDS REMAINING $8,380,000.00"
2. **General Information** - Shows assigned general with "REASSIGN GENERAL" button
3. **"DEPLOY FORCES" button** (prominent yellow button)
4. **Mission Briefing Section** with:
   - Mission name and description
   - Academy Doctrine bonuses
   - Objectives list with hex coordinates and VP values
   - Turn limit
   - Base of Operations description
   - Baseline Supplies (Field Rations, etc.)

**Screenshot #3 & #4 Analysis - Battle Screen:**
- Full hex map with units rendered
- Unit icons visible on hexes (infantry, tanks, etc.)
- Sidebar with mission name and buttons
- "END MISSION" button visible

## Current State

### Precombat Screen Status
- ✅ HTML structure exists in `index.html`
- ✅ CSS styling defined
- ❌ **Data population not implemented** in `PrecombatScreen.ts`
- ❌ **Allocation logic missing**
- ❌ **Budget calculation missing**
- ❌ **Unit cost data missing**

### What Exists
```typescript
// src/ui/screens/PrecombatScreen.ts
- Basic screen structure
- setup() method (accepts mission name and briefing)
- DOM element caching
- Event handler stubs
- TODO comments for allocation UI
```

### What Needs To Be Implemented

#### 1. Create Unit Allocation Data Module
**File:** `src/data/unitAllocation.ts`

```typescript
export interface UnitAllocationOption {
  key: string;
  label: string;
  category: "units" | "supplies" | "support" | "logistics";
  costPer Unit: number;
  description: string;
  maxQuantity: number;
}

export const allocationOptions: UnitAllocationOption[] = [
  // Combat Units
  { key: "infantry", label: "Infantry Squad", category: "units", costPerUnit: 50000, description: "Basic infantry formation", maxQuantity: 20 },
  { key: "tank", label: "Tank Platoon", category: "units", costPerUnit: 200000, description: "Armored vehicle unit", maxQuantity: 10 },
  { key: "artillery", label: "Artillery Battery", category: "units", costPerUnit: 150000, description: "Long-range fire support", maxQuantity: 8 },
  { key: "recon", label: "Recon Squad", category: "units", costPerUnit: 75000, description: "Scout and intelligence unit", maxQuantity: 12 },

  // Supplies
  { key: "ammo", label: "Ammunition Cache", category: "supplies", costPerUnit: 30000, description: "Field ammunition resupply", maxQuantity: 50 },
  { key: "fuel", label: "Fuel Depot", category: "supplies", costPerUnit: 25000, description: "Vehicle fuel reserves", maxQuantity: 50 },

  // Support
  { key: "medic", label: "Medical Team", category: "support", costPerUnit: 60000, description: "Field hospital unit", maxQuantity: 15 },
  { key: "engineer", label: "Engineering Corps", category: "support", costPerUnit: 80000, description: "Construction and repair", maxQuantity: 10 },

  // Logistics
  { key: "transport", label: "Transport Column", category: "logistics", costPerUnit: 70000, description: "Supply line transport", maxQuantity: 15 },
  { key: "maintenance", label: "Maintenance Crew", category: "logistics", costPerUnit: 55000, description: "Equipment repair", maxQuantity: 12 }
];
```

#### 2. Update PrecombatScreen.ts

Add comprehensive allocation UI:

```typescript
import { allocationOptions } from "../../data/unitAllocation";
import type { UIState } from "../../state/UIState";

export class PrecombatScreen {
  private totalBudget = 10000000; // $10M default
  private allocations = new Map<string, number>(); // key -> quantity

  /**
   * Initializes the unit allocation UI with all available options.
   * Renders allocation controls for units, supplies, support, and logistics.
   */
  private initializeAllocationUI(): void {
    const categories = {
      units: this.element.querySelector("#allocationUnitList"),
      supplies: this.element.querySelector("#allocationSupplyList"),
      support: this.element.querySelector("#allocationSupportList"),
      logistics: this.element.querySelector("#allocationLogisticsList")
    };

    // Render each category
    for (const [category, container] of Object.entries(categories)) {
      if (!container) continue;

      const items = allocationOptions.filter(opt => opt.category === category);
      container.innerHTML = items.map(item => this.renderAllocationItem(item)).join("");
    }

    // Bind allocation controls
    this.bindAllocationControls();
    this.updateBudgetDisplay();
  }

  /**
   * Renders a single allocation item with +/- controls.
   */
  private renderAllocationItem(option: UnitAllocationOption): string {
    const quantity = this.allocations.get(option.key) ?? 0;
    const cost = option.costPerUnit;

    return `
      <li class="allocation-item" data-key="${option.key}">
        <div class="allocation-info">
          <strong>${option.label}</strong>
          <span class="allocation-cost">$${cost.toLocaleString()} ea.</span>
        </div>
        <div class="allocation-controls">
          <button type="button" class="allocation-btn allocation-btn--minus" data-action="decrement" ${quantity === 0 ? 'disabled' : ''}>−</button>
          <span class="allocation-quantity">${quantity}</span>
          <button type="button" class="allocation-btn allocation-btn--plus" data-action="increment" ${quantity >= option.maxQuantity ? 'disabled' : ''}>+</button>
        </div>
        <div class="allocation-total">$${(quantity * cost).toLocaleString()}</div>
      </li>
    `;
  }

  /**
   * Binds click handlers to all +/- buttons.
   */
  private bindAllocationControls(): void {
    this.element.querySelectorAll(".allocation-btn").forEach(btn => {
      btn.addEventListener("click", (e) => this.handleAllocationChange(e as MouseEvent));
    });
  }

  /**
   * Handles +/- button clicks to adjust quantities.
   */
  private handleAllocationChange(event: MouseEvent): void {
    const button = event.target as HTMLButtonElement;
    const item = button.closest(".allocation-item");
    if (!item) return;

    const key = item.getAttribute("data-key");
    const action = button.getAttribute("data-action");
    if (!key || !action) return;

    const option = allocationOptions.find(opt => opt.key === key);
    if (!option) return;

    const current = this.allocations.get(key) ?? 0;
    let newQuantity = current;

    if (action === "increment" && current < option.maxQuantity) {
      newQuantity = current + 1;
    } else if (action === "decrement" && current > 0) {
      newQuantity = current - 1;
    }

    this.allocations.set(key, newQuantity);
    this.initializeAllocationUI(); // Re-render
  }

  /**
   * Updates the budget display with remaining funds.
   */
  private updateBudgetDisplay(): void {
    const spent = Array.from(this.allocations.entries()).reduce((sum, [key, qty]) => {
      const option = allocationOptions.find(opt => opt.key === key);
      return sum + (option ? option.costPerUnit * qty : 0);
    }, 0);

    const remaining = this.totalBudget - spent;
    const budgetEl = this.element.querySelector(".budget-value");
    if (budgetEl) {
      budgetEl.textContent = `$${remaining.toLocaleString()}`;
    }

    // Enable/disable proceed button based on budget
    if (this.proceedToBattleButton) {
      this.proceedToBattleButton.disabled = remaining < 0 || this.allocations.size === 0;
    }
  }

  /**
   * Handles proceeding to battle with current allocations.
   */
  private handleProceedToBattle(): void {
    // Initialize deployment state with allocations
    const deploymentState = ensureDeploymentState();

    const allocatedUnits = Array.from(this.allocations.entries())
      .filter(([_, qty]) => qty > 0)
      .map(([key, qty]) => {
        const option = allocationOptions.find(opt => opt.key === key);
        return {
          key,
          label: option?.label ?? key,
          remaining: qty
        };
      });

    deploymentState.initialize(allocatedUnits);

    // Set totals for each unit type
    for (const [key, qty] of this.allocations.entries()) {
      deploymentState.setTotalAllocatedUnits(key, qty);
    }

    // Navigate to battle screen
    this.screenManager.showScreenById("battle");
  }
}
```

#### 3. Add CSS for Allocation Items

```css
.allocation-item {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 1rem;
  align-items: center;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  margin-bottom: 0.5rem;
}

.allocation-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.allocation-cost {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.allocation-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.allocation-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-soft);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
  border-radius: 6px;
  cursor: pointer;
  font-size: 1.25rem;
  line-height: 1;
}

.allocation-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  border-color: var(--accent);
}

.allocation-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.allocation-quantity {
  min-width: 3ch;
  text-align: center;
  font-weight: 600;
}

.allocation-total {
  font-weight: 600;
  color: var(--accent);
  text-align: right;
}
```

## Implementation Steps

1. ✅ **Create `src/data/unitAllocation.ts`** with unit cost data
2. ✅ **Update `src/ui/screens/PrecombatScreen.ts`** with allocation logic
3. ✅ **Add allocation item CSS** to `index.html` styles
4. ✅ **Wire LandingScreen** to call `precombatScreen.setup(missionName, briefing)` on proceed
5. ✅ **Test allocation UI** - verify +/- buttons work and budget updates
6. ✅ **Test deployment flow** - verify allocations pass to BattleScreen

## Estimated Effort

- **Data Module**: 30 minutes
- **PrecombatScreen Logic**: 2-3 hours
- **CSS Styling**: 30 minutes
- **Integration & Testing**: 1 hour
- **Total**: ~4-5 hours

## Priority

**HIGH** - This is core gameplay functionality blocking the full user experience.

## Notes

- The current implementation has all the structure in place (HTML, CSS framework)
- The missing piece is the TypeScript logic to populate and manage the allocation UI
- Screenshots show this was working previously, so we're restoring lost functionality
- Once allocation UI is complete, the deployment state integration will work automatically

---

**Status**: Documented but not yet implemented
**Next Step**: Create unitAllocation.ts data module and update PrecombatScreen.ts
