# Mission Design Guide

## Purpose
This is the authoritative start-here guide for creating a real mission in Four Star General.

A mission is not complete when it only has flavor text. A mission is complete only when all of the following exist and agree with each other:

- a full mission package
- mission metadata
- a scenario JSON file
- a scenario registry entry
- a scenario validation profile
- mission rules for custom objectives and win/loss logic
- landing, precombat, and battle integration
- verification notes

Use this guide together with `docs/four_star_general_mission_creation_agent_spec.md`:

- `MISSION_DESIGN_GUIDE.md` is the implementation guide
- `four_star_general_mission_creation_agent_spec.md` is the content/spec guide

## One-Page Summary
To add a new mission successfully, an AI dev must do the following in order:

1. Write a complete Mission Package before touching code.
2. Decide whether the mission reuses an existing `missionKey` or adds a new one.
3. Update mission metadata in `src/data/missions.ts`.
4. Create a scenario file in `src/data/scenario_<slug>.json`.
5. Register that scenario in `src/data/scenarioRegistry.ts`.
6. Add an authoritative validation profile in `src/data/scenarioValidation.ts`.
7. Add mission-specific rules in `src/state/missionRules.ts` if the mission uses anything beyond the default turn-limit and elimination flow.
8. Update `src/ui/screens/LandingScreen.ts` if unlock gating, ordering, or route behavior changes.
9. Verify the full path: Landing -> Precombat -> Battle.

If any one of those steps is skipped, the mission is incomplete.

## Current Source Of Truth
The live mission architecture is split across these files:

| Concern | Source of truth | What must be true |
| --- | --- | --- |
| Selectable mission keys | `src/state/UIState.ts` | The key must be valid here or selection will fail. |
| Mission title, briefing, summary, category, deployment profile | `src/data/missions.ts` | Landing and precombat copy come from here. |
| Scenario payload | `src/data/scenario_<slug>.json` | Map, units, objectives, deployment zones, budget, and restrictions live here. |
| Mission -> scenario mapping | `src/data/scenarioRegistry.ts` | Every mission key must resolve to a scenario source. |
| Scenario validation | `src/data/scenarioValidation.ts` | Every scenario name used by missions must have an authoritative validation profile. |
| Custom mission objective logic | `src/state/missionRules.ts` | Hold, extract, escort, phased pressure, or custom defeat logic belong here. |
| Mission unlock order and route | `src/ui/screens/LandingScreen.ts` | New missions may require ordering, gating, or route changes. |
| Precombat scenario handoff | `src/ui/screens/PrecombatScreen.ts` | Reads budget, unit restrictions, predeployed units, and deployment zones from scenario JSON. |
| Battle scenario activation | `src/ui/screens/BattleScreen.ts` | Refreshes the scenario on battle-screen activation and rebuilds mission state if the mission changes. |
| Player-facing unit aliasing | `src/game/adapters.ts` and `src/state/DeploymentState.ts` | Player units referenced by scenario type must map cleanly into allocation/deployment aliases. |

## Hard Rules

### Rule 1: Always design the mission before implementing it
Before editing code, produce a full Mission Package with:

- mission identity
- gameplay role
- map design
- objective logic
- force composition
- deployment
- AI behavior
- pacing and escalation
- difficulty tuning
- UI copy
- technical notes
- QA cases

If the mission package is vague, implementation will be vague.

### Rule 2: Mission JSON is not enough
The scenario JSON only describes map data, deployment areas, unit rosters, budget, and unit restrictions. It does not fully express custom objective logic.

Examples of logic that must live in `src/state/missionRules.ts` instead of only in JSON:

- hold a hex for N consecutive turns
- deny enemy control for N turns
- destroy a specific unit to clear a secondary objective
- survive until extraction
- phased reinforcements or escalation messaging
- mission-specific victory and defeat reasons

### Rule 3: `scenario.name` must exactly match its validation profile
`src/data/scenarioValidation.ts` validates by scenario name, not by filename. If the JSON `name` and the validation-profile key do not match exactly, validation fails.

### Rule 4: Every playable mission must have deployment zones
Precombat depends on `deploymentZones`. If the scenario has no zones, precombat cannot initialize deployment UI.

### Rule 5: Scenario-provided player units should be true baseline units
In practice, authored player units in scenario JSON should be reserved for locked baseline troops that begin with the mission.

Use `preDeployed: true` for units that should start on the map and appear in precombat as locked assets.

Do not use scenario JSON to silently grant extra player reserves that are supposed to be purchased through precombat. Requisitionable forces should come from the allocation flow instead.

### Rule 6: Player-facing scenario unit types must resolve through deployment aliases
If a mission uses player units with scenario types that are not already mapped through `src/game/adapters.ts` and `DeploymentState`, the battle UI can fail to resolve labels, sprites, or deployment aliases.

Safe rule:

- only use scenario unit `type` values that exist in `src/data/unitTypes.json`
- for player-facing scenario units, prefer types already present in `src/game/adapters.ts`
- if a new player-facing type is required, add the alias/template support in the deployment adapter layer as part of the same mission work

## Required Mission Package
Before implementation, the AI dev should fill out this exact structure. Do not leave sections blank.

```yaml
missionKey:
title:
shortLabel:
missionType: training | patrol | assault | campaign | custom
unlockTier: rookie | intermediate | veteran | custom
routeType: precombat | campaign | custom
tutorialMode: none | training | mission_specific | optional
persistenceMode: single_battle | multi_stage | campaign_carryover

playerFantasy:
intendedExperience:
historicalFraming:
gameplayRole:

uiCopy:
  landingBriefing:
  precombatSummary:
  commanderIntent:
  expectedResistance:
  terrainSummary:
  objectiveSummary:
  victoryDebrief:
  failureDebrief:

map:
  theater:
  sizeClass: small | medium | large
  footprintGuidance:
  terrainPalette:
  landmarks:
  coverProfile:
  losProfile:
  chokepoints:
  alternateRoutes:
  elevationNotes:
  roadMobilityLogic:
  deploymentEdges:
    allied:
    enemy:
  weather:
  visibility:

objectives:
  primary:
    - id:
      type:
      label:
      purpose:
      placementLogic:
      successCondition:
  secondary:
    - id:
      type:
      label:
      purpose:
      successCondition:
  hiddenHooks:
  victoryConditions:
  defeatConditions:
  turnPressure:
  controlLogic:

forces:
  allies:
    concept:
    quality:
    roles:
      - role:
        countGuidance:
        notes:
    supportAssets:
  enemies:
    concept:
    quality:
    roles:
      - role:
        countGuidance:
        notes:
    reserves:
    reinforcements:
    supportAssets:

deployment:
  alliedStart:
  enemyStart:
  firstContactExpectation:
  reserveStaging:
  neutralZones:
  spawnSafetyNotes:
  openingShape: scripted | semi_scripted | open

aiPlan:
  doctrine:
  aggressionProfile:
  defenseProfile:
  reserveTriggers:
  fallbackRules:
  counterattackRules:
  objectivePriority:
  supportBehavior:

pacing:
  openingPhase:
  midpointShift:
  climaxCondition:
  reinforcementTiming:
  failForwardOptions:
  missionDurationTarget:

difficulty:
  easy:
  normal:
  hard:
  veteran:
  scalingAxes:

technical:
  scenarioFile:
  requiresNewMissionKey:
  metadataChanges:
  routingChanges:
  precombatChanges:
  missionRulesChanges:
  validationChanges:
  deploymentAliasChanges:
  saveLoadImplications:
  testHooks:

qa:
  expectedObjectiveCount:
  alliedUnitCountRange:
  enemyUnitCountRange:
  landmarkZones:
  firstContactWindow:
  victoryTests:
  defeatTests:
  edgeCases:
  regressionRisks:
```

## Required File Edits
This is the concrete implementation checklist.

### 1. Mission key and selection state
File:

- `src/state/UIState.ts`

Do this when:

- the mission uses a brand-new `missionKey`

Required change:

- add the new mission key to the `MissionKey` union if it is intended to behave as a first-class selectable mission

Notes:

- `UIState.selectedMission` rejects unknown keys
- if the key is not valid here, landing selection breaks immediately

### 2. Mission metadata
File:

- `src/data/missions.ts`

Always update this file for a new mission.

Required sections:

- `missionTitles`
- `missionBriefings`
- `missionSummaryPackages`
- `missionCategories`
- `missionDeploymentProfiles`

Update these only if the mission needs them:

- difficulty-specific turn limit helpers such as `RIVER_WATCH_TURN_LIMIT_BY_DIFFICULTY`
- `getMissionTurnLimit()`
- `getMissionSummaryPackage()`

What this file controls:

- landing title and briefing
- precombat objective list
- precombat doctrine text
- precombat baseline supplies text
- deployment-zone doctrine checks used by scenario validation

### 3. Scenario JSON
File:

- `src/data/scenario_<slug>.json`

Always create or update a scenario file for a new mission.

Minimum required shape:

```json
{
  "name": "Mission Name",
  "size": { "cols": 20, "rows": 16 },
  "tilePalette": {},
  "tiles": [],
  "objectives": [],
  "deploymentZones": [],
  "turnLimit": 12,
  "playerBudget": 250000,
  "allowedUnits": [],
  "restrictedUnits": [],
  "sides": {
    "Player": {
      "hq": [0, 0],
      "general": { "accBonus": 0, "dmgBonus": 0, "moveBonus": 0, "supplyBonus": 0 },
      "units": []
    },
    "Bot": {
      "hq": [0, 0],
      "general": { "accBonus": 0, "dmgBonus": 0, "moveBonus": 0, "supplyBonus": 0 },
      "units": []
    }
  }
}
```

### 4. Scenario registry
File:

- `src/data/scenarioRegistry.ts`

Always update this file for a new mission.

Required change:

- import the new scenario JSON
- add `missionKey -> scenario` mapping to `scenarioSourcesByMissionKey`

Notes:

- `PrecombatScreen` and `BattleScreen` both resolve scenarios through this registry
- if the mission key is missing here, the mission cannot load

### 5. Scenario validation profile
File:

- `src/data/scenarioValidation.ts`

Always update this file for a new mission scenario.

Required change:

- add a new profile under `scenarioProfilesByName`

Minimum fields:

- `scenarioName`
- `allowedMissionKeys`
- `minCols`
- `minRows`
- `minObjectiveCount`
- `minObjectiveSpacing`
- `minRangeBuffer`

Notes:

- validation runs during scenario resolution
- the profile name must match the scenario JSON `name`
- if you reuse an existing scenario for an existing mission key, the mission key must still be listed in `allowedMissionKeys`

### 6. Mission rules
File:

- `src/state/missionRules.ts`

Update this file whenever the mission has custom objectives or fail states.

Examples that require explicit mission rules:

- hold for N turns
- escort or extraction
- secondary objective tracking
- phased announcements
- difficulty-sensitive escalation
- custom victory or defeat reasons

Notes:

- objective hexes in JSON are only spatial anchors
- mission outcome logic belongs here
- if the briefing promises special rules, they must exist here

### 7. Landing integration
File:

- `src/ui/screens/LandingScreen.ts`

Update this file when the new mission changes player access or route behavior.

Possible required changes:

- add the mission to the canonical mission order
- update `getMissionsForGeneral()` unlock gating
- update `handleMissionSelection()` if the mission needs a route other than normal precombat flow

Notes:

- standard missions should still route Landing -> Precombat
- only campaign-style or custom flows should bypass standard precombat routing

### 8. Deployment alias support
Files:

- `src/game/adapters.ts`
- `src/state/DeploymentState.ts`

Update these only when the mission introduces a new player-facing unit type that is not already covered by the deployment templates.

Required change:

- add or align the allocation key -> scenario unit type mapping

Notes:

- this is not usually needed for missions that only reuse existing scenario unit types
- this is required if player units on the map or in reserve cannot be resolved back to a known allocation alias

## Scenario JSON Contract
The current runtime expects the following behavior from scenario files.

### `name`
- Required
- Used by validation profiles
- Used in logs and scenario assertions

### `size`
- Required
- `tiles.length` must equal `rows`
- every tile row must have exactly `cols` entries

### `tilePalette`
- Required
- Every tile key used in `tiles` must resolve to a palette entry
- Deployment validation uses `terrainType` to reject invalid deployment hexes

### `tiles`
- Required
- May use string tile keys or richer tile objects
- Must match the declared map dimensions exactly

### `objectives`
- Required
- Current structure is spatial and simple: `{ "hex": [col, row], "owner": "Player" | "Bot", "vp": number }`
- Custom objective meaning is derived in `missionRules.ts`

### `deploymentZones`
- Required for authored missions
- Each zone needs:
  - `key`
  - `label`
  - `description`
  - `capacity`
  - `faction`
  - `hexes`

Validation enforces:

- unique zone keys
- in-bounds hexes
- no duplicate hexes inside a zone
- no overlap across zones
- enough usable hexes for declared capacity
- enough player capacity, frontage, and depth for the mission's deployment doctrine

### `turnLimit`
- Optional at the schema level but should be present for authored missions
- Precombat can override displayed turn limit from `missions.ts`
- Mission rules can treat very large values as effectively open-ended

### `playerBudget`
- Optional
- If absent, precombat falls back to the default budget
- If present, this value drives the requisition budget shown in precombat

### `allowedUnits` and `restrictedUnits`
- Optional
- Read by `PrecombatScreen`
- `allowedUnits` acts as an allow-list
- `restrictedUnits` blocks entries even if they are otherwise available
- supply convoys remain available unless explicitly restricted

### `sides.Player.units`
- Use for baseline troops that belong to the scenario itself
- Mark true starting troops with `preDeployed: true`
- Do not use this list to silently grant extra requisition units that should come from precombat

### `sides.Bot.units`
- Enemy roster for the scenario
- Must use valid unit types from `unitTypes.json`

## Validation And Runtime Checks You Must Satisfy
These are the most important real failure conditions in the current codebase.

### Scenario validation failures
These come from `src/data/scenarioValidation.ts`:

- missing or unknown `scenario.name`
- scenario name not registered in validation profiles
- mission key not approved for the scenario profile
- map too small for profile minimums
- map too small for the longest non-air weapon range plus buffer
- too few objectives
- objectives too tightly clustered
- missing deployment zones
- overlapping or malformed deployment zones
- player deployment area too small for the mission deployment doctrine
- unknown unit types in `sides`

### Precombat failures
These come from `src/ui/screens/PrecombatScreen.ts`:

- scenario does not declare deployment zones
- scenario budget/restrictions are malformed
- the resolved scenario is not the one the mission expects

### Battle handoff failures
These come from `src/ui/screens/BattleScreen.ts`:

- mission key does not resolve to the correct scenario
- battle activation does not preserve the selected mission
- committed precombat allocations are missing when deployment should begin
- custom scenario player units do not map back to a known deployment alias

## Battle Activation Contract
Any new mission must satisfy this contract:

1. Landing sets `uiState.selectedMission` to the intended mission key.
2. Precombat resolves the same mission key through `getScenarioByMissionKey()`.
3. Precombat records committed deployment entries before showing battle.
4. Battle refreshes the scenario on `screen:shown` and rebuilds mission state when the active mission session changes.
5. The scenario shown in battle must match the scenario selected in landing/precombat.

This matters because the battle screen does not assume the startup scenario is still valid. It refreshes on activation. Any new mission route must preserve that behavior.

## Recommended Authoring Workflow

### Step 1: Write the design doc
Create `docs/missions/<mission-slug>.md` with the filled Mission Package.

This file is not required by runtime code, but it should exist for any non-trivial mission so future AI devs and QA can see the design intent.

### Step 2: Add mission metadata
Implement the `missionKey`, title, briefing, summary package, category, and deployment doctrine in `src/data/missions.ts`.

### Step 3: Build the scenario JSON
Author the map, objectives, deployment zones, side rosters, budget, and unit restrictions.

### Step 4: Register and validate the scenario
Wire the new file into `scenarioRegistry.ts` and add a validation profile in `scenarioValidation.ts`.

### Step 5: Implement mission rules
If the mission has any rule more specific than "fight until turn limit or elimination", implement it in `missionRules.ts`.

### Step 6: Wire landing availability and route
Update `LandingScreen.ts` if the mission needs unlock, ordering, or route changes.

### Step 7: Verify end to end
Run through:

- landing selection
- precombat summary
- budget and allowed-unit filtering
- deployment zone registration
- battle map activation
- objective logic
- mission completion

## Definition Of Done
A mission is done only when all of these are true:

- the mission has a complete Mission Package
- the mission is selectable from landing
- the mission title and briefing render correctly
- precombat shows correct objectives, turn limit, doctrine, and supplies
- the correct scenario loads in both precombat and battle
- deployment zones register without validation errors
- allowed and restricted units behave correctly
- custom mission objectives and fail states are implemented in `missionRules.ts`
- battle end conditions match the briefing
- the mission survives a manual Landing -> Precombat -> Battle verification pass

## AI-Ready Prompt Template
Use this prompt when asking an AI dev to create a mission with minimal follow-up:

```text
Implement one new Four Star General mission using:
- docs/MISSION_DESIGN_GUIDE.md as the implementation guide
- docs/four_star_general_mission_creation_agent_spec.md as the mission-package content spec

Deliver all required work for a complete mission:
1. Mission package documentation in docs/missions/<mission-slug>.md
2. Mission key and metadata wiring
3. Scenario JSON
4. Scenario registry entry
5. Scenario validation profile
6. Mission rules implementation
7. Landing/precombat/battle integration
8. Verification notes

Mission inputs:
- missionKey:
- title:
- missionType:
- unlockTier:
- routeType:
- theater:
- player fantasy:
- gameplay role:
- primary objective:
- secondary objectives:
- defeat condition:
- map concept:
- allied force concept:
- enemy force concept:
- difficulty notes:

Constraints:
- Do not leave the mission as briefing-only placeholder content.
- If custom objective logic is required, implement it in src/state/missionRules.ts.
- If a new player-facing scenario unit type is introduced, update deployment alias/template support too.
- Verify the mission through Landing -> Precombat -> Battle.
```

## Best Existing Reference
Use River Crossing Watch as the current in-repo example of a mission that goes beyond the default placeholder flow:

- `docs/missions/river-crossing-watch.md`
- `src/data/scenario_river_watch.json`
- `src/data/scenarioRegistry.ts`
- `src/data/scenarioValidation.ts`
- `src/state/missionRules.ts`
- `src/data/missions.ts`

It is the best current reference for:

- a mission-specific scenario file
- mission-specific validation
- mission-specific objectives
- difficulty-sensitive turn handling
- custom patrol identity
