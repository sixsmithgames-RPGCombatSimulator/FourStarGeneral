# Normandy D+1 order-of-battle presentation manifest

This manifest traces the player-facing formation identities used by `CampaignFormationPresentation.ts`. It does not replace persistent formation IDs or the campaign's 10 km-per-hex strength abstraction. Exact subordinate identities are used only when an authored count maps defensibly to a dated formation. Logistics capacity and assessed strength steps stay grouped under real commands; the UI must not invent numbered units to make them look exact.

## Presentation and intelligence rules

- Allied formations may use exact names supported by the opening order of battle.
- German names are scenario truth, not automatically Player-visible truth. Unknown contacts expose class and confidence; assessed contacts expose a broad type or strength band; exact formation identity requires identified intelligence.
- A name is presentation, not identity. Save keys, formation IDs, after-action integrity hashes, and historical report facts must not depend on a later spelling or hierarchy correction.
- A repeated campaign strength step remains grouped under its real regiment, division, or service command. It does not receive a fabricated battalion or column number.
- The campaign opens at 00:00 on 7 June 1944. A formation being in the theater does not automatically make it ready for operational orders.

## U.S. formations represented exactly

| Authored campaign group | Player-facing hierarchy |
| --- | --- |
| U.S. 4th Infantry Division battalions | 1st, 2d, and 3d Battalions of the 8th, 12th, and 22d Infantry Regiments |
| VII Corps engineer groups | 1st Engineer Special Brigade and 4th Engineer Combat Battalion |
| V Corps engineer groups | 5th and 6th Engineer Special Brigades |

The seven U.S. 1st Infantry Division and five U.S. 29th Infantry Division records are campaign strength steps. They are grouped under the 16th, 18th, and advance element of the 26th Infantry Regiments, and the 116th and 115th Infantry Regiments respectively. Their repeated records must not be presented as invented battalions.

The 82d and 101st Airborne Division records remain grouped as airborne strength groups. Their real orders of battle included parachute infantry, glider infantry, and glider field artillery, while the current scenario gives every record the same tactical `Paratrooper` behavior. Exact subordinate names would falsely turn artillery and glider elements into parachute infantry in battle; exact identities require split authored unit types first.

The 2d Infantry Division, 90th Infantry Division, and 2d Ranger Battalion records also remain grouped. Their real subordinate identities are known, but the authored records currently share arrival or location truth that is too coarse for exact display: only the 2d Division's 9th Infantry arrived on the evening of 7 June, its 23d and 38th followed on 8 June; the 90th Division's arrival and readiness were staggered; and the 2d Ranger Battalion relief column did not reach Pointe du Hoc until D+2. Exact subordinate names must not be attached until those distinct postures are represented in rules state.

## British and Canadian formations represented exactly

| Authored campaign group | Player-facing hierarchy |
| --- | --- |
| British 50th Infantry Division battalions | 69th Brigade: 5th East Yorkshire, 6th and 7th Green Howards; 151st Brigade: 6th, 8th, and 9th Durham Light Infantry; 231st Brigade: 1st Hampshire, 1st Dorsetshire, and 2nd Devonshire |
| British 8th Armoured Brigade regiments | 4th/7th Royal Dragoon Guards, Nottinghamshire Yeomanry (Sherwood Rangers), and 24th Lancers |
| British 22nd Armoured Brigade advance groups | 1st and 5th Royal Tank Regiments and 4th County of London Yeomanry under 22nd Armoured Brigade, 7th Armoured Division |
| 3rd Canadian Infantry Division battalions | 7th Brigade: Royal Winnipeg Rifles, Regina Rifle Regiment, Canadian Scottish Regiment; 8th Brigade: Queen's Own Rifles of Canada, Le Régiment de la Chaudière, North Shore Regiment; 9th Brigade: Highland Light Infantry of Canada, Stormont, Dundas and Glengarry Highlanders, North Nova Scotia Highlanders |
| 2nd Canadian Armoured Brigade regiments | 6th Armoured Regiment (1st Hussars), 10th Armoured Regiment (The Fort Garry Horse), and 27th Armoured Regiment (The Sherbrooke Fusiliers Regiment) |
| British 3rd Infantry Division battalions | 8th Brigade: 1st Suffolk, 2nd East Yorkshire, 1st South Lancashire; 9th Brigade: 2nd Lincolnshire, 1st King's Own Scottish Borderers, 2nd Royal Ulster Rifles; 185th Brigade: 2nd Royal Warwickshire, 1st Royal Norfolk, 2nd King's Shropshire Light Infantry |
| British 27th Armoured Brigade regiments | 13th/18th Royal Hussars, Staffordshire Yeomanry, and East Riding Yeomanry |
| British 6th Airborne Division groups | 3rd Parachute Brigade: 8th and 9th Parachute Battalions and 1st Canadian Parachute Battalion; 5th Parachute Brigade: 7th, 12th, and 13th Parachute Battalions |

The three 51st (Highland) Division records represent an advance echelon abstraction. They must stay grouped rather than being relabeled as three full brigades at battalion-scale strength.

## Allied air hierarchy

- No. 126 (RCAF) Wing: Nos. 401, 411, and 412 Squadrons RCAF, Spitfire IX.
- No. 127 (RCAF) Wing: Nos. 403, 416, and 421 Squadrons RCAF, Spitfire IX.
- No. 121 Wing RAF: Nos. 174, 175, and 245 Squadrons RAF, Typhoon IB.
- No. 122 Wing RAF: Nos. 19, 65, and 122 Squadrons RAF, Mustang III.
- No. 137 Wing RAF: Nos. 88 and 342 Squadrons RAF, Boston; No. 226 Squadron RAF, Mitchell.
- No. 139 Wing RAF: Nos. 98, 180, and 320 Squadrons RAF, Mitchell.
- No. 138 Wing RAF: Nos. 107 and 305 Squadrons RAF, Mosquito.

These air groups are regional command abstractions on the operational map. Their site marker does not claim every squadron physically occupied the named consolidation airfield.

## Grouped logistics and reinforcement abstractions

- Western embarkation supply columns: U.S. First Army Transportation.
- Omaha embarkation supply columns: U.S. First Army Service Troops.
- Solent supply columns: Second Army Cross-Channel Supply Columns.
- Eastern embarkation supply columns: Second Army Embarkation Columns.
- Gold–Juno follow-on groups: Gold–Juno Reinforcement Group.
- Sword follow-on groups: I Corps Reinforcement Group.

## Sources

- U.S. Army, [D-Day order of battle](https://www.army.mil/d-day/history.html).
- U.S. Army Center of Military History, [Cross-Channel Attack](https://history.army.mil/portals/143/Images/Publications/catalog/7-4.pdf).
- U.S. Army Center of Military History, [Utah Beach to Cherbourg](https://history.army.mil/Portals/143/Images/Publications/Publication%20By%20Title%20Images/U%20Pdf/CMH_Pub_100-12.pdf).
- U.S. Army Center of Military History, [Omaha Beachhead](https://history.army.mil/portals/143/Images/Publications/catalog/100-11-1.pdf).
- U.S. Army Center of Military History, [Corps of Engineers: The War Against Germany](https://history.army.mil/Portals/143/Images/Publications/Publication%20By%20Title%20Images/C%20Pdf/corps-war-against-germany.pdf).
- U.S. Army Medical Department, [2d Ranger Battalion history](https://achh.army.mil/history/book-wwii-huertgenforest-2drangerbnmeddet1944/).
- UK Ministry of Defence, [D-Day and the Battle of Normandy](https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/30054/ww2_dday.pdf).
- UK Ministry of Defence, [The Final Battle for Normandy](https://assets.publishing.service.gov.uk/media/5a78d91440f0b6324769aa22/ww2_normandy.pdf).
- Official British history, [Victory in the West, Volume I](https://www.ibiblio.org/hyperwar/UN/UK/UK-NWE-Victory-I/index.html).
- Official RAF history, [Allied Expeditionary Air Force D-Day order of battle](https://www.ibiblio.org/hyperwar/UN/UK/UK-RAF-III/UK-RAF-III-XI.html).
- Government of Canada, [Canada's three services on Operation Overlord](https://www.canada.ca/en/department-national-defence/maple-leaf/rcaf/2019/06/d-day-canada-s-three-services-on-operation-overlord.html).
- Government of Canada, [Who was in the air on D-Day?](https://www.canada.ca/en/department-national-defence/maple-leaf/rcaf/2019/05/who-was-in-the-air-on-d-day.html).
- Canadian Army, [9th Canadian Infantry Brigade historical vignette](https://www.canada.ca/en/army/services/line-sight/articles/2022/11/enabling-operations-historical-vignette-9th-canadian-infantry-brigade-versus-25th-sspanzergrenadier-regiment.html).
- Canadian CMHQ, [Report No. 139](https://www.canada.ca/content/dam/themes/defence/caf/militaryhistory/dhh/reports/cmhq-reports/cmhq139.pdf).
- Airborne Assault Museum, [6th Airborne Division order of battle](https://paradata.org.uk/content/4663957).

## Regression contract

- Every exact authored group maps each ordinal once, within the authored count.
- Exact subordinate names are unique within their authored group.
- Abstract strength steps set `hasAuthoredSubordinateIdentity` to false and collapse under their real command in inspectors.
- Player-facing names contain no generated ordinal suffix, destination, beach assignment, or authoring language such as “historical network.”
- Existing saves and stored AARs gain corrected display names through their retained origin metadata; stored names and integrity hashes are not rewritten.
