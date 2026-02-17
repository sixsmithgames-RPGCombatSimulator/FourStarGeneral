# Developer 3: Map Rendering & Hex System Guide

<!-- STATUS: 📋 PLANNING - Rendering modules largely complete; remaining enhancement items for `HexMapRenderer` are pending. See checklist statuses below. -->

## Your Mission
Build the hex map rendering engine and coordinate system utilities.

## Files You Own
```
src/rendering/
├── CoordinateSystem.ts      - Coordinate conversions
├── TerrainRenderer.ts       - Terrain colors & sprites
├── RoadOverlayRenderer.ts   - Road overlay generation
└── HexMapRenderer.ts        - Main map renderer
```

## Implementation Checklist

### CoordinateSystem.ts ✅ Complete
- [x] offsetToAxial conversion <!-- STATUS: ✅ Complete - Verified implementation. -->
- [x] axialToOffset conversion <!-- STATUS: ✅ Complete - Verified implementation. -->
- [x] axialToPixel conversion <!-- STATUS: ✅ Complete. -->
- [x] hexPoints generation <!-- STATUS: ✅ Complete. -->
- [x] Key parsing/generation <!-- STATUS: ✅ Complete. -->
- [x] Tile resolution <!-- STATUS: ✅ Complete. -->
- No TODOs - fully implemented!

### TerrainRenderer.ts ✅ Complete
- [x] Terrain palette <!-- STATUS: ✅ Complete. -->
- [x] Sprite mapping <!-- STATUS: ✅ Complete. -->
- [x] Tooltip generation <!-- STATUS: ✅ Complete. -->
- [x] Label abbreviation <!-- STATUS: ✅ Complete. -->
- No TODOs - fully implemented!

### RoadOverlayRenderer.ts ✅ Complete
- [x] Road detection <!-- STATUS: ✅ Complete. -->
- [x] Neighbor-aware rendering <!-- STATUS: ✅ Complete. -->
- [x] Paved vs dirt roads <!-- STATUS: ✅ Complete. -->
- [x] SVG path generation <!-- STATUS: ✅ Complete. -->
- No TODOs - fully implemented!

### HexMapRenderer.ts ✅ Stubbed
- [x] Basic rendering structure <!-- STATUS: ✅ Complete - Core rendering delivered. -->
- [x] Bounds calculation <!-- STATUS: ✅ Complete. -->
- [x] SVG generation <!-- STATUS: ✅ Complete. -->
- [x] Element caching <!-- STATUS: ✅ Complete. -->
- [ ] Add recon overlay system (resetReconOverlayState, etc.) <!-- STATUS: 🔲 Pending - Recon overlay TODO outstanding. -->
- [ ] Implement applyReconOverlayClasses() <!-- STATUS: 🔲 Pending - Overlay styling method not built. -->
- [ ] Add unit rendering on hexes <!-- STATUS: 🔲 Pending - Sprite injection required. -->
- [ ] Implement hex click handlers <!-- STATUS: 🔲 Pending - Interaction wiring not complete. -->

## Your Code is Actually Complete!

All four modules are functional and type-safe. The main work remaining is:

### HexMapRenderer Enhancements
1. **Recon Overlay System**
   - Track hex visibility states
   - Apply CSS classes for fog of war
   - Update visibility as units move

2. **Unit Rendering**
   - Add unit icons/sprites to hex cells
   - Cache unit image references
   - Update unit positions dynamically

3. **Interactive Features**
   - Click handlers for hex selection
   - Hover effects
   - Highlight valid move destinations

## Dependencies You Need

### From Developer 1:
- BattleScreen will call your HexMapRenderer
- You provide the `IMapRenderer` interface (already defined)

### From Developer 2:
- MapViewport will apply transforms to your rendered SVG
- Your SVG is the target element

## Integration Points

### Used by BattleScreen
```typescript
const renderer = new HexMapRenderer();
renderer.render(svg, canvas, scenarioData);
renderer.initialize();
```

### Working with MapViewport
```typescript
const viewport = new MapViewport("#battleHexMap");
// Viewport will apply transforms to your rendered map
```

## Testing Your Work

### Test Coordinate System
```typescript
// Test conversions
const axial = CoordinateSystem.offsetToAxial(5, 3);
console.log(axial); // { q: 4, r: 3 }

const pixel = CoordinateSystem.axialToPixel(axial.q, axial.r);
console.log(pixel); // { x: 96, y: ...}

const key = CoordinateSystem.makeHexKey(5, 3);
console.log(key); // "5,3"
```

### Test Terrain Rendering
```typescript
const terrain = new TerrainRenderer();
const color = terrain.getTerrainFill("plains", "grass");
console.log(color); // "#4f7a3a"

const sprite = terrain.getTerrainSprite({
  terrain: "forest",
  terrainType: "grass",
  features: [],
  density: "dense",
  recon: "firsthand"
});
console.log(sprite); // "/sprites/forest.jpg"
```

### Test Road Rendering
```typescript
const roadRenderer = new RoadOverlayRenderer();
const hasRoad = roadRenderer.hasRoad(someTile);

// Generate road overlay SVG
const roadSvg = roadRenderer.drawRoadOverlay(
  cx, cy, tile, col, row, tiles, palette
);
```

### Test Full Map Rendering
```typescript
const renderer = new HexMapRenderer();
const svg = document.querySelector("#battleHexMap");
const canvas = document.querySelector("#battleMapCanvas");

renderer.render(svg, canvas, scenarioData);
// Map should appear!
```

## Sprite Assets

Make sure these sprite images exist:
```
/sprites/
├── water.jpg    (sea)
├── sand.jpg     (beach)
├── grass.jpg    (plains)
├── forest.jpg   (forest)
├── hill.jpg     (hill)
├── mountain.jpg (mountain)
└── urban.jpg    (city)
```

If sprites are missing, the system falls back to solid colors.

## Performance Optimization

Your rendering is already efficient, but consider:
1. **Virtualization** - Only render visible hexes for large maps
2. **Caching** - Reuse SVG fragments when possible
3. **Debouncing** - Throttle re-renders on viewport changes

## Recon Overlay System (TODO)

Add to HexMapRenderer:
```typescript
private reconOverlayState = new Map<string, ReconStatusKey>();

resetReconOverlayState(): void {
  this.reconOverlayState.clear();
}

trackHexReconStatus(key: string, status: ReconStatusKey): void {
  this.reconOverlayState.set(key, status);
}

applyReconOverlayClasses(): void {
  this.reconOverlayState.forEach((status, key) => {
    const element = this.hexElementMap.get(key);
    if (element) {
      element.classList.add(`recon-${status}`);
    }
  });
}
```

## Unit Rendering (TODO)

Add unit icons to hex cells:
```typescript
renderUnit(hexKey: string, unitType: string, faction: string): void {
  const cell = this.hexElementMap.get(hexKey);
  if (!cell) return;

  const image = document.createElementNS(SVG_NS, "image");
  image.setAttribute("href", `/units/${unitType}.svg`);
  image.classList.add("unit-icon", `faction-${faction}`);

  // Position at hex center
  const cx = cell.dataset.cx;
  const cy = cell.dataset.cy;
  image.setAttribute("x", String(Number(cx) - 20));
  image.setAttribute("y", String(Number(cy) - 20));
  image.setAttribute("width", "40");
  image.setAttribute("height", "40");

  cell.appendChild(image);
  this.hexUnitImageMap.set(hexKey, image);
}
```

## Getting Started

1. Your core rendering is done! Test it.
2. Add recon overlay system to HexMapRenderer
3. Implement unit rendering
4. Add click/hover handlers
5. Optimize performance if needed

## Questions?
Check `main.ts.old` lines 596-882 for original hex rendering implementation.
