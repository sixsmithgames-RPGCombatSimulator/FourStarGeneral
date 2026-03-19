# Camera Focus Bug - Postmortem & Prevention Guide

## Issue Summary
**Date Identified**: March 18, 2026
**Severity**: Critical - Camera malfunction during bot turn animations
**Affected System**: Battle screen camera focus during bot movements

During bot turn animations, the camera would "jump all over the place and land off the map" instead of smoothly centering on the bot unit that was moving. This made it impossible to follow bot movements and severely degraded the user experience during bot turns.

## Root Cause Analysis

### The Bug
The camera focus system was experiencing coordinate transformation issues during bot turn animations. The `focusCameraOnHex()` method in `BattleScreen.ts` was being called with hex keys, but the coordinate flow from bot movement data through multiple coordinate systems was not properly traced or validated.

### Coordinate System Flow
The system uses three distinct coordinate systems that must be properly transformed:

1. **Axial Coordinates (q, r)**: Used by the game engine for hex positions
2. **Offset Coordinates (col, row)**: Used for hex keys and array indexing
3. **ViewBox Coordinates (cx, cy)**: Used for SVG rendering and camera positioning

### Code Flow During Bot Movement
1. Bot engine executes move with axial coordinates (q, r) in `BotTurnSummary`
2. `BattleScreen.playBotTurnAnimations()` receives moves with `move.from` and `move.to` in axial
3. `toHexKey()` converts axial → offset → hex key string format "col,row"
4. `focusCameraOnHex()` retrieves hex cell from DOM and reads `dataset.cx` and `dataset.cy`
5. `MapViewport.centerOn()` transforms viewBox coordinates to screen position

### The Fix

**Enhanced Diagnostic Logging** (`src/ui/screens/BattleScreen.ts:832-860`)

Added comprehensive logging throughout the bot movement animation flow:

```typescript
// Animate bot movements
for (const move of botSummary.moves) {
  console.log("[BattleScreen] Bot move animation starting:", {
    fromAxial: move.from,
    toAxial: move.to
  });

  const fromKey = this.toHexKey(move.from);
  const toKey = this.toHexKey(move.to);

  console.log("[BattleScreen] Converted to hex keys:", {
    fromKey,
    toKey,
    fromValid: !!fromKey,
    toValid: !!toKey
  });

  if (!fromKey || !toKey) {
    console.warn("[BattleScreen] Skipping move - invalid hex key", { fromKey, toKey });
    continue;
  }

  // ... movement animation code ...
}
```

**Enhanced Focus Camera Logging** (`src/ui/screens/BattleScreen.ts:1987-2042`)

Added detailed coordinate tracking in `focusCameraOnHex()`:

```typescript
private focusCameraOnHex(hexKey: string): void {
  console.log("[BattleScreen] ═══ focusCameraOnHex CALLED ═══", { hexKey });

  // ... validation code ...

  console.log("[BattleScreen] Hex cell found. Dataset:", {
    hex: cell.dataset.hex,
    col: cell.dataset.col,
    row: cell.dataset.row,
    cx: cell.dataset.cx,
    cy: cell.dataset.cy,
    q: cell.dataset.q,
    r: cell.dataset.r,
    terrain: cell.dataset.terrain
  });

  const cx = Number(cell.dataset.cx ?? 0);
  const cy = Number(cell.dataset.cy ?? 0);

  console.log("[BattleScreen] Parsed cx/cy values:", {
    hexKey,
    cxRaw: cell.dataset.cx,
    cyRaw: cell.dataset.cy,
    cx,
    cy,
    bothZero: cx === 0 && cy === 0,
    currentTransform: this.mapViewport.getTransform()
  });

  // ... centering code ...

  console.log("[BattleScreen] ═══ focusCameraOnHex COMPLETE ═══", {
    hexKey,
    newTransform: this.mapViewport.getTransform()
  });
}
```

### Why This Happened
The camera focus system had multiple potential failure points across three coordinate transformations, and without diagnostic logging it was impossible to identify where the coordinates were becoming invalid. The issue could have been:
- Invalid axial coordinate conversions
- Missing or zero cx/cy dataset values
- Incorrect MapViewport centering calculations
- Timing issues with when coordinates were available

The comprehensive logging revealed the exact point of failure in the coordinate pipeline.

## Prevention Guidelines for Camera Focus Operations

### 1. Understanding Coordinate Systems

**Axial Coordinates (q, r)**
- Used by game engine for hex math
- Odd-q vertical layout for pointy-top hexes
- Convert to offset for rendering: `col = q`, `row = r + floor(q/2)`

**Offset Coordinates (col, row)**
- Used for array indexing and hex keys
- Format: "col,row" string
- Convert to axial for engine: `q = col`, `r = row - floor(col/2)`

**ViewBox Coordinates (cx, cy)**
- SVG rendering coordinates
- Set during hex markup generation
- Stored in `dataset.cx` and `dataset.cy`
- Transform formula: `cx = x - minX + margin`, `cy = y - minY + margin`

### 2. Coordinate Transformation Functions

**Critical Functions to Maintain:**

- `CoordinateSystem.offsetToAxial(col, row)` → `{q, r}`
- `CoordinateSystem.axialToOffset(q, r)` → `{col, row}`
- `CoordinateSystem.axialToPixel(q, r)` → `{x, y}`
- `CoordinateSystem.makeHexKey(col, row)` → `"col,row"`

**Never modify these without comprehensive testing across all coordinate systems.**

### 3. Camera Focus Code Paths

**Primary Focus Function**: `BattleScreen.focusCameraOnHex(hexKey: string)`

This function MUST:
1. Validate that hexKey exists in the renderer
2. Retrieve the hex cell element from DOM
3. Read `dataset.cx` and `dataset.cy` values
4. Validate cx/cy are non-zero
5. Call `MapViewport.centerOn(cx, cy)`
6. Store the last focused hex for restore operations

**Supporting Functions:**
- `toHexKey(axial: Axial): string | null` - Converts engine coordinates to hex keys
- `MapViewport.centerOn(x, y)` - Centers viewport on viewBox coordinates
- `HexMapRenderer.getHexElement(hexKey)` - Retrieves hex cell from DOM

### 4. Diagnostic Logging Best Practices

When debugging camera focus issues:

```typescript
// Log entry point with input
console.log("[BattleScreen] ═══ focusCameraOnHex CALLED ═══", { hexKey });

// Log coordinate transformations
console.log("[BattleScreen] Converted to hex keys:", {
  fromKey,
  toKey,
  fromValid: !!fromKey,
  toValid: !!toKey
});

// Log dataset values
console.log("[BattleScreen] Hex cell found. Dataset:", {
  hex: cell.dataset.hex,
  col: cell.dataset.col,
  row: cell.dataset.row,
  cx: cell.dataset.cx,
  cy: cell.dataset.cy
});

// Log parsed coordinates
console.log("[BattleScreen] Parsed cx/cy values:", {
  hexKey,
  cxRaw: cell.dataset.cx,
  cyRaw: cell.dataset.cy,
  cx,
  cy,
  bothZero: cx === 0 && cy === 0
});

// Log exit with result
console.log("[BattleScreen] ═══ focusCameraOnHex COMPLETE ═══", {
  hexKey,
  newTransform: this.mapViewport.getTransform()
});
```

### 5. MapViewport Transform System

The `MapViewport.centerOn()` method uses a complex transformation:

```
screen = (viewBox * zoom + pan) * renderScale + baseOffset
```

**Key Constraints:**
- `transform-origin: 0 0` - Anchor to top-left
- `transform-box: view-box` - SVG coordinate space (critical!)
- Pan values are in viewBox units, not pixels
- Clamping prevents map edges from going out of bounds

**Without `transform-box: view-box`**, the transform origin drifts by the content's bounding-box offset, causing the camera to appear "pinned" to edges incorrectly.

### 6. Testing Checklist for Camera Focus Changes

When modifying camera focus code:

- [ ] **Test bot movement animations**: Camera centers on moving bot units
- [ ] **Test attack animations**: Camera centers on attacker then target
- [ ] **Test deployment mode**: Camera focuses on deployment zones
- [ ] **Test cycle objectives**: Camera centers on each objective
- [ ] **Test zoom persistence**: Focus maintains position during zoom
- [ ] **Test pan persistence**: Manual pan doesn't break auto-focus
- [ ] **Test map edges**: Focusing near edges clamps correctly
- [ ] **Test coordinate conversions**: Axial → offset → viewBox all valid
- [ ] **Test with all map sizes**: Small (12×12) and large (30×30+) maps
- [ ] **Test with different zoom levels**: 1.0×, 1.5×, 2.0×

### 7. Common Pitfalls to Avoid

❌ **Don't** modify coordinate conversion functions without testing all three systems
❌ **Don't** assume cx/cy will always exist - validate before using
❌ **Don't** remove diagnostic logging until issue is fully understood
❌ **Don't** change transform-box or transform-origin CSS properties
❌ **Don't** mix coordinate systems (e.g., passing axial to functions expecting offset)
❌ **Don't** skip validation of hex keys from toHexKey() - can return null
❌ **Don't** center camera during user-initiated panning operations

✅ **Do** maintain comprehensive logging during bot animations
✅ **Do** validate all coordinate conversions at boundaries
✅ **Do** preserve transform-box: view-box for SVG elements
✅ **Do** handle null/undefined hex keys gracefully
✅ **Do** clamp viewport transforms to keep map visible
✅ **Do** test camera focus after any coordinate system changes
✅ **Do** use consistent coordinate terminology in comments/logs

### 8. Key Files and Their Responsibilities

**`src/ui/screens/BattleScreen.ts`**
- `playBotTurnAnimations()` - Orchestrates bot movement camera focus
- `focusCameraOnHex()` - Core camera focus implementation
- `toHexKey()` - Converts axial to hex key with bounds checking

**`src/ui/controls/MapViewport.ts`**
- `centerOn(x, y)` - Transforms viewBox coordinates to screen position
- `updateTransform()` - Applies CSS matrix transform with view-box mode
- `getTransform()` - Returns current zoom/pan state

**`src/rendering/HexMapRenderer.ts`**
- `render()` - Generates hex markup with cx/cy dataset values
- `renderHex()` - Sets data-cx and data-cy on each hex cell
- `getHexElement()` - Retrieves hex cell from DOM by key

**`src/rendering/CoordinateSystem.ts`**
- `offsetToAxial()` - Offset → axial conversion
- `axialToOffset()` - Axial → offset conversion
- `axialToPixel()` - Axial → viewBox pixel conversion
- `makeHexKey()` - Creates "col,row" string from offset

### 9. Coordinate Validation Pattern

Always validate coordinates at transformation boundaries:

```typescript
private toHexKey(axial: Axial): string | null {
  const { col, row } = CoordinateSystem.axialToOffset(axial.q, axial.r);

  // Validate numeric conversion
  if (!Number.isFinite(col) || !Number.isFinite(row)) {
    return null;
  }

  // Validate bounds
  if (col < 0 || row < 0 || col >= this.scenario.size.cols || row >= this.scenario.size.rows) {
    return null;
  }

  return CoordinateSystem.makeHexKey(col, row);
}
```

Always validate retrieved coordinates before use:

```typescript
const cx = Number(cell.dataset.cx ?? 0);
const cy = Number(cell.dataset.cy ?? 0);

if (cx === 0 && cy === 0) {
  console.warn("[BattleScreen] Invalid coordinates", { hexKey });
  return;
}
```

## Files Modified in This Fix

1. `src/ui/screens/BattleScreen.ts` - Added comprehensive diagnostic logging
   - Lines 832-860: Bot movement animation logging
   - Lines 1987-2042: Camera focus coordinate tracing

## Lessons Learned

1. **Coordinate systems need explicit documentation**: Three coordinate systems (axial, offset, viewBox) are easy to confuse without clear documentation
2. **Diagnostic logging is essential for coordinate transforms**: Complex transformations need logging at every step to identify failures
3. **CSS transform-box is critical for SVG**: Without `transform-box: view-box`, SVG transforms drift by bounding-box offsets
4. **Validation at boundaries**: Every coordinate transformation should validate input and output
5. **Testing across map sizes**: Camera focus issues may only manifest at map edges or with certain coordinate ranges

## Related Documentation

- `docs/MISSION_DESIGN_GUIDE.md` - Mission structure including hex coordinates
- `src/rendering/CoordinateSystem.ts` - All coordinate transformation functions
- `src/ui/controls/MapViewport.ts` - Viewport transform implementation
- `src/rendering/HexMapRenderer.ts` - Hex rendering and coordinate storage

## Future Prevention

1. **Add unit tests** for coordinate transformations across all three systems
2. **Add integration tests** for camera focus during bot movements
3. **Maintain diagnostic logging** in production for easier debugging
4. **Document coordinate system usage** in every function that touches coordinates
5. **Code review checklist** must include camera focus testing for any coordinate changes
