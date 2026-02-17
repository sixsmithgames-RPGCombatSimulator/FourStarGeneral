# Campaign Hex Grid Solution

## Problem Statement

The campaign map uses a rectangular background image (1024×768 pixels) representing a geographic theater, but the odd-q hex coordinate system creates a **parallelogram-shaped grid** that cannot naturally cover a rectangular area.

## Root Cause Analysis

### The Parallelogram Problem

In odd-q offset coordinates, hexes are positioned using this formula:
```
Offset to Axial: q = col, r = row - floor(col/2)
Axial to Pixel:   x = HEX_WIDTH * (q + r/2), y = HEX_RADIUS * 1.5 * r
```

For a 78×48 grid, the four corners map to:
- **Top-Left (0,0)**: pixel (0, 0)
- **Top-Right (77,0)**: pixel (4822, -2736) ← **Negative Y!**
- **Bottom-Left (0,47)**: pixel (1954, 3384)
- **Bottom-Right (77,47)**: pixel (6776, 648)

This creates a **parallelogram** with dimensions ~6776×6120 pixels that must be fit into a 1024×768 rectangle.

### Failed Approaches

1. **Density-only scaling**: Hexes became too small (5px) due to excessive downscaling
2. **Limited padding**: Left corners uncovered
3. **Centering the grid**: Positioned (0,0) in the middle instead of upper-left

## Solution

### Three-Part Fix

#### 1. Render Padding Hexes Outside Official Range

To cover all corners of the rectangular map, render hexes with coordinates outside the official 0-77, 0-47 range:

```typescript
const padding = Math.max(cols, rows); // 78 hexes of padding
const rowStart = -padding;  // -78
const rowEnd = rows + padding;  // 48 + 78 = 126
const colStart = -padding;  // -78
const colEnd = cols + padding;  // 77 + 78 = 155
```

This creates a large grid that extends beyond the official coordinates to fill corner gaps.

#### 2. Clip to Map Pixel Bounds

Only render hexes whose centers fall within the map's pixel bounds:

```typescript
const margin = HEX_RADIUS * density * 1.5;
if (cx >= targetMinX - margin && cx <= targetMaxX + margin &&
    cy >= targetMinY - margin && cy <= targetMaxY + margin) {
  // Render this hex
}
```

This ensures full rectangular coverage without rendering thousands of unnecessary hexes.

#### 3. Calculate Proper Density

Account for the parallelogram's bounding box, not just the grid dimensions:

```typescript
// Check all 4 corners to find true bounds
const corners = [
  CoordinateSystem.offsetToAxial(0, 0),
  CoordinateSystem.offsetToAxial(cols - 1, 0),     // Has negative r!
  CoordinateSystem.offsetToAxial(0, rows - 1),
  CoordinateSystem.offsetToAxial(cols - 1, rows - 1)
];

// Find min/max x,y across all corners
// Calculate density = min(mapWidth/gridWidth, mapHeight/gridHeight)
```

### Key Implementation Details

- **Official hexes**: 0-77 cols, 0-47 rows (used for gameplay/bases)
- **Padding hexes**: Extended range for visual coverage only
- **CSS class**: `campaign-hex-padding` marks non-official hexes
- **Coordinate system**: Hex (0,0) positioned at upper-left of map
- **Final density**: ~0.15 to fit the parallelogram's bounding box into 1024×768

## Benefits

1. **Full coverage**: Entire rectangular map covered edge-to-edge
2. **Valid coordinates**: Official gameplay area (0-77, 0-47) is intact
3. **Proper scaling**: Hexes are appropriately sized for the 5km-per-hex scale
4. **Performance**: Only renders hexes within visible bounds

## Files Modified

- `src/rendering/CampaignMapRenderer.ts`: Grid rendering logic
- `src/data/campaign/sampleScenario.ts`: Base coordinates aligned to terrain
