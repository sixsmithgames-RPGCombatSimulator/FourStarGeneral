# Developer 2: UI Components & Controls Guide

<!-- STATUS: 📋 PLANNING - This guide describes outstanding UI component tasks. Many checklist items remain pending; see per-item status below. -->

## Your Mission
Build reusable UI components and map control systems.

## Files You Own
```
src/ui/components/
├── PopupManager.ts      - Popup lifecycle management
├── WarRoomOverlay.ts    - War room interactive interface
├── BattleLoadout.ts     - Unit loadout display
├── DeploymentPanel.ts   - Deployment UI panel
└── SidebarButtons.ts    - Sidebar button coordination

src/ui/controls/
├── MapViewport.ts       - Zoom/pan transformation
└── ZoomPanControls.ts   - Control button wiring
```

## Implementation Checklist

### PopupManager.ts ✅ Stubbed
- [x] Basic popup show/hide <!-- STATUS: ✅ Complete - Core show/hide implemented. -->
- [x] Sidebar button sync <!-- STATUS: ✅ Complete - Button linkage wired. -->
- [x] Escape key handling <!-- STATUS: ✅ Complete - Escape handling present. -->
- [ ] Implement getPopupContent() with real data <!-- STATUS: 🔲 Pending - Popups still use placeholder content. -->
- [ ] Wire renderArmyRoster() <!-- STATUS: 🔲 Pending - Needs real roster snapshot. -->
- [ ] Implement bindReconPopupEvents() <!-- STATUS: 🔲 Pending - Event hooks missing. -->
- [ ] Add popup content registry/data source <!-- STATUS: 🔲 Pending - Registry not formalized. -->

### WarRoomOverlay.ts ✅ Stubbed
- [x] Basic overlay structure <!-- STATUS: ✅ Complete - Overlay scaffolding exists. -->
- [x] Hotspot button generation <!-- STATUS: ✅ Complete - Buttons render. -->
- [x] Accessibility (ARIA, announcer) <!-- STATUS: ✅ Complete - Accessibility helpers present. -->
- [ ] Implement getHotspotDefinitions() with real coordinates <!-- STATUS: 🔲 Pending - Currently sample data. -->
- [ ] Wire getWarRoomData() to actual data source <!-- STATUS: 🔲 Pending - Needs real provider. -->
- [ ] Complete getWarRoomSummary() for all cases <!-- STATUS: 🔲 Pending - Summary logic incomplete. -->

### BattleLoadout.ts ✅ Stubbed
- [x] Basic rendering structure <!-- STATUS: ✅ Complete - Template renders. -->
- [ ] Wire getUnitCount() to allocation data <!-- STATUS: 🔲 Pending - Requires DeploymentState integration. -->
- [ ] Add real-time update mechanism <!-- STATUS: 🔲 Pending - Update loop absent. -->
- [ ] Implement proper escapeHtml() (currently basic) <!-- STATUS: 🔲 Pending - Sanitization upgrade required. -->

### DeploymentPanel.ts ✅ Stubbed
- [x] Basic panel structure <!-- STATUS: ✅ Complete - DOM scaffolding present. -->
- [ ] Fetch real deployment zones from scenario <!-- STATUS: 🔲 Pending - Dependent on scenario adapter. -->
- [ ] Wire to DeploymentState for unit list <!-- STATUS: 🔲 Pending - Waiting on state bridge. -->
- [ ] Implement drag-and-drop (optional) <!-- STATUS: 🔲 Pending - Enhancement not started. -->
- [ ] Add deployment validation feedback <!-- STATUS: 🔲 Pending - Feedback UI missing. -->

### SidebarButtons.ts ✅ Stubbed
- [x] Button click handling <!-- STATUS: ✅ Complete - Core interactions ready. -->
- [x] Active state sync <!-- STATUS: ✅ Complete - Active styling wired. -->
- [ ] Add tooltips (optional) <!-- STATUS: 🔲 Pending - Optional UI enhancement. -->
- [ ] Implement keyboard navigation (optional) <!-- STATUS: 🔲 Pending - Accessibility enhancement outstanding. -->

### MapViewport.ts ✅ Stubbed
- [x] Complete implementation <!-- STATUS: ✅ Complete - Functional controls delivered. -->
- [ ] Add smooth transitions (optional) <!-- STATUS: 🔲 Pending - Enhancement opportunity. -->
- [ ] Implement zoom to point (optional) <!-- STATUS: 🔲 Pending - Feature not implemented. -->

### ZoomPanControls.ts ✅ Stubbed
- [x] Complete implementation <!-- STATUS: ✅ Complete - Buttons wired. -->
- [ ] Add keyboard shortcuts (optional) <!-- STATUS: 🔲 Pending - Accessibility upgrade not started. -->
- [ ] Implement mouse wheel zoom (optional) <!-- STATUS: 🔲 Pending - Additional input handling outstanding. -->

## Dependencies You Need

### From Developer 1:
- `DeploymentState` - for BattleLoadout and DeploymentPanel
- Can mock this initially with dummy data

### From Developer 3:
- No direct dependencies
- MapViewport works independently

## Integration Points

### Connecting to Screens
Your components are instantiated in main.ts:
```typescript
const popupManager = new PopupManager();
const sidebarButtons = new SidebarButtons();
sidebarButtons.bindEvents(popupManager);
```

### Testing Your Work
Test each component independently:
```typescript
// Test PopupManager
const popup = new PopupManager();
popup.openPopup("armyRoster");
popup.closePopup();

// Test MapViewport
const viewport = new MapViewport();
viewport.adjustZoom(0.2);
console.log(viewport.getTransform()); // { zoom: 1.2, panX: 0, panY: 0 }
```

## Data Sources Needed

### War Room Data Structure
You'll need to define or fetch:
```typescript
interface WarRoomData {
  intelBriefs: IntelBrief[];
  reconReports: ReconReport[];
  supplyStatus: SupplySummary;
  // ... etc
}
```

### Popup Content Registry
Consider externalizing popup content to JSON or a data file.

## TODO Comments to Address
Search for `// TODO:` in your files to find placeholders.

## Getting Started
1. Start with MapViewport.ts & ZoomPanControls.ts (fully functional)
2. Move to SidebarButtons.ts (simple, delegates to PopupManager)
3. Implement BattleLoadout.ts (straightforward rendering)
4. Implement DeploymentPanel.ts
5. Complete PopupManager.ts (connects everything)
6. Finish WarRoomOverlay.ts (most complex)

## Styling Notes
Components use existing CSS classes from the original HTML. Make sure:
- `.sidebar-button` exists
- `.battle-popup` styling is defined
- `.war-room-hotspot` is styled

## Questions?
Check `main.ts.old` for original implementations and DOM structure.
