# Historical Battle Batch 01 Mission Packages

This batch converts six documented U.S. vs German WWII actions into first-class playable Four Star General missions. Each package follows the required 13-section structure from `four_star_general_mission_creation_agent_spec.md`; implementation details are wired through the files named in `MISSION_DESIGN_GUIDE.md`.

## Battle of Kasserine Pass

missionKey: assault_kasserine_pass
title: Kasserine Pass
shortLabel: Kasserine
missionType: assault
unlockTier: veteran
routeType: precombat
tutorialMode: none
persistenceMode: single_battle

playerFantasy: You command U.S. II Corps blocking German armored columns in the Tunisian mountain passes.
intendedExperience: A wide defensive battle with long roads, mountain channels, and pressure against supply exits.
historicalFraming: Tunisia, February 1943. U.S. forces absorb the first major German armored thrust against American positions.
gameplayRole: Large defensive operation that asks the player to hold depth, manage armor reserves, and prevent breakthrough.

uiCopy:
  landingBriefing: Hold the Tebessa supply road and the Kasserine pass line until the German spearhead is spent.
  precombatSummary: Defend a mountainous pass network with mixed infantry, anti-tank guns, armor, artillery, and air cover.
  commanderIntent: Preserve the supply road, delay armored columns, and counterattack only after the enemy commits.
  expectedResistance: Panzer IV companies, assault guns, infantry, engineers, artillery, flak, and reconnaissance.
  terrainSummary: Mountain walls, narrow road cuts, mud flats, and exposed valley floor.
  objectiveSummary: Hold the supply road and at least one pass line through the turn window.
  victoryDebrief: The German spearhead has been halted and the supply road remains open.
  failureDebrief: The pass line has broken and the enemy has a route toward the rear depots.

map:
  theater: Kasserine Pass, Tunisia
  sizeClass: large
  footprintGuidance: 26 by 20 hexes with mountain shoulders and a central road corridor.
  terrainPalette: desert plains, mountain ridges, hills, roads, hamlets, mud flats.
  landmarks: Tebessa supply road, northern pass, southern pass, Axis assembly valley.
  coverProfile: Strong cover in mountains and hamlets, weak cover on the valley floor.
  losProfile: Long valley lanes interrupted by hills and pass bends.
  chokepoints: Northern and southern road cuts.
  alternateRoutes: Rough hill tracks around each pass.
  elevationNotes: Mountain hexes frame both flanks and slow direct assaults.
  roadMobilityLogic: Central roads support fast armor movement but create artillery lanes.
  deploymentEdges:
    allied: Western supply road and pass exits.
    enemy: Eastern valley and pass mouths.
  weather: Winter rain and mud.
  visibility: Broken by ridges with occasional long corridors.

objectives:
  primary:
    - id: hold_pass_line
      type: hold_until_turn_limit
      label: Hold Tebessa road and one pass line.
      purpose: Deny German breakthrough.
      placementLogic: Friendly objectives anchor the western road and pass exits.
      successCondition: Turn limit reached with required hold objectives friendly.
  secondary:
    - id: destroy_spearhead
      type: destroy_unit_family
      label: Destroy the German armored spearhead.
      purpose: Reward counterattack after defense.
      successCondition: No Panzer IV, Heavy Tank, or Assault Gun units remain.
  hiddenHooks: Phase escalates from probes to armored commitment to final pass defense.
  victoryConditions: Hold required objectives at turn limit, or eliminate all enemy forces.
  defeatConditions: Lose the Tebessa supply road, lose all friendly combat units, or fail hold conditions at turn limit.
  turnPressure: 16 turns.
  controlLogic: Mission rules use objective occupancy, friendly survival, and armored-unit counts.

forces:
  allies:
    concept: U.S. blocking force with anti-tank screens and reserve armor.
    quality: Mixed early-war formations.
    roles:
      - role: infantry and engineers
        countGuidance: 4 to 8 units
        notes: Hold passes and build the defense.
      - role: armor and tank destroyers
        countGuidance: 3 to 6 units
        notes: Counterpunch after enemy armor enters the valley.
    supportAssets: Artillery, supply convoys, fighters, and limited close air.
  enemies:
    concept: German armored spearhead with infantry and artillery.
    quality: Veteran mobile attackers.
    roles:
      - role: panzer and assault gun companies
        countGuidance: 5 to 8 units
        notes: Main breakthrough threat.
    reserves: Eastern valley reserve.
    reinforcements: Represented by turn pressure and larger enemy roster.
    supportAssets: Howitzers, flak, and Luftwaffe-style air presence.

deployment:
  alliedStart: Western road and pass exits.
  enemyStart: Eastern approach valley.
  firstContactExpectation: Turn 2 to 4 along central roads.
  reserveStaging: Rear supply road.
  neutralZones: Muddy valley center and pass approaches.
  spawnSafetyNotes: Deployment zones are separated by mountain and road buffers.
  openingShape: semi_scripted

aiPlan:
  doctrine: Use armor along roads, infantry to pin passes, artillery to punish roadblocks.
  aggressionProfile: High after turn 5.
  defenseProfile: Minimal; attacker posture.
  reserveTriggers: Push central armor after scouts make contact.
  fallbackRules: Damaged guns remain at range.
  counterattackRules: Mobile reserves exploit any objective loss.
  objectivePriority: Tebessa road first, pass exits second.
  supportBehavior: Fire-support units remain behind armor until threatened.

pacing:
  openingPhase: Recon and first contact.
  midpointShift: Armor pushes into the pass.
  climaxCondition: German pressure reaches supply road approaches.
  reinforcementTiming: Abstracted through enemy depth.
  failForwardOptions: Player can lose one pass if the supply road and another pass hold.
  missionDurationTarget: 12 to 16 turns.

difficulty:
  easy: More time to reposition and lower enemy pressure.
  normal: Standard 16-turn defense.
  hard: Enemy armor reaches pass line faster.
  veteran: Requires preserving anti-tank guns.
  scalingAxes: Turn limit, enemy armor strength, starting RP.

technical:
  scenarioFile: src/data/scenario_kasserine_pass.json
  requiresNewMissionKey: true
  metadataChanges: Add title, briefing, summary, category, deployment profile, and unlock gate.
  routingChanges: Add to landing canonical order.
  precombatChanges: Uses scenario budget, allowed units, deployment zones, and predeployed defenders.
  missionRulesChanges: Historical hold-until-turn objective profile.
  validationChanges: Add Kasserine Pass scenario profile.
  deploymentAliasChanges: None.
  saveLoadImplications: New single-battle key only.
  testHooks: Mission rules hold victory and timer defeat.

qa:
  expectedObjectiveCount: 4
  alliedUnitCountRange: 6 to 10 baseline plus purchases.
  enemyUnitCountRange: 18 to 26.
  landmarkZones: Tebessa road, northern pass, southern pass, Axis valley.
  firstContactWindow: Turns 2 to 4.
  victoryTests: Hold at turn limit; eliminate all enemies.
  defeatTests: Lose Tebessa road; expire without required hold.
  edgeCases: Enemy elimination before turn limit, objective temporarily unoccupied.
  regressionRisks: Objective hex coordinate conversion and large deployment-zone geometry.

## Operation Husky: Gela Landings

missionKey: assault_gela_landings
title: Gela Landings
shortLabel: Gela
missionType: assault
unlockTier: veteran
routeType: precombat
tutorialMode: none
persistenceMode: single_battle

playerFantasy: You command the beachhead defense and breakout at Gela against German armored counterattack.
intendedExperience: Amphibious landing that becomes a combined-arms fight for the port, airfield, and coastal highway.
historicalFraming: Sicily, July 1943. U.S. forces hold the beachhead under Axis counterattack and push inland.
gameplayRole: Large offensive-defense hybrid.
uiCopy:
  landingBriefing: Secure Gela, Ponte Olivo airfield, and Highway 115 while keeping the beachhead intact.
  precombatSummary: Build a beachhead force with naval fire support, infantry, engineers, armor, and air cover.
  commanderIntent: Hold the sand, stop the counterattack, then drive inland.
  expectedResistance: Panzer counterattack, infantry screens, flak, and artillery.
  terrainSummary: Beaches, dunes, farmland, port blocks, and inland airfield.
  objectiveSummary: Capture three inland objectives and protect the beachhead anchor.
  victoryDebrief: The beachhead is stable and Gela is open for the Sicilian advance.
  failureDebrief: The counterattack has overrun the beachhead.
map:
  theater: Gela, Sicily
  sizeClass: large
  footprintGuidance: 28 by 18 with sea edge, beach belt, port, airfield, and inland roads.
  terrainPalette: sea, beach, town, plains, roads, hills, airfield-like clearings.
  landmarks: Gela port, Ponte Olivo airfield, Highway 115, landing beaches.
  coverProfile: Low on beaches, moderate in town and hills.
  losProfile: Long fire lanes inland; beach line exposed.
  chokepoints: Port approaches and highway bend.
  alternateRoutes: Farm tracks around the airfield.
  elevationNotes: Inland hills cover German counterattack assembly.
  roadMobilityLogic: Highway accelerates armor on both sides.
  deploymentEdges:
    allied: Southern beach and port edge.
    enemy: Northern inland approaches.
  weather: Clear Mediterranean heat.
  visibility: Open and punishing.
objectives:
  primary:
    - id: secure_gela
      type: capture_required_objectives
      label: Secure Gela, Ponte Olivo, and Highway 115.
      purpose: Stabilize the beachhead and open inland movement.
      placementLogic: Objectives form a triangle from town to airfield to road.
      successCondition: All three primary objectives are friendly-held.
  secondary:
    - id: hold_beachhead
      type: protected_objective
      label: Keep the beachhead anchor.
      purpose: Prevent a landing collapse.
      successCondition: Beachhead remains friendly at mission end.
  hiddenHooks: Phase shifts once first inland objective is taken.
  victoryConditions: Capture required objectives or destroy all enemies.
  defeatConditions: Lose all friendly units or fail before turn 18.
  turnPressure: 18 turns.
  controlLogic: Historical capture profile plus protected beach objective.
forces:
  allies:
    concept: Landing force with naval support and follow-on armor.
    quality: Solid but exposed.
    roles:
      - role: beach infantry
        countGuidance: 4 to 8
        notes: Hold and expand the landing.
      - role: armor and engineers
        countGuidance: 3 to 6
        notes: Break inland counterattack lines.
    supportAssets: Naval gunfire, air cover, logistics.
  enemies:
    concept: German armor and infantry counterattack from inland roads.
    quality: Veteran mechanized force.
    roles:
      - role: armored counterattack
        countGuidance: 5 to 8
        notes: Push toward beach objective.
    reserves: North road reserve.
    reinforcements: Represented by armor depth.
    supportAssets: Flak, artillery, fighter-bombers.
deployment:
  alliedStart: Beachhead and port edge.
  enemyStart: Inland road and airfield perimeter.
  firstContactExpectation: Immediate artillery and turn 2 armor contact.
  reserveStaging: Beach logistics zone.
  neutralZones: Farms between beach and airfield.
  spawnSafetyNotes: Sea/coastal hexes are not used as deployment cells.
  openingShape: semi_scripted
aiPlan:
  doctrine: Counterattack down the roads and pin the beachhead.
  aggressionProfile: Medium-high.
  defenseProfile: Airfield and town defenses hold until threatened.
  reserveTriggers: Commit tanks after beachhead expands.
  fallbackRules: Artillery and flak stay protected.
  counterattackRules: Retake the beachhead anchor if exposed.
  objectivePriority: Beachhead, port, airfield.
  supportBehavior: Flak covers airfield and road junction.
pacing:
  openingPhase: Landing consolidation.
  midpointShift: German armor counterattack.
  climaxCondition: Fight for airfield and highway.
  reinforcementTiming: Player purchases fill follow-on waves.
  failForwardOptions: Town can be delayed if airfield and highway are seized.
  missionDurationTarget: 14 to 18 turns.
difficulty:
  easy: More naval support and fewer enemy tanks.
  normal: Balanced beachhead breakout.
  hard: Stronger road counterattack.
  veteran: Beachhead protection becomes decisive.
  scalingAxes: RP, armor roster, flak density.
technical:
  scenarioFile: src/data/scenario_gela_landings.json
  requiresNewMissionKey: true
  metadataChanges: New metadata and deployment doctrine.
  routingChanges: Add to landing order.
  precombatChanges: Budget, allowed units, and naval support restrictions.
  missionRulesChanges: Historical capture profile.
  validationChanges: Add profile.
  deploymentAliasChanges: None.
  saveLoadImplications: New single-battle key.
  testHooks: Required capture victory and protected beach objective.
qa:
  expectedObjectiveCount: 4
  alliedUnitCountRange: 5 to 9 baseline plus purchases.
  enemyUnitCountRange: 18 to 28.
  landmarkZones: Beachhead, port, airfield, highway.
  firstContactWindow: Turns 1 to 3.
  victoryTests: Capture inland triangle.
  defeatTests: Timer expiry or beachhead loss.
  edgeCases: Air objectives and beach zone rendering.
  regressionRisks: Coastal tiles in deployment zones.

## Omaha Beach

missionKey: assault_omaha_beach
title: Omaha Beach
shortLabel: Omaha
missionType: assault
unlockTier: veteran
routeType: precombat
tutorialMode: none
persistenceMode: single_battle

playerFantasy: You coordinate the D-Day assault waves pushing through exits off Omaha Beach.
intendedExperience: A large, brutal assault from exposed beaches into fortified draws and ridge positions.
historicalFraming: Normandy, June 6, 1944. U.S. forces fight through German coastal defenses to open the beachhead.
gameplayRole: Fortified beach assault.
uiCopy:
  landingBriefing: Break off the beach, secure the draws, and silence the ridge guns.
  precombatSummary: Use infantry, engineers, armor, naval fire, and air strikes to breach fortified exits.
  commanderIntent: Clear lanes under fire, then push combat power through the draws.
  expectedResistance: Entrenched infantry, anti-tank guns, artillery, flak, and counterattack reserves.
  terrainSummary: Sea, beach, shingle, bluffs, roads, villages, and ridge guns.
  objectiveSummary: Capture all four exit and ridge objectives before the assault window closes.
  victoryDebrief: The beach exits are open and follow-on forces can land.
  failureDebrief: The assault has stalled on the beach under the guns.
map:
  theater: Omaha Beach, Normandy
  sizeClass: large
  footprintGuidance: 30 by 18 with beach width, bluff belt, draws, and inland villages.
  terrainPalette: sea, beach, hills, roads, towns, fortifications.
  landmarks: Vierville draw, Colleville ridge, battery control, beach exit D-1.
  coverProfile: Poor at waterline, strong in bluffs and villages.
  losProfile: Defender-favored fire lanes from ridge to beach.
  chokepoints: Draw exits.
  alternateRoutes: Hill tracks between draws.
  elevationNotes: Bluff belt creates the mission identity.
  roadMobilityLogic: Roads matter only after exits are breached.
  deploymentEdges:
    allied: Beach assembly belts.
    enemy: Bluff and inland ridge.
  weather: Overcast D-Day morning.
  visibility: Strong defender visibility, reduced beach maneuver cover.
objectives:
  primary:
    - id: open_beach_exits
      type: capture_required_objectives
      label: Secure all beach exits and ridge controls.
      purpose: Open Omaha for follow-on forces.
      placementLogic: Draws and ridge objectives are separated across the map.
      successCondition: All primary objectives friendly-held.
  secondary:
    - id: silence_guns
      type: destroy_unit_family
      label: Silence artillery and flak.
      purpose: Protect landing waves.
      successCondition: No Howitzer or Flak units remain.
  hiddenHooks: Phase escalates from beach landing to draw fight to ridge push.
  victoryConditions: Capture all objectives or eliminate the garrison.
  defeatConditions: Turn limit or friendly force destruction.
  turnPressure: 20 turns.
  controlLogic: Historical capture profile.
forces:
  allies:
    concept: Assault waves with engineers, infantry, naval fire, and armor.
    quality: Determined but exposed.
    roles:
      - role: infantry and engineers
        countGuidance: 8 to 12
        notes: Breach and occupy exits.
      - role: armor and fire support
        countGuidance: 3 to 6
        notes: Suppress strongpoints.
    supportAssets: Naval gunfire, bombers, fighters, supply.
  enemies:
    concept: Static coastal defense with inland counterattack.
    quality: Entrenched.
    roles:
      - role: bunker line
        countGuidance: 10 to 16
        notes: Entrenched guns and infantry.
    reserves: Inland infantry and armor.
    reinforcements: Abstracted by defense depth.
    supportAssets: Artillery and flak.
deployment:
  alliedStart: Beach bands below the bluffs.
  enemyStart: Bluffs, ridge, and villages.
  firstContactExpectation: Immediate.
  reserveStaging: Beach reinforcement belt.
  neutralZones: Draw approaches and shingle.
  spawnSafetyNotes: Player starts on beach terrain, not water.
  openingShape: scripted
aiPlan:
  doctrine: Hold ridge and punish beach movement.
  aggressionProfile: Defensive early, counterattack after exits fall.
  defenseProfile: Strongpoint defense.
  reserveTriggers: Move reserves to any captured draw.
  fallbackRules: Guns hold unless threatened.
  counterattackRules: Retake the nearest draw.
  objectivePriority: Draws first, ridge command second.
  supportBehavior: Artillery focuses beach clusters.
pacing:
  openingPhase: Beach survival and breach.
  midpointShift: Draw exits contested.
  climaxCondition: Ridge command push.
  reinforcementTiming: Purchased follow-on waves.
  failForwardOptions: One exit may be delayed only if the rest are rolling.
  missionDurationTarget: 16 to 20 turns.
difficulty:
  easy: More RP and fewer heavy guns.
  normal: Full D-Day assault pressure.
  hard: More artillery and flak.
  veteran: Requires coordinated breaches.
  scalingAxes: Gun density, turn limit, RP.
technical:
  scenarioFile: src/data/scenario_omaha_beach.json
  requiresNewMissionKey: true
  metadataChanges: New metadata.
  routingChanges: Add to landing order.
  precombatChanges: Naval fire support and assault unit allow-list.
  missionRulesChanges: Historical capture profile.
  validationChanges: Add profile.
  deploymentAliasChanges: None.
  saveLoadImplications: New single-battle key.
  testHooks: Capture all exits, timer defeat.
qa:
  expectedObjectiveCount: 4
  alliedUnitCountRange: 6 to 10 baseline plus purchases.
  enemyUnitCountRange: 22 to 34.
  landmarkZones: Beach, draws, bluff ridge, villages.
  firstContactWindow: Turn 1.
  victoryTests: Capture all exits.
  defeatTests: Time expires on beach.
  edgeCases: Beach terrain deployment.
  regressionRisks: Objective marker readability on dense coastal terrain.

## Battle of Carentan

missionKey: assault_carentan
title: Carentan
shortLabel: Carentan
missionType: assault
unlockTier: veteran
routeType: precombat
tutorialMode: none
persistenceMode: single_battle

playerFantasy: You link the Utah and Omaha lodgments by taking Carentan and its causeways.
intendedExperience: Marsh and town fighting with airborne infantry, engineers, armor, and causeway choke points.
historicalFraming: Normandy, June 1944. U.S. airborne and follow-on forces fight for the town connecting beachheads.
gameplayRole: Bridge and town capture mission.
uiCopy:
  landingBriefing: Take Carentan, secure the causeway, and hold the Douve crossing.
  precombatSummary: Advance through marsh corridors into a fortified town while protecting your bridgehead.
  commanderIntent: Open the causeway, enter the town with infantry, and keep engineers near the bridges.
  expectedResistance: German infantry, assault guns, anti-tank guns, mortars, and local counterattack.
  terrainSummary: Marsh, causeways, bridges, town blocks, and hedgerows.
  objectiveSummary: Capture town, rail station, and causeway while protecting the bridgehead.
  victoryDebrief: The beachheads are linked through Carentan.
  failureDebrief: The corridor remains severed and the enemy can split the lodgment.
map:
  theater: Carentan, Normandy
  sizeClass: large
  footprintGuidance: 26 by 18 with marsh lanes, river/canal barriers, town center, and road bridges.
  terrainPalette: marsh, river, bridge, town, roads, hedgerow fields.
  landmarks: Douve bridge, town square, rail station, northern causeway.
  coverProfile: Good in town and hedgerows, poor in marsh lanes.
  losProfile: Short, broken lines.
  chokepoints: Causeway bridges.
  alternateRoutes: Flank roads through farms.
  elevationNotes: Minimal elevation; obstacles are water and marsh.
  roadMobilityLogic: Causeways are fast but dangerous.
  deploymentEdges:
    allied: Western and southern causeway.
    enemy: Town and northeast roads.
  weather: Damp Normandy lowland.
  visibility: Medium-low.
objectives:
  primary:
    - id: take_carentan
      type: capture_required_objectives
      label: Take Carentan and the causeway.
      purpose: Link beachheads.
      placementLogic: Three objectives across bridge, town, and rail approaches.
      successCondition: Required objectives friendly-held.
  secondary:
    - id: keep_douve_bridge
      type: protected_objective
      label: Keep Douve bridgehead secure.
      purpose: Maintain supply and reinforcement route.
      successCondition: Protected objective friendly at mission end.
  hiddenHooks: Phase shifts from causeway fight to town fight after first capture.
  victoryConditions: Capture required objectives or destroy enemy.
  defeatConditions: Lose all friendly units or run out of time.
  turnPressure: 18 turns.
  controlLogic: Historical capture profile.
forces:
  allies:
    concept: Airborne infantry, engineers, and follow-on armor.
    quality: High infantry quality, limited heavy armor.
    roles:
      - role: airborne and engineers
        countGuidance: 5 to 9
        notes: Bridge and street fighting.
    supportAssets: Artillery, limited armor, supply.
  enemies:
    concept: German town defense with assault guns.
    quality: Veteran local defenders.
    roles:
      - role: infantry strongpoints
        countGuidance: 10 to 16
        notes: Hold town and rails.
    reserves: Northeast counterattack.
    reinforcements: Abstracted by enemy depth.
    supportAssets: AT guns and assault guns.
deployment:
  alliedStart: West and south causeway line.
  enemyStart: Town and rail station.
  firstContactExpectation: Turns 1 to 2.
  reserveStaging: Douve bridgehead.
  neutralZones: Marsh causeway.
  spawnSafetyNotes: Deployment zones stay on roads and solid ground.
  openingShape: semi_scripted
aiPlan:
  doctrine: Hold town, punish causeways, counterattack bridgehead.
  aggressionProfile: Medium.
  defenseProfile: Strong town hold.
  reserveTriggers: Counterattack after town objective falls.
  fallbackRules: AT guns stay in streets.
  counterattackRules: Push toward Douve if exposed.
  objectivePriority: Town square and bridgehead.
  supportBehavior: Indirect fire on causeway clusters.
pacing:
  openingPhase: Bridgehead and causeway.
  midpointShift: Urban clearing.
  climaxCondition: Rail station or counterattack.
  reinforcementTiming: Purchased armor arrives from bridgehead.
  failForwardOptions: Rail station can be last if bridgehead holds.
  missionDurationTarget: 14 to 18 turns.
difficulty:
  easy: Fewer anti-tank guns.
  normal: Balanced town fight.
  hard: Stronger counterattack.
  veteran: Protecting bridgehead is decisive.
  scalingAxes: AT density, RP, turn limit.
technical:
  scenarioFile: src/data/scenario_carentan.json
  requiresNewMissionKey: true
  metadataChanges: New metadata and deployment doctrine.
  routingChanges: Add to landing order.
  precombatChanges: Airborne and engineer emphasis.
  missionRulesChanges: Historical capture profile.
  validationChanges: Add profile.
  deploymentAliasChanges: None.
  saveLoadImplications: New single-battle key.
  testHooks: Capture town and hold bridgehead.
qa:
  expectedObjectiveCount: 4
  alliedUnitCountRange: 4 to 8 baseline plus purchases.
  enemyUnitCountRange: 16 to 24.
  landmarkZones: Douve bridge, causeway, town, rail station.
  firstContactWindow: Turns 1 to 2.
  victoryTests: Capture three objectives.
  defeatTests: Timer expires.
  edgeCases: Marsh pathing and bridge objective occupancy.
  regressionRisks: Water-adjacent deployment validation.

## Siege of Bastogne

missionKey: assault_bastogne
title: Bastogne
shortLabel: Bastogne
missionType: assault
unlockTier: veteran
routeType: precombat
tutorialMode: none
persistenceMode: single_battle

playerFantasy: You command the encircled Bastogne defense until relief arrives.
intendedExperience: Large surrounded defense with snow, forests, road junctions, and pressure from every side.
historicalFraming: Ardennes, December 1944. U.S. airborne and armored elements hold the road hub against German attacks.
gameplayRole: Hold-until-relief operation.
uiCopy:
  landingBriefing: Hold Bastogne and its road junctions until relief breaks through.
  precombatSummary: Defend a winter perimeter with airborne infantry, armor fragments, anti-tank guns, artillery, and scarce logistics.
  commanderIntent: Keep the center alive, shift reserves by road, and stop armor before it reaches the town.
  expectedResistance: Panzer, panzergrenadier, artillery, flak, and infantry attacks from multiple roads.
  terrainSummary: Snow fields, forests, ridges, villages, and road spokes.
  objectiveSummary: Hold Bastogne center and enough road junctions through the relief window.
  victoryDebrief: Bastogne holds. Relief forces have reached the perimeter.
  failureDebrief: The town road hub has fallen.
map:
  theater: Bastogne, Belgium
  sizeClass: large
  footprintGuidance: 28 by 22 with town center, radial roads, forest belts, and snow fields.
  terrainPalette: snow plains, forest, roads, town, ridge, hamlets.
  landmarks: Bastogne center, Neffe road, Mardasson ridge, southern relief road.
  coverProfile: Strong in town and forest, weak in snow fields.
  losProfile: Broken by forest and villages.
  chokepoints: Road spokes into town.
  alternateRoutes: Forest approaches for infantry.
  elevationNotes: Ridge objectives overlook approaches.
  roadMobilityLogic: Roads allow rapid reserve shifts and enemy thrusts.
  deploymentEdges:
    allied: Central Bastogne perimeter.
    enemy: Multiple outer road approaches.
  weather: Snow and freezing fog.
  visibility: Reduced.
objectives:
  primary:
    - id: hold_bastogne
      type: hold_until_turn_limit
      label: Hold Bastogne until relief.
      purpose: Deny German control of the road hub.
      placementLogic: Friendly objectives ring the town and roads.
      successCondition: Turn limit reached with Bastogne and enough junctions held.
  secondary:
    - id: preserve_perimeter
      type: protected_objectives
      label: Keep at least two road junctions in friendly hands.
      purpose: Preserve defensive mobility.
      successCondition: Required protected objectives friendly at resolution.
  hiddenHooks: Phase escalates from encirclement to panzer pressure to relief countdown.
  victoryConditions: Survive until turn 18 with hold conditions, or eliminate all enemies.
  defeatConditions: Lose Bastogne center, all friendly forces, or fail the relief check.
  turnPressure: 18 turns.
  controlLogic: Historical hold profile.
forces:
  allies:
    concept: Airborne garrison and armored fragments.
    quality: High morale, supply constrained.
    roles:
      - role: infantry perimeter
        countGuidance: 8 to 12
        notes: Hold town and road blocks.
      - role: armor fragments and AT guns
        countGuidance: 3 to 6
        notes: Stop panzer pushes.
    supportAssets: Air drops, artillery, medical and maintenance support.
  enemies:
    concept: Encircling German corps attacks from multiple approaches.
    quality: Veteran armored pressure.
    roles:
      - role: panzer thrusts
        countGuidance: 6 to 10
        notes: Main road threats.
    reserves: Outer ring.
    reinforcements: Abstracted by enemy depth.
    supportAssets: Artillery and flak.
deployment:
  alliedStart: Central perimeter around Bastogne.
  enemyStart: Outer road spokes.
  firstContactExpectation: Turns 1 to 3.
  reserveStaging: Town center.
  neutralZones: Snow fields and forest lanes.
  spawnSafetyNotes: Enemy starts outside direct deployment overlap.
  openingShape: semi_scripted
aiPlan:
  doctrine: Probe multiple roads and mass armor where a roadblock weakens.
  aggressionProfile: High after turn 6.
  defenseProfile: None; attackers push inward.
  reserveTriggers: Commit armor to weakest road objective.
  fallbackRules: Guns maintain standoff.
  counterattackRules: Retake road junctions.
  objectivePriority: Bastogne center first.
  supportBehavior: Artillery on perimeter clusters.
pacing:
  openingPhase: Encirclement pressure.
  midpointShift: Coordinated armor attacks.
  climaxCondition: Relief countdown.
  reinforcementTiming: Battle RP simulates air drops and emergency logistics.
  failForwardOptions: Can lose one outer objective, not the center.
  missionDurationTarget: 16 to 18 turns.
difficulty:
  easy: More starting supply and fewer enemy tanks.
  normal: Standard relief window.
  hard: Stronger panzer columns.
  veteran: Reduced RP and harsher objective threshold.
  scalingAxes: RP income, enemy armor, hold count.
technical:
  scenarioFile: src/data/scenario_bastogne.json
  requiresNewMissionKey: true
  metadataChanges: New metadata.
  routingChanges: Add to landing order.
  precombatChanges: Uses predeployed defenders and high logistics pressure.
  missionRulesChanges: Historical hold-until-relief profile.
  validationChanges: Add profile.
  deploymentAliasChanges: None.
  saveLoadImplications: New single-battle key.
  testHooks: Relief victory and center-loss defeat.
qa:
  expectedObjectiveCount: 4
  alliedUnitCountRange: 8 to 14 baseline plus purchases.
  enemyUnitCountRange: 24 to 36.
  landmarkZones: Town center, road spokes, forest ring.
  firstContactWindow: Turns 1 to 3.
  victoryTests: Hold through turn 18.
  defeatTests: Lose Bastogne center.
  edgeCases: Multiple enemy approaches to same objective.
  regressionRisks: Large map performance and phase state.

## Battle of Remagen

missionKey: assault_remagen
title: Remagen
shortLabel: Remagen
missionType: assault
unlockTier: veteran
routeType: precombat
tutorialMode: none
persistenceMode: single_battle

playerFantasy: You command the rapid seizure and expansion of the Ludendorff Bridge bridgehead.
intendedExperience: Fast bridge assault followed by east-bank expansion under artillery and air pressure.
historicalFraming: Germany, March 1945. U.S. forces capture the Ludendorff Bridge intact and force a Rhine crossing.
gameplayRole: Major river crossing and bridgehead expansion.
uiCopy:
  landingBriefing: Seize the Ludendorff Bridge, clear the east-bank tunnel, and expand the Rhine bridgehead.
  precombatSummary: Commit armor, engineers, infantry, air support, and artillery to take the bridge before German demolition succeeds.
  commanderIntent: Rush the bridge, secure the heights, and keep engineers alive long enough to hold the crossing.
  expectedResistance: German engineers, flak, artillery, infantry, armor remnants, and desperate air attacks.
  terrainSummary: Rhine river, bridge, west town, east-bank ridge, tunnel, and road net.
  objectiveSummary: Capture bridge, tunnel, ridge, and engineer park before turn 18.
  victoryDebrief: The Rhine is crossed and the bridgehead is expanding.
  failureDebrief: The crossing opportunity has been lost.
map:
  theater: Remagen, Germany
  sizeClass: large
  footprintGuidance: 30 by 20 with broad Rhine, bridge lane, ridge, tunnel, and towns.
  terrainPalette: river, bridge, roads, city, hills, forest, rubble.
  landmarks: Ludendorff Bridge, Erpeler Ley ridge, east-bank tunnel, engineer park.
  coverProfile: Urban cover west, ridge cover east, exposed bridge.
  losProfile: Long river and ridge lanes.
  chokepoints: Bridge and tunnel road.
  alternateRoutes: North and south bank approaches after bridgehead forms.
  elevationNotes: East ridge dominates the crossing.
  roadMobilityLogic: Bridge road is decisive.
  deploymentEdges:
    allied: West-bank town and road.
    enemy: East bank ridge and tunnel.
  weather: Early March fog and rain.
  visibility: Medium with river exposure.
objectives:
  primary:
    - id: seize_bridgehead
      type: capture_required_objectives
      label: Seize bridge, tunnel, ridge, and engineer park.
      purpose: Establish Rhine crossing.
      placementLogic: Objectives force a bridge rush and east-bank expansion.
      successCondition: All primary objectives friendly-held.
  secondary:
    - id: silence_demolition_support
      type: destroy_unit_family
      label: Destroy enemy engineers, flak, and artillery.
      purpose: Keep bridge usable.
      successCondition: No Engineer, Flak, or Howitzer units remain.
  hiddenHooks: Phase shifts from bridge rush to bridgehead expansion.
  victoryConditions: Capture all required objectives or eliminate enemies.
  defeatConditions: Turn limit or all friendly units destroyed.
  turnPressure: 18 turns.
  controlLogic: Historical capture profile.
forces:
  allies:
    concept: Armored spearhead with combat engineers and follow-on infantry.
    quality: High momentum.
    roles:
      - role: armor spearhead
        countGuidance: 4 to 8
        notes: Rush bridge and town roads.
      - role: engineers and infantry
        countGuidance: 5 to 9
        notes: Secure bridge and ridge.
    supportAssets: Fighters, bombers, artillery, logistics.
  enemies:
    concept: German bridge demolition force and east-bank defenders.
    quality: Mixed but desperate.
    roles:
      - role: demolition and flak teams
        countGuidance: 4 to 8
        notes: Secondary objective targets.
    reserves: East-bank ridge armor.
    reinforcements: Abstracted by enemy roster.
    supportAssets: Artillery, flak, fighter attacks.
deployment:
  alliedStart: West bank road approaches.
  enemyStart: East bank ridge and tunnel.
  firstContactExpectation: Turn 1 bridge fire.
  reserveStaging: West Remagen road net.
  neutralZones: Bridge and river approaches.
  spawnSafetyNotes: Deployment zones exclude water.
  openingShape: scripted
aiPlan:
  doctrine: Delay bridge crossing, hold ridge, protect demolition teams.
  aggressionProfile: Medium, rising after bridge capture.
  defenseProfile: Strong east-bank defense.
  reserveTriggers: Counterattack bridgehead after bridge falls.
  fallbackRules: Flak and artillery stay on ridge.
  counterattackRules: Retake bridge if exposed.
  objectivePriority: Bridge and east tunnel.
  supportBehavior: Air and artillery pressure crossing.
pacing:
  openingPhase: Rush the bridge.
  midpointShift: Clear tunnel and ridge.
  climaxCondition: East-bank bridgehead secured.
  reinforcementTiming: Player RP simulates follow-on units.
  failForwardOptions: Ridge can be delayed if bridge and tunnel are secure.
  missionDurationTarget: 14 to 18 turns.
difficulty:
  easy: Lower artillery density.
  normal: Standard bridgehead fight.
  hard: More flak and armor.
  veteran: Reduced time for bridgehead expansion.
  scalingAxes: Turn limit, flak density, RP.
technical:
  scenarioFile: src/data/scenario_remagen.json
  requiresNewMissionKey: true
  metadataChanges: New metadata.
  routingChanges: Add to landing order.
  precombatChanges: Engineers and armor emphasized.
  missionRulesChanges: Historical capture profile.
  validationChanges: Add profile.
  deploymentAliasChanges: None.
  saveLoadImplications: New single-battle key.
  testHooks: Capture bridgehead, timer defeat, secondary destroy support.
qa:
  expectedObjectiveCount: 4
  alliedUnitCountRange: 5 to 9 baseline plus purchases.
  enemyUnitCountRange: 18 to 28.
  landmarkZones: West town, Rhine bridge, east ridge, tunnel.
  firstContactWindow: Turn 1.
  victoryTests: Capture all four objectives.
  defeatTests: Timer expiry before bridgehead.
  edgeCases: Bridge hex crossing and water-adjacent objectives.
  regressionRisks: Objective conversion and deployment zones near water.
