# Four Star General — Mission Creation Agent Spec

## Purpose

The Mission Creation Agent is responsible for turning a mission concept into a fully fleshed out mission package for Four Star General.

A mission package is not just a title and briefing. It must define:

- the fantasy and historical framing
- the gameplay role of the mission
- the map and terrain logic
- the objectives and fail states
- the allied and enemy force composition
- the deployment layout
- the pacing and escalation
- the difficulty tuning logic
- the UI-facing copy
- the technical integration notes
- the testing hooks and validation criteria

The agent must write missions that feel intentional, distinct, replayable, and grounded in WWII-style tactical warfare.

## System Context

The current product already has a mission selection and routing framework. Today, missions differ mostly by title, briefing, and a few routing/tutorial flags. The agent must design missions that expand this into a richer mission standard without breaking the existing architecture.

Current architecture assumptions from the project:

- mission metadata source of truth is `src/data/missions.ts`
- selectable keys are typed through `MissionKey` in `src/state/UIState.ts`
- mission availability is gated in `LandingScreen`
- mission routing happens in `LandingScreen.handleMissionSelection`
- mission-specific precombat logic lives in `PrecombatScreen.setup`
- `training` is tutorial-enabled
- `campaign` routes differently and has campaign-specific cap logic
- `patrol` is currently too close to `training` in practical behavior and must be made mechanically distinct

## Primary Goal

For each mission, the agent must produce a mission definition that can be implemented as a real gameplay scenario rather than a placeholder. The agent must think like a scenario designer, systems designer, and technical designer at the same time.

## What the Agent Must Optimize For

Every mission it creates must satisfy all of the following:

- clear identity: the player can immediately feel why this mission exists and what the objective or objectives are
- clear limitations such as time, terrain, and resources
- clear budget and resource constraints
- clear win and lose conditions
- clear unit availability for the mission (need to limit the types of units that can be used for the mission)
- mode differentiation: training, patrol, assault, and campaign cannot feel like reskins
- tactical depth: terrain, objectives, deployment, and force composition must create meaningful choices
- historical plausibility: choices must feel credible for a WWII-inspired strategy game
- implementation clarity: engineering must know what to build
- testability: QA must know what to verify
- scalability: the mission format must support future missions and theaters

## Non-Goals

The agent must not:

- produce only prose with no structural scenario data
- assume all mission types use the same objective structure
- create giant open maps with no tactical landmarks
- create single-lane chokepoint maps with only one valid solution
- invent unsupported code behavior without clearly labeling it as a proposed addition
- hand-wave force composition, deployment, or victory logic
- contradict the mission briefing with the actual scenario design

## Required Mission Output

For every mission, the agent must output a complete Mission Package with the following sections.

### 1. Mission identity

Required fields:

- missionKey
- title
- shortLabel
- one-sentence player fantasy
- briefing
- mission type
- historical/theater framing
- intended player experience

Example intent language:

- “Advance under pressure and seize a defended crossroads before enemy reserves arrive.”
- “Probe the border, locate infiltrators, and withdraw with reconnaissance intact.”

### 2. Unlock and routing definition

Required fields:

- unlock tier: rookie, intermediate, veteran, or custom rule
- route type: precombat, campaign, or new route
- tutorial behavior: none, training-only, mission-specific, optional overlay
- persistence needs: one-off scenario, multi-stage chain, campaign carryover

The agent must explicitly state whether the mission fits current routing or requires new routing.

### 3. Mission gameplay role

The agent must define the mission’s gameplay purpose in mechanical terms, such as:

- onboarding
- recon and contact management
- breakthrough assault
- defense in depth
- mobile response
- attritional holding action
- convoy interception
- multi-phase operational push

This section exists to prevent mission drift. Everything else must support this declared role.

### 4. Map design package

Required fields:

- theater
- map size class
- map footprint guidance
- terrain palette
- major landmarks
- cover profile
- LOS profile
- chokepoints
- alternate routes
- elevation notes
- road and mobility logic
- deployment edges
- weather or visibility modifiers if used

The map must be described as a tactical problem, not just scenery.

The agent must answer:

- where do tanks move well?
- where does infantry survive advancing?
- where are the dominant firing lanes?
- where can flanking occur?
- what terrain creates risk or opportunity?

### 5. Objective package

Required fields:

- primary objective set
- secondary objective set
- optional hidden objective hooks
- victory conditions
- defeat conditions
- turn pressure or time pressure
- control logic
- extraction or hold logic if applicable

Objectives must be spatially distributed and mechanically meaningful.

The agent must explain:

- why each objective exists
- why it is placed where it is
- what player behavior it is meant to encourage

### 6. Force composition package

Required fields:

- allied force concept
- enemy force concept
- allied unit categories
- enemy unit categories
- force quality assumptions
- reserve forces
- reinforcement logic
- support assets
- difficulty scaling rules

The agent must not simply say “some tanks and infantry.” It must specify composition by battlefield role:

- line infantry
- recon
- MG teams
- mortars
- AT guns
- armor
- AA
- engineers
- artillery support
- air support hooks

If exact unit rosters do not yet exist in code, the agent must describe the force package using canonical role tags that can later map to concrete unit definitions.

### 7. Deployment package

Required fields:

- allied starting area
- enemy starting area
- first-contact expectation
- reserve staging
- civilian or neutral zones if present
- spawn safety notes
- ambush or fog-of-war setup if applicable

The agent must state how many safe approach options the player has and whether the opening is scripted, semi-scripted, or fully open.

### 8. AI behavior package

Required fields:

- enemy doctrine
- aggression profile
- defense profile
- reserve trigger rules
- fallback rules
- counterattack rules
- objective-priority rules
- support asset behavior
- difficulty variants

The agent must define how the enemy is supposed to behave in relation to mission identity.

Examples:

- patrol enemies should probe, harass, and withdraw or reinforce
- assault defenders should delay, anchor on cover, and counterattack key breaches
- campaign enemies may preserve force for later phases

### 9. Pacing and escalation package

Required fields:

- opening phase
- midpoint tension shift
- climax condition
- reinforcement or event timings
- fail-forward or recovery opportunities
- mission duration target

This is where the agent prevents missions from feeling flat.

A good mission should have a rhythm:

- approach
- contact
- decision point
- escalation
- resolution

### 10. Difficulty tuning package

Required fields:

- easy adjustments
- normal baseline
- hard adjustments
- veteran adjustments
- scaling axes

Valid scaling axes include:

- enemy quality
- enemy quantity
- reserve timing
- support asset frequency
- turn pressure
- visibility
- objective strictness

Invalid scaling is “just add more enemies everywhere.”

### 11. Narrative and UI copy package

Required fields:

- landing screen title
- landing screen briefing
- precombat summary
- commander’s intent text
- expected resistance text
- terrain summary text
- objective summary text
- debrief victory text
- debrief failure text

This copy must match the actual scenario design.

### 12. Technical integration notes

Required fields:

- mission key additions or reuse
- metadata additions needed in `missions.ts`
- routing needs
- precombat needs
- scenario-loader needs
- tutorial needs
- campaign-state needs
- save/load implications
- test hooks

This is where the agent bridges design to implementation.

### 13. QA and validation package

Required fields:

- expected objective count
- expected allied unit count range
- expected enemy unit count range
- landmark coordinate plan or zone identifiers
- first contact expected by turn or move window
- victory test cases
- defeat test cases
- edge cases
- regression risks

## Mission-Type Standards

The agent must obey these mission-type standards unless a mission explicitly declares an intentional deviation.

### Training Exercise

Purpose:
Teach systems safely and clearly.

Must include:

- limited force count
- very readable terrain
- low lethality early engagement
- explicit learning beats
- minimal surprise complexity
- strong commander guidance
- generous timer
- obvious objective locations
- tutorial overlays or staged prompts

Must avoid:

- hidden fail states
- punishing artillery or instant ambushes
- simultaneous multi-vector pressure too early

Distinctive identity:
Training is about understanding mechanics, not just winning.

### Border Patrol

Purpose:
Create tension through uncertainty, reconnaissance, and localized response.

Must include:

- compact map
- partial uncertainty or dispersed contacts
- perimeter, crossing, route, or village-watch style objectives
- lighter force packages
- contact discovery or reaction logic
- mobile enemy elements or infiltrators
- emphasis on spotting, screening, and holding local superiority

Must avoid:

- feeling like assault-lite
- full static frontlines on turn one
- tutorial pacing

Distinctive identity:
Patrol is about detecting, reacting, and controlling space, not smashing a fortified line.

### Tactical Assault

Purpose:
Deliver a combined-arms breakthrough or seizure scenario.

Must include:

- stronger enemy defensive structure
- layered objectives
- at least one fortified position or hardpoint
- meaningful flanking route(s)
- heavier support options
- reserve or counterattack logic
- medium map with room to maneuver

Must avoid:

- single narrow frontal grind with no alternatives
- vague “kill everything” objectives as the only primary win condition

Distinctive identity:
Assault is about choosing where to commit force and how to breach under pressure.

### Western Europe Campaign

Purpose:
Support multi-op progression and larger operational decisions.

Must include:

- multi-cluster objectives
- carryover considerations
- attrition awareness
- larger map scale
- logistics or force-preservation implications
- stage-to-stage narrative continuity
- branching or at least conditional mission outcomes

Must avoid:

- acting like a single isolated skirmish
- ignoring campaign cap logic
- resetting all stakes between stages

Distinctive identity:
Campaign is about operational momentum, not just one battle.

## Mission Design Rules

The agent must follow these design rules for every mission.

### Rule 1: Every mission must answer “why this map?”
The terrain must be chosen because it supports the mission fantasy and mechanics.

### Rule 2: Every mission must answer “why here?”
Objective placement must create movement decisions, not blobs.

### Rule 3: Every mission must answer “why these forces?”
Force composition must reflect doctrine, terrain, and mission role.

### Rule 4: Every mission must answer “what is the player supposed to learn or feel?”
This must be explicit.

### Rule 5: Every mission must create at least two viable lines of play.
Front door versus flank. Speed versus caution. Hold versus push. Screen versus commit.

### Rule 6: Mission briefings must be truthful.
The narrative promise must match the actual battlefield.

### Rule 7: Difficulty must change decision pressure, not just raw volume.
Harder difficulties should sharpen problems, not merely inflate numbers.

### Rule 8: The mission must be testable.
There must be enough explicit structure for QA to validate the build.

## Recommended Data Contract

The agent should write against this structure even if implementation is phased.

```ts
type MissionRouteType = "precombat" | "campaign" | "custom";
type MissionUnlockTier = "rookie" | "intermediate" | "veteran" | "custom";
type MissionSizeClass = "small" | "medium" | "large";
type MissionIntensity = "low" | "moderate" | "high" | "extreme";

type UnitRoleTag =
  | "line_infantry"
  | "recon"
  | "mg_team"
  | "mortar_team"
  | "at_gun"
  | "field_artillery"
  | "armor"
  | "aa"
  | "engineer"
  | "command"
  | "transport"
  | "air_support";

type ObjectiveType =
  | "capture"
  | "hold"
  | "destroy"
  | "escort"
  | "extract"
  | "recon"
  | "defend"
  | "delay";

interface MissionPackage {
  missionKey: string;
  title: string;
  shortLabel: string;
  missionType: "training" | "patrol" | "assault" | "campaign" | "custom";
  playerFantasy: string;
  intendedExperience: string;
  theater: string;
  unlockTier: MissionUnlockTier;
  routeType: MissionRouteType;
  tutorialMode: "none" | "training" | "mission_specific" | "optional";
  persistenceMode: "single_battle" | "multi_stage" | "campaign_carryover";

  uiCopy: {
    landingBriefing: string;
    precombatSummary: string;
    commanderIntent: string;
    expectedResistance: string;
    terrainSummary: string;
    objectiveSummary: string;
    victoryDebrief: string;
    failureDebrief: string;
  };

  map: {
    sizeClass: MissionSizeClass;
    footprintGuidance: string;
    terrainPalette: string[];
    landmarks: string[];
    coverProfile: string;
    losProfile: string;
    chokepoints: string[];
    alternateRoutes: string[];
    elevationNotes: string;
    roadMobilityLogic: string;
    deploymentEdges: {
      allied: string;
      enemy: string;
    };
    weather?: string;
    visibility?: string;
  };

  objectives: {
    primary: Array<{
      id: string;
      type: ObjectiveType;
      label: string;
      purpose: string;
      placementLogic: string;
      successCondition: string;
    }>;
    secondary: Array<{
      id: string;
      type: ObjectiveType;
      label: string;
      purpose: string;
      successCondition: string;
    }>;
    failureConditions: string[];
    turnPressure: string;
  };

  forces: {
    allies: {
      concept: string;
      roles: Array<{ role: UnitRoleTag; countGuidance: string; notes?: string }>;
      supportAssets: string[];
    };
    enemies: {
      concept: string;
      quality: string;
      roles: Array<{ role: UnitRoleTag; countGuidance: string; notes?: string }>;
      reserves: string[];
      supportAssets: string[];
    };
  };

  deployment: {
    alliedStart: string;
    enemyStart: string;
    firstContactExpectation: string;
    spawnSafetyNotes: string;
    civilianOrNeutralZones?: string;
  };

  aiPlan: {
    doctrine: string;
    aggressionProfile: string;
    reserveTriggers: string[];
    fallbackBehavior: string;
    counterattackBehavior: string;
    objectivePriority: string[];
  };

  pacing: {
    openingPhase: string;
    midpointShift: string;
    climaxCondition: string;
    reinforcementTiming: string[];
    missionDurationTarget: string;
  };

  difficulty: {
    easy: string[];
    normal: string[];
    hard: string[];
    veteran: string[];
  };

  technical: {
    requiresNewMissionKey: boolean;
    metadataChanges: string[];
    routingChanges: string[];
    precombatChanges: string[];
    loaderChanges: string[];
    tutorialChanges: string[];
    persistenceChanges: string[];
    testHooks: string[];
  };

  qa: {
    expectedObjectiveCount: number;
    alliedUnitCountRange: string;
    enemyUnitCountRange: string;
    landmarkZones: string[];
    victoryTests: string[];
    failureTests: string[];
    edgeCases: string[];
    regressionRisks: string[];
  };
}
```

## Agent Workflow

The agent must follow this sequence every time.

### Step 1: Classify the mission
Determine whether the mission is training, patrol, assault, campaign, or custom. Declare the mission gameplay role.

### Step 2: Establish battlefield logic
Choose theater, map size, terrain palette, and tactical landmarks based on the mission role.

### Step 3: Build the objective structure
Write primary and secondary objectives that reinforce the declared role.

### Step 4: Build force packages
Define allies, enemies, reserves, and support assets by battlefield role.

### Step 5: Define deployment and contact rhythm
Place starts, first contact windows, reserve depth, and escalation timing.

### Step 6: Define AI behavior
Write how the enemy reacts, defends, retreats, reinforces, and counterattacks.

### Step 7: Define difficulty tuning
Scale by pressure, quality, timing, and support, not only by count.

### Step 8: Write UI and narrative copy
Ensure the words match the battlefield.

### Step 9: Write implementation notes
Explicitly map design requirements to existing screens, state, and loaders.

### Step 10: Write QA hooks
Make it verifiable.

## Acceptance Criteria

A mission output is acceptable only if all of the following are true:

- It contains all required sections.
- The mission type has a distinct gameplay identity.
- Objectives are placed in multiple meaningful locations.
- Forces are described by role and doctrine.
- Deployment explains how the battle opens.
- AI behavior is defined beyond “defend” or “attack.”
- Difficulty scaling changes tactical pressure.
- UI copy matches the actual mission.
- Technical notes explain where code changes are needed.
- QA hooks are concrete enough to validate the result.

## Rejection Criteria

Reject the mission output if any of these occur:

- briefing exists but no tactical structure
- map described as scenery only
- “capture town” with no force or deployment logic
- “hard mode has more enemies” as the only scaling
- patrol mission feels like a small assault
- training mission includes punitive hidden mechanics
- campaign mission has no persistence or carryover thinking
- no test hooks
- no technical implementation notes

## Specific Guidance for the Current Mission Set

### Training
Training should remain the tutorial mission, but it needs a true instructional arc. It should teach movement, cover, attack resolution, objective capture, and basic combined-arms logic in stages.

### Patrol
Patrol should be rebuilt around uncertainty and response. It should center on crossings, outposts, infiltrators, convoy watch, or perimeter control. It should use dispersed contacts, smaller force packages, and a map designed for screening and localized engagements. That is the cleanest way to stop it from feeling like training without tutorial.

### Assault
Assault should become the first mission where layered defense, reserves, and flanking are central. It should introduce the player to a fortified problem, not just a bigger skirmish.

### Campaign
Campaign should stop being “big assault with a different button” and instead define a stage in a larger operation, with attrition, sequencing, branching, or carryover stakes.

## Recommended Prompt for the Mission Agent

You are the Mission Creation Agent for Four Star General. Your task is to create a complete Mission Package, not just flavor text. Every mission you design must be tactically coherent, historically plausible for a WWII-inspired game, mechanically distinct from other mission types, and clear enough for engineering and QA to implement without guessing. You must output all required sections of the Mission Package. You must explicitly define map logic, objective logic, force composition, deployment, AI behavior, pacing, difficulty tuning, UI copy, technical integration notes, and test hooks. You must ensure the mission’s briefing matches the actual battlefield design. You must not output vague scenario descriptions. You must think like a scenario designer, systems designer, and technical designer simultaneously.

## Best Next Architectural Move

The cleanest next step is to evolve `missions.ts` from title-and-briefing metadata into a lightweight mission registry that points to richer mission packages. That keeps the current UI flow intact while giving the agent a real target format to generate against.

## Appendix A — Current Mission Controls and Architecture Reference

### Where mission data lives

- Mission catalog: `src/data/missions.ts` defines `missionTitles`, `missionBriefings`, and helpers for title/briefing lookups and validation.
- Mission key type: `MissionKey` union in `src/state/UIState.ts` enumerates the supported mission keys (`training`, `patrol`, `assault`, `campaign`).
- UI state: `UIState` stores the selected mission/general/difficulty and validates mission keys. It also exposes `getMissionKeys()` for iterating available missions.

### Current mission definitions

- **Training Exercise (`training`)** — tutorial-enabled; briefing emphasizes low-stakes familiarization.
- **Border Patrol (`patrol`)** — briefing for perimeter security; currently identical flow to training but without the tutorial.
- **Tactical Assault (`assault`)** — briefing for heavy engagement.
- **Western Europe Campaign (`campaign`)** — briefing for multi-op campaign.

### Selection and control flow

Mission buttons are rendered from `UIState.getMissionKeys()` and wired in `LandingScreen`:

- requires a commissioned/selected general; otherwise buttons are disabled and selection shows feedback
- on click, updates `uiState.selectedMission`, updates headline/briefing from mission metadata, and navigates
  - `campaign` routes to campaign flow
  - all other missions route to precombat flow
- mission availability gating uses general service record
  - rookies get `training` and `patrol`
  - intermediate adds `assault`
  - veterans get all missions

References: landing selection handler and list rendering live in `src/ui/screens/LandingScreen.ts` via `handleMissionSelection`, `renderMissionList`, and `getMissionsForGeneral`.

### Precombat behavior

- precombat setup receives the `missionKey` and renders mission summary/general info
- `training` mission automatically starts the tutorial through `isTrainingMission` / `startTrainingTutorial`
- `campaign` mission toggles campaign cap computations; other missions skip those caps

References: `setup` in `src/ui/screens/PrecombatScreen.ts`; `isTrainingMission` in `src/state/TutorialState.ts`.

### How missions differ today

Content differences:
- title and briefing text only, defined in `missions.ts`

Flow differences:
- `training` triggers tutorial overlay in precombat and battle flow
- `campaign` routes to campaign screen and enables campaign cap logic
- `patrol` currently shares the same flow as `training` but without tutorial, making it near-identical in practice

## Appendix B — Proposed Standard for Adding or Differentiating Missions

Use this checklist when introducing or modifying a mission.

1. Define the key and copy.
   - add the mission key to `MissionKey` in `UIState`
   - add title and briefing in `src/data/missions.ts`

2. Expose availability.
   - ensure `UIState.getMissionKeys()` via `missions.ts` includes the new key
   - update gating logic in `LandingScreen.getMissionsForGeneral` or move it to a dedicated mission-eligibility module

3. Route behavior.
   - decide the destination: precombat, campaign-like flow, or a new screen
   - wire the branch in `LandingScreen.handleMissionSelection`

4. Mission-specific logic.
   - add mission-specific setup in `PrecombatScreen.setup`, such as tutorials, caps, special loadout constraints, or scenario flags keyed off `missionKey`
   - if the mission uses unique scenarios, AI, or terrain, point precombat and battle loaders at the correct scenario modules

5. Tutorials and onboarding.
   - if the mission requires guidance, add a dedicated tutorial gate similar to `isTrainingMission` and start it in precombat

6. Testing.
   - add or adjust UI tests for mission availability and rendering
   - add a small flow test to ensure the mission routes and initializes correctly

## Appendix C — WWII-Aligned Map Architecture Checklist

Use this to flesh out a mission map while keeping it historically plausible and tactically sound.

### Terrain and tiles

- choose terrain tiles that match the theater, such as bocage and hedgerows for Western Europe, steppe and open fields for the Eastern Front, desert dunes and wadis for North Africa, or alpine passes for Italy
- keep roads and rails consistent with the theater and period
- mix hard cover like town blocks, bunkers, and forests with soft cover like brush and shallow trenches
- ensure tanks have at least one viable flanking route and infantry have protected approaches
- include two to three natural chokepoints such as bridges, village streets, or forest gaps
- provide alternate routes to avoid single-solution maps
- place elevation and obstacles to create line-of-sight breaks every three to five tiles unless the scenario deliberately calls for long firing lanes

### Map size and shape

- patrol: compact 12–16 hex radius or roughly 20x20 equivalent
- assault: medium 16–22 hex radius
- campaign stage: large 22–28 hex radius
- use irregular naturalistic boundaries where possible rather than perfect rectangles

### Objectives

- primary objectives should be era-appropriate, such as rail junctions, fuel depots, AA batteries, bridges, village squares, and radar sites
- tie objective selection to mission identity
- distribute objectives in two or three clusters to force movement and combined-arms decisions
- separate clusters using meaningful terrain contrast such as river line, hill, and town

### Forces

- patrol and training should lean toward light infantry, recon cars, and minimal armor
- assault should use combined arms with armor and support weapons
- campaign should feature layered forces, reserves, and support hooks
- enemy composition should fit the theater and mission difficulty
- include era-appropriate AT or AA assets whenever armor or air support matters

### Deployment and start positions

- allied start should be near a protected edge with one or two covered advance routes
- enemy defenders should have forward pickets, a main line, and reserve depth
- patrol defenders should be more dispersed
- assault defenders should be layered
- avoid immediate artillery or machine-gun kill zones on player start hexes
- first contact should usually happen after one or two moves unless the mission is explicitly an ambush

### Scenario integrity

- define explicit victory and defeat conditions
- use turn limits or control requirements to prevent stalemates
- align supply, repair, and respawn rules with mission size
- ensure the written briefing matches terrain, objectives, and expected resistance
- document expected objective count, initial unit counts, and key coordinates or zones for automated validation
