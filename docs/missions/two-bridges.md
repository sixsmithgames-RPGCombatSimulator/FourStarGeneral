# Two Bridges Mission Package

```yaml
missionKey: assault
title: Two Bridges
shortLabel: Two Bridges
missionType: assault
unlockTier: intermediate
routeType: precombat
tutorialMode: none
persistenceMode: single_battle

playerFantasy: >
  You are the General committing a prepared combined-arms force against a German
  bridge defense. The question is not whether to attack, but where to concentrate
  the main blow before the defender can seal both crossings.
intendedExperience: >
  A medium assault with two viable breach routes, a fortified city objective, and
  enough predeployed force to feel like a formed battle group rather than a patrol.
historicalFraming: >
  WWII-inspired U.S. versus German river crossing action, framed as a late-war
  bridge seizure rather than a named historical battle.
gameplayRole: >
  The missing authored scenario for the generic assault mission key. It teaches
  commitment timing, bridgehead control, and reserve protection.

uiCopy:
  landingBriefing: >
    German forces hold two critical bridges and a fortified bastion beyond the
    river bend. Your assault group has a foothold on the western bank with armor,
    engineers, artillery, and air support already in theater.
  precombatSummary: >
    Seize both bridges and the bastion city within 20 turns. Keep the western
    supply base secure and silence enemy artillery and air-defense guns.
  commanderIntent: >
    Probe both bridge approaches, suppress the near-bank screen, and commit armor
    and engineers through the crossing that cracks first.
  expectedResistance: >
    Regular German infantry, engineers, anti-tank guns, artillery, flak, armor,
    and local air assets.
  terrainSummary: >
    Two bridge corridors cross a river break. Hills and woods cover the western
    approach, while the eastern bank opens into a fortified city pocket.
  objectiveSummary: >
    Primary: seize both bridges and the bastion city. Secondary: hold the western
    supply base. Tertiary: destroy artillery and flak fire support.
  victoryDebrief: >
    Both crossings are secure and the bastion has fallen. The road is open for
    follow-on forces.
  failureDebrief: >
    The assault stalled short of the crossings. Enemy guns held long enough to
    keep the bridge line intact.

map:
  theater: River corridor with fortified eastern bank
  sizeClass: medium
  footprintGuidance: 20 columns by 16 rows
  terrainPalette:
    - river and sea obstruction
    - bridge road corridors
    - western hills and forests
    - eastern city defenses
    - southern mountain edge
  landmarks:
    - north bridge
    - south bridge
    - bastion city
    - western supply base
  coverProfile: Western woods and hills offer covered staging; bridges and city approaches are exposed.
  losProfile: Long lanes across bridge roads; city and hill terrain break line of sight.
  chokepoints: North bridge and south bridge.
  alternateRoutes: Two crossings allow a northern or southern main effort.
  elevationNotes: Hills on both banks provide overwatch, with mountains closing the southeast edge.
  roadMobilityLogic: Roads accelerate commitment to either bridge but channel units into fire lanes.
  deploymentEdges:
    allied: western assembly and southern reserve park
    enemy: eastern bridge screen and bastion defense pocket
  weather: Clear
  visibility: Daylight

objectives:
  primary:
    - id: primary_secure_crossings
      type: capture
      label: Seize both bridges and the bastion city
      purpose: Forces an actual breakthrough instead of a simple kill-all fight.
      placementLogic: Two bridge objectives sit on separate crossing lanes, with the bastion behind them.
      successCondition: Friendly forces occupy both bridge objectives and the bastion city objective.
  secondary:
    - id: secondary_hold_supply_base
      type: hold
      label: Keep the western supply base in friendly hands
      purpose: Discourages stripping the rear and creates a reserve-management concern.
      successCondition: The western supply base objective remains friendly-held at resolution.
    - id: tertiary_silence_fire_support
      type: destroy
      label: Silence enemy artillery and air-defense guns
      purpose: Rewards reducing the defensive system instead of rushing unsupported armor forward.
      successCondition: No enemy Howitzer_105 or Flak_88 units remain operational.
  hiddenHooks:
    - turn 5 or first captured objective shifts to bridge-fight messaging
    - turn 12, two captured objectives, or bastion capture shifts to bastion-push messaging
  victoryConditions:
    - capture both bridges and the bastion city
    - destroy all enemy forces
  defeatConditions:
    - lose all friendly assault forces
    - reach turn 20 without securing all primary objectives
  turnPressure: 20 turns
  controlLogic: Objective control is evaluated by current friendly occupancy.

forces:
  allies:
    concept: Predeployed combined-arms assault group with room for additional requisitions.
    quality: Regular core with one veteran armored element.
    roles:
      - role: armor
        countGuidance: 2 baseline armored companies
        notes: Medium and heavy tanks supply the main breach force.
      - role: infantry and engineers
        countGuidance: 2 baseline ground assault units
        notes: Hold bridgeheads and reduce obstacles.
      - role: artillery and flak
        countGuidance: 2 baseline support batteries
        notes: Suppress defenders and protect airspace.
      - role: air support
        countGuidance: 2 baseline aircraft elements
        notes: Fighter and bomber assets give the commander opening flexibility.
    supportAssets: Additional precombat RP and in-battle requisitions for supplies, infantry, engineers, recon, and artillery.
  enemies:
    concept: Layered bridge defense with city hardpoint and mobile armor reserve.
    quality: Regular defenders with dug-in infantry.
    roles:
      - role: bridge screen
        countGuidance: anti-tank gun, engineers, infantry
        notes: Holds the crossing approaches.
      - role: bastion garrison
        countGuidance: infantry, artillery, flak
        notes: Protects the city objective and punishes exposed bridgeheads.
      - role: counterattack reserve
        countGuidance: medium and heavy armor plus recon
        notes: Presses whichever crossing becomes weak.
    reserves: Local armor around the bastion.
    reinforcements: None authored for the first version.
    supportAssets: Artillery, flak, fighter, and bomber.

deployment:
  alliedStart: Western Bridgehead Assembly and Southern Reserve Park.
  enemyStart: North Bridge Screen and Bastion Defense.
  firstContactExpectation: Turn 1 to 3 if the commander advances along either road.
  reserveStaging: Southern Reserve Park protects the supply base and lets support units deploy safely.
  neutralZones: River approaches between the western hills and the bridge line.
  spawnSafetyNotes: Player zones are west of the river and away from enemy immediate occupancy.
  openingShape: semi_scripted

aiPlan:
  doctrine: Defend both crossings, punish exposed bridgeheads, and preserve the bastion.
  aggressionProfile: Moderate until a bridge is threatened, then local counterattack.
  defenseProfile: Infantry and guns hold city and bridge approaches.
  reserveTriggers:
    - player captures a bridge
    - player armor crosses the river
    - turn 12 bastion-push phase begins
  fallbackRules: Pull damaged armor toward the bastion if both bridges are contested.
  counterattackRules: Armor and recon pressure the weaker bridgehead.
  objectivePriority:
    - bastion city
    - bridge objectives
    - western supply base if exposed
  supportBehavior: Artillery and air assets should target clustered attackers and exposed support units.

pacing:
  openingPhase: Approach and reconnaissance of both crossings.
  midpointShift: Bridge fight after turn 5 or first capture.
  climaxCondition: Bastion push after turn 12, two captured objectives, or bastion contact.
  reinforcementTiming: None; pressure comes from existing reserve posture.
  failForwardOptions: The commander may win by total enemy collapse even if objective control lags.
  missionDurationTarget: 14 to 20 turns.

difficulty:
  easy: 22-turn assault window and reduced pressure from enemy reserves.
  normal: 20-turn assault window with full authored baseline.
  hard: 18-turn assault window and more aggressive reserve behavior when supported later.

technical:
  missionKeyChanges: Reuses the existing assault mission key.
  metadataChanges:
    - title and briefing become Two Bridges-specific
    - summary objectives, doctrine, turn limit, and supplies align with scenario_two_bridges.json
  scenarioJsonChanges:
    - scenario_two_bridges.json receives deployment zones, player budget, allowed units, and predeployed baseline flags
  registryChanges:
    - assault maps to scenario_two_bridges.json
  validationChanges:
    - add Two Bridges profile keyed by scenario.name
  missionRulesChanges:
    - add assault-specific capture, hold, destroy, phase, and marker status
  landingChanges:
    - no route-order change; existing assault slot is reused
  deploymentAliasChanges: none; all baseline unit types already resolve through existing adapters.
  saveLoadImplications: Existing assault mission records now refer to Two Bridges content.

qa:
  expectedObjectiveCount: 4
  alliedUnitCountRange: 9 baseline player units plus player requisitions
  enemyUnitCountRange: 11 authored defenders
  landmarkZones:
    - zone-alpha
    - zone-bravo
    - north-bridge-screen
    - bastion-defense
  firstContactWindow: turns 1-3
  victoryTests:
    - occupy both bridges and the bastion city
    - destroy all enemy units
  defeatTests:
    - lose all friendly units
    - reach turn 20 without all primary objectives
  edgeCases:
    - hold two objectives but not the bastion
    - capture the bastion before both bridges
    - lose western supply base but complete primary objective
  regressionRisks:
    - assault accidentally falling back to Coastal Push
    - missing deployment zones breaking precombat
    - predeployed player units being replaced by allocation-only reserves
```
