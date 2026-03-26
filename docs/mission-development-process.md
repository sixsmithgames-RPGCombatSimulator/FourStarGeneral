# Mission Development Process (AI Dev)

This document is the execution checklist for implementing a mission after the design is clear.

Use it with:

- `docs/MISSION_DESIGN_GUIDE.md` for the exact architecture and file responsibilities
- `docs/four_star_general_mission_creation_agent_spec.md` for the required Mission Package contents

## Prerequisite
Do not start coding until the mission has a complete Mission Package.

At minimum, the package must already define:

- mission key
- mission type
- routing mode
- unlock tier
- gameplay role
- map concept
- objective logic
- allied and enemy force concepts
- pacing and escalation
- difficulty tuning
- UI copy
- QA expectations

## Deliverables
Every new mission implementation should end with all of these:

1. A mission design document in `docs/missions/<mission-slug>.md`
2. Runtime metadata in `src/data/missions.ts`
3. A scenario file in `src/data/scenario_<slug>.json`
4. A registry entry in `src/data/scenarioRegistry.ts`
5. A validation profile in `src/data/scenarioValidation.ts`
6. Mission rules in `src/state/missionRules.ts` when custom logic exists
7. Any required landing-route or unlock changes
8. Verification notes

## Phase 1: Design Lock
Before implementation, confirm these decisions are fixed:

- `missionKey`
- `routeType`
- `unlockTier`
- whether the mission reuses existing systems or requires custom rules
- whether the mission introduces any new player-facing unit types

If any of those are still undecided, stop and finish the design first.

## Phase 2: Mission Metadata
File:

- `src/data/missions.ts`

Required work:

- add title
- add landing briefing
- add precombat summary package
- add mission category
- add deployment doctrine profile

Add difficulty-specific turn helpers only if the mission needs them.

Gate to pass before moving on:

- the mission key resolves title and briefing correctly
- precombat summary content is truthful to the mission design

## Phase 3: Scenario Authoring
File:

- `src/data/scenario_<slug>.json`

Required work:

- define `name`
- define `size`
- define `tilePalette`
- define `tiles`
- define `objectives`
- define `deploymentZones`
- define `turnLimit`
- define `playerBudget` when needed
- define `allowedUnits` and `restrictedUnits` when needed
- define `sides.Player`
- define `sides.Bot`

Rules:

- scenario map dimensions must be exact
- deployment zones must be valid and non-overlapping
- only baseline player troops should live in the scenario roster
- use `preDeployed: true` for player units that start on the map

Gate to pass before moving on:

- the scenario file is structurally complete
- all unit types are valid
- objectives and deployment zones match the mission package

## Phase 4: Registry And Validation
Files:

- `src/data/scenarioRegistry.ts`
- `src/data/scenarioValidation.ts`

Required work:

- import and register the new scenario
- add a validation profile for the scenario name
- approve the intended mission key in `allowedMissionKeys`

Gate to pass before moving on:

- `getScenarioByMissionKey()` can resolve the mission
- the scenario name exactly matches the validation profile name

## Phase 5: Mission Rules
File:

- `src/state/missionRules.ts`

Required only when the mission includes custom behavior such as:

- hold-for-N-turn objectives
- defend or deny logic
- extraction logic
- secondary objective tracking
- phased announcements
- mission-specific defeat reasons

Rules:

- do not rely on JSON alone for custom mission behavior
- every promise in the mission briefing must be backed by rules here

Gate to pass before moving on:

- objective state changes are possible
- victory and defeat reasons are explicit

## Phase 6: Landing And Route Integration
File:

- `src/ui/screens/LandingScreen.ts`

Update this file when needed for:

- unlock gating
- mission ordering
- route changes

Common tasks:

- add the new mission to canonical order
- update `getMissionsForGeneral()`
- update `handleMissionSelection()` if the route is not standard precombat

Gate to pass before moving on:

- the mission appears for the correct commanders
- the mission launches into the correct flow

## Phase 7: Unit Alias Support
Files:

- `src/game/adapters.ts`
- `src/state/DeploymentState.ts`

Only do this when the mission introduces a new player-facing scenario unit type.

Required work:

- add or align allocation key to scenario type mapping
- ensure the unit can resolve to labels and sprites during deployment and battle

Gate to pass before moving on:

- player-facing scenario units do not produce alias-resolution errors

## Phase 8: Manual Verification
Run the mission through the real flow:

1. Select the mission from the landing screen.
2. Confirm landing title and briefing.
3. Enter precombat.
4. Confirm objectives, doctrine, supplies, turn limit, budget, and allowed-unit filtering.
5. Confirm deployment zones register correctly.
6. Proceed to battle.
7. Confirm the correct map loads.
8. Confirm custom objective logic works.
9. Confirm victory and defeat resolution matches the mission design.

## Phase 9: Automated Verification
When code changes are part of the mission work, run the repo checks:

- `npm run build`
- `npm run test`
- `npm run lint`

If any check is skipped, say so in the implementation notes.

## Final Review Checklist
Before closing the work, verify all of the following:

- mission key is valid
- mission metadata is complete
- scenario file is registered
- scenario validation profile exists
- custom rules exist when the mission requires them
- landing access and routing are correct
- battle activation uses the intended scenario
- documentation matches the final implementation

## Failure Patterns To Avoid

- adding a mission briefing without a scenario file
- adding a scenario file without a validation profile
- encoding custom objective behavior only in prose
- forgetting deployment zones
- putting requisition-only player forces directly into the scenario roster
- introducing a new player-facing scenario unit type without alias support
- assuming battle will keep the right scenario without mission-session refresh
