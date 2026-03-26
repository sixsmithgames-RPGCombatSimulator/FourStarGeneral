# Citadel Ridge

```yaml
missionKey: assault_citadel_ridge
title: Citadel Ridge
shortLabel: Ridge Assault
missionType: assault
unlockTier: veteran
routeType: precombat
tutorialMode: none
persistenceMode: single_battle

playerFantasy: Break a prepared fortress line with a full combined-arms assault, then overrun the ridge command position before the defenders can stabilize.
intendedExperience: A deliberate large-map assault where the player must stage an approach, survive open-ground fires, choose where to commit armor, and crack multiple fortified nodes under time pressure.
historicalFraming: Western Europe, late 1944. A defended ridge complex blocks the only serviceable road through rolling farmland and low uplands.
gameplayRole: Breakthrough assault against layered fortified defenders.

uiCopy:
  landingBriefing: Recon has identified a fortified ridge complex controlling the only road into the sector. Enemy infantry are already dug in, bunker guns cover the slopes, and heavy anti-air batteries protect the rear. Assemble a full assault group, break the outer batteries, and seize the command ridge before the defenders can regroup.
  precombatSummary: Conduct a large-scale assault against Citadel Ridge. You begin with no predeployed troops but a major requisition budget and broad combined-arms access. Advance from the western assembly area, crack the outer works, and seize the ridge command post.
  commanderIntent: Mass artillery and armor on one shoulder of the approach, suppress the bunker guns, then force the ridge before the enemy reserve armor and interceptors can recover the line.
  expectedResistance: Heavy. Entrenched infantry, assault-gun strongpoints, anti-tank coverage, rear artillery, flak 88 batteries, light armor, and two interceptor elements are in position.
  terrainSummary: Mostly open plains and rolling hills. A single road drives straight toward the ridge, while low northern and southern rises offer slower flanking options and hull-down firing positions.
  objectiveSummary: Capture at least three of the four fortified strongpoints, including the command ridge. Optional objectives focus on neutralizing the flak batteries and bunker guns.
  victoryDebrief: Citadel Ridge is in friendly hands. The bunker line is broken, the road corridor is open, and the enemy defensive belt in this sector has collapsed.
  failureDebrief: The attack stalled short of the command ridge. Enemy artillery and fortified guns held long enough to preserve the defensive line.

map:
  theater: Western Europe
  sizeClass: large
  footprintGuidance: 24 columns by 18 rows. Long western approach, broad central killing ground, two hill shoulders, and a fortified eastern ridge complex.
  terrainPalette:
    - plains
    - hill
    - road
    - trench field
    - bastion strongpoint
  landmarks:
    - western assembly fields
    - central approach road
    - north battery ridge
    - south battery ridge
    - central citadel gate
    - eastern command ridge
  coverProfile: Sparse cover on the approach, moderate protection on the flanking hills, and very strong cover on bunker and bastion hexes.
  losProfile: Long central firing lanes dominate the road approach, but broken hill contours on both shoulders create alternate firing positions and approach windows.
  chokepoints:
    - central road approach
    - north battery saddle
    - south battery saddle
  alternateRoutes:
    - northern hill shoulder approach into the north battery
    - southern rise approach into the south battery and rear artillery pocket
  elevationNotes: The defender sits on a stepped ridge line. Outer batteries occupy forward rises, while the command ridge sits deeper and slightly higher behind them.
  roadMobilityLogic: The main road is the fastest route for armor and logistics, but it is also the most heavily covered lane. Flank movement across hills is slower yet safer.
  deploymentEdges:
    allied: western edge assembly sectors
    enemy: eastern ridge complex and rear gun line
  weather: Clear, dry ground
  visibility: Daylight with long-range observation across open fields

objectives:
  primary:
    - id: primary_break_ridge
      type: capture
      label: Seize the command ridge and at least three strongpoints
      purpose: Forces a true breakthrough instead of a passive attritional fight.
      placementLogic: Strongpoints are spread across the north battery, south battery, central citadel, and the deeper command ridge to make the player choose a main effort and supporting axis.
      successCondition: Player or ally units occupy at least three objective hexes, and one of them must be the command ridge.
  secondary:
    - id: secondary_destroy_flak
      type: destroy
      label: Destroy both flak batteries
      purpose: Encourages pressure against the rear line instead of only skirmishing around the front bunkers.
      successCondition: No Flak_88 units remain operational.
    - id: tertiary_silence_bunkers
      type: destroy
      label: Silence the bunker guns
      purpose: Rewards methodical reduction of the two assault-gun bastions anchoring the line.
      successCondition: No Assault_Gun units remain operational.
  hiddenHooks:
    - Turn 5 marks the defender transition from prepared fires to local counterattack behavior.
    - Turn 9 or control of two strongpoints marks the final counterattack window.
  victoryConditions:
    - Capture the command ridge and any two additional strongpoints.
    - Total enemy collapse also counts as victory.
  defeatConditions:
    - Turn limit expires before the command ridge and two additional strongpoints are secured.
    - All friendly combat units are destroyed.
  turnPressure: Normal baseline 17 turns, with easier and harder variants altering the assault window.
  controlLogic: Objective control is evaluated by current occupancy of authored objective hexes. The command ridge is mandatory.

forces:
  allies:
    concept: Large requisitioned assault force assembled specifically for a deliberate ridge attack.
    quality: Regular to veteran depending on player purchases.
    roles:
      - role: line_infantry
        countGuidance: 4-8 battalions
        notes: Needed to occupy the ridge after armor and artillery crack the line.
      - role: engineer
        countGuidance: 1-3 companies
        notes: Best suited for closing on bastions and trench lines.
      - role: armor
        countGuidance: 2-5 companies
        notes: Mediums, heavies, tank destroyers, and assault guns all have valid roles.
      - role: field_artillery
        countGuidance: 2-4 batteries
        notes: Suppression is essential before crossing open ground.
      - role: aa
        countGuidance: 0-2 batteries
        notes: Useful if the player wants local air denial against interceptors.
      - role: air_support
        countGuidance: 0-3 wings
        notes: Fighters and strike aircraft are viable but face strong AA resistance.
      - role: transport
        countGuidance: 0-2 columns
        notes: Helpful for sustainment over the long approach.
    supportAssets:
      - large requisition budget
      - open deployment frontage
      - no mandatory baseline units
  enemies:
    concept: Fortified combined-arms garrison holding a ridge roadblock.
    quality: Regular defenders with veteran fire-support crews in the core strongpoints.
    roles:
      - role: line_infantry
        countGuidance: 8-10 platoon-scale defenders
        notes: Entrenched across trenches, reverse slopes, and objective pockets.
      - role: engineer
        countGuidance: 2-3 teams
        notes: Supports fortifications and close defense near bastions.
      - role: at_gun
        countGuidance: 3-4 guns
        notes: Covers the road and both hill approaches.
      - role: aa
        countGuidance: 2 heavy batteries
        notes: Flak 88 guns double as long-range anti-armor anchors.
      - role: field_artillery
        countGuidance: 3 batteries
        notes: Rear guns range the approach corridor.
      - role: armor
        countGuidance: 3-5 vehicles
        notes: Light tanks and mobile anti-tank assets counterattack local breaches.
      - role: air_support
        countGuidance: 2 interceptor wings
        notes: Contest player air support over the objective belt.
    reserves: Light tanks and mobile anti-tank assets positioned behind the citadel for local counterattacks.
    reinforcements: None spawned dynamically in the current implementation; pressure is represented through depth and surviving reserve units already on map.
    supportAssets:
      - prepared fortifications
      - entrenched bunker guns
      - rear artillery line
      - overlapping flak umbrella

deployment:
  alliedStart: Two western assembly sectors on rolling farmland, centered on the road and outside the enemy artillery envelope.
  enemyStart: Layered ridge defense from the forward batteries to the command ridge, with artillery and flak in the rear pocket.
  firstContactExpectation: Long-range fire begins early, but decisive contact usually starts around turns 2-4 as the player reaches the outer hill shoulders.
  reserveStaging: Enemy light armor and tank-destroyer assets wait behind the central citadel and can surge toward either breach.
  neutralZones: None.
  spawnSafetyNotes: Player deployment begins outside direct artillery range and outside immediate bunker-gun LOS, though the road approach becomes dangerous once the advance starts.
  openingShape: open

aiPlan:
  doctrine: Hold the ridge, punish the road axis, and counterattack only after the player commits to a breach.
  aggressionProfile: Moderate early, then reactive aggression once a strongpoint falls.
  defenseProfile: Strong static defense centered on bastions, anti-tank lanes, and rear fires.
  reserveTriggers:
    - turn 5 or later
    - player captures any strongpoint
    - player controls two strongpoints for final counterattack phase
  fallbackRules: Preserve rear artillery and flak when possible, but continue contesting command ridge until lost.
  counterattackRules: Light tanks and mobile anti-tank units push into whichever flank shows the largest breach or where the command ridge is threatened.
  objectivePriority:
    - command ridge
    - central citadel gate
    - outer battery hexes
  supportBehavior: Flak and anti-tank crews hold long-range lanes while artillery pressures the road corridor and exposed hill approaches.

pacing:
  openingPhase: Approach under fire across open ground while the player chooses a main effort.
  midpointShift: Once one outer battery falls or turn 5 arrives, the fight shifts from suppression and approach into positional breaching.
  climaxCondition: By turn 9 or after two strongpoints fall, the remaining defenders launch local counterattacks around the command ridge.
  reinforcementTiming: Pressure is represented by surviving reserve elements already on the map rather than spawned units.
  failForwardOptions: The player can abandon the direct road and pivot to either hill shoulder if the central lane becomes too costly.
  missionDurationTarget: 16-20 turns depending on difficulty and player tempo.

difficulty:
  easy: Longer turn window at 20 turns. One interceptor and one light tank are removed from the authored scenario. Rear artillery pressure is lower because one battery starts weaker.
  normal: 17-turn assault window with the full authored baseline enemy roster.
  hard: 15-turn assault window. Defender reserve armor is fully intact and the command ridge remains dangerous longer.
  veteran: Intended tuning target beyond current runtime selector. Would shorten the timer further and raise defender experience at the key bastions.
  scalingAxes:
    - turn pressure
    - reserve armor density
    - air denial pressure
    - defender staying power at the rear gun line

technical:
  scenarioFile: src/data/scenario_citadel_ridge.json
  requiresNewMissionKey: true
  metadataChanges:
    - add mission title, briefing, summary package, category, and deployment doctrine for assault_citadel_ridge
    - add difficulty-specific turn limit helper for the mission
  routingChanges:
    - standard Landing -> Precombat -> Battle route only
    - veteran availability comes from existing LandingScreen mission gating
  precombatChanges:
    - expose the large requisition budget
    - honor the mission allow-list for combined-arms assault purchases
    - no predeployed player baseline units
  missionRulesChanges:
    - track occupancy of four authored strongpoints
    - require command ridge plus three total strongpoints for victory
    - expose phase messaging for approach, breach, and counterattack windows
  validationChanges:
    - add a new authoritative scenario validation profile keyed to Citadel Ridge
  deploymentAliasChanges: none; all player-facing unit keys reuse existing deployment aliases
  saveLoadImplications: mission selection and battle activation must preserve the assault_citadel_ridge key exactly like other authored missions
  testHooks:
    - verify strongpoint occupancy tracking across all four objective hexes
    - verify flak and bunker-destruction secondary objectives
    - verify difficulty-specific turn-limit propagation into precombat and battle

qa:
  expectedObjectiveCount: 4
  alliedUnitCountRange: 0 predeployed; player requisitions the force in precombat
  enemyUnitCountRange: 20-24 authored defenders depending on difficulty variant
  landmarkZones:
    - west-assembly-north
    - west-assembly-south
    - north-battery
    - central-citadel
    - south-battery
    - command-ridge
  firstContactWindow: turns 2-4 in a normal advance
  victoryTests:
    - seize command ridge plus any two additional strongpoints before the timer expires
    - destroy the full enemy garrison and confirm mission victory
    - verify both optional destroy objectives complete when the relevant units are removed
  defeatTests:
    - let the timer expire without securing command ridge and confirm mission failure
    - lose all friendly units and confirm immediate defeat
    - finish with command ridge unsecured even if two outer strongpoints are held and confirm no victory
  edgeCases:
    - player holds three strongpoints but not command ridge
    - player captures command ridge and exactly two total strongpoints on the final turn
    - player destroys both flak batteries but leaves bunker guns alive
  regressionRisks:
    - scenario registry mismatch between mission key and JSON source
    - deployment-zone validation on the larger western assembly frontage
    - battle mission status showing empty objectives if custom rules are not wired
```

## Verification notes
- Landing should expose `Citadel Ridge` as a veteran-tier assault operation.
- Precombat should show a large requisition budget, no locked baseline units, and the authored strongpoint objectives.
- Battle should load the large ridge map and display phase-aware mission objectives rather than the empty default objective board.
