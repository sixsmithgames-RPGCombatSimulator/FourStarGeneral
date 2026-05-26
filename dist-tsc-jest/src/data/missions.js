/**
 * Mission metadata and briefing content.
 * Defines all available mission types with their titles and detailed briefing text.
 */
/**
 * Human-readable mission titles for display in the UI.
 * Maps mission keys to their display names.
 */
export const missionTitles = {
    training: "Training Exercise",
    patrol: "Town Defense",
    patrol_river_watch: "River Crossing Watch",
    patrol_pointe_du_hoc: "Pointe du Hoc",
    assault_el_alamein: "El Alamein",
    assault_kasserine_pass: "Kasserine Pass",
    assault_gela_landings: "Gela Landings",
    assault_anzio_beachhead: "Anzio Beachhead",
    assault_monte_cassino: "Monte Cassino",
    assault_omaha_beach: "Omaha Beach",
    assault_carentan: "Carentan",
    assault_arnhem_bridge: "Arnhem Bridge",
    assault_falaise_pocket: "Falaise Pocket",
    assault_hurtgen_forest: "Hurtgen Forest",
    assault_citadel_ridge: "Citadel Ridge",
    assault_bastogne: "Bastogne",
    assault_remagen: "Remagen",
    assault: "Two Bridges",
    // Campaign is surfaced on the landing screen as "Western Europe" to anchor the first grand-operation offering.
    campaign: "Western Europe Campaign"
};
/**
 * Detailed mission briefing text for each mission type.
 * Displayed to the player on the landing screen when selecting a mission.
 */
export const missionBriefings = {
    training: "This is a low-stakes training exercise designed to familiarize your forces with operational procedures. " +
        "Focus on unit coordination and terrain assessment. No hostile contact expected.",
    patrol: "Enemy battle groups are pushing up the southern road net toward the northern town. " +
        "Establish a base camp inside the town perimeter, deploy your reserves around the crossroads, and break the assault before the attackers can force their way into the center. Expect a strong combined-arms attack with armor, artillery, and probing recon screens.",
    patrol_pointe_du_hoc: "Enemy batteries at Pointe du Hoc still dominate the coastal approach. The ridge is cratered and broken, with fortified gun positions on the forward line and a forest counterattack route inland. " +
        "Deploy infantry, engineers, and recon elements to seize the three battery hexes, then hold them against the German response while naval gunfire supports the assault.\n\n" +
        "VICTORY: Capture all three gun positions and hold them simultaneously for 6 consecutive turns.\n" +
        "DEFEAT: Mission fails if all friendly forces are eliminated or the turn limit expires before the hold objective is met.",
    assault_el_alamein: "General, the Axis line at El Alamein is built around ridges, mine belts, and supply tracks that keep armor flowing through the desert. " +
        "Force a corridor through the minefield, take Miteiriya Ridge, and cut the Axis supply track before the armored reserve can restore the line.\n\n" +
        "VICTORY: Capture Miteiriya Ridge, the minefield gap, Tel el Eisa, and the Axis supply track.\n" +
        "DEFEAT: Mission fails if the breakout force is destroyed or the desert assault window closes.",
    assault_kasserine_pass: "General, German armored columns are pushing through the Tunisian passes toward the Tebessa supply road. The ridges channel every tank into predictable but violent lanes. " +
        "Anchor the pass line, keep anti-tank guns alive, and counterattack only after the spearhead commits.\n\n" +
        "VICTORY: Hold the Tebessa road and enough pass objectives until the defense window closes, or destroy the German force.\n" +
        "DEFEAT: Mission fails if Tebessa road falls, all friendly forces are destroyed, or the final hold check fails.",
    assault_gela_landings: "General, the Gela beachhead is ashore but not secure. German armor is forming inland while the port, Ponte Olivo airfield, and Highway 115 remain contested. " +
        "Hold the landing beaches, then drive inland before the counterattack reaches the surf.\n\n" +
        "VICTORY: Capture Gela, Ponte Olivo, and Highway 115 before the turn limit expires.\n" +
        "DEFEAT: Mission fails if all friendly forces are destroyed or the beachhead cannot be expanded in time.",
    assault_anzio_beachhead: "General, the Anzio lodgment is shallow, exposed, and under counterattack from the Alban Hills. " +
        "Hold the port and beachhead perimeter while pushing enough strength inland to control Campoleone and the road off the hills.\n\n" +
        "VICTORY: Hold Anzio port and enough perimeter objectives through the final defense check.\n" +
        "DEFEAT: Mission fails if Anzio port falls, the defense collapses, or all friendly forces are destroyed.",
    assault_monte_cassino: "General, Monte Cassino blocks Route 6 and the approach to Rome. The Rapido crossings are narrow, the town is shattered, and the monastery heights dominate every road. " +
        "Force the river line, clear Cassino, and take the heights before the defenders can reset their guns.\n\n" +
        "VICTORY: Capture Cassino town, the Rapido crossing, monastery heights, and Route 6.\n" +
        "DEFEAT: Mission fails if the assault force is destroyed or the route remains closed at the turn limit.",
    assault_omaha_beach: "General, Omaha is under the guns. The beach is exposed, the draws are mined and covered, and the ridge line is still in German hands. " +
        "Breach the exits, silence the guns, and push enough combat power inland to open the landing zone.\n\n" +
        "VICTORY: Secure all beach-exit and ridge-control objectives before the assault window closes.\n" +
        "DEFEAT: Mission fails if the assault force is destroyed or the exits remain closed at the turn limit.",
    assault_carentan: "General, Carentan controls the link between the Utah and Omaha lodgments. Marsh, canals, and narrow causeways make every bridge a battle. " +
        "Keep the Douve bridgehead open, force the causeway, and clear the town before German reserves split the beaches.\n\n" +
        "VICTORY: Capture the causeway, Carentan town center, and rail station.\n" +
        "DEFEAT: Mission fails if friendly forces are destroyed or the corridor remains broken at the turn limit.",
    assault_arnhem_bridge: "General, the airborne force holds a fragile line from Oosterbeek toward Arnhem Bridge. The Rhine crossing must stay open long enough for relief columns to reach it. " +
        "Hold the bridge, protect the perimeter, and keep the drop zone usable while enemy armor closes from the south bank.\n\n" +
        "VICTORY: Hold Arnhem Bridge and enough airborne objectives through the relief window.\n" +
        "DEFEAT: Mission fails immediately if the bridge falls, or if the airborne line fails its final hold check.",
    assault_falaise_pocket: "General, the enemy is compressed inside the Falaise pocket and still trying to escape east. " +
        "Close the jaws at Chambois, Trun, Argentan Road, and the final escape gap before the trapped armor breaks out.\n\n" +
        "VICTORY: Capture every pocket-control objective before the enemy escape route stabilizes.\n" +
        "DEFEAT: Mission fails if the pocket remains open at the turn limit or all friendly forces are destroyed.",
    assault_hurtgen_forest: "General, the Hurtgen Forest is a brutal fight of narrow roads, deep woods, and ridgelines that punish every exposed movement. " +
        "Take Huertgen village, the Kall Trail, Hill 400, and the Roer Dam road while preserving enough formations to keep the advance supplied.\n\n" +
        "VICTORY: Capture all forest objectives before the operation window closes.\n" +
        "DEFEAT: Mission fails if the assault force is destroyed or the forest line remains in enemy hands.",
    patrol_river_watch: "Recon reports enemy infiltrators massing along the river. Multiple shallow fords cut through the bend—if they slip across, they'll have a lodgment before dawn. " +
        "Deploy your patrols to occupy and hold each crossing with your units.\n\n" +
        "VICTORY: Hold ALL THREE fords simultaneously with your forces for 8 consecutive turns.\n" +
        "DEFEAT: Mission fails if the enemy secures and holds any ford for 8 consecutive turns.",
    assault_citadel_ridge: "Recon has identified a fortified ridge complex controlling the only road into the sector. Enemy infantry are already dug in, bunker guns cover the slopes, and heavy anti-air batteries protect the rear. " +
        "Assemble a full assault group, break the outer batteries, and seize the command ridge before the defenders can regroup.\n\n" +
        "VICTORY: Capture the command ridge and at least two additional strongpoints before the turn limit expires.\n" +
        "DEFEAT: Mission fails if the assault window closes before the command ridge is secured, or if all friendly combat units are destroyed.",
    assault_bastogne: "General, Bastogne is surrounded. The town is a road hub, and the enemy needs it to keep the Ardennes offensive moving. " +
        "Hold the center, keep enough road junctions in friendly hands, and survive until relief reaches the perimeter.\n\n" +
        "VICTORY: Hold Bastogne and enough perimeter objectives through the relief window.\n" +
        "DEFEAT: Mission fails if Bastogne center falls, all friendly forces are destroyed, or the relief check fails.",
    assault_remagen: "General, the Ludendorff Bridge still stands. This is the opening to cross the Rhine before the enemy can demolish or seal it. " +
        "Rush the bridge, clear the east-bank tunnel and ridge, and expand the bridgehead under flak and artillery fire.\n\n" +
        "VICTORY: Capture the bridge, tunnel, ridge, and engineer park before the turn limit expires.\n" +
        "DEFEAT: Mission fails if the bridgehead is not secured in time or all friendly assault forces are destroyed.",
    assault: "German forces hold two critical bridges and a fortified bastion beyond the river bend. " +
        "Your assault group has a foothold on the western bank with armor, engineers, artillery, and air support already in theater.\n\n" +
        "VICTORY: Seize both bridges and the bastion city before the assault window closes.\n" +
        "DEFEAT: Mission fails if all friendly assault forces are destroyed or the turn limit expires before the crossings are secure.",
    campaign: "Launch the Western Europe offensive to liberate occupied territory and secure critical ports. " +
        "Advance fronts, manage scarce resources, and coordinate air support over multiple linked operations."
};
export const missionSummaryPackages = {
    training: {
        objectives: [
            "Execute training maneuvers without exceeding casualty thresholds.",
            "Rotate every unit type through live-fire exercises."
        ],
        turnLimit: 8,
        doctrine: "Emphasize combined-arms rehearsal; focus on communication drills over live combat.",
        supplies: [
            { label: "Rations", amount: "Full stock" },
            { label: "Fuel", amount: "Minimal usage expected" },
            { label: "Ammo", amount: "Live-fire allotment only" }
        ]
    },
    patrol: {
        objectives: [
            "Primary: Repel the enemy assault and keep the town in friendly hands.",
            "Secondary: Destroy all enemy forces."
        ],
        turnLimit: 25,
        doctrine: "Anchor the defense on the town perimeter, use the road lattice to shift reserves, and let artillery and anti-tank screens break up enemy armor before it reaches the center.",
        supplies: [
            { label: "Requisition Budget", amount: "5,000 requisition points" },
            { label: "Allied Garrison", amount: "Infantry, engineers, anti-tank gun, recon patrol" }
        ]
    },
    patrol_pointe_du_hoc: {
        objectives: [
            "Primary: Capture all three gun positions and hold them simultaneously for 6 consecutive turns.",
            "Secondary: Neutralize all battery emplacements on the ridge line.",
            "Tertiary: Keep at least three assault units operational at mission end."
        ],
        turnLimit: 20,
        doctrine: "Push through the crater belt, clear each gun pit with close infantry-engineer coordination, and rotate fresh units onto captured positions before the inland counterattack reconnects the battery line.",
        supplies: [
            { label: "Assault Force", amount: "Infantry, engineers, and recon bikes only (no armor)." },
            { label: "Support Access", amount: "In-battle requisitions are limited to ammo, infantry, and naval gunfire support." },
            { label: "Operational Window", amount: "20-turn assault window" }
        ]
    },
    assault_el_alamein: {
        objectives: [
            "Primary: Capture Miteiriya Ridge, the minefield gap, Tel el Eisa, and the Axis supply track.",
            "Secondary: Destroy the Axis armored reserve.",
            "Tertiary: Keep an engineer formation operational."
        ],
        turnLimit: 20,
        doctrine: "Fix the ridge defenders with infantry and guns, breach the mine belt with engineers, then commit armor through the opened corridor before the Axis reserve can counterattack.",
        supplies: [
            { label: "Requisition Budget", amount: "3,200 requisition points" },
            { label: "Desert Breakout Force", amount: "Infantry, engineers, tank destroyers, heavy armor, artillery, supply, recon, and fighter support predeployed" },
            { label: "Operational Window", amount: "20-turn desert breach" }
        ]
    },
    assault_kasserine_pass: {
        objectives: [
            "Primary: Hold Tebessa road and enough pass objectives until the defense window closes.",
            "Secondary: Destroy the German armored spearhead.",
            "Tertiary: Keep at least five friendly formations operational."
        ],
        turnLimit: 16,
        doctrine: "Anchor the roadblocks, leave tanks in reserve until the panzer columns commit, and use artillery to punish armor trapped in the pass lanes.",
        supplies: [
            { label: "Requisition Budget", amount: "2,200 requisition points" },
            { label: "Baseline Defense", amount: "Infantry, engineers, anti-tank guns, tank destroyer, artillery, and recon already on the pass line" },
            { label: "Operational Window", amount: "16-turn pass defense" }
        ]
    },
    assault_gela_landings: {
        objectives: [
            "Primary: Capture Gela port, Ponte Olivo airfield, and Highway 115.",
            "Secondary: Keep the beachhead anchor in friendly hands.",
            "Tertiary: Silence the enemy flak and artillery around the airfield."
        ],
        turnLimit: 18,
        doctrine: "Hold the landing beaches with infantry and guns, then drive armor and engineers inland once naval fire has broken the counterattack route.",
        supplies: [
            { label: "Requisition Budget", amount: "2,500 requisition points" },
            { label: "Beachhead Force", amount: "Infantry, engineers, armor, anti-tank guns, artillery, and fighter cover already ashore" },
            { label: "Operational Window", amount: "18-turn beachhead breakout" }
        ]
    },
    assault_anzio_beachhead: {
        objectives: [
            "Primary: Hold Anzio port and enough beachhead objectives through the final defense check.",
            "Secondary: Keep the perimeter and Campoleone line in friendly hands.",
            "Tertiary: Keep at least seven friendly formations operational."
        ],
        turnLimit: 18,
        doctrine: "Anchor the port, hold a compact perimeter, and use armor and naval fire support only after the hill counterattack commits into the road net.",
        supplies: [
            { label: "Requisition Budget", amount: "3,000 requisition points" },
            { label: "Beachhead Defense", amount: "Infantry, engineers, tank destroyers, artillery, supply, recon, and fighter cover already ashore" },
            { label: "Operational Window", amount: "18-turn beachhead defense" }
        ]
    },
    assault_monte_cassino: {
        objectives: [
            "Primary: Capture Cassino town, the Rapido crossing, monastery heights, and Route 6.",
            "Secondary: Destroy enemy guns on the heights and town approaches.",
            "Tertiary: Keep an engineer formation operational."
        ],
        turnLimit: 20,
        doctrine: "Use artillery and air support to suppress the heights, force a crossing with engineers, and clear Route 6 one strongpoint at a time.",
        supplies: [
            { label: "Requisition Budget", amount: "3,300 requisition points" },
            { label: "Mountain Assault Force", amount: "Infantry, engineers, armor, artillery, supply, recon, close air support, and bombers predeployed" },
            { label: "Operational Window", amount: "20-turn mountain assault" }
        ]
    },
    assault_omaha_beach: {
        objectives: [
            "Primary: Open every beach exit and seize the ridge-control position.",
            "Secondary: Destroy enemy artillery and flak covering the beach.",
            "Tertiary: Keep at least four assault formations operational."
        ],
        turnLimit: 20,
        doctrine: "Use engineers to crack the draws, suppress ridge guns before moving armor, and push infantry inland as soon as an exit opens.",
        supplies: [
            { label: "Requisition Budget", amount: "3,000 requisition points" },
            { label: "Assault Waves", amount: "Infantry, engineers, armor, anti-tank guns, artillery, and fighter support on the beach" },
            { label: "Operational Window", amount: "20-turn D-Day assault" }
        ]
    },
    assault_carentan: {
        objectives: [
            "Primary: Capture the causeway, Carentan town center, and rail station.",
            "Secondary: Keep the Douve bridgehead secure.",
            "Tertiary: Destroy enemy assault guns and anti-tank guns."
        ],
        turnLimit: 18,
        doctrine: "Advance by causeway with infantry and engineers, protect the bridgehead, then bring armor through once the town streets are under control.",
        supplies: [
            { label: "Requisition Budget", amount: "2,200 requisition points" },
            { label: "Airborne Spearhead", amount: "Paratroopers, engineers, anti-tank guns, light armor, and recon already in contact" },
            { label: "Operational Window", amount: "18-turn town-and-causeway fight" }
        ]
    },
    assault_arnhem_bridge: {
        objectives: [
            "Primary: Hold Arnhem Bridge and enough airborne objectives until relief can arrive.",
            "Secondary: Keep the Oosterbeek perimeter and drop zone in friendly hands.",
            "Tertiary: Keep at least four airborne formations operational."
        ],
        turnLimit: 18,
        doctrine: "Keep bridge and perimeter forces mutually supporting, use anti-tank guns to delay armor, and protect the drop zone long enough to sustain the airborne line.",
        supplies: [
            { label: "Requisition Budget", amount: "2,800 requisition points" },
            { label: "Airborne Force", amount: "Paratroopers, engineers, anti-tank guns, artillery, supply, recon, and fighter support predeployed" },
            { label: "Operational Window", amount: "18-turn bridge hold" }
        ]
    },
    assault_falaise_pocket: {
        objectives: [
            "Primary: Capture Chambois, Trun, Argentan Road, and the escape gap.",
            "Secondary: Destroy enemy armor trapped inside the pocket.",
            "Tertiary: Keep at least seven friendly formations operational."
        ],
        turnLimit: 20,
        doctrine: "Close both pincers at speed, block the eastern exit with armor and tank destroyers, and use air support to prevent the trapped force from concentrating.",
        supplies: [
            { label: "Requisition Budget", amount: "3,400 requisition points" },
            { label: "Pocket-Closure Force", amount: "Two Allied jaws with infantry, engineers, armor, artillery, supply, recon, fighter, and close air support" },
            { label: "Operational Window", amount: "20-turn encirclement" }
        ]
    },
    assault_hurtgen_forest: {
        objectives: [
            "Primary: Capture Huertgen village, the Kall Trail, Hill 400, and the Roer Dam road.",
            "Secondary: Destroy enemy guns and armor covering the forest roads.",
            "Tertiary: Keep at least six friendly formations operational."
        ],
        turnLimit: 20,
        doctrine: "Advance in short bounds through the woods, keep engineers close to the trail, and avoid feeding armor into unsupported ridgelines.",
        supplies: [
            { label: "Requisition Budget", amount: "3,100 requisition points" },
            { label: "Forest Assault Force", amount: "Infantry, engineers, anti-tank guns, armor, artillery, supply, recon, and close air support predeployed" },
            { label: "Operational Window", amount: "20-turn forest assault" }
        ]
    },
    patrol_river_watch: {
        objectives: [
            "Primary: Hold all three fords simultaneously for 8 consecutive turns.",
            "Secondary: Destroy the enemy comms team before it reaches the central ford.",
            "Tertiary: Keep at least one recon unit alive."
        ],
        turnLimit: 12,
        doctrine: "Occupy all three crossings with your units. Shift forces between hedgerow lanes before the enemy can mass. Hold the two off-map artillery fire missions for the ford that starts to buckle.",
        supplies: [
            { label: "Predeployed Patrol", amount: "2 rifle squads, engineers, recon bike patrol" },
            { label: "Off-map Artillery", amount: "2 fire missions" },
            { label: "Duration", amount: "12-turn operation" }
        ]
    },
    assault_citadel_ridge: {
        objectives: [
            "Primary: Seize the command ridge and any two additional strongpoints.",
            "Secondary: Destroy both flak 88 batteries covering the approach.",
            "Tertiary: Silence the bunker guns anchoring the north and south bastions."
        ],
        turnLimit: 17,
        doctrine: "Mass fires and armor on one shoulder of the ridge, suppress the bunker line, then commit infantry to hold the captured strongpoints before the defenders can counterattack.",
        supplies: [
            { label: "Requisition Budget", amount: "2,600 requisition points" },
            { label: "Baseline Forces", amount: "No predeployed units" },
            { label: "Operational Window", amount: "17-turn assault window" }
        ]
    },
    assault_bastogne: {
        objectives: [
            "Primary: Hold Bastogne center and enough perimeter objectives until relief arrives.",
            "Secondary: Keep at least two road junctions in friendly hands.",
            "Tertiary: Keep at least seven friendly formations operational."
        ],
        turnLimit: 18,
        doctrine: "Defend in depth from the town road hub, shift reserves along interior roads, and stop German armor before it reaches Bastogne center.",
        supplies: [
            { label: "Requisition Budget", amount: "1,800 requisition points" },
            { label: "Encircled Garrison", amount: "Airborne infantry, armor fragments, anti-tank guns, artillery, and supply trucks predeployed" },
            { label: "Operational Window", amount: "18-turn relief defense" }
        ]
    },
    assault_remagen: {
        objectives: [
            "Primary: Capture the Ludendorff Bridge, east-bank tunnel, Erpeler Ley ridge, and engineer park.",
            "Secondary: Destroy enemy engineers, flak, and artillery threatening the crossing.",
            "Tertiary: Keep at least one engineer formation operational."
        ],
        turnLimit: 18,
        doctrine: "Rush armor and engineers onto the bridge, suppress the ridge with artillery and air support, then expand east before the defenders can counterattack.",
        supplies: [
            { label: "Requisition Budget", amount: "2,800 requisition points" },
            { label: "Armored Spearhead", amount: "Armor, infantry, engineers, artillery, fighter-bombers, and recon predeployed on the west bank" },
            { label: "Operational Window", amount: "18-turn Rhine bridgehead seizure" }
        ]
    },
    assault: {
        objectives: [
            "Primary: Seize both bridges and the bastion city.",
            "Secondary: Keep the western supply base in friendly hands.",
            "Tertiary: Silence enemy artillery and air-defense guns."
        ],
        turnLimit: 20,
        doctrine: "Probe both bridge approaches, pin the German screen with artillery, then commit armor and engineers through the crossing that cracks first while reserves guard the supply base.",
        supplies: [
            { label: "Requisition Budget", amount: "1,200 requisition points" },
            { label: "Forward Detachment", amount: "Armor, infantry, engineers, artillery, flak, and air support already in theater" },
            { label: "Operational Window", amount: "20-turn bridge assault" }
        ]
    },
    campaign: {
        objectives: [
            "Capture sequential strategic nodes to cut enemy logistics.",
            "Sustain momentum across multi-phase offensive."
        ],
        turnLimit: 999,
        doctrine: "Apply deep operations doctrine; safeguard supply corridors at all times.",
        supplies: [
            { label: "Rations", amount: "Bulk depot established" },
            { label: "Fuel", amount: "Escort convoys nightly" },
            { label: "Ammo", amount: "Allocate heavy artillery shells" }
        ]
    }
};
const missionCategories = {
    training: "training",
    patrol: "patrol",
    patrol_river_watch: "patrol",
    patrol_pointe_du_hoc: "patrol",
    assault_el_alamein: "assault",
    assault_kasserine_pass: "assault",
    assault_gela_landings: "assault",
    assault_anzio_beachhead: "assault",
    assault_monte_cassino: "assault",
    assault_omaha_beach: "assault",
    assault_carentan: "assault",
    assault_arnhem_bridge: "assault",
    assault_falaise_pocket: "assault",
    assault_hurtgen_forest: "assault",
    assault_citadel_ridge: "assault",
    assault_bastogne: "assault",
    assault_remagen: "assault",
    assault: "assault",
    campaign: "campaign"
};
const missionDeploymentProfiles = {
    training: {
        preferredZoneKey: "zone-alpha",
        focusLabel: "training line",
        validation: {
            minimumPlayerZoneCapacityTotal: 20,
            minimumPlayerZoneFrontage: 5,
            minimumPlayerZoneDepth: 4
        },
        zoneDoctrine: [
            {
                zoneKey: "zone-alpha",
                minimumCapacity: 12,
                minimumFrontage: 5,
                minimumDepth: 4
            },
            {
                zoneKey: "zone-bravo",
                minimumCapacity: 16,
                minimumFrontage: 5,
                minimumDepth: 4
            }
        ]
    },
    patrol: {
        preferredZoneKey: "zone-alpha",
        focusLabel: "town perimeter",
        validation: {
            minimumPlayerZoneCapacityTotal: 20,
            minimumPlayerZoneFrontage: 5,
            minimumPlayerZoneDepth: 4
        },
        zoneDoctrine: [
            {
                zoneKey: "zone-alpha",
                minimumCapacity: 20,
                minimumFrontage: 5,
                minimumDepth: 4
            }
        ]
    },
    patrol_pointe_du_hoc: {
        preferredZoneKey: "allied-assault-start",
        focusLabel: "forward assault assembly",
        validation: {
            minimumPlayerZoneCapacityTotal: 12,
            minimumPlayerZoneFrontage: 4,
            minimumPlayerZoneDepth: 2
        },
        zoneDoctrine: [
            {
                zoneKey: "allied-assault-start",
                minimumCapacity: 12,
                minimumFrontage: 4,
                minimumDepth: 2
            }
        ]
    },
    patrol_river_watch: {
        preferredZoneKey: "allied-start",
        focusLabel: "line of departure",
        validation: {
            minimumPlayerZoneCapacityTotal: 16,
            minimumPlayerZoneFrontage: 4,
            minimumPlayerZoneDepth: 3
        },
        zoneDoctrine: [
            {
                zoneKey: "allied-start",
                minimumCapacity: 16,
                minimumFrontage: 4,
                minimumDepth: 3
            }
        ]
    },
    assault_el_alamein: {
        preferredZoneKey: "eighth-army-start",
        focusLabel: "desert breach line",
        validation: {
            minimumPlayerZoneCapacityTotal: 70,
            minimumPlayerZoneFrontage: 7,
            minimumPlayerZoneDepth: 6
        },
        zoneDoctrine: [
            {
                zoneKey: "eighth-army-start",
                minimumCapacity: 42,
                minimumFrontage: 7,
                minimumDepth: 6
            },
            {
                zoneKey: "reserve-armored-lane",
                minimumCapacity: 30,
                minimumFrontage: 6,
                minimumDepth: 6
            }
        ]
    },
    assault_kasserine_pass: {
        preferredZoneKey: "tebessa-road-line",
        focusLabel: "pass defense line",
        validation: {
            minimumPlayerZoneCapacityTotal: 40,
            minimumPlayerZoneFrontage: 5,
            minimumPlayerZoneDepth: 4
        },
        zoneDoctrine: [
            {
                zoneKey: "tebessa-road-line",
                minimumCapacity: 20,
                minimumFrontage: 5,
                minimumDepth: 4
            },
            {
                zoneKey: "pass-blocking-line",
                minimumCapacity: 24,
                minimumFrontage: 5,
                minimumDepth: 4
            }
        ]
    },
    assault_gela_landings: {
        preferredZoneKey: "beach-fox",
        focusLabel: "Gela beachhead",
        validation: {
            minimumPlayerZoneCapacityTotal: 44,
            minimumPlayerZoneFrontage: 8,
            minimumPlayerZoneDepth: 3
        },
        zoneDoctrine: [
            {
                zoneKey: "beach-fox",
                minimumCapacity: 22,
                minimumFrontage: 8,
                minimumDepth: 3
            },
            {
                zoneKey: "beach-george",
                minimumCapacity: 22,
                minimumFrontage: 8,
                minimumDepth: 3
            }
        ]
    },
    assault_anzio_beachhead: {
        preferredZoneKey: "anzio-port-perimeter",
        focusLabel: "Anzio beachhead",
        validation: {
            minimumPlayerZoneCapacityTotal: 68,
            minimumPlayerZoneFrontage: 7,
            minimumPlayerZoneDepth: 5
        },
        zoneDoctrine: [
            {
                zoneKey: "anzio-port-perimeter",
                minimumCapacity: 42,
                minimumFrontage: 8,
                minimumDepth: 5
            },
            {
                zoneKey: "beachhead-reserve",
                minimumCapacity: 28,
                minimumFrontage: 7,
                minimumDepth: 5
            }
        ]
    },
    assault_monte_cassino: {
        preferredZoneKey: "rapido-west-bank",
        focusLabel: "Rapido assault line",
        validation: {
            minimumPlayerZoneCapacityTotal: 70,
            minimumPlayerZoneFrontage: 6,
            minimumPlayerZoneDepth: 5
        },
        zoneDoctrine: [
            {
                zoneKey: "rapido-west-bank",
                minimumCapacity: 45,
                minimumFrontage: 6,
                minimumDepth: 8
            },
            {
                zoneKey: "route-six-assembly",
                minimumCapacity: 25,
                minimumFrontage: 6,
                minimumDepth: 5
            }
        ]
    },
    assault_omaha_beach: {
        preferredZoneKey: "dog-green-beach",
        focusLabel: "Omaha assault beaches",
        validation: {
            minimumPlayerZoneCapacityTotal: 44,
            minimumPlayerZoneFrontage: 8,
            minimumPlayerZoneDepth: 3
        },
        zoneDoctrine: [
            {
                zoneKey: "dog-green-beach",
                minimumCapacity: 22,
                minimumFrontage: 8,
                minimumDepth: 3
            },
            {
                zoneKey: "easy-red-beach",
                minimumCapacity: 22,
                minimumFrontage: 8,
                minimumDepth: 3
            }
        ]
    },
    assault_carentan: {
        preferredZoneKey: "douve-bridgehead",
        focusLabel: "Carentan causeway",
        validation: {
            minimumPlayerZoneCapacityTotal: 40,
            minimumPlayerZoneFrontage: 8,
            minimumPlayerZoneDepth: 4
        },
        zoneDoctrine: [
            {
                zoneKey: "douve-bridgehead",
                minimumCapacity: 20,
                minimumFrontage: 8,
                minimumDepth: 4
            },
            {
                zoneKey: "causeway-followup",
                minimumCapacity: 20,
                minimumFrontage: 8,
                minimumDepth: 4
            }
        ]
    },
    assault_arnhem_bridge: {
        preferredZoneKey: "airborne-drop-zone",
        focusLabel: "Arnhem airborne corridor",
        validation: {
            minimumPlayerZoneCapacityTotal: 70,
            minimumPlayerZoneFrontage: 8,
            minimumPlayerZoneDepth: 4
        },
        zoneDoctrine: [
            {
                zoneKey: "airborne-drop-zone",
                minimumCapacity: 40,
                minimumFrontage: 8,
                minimumDepth: 5
            },
            {
                zoneKey: "oosterbeek-perimeter",
                minimumCapacity: 32,
                minimumFrontage: 8,
                minimumDepth: 4
            }
        ]
    },
    assault_falaise_pocket: {
        preferredZoneKey: "chambois-jaw",
        focusLabel: "Falaise pocket jaws",
        validation: {
            minimumPlayerZoneCapacityTotal: 80,
            minimumPlayerZoneFrontage: 8,
            minimumPlayerZoneDepth: 6
        },
        zoneDoctrine: [
            {
                zoneKey: "chambois-jaw",
                minimumCapacity: 44,
                minimumFrontage: 8,
                minimumDepth: 6
            },
            {
                zoneKey: "argentan-jaw",
                minimumCapacity: 44,
                minimumFrontage: 8,
                minimumDepth: 6
            }
        ]
    },
    assault_hurtgen_forest: {
        preferredZoneKey: "forest-line-alpha",
        focusLabel: "Hurtgen forest line",
        validation: {
            minimumPlayerZoneCapacityTotal: 80,
            minimumPlayerZoneFrontage: 7,
            minimumPlayerZoneDepth: 6
        },
        zoneDoctrine: [
            {
                zoneKey: "forest-line-alpha",
                minimumCapacity: 50,
                minimumFrontage: 7,
                minimumDepth: 7
            },
            {
                zoneKey: "kall-trail-reserve",
                minimumCapacity: 36,
                minimumFrontage: 7,
                minimumDepth: 6
            }
        ]
    },
    assault_citadel_ridge: {
        preferredZoneKey: "west-assembly-north",
        focusLabel: "assault assembly area",
        validation: {
            minimumPlayerZoneCapacityTotal: 32,
            minimumPlayerZoneFrontage: 5,
            minimumPlayerZoneDepth: 4
        },
        zoneDoctrine: [
            {
                zoneKey: "west-assembly-north",
                minimumCapacity: 20,
                minimumFrontage: 5,
                minimumDepth: 4
            },
            {
                zoneKey: "west-assembly-south",
                minimumCapacity: 20,
                minimumFrontage: 5,
                minimumDepth: 4
            }
        ]
    },
    assault_bastogne: {
        preferredZoneKey: "bastogne-core",
        focusLabel: "Bastogne perimeter",
        validation: {
            minimumPlayerZoneCapacityTotal: 54,
            minimumPlayerZoneFrontage: 6,
            minimumPlayerZoneDepth: 4
        },
        zoneDoctrine: [
            {
                zoneKey: "bastogne-core",
                minimumCapacity: 28,
                minimumFrontage: 6,
                minimumDepth: 5
            },
            {
                zoneKey: "southern-perimeter",
                minimumCapacity: 26,
                minimumFrontage: 8,
                minimumDepth: 4
            }
        ]
    },
    assault_remagen: {
        preferredZoneKey: "remagen-west-approach",
        focusLabel: "Rhine bridge approach",
        validation: {
            minimumPlayerZoneCapacityTotal: 50,
            minimumPlayerZoneFrontage: 8,
            minimumPlayerZoneDepth: 5
        },
        zoneDoctrine: [
            {
                zoneKey: "remagen-west-approach",
                minimumCapacity: 28,
                minimumFrontage: 8,
                minimumDepth: 6
            },
            {
                zoneKey: "west-bank-followup",
                minimumCapacity: 22,
                minimumFrontage: 8,
                minimumDepth: 5
            }
        ]
    },
    assault: {
        preferredZoneKey: "zone-alpha",
        focusLabel: "two-bridge assault line",
        validation: {
            minimumPlayerZoneCapacityTotal: 20,
            minimumPlayerZoneFrontage: 5,
            minimumPlayerZoneDepth: 4
        },
        zoneDoctrine: [
            {
                zoneKey: "zone-alpha",
                minimumCapacity: 12,
                minimumFrontage: 5,
                minimumDepth: 4
            },
            {
                zoneKey: "zone-bravo",
                minimumCapacity: 16,
                minimumFrontage: 5,
                minimumDepth: 4
            }
        ]
    },
    campaign: {
        preferredZoneKey: "zone-alpha",
        focusLabel: "forward line",
        validation: {
            minimumPlayerZoneCapacityTotal: 20,
            minimumPlayerZoneFrontage: 5,
            minimumPlayerZoneDepth: 4
        },
        zoneDoctrine: [
            {
                zoneKey: "zone-alpha",
                minimumCapacity: 12,
                minimumFrontage: 5,
                minimumDepth: 4
            },
            {
                zoneKey: "zone-bravo",
                minimumCapacity: 16,
                minimumFrontage: 5,
                minimumDepth: 4
            }
        ]
    }
};
const missionUnlockRequirements = {
    training: {
        missionsCompleted: 0,
        victories: 0,
        description: "Available to all commanders"
    },
    patrol: {
        missionsCompleted: 0,
        victories: 0,
        description: "Available to all commanders"
    },
    patrol_river_watch: {
        missionsCompleted: 0,
        victories: 0,
        description: "Available to all commanders"
    },
    patrol_pointe_du_hoc: {
        missionsCompleted: 1,
        victories: 0,
        description: "Requires 1 completed mission"
    },
    assault_el_alamein: {
        missionsCompleted: 2,
        victories: 1,
        description: "Requires 2 completed missions and 1 victory"
    },
    assault_kasserine_pass: {
        missionsCompleted: 2,
        victories: 0,
        description: "Requires 2 completed missions"
    },
    assault_gela_landings: {
        missionsCompleted: 2,
        victories: 1,
        description: "Requires 2 completed missions and 1 victory"
    },
    assault_anzio_beachhead: {
        missionsCompleted: 3,
        victories: 1,
        description: "Requires 3 completed missions and 1 victory"
    },
    assault_monte_cassino: {
        missionsCompleted: 3,
        victories: 2,
        description: "Requires 3 completed missions and 2 victories"
    },
    assault_omaha_beach: {
        missionsCompleted: 3,
        victories: 1,
        description: "Requires 3 completed missions and 1 victory"
    },
    assault_carentan: {
        missionsCompleted: 3,
        victories: 1,
        description: "Requires 3 completed missions and 1 victory"
    },
    assault_arnhem_bridge: {
        missionsCompleted: 4,
        victories: 2,
        description: "Requires 4 completed missions and 2 victories"
    },
    assault_falaise_pocket: {
        missionsCompleted: 5,
        victories: 3,
        description: "Requires 5 completed missions and 3 victories"
    },
    assault_hurtgen_forest: {
        missionsCompleted: 5,
        victories: 3,
        description: "Requires 5 completed missions and 3 victories"
    },
    assault: {
        missionsCompleted: 2,
        victories: 0,
        description: "Requires 2 completed missions"
    },
    assault_citadel_ridge: {
        missionsCompleted: 3,
        victories: 2,
        description: "Requires 3 completed missions and 2 victories"
    },
    assault_bastogne: {
        missionsCompleted: 4,
        victories: 2,
        description: "Requires 4 completed missions and 2 victories"
    },
    assault_remagen: {
        missionsCompleted: 5,
        victories: 3,
        description: "Requires 5 completed missions and 3 victories"
    },
    campaign: {
        missionsCompleted: 3,
        victories: 2,
        description: "Requires 3 completed missions and 2 victories"
    }
};
export function getMissionProfile(mission, difficulty) {
    return {
        title: getMissionTitle(mission),
        briefing: getMissionBriefing(mission),
        category: missionCategories[mission],
        summary: getMissionSummaryPackage(mission, difficulty),
        deployment: missionDeploymentProfiles[mission],
        unlockRequirement: missionUnlockRequirements[mission]
    };
}
export function getMissionUnlockRequirement(mission) {
    return missionUnlockRequirements[mission];
}
export function isMissionUnlocked(mission, missionsCompleted, victories, hasCampaignUnlock) {
    const requirement = missionUnlockRequirements[mission];
    const meetsExperienceRequirements = missionsCompleted >= requirement.missionsCompleted && victories >= requirement.victories;
    if (mission === "campaign") {
        return meetsExperienceRequirements && (hasCampaignUnlock !== false);
    }
    return meetsExperienceRequirements;
}
export function getMissionDeploymentProfile(mission) {
    return missionDeploymentProfiles[mission];
}
export function getMissionDeploymentZoneDoctrine(mission, zoneKey) {
    return missionDeploymentProfiles[mission].zoneDoctrine.find((zone) => zone.zoneKey === zoneKey) ?? null;
}
/**
 * Get mission title by key.
 * @param mission - Mission key identifier
 * @returns Human-readable mission title
 */
export function getMissionTitle(mission) {
    return missionTitles[mission] ?? "Unknown Mission";
}
/**
 * Get mission briefing text by key.
 * @param mission - Mission key identifier
 * @returns Detailed mission briefing text
 */
export function getMissionBriefing(mission) {
    return missionBriefings[mission] ?? "No briefing available.";
}
export function getMissionTurnLimit(mission, _difficulty) {
    return missionSummaryPackages[mission].turnLimit;
}
export function getMissionSummaryPackage(mission, _difficulty) {
    return missionSummaryPackages[mission];
}
/**
 * Get all available mission keys.
 * @returns Array of all mission keys
 */
export function getAllMissionKeys() {
    return Object.keys(missionTitles);
}
/**
 * Check if a mission key is valid.
 * @param key - Key to validate
 * @returns True if the mission exists
 */
export function isValidMission(key) {
    return key in missionTitles;
}
