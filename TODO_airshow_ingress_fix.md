# Air Show Ingress Fix - Implementation Requirements

## Current State (Violates Spec)

### Problem Identified
Aircraft appear too close to combat space:
- First engagement reaches upper-central fight space within 1-2 seconds
- No visual runway to read who is entering, from where, in what formation, or in what order
- Violates spec requirement: "launch and ingress to be clearly communicated"

### Current Implementation Issues

**1. Insufficient Spawn Distance**
- Current: Aircraft spawn at ~146px offset from center (interceptors at `-146`, escorts at `+146`)
- 1 hex = ~83px (HEX_WIDTH = sqrt(3) * HEX_RADIUS = sqrt(3) * 48 ≈ 83px)
- Current spawn distance: ~146px / 83px ≈ **1.76 hexes** from center
- **VIOLATES**: 8 hex minimum requirement

**2. Insufficient Ingress Time**
- Fighter ingress: `Math.max(1100, scene.fighterIngressDurationMs ?? 1480)` → **1.1s minimum**
- Bomber ingress: `Math.max(760, scene.bomberIngressDurationMs ?? 1320)` → **0.76s minimum**
- **VIOLATES**: 1.25s for fighters, 3.0s for bombers

**3. Combat Starts Too Early**
- Escort exchanges can begin during ingress phase
- No separation between ingress completion and first weapons exchange
- **VIOLATES**: "No weapon fire until both the ingress leg and role read have completed"

---

## Required Fixes (Per North Star Spec)

### Fix 1: Enforce 8 Hex Minimum Spawn Distance

**File**: `HexMapRenderer.ts` - `resolveAirShowSceneAnchor()` and related functions

**Hard Rule**: 
- Friendly aircraft first visible position must be at least **8 hexes** from first merge point
- Hostile aircraft first visible position must be at least **8 hexes** from first merge point

**Implementation**:
```typescript
// 8 hexes in pixels (HEX_WIDTH ≈ 83px)
const MINIMUM_SPAWN_DISTANCE_HEXES = 8;
const MINIMUM_SPAWN_DISTANCE_PX = MINIMUM_SPAWN_DISTANCE_HEXES * HEX_WIDTH; // ~664px

// Calculate spawn point along approach vector at minimum distance
// For interceptors: 8 hexes out from merge point toward their origin side
// For escorts: 8 hexes out from merge point toward their origin side
```

**Changes Required**:
1. Modify `resolveAirShowSceneAnchor()` to calculate positions at 8+ hex distance
2. Update `createAirShowRuntimeFlightInternal()` to use distant spawn anchor
3. Ensure `buildBandAssignments()` creates ingress path from distant spawn to merge point

---

### Fix 2: Enforce Minimum Ingress Times

**File**: `HexMapRenderer.ts` - Ingress phase duration calculations

**Hard Rules**:
- Fighters: **≥ 1.25 seconds** (1250ms) from first visibility to first weapons exchange
- Bombers: **≥ 3.0 seconds** (3000ms) from first visibility to first weapons exchange

**Current Values to Update**:
```typescript
// Line ~2189: Fighter ingress
Math.max(1100, scene.fighterIngressDurationMs ?? 1480)  // OLD
Math.max(1250, scene.fighterIngressDurationMs ?? 1750) // NEW: minimum 1.25s

// Line ~2560: Bomber ingress  
Math.max(760, scene.bomberIngressDurationMs ?? 1320)   // OLD
Math.max(3000, scene.bomberIngressDurationMs ?? 3500) // NEW: minimum 3.0s
```

**Also update defaults in scene builder**:
- `ResolvedAirShowScene.fighterIngressDurationMs` default: 1750ms
- `ResolvedAirShowScene.bomberIngressDurationMs` default: 3500ms

---

### Fix 3: Delay Weapons Exchange Until Ingress + Role Read Complete

**File**: `HexMapRenderer.ts` - Phase sequencing in air show playback

**Hard Rule**: No weapon fire until both the ingress leg and role read have completed

**Current Issue**:
```typescript
// Current flow (lines ~2173-2192):
1. Ingress phase starts (fighters approach)
2. Ingress phase ends
3. Escort clash phase starts IMMEDIATELY (weapons fire)
```

**Required Flow**:
```typescript
1. Ingress phase: Aircraft travel from 8-hex spawn to merge point
2. Role Read Beat: Brief pause (200-300ms) where formation/roles are visually clear
3. Weapons Exchange: Only after role read completes
```

**Implementation**:
- Add a "formation hold" or "role read" beat between ingress and combat
- Duration: 200-300ms minimum for player to visually identify participants
- During this beat: Aircraft hold position at merge point, no firing
- Log this as a distinct beat in the air show timeline

---

## SceneBuilder Test Requirements

The `ResolvedAirCombatSceneBuilder` diagnostic tests must verify:

### Test 1: Ingress Distance Validation
```typescript
// New test to add to AirCombatSceneBuilder.test.ts
registerTest("AIR_SHOW_INGRESS_SPAWN_MINIMUM_8_HEX_DISTANCE", async ({ Given, When, Then }) => {
  // Verify all participants spawn at least 8 hexes from merge point
  // Calculate distance between spawn anchor and scene hex center
  // Assert: distance >= (8 * HEX_WIDTH)
});
```

### Test 2: Ingress Timing Validation
```typescript
// New test to add
registerTest("AIR_SHOW_FIGHTER_INGRESS_MINIMUM_1250MS", async () => {
  // Verify fighterIngressDurationMs >= 1250
});

registerTest("AIR_SHOW_BOMBER_INGRESS_MINIMUM_3000MS", async () => {
  // Verify bomberIngressDurationMs >= 3000
});
```

### Test 3: Weapons Exchange Delay
```typescript
// New test to add
registerTest("AIR_SHOW_NO_WEAPONS_DURING_INGRESS", async () => {
  // Verify no tracer exchanges occur during ingress phase
  // Verify first escort exchange happens after ingress duration completes
});
```

---

## Files to Modify

1. **HexMapRenderer.ts**
   - `resolveAirShowSceneAnchor()` - spawn distance calculation
   - Ingress phase duration constants (lines ~2189, ~2560)
   - Phase sequencing to add role-read beat between ingress and combat
   - `createAirShowRuntimeFlightInternal()` - initial positioning

2. **ResolvedAirCombatSceneBuilder.ts**
   - Add diagnostics validation for spawn distances
   - Add timing validation to diagnostics output
   - Ensure scene defaults meet minimums

3. **AirCombatSceneBuilder.test.ts**
   - Add new test cases for ingress distance
   - Add new test cases for ingress timing
   - Add new test cases for weapons delay

4. **Types (if needed)**
   - Add `roleReadDurationMs` to `ResolvedAirShowScene` interface

---

## Implementation Priority

1. **HIGH**: Fix spawn distance (8 hex minimum) - Core spec violation
2. **HIGH**: Fix ingress timing (1.25s fighters, 3.0s bombers) - Core spec violation  
3. **MEDIUM**: Add role-read beat between ingress and weapons - UX improvement
4. **LOW**: SceneBuilder diagnostic tests - Verification/validation

---

## Visual Acceptance Criteria

After fixes, the air show must present:

1. **Clear Ingress Beat**: Aircraft appear 8+ hexes away and travel visibly toward combat
2. **Readable Formation**: Player can identify aircraft type, faction, and formation during approach
3. **Role Read Pause**: Brief moment at merge point where roles are clear before combat
4. **Delayed Weapons**: No firing until ingress + role read complete
5. **Bomber Lag**: Bombers arrive 1.75s after fighters in contested packages (3.0s vs 1.25s)

This matches the North Star Spec: "air missions feel like a distinct air phase, not just another ground-side effect"
