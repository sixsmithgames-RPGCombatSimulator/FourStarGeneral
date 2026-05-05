```yaml
missionKey: patrol_pointe_du_hoc
title: Pointe du Hoc
shortLabel: Rangers Lead the Way
missionType: patrol
unlockTier: intermediate
routeType: precombat
tutorialMode: none
persistenceMode: single_battle

playerFantasy: >
  You command the 2nd Ranger Battalion scaling the cliffs of Pointe du Hoc under
  withering German fire. You have ropes, grappling hooks, and 225 men. No tanks.
  No artillery. Reach the guns, destroy them, and hold the position against
  German counterattacks until relief arrives.

intendedExperience: >
  Small-force precision over raw firepower. The player must assault a well-defended
  cliff position with infantry and engineers only, destroy the gun battery, then
  survive six turns of German counterattack with no resupply. Tension comes from
  managing unit positioning between offence and defence.

historicalFraming: >
  June 6, 1944. D-Day. The 2nd Ranger Battalion under Lt. Col. James Rudder
  scaled 30-metre cliffs at Pointe du Hoc using rocket-fired grappling ropes.
  Under fire from the 352nd Infantry Division garrison, Rangers fought through
  casemates and craters, found the guns had been moved inland, destroyed them,
  then held their position for two days against German counterattacks with
  dwindling ammunition until relief from Omaha Beach arrived.

gameplayRole: >
  Intermediate patrol mission. Teaches unit restriction play, two-phase mission
  design (assault then hold), and small-force conservation under counterattack
  pressure. Unlocked after one completed mission; accessible to all commanders.

uiCopy:
  landingBriefing: >
    The guns at Pointe du Hoc command both Omaha and Utah beaches. Naval
    bombardment has cratered the point but the German garrison is still active.
    Your Rangers must scale the cliffs, silence the battery, and hold against
    the counterattack until the relief column reaches you from Omaha.
    You have no armor and no artillery. Rangers only.

  precombatSummary: >
    Assault the cliff battery with your Ranger force. Capture the gun positions
    and hold them for six consecutive turns against German counterattacks.
    Relief arrives when the hold objective is complete.

  commanderIntent: >
    Assault phase: scale the cliffs and neutralise all German gun positions on the
    promontory. Hold phase: defend the captured battery against infantry counterattacks
    for six consecutive turns until the turn limit expires.

  expectedResistance: >
    German garrison includes entrenched infantry (MG nests) and engineers in the
    casemates. Once the guns are captured, counterattack infantry press from the
    inland approach with increasing pressure from turn 3.

  terrainSummary: >
    Sheer chalk cliffs define the southern edge. The promontory top is a cratered
    wasteland of destroyed casemates, observation posts, and trenches. A road
    connects the battery to the inland approach from the east. Forest covers the
    northern inland zone from which German counterattacks emerge.

  objectiveSummary: >
    Primary: Capture all three gun-position hexes and hold them for six
    consecutive turns. Secondary: Destroy the MG nest at the cliff edge.
    Tertiary: Keep at least three Ranger units alive at mission end.

  victoryDebrief: >
    The guns are silent and the Rangers have held the point. Relief columns from
    Omaha Beach can now land without fire from the promontory. D-Day's flanks are
    secure.

  failureDebrief: >
    The Ranger force could not hold the captured positions long enough. German
    troops have re-occupied Pointe du Hoc and the guns may be returned to action.
    The beaches remain under threat.

map:
  theater: Normandy, France — June 6, 1944
  sizeClass: small
  footprintGuidance: >
    16 cols × 14 rows. The southern two rows are cliff-top edge only (the face
    itself is off-map). The promontory occupies the western half; the inland road
    and forest occupy the eastern half. Map oriented west-to-east: Rangers land
    at the south-west cliff edge, German counterattacks enter from the north-east.
  terrainPalette:
    - CLIFF_EDGE: impassable sea-facing cliff (blocks movement, provides cover to
        units on the hexes directly north of it)
    - CRATER: rough ground covering the promontory top; reduces movement,
        provides light cover
    - CASEMATE: urban-type fortified hex; high cover; objectives
    - TRENCH: trench feature; provides infantry cover bonus
    - ROAD: road through the centre of the promontory to inland
    - FOREST: forest on eastern inland zone; cover for counterattack staging
    - PLAINS: open ground on the inland approaches
    - RUBBLE: former gun emplacement; passable rough ground
  landmarks:
    - Three casemate hexes at cols 2,5,8 row 2 (the gun positions — objectives)
    - Observation post hex at col 5 row 1 (cliff-edge MG nest — secondary objective)
    - Inland road junction at col 12 row 7
    - Forest blocks at cols 10-15 rows 4-9 (counterattack staging)
  coverProfile: >
    Casemates provide heavy cover. Craters and trenches provide moderate cover.
    Open clifftop approach rows 0-2 provide minimal cover — dangerous during assault.
    Forest provides heavy cover for German counterattack staging.
  losProfile: >
    Open clifftop has excellent LOS. Forest blocks LOS after two hexes.
    Casemates block LOS through them (attacker must get adjacent).
  chokepoints:
    - Cliff-top approach rows 0-1 (Rangers must cross open ground to reach guns)
    - Road junction col 12 row 7 (German reinforcement funnel)
  alternateRoutes:
    - Northern cliff path at col 1 rows 0-2 (flanking approach to west gun)
    - Crater field approach at col 7 rows 1-3 (central advance)
  elevationNotes: >
    Cliff-edge row 13 is the top of the cliff face. Units here have no cover.
    Casemate row 2 is slightly elevated. Forest area is flat.
  roadMobilityLogic: >
    Road provides normal movement to wheeled units. Crater terrain costs +1 move.
    Cliff-edge hexes are impassable to all units except infantry (assault route).
    Rangers (infantry) can enter cliff hexes at cost +2 during assault phase.
  deploymentEdges:
    allied: South edge (rows 12-13), representing Rangers at cliff top after scaling
    enemy: North-east forest (cols 10-15 rows 4-9), and inland road (cols 11-15 rows 6-8)
  weather: Overcast; wind; smoke and naval gun debris; morning June fog
  visibility: Reduced in smoke hexes; standard elsewhere

objectives:
  primary:
    - id: obj_gun_west
      type: captureAndHold
      label: West Gun Position
      purpose: Silences western coastal gun covering Utah Beach
      placementLogic: col 2 row 2, CASEMATE terrain, Bot-owned
      successCondition: Player occupies for 6 consecutive turns
    - id: obj_gun_central
      type: captureAndHold
      label: Central Battery
      purpose: Silences central guns commanding both beaches
      placementLogic: col 5 row 2, CASEMATE terrain, Bot-owned
      successCondition: Player occupies for 6 consecutive turns
    - id: obj_gun_east
      type: captureAndHold
      label: East Gun Position
      purpose: Silences eastern coastal gun covering Omaha Beach
      placementLogic: col 9 row 2, CASEMATE terrain, Bot-owned
      successCondition: Player occupies for 6 consecutive turns
  secondary:
    - id: obj_mg_nest
      type: destroy
      label: Cliff-Edge MG Nest
      purpose: Removes fire suppression on Ranger landing hexes
      successCondition: All Bot Infantry_42 units at col 5 row 1 eliminated
  hiddenHooks: none
  victoryConditions:
    - All three gun hexes simultaneously held by Player for 6 consecutive turns
    - All enemy units eliminated (early victory)
  defeatConditions:
    - All friendly units eliminated
    - Turn limit expires without achieving the hold objective
  turnPressure: >
    Turn limit Easy 16, Normal 14, Hard 12. Counterattack intensity escalates
    each turn after turn 4. The player must assault quickly and dig in before the
    counterattack peaks.
  controlLogic: >
    Occupancy checked each turn. Hold streak increments only when ALL THREE gun
    hexes are simultaneously in Player control. Any hex lost resets the streak.

forces:
  allies:
    concept: 2nd Ranger Battalion — elite light infantry with no organic armor or artillery
    quality: veteran (experience 1 baseline; some units experience 2)
    roles:
      - role: assault infantry
        countGuidance: 4 units
        notes: Core attack force; must cross open clifftop to reach casemates
      - role: engineer
        countGuidance: 2 units
        notes: Required to clear casemate hexes; demolition reduces entrenchment
      - role: recon
        countGuidance: 1 unit
        notes: Scout to spot German counterattack staging in forest
    supportAssets: Naval gunfire off-map (2 calls only); no air; no logistics
  enemies:
    concept: 352nd Infantry Division garrison reinforced by inland counterattack force
    quality: average with entrenched bonus (experience 0 regulars, entrenched 2 in casemates)
    roles:
      - role: garrison infantry (MG nests, casemate defenders)
        countGuidance: 3 units entrenched at gun positions and cliff edge
        notes: Entrenched 2; must be assaulted directly — no flanking possible
      - role: counterattack infantry
        countGuidance: 4 units arriving from forest from turn 3
        notes: Phase 2 units; fresher and unentrenced; arrive incrementally
      - role: engineer (casemate repair/counterdemolition)
        countGuidance: 1 unit
        notes: Attempts to retake and re-entrench captured gun positions
    reserves:
      - 1 additional infantry unit on Hard difficulty, arrives turn 5
    reinforcements: none (garrison only)
    supportAssets: none (German air and artillery not available at Pointe du Hoc scale)

deployment:
  alliedStart: >
    South edge zone (rows 11-13, cols 0-15). Rangers begin at cliff top having
    scaled in the previous action phase. Player places up to 7 units (budget-
    restricted) within this zone. Predeployed: none (all units purchased via budget).
  enemyStart: >
    German garrison units are predeployed at and around the casemates (cols 0-10
    rows 0-4) with entrenched status 2. Counterattack force begins in forest zone
    (cols 10-15 rows 4-9) and activates from turn 3.
  firstContactExpectation: >
    Turn 1 the player advances from the cliff-edge zone. German garrison fires
    from entrenched positions. First assault contact expected turn 1 or 2.
  reserveStaging: >
    German counterattack enters from north-east forest. Road junction at col 12
    row 7 funnels all counterattack traffic to the battery.
  neutralZones: none
  spawnSafetyNotes: >
    Player start zone is safe (cliff-top, no German units). First German fire
    comes from garrison which can range rows 5-6 from casemates.
  openingShape: scripted

aiPlan:
  doctrine: >
    Phase 1 (turns 1-2): Garrison holds entrenched positions and fires on
    approaching Rangers. Does not advance.
    Phase 2 (turns 3+): Counterattack force pushes from forest toward the road
    junction, then advances on any Player-held gun positions. Priority target is
    the central battery.
  aggressionProfile: defensive_hold_then_counterattack
  defenseProfile: >
    Garrison holds until strength drops below 40%. No retreat until all three
    guns are lost.
  reserveTriggers: >
    Counterattack force activates on turn 3 regardless of garrison status.
    On Hard difficulty, a reserve infantry unit activates if all three guns are
    Player-held by turn 4.
  fallbackRules: >
    Garrison retreats to road junction if all gun positions are lost and
    strength is below 30%. Does not flee off-map.
  counterattackRules: >
    Counterattack infantry move via road to reach gun positions. Engineers in
    the force attempt to re-entrench any recaptured gun hex.
  objectivePriority: central_battery > east_gun > west_gun
  supportBehavior: none

pacing:
  openingPhase: >
    Turns 1-2: Ranger assault. Player pushes from cliff edge across open
    craters toward casemates under garrison fire. Engineers critical for
    reducing entrenched defenders.
  midpointShift: >
    Turn 3: German counterattack emerges from forest. Player must now
    balance capturing remaining gun positions with defending those already taken.
  climaxCondition: >
    Player holds all three guns simultaneously — counterattack force presses
    hardest at this point. Hold streak begins counting.
  reinforcementTiming: >
    German counterattack starts turn 3. Hard-only reserve infantry arrives turn 5.
  failForwardOptions: >
    If the player captures two of three guns but not the third, the hold streak
    cannot start. This is a meaningful partial state — the player can still win
    by clearing the last gun and surviving.
  missionDurationTarget: 14 turns Normal; 8-10 turns expected gameplay

difficulty:
  easy:
    turnLimit: 16
    notes: Garrison entrenchment reduced to 1; counterattack arrives turn 4; no reserve infantry
  normal:
    turnLimit: 14
    notes: Garrison entrenchment 2; counterattack arrives turn 3
  hard:
    turnLimit: 12
    notes: Garrison entrenchment 2; counterattack arrives turn 3; reserve infantry arrives turn 5
  veteran: not implemented
  scalingAxes:
    - turn limit
    - garrison entrenchment level
    - counterattack arrival turn
    - presence of hard reserve infantry unit

technical:
  scenarioFile: src/data/scenario_pointe_du_hoc.json
  requiresNewMissionKey: true — patrol_pointe_du_hoc
  metadataChanges: missions.ts — title, briefing, summary, category, deployment profile, unlock requirement
  routingChanges: LandingScreen.ts — insert patrol_pointe_du_hoc after patrol_river_watch in mission order
  precombatChanges: none — uses standard precombat flow; unit restrictions enforced via allowedUnits
  missionRulesChanges: >
    New createPoineDuHocController factory in missionRules.ts.
    Two-phase logic: capture phase (all three guns Player-owned) + hold streak counter.
    Phase announcement on turn 3 (counterattack arrives).
    Victory: hold streak >= 6 while all three guns occupied.
    Defeat: all Player units eliminated, or turn limit expires without completing hold.
  validationChanges: scenarioValidation.ts — new "Pointe du Hoc" profile
  deploymentAliasChanges: none — all unit types already in unitTypes.json
  saveLoadImplications: none — single_battle persistence mode
  testHooks:
    - hold streak increments only when ALL three guns simultaneously occupied by Player
    - hold streak resets to zero if any gun is lost
    - counterattack phase announced exactly once on turn 3
    - victory fires immediately when hold streak reaches 6
    - defeat fires when player units reach zero
    - turn limit defeat fires if hold streak < 6 at turn limit

qa:
  expectedObjectiveCount: 3 (three gun position hexes)
  alliedUnitCountRange: 5-7 (budget ~300, all infantry/engineer)
  enemyUnitCountRange: 7-8 (3 garrison + 4 counterattack + optional reserve)
  landmarkZones:
    - clifftop assault corridor rows 0-2
    - three casemate gun positions cols 2,5,9 row 2
    - north-east forest counterattack staging cols 10-15 rows 4-9
  firstContactWindow: turns 1-2
  victoryTests:
    - hold all three guns for 6 turns: victory fires with correct reason
    - all enemy eliminated before hold target: early victory fires
  defeatTests:
    - all Player units eliminated: defeat fires with correct reason
    - turn limit reached without hold objective: defeat fires
    - enemy re-captures a gun during hold streak: streak resets, no premature victory
  edgeCases:
    - player captures two guns but not third: hold streak must not increment
    - player re-captures a gun on same turn it was lost: streak should reset then not restart until next turn
    - enemy engineer re-entrench a recaptured gun: entrenchment applies correctly
  regressionRisks:
    - hold streak counter must be keyed per-hex; a shared counter would incorrectly count partial holds
    - existing patrol_river_watch ford-counter logic must be unaffected
```
