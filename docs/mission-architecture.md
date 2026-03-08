---
# Mission controls and architecture (deprecated)

> **Note:** This summary is legacy. Use the authoritative guidance in `docs/four_star_general_mission_creation_agent_spec.md` for current mission creation standards.

## Where mission data lives
- Mission catalog: `src/data/missions.ts` defines `missionTitles`, `missionBriefings`, and helpers for title/briefing lookups and validation.
- Mission key type: `MissionKey` union in `src/state/UIState.ts` enumerates the supported mission keys (`training`, `patrol`, `assault`, `campaign`).
- UI state: `UIState` stores the selected mission/general/difficulty and validates mission keys. It also exposes `getMissionKeys()` for iterating available missions.

## Current mission definitions
- **Training Exercise (`training`)** — tutorial-enabled; briefing emphasizes low-stakes familiarization.
- **Border Patrol (`patrol`)** — briefing for perimeter security; currently identical flow to training but without the tutorial.
- **Tactical Assault (`assault`)** — briefing for heavy engagement.
- **Western Europe Campaign (`campaign`)** — briefing for multi-op campaign.

## Selection + control flow (home/landing screen)
- Mission buttons are rendered from `UIState.getMissionKeys()` and wired in `LandingScreen`:
  - Requires a commissioned/selected general; otherwise buttons are disabled and selection shows feedback.
  - On click, updates `uiState.selectedMission`, updates headline/briefing from mission metadata, and navigates:
    - `campaign` → campaign flow
    - all other missions → precombat flow
  - Mission availability gating uses general service record: rookies get `training`/`patrol`; intermediate adds `assault`; veterans get all missions.
- References: Landing selection handler and list rendering live in `src/ui/screens/LandingScreen.ts` (`handleMissionSelection`, `renderMissionList`, `getMissionsForGeneral`).

## Precombat behavior
- Precombat setup receives the `missionKey` and renders mission summary/general info.
- `training` mission automatically starts the tutorial (`isTrainingMission`/`startTrainingTutorial`).
- `campaign` mission toggles campaign-cap computations; other missions skip those caps.
- References: `setup` in `src/ui/screens/PrecombatScreen.ts`; `isTrainingMission` in `src/state/TutorialState.ts`.

## How missions differ today
- Content differences: title + briefing text only (per `missions.ts`).
- Flow differences:
  - `training` triggers tutorial overlay in precombat/battle flow.
  - `campaign` routes to campaign screen and enables campaign cap logic.
  - `patrol` currently shares the same flow as `training` but without tutorial, making it near-identical in practice.

## Proposed standard for adding/differentiating missions
Use this checklist to introduce or modify a mission:
1) **Define the key and copy**
   - Add the mission key to `MissionKey` in `UIState`.
   - Add title + briefing in `src/data/missions.ts`.
2) **Expose availability**
   - Ensure `UIState.getMissionKeys()` (via `missions.ts`) includes the new key.
   - Update gating logic in `LandingScreen.getMissionsForGeneral` (or move to a dedicated mission-eligibility module) to decide when the mission unlocks.
3) **Route behavior**
   - Decide the destination: precombat, campaign-like flow, or a new screen. Wire the branch in `LandingScreen.handleMissionSelection`.
4) **Mission-specific logic**
   - Add any mission-specific setup in `PrecombatScreen.setup` (e.g., tutorials, caps, special loadout constraints) keyed off `missionKey`.
   - If the mission uses unique scenarios/AI/terrain, point precombat/battle loaders at the appropriate scenario data modules.
5) **Tutorials/onboarding**
   - If the mission requires guidance, add a dedicated tutorial gate similar to `isTrainingMission` and start it in precombat.
6) **Testing**
   - Add/adjust UI tests for mission availability/rendering and a small flow test to ensure the mission routes and initializes correctly.

## Map architecture (WWII-aligned checklist)
Use this to fully flesh out a mission’s map. Anchor choices in WWII-era plausibility (terrain, forces, objectives).

### Terrain and tiles
- **Tile set selection**: choose terrain tiles that match the theater (e.g., bocage/hedgerows for Western Europe, steppe/open fields for Eastern Front, desert dunes/wadis for North Africa, alpine passes for Italy). Keep roads/rails consistent with era and region.
- **Cover and mobility**: mix hard cover (town blocks, bunkers, forests) and soft cover (brush, shallow trenches) with clear lanes for maneuver. Ensure tanks have at least one viable flanking route and infantry have protected approaches.
- **Chokepoints vs. openness**: include 2–3 natural chokepoints (bridges, village main street, forest gaps) but provide alternate routes to avoid single-solution maps.
- **Line of sight**: place elevation/obstacles to create LOS breaks every 3–5 tiles; avoid long, uncontrolled sniper lanes except in deliberate scenarios (e.g., ridge defense).

### Map size and shape
- **Patrol**: compact 12–16 hex radius (or ~20x20 grid equivalent) to keep engagements brisk, simple objectives of repel or destroy enemy units.
- **Assault**: medium 16–22 hex radius to allow staging, flanking, and primary, secondaryobjective depth.
- **Campaign stage**: larger 22–28 hex radius with multiple objective clusters and logistics considerations.
- Shape guidance: irregular boundaries with soft edges (forests, rivers) rather than perfect rectangles to feel natural.

### Objectives (what and why)
- **Primary**: era-appropriate targets (rail junction, fuel depot, AA battery, bridge, village square, radar site). Tie each to mission intent: patrol → secure crossings and spot infiltrators; training → occupy range markers; assault → seize fortified hub; campaign → multi-phase control.
- **Secondary**: optional side tasks (rescue downed pilot, capture intel truck, destroy artillery, hold crossroads for N turns) to encourage maneuver without stalling primary flow.
- **Placement**: distribute objectives in 2–3 clusters to prevent single-point blobs; separate clusters by terrain variety (river line + hill + town) to force combined-arms decisions.

### Forces: enemies and allies (composition and rationale)
- **Allies**: match doctrine to mission: patrol/training → light infantry + recon cars + minimal armor; assault → combined arms with at least one armor platoon and support weapons (MGs, mortars); campaign → layered forces with reserves and artillery/air support hooks.
- **Enemies**: align with theater opposition; vary quality by mission difficulty (green conscripts for training adjacencies, regulars on patrol, veterans with AT guns for assault). Include era-appropriate AT/AA assets if armor/air is present.
- **Support**: only grant artillery/air missions if objectives justify them (e.g., softening a fortified village or interdiction of a bridge).

### Deployment and start positions (where and why)
- **Allied start**: place near a protected edge with 1–2 covered advance routes; staging area should allow initial cohesion (not split spawns unless mission demands pincer).
- **Enemy start**: anchor defenders around objectives with depth: pickets forward, main line on hard cover, reserves 3–5 tiles behind to counterattack. For patrol, use smaller dispersed posts; for assault, create layered belts.
- **Neutral/civilian elements**: add non-combatant zones or convoy paths if mission story needs them; ensure LOS/ROE implications are considered.
- **Spawn safety**: avoid immediate artillery or MG arcs on the player’s initial hexes; first contact ideally occurs after 1–2 moves unless it’s an ambush scenario.

### Scenario integrity
- **Victory/defeat conditions**: define clear turn limits or control requirements; avoid infinite stalemates. Patrol/training should have generous timers; assault/campaign can be tighter.
- **Resource balance**: align supply/repair/respawn rules with mission size; don’t give heavy armor without sufficient fuel/repair capacity.
- **Briefing coherence**: ensure the briefing in `missions.ts` matches map reality (terrain, objectives, expected resistance).
- **Testing hooks**: document expected objective count, initial unit counts per faction, and key coordinates so automated tests or parity checks can validate the scenario.

## Quick pointers
- Mission metadata source of truth: `src/data/missions.ts`.
- Selection state: `UIState` (`selectedMission`, validation, persistence helpers).
- Landing controls: `LandingScreen` (mission list rendering, gating, navigation).
- Tutorial hook: `isTrainingMission` (`TutorialState`), invoked from `PrecombatScreen.setup`.
