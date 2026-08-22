# Normandy D+1 authored reference

The Western Europe campaign opens at 00:00 on 7 June 1944 (D+1), after the initial assault. It is a 10 km-per-hex operational abstraction, not a battalion-by-battalion simulation. Counts represent maneuver groups at campaign scale; named formations, relative geography, operational role, and arrival posture carry the historical meaning.

## Geographic contract

The five assault beaches run west to east as Utah, Omaha, Gold, Juno, and Sword. U.S. airborne forces are behind Utah near Ste-Mère-Église; British 6th Airborne is east of Sword at the Orne crossings. Cherbourg is northwest of Utah in the Cotentin. Caen is southeast of Sword. The Western and Eastern naval task forces occupy separate Channel fire-support stations because the invasion fleet was organized into western and eastern naval forces supporting different beach groups.

The 1024×1024 campaign background is the authoritative geographic surface. It is rendered without crop or distortion beneath a regular 58×50 flat-top odd-q lattice. Neighboring centers represent 10 km. The explicit water mask was sampled from the painted hex footprints and filtered to the connected sea component; it follows the illustration's Channel and coastline rather than synthetic row bands.

The five beach anchors span eight hexes (about 80 km), matching the U.S. Army's 50-mile description of the landing frontage. Cherbourg sits at the painted Cotentin tip, the beaches follow the Normandy shoreline west-to-east, and Caen sits inland to the east. A ground anchor is accepted only when the majority of its registered image footprint is land; a naval station is accepted only when the majority is water.

## Opening order of battle

Allied opening formations represented:

- Utah: U.S. 4th Infantry Division and VII Corps engineers.
- Omaha: U.S. 1st and 29th Infantry Divisions and V Corps engineers.
- Gold: British 50th Infantry Division and 8th Armoured Brigade.
- Juno: 3rd Canadian Infantry Division and 2nd Canadian Armoured Brigade.
- Sword: British 3rd Infantry Division and 27th Armoured Brigade.
- Airborne: U.S. 82nd and 101st Airborne Divisions; British 6th Airborne Division, including Canadian parachute participation.

German opening formations represented:

- Cotentin: 709th Infantry Division, 91st Air Landing Division, 6th Fallschirmjäger Regiment, the mixed 100th Panzer Training Battalion, and Cherbourg defenses.
- Central/eastern coast: 352nd and 716th Infantry Divisions.
- Caen: 21st Panzer Division.
- Deeper arriving reserves: reduced Panzer Lehr and 12th SS elements, labeled as assembling/arriving rather than fully available divisions.

## Sources

- U.S. Army University Press, *Normandy Staff Ride Instructor Notes*: German dispositions and formation roles around the Cotentin, Omaha/Gold, Juno/Sword, and Caen. https://www.armyupress.army.mil/Portals/7/educational-services/staff-rides/VSR/Normandy/Campaign-Background/Normandy_VSR_Instructor_Notes-Introduction.pdf
- National Army Museum, *D-Day*: beach order, national sectors, airborne purpose, and scale of the landings. https://www.nam.ac.uk/explore/d-day
- The United States Army, *D-Day – Operation Overlord*: the five named beaches covered a 50-mile stretch of the Normandy coast. https://www.army.mil/d-day/
- U.S. Army Center of Military History, *Omaha Beachhead*: D+1 Omaha lodgment and U.S. 1st/29th Division context. https://history.army.mil/portals/143/Images/Publications/catalog/100-11-1.pdf
- U.S. Army Center of Military History, Normandy campaign brochure: Gold/Juno/Sword formations, British airborne linkage, and the Caen counterattack context. https://history.army.mil/portals/143/Images/Publications/catalog/72-18.pdf
- Government of Canada, *D-Day: Canada's three services on Operation Overlord*: 3rd Canadian Infantry Division, 2nd Canadian Armoured Brigade, 1st Canadian Parachute Battalion, and Canadian landing scale. https://www.canada.ca/en/department-national-defence/maple-leaf/rcaf/2019/06/d-day-canada-s-three-services-on-operation-overlord.html
- National Army Museum, Gold Beach operations map: British 50th Division and 8th Armoured Brigade association. https://collection.nam.ac.uk/detail.php?acc=1984-06-153-5

## Acceptance rules

- Every authored tile and water key must resolve inside the declared grid.
- The background must remain at its native 1024×1024 aspect and the renderer must use the registered flat-top odd-q projection.
- The Utah-to-Sword frontage must remain eight 10 km hexes; any future scale change requires re-registering the whole image and every anchor.
- Task-force stations must be water; every ground force, beach, airborne zone, port, and inland objective must be land.
- No objective or front may depend on renderer overscan.
- The D+1 lodgment objective includes all five beaches and both airborne flanks.
- Fog-of-war markers may communicate only the Player-safe assessed domain, classification, strength band, confidence, age, and uncertainty.
