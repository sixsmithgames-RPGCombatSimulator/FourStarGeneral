# Campaign Logistics & Transport System

## Overview
The campaign map operates at 5km per hex scale across multi-day timescales. Forces must traverse significant distances, requiring commanders to balance speed, cost, and resource availability. This document defines transport modes, resource consumption, capacity constraints, and UI workflows for realistic strategic movement.

## Design Goals
- **Realism:** Different unit types travel at historically plausible speeds using appropriate transport methods.
- **Resource Management:** Each transport mode consumes fuel, supplies, and potentially manpower, forcing strategic trade-offs.
- **Capacity Constraints:** Limited transport assets (trucks, ships, aircraft) prevent unlimited rapid deployment.
- **Player Agency:** Clear UI controls allow commanders to select transport modes and see cost/time trade-offs before committing.

## Transport Modes

### 1. On Foot (March)
**Applicable Units:** Infantry, AT Infantry, Engineers, all foot-mobile forces
**Speed:** 1 hex/day (5 km/day) → 2.0 days per 10km
**Requirements:** None
**Constraints:**
- Any terrain type
- Any distance
- Limited by unit's march endurance

**Resource Costs per Unit per Hex:**
- Supplies: 0.5 (rations, water)
- Fuel: 0 (no vehicles)
- Manpower Risk: 0 (minimal attrition from marching)

**Use Case:** Short-range infantry repositioning, economical but slow.

---

### 2. Truck Transport (Motorized)
**Applicable Units:** Infantry, AT Infantry, Engineers, Artillery (towed), Supplies
**Speed:** 5 hexes/day (25 km/day) → 0.4 days per 10km
**Requirements:** Available truck capacity at origin
**Constraints:**
- Origin must have truck pool available
- Trucks are consumed during transit (travel with the force)
- Cannot traverse water hexes
- Road networks improve efficiency (future enhancement)

**Resource Costs per Unit per Hex:**
- Supplies: 0.3 (reduced rations, quicker transit)
- Fuel: 2.0 (trucks consume significant fuel)
- Manpower Risk: 0
- **Truck Capacity:** 1 truck per 100 infantry or 1 truck per artillery piece

**Use Case:** Rapid ground reinforcement, relocating artillery, supplying distant fronts.

---

### 3. Naval Transport (Sea Lift)
**Applicable Units:** Infantry, Artillery, Tanks, Supplies (any ground unit)
**Speed:** 6 hexes/day (30 km/day) for Transport Ships → 0.33 days per 10km
**Requirements:**
- Origin must be a naval base or coastal hex
- Destination must be a naval base or coastal hex
- Available ship capacity

**Constraints:**
- Both origin and destination must have naval access
- Ships can be intercepted (future: naval combat events)
- Weather delays possible (future enhancement)

**Resource Costs per Unit per Hex:**
- Supplies: 1.0 (loading, unloading, provisions)
- Fuel: 3.0 (ships are fuel-intensive)
- Manpower Risk: 0.1 (potential losses from submarine/air attacks)
- **Ship Capacity:** 1 transport ship carries 500 infantry or 50 tanks

**Use Case:** Amphibious operations, crossing large water barriers, strategic redeployment across theater.

---

### 4. Air Transport (Airlift)
**Applicable Units:** Infantry, Paratroopers (specialized infantry only, no heavy equipment)
**Speed:** 45 hexes/day (225 km/day) using transport aircraft → 0.04 days per 10km
**Requirements:**
- Origin must be an airbase with transport aircraft
- Destination must be an airbase OR drop zone (paratroopers)
- Available aircraft capacity

**Constraints:**
- Very limited capacity (high-value, emergency use)
- Expensive in fuel
- Risk of interception by enemy fighters
- Cannot transport heavy equipment (artillery, tanks)
- Weather-dependent

**Resource Costs per Unit per Hex:**
- Supplies: 0.5 (quick transit, minimal provisions needed)
- Fuel: 8.0 (aircraft are extremely fuel-intensive)
- Manpower Risk: 0.2 (potential losses from interception, accidents)
- **Aircraft Capacity:** 1 transport plane carries 40 paratroopers

**Use Case:** Emergency reinforcements, seizing distant objectives, bypassing enemy lines.

---

### 5. Self-Propelled (Tracked/Wheeled)
**Applicable Units:** Tanks, Tank Destroyers, Self-Propelled Artillery, APCs, Recon Vehicles
**Speed:** 2-3 hexes/day (10-15 km/day) depending on vehicle type → 0.67-1.0 days per 10km
**Requirements:** None (units move under own power)
**Constraints:**
- Cannot traverse water without engineer support
- Fuel-intensive
- Mechanical breakdowns increase with distance (future: reliability checks)

**Resource Costs per Unit per Hex:**
- Supplies: 1.0 (maintenance, crew provisions)
- Fuel: 4.0 (tanks are fuel-hungry)
- Manpower Risk: 0.05 (breakdowns, minor accidents)

**Use Case:** Armor spearheads, mechanized offensives, self-deploying heavy forces.

---

## Transport Capacity System

### Capacity Pools
Each faction tracks available transport assets:

```typescript
type TransportCapacity = {
  trucks: number;           // Available trucks for motorized transport
  transportShips: number;   // Transport ships for naval lift
  transportPlanes: number;  // Transport aircraft for airlift
};
```

### Capacity Consumption
When scheduling a redeployment:
1. Calculate required capacity based on unit counts and transport mode
2. Check if faction has sufficient available capacity
3. Reserve capacity for the duration of the transit
4. Release capacity when units arrive (trucks/ships/planes return to pool)

### Capacity Regeneration
- **Trucks:** Return to origin base after delivery (transit time × 2 for round trip)
- **Ships:** Return to nearest naval base after unloading
- **Planes:** Return to origin airbase immediately after drop
- **Losses:** Random events, enemy action, or attrition can permanently reduce capacity

---

## Resource Cost Formula

For a redeployment of **N units** traveling **D hexes** using transport mode **M**:

```
Supplies Cost = N × D × M.suppliesCostPerUnitPerHex
Fuel Cost = N × D × M.fuelCostPerUnitPerHex
Manpower Loss = N × D × M.manpowerRiskPerUnitPerHex (applied probabilistically)
Capacity Required = ceil(N / M.capacityPerVehicle)
```

### Example Calculation
Moving **200 infantry** across **10 hexes** by **truck**:
- Supplies: 200 × 10 × 0.3 = 600
- Fuel: 200 × 10 × 2.0 = 4,000
- Trucks needed: ceil(200 / 100) = 2 trucks
- Time: 10 hexes ÷ 5 hexes/day = 2 days

---

## UI Workflow

### Redeployment Screen Enhancement
When the player selects a redeployment:

1. **Origin Selection:** Click origin hex (must be player-controlled with forces)
2. **Destination Selection:** Click destination hex
3. **Force Selection:** Choose which units to move (existing UI)
4. **Transport Mode Selection (NEW):**
   - Dropdown or radio buttons showing available modes
   - Each mode displays:
     - Speed (hexes/day and estimated ETA)
     - Resource costs (supplies, fuel, manpower risk)
     - Capacity required and available
     - Restrictions (e.g., "Naval bases only", "Infantry only")
   - Grayed-out modes that don't meet requirements
5. **Confirmation:** Review total cost and click "Schedule Redeployment"

### Transport Mode Display
```
┌─ Select Transport Mode ──────────────────────────┐
│ ○ On Foot                                        │
│   Speed: 1 hex/day | ETA: 10 days               │
│   Cost: 1,000 supplies | 0 fuel                 │
│   ✓ Available for all infantry                  │
│                                                  │
│ ● Truck Transport                                │
│   Speed: 5 hex/day | ETA: 2 days                │
│   Cost: 600 supplies | 4,000 fuel | 2 trucks    │
│   ✓ 2 trucks available                          │
│                                                  │
│ ○ Naval Transport                                │
│   Speed: 6 hex/day | ETA: 1.7 days              │
│   Cost: 2,000 supplies | 6,000 fuel             │
│   ✗ Destination is not a naval base             │
│                                                  │
│ ○ Air Transport                                  │
│   Speed: 45 hex/day | ETA: 0.2 days             │
│   Cost: 1,000 supplies | 16,000 fuel            │
│   ✗ No transport aircraft available             │
└──────────────────────────────────────────────────┘
```

---

## Implementation Details

### Data Structures

#### Transport Mode Definition
```typescript
type TransportMode = {
  key: string;                    // "foot" | "truck" | "naval" | "air" | "selfPropelled"
  label: string;                  // "On Foot", "Truck Transport", etc.
  speedHexPerDay: number;         // Base movement speed
  suppliesCostPerUnitPerHex: number;
  fuelCostPerUnitPerHex: number;
  manpowerRiskPerUnitPerHex: number;
  capacityType?: "trucks" | "transportShips" | "transportPlanes";
  capacityPerVehicle?: number;    // Units per truck/ship/plane
  applicableUnitTypes: string[];  // Which units can use this mode
  requiresNavalBase?: boolean;    // Origin/dest must be naval
  requiresAirbase?: boolean;      // Origin/dest must be airbase
};
```

#### Campaign Economy Extension
```typescript
type CampaignEconomy = {
  faction: string;
  supplies: number;
  fuel: number;
  manpower: number;
  // NEW: Transport capacity
  transportCapacity: {
    trucks: number;
    trucksInTransit: number;          // Currently deployed
    transportShips: number;
    transportShipsInTransit: number;
    transportPlanes: number;
    transportPlanesInTransit: number;
  };
};
```

#### Redeployment Decision Extension
```typescript
type RedeployDecision = {
  // ... existing fields
  transportMode: string;            // NEW: selected transport mode key
  capacityReserved?: {              // NEW: reserved transport assets
    type: "trucks" | "transportShips" | "transportPlanes";
    count: number;
  };
  returnEtaDay?: number;            // NEW: when transport returns to pool
};
```

---

## Base Transport Capacity

Initial transport pools by faction (campaign start):

**Player:**
- Trucks: 50 (can transport 5,000 infantry or 50 artillery pieces simultaneously)
- Transport Ships: 10 (can lift 5,000 infantry or 500 tanks)
- Transport Planes: 5 (can airlift 200 paratroopers)

**Bot (Axis):**
- Trucks: 60 (slightly more motorized)
- Transport Ships: 8 (less naval lift capacity)
- Transport Planes: 3 (limited airlift)

Transport capacity grows through:
- Capturing logistics hubs (+5 trucks per hub)
- Capturing naval bases (+2 transport ships per base)
- Capturing airbases (+1 transport plane per base)

---

## Special Cases

### Mixed Unit Redeployments
When moving multiple unit types:
- Calculate costs separately for each type
- Use the slowest compatible transport mode
- Player can split redeployment into multiple transports if desired

### Combat Interruption
If enemy forces intercept a redeployment in transit:
- Generate a "convoy defense" engagement
- Player outcome determines losses
- Surviving units continue to destination or return to origin

### Emergency Airlift
Special high-priority redeployment:
- Costs 2× normal fuel
- Ignores aircraft capacity (simulate requisitioning all available planes)
- Use for critical reinforcements only

---

## Balancing Philosophy

**Speed vs. Cost Trade-off:**
- Foot: Slowest, cheapest, always available
- Truck: Medium speed, moderate cost, capacity-limited
- Naval: Good speed, expensive, route-restricted
- Air: Fastest, very expensive, heavily restricted

**Strategic Depth:**
- Players must plan redeployments days in advance
- Running out of fuel/trucks/ships creates operational crises
- Capturing logistics infrastructure is a strategic objective
- Overextension (long supply lines) is punished by high costs

**UI Clarity:**
- Always show "can't afford this" warnings before scheduling
- Display ETA and total cost prominently
- Highlight transport bottlenecks (e.g., "only 2 trucks available, need 5")

---

## Future Enhancements

### Phase 2
- Road networks: Trucks move faster on road hexes
- Weather effects: Storms delay naval/air transport
- Reliability checks: Mechanical breakdowns for long-distance armor moves
- Supply lines: Continuous supply flow rather than one-time deliveries

### Phase 3
- Convoy combat: Intercept enemy redeployments
- Partisan attacks: Random events damage transports in enemy territory
- Port/airbase capacity: Limit simultaneous operations
- Transport doctrine: Faction-specific bonuses (e.g., Allies get better naval lift)

---

## Testing Scenarios

1. **Infantry Rush:** Move 500 infantry 20 hexes by foot vs. truck (compare ETA and cost)
2. **Amphibious Operation:** Naval transport 1,000 infantry + 20 tanks to beachhead
3. **Emergency Airlift:** Fly 100 paratroopers 50 hexes to threatened sector
4. **Capacity Shortage:** Try to deploy forces when out of trucks (should fail gracefully)
5. **Mixed Force:** Move combined arms group (infantry + artillery + tanks) and verify costs

---

## Implementation Checklist

- [ ] Define `TransportMode` type and constants
- [ ] Extend `CampaignEconomy` with `transportCapacity` field
- [ ] Update `campaign01.json` with initial transport pools
- [ ] Add transport mode parameter to `scheduleRedeploy()` function
- [ ] Implement transport cost calculations
- [ ] Implement capacity reservation and release logic
- [ ] Add transport mode validation (naval bases, airbases, unit type compatibility)
- [ ] Update UI with transport mode selection dropdown
- [ ] Display cost breakdown and ETA per mode
- [ ] Disable invalid transport modes in UI
- [ ] Add unit tests for transport calculations
- [ ] Document example redeployments in design notes
