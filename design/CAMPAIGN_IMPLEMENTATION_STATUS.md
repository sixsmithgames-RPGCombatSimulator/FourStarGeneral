# Campaign Mode Implementation Status

## ✅ Completed

### 1. Campaign Scenario Data
**File:** `src/data/campaign01.json`
- **Scale:** 5km per hex (50x35 hex grid = 250km x 175km theater)
- **Map:** Central Channel sector for Operation Overlord
- **Forces:** Player invasion fleet + Bot defensive positions
- **Objectives:** 3 strategic objectives (beachhead, port, airfield)
- **Fronts:** 2 active front lines (Normandy coast, Eastern sector)
- **Economics:** Resource tracking for both factions

### 2. Map Integration
**Files Modified:**
- `src/main.ts` - Imports campaign01.json and renders it on app init
- Campaign screen is already registered and wired into navigation

### 3. Visual Scale
The campaign map uses the background image at 2500x1750 pixels representing a 250km theater width. The hex overlay automatically scales to cover the entire map with:
- **Hex Count:** 50 cols × 35 rows = 1,750 hexes total
- **Coverage:** Complete map coverage from edge to edge
- **Hex Scale:** Each hex = 5km edge-to-edge
- **Background:** Campaign Map -- Central Channel.png

### 4. Campaign Sprites
Strategic installations are placed using the sprite system:
- **Airbases:** Fighter/Bomber wings
- **Naval Bases:** Transport ships and invasion forces
- **Logistics Hubs:** Supply depots
- **Task Forces:** Mobile unit groups

Each tile can show up to 5 force groups with unit counts.

## 🚧 In Progress

### Time Advancement System
**Status:** ✅ Implemented (basic)
- Campaign turns represent 1 day (sidebar Day counter + Advance Day button)
- Daily resource generation from controlled tiles via `CampaignState.advanceDay()`
- Front-line progression remains TBD

### Logistics & Resource Movement
**Status:** 🟡 Basic Complete
- Adjacent-hex unit redeployment implemented via click-to-prime origin then click destination
- Force groups merge by unit type at destination; neutral tiles are captured on arrival
- Supply line mechanics and advanced allocation UI deferred

## 📋 Next Steps

### 1. Day-Based Time System (Polish)
- Optional: extract a `CampaignTurnManager` if complexity grows; current logic lives in `CampaignState`.

### 2. Implement Resource Movement
Add UI controls for:
- Drag-and-drop unit assignment
- Resource allocation sliders
- Supply convoy routing
- Air sortie planning

### 3. Front-Line Dynamics
Implement:
- Territory capture mechanics (basic capture on move-in is live)
- Front advancement/retreat
- Victory point tracking

### 4. Strategic Decisions
Player actions:
- **Redeploy:** Move forces between tiles (cost: 1 day transit time)
- **Launch Offensive:** Queue tactical battle at a front
- **Fortify:** Improve defensive positions (cost: supplies)
- **Allocate Air/Naval:** Assign wings/fleets to sectors
- **Intel Operations:** Reveal enemy positions (cost: intel points)

## Navigation

### How to Access Campaign Mode
1. **Landing Screen** → Select a general
2. **Click any operation tile** (missions are campaign-entry points)
3. **Campaign Screen** loads automatically with the strategic map

### Campaign Screen Layout
- **Left:** Strategic map with hex overlay and sprites
- **Right Sidebar:**
  - Economy summary (manpower, supplies, fuel, air/naval power)
  - Selection info (clicked hex details)
  - "Queue Engagement" button (triggers battle)

## Technical Notes

### Map Rendering Pipeline
1. `CampaignMapRenderer.render()` loads background image
2. Hex grid overlays at 5km scale using `CoordinateSystem`
3. Strategic sprites placed at tile centers
4. Force groups rendered with unit icons + counts
5. Front lines drawn as colored polylines

### Hex Coordinate System
The campaign reuses tactical hex math but at 20x scale:
- **Tactical:** 250m per hex (HEX_RADIUS = 48px)
- **Campaign:** 5km per hex (20× scale)
- **Grid:** Offset coordinates converted to axial for rendering

### Asset Paths
- **Background:** `/src/assets/campaign/Campaign Map -- Central Channel.png`
- **Sprites:** `/src/assets/campaign/[airbase|navalBase|logisticsHub|taskForce].svg`
- **Unit Icons:** Reuse tactical sprites at 34px scale

## Testing

The campaign screen can be tested by:
1. Running `npm run dev`
2. Navigating to `http://localhost:5177`
3. Selecting a general on landing screen
4. Clicking any operation to enter campaign mode
5. Map should render with full hex overlay and sprites

## Known Issues
- [ ] Front-line progression mechanics TBD
- [ ] Movement UI could be improved beyond click-to-move (e.g., drag-and-drop, path preview)

## Future Enhancements
- Weather system affecting operations
- Intel/fog of war per tile
- Dynamic front calculation based on territory
- Campaign-level AI opponent
- Multi-theater campaigns
- Historical scenario variants
