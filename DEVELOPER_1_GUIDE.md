# Developer 1: State & Screen Management Guide

<!-- STATUS: 📋 PLANNING - This guide outlines ownership and remaining implementation tasks for state & screen management. Mixed completion; see item-level status notes below. -->

## Your Mission
Implement application state management and screen navigation flow.

## Files You Own
```
src/state/
├── UIState.ts          - Global UI state (mission, general selection)
├── BattleState.ts      - Battle engine facade
└── DeploymentState.ts  - Deployment tracking

src/ui/screens/
├── ScreenManager.ts    - Screen transition logic
├── LandingScreen.ts    - Mission/general selection
├── PrecombatScreen.ts  - Unit allocation
└── BattleScreen.ts     - Battle gameplay
```

## Implementation Checklist

### UIState.ts ✅ Stubbed
- [x] localStorage integration for general selection <!-- STATUS: ✅ Complete - Implemented per `IMPLEMENTATION_STATUS.md`. -->
- [ ] Add mission titles/briefings data <!-- STATUS: 🔲 Pending - Mission helpers exist but require verification against latest UIState. -->
- [ ] Implement validation logic <!-- STATUS: 🔲 Pending - Validation guidance remains outstanding despite partial helpers. -->
- [ ] Add event emitters for state changes (optional) <!-- STATUS: 🔲 Pending - Optional enhancement not started. -->

### BattleState.ts ✅ Stubbed
- [x] GameEngine instance management <!-- STATUS: ✅ Complete - Current build manages engine instance. -->
- [ ] Wire to actual GameEngine initialization <!-- STATUS: 🔲 Pending - Further integration needed for finalized engine setup. -->
- [ ] Implement supply report handling <!-- STATUS: 🔲 Pending - Supply reporting not yet implemented. -->
- [ ] Add save/load hooks <!-- STATUS: 🔲 Pending - Persistence hooks outstanding. -->

### DeploymentState.ts ✅ Stubbed
- [x] Basic pool tracking structure <!-- STATUS: ✅ Complete - Structure exists in current codebase. -->
- [ ] Wire to actual allocation data source <!-- STATUS: 🔲 Pending - Awaiting `TODO_precombat_data_module.md`. -->
- [ ] Implement getUnitCount() properly <!-- STATUS: 🔲 Pending - Placeholder logic remains. -->
- [ ] Add deployment validation <!-- STATUS: 🔲 Pending - Validation logic not wired. -->

### ScreenManager.ts ✅ Stubbed
- [x] Basic screen show/hide logic <!-- STATUS: ✅ Complete - Functional per existing screens. -->
- [ ] Add screen transition animations (optional) <!-- STATUS: 🔲 Pending - Enhancement not developed. -->
- [ ] Implement history/back navigation (optional) <!-- STATUS: 🔲 Pending - Optional feature not started. -->

### LandingScreen.ts ✅ Stubbed
- [x] DOM element caching <!-- STATUS: ✅ Complete - Structure present. -->
- [x] Event handler structure <!-- STATUS: ✅ Complete - Handlers scaffolded. -->
- [ ] Implement commissionGeneralFromForm() <!-- STATUS: 🔲 Pending - Business logic missing. -->
- [ ] Wire roster import/export to actual data <!-- STATUS: 🔲 Pending - Still tied to placeholders. -->
- [ ] Add general profile rendering <!-- STATUS: 🔲 Pending - Rendering hooks not implemented. -->
- [ ] Implement mission briefing display <!-- STATUS: 🔲 Pending - UI still placeholder. -->

### PrecombatScreen.ts ✅ Stubbed
- [x] Basic screen structure <!-- STATUS: ✅ Complete - Screen scaffolding exists. -->
- [ ] Implement initializeAllocationUI() <!-- STATUS: 🔲 Pending - Allocation UI absent. -->
- [ ] Add unit allocation logic <!-- STATUS: 🔲 Pending - Logic not wired. -->
- [ ] Wire to DeploymentState <!-- STATUS: 🔲 Pending - Bridge outstanding. -->
- [ ] Implement validation warnings <!-- STATUS: 🔲 Pending - Validation UX missing. -->

### BattleScreen.ts ✅ Stubbed
- [x] Basic battle controls <!-- STATUS: ✅ Complete - Core controls exist. -->
- [ ] Wire to BattleState properly <!-- STATUS: 🔲 Pending - Requires battle sync project. -->
- [ ] Implement base camp assignment UI <!-- STATUS: 🔲 Pending - UI hooks not finalized. -->
- [ ] Add turn summary display <!-- STATUS: 🔲 Pending - Feature not yet built. -->
- [ ] Implement mission completion flow <!-- STATUS: 🔲 Pending - Completion UX outstanding. -->

## Dependencies You Need

### From Developer 2:
- `PopupManager` - Already imported, interface defined
- You can start without waiting for full implementation

### From Developer 3:
- Map rendering will be wired by you in BattleScreen
- HexMapRenderer interface is defined

## Integration Points

### main.ts
You'll need to coordinate with final integration:
```typescript
const landingScreen = new LandingScreen(screenManager, uiState);
landingScreen.initialize();
```

### Testing Your Work
Each screen can be tested independently:
```typescript
// Test UIState
const state = new UIState();
state.selectedMission = "campaign";
console.log(state.canProceedToPrecombat()); // false (no general)

// Test ScreenManager
const manager = new ScreenManager();
const element = document.getElementById("landingScreen");
manager.showScreen(element);
```

## TODO Comments to Address
Search for `// TODO:` in your files to find placeholders that need implementation.

## Getting Started
1. Start with UIState.ts (simplest, no dependencies)
2. Move to ScreenManager.ts (simple, used by all screens)
3. Implement LandingScreen.ts (most complex UI logic)
4. Implement PrecombatScreen.ts
5. Implement BattleScreen.ts
6. Wire state management between screens

## Questions?
Check the original `main.ts.old` for reference implementations.
