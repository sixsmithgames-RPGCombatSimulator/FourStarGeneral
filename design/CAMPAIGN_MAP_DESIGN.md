# Campaign Map Design Overview

## Summary
The campaign map is a new strategic layer that presents the theater of war at a 5km-per-hex scale. It allows the player to position resources, move forces, and queue battles when opposing forces come into proximity. Visually, the campaign map overlays hex outlines, base/unit sprites, and front-line markers atop a high‑resolution illustration. This document defines the scope, data contracts, rendering approach, turn loop, save/load/exit controls, and integration points required to introduce the campaign layer while preserving existing battle flows.

## Goals
- Deliver a hex-based campaign overview with much larger tiles (5km) than tactical battles (250m) so one tile can represent major installations (airbases, naval ports, logistics hubs, task forces).
- Support strategic planning actions: allocating resources, opening or reinforcing fronts, and targeting objectives that yield advantages or weaken enemies.
- Reuse existing infrastructure where practical (map rendering conventions, coordinate helpers, UI state patterns) while isolating campaign-specific logic in a dedicated module.
- Provide a clean state contract that the game engine can read to spawn tactical battles informed by campaign outcomes.

## Scope & Non-Goals
- **In scope:** campaign data model, renderer scaffolding, UI screen container, integration hooks for GameEngine scheduling, and asset referencing for the campaign illustration.
- **Out of scope:** tactical combat changes, AI decision making, and detailed mission generation logic. Those build on top of campaign outcomes but remain separate tasks.

## Data Model
### Tile Scale & Coordinate System
- Reuse the existing axial hex coordinate helpers from `CoordinateSystem` so the campaign layer aligns with core math and serialization (@src/rendering/HexMapRenderer.ts#405-503).
- Introduce `CampaignScenarioData` to describe campaign maps without assuming tactical terrain palettes. Key fields:
  - `hexScaleKm`: number (always 5 km, but explicit for potential variants).
  - `dimensions`: `{ cols: number; rows: number; }` total hex grid size.
  - `background`: `{ imageUrl: string; attribution?: string; stretchMode?: "cover"|"contain"|"stretch", nativeWidth?: number, nativeHeight?: number, nominalWidthKm?: number }`.
    - When `nativeWidth/nativeHeight` are provided, the renderer sizes the SVG canvas to match and sets `preserveAspectRatio: none` so the full illustration is always visible without cropping. The hex overlay then scales to cover the canvas.
  - `tiles`: array of `CampaignTileInstance` entries describing occupancy and ownership.
  - `fronts`: list of `CampaignFrontLine` definitions referencing multiple hex keys for borders.
  - `objectives`: list of strategic objectives with bonuses (e.g., air superiority, supply boost).
  - `economies`: summary information for each faction (resources, force pools, intel coverage).

### Tile Contents
- `CampaignTileDefinition` describes the intent of a tile (installation, logistics node, fleet, etc.). Each entry notes:
  - `role`: enumeration such as `"airbase"`, `"navalBase"`, `"logisticsHub"`, `"taskForce"`, `"region"`.
  - `factionControl`: owner identifier.
  - `supplyValue`, `airSortieCapacity`, `navalCapacity`, etc., enabling resource calculations.
  - Optional `spriteKey` referencing campaign-specific iconography.
- Additional overlays (e.g., recon coverage, supply lines) can reference the same hex coordinates, keeping the data model consistent with tactical flows.

### Fronts
#### Gameplay
- A **front** is the dynamic line of contact separating opposing factions. Every front hex is contested space where ongoing or imminent engagements can occur.
- Tiles behind the front (friendly side) are considered secured and provide reinforcement routes, logistics, and resource benefits. Tiles beyond the front (enemy side) are enemy-controlled and may conceal forces unless revealed by recon.
- Fronts are recalculated whenever adjacent tiles with different `factionControl` values meet, ensuring the boundary shifts as territory changes hands.

#### Data Model
- Represent fronts with `CampaignFrontLine` records that capture ownership, ordered hex paths, and metadata about the conflict:
  ```ts
  type CampaignFrontLine = {
    id: string;
    name: string;
    factionA: string;
    factionB: string;
    hexes: HexCoord[]; // ordered path describing the contact line
    type: "static" | "mobile" | "encirclement";
    engagementZones?: HexCoord[]; // contested hexes queued for tactical battles
    lastUpdated: number; // campaign turn index
    objectives?: string[]; // linked objective identifiers
  };
  ```
- The engine recomputes the `hexes` path when territory changes or when commanders issue orders (advance, reinforce, fortify).
- `engagementZones` stores specific hexes slated for tactical battle generation so the engine can spawn `ScenarioData` payloads anchored to the front.

#### Rendering
- Draw fronts as ordered polylines (or thin filled bands) connecting each hex center. Use faction-aware color coding (e.g., blue/green for friendly, red/orange for enemy, yellow for contested offensives).
- Thickness or opacity can communicate intensity—thicker segments for heavy fighting, lighter for quiet sectors.
- Hover or click tooltips should summarize status: e.g., "Eastern Front – Heavy Resistance", "Engagements: 3 active / 2 pending", "Objective: Capture port at Hex F-12".

#### Integration
- **Player orders** (reinforce, advance, fortify, redeploy) mutate front definitions and queue `CampaignDecision` entries that the engine resolves at turn advance.
- **AI behavior** mirrors these operations to expand or collapse fronts, allowing dynamic campaign flow.
- **Victory tracking** can monitor front movement and linked objective captures to measure strategic progress and unlock new engagements.

### Strategic State Snapshots
- `CampaignTurnState` documents resources, active missions, and pending battle opportunities for each faction. The GameEngine can transform this state into tactical scenarios when a conflict is triggered.
- `CampaignDecision` objects capture player inputs (redeploy resources, launch offensive, fortify front) so we can store and replay campaign moves.

## Rendering Architecture
### Renderer Responsibilities
- Create `CampaignMapRenderer` to parallel `HexMapRenderer` but optimized for large-scale visualization.
  - Render the static background image inside the canvas container before drawing hex outlines.
  - Draw simple hex frames (thin strokes, no terrain sprites) to avoid clutter at campaign scale. The hex grid is scaled and centered so it fully covers the canvas (no gaps on edges).
  - Place strategic sprites (bases, fleets) on tiles using a campaign-specific sprite catalog.
  - Render front lines as polylines or filled bands spanning designated hex sets.
  - Provide interaction helpers (`onHexClick`, `highlightObjective`, `focusOnFront`) similar to existing renderer APIs for UI parity.
- Maintain human-readable comments within renderer code describing scaling choices and overlay ordering per user standards.

### Asset Management
- Store campaign icons under `src/assets/campaign/` (new directory). Each sprite should visually differentiate installations vs. mobile forces.
- Background art lives under `src/assets/campaign/` and is referenced by the scenario JSON. Record `nativeWidth/nativeHeight` to preserve the full-map presentation and enable a scrollable viewport.

### Map Viewport & Full‑Map Coverage
- DOM structure (index.html):
  - Wrapper: `div.campaign-map-viewport` with `overflow:auto` to enable scrolling the full theater.
  - Canvas: `div#campaignMapCanvas.campaign-map-canvas` sized to the background’s native pixel dimensions.
  - SVG: `svg#campaignHexMap` sized to the same width/height as the canvas and given a `viewBox` of `0 0 [w] [h]`.
- Background scaling:
  - If `background.nativeWidth/Height` are present, set `<image preserveAspectRatio="none">` and use the exact native width/height so the full illustration is always visible.
- Hex overlay scaling:
  - Compute the unscaled hex grid size from `dimensions` and a small margin.
  - Apply a uniform scale and translate so the overlay “covers” the canvas (no empty edges). Center the result; extra overlay content is clipped by the SVG viewport.

## Base Placement & Factions
- Every `CampaignTileInstance` derives its default `factionControl` from the palette entry (Player/Bot/Neutral) but may override per tile.
- Use player tiles along the invasion staging area (e.g., southern England coast) and enemy tiles across the opposing coastline (e.g., Normandy/Low Countries) for logical placement.
- The live scenario file `src/data/campaign01.json` includes both Player and Bot bases: airbases, naval bases, and logistics hubs with representative force groups.

## Turn Loop, Movement, and Battles

### Day‑based Turn Loop
- One campaign turn equals 1 day.
- Sidebar controls:
  - `Advance Day` button increments day and triggers daily resource generation from controlled tiles.
  - `Day N` is displayed at the top of the campaign sidebar.

### Force Movement
- Click a Player‑controlled tile that has forces to “prime” it as a move origin.
- Click an adjacent hex to move those forces into the destination:
  - Destination is created as a neutral region if it doesn’t exist, then captured for the Player unless explicitly enemy‑held.
  - Force groups merge by `unitType` when arriving.
- Movement is implemented in `CampaignState.moveForces(originKey, destKey)` and is gated to adjacent hexes (hex distance = 1).

### Proximity‑based Battle Prompt
- The `Queue Engagement` button enables when either:
  - A front is selected, or
  - The currently selected hex is adjacent to an enemy‑controlled tile.
- Clicking it creates a pending engagement with tags `front` or `proximity` and transitions to Precombat (via `onQueueEngagement`).

## Save / Load / Exit
- Save/Load in the campaign sidebar persist to `localStorage` under the key `fourstar.campaign.save.v1`.
- `CampaignState.saveToStorage()` and `.loadFromStorage()` serialize/restore the scenario, day counter, queued decisions, and pending engagements.
- `Exit` returns to the Landing screen via `ScreenManager.showScreenById("landing")`.

## UI & Workflow Integration
### New Screen Flow
- Add a dedicated `CampaignScreen` to the UI layer, structured like `BattleScreen` but without combat HUD elements.
  - The screen hosts the campaign renderer, resource summaries, decision panels, and objective tooltips.
  - Transitions: `LandingScreen → CampaignScreen → (optional) PrecombatScreen → BattleScreen`. Entering a battle uses the selected front/objective to generate a scenario blueprint.

### State & Engine Hooks
- Extend `GameEngine` with a `campaignState` module that tracks the active campaign scenario and resolves decisions into tactical engagements (@src/game/GameEngine.ts#1-400 approx.).
- Introduce `CampaignState` (parallel to `BattleState`) to expose observable data for the UI. This state publishes updates when resources are reallocated, fronts shift, or new battles become available.
- When the player commits to a battle, `CampaignState` packages the relevant front, involved forces, and modifiers. `GameEngine` converts this into `ScenarioData` for the existing tactical flow.

## Interaction Concepts
- **Resource Placement:** Drag-and-drop or panel-driven assignments to move air wings, fleets, and logistics resources between controlled tiles.
- **Front Management:** Players can open, extend, or reinforce fronts. Front definitions map to sequences of hexes; the renderer highlights them with colored borders.
- **Objective Selection:** Objectives appear on tiles; selecting one reveals potential rewards (e.g., increased supply, enemy debuff). Completing objectives may unlock scripted events.

## Implementation Phases
### 1. **Scaffolding (current task):**
  - Define campaign-specific TypeScript types and renderer skeleton with thorough comments.
  - Add placeholder assets and background metadata fields.
  - Establish UI entry point (empty `CampaignScreen` container) with basic navigation hooks.
### 2. **Rendering MVP:**
  - Load a sample campaign scenario, draw hex grid + background, and place a few test sprites.
  - Wire click/hover interactions and objective highlights.
### 3. **State Integration:**
  - Implement `CampaignState` observable model and connect to GameEngine for decision resolution.
  - Sync resource pools and front-line updates to the UI.
  - Add Save/Load (localStorage) and Exit button.
  - Add Day counter with daily resource generation.
  - Add adjacent‑hex force movement and proximity‑based battle prompt.
### 4. **Gameplay Layer:**
  - Add decision mechanics (resource transfers, front operations) and convert committed decisions into tactical battle blueprints.
### 5. **Polish & Testing:**
  - Expand automated tests to cover renderer output, state transitions, and GameEngine integration.
  - Document asset guidelines and objective balancing in design notes.

## Open Questions
- How granular should logistics/resource calculations be (per tile vs. per front)? Per tile.
- Do fronts require directional data (attacking vs. defending) for later AI integration? Yes, track which side the player controls and which side the enemy controls.
- Should the campaign layer support fog of war or partial intel, or can we defer to future work? Partial intel, can be deferred for now.
