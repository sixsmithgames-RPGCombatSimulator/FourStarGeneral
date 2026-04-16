# TODO: HQ-Derived Corridor Axis and Off-Map Spawn Origins

## Goal

Use each scenario's Player HQ and Bot HQ axial positions to define the natural
attack corridor for the airshow. Aircraft spawn off-map along this axis, on the
side that matches their **faction** — not their combat role.

- `"Bot"` faction units (CAP, escorts, bombers) → spawn off-map beyond the **Bot HQ edge**
- `"Player"` / `"Ally"` faction units (CAP, escorts, bombers) → spawn off-map beyond the **Player HQ edge**

---

## Step 0 — Enforce HQ presence in scenario validation (no fallback)

**File:** `src/data/scenarioValidation.ts`

Add a `validateSides` function called from `validateScenarioSource` alongside
the existing validators. It must:

1. Confirm `sides` is a present, non-array object.
2. For both `"Player"` and `"Bot"` sides:
   - Confirm the side object exists.
   - Confirm `hq` is a two-element array.
   - Confirm both elements are integers (`readInteger`).
   - Confirm the resulting `[col, row]` is within map bounds (reuse `isWithinBounds`).
3. Push a descriptive `issues` string for each failure — consistent with the
   existing pattern. No silent fallback to `[0,0]`.

```typescript
function validateSides(
  record: RawScenarioSource | null,
  issues: string[],
  missionKey: string,
  scenarioName: string | null,
  size: RawScenarioSize | null
): void
```

Call it from `validateScenarioSource` after `validateRangeEnvelope`.

Because `assertScenarioSourceValid` throws on any non-empty `issues` array, and
`getScenarioByMissionKey` calls `assertScenarioSourceValid` at startup, any
scenario missing valid HQ data will fail loudly at load time — no fallback
anywhere downstream.

---

## Step 1 — Add `playerHqKey` / `botHqKey` to `ResolvedAirShowScene`

**File:** `src/rendering/HexMapRenderer.ts`

Add two optional fields to the `ResolvedAirShowScene` type:

```typescript
playerHqKey?: string | null;  // offset "col,row" key of the Player HQ hex
botHqKey?: string | null;     // offset "col,row" key of the Bot HQ hex
```

These are offset keys (same format as `hexKey`) so `resolveHexCenterByKey` can
look them up directly in `hexElementMap`.

---

## Step 2 — Add public HQ accessors to `GameEngine`

**File:** `src/game/GameEngine.ts`

`playerSide` and `botSide` are `private readonly`. Add two thin public getters:

```typescript
getPlayerHq(): Axial { return structuredClone(this.playerSide.hq); }
getBotHq(): Axial    { return structuredClone(this.botSide.hq); }
```

---

## Step 3 — Populate `playerHqKey` / `botHqKey` in `BattleScreen`

**File:** `src/ui/screens/BattleScreen.ts`

Wherever a `ResolvedAirShowScene` is built (both the coordinated cluster path and
the standalone event path), resolve the HQ hex keys before building the scene:

```typescript
const playerHqKey = this.toOffsetHexKey(engine.getPlayerHq());
const botHqKey    = this.toOffsetHexKey(engine.getBotHq());
```

Pass these into `BuildCoordinatedAirClusterPlaybackPlanOptions` and
`BuildResolvedAirCombatSceneOptions`, and write them into the built scene.

---

## Step 4 — Thread HQ keys through scene builders

### `ClusterAirPlaybackPlanner.ts`

**File:** `src/ui/airshow/ClusterAirPlaybackPlanner.ts`

Add `playerHqKey` and `botHqKey` to `BuildCoordinatedAirClusterPlaybackPlanOptions`.
Set them on the built `ResolvedAirShowScene` object.

### `ResolvedAirCombatSceneBuilder.ts`

**File:** `src/ui/airshow/ResolvedAirCombatSceneBuilder.ts`

Add `playerHqKey` and `botHqKey` to `BuildResolvedAirCombatSceneOptions`.
Set them on the built scene.

---

## Step 5 — Add `resolveHqAxis` to `HexMapRenderer`

**File:** `src/rendering/HexMapRenderer.ts`

New private method:

```typescript
private resolveHqAxis(
  playerHqKey: string | null | undefined,
  botHqKey: string | null | undefined
): {
  playerOrigin: AirShowPoint;  // off-map point beyond Player HQ
  botOrigin: AirShowPoint;     // off-map point beyond Bot HQ
  axis: { x: number; y: number };  // unit vector Bot HQ → Player HQ
} | null
```

Logic:
1. Resolve both HQ pixel centers via `resolveHexCenterByKey`. Return `null` if
   either fails.
2. Compute the unit axis vector: `normalize(playerHQ - botHQ)`. This is the
   direction from enemy territory toward friendly territory (the natural bomber
   approach vector). Use the existing `normalizeAircraftVector` helper with a
   default of `(1, 0)`.
3. Determine an off-map overshoot distance. The renderer does not store the
   scenario size, so derive it from `hexElementMap`: the map pixel span can be
   approximated from the min/max `cx` values across all cells. A simpler and
   sufficient approach is a fixed large constant: **`OFF_MAP_DISTANCE_PX = 2000`**.
   This exceeds any realistic map at HEX_WIDTH ≈ 83 px/hex × 24 hex max = ~2000 px,
   so going 2000 px past the HQ is always off-screen.
4. Compute origins:
   ```
   playerOrigin = playerHQ + axis * OFF_MAP_DISTANCE_PX
   botOrigin    = botHQ    - axis * OFF_MAP_DISTANCE_PX
   ```

Add `OFF_MAP_DISTANCE_PX = 2000` as a private static constant.

---

## Step 6 — Replace hardcoded fallback origins in `animateResolvedAirCombatShow`

**File:** `src/rendering/HexMapRenderer.ts`

Remove the three shared hardcoded constants:
```typescript
// REMOVE these:
const interceptorFallbackOrigin = { cx: center.cx - 248, cy: center.cy + 126 };
const escortFallbackOrigin      = { cx: center.cx + 248, cy: center.cy - 126 };
const bomberFallbackOrigin      = { cx: center.cx - 286, cy: center.cy + 148 };
```

Replace with a per-spec faction-aware lookup:
```typescript
const hqAxis = this.resolveHqAxis(scene.playerHqKey, scene.botHqKey);

// Geometric fallbacks used only if HQ keys are absent entirely
const hardcodedPlayerOrigin = { cx: center.cx + 248, cy: center.cy - 126 };
const hardcodedBotOrigin    = { cx: center.cx - 248, cy: center.cy + 126 };

const fallbackOriginFor = (spec: ResolvedAirShowFlightSpec): AirShowPoint => {
  const isBot = spec.faction === "Bot";
  return isBot
    ? (hqAxis?.botOrigin    ?? hardcodedBotOrigin)
    : (hqAxis?.playerOrigin ?? hardcodedPlayerOrigin);
};
```

Then pass `fallbackOriginFor(spec)` per-spec when calling `buildAirShowRuntimeFlight`
for interceptors, escorts, and bombers:

```typescript
const interceptorFlights = scene.interceptors
  .map((spec) => this.buildAirShowRuntimeFlight(
    layer, spec, fallbackOriginFor(spec), defaultHeadingFor(fallbackOriginFor(spec))
  ))
  ...
```

Apply the same change in `inspectResolvedAirCombatShow` (the diagnostic path uses
the same three hardcoded constants).

---

## Step 7 — Use HQ axis as fallback in `resolveAirShowCorridor`

**File:** `src/rendering/HexMapRenderer.ts`

When `averageBomberAnchor` is `null` (e.g. capClash with no bombers),
`resolveAirShowCorridor` currently falls back to hardcoded offsets from center.
Pass `hqAxis` in as an optional parameter so the corridor axis aligns with the
HQ vector even when there is no bomber anchor to derive it from:

```typescript
private resolveAirShowCorridor(
  center: AirShowPoint,
  origin: AirShowPoint | null,
  target: AirShowPoint | null,
  hqAxis?: { botOrigin: AirShowPoint; playerOrigin: AirShowPoint } | null
): AirShowCorridor
```

Fallback resolution order for `approach` and `egress`:
```
approach = origin ?? hqAxis?.botOrigin    ?? { cx: center.cx - 220, cy: center.cy + 110 }
egress   = target ?? hqAxis?.playerOrigin ?? { cx: center.cx + 220, cy: center.cy - 24  }
```

Update both call sites (`animateResolvedAirCombatShow` and
`inspectResolvedAirCombatShow`) to pass `hqAxis`.

---

## Step 8 — Update `airshowHarnessFixture`

**File:** `src/testing/airshowHarnessFixture.ts`

Add `playerHqKey` and `botHqKey` to `AirshowHarnessFixture` and populate them
with correct offset keys derived from the fixture's side HQ axials:

- Player HQ is `createSide(0, 0)` → axial `{q:0, r:0}` → offset `"0,0"`
- Bot HQ is `createSide(9, 9)` → axial `{q:9, r:9}` → offset `axialToOffset(9,9)` = `"9,13"`

Export these from `buildAirshowHarnessFixture()` and pass them through to
`buildResolvedAirCombatScene` options in `AirShow.visual.jest.test.ts`.

---

## Step 9 — Verify with `npm run test:airshow:visual`

All 5 existing visual harness tests must continue to pass. No new tests required
for this change — the visual correctness is observable in-game. The existing tests
confirm phases, timing, and assignment counts are unaffected by the origin change.

---

## Non-Goals

- Do **not** change how `originHexKey` per-spec is resolved. When present it
  already correctly positions the flight. HQ axis is only the fallback for when
  `originHexKey` is absent or unresolvable.
- Do **not** change the corridor `entry` / `merge` / `strike` / `exit` point
  distances from center. Only the corridor axis direction and the fallback spawn
  origins change.
