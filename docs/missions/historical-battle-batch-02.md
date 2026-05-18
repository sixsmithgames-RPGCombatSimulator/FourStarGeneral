# Historical Battle Batch 02 Mission Packages

This batch adds six new Class A historical scenarios with distinct maps, mission rules, deployment zones, RP budgets, and validation profiles. Player-facing text treats the player as a theater commander while the implementation follows `docs/MISSION_DESIGN_GUIDE.md`.

## El Alamein

identity:
  missionKey: assault_el_alamein
  title: El Alamein
  missionType: assault
  routeType: precombat
  persistenceMode: single_battle
playerExperience:
  playerFantasy: Command Eighth Army's breach of the Axis desert line.
  intendedExperience: Large ridge-and-minefield assault with a late armored breakout.
historicalFraming:
  theater: Egypt, October 1942
  gameplayRole: Desert breach operation that rewards engineer protection and timed armor commitment.
uiCopy:
  commanderIntent: Break the mine belt, seize the ridges, and cut the Axis supply track.
  expectedResistance: Panzer IVs, heavy armor, assault guns, flak, infantry, and artillery.
map:
  scenarioFile: src/data/scenario_el_alamein.json
  footprintGuidance: 30 by 20 desert map with two road corridors, ridge lines, minefield belt, and supply track.
objectives:
  primary: Capture Miteiriya Ridge, Minefield Gap, Tel el Eisa, and Axis Supply Track.
  secondary: Destroy Axis armored reserve units.
  tertiary: Keep one engineer formation operational.
forces:
  allies: Infantry, engineers, tank destroyers, heavy armor, artillery, supply, recon, and fighter support.
  enemies: German armor reserve, guns, infantry, and air support.
deployment:
  alliedStart: Eighth Army start line and reserve armored lane.
  enemyStart: Axis ridge line and supply-track assembly area.
aiPlan:
  doctrine: Use guns and armor to hold the ridge while mobile reserves counterattack the breach.
pacing:
  openingPhase: Minefield contact.
  midpointShift: Ridge breach.
  climaxCondition: Axis reserve contests the supply track.
difficulty:
  scalingAxes: Turn pressure, armor density, engineer survivability.
technical:
  missionRulesChanges: Historical capture profile with armored reserve secondary.
  validationChanges: New El Alamein profile and deployment doctrine.
qa:
  expectedObjectiveCount: 4
  firstContactWindow: Turns 2 to 4

## Anzio Beachhead

identity:
  missionKey: assault_anzio_beachhead
  title: Anzio Beachhead
  missionType: assault
  routeType: precombat
  persistenceMode: single_battle
playerExperience:
  playerFantasy: Command the shallow Anzio lodgment under counterattack from the Alban Hills.
  intendedExperience: Hold a port and beachhead perimeter while contesting inland road nodes.
historicalFraming:
  theater: Italy, January 1944
  gameplayRole: Large hold mission with mandatory port survival.
uiCopy:
  commanderIntent: Keep Anzio port open, hold the perimeter, and prevent German armor from cutting the lodgment.
  expectedResistance: Armor, assault guns, infantry, flak, artillery, and close air.
map:
  scenarioFile: src/data/scenario_anzio_beachhead.json
  footprintGuidance: 30 by 20 beachhead map with sea edge, port blocks, canal, marsh, inland roads, and hill line.
objectives:
  primary: Hold Anzio Port and three of four beachhead objectives at final check.
  secondary: Preserve Beachhead Perimeter and Campoleone Station.
  tertiary: Keep seven friendly formations operational.
forces:
  allies: Infantry, engineers, tank destroyers, armor, artillery, supply, recon, and fighter cover.
  enemies: German counterattack force from hill and rail approaches.
deployment:
  alliedStart: Port perimeter and beachhead reserve.
  enemyStart: Alban Hills line and Campoleone counterattack route.
aiPlan:
  doctrine: Pressure the port through road axes while guns cover the perimeter.
pacing:
  openingPhase: Beachhead shelling.
  midpointShift: German counterattack.
  climaxCondition: Final port and perimeter hold.
difficulty:
  scalingAxes: Port defense, inland objective count, survival threshold.
technical:
  missionRulesChanges: Historical hold profile with instant defeat if Anzio Port falls.
  validationChanges: New Anzio Beachhead profile and deployment doctrine.
qa:
  expectedObjectiveCount: 4
  firstContactWindow: Turns 1 to 3

## Monte Cassino

identity:
  missionKey: assault_monte_cassino
  title: Monte Cassino
  missionType: assault
  routeType: precombat
  persistenceMode: single_battle
playerExperience:
  playerFantasy: Command the corps assault to open Route 6 through Cassino.
  intendedExperience: River crossing, town fight, and mountain assault on one large battlefield.
historicalFraming:
  theater: Italy, 1944
  gameplayRole: Difficult capture mission where terrain and guns slow every axis of advance.
uiCopy:
  commanderIntent: Force the Rapido, clear Cassino, take monastery heights, and open Route 6.
  expectedResistance: Dug-in infantry, flak, anti-tank guns, artillery, assault guns, and armor.
map:
  scenarioFile: src/data/scenario_monte_cassino.json
  footprintGuidance: 28 by 22 with Rapido river, bridge crossings, ruined town, mountain heights, and Route 6.
objectives:
  primary: Capture Cassino Town, Rapido Crossing, Monastery Heights, and Route 6.
  secondary: Destroy enemy guns.
  tertiary: Keep an engineer formation operational.
forces:
  allies: Infantry, engineers, armor, tank destroyers, artillery, supply, recon, close air, and bombers.
  enemies: Fortified mountain and town defenders with armor reserve.
deployment:
  alliedStart: Rapido west bank and Route 6 assembly area.
  enemyStart: Monastery garrison and Cassino defensive belt.
aiPlan:
  doctrine: Hold heights with guns and use armor to counter Route 6 penetrations.
pacing:
  openingPhase: Rapido line.
  midpointShift: Cassino town fight.
  climaxCondition: Heights assault.
difficulty:
  scalingAxes: Crossing pressure, gun survival, engineer preservation.
technical:
  missionRulesChanges: Historical capture profile with gun-destruction secondary.
  validationChanges: New Monte Cassino profile and deployment doctrine.
qa:
  expectedObjectiveCount: 4
  firstContactWindow: Turns 2 to 4

## Arnhem Bridge

identity:
  missionKey: assault_arnhem_bridge
  title: Arnhem Bridge
  missionType: assault
  routeType: precombat
  persistenceMode: single_battle
playerExperience:
  playerFantasy: Command the airborne bridge force and Oosterbeek perimeter.
  intendedExperience: Hold separated objectives against armored pressure until relief can remain possible.
historicalFraming:
  theater: Netherlands, September 1944
  gameplayRole: High-pressure airborne hold mission with mandatory bridge control.
uiCopy:
  commanderIntent: Hold Arnhem Bridge, Oosterbeek, and the drop zone under armor pressure.
  expectedResistance: Infantry, armor, assault guns, flak, artillery, and air attack.
map:
  scenarioFile: src/data/scenario_arnhem_bridge.json
  footprintGuidance: 30 by 18 with Rhine crossing, Arnhem city, Oosterbeek woods, drop zone, and south-bank armor route.
objectives:
  primary: Hold Arnhem Bridge and three of four airborne objectives at final check.
  secondary: Preserve Oosterbeek Perimeter and Drop Zone Y.
  tertiary: Keep four airborne or engineer formations operational.
forces:
  allies: Paratroopers, engineers, anti-tank guns, artillery, supply, recon, and fighter support.
  enemies: German city garrison and south-bank armor.
deployment:
  alliedStart: Airborne drop zone and Oosterbeek perimeter, with a bridge party predeployed.
  enemyStart: Arnhem city and south-bank blocking line.
aiPlan:
  doctrine: Compress the perimeter while armor threatens the bridge from the south.
pacing:
  openingPhase: Bridge seizure.
  midpointShift: Perimeter pressure.
  climaxCondition: Relief window.
difficulty:
  scalingAxes: Bridge control, supply distance, airborne survival.
technical:
  missionRulesChanges: Historical hold profile with instant defeat if Arnhem Bridge falls.
  validationChanges: New Arnhem Bridge profile and deployment doctrine.
qa:
  expectedObjectiveCount: 4
  firstContactWindow: Turns 1 to 3

## Falaise Pocket

identity:
  missionKey: assault_falaise_pocket
  title: Falaise Pocket
  missionType: assault
  routeType: precombat
  persistenceMode: single_battle
playerExperience:
  playerFantasy: Command the Allied pincers closing the Falaise escape corridor.
  intendedExperience: Large encirclement fight with two separated Allied jaws and a compressed enemy center.
historicalFraming:
  theater: Normandy, August 1944
  gameplayRole: Mobile capture mission focused on sealing exits and destroying trapped armor.
uiCopy:
  commanderIntent: Close Chambois, Trun, Argentan Road, and the final escape gap.
  expectedResistance: Panzer columns, assault guns, anti-tank guns, artillery, flak, and air cover.
map:
  scenarioFile: src/data/scenario_falaise_pocket.json
  footprintGuidance: 30 by 22 pocket map with converging roads, towns, forests, hills, and eastern escape corridor.
objectives:
  primary: Capture all pocket-control objectives.
  secondary: Destroy trapped armor.
  tertiary: Keep seven friendly formations operational.
forces:
  allies: Infantry, engineers, armor, tank destroyers, self-propelled artillery, supply, recon, fighter, and close air.
  enemies: Compressed German armor and rear guards.
deployment:
  alliedStart: Chambois jaw and Argentan jaw.
  enemyStart: Pocket main body and eastern escape corridor.
aiPlan:
  doctrine: Push armor toward the escape gap while rear guards hold towns.
pacing:
  openingPhase: Jaw movement.
  midpointShift: Pocket compression.
  climaxCondition: Escape gap fight.
difficulty:
  scalingAxes: Enemy armor density, objective spread, survival threshold.
technical:
  missionRulesChanges: Historical capture profile with trapped armor secondary.
  validationChanges: New Falaise Pocket profile and deployment doctrine.
qa:
  expectedObjectiveCount: 4
  firstContactWindow: Turns 2 to 4

## Hurtgen Forest

identity:
  missionKey: assault_hurtgen_forest
  title: Hurtgen Forest
  missionType: assault
  routeType: precombat
  persistenceMode: single_battle
playerExperience:
  playerFantasy: Command a corps-level attack through the Hurtgen woods toward the Roer approaches.
  intendedExperience: Dense forest attrition with road discipline, engineer support, and ridge objectives.
historicalFraming:
  theater: German border, 1944
  gameplayRole: Large forest assault where movement, supply, and gun lines matter.
uiCopy:
  commanderIntent: Take Huertgen village, Kall Trail, Hill 400, and Roer Dam road.
  expectedResistance: Dug-in infantry, anti-tank guns, flak, artillery, assault guns, and armor.
map:
  scenarioFile: src/data/scenario_hurtgen_forest.json
  footprintGuidance: 28 by 22 dense forest map with ridge line, road tracks, stream edge, Hill 400, and dam-road exit.
objectives:
  primary: Capture all forest objectives.
  secondary: Destroy enemy guns and armor covering the roads.
  tertiary: Keep six friendly formations operational.
forces:
  allies: Infantry, engineers, anti-tank guns, armor, artillery, supply, recon, and close air.
  enemies: Fortified forest defenders with guns and armor counterattack elements.
deployment:
  alliedStart: Forest Line Alpha and Kall Trail Reserve.
  enemyStart: Huertgen main line and Roer Dam Road.
aiPlan:
  doctrine: Hold villages and ridges while guns punish road-bound movement.
pacing:
  openingPhase: Tree line.
  midpointShift: Kall Trail fight.
  climaxCondition: Hill 400 and dam-road assault.
difficulty:
  scalingAxes: Forest movement, gun density, friendly survival.
technical:
  missionRulesChanges: Historical capture profile with gun-and-armor secondary.
  validationChanges: New Hurtgen Forest profile and deployment doctrine.
qa:
  expectedObjectiveCount: 4
  firstContactWindow: Turns 2 to 5
