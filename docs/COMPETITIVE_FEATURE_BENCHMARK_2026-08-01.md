# Four-Star General competitive feature benchmark

**Audit date:** 2026-08-01

**Implementation update:** 2026-08-02 — campaign intelligence, counterintelligence, and operational fog core loop shipped

**Repository:** `C:\FourStarGeneral` at commit `7fff732`

**Scope:** Panzer Marshal, Panzer Corps 2, Order of Battle: World War II, Unity of Command II, Hex of Steel, and Four-Star General (FSG)

## Executive conclusion

Four-Star General already has a distinctive tactical core. Its modeled formations, mixed weapon groups, directional armor, deterministic attack math, interleaved initiative, tactical supply shipments, engineering actions, and multi-stage air missions are more detailed than the traditional Panzer General formula in several places.

The competitive shortfall is primarily the product wrapped around that tactical core:

1. The campaign can generate tactical battles, but it does not yet have a strategic opponent, a complete territory-and-force consequence loop, or a campaign victory arc.
2. Players cannot carry a persistent core army through a linked campaign, replace and upgrade it, or build attachment and history at unit level.
3. There is no player-facing tactical battle save/autosave flow, dynamic weather system, supported scenario editor/mod workflow, random skirmish generator, or multiplayer.
4. Content scale is far below established peers: 18 authored scenario JSON files and 29 formation definitions, versus hundreds of scenarios or roughly 1,000–4,000 equipment/unit records in the mature competitors. These are not perfectly equivalent data models, but the discoverable breadth difference is substantial.

The strongest direction is therefore **not** to imitate every competitor feature. FSG should finish the campaign/tactical loop and saving first, then add persistent formations and weather, while preserving its identity as a formation-level tactical command game with unusually explicit logistics, command tempo, air planning, and battlefield engineering.

## Method and limitations

This report uses:

- current official store pages and manuals for each competitor;
- current FSG source, data, tests, and design documents;
- a normalized union of feature families, so differently scaled games can be compared without treating every named unit or scenario as a separate feature.

“Complete feature set” here means the complete set of materially distinct, player-facing genre capabilities documented across the selected products. It does **not** mean every unit name, individual scenario, DLC, key binding, or balance value. A blank or unsupported marketing claim is not treated as proof that a competitor lacks a feature.

Status notation:

- **Yes** — shipped and player-facing.
- **Partial** — narrow implementation, internal engine support without a complete user flow, or only an abstract version.
- **No** — no current implementation found.
- **N/V** — not verified from the official sources reviewed; it should not be read as a definite absence.

## Competitor evaluations

### 1. Panzer Marshal

Panzer Marshal is the closest direct lineage comparator: a free, open-source Panzer General II-style game available on desktop and mobile-family platforms. Its official product page lists 17 campaigns, more than 200 historical scenarios plus a tutorial, more than 4,000 historically described units, 30 countries, 20 terrain types, persistent core forces, leaders, prestige, upgrades, weather and ground conditions, local multiplayer, and save/load at any time. Its manual documents core and auxiliary units, zones of control, fuel and ammunition, entrenchment, initiative, spotting, transport and embarkation, reinforcement and overstrength, artillery and anti-air support, overrun, ambush, engineers, bridging, paratroopers, and victory grades.

**Where it leads FSG:** content breadth, mature linked campaigns, persistent core units, leaders, upgrade/replacement economy, dynamic weather and ground state, battle saving, touch support, and local multiplayer.

**Where FSG is differentiated:** formation composition and weapon-outcome modeling, directional armor, interleaved initiative, tactical shipment/convoy management, supply priorities and production ledgers, scheduled strike/escort/CAP/transport packages, and a playable strategic logistics layer.

**Important correction to the previous repository report:** the current official listing says **200+ scenarios**, not 72. The reviewed official sources support local multiplayer, but did not substantiate the older report's claims of internet multiplayer, a built-in editor, or a technology tree.

Sources: [official product page](https://openpanzer.itch.io/panzermarshal), [official manual](https://nicupavel.github.io/openpanzer-manual/), [source repository](https://github.com/nicupavel/openpanzer).

### 2. Panzer Corps 2

Panzer Corps 2 is the most complete commercial packaging benchmark in this set. The official page documents a roughly 60-scenario branching campaign, more than 1,000 units, captured equipment, encirclement, weather, a random scenario generator, one-to-eight-player modes, hotseat, PBEM++, live online play, cooperative play, and a scenario/campaign/multiplayer editor. Its manual adds a persistent core army, core slots and reserves, purchase/upgrade/replacements/overstrength, split and merge, heroes and awards, commander traits, traced supply, support fire, bridges and engineers, mines, ambush, overrun, retreat, surrender, prototypes, Ironman and advanced rule toggles, autosaves, and cloud saving.

**Where it leads FSG:** complete campaign progression, content breadth, battle persistence, random scenarios, scenario/campaign editor, multiplayer, community longevity systems, weather, encirclement/retreat/surrender, and high production polish.

**Where FSG is differentiated:** a more granular mixed-formation and weapon-effect model, directional facing armor, explicit tactical supply convoys and prioritization, interleaved unit initiative, campaign production/transport ledgers, and deeper off-map air mission scheduling.

Sources: [official product page](https://www6.slitherine.com/game/panzer-corps-2%E2%80%8B), [official manual](https://ftp.matrixgames.com/pub/PanzerCorps2/Panzer%20Corps%202%20manual%20EBOOK.pdf), [Steam listing](https://store.steampowered.com/app/1072040/Panzer_Corps_2/).

### 3. Order of Battle: World War II

Order of Battle is the broad-theater and combined-domain benchmark. Its official page lists more than 1,000 units, carry-over campaigns, land/air/naval forces, attached commanders, specializations, a supply system built around cutting and protecting supply lines, beachheads and support ships, hotseat/PBEM++ and cooperative play, moddable data, and a WYSIWYG scenario editor.

**Where it leads FSG:** theater and content breadth, mature carry-over campaigns, tactical naval and amphibious operations, commanders and specializations, multiplayer, editor and supported modding.

**Where FSG is differentiated:** richer sub-unit formation composition, directional armor and target-profile calculations, interleaved initiative, tactical convoy/stockpile controls, a strategic logistics map, and more explicit air package planning.

Source: [official product page](https://www6.slitherine.com/game/order-of-battle-world-war-ii/pc).

### 4. Unity of Command II

Unity of Command II is less similar at the equipment level, but it is the most useful campaign, headquarters, and supply benchmark. Its official material documents a branching campaign, headquarters with command points and branch upgrades, conferences, prestige, cards and plans, force pools, specialists, supply sources and hubs, trucks that extend supply, hub overruns, stragglers/reorganization, fog of war, weather, bonus objectives, abstract theater assets, naval landings, an editor, and Workshop distribution.

**Where it leads FSG:** coherent campaign decision-making, strategic opponent and branching, HQ progression, supply-network readability, fog-of-war pressure, recovery/reorganization, scenario editing, and community content.

**Where FSG is differentiated:** direct tactical control at finer scale, equipment and weapon-outcome modeling, directional armor, interleaved initiative, tactical convoys, on-map engineering, and scheduled multi-role air operations.

Sources: [official site](https://unityofcommand.net/), [official manual](https://cdn.steamstatic.com/steam/apps/809230/manuals/Manual_-_Unity_of_Command_II_-_Revision_8.pdf), [Steam listing](https://store.steampowered.com/app/809230/Unity_of_Command_II/).

### 5. Hex of Steel

Hex of Steel is the most relevant indie breadth benchmark. Its current official and store material documents 45 nations, branching core-unit campaigns, dynamic weather and seasons, optional fog of war and zone-of-control/supply rules, more than 50 policies and doctrines, land/air/naval operations, cross-platform PC/mobile multiplayer, cooperative and split-screen modes, scenario/unit/map editors, random generation, diplomacy, Workshop support, and extensive moddability.

**Where it leads FSG:** breadth per indie-sized product, campaign and core-unit loop, weather/seasons, naval operations, random generation, multiplayer, mobile reach, editing, modding, and Workshop ecosystem.

**Where FSG is differentiated:** tactical formation/weapon resolution, facing armor, interleaved initiative, explicit convoy and supply-priority operations, and deeper air package scheduling.

Sources: [official site](https://www.hex-of-steel.fr/), [official manual](https://hex-of-steel.fr/pdfs/manual.pdf), [Steam listing](https://store.steampowered.com/app/1240630/Hex_of_Steel/), [Steam Workshop](https://steamcommunity.com/workshop/about/?appid=1240630).

## Major-feature comparison

| Feature family | Panzer Marshal | Panzer Corps 2 | Order of Battle | Unity of Command II | Hex of Steel | Four-Star General |
|---|---|---|---|---|---|---|
| Standalone historical scenarios | Yes | Yes | Yes | Yes | Yes | Yes — 18 authored scenario files |
| Linked/branching campaign | Yes | Yes | Yes | Yes | Yes | **Partial** — strategic layer and generated engagements, incomplete consequence/victory loop |
| Persistent core units | Yes | Yes | Yes | Partial — divisions/specialists/force pool | Yes | **No** — persistent generals only |
| Strategic campaign map | No/limited | No/limited | No/limited | Operational campaign layer | Varies by campaign | **Yes, partial game loop** |
| Tactical battle generation from campaign state | N/V | N/V | N/V | N/V | N/V | **Yes** — force and terrain context generated from strategic state |
| Dynamic weather/ground state | Yes | Yes | Yes | Yes | Yes | **No** — `muddy` exists only as authored terrain |
| Tactical visibility/fog of war | Yes | Yes | Yes | Yes | Optional | **Partial/internal** — LOS and contact scaffolding, not a complete first-class information system |
| Campaign operational fog | Campaign progression | Campaign progression | Campaign progression | Yes | Optional | **Yes** — faction-local contacts, uncertainty, decay, sanitized rendering, and knowledge-derived briefings |
| Intelligence/counterintelligence operations | Limited | Limited | Limited | HQ/intel assets | Broad reconnaissance | **Yes** — ground/air recon, verification, counter-recon, OPSEC, phantom concentrations, and battle reports |
| Zone of control | Yes | Yes | Yes | Yes | Optional | **Partial** — configured exit cost, not full stop/encirclement model |
| Encirclement/retreat/surrender | Limited/varies | Yes | Encirclement | Operational isolation/reorganization | Yes | **No complete mechanic** |
| Ammo and fuel | Yes | Supply abstraction/Yes | Supply abstraction | Supply abstraction | Optional supplies | **Yes** |
| Traced or networked supply | Yes | Yes | Yes | Yes, central design | Optional | **Yes** |
| Player-managed tactical convoys/shipments | No | No | No | Truck extension abstraction | N/V | **Yes** |
| Supply priority and depot/production ledger | No | No | No | HQ/logistics upgrades | N/V | **Yes** |
| Persistent unit experience | Yes | Yes | Yes | Yes | Yes | **No persistent core**; scenario-unit experience exists |
| Leaders/heroes/awards | Yes | Yes | Commanders | HQ/specialists | Yes | **Partial** — persistent commander roster, no unit leaders/awards |
| Purchase/replacement/upgrade loop | Yes | Yes | Yes | Force pool/reorganization | Yes | **Partial** — pre-battle requisition and production, no persistent unit upgrade loop |
| Headquarters command system | No | Commander traits | Commanders/specializations | **Yes, central design** | Commanders/policies | **Partial** — commander bonuses and tactical initiative, no HQ command-point tree |
| Directional armor/facing | N/V | Limited equipment stats | N/V | No | N/V | **Yes** |
| Mixed weapon groups and target profiles | Equipment-stat model | Equipment-stat model | Equipment-stat model | Step/combat-factor model | Equipment-stat model | **Yes, detailed** |
| Deterministic attack outcome | No | Optional randomness controls | N/V | No | N/V | **Yes for primary attack resolution**; repairs/AI tie-breaking can be random |
| Interleaved unit initiative | No — side turns/stat initiative | No — side turns/stat initiative | No — side turns | No — side turns | No — side turns | **Yes** |
| Direct/indirect/support fire | Yes | Yes | Yes | Yes | Yes | **Yes** |
| Suppression/entrenchment/fortification | Yes | Yes | Yes | Suppression analogs/fortification | Yes | **Yes** |
| Engineer fieldworks/smoke/tow/deploy | Partial | Yes | Yes | Engineering branch/assets | Yes | **Yes, but no complete bridge-building/minelaying loop** |
| Tactical naval units | Yes/limited | Yes | Yes | Abstract assets/landings | Yes | **No** — strategic ships and bombardment abstraction only |
| Air strike/escort/CAP/transport planning | Simpler on-map air | On-map air | On-map air | Abstract assets | On-map air | **Yes, unusually explicit** |
| Strategic AI | Campaign-scripted opponent | Yes | Yes | Yes | Yes | **No** |
| Tactical AI and difficulty levels | Yes | Yes | Yes | Yes | Yes | **Yes** — heuristic/advanced analysis, Easy/Normal/Hard |
| In-battle save/autosave | Yes | Yes | Yes | Yes | Yes | **Partial engine only; no player flow** |
| Multiple/cloud save flow | Cloud supported | Autosave/Steam Cloud | Yes | Yes | Yes | **No** — one campaign local slot plus import/export |
| Scenario/map/campaign editor | Unverified | Yes | Yes | Yes | Yes | **Partial developer/internal tooling only** |
| Random scenario generator | No | Yes | N/V | N/V | Yes | **No** |
| Supported mod/community sharing | Source/data modding | Editor/community | Moddable data/editor | Editor/Workshop | Full mods/Workshop | **No supported workflow** |
| Multiplayer | Local 1–2 | Hotseat/PBEM/live/co-op | Hotseat/PBEM/co-op | No official MP emphasis | Cross-platform PvP/co-op/split-screen | **No** |
| Desktop/mobile/touch | Desktop plus mobile-family builds/touch | Desktop | Desktop | Desktop | Desktop/mobile/touch | **Desktop web UI; mobile only planned** |
| Content scale | 17 campaigns; 200+ scenarios; 4,000+ unit records | ~60 campaign scenarios; 1,000+ units | 1,000+ units; many campaigns/DLC | Multiple campaigns/DLC | Broad campaigns; 45 nations | 18 authored scenarios; 29 formation definitions |

## Complete normalized genre feature set and FSG status

The following checklist is the union of materially distinct features found in the five reference games. The companion CSV is intended for backlog filtering and future re-audits.

### A. Product, content, and rules envelope

| ID | Feature | FSG | Evidence/assessment |
|---|---|---|---|
| A01 | Historical hex-based turn strategy | Yes | Core battle and campaign maps |
| A02 | Standalone/scenario play | Yes | 18 registered scenario JSON files |
| A03 | Tutorial scenario | Yes | First-class Training Grounds flow |
| A04 | Linked campaign | Partial | Strategic layer launches generated battles; outcome loop incomplete |
| A05 | Branching campaign path | No | No authored branch/consequence tree |
| A06 | Strategic campaign map | Yes | `CampaignState`/`CampaignScreen` |
| A07 | Random skirmish/scenario generator | No | Campaign battle templates are contextual generation, not a player skirmish generator |
| A08 | Multiple theaters and nations | Partial | WWII scenarios span several theaters, but the playable equipment/faction breadth is much narrower than peers |
| A09 | Large scenario library | No | 18 authored scenario files versus peer libraries in the dozens/hundreds |
| A10 | Large equipment/unit library | No | 29 formation definitions; 14 platform, 77 weapon and 131 ammunition data records |
| A11 | Configurable advanced rules | Partial | Difficulty and some battle options exist; no peer-scale rule toggle suite |
| A12 | Difficulty levels | Yes | Easy, Normal, Hard |
| A13 | Desktop support | Yes | Browser/Electron-style desktop web interface |
| A14 | Touch/mobile support | No | Planned, not currently certified |
| A15 | Localization | No | No localization pipeline found |

### B. Map, movement, visibility, and objectives

| ID | Feature | FSG | Evidence/assessment |
|---|---|---|---|
| B01 | Hex terrain movement costs | Yes | Terrain catalog and movement engine |
| B02 | Terrain combat/cover effects | Yes | Accuracy, damage, defense, and LOS modifiers |
| B03 | Roads | Yes | Authored terrain/map data |
| B04 | Rail movement | No | No playable rail transport mechanic found |
| B05 | Rivers, bridges, and fords | Yes | Authored map terrain and crossing rules |
| B06 | Engineer bridge construction/demolition | No | Design references only; no complete player mechanic |
| B07 | Dynamic weather | No | No active weather state/controller found |
| B08 | Ground conditions/seasons | Partial | `muddy` is a static authored terrain; not a changing ground-state system |
| B09 | Line of sight | Yes | `src/core/LOS.ts` and renderer/UI integration |
| B10 | Unit spotting/recon contacts | Yes | Recon contact snapshots and scouting logic |
| B11 | Conventional tactical fog of war | Partial | LOS/contact scaffolding exists, but it is not a complete first-class information system across every mode |
| B12 | Strategic fog of war/intelligence coverage | Yes | Faction-local operational pictures drive map contacts, uncertainty, staleness, coverage overlays, and pre-battle estimates |
| B13 | Counterintelligence/decoys | Yes | Counter-recon, OPSEC, and phantom operations alter the opponent's evidence and belief state symmetrically |
| B14 | Zone of control | Partial | Trait-enabled exit movement cost; no full ZoC-stop or isolation model |
| B15 | Deployment phase/zones | Yes | Scenario deployment and requisition flow |
| B16 | Objective capture/hold | Yes | Multiple objective definitions and scoring |
| B17 | Turn limits | Yes | Mission profiles and summary rules |
| B18 | Bonus/secondary objectives | Yes | Mission objective definitions |
| B19 | Survival/escort/defense objectives | Yes | Supported by authored scenario rules |
| B20 | Strategic overview/minimap | Partial | Zoom/pan/focus and campaign overview; no classic tactical minimap panel verified |
| B21 | Map labels and historical briefings | Yes | Scenario metadata, briefings, and objectives |

### C. Unit model and combat

| ID | Feature | FSG | Evidence/assessment |
|---|---|---|---|
| C01 | Ground units | Yes | Infantry, armor, artillery, recon, support formations |
| C02 | Air units/missions | Yes | Squadron and air mission model |
| C03 | Tactical naval units | No | Strategic battleship/transport only; tactical generation excludes ships |
| C04 | Strength/readiness losses | Yes | Formation readiness and detailed personnel/equipment outcomes |
| C05 | Sub-unit composition | Yes | Formations contain equipment/personnel and mixed weapon groups |
| C06 | Soft/hard/target-profile differentiation | Yes | Signature, armor, unit class and weapon effect distributions |
| C07 | Direct fire | Yes | Core attack resolution |
| C08 | Indirect fire | Yes | Artillery/ranged support |
| C09 | Anti-air and interception | Yes | Air defenses and interception logic |
| C10 | Attack preview/forecast | Yes | Breakdown and confirmation UI |
| C11 | Accuracy and range modeling | Yes | Range tables, signature, experience, commander and terrain factors |
| C12 | Armor penetration | Yes | Weapon-group AP and armor margin scalar |
| C13 | Directional facing armor | Yes | Front/side/rear selection by attack geometry |
| C14 | Deterministic main attack result | Yes | Expected-hit/outcome math; primary resolver does not roll random hit dice |
| C15 | Initiative as a combat stat | Yes | Formation initiative values |
| C16 | Interleaved unit initiative turn order | Yes | Initiative event/activation integration |
| C17 | Return/support fire | Yes | Support and defensive reactions |
| C18 | Artillery/anti-air support behavior | Yes | Support actions and AI safety logic |
| C19 | Suppression | Yes | Expected suppression and unit state effects |
| C20 | Morale/cohesion separate from suppression | Partial | Readiness/suppression cover part of the role; no peer-style morale/surrender loop |
| C21 | Entrenchment/dig-in | Yes | Dig-in state and bonuses |
| C22 | Fortifications/fieldworks | Yes | Tank traps, fieldworks, damage and repair |
| C23 | Mines/minelaying/clearing | Partial | Obstacles/fieldworks exist; no complete mine operations loop |
| C24 | Smoke | Yes | Player support/engineering action |
| C25 | Ambush/sentry/opportunity fire | Yes | Sentry and contact-driven behavior |
| C26 | Overrun | Partial | Damage/event concept exists; no full movement-chain overrun rule verified |
| C27 | Retreat | No | AI evaluates fallback, but resolved combat does not force a retreat |
| C28 | Surrender | No | No surrender resolution found |
| C29 | Encirclement/isolation combat penalties | No | Supply pressure exists, but no complete encirclement rule |
| C30 | Unit stacking | Yes | Occupancy/stacking rules |
| C31 | Split/merge formations | Partial | Player units can be combined; no symmetric split workflow found |
| C32 | Command stances | Yes | Stance effects and UI |
| C33 | Mount/dismount, tow/deploy | Partial | Artillery tow/deploy and transport-related states; not full peer-scale transport coverage |
| C34 | Airborne drop | Yes | Air transport/airborne mission template |
| C35 | Amphibious landing | Partial | Campaign/naval transport abstraction; no general tactical landing system |
| C36 | Field repair/recovery | Yes | Repair system and support actions |
| C37 | Quick/full combat animation modes | Yes | Animation pacing controls |
| C38 | Combat sound and effects | Yes | Layered procedural/audio presentation |

### D. Supply, economy, and force management

| ID | Feature | FSG | Evidence/assessment |
|---|---|---|---|
| D01 | Ammunition | Yes | Unit supply state and consumption |
| D02 | Fuel | Yes | Movement consumption and supply |
| D03 | Traced supply network | Yes | `src/core/Supply.ts` and route logic |
| D04 | Supply sources/depots | Yes | Tactical depots and strategic nodes |
| D05 | Supply route disruption/interdiction | Yes | Route/contact/enemy pressure logic |
| D06 | Out-of-supply combat/movement effects | Yes | Supply state affects actions/readiness |
| D07 | Manual resupply | Yes | Support/supply actions |
| D08 | Automated tactical convoys/shipments | Yes | Shipment and convoy automation |
| D09 | Unit supply priorities | Yes | Per-unit supply priority map/UI |
| D10 | Stockpile and production ledger | Yes | Depot, shipment and production accounting |
| D11 | Supply transport capacity | Yes | Campaign truck/air/naval modes and capacities |
| D12 | Replacement/reinforcement of persistent units | No | No persistent core unit lifecycle |
| D13 | Overstrength | No | No persistent reinforcement above nominal strength |
| D14 | Persistent equipment upgrades | No | No core-unit equipment progression |
| D15 | Prestige/currency | Partial | Requisition and campaign economies exist; not a unified persistent prestige loop |
| D16 | Pre-battle purchase/requisition | Yes | Battle requisition and deployment |
| D17 | Mid-battle requisition/support spending | Yes | Support/requisition actions |
| D18 | Strategic production allocation | Yes | Campaign economy allocation |
| D19 | Strategic redeployment | Yes | Truck, air, and naval transport modes |
| D20 | Reserves | Yes | Tactical/campaign reserve concepts |

### E. Campaign, progression, command, and history

| ID | Feature | FSG | Evidence/assessment |
|---|---|---|---|
| E01 | Persistent core army | No | Tactical units do not carry across a campaign |
| E02 | Auxiliary/scenario-only forces | Partial | Scenario rosters exist, but without a core/auxiliary progression distinction |
| E03 | Unit experience | Yes | Formation experience affects combat |
| E04 | Persistent unit experience | No | No core unit persistence between engagements |
| E05 | Named unit leaders/heroes | No | No unit-level persistent leader system |
| E06 | Unit awards/medals/battle honors | No | General service record exists, but not unit awards |
| E07 | Persistent commander/general | Yes | Saved roster, commissioning origin/school and service history |
| E08 | Commander traits/stat bonuses | Yes | Five regions, five schools, accuracy/damage/movement/supply bonuses |
| E09 | HQ command range/command points | No | No operational HQ CP/range layer comparable to Unity of Command II |
| E10 | HQ/commander upgrade tree | No | Commissioning choice is fixed; no campaign branch tree |
| E11 | Doctrines/specializations/policies | No | No player progression tree |
| E12 | Research/prototypes/captured equipment | No | No technology/equipment unlock loop |
| E13 | Campaign force allocation into battle | Yes | Adjacent strategic forces and allocation caps feed generated engagements |
| E14 | Campaign terrain/node context into battle | Yes | Battle type/template selected from attacked tile/context |
| E15 | Battle survivors/losses returned to campaign | No | Current outcome handling uses coarse economy/front effects |
| E16 | Territory ownership changed by battle result | Partial | Front polyline shifts; no complete tile ownership/front recomputation |
| E17 | Campaign economy affected by battle | Partial | Coarse resource deductions exist |
| E18 | Strategic AI opponent | No | Player queues/manages the campaign without an autonomous opposing command |
| E19 | Campaign victory/defeat arc | No | No complete campaign end-state progression found |
| E20 | Branching consequence/narrative | No | No authored branch system |
| E21 | Dynamic counterattacks | No | Listed as a future campaign phase |
| E22 | General/mission history | Yes | Roster service record and mission history |
| E23 | After-action report | Partial | Battle summaries/logs and service updates, but no deep persistent AAR/replay product |

### F. Air and naval operations

| ID | Feature | FSG | Evidence/assessment |
|---|---|---|---|
| F01 | Air strike | Yes | Strike mission template |
| F02 | Escort | Yes | Escort template and assignment |
| F03 | Combat air patrol/air cover | Yes | Air cover/CAP template |
| F04 | Air interception | Yes | Scheduling and interception resolution |
| F05 | Air transport/airborne drop | Yes | Transport mission template |
| F06 | Air recon | Partial | Tactical recon/intel exists; no separately verified air-recon mission template |
| F07 | Air supply | Partial | Air transport/logistics exist; no fully distinct air-supply mission flow verified |
| F08 | Squadron sortie/refit cycle | Yes | Assignment and refit timers |
| F09 | Airfield/range constraints | Yes | Campaign force/range filtering and tactical mission conditions |
| F10 | Naval gunfire support | Partial | Strategic battleship/support mapping, not on-map naval combat |
| F11 | Naval transport | Partial | Campaign transport capacity; limited tactical landing expression |
| F12 | Tactical ships | No | Ships excluded from generated tactical rosters |
| F13 | Carriers/submarines/destroyers | No | No tactical naval roster |
| F14 | Naval supply/beachheads | No | No full naval supply network/beachhead system |

### G. AI and game options

| ID | Feature | FSG | Evidence/assessment |
|---|---|---|---|
| G01 | Tactical opponent AI | Yes | Heuristic planner and advanced tactical analysis integration |
| G02 | Objective-aware behavior | Yes | Objective advance/capture scoring |
| G03 | Terrain/LOS-aware behavior | Yes | Candidate scoring and fire setup logic |
| G04 | Focus fire/flanking/combined arms | Yes | Advanced scoring features |
| G05 | Recon screening | Yes | Recon/contact logic in planner |
| G06 | Artillery safety/support placement | Yes | Fire setup and safety scoring |
| G07 | Supply-aware tactical behavior | Partial | Some supply/action awareness; no claim of full logistics planning parity |
| G08 | Multiple AI difficulty levels | Yes | Easy/Normal/Hard change accuracy, damage and tactics |
| G09 | AI without stat bonuses option | Yes | Normal difficulty has no stat modifier |
| G10 | Strategic campaign AI | No | No autonomous strategic opponent |
| G11 | Rule toggles/Ironman/custom difficulty | No | No comprehensive advanced-rules panel |

### H. Persistence, UX, accessibility, and tools

| ID | Feature | FSG | Evidence/assessment |
|---|---|---|---|
| H01 | Player-facing tactical save/load | Partial | Engine serializes/hydrates full battles; no complete battle save UI |
| H02 | Tactical autosave | No | No player-facing autosave flow found |
| H03 | Multiple named save slots | No | Campaign uses one local slot |
| H04 | Campaign save/load | Yes | Local save/load plus JSON import/export |
| H05 | Cloud/cross-device save | No | No cloud service integration |
| H06 | Undo movement/action | No | No general undo feature found |
| H07 | In-game tutorial/onboarding | Yes | Training mission and contextual/sidebar tutorials |
| H08 | Unit detail/equipment information | Yes | Unit panels and formation details |
| H09 | Combat breakdown/attack confirmation | Yes | Preview, confirmation and detailed breakdown UI |
| H10 | Activity/event log | Yes | Battle activity log and air reports |
| H11 | Zoom/pan/focus controls | Yes | Tactical camera controls |
| H12 | Keyboard shortcuts | Yes | Keyboard event/hotkey handling |
| H13 | Touch controls | No | Not certified as a current product feature |
| H14 | Accessibility semantics/high contrast | Partial | ARIA semantics and scalable browser UI; no full audited accessibility mode |
| H15 | Animation speed/skip controls | Yes | Quick/regular battle animation flows |
| H16 | Replay | No | No turn or battle replay system |
| H17 | Achievements | No | No platform achievement system found |
| H18 | Scenario/map editor | No | No supported player-facing tactical editor |
| H19 | Campaign editor | Partial | Internal campaign editor/JSON controls, not a supported creator product |
| H20 | Unit/equipment editor | No | Data files are developer-editable only |
| H21 | Random map/scenario tool | No | Generated campaign battles do not expose a standalone creator flow |
| H22 | Supported mods | No | Data-driven architecture exists, but no compatibility/distribution workflow |
| H23 | Workshop/community sharing | No | No integration |
| H24 | Open-source code | N/V | Repository visibility/license is outside this feature audit |

### I. Multiplayer and social features

| ID | Feature | FSG | Evidence/assessment |
|---|---|---|---|
| I01 | Local hotseat | No | Not implemented |
| I02 | PBEM/asynchronous online | No | Not implemented |
| I03 | Live online multiplayer | No | Not implemented |
| I04 | Cooperative play | No | Not implemented |
| I05 | Cross-platform multiplayer | No | Not implemented |
| I06 | Split-screen/shared-screen | No | Not implemented |
| I07 | Multiplayer lobby/chat | No | Not implemented |

## FSG source evidence map

| Capability | Primary repository evidence |
|---|---|
| Mission catalog | `src/data/missions.ts`, `src/data/scenarioRegistry.ts`, `src/data/scenario*.json` |
| Formation/equipment model | `src/data/unitSystem/formations.ts`, `src/data/canon/*.table.json` |
| Terrain | `src/data/terrain.json` |
| Combat, armor, target profiles | `src/core/Combat.ts` |
| LOS | `src/core/LOS.ts` |
| Supply tracing | `src/core/Supply.ts` |
| Battle engine, convoy, prototype intel scaffolding, air, support, serialization | `src/game/GameEngine.ts` |
| Tactical AI | `src/game/bot/BotPlanner.ts`, `src/game/bot/TacticalAnalysisEngine.ts`, `src/game/bot/InitiativeBotIntegration.ts` |
| Initiative | `src/events/InitiativeEventSystem.ts`, `src/game/GameEngineInitiativeIntegration.ts` |
| Air mission catalog | `src/data/airMissions.ts` |
| Tactical UI | `src/game/BattleScreen.ts`, `index.html` |
| Campaign state/UI | `src/game/campaign/CampaignState.ts`, `src/game/campaign/CampaignScreen.ts` |
| Campaign-to-battle generation | `src/game/campaign/CampaignBattleGenerator.ts`, `EngagementContextBuilder.ts`, `campaignForceMapping.ts`, `battleTemplates.ts` |
| General persistence | `src/utils/rosterStorage.ts`, `src/data/commissioningOptions.ts` |
| Current campaign design boundary | `docs/CAMPAIGN_BATTLE_GENERATION_DESIGN.md` |

## Prioritized competitive roadmap

### Tier 0 — complete and retain the current product promise

1. **Player-facing tactical save, load, and autosave.** The engine already serializes battle state, making this a high-value closure of an existing technical capability.
2. **Finish the campaign consequence loop.** Return surviving forces and losses, update actual territory/front state, consume supplies consistently, and make generated battle outcomes materially alter the strategic map.
3. **Add strategic campaign AI and campaign victory/defeat.** Without these, the campaign is a logistics sandbox rather than a complete strategy opponent.
4. **Add persistent core formations.** Carry formation identity, experience, casualties, replacements, equipment changes, and battle honors between campaign engagements. This is the biggest emotional-retention feature shared by the closest peers.
5. **Add dynamic weather and ground state.** It should affect visibility, movement, air availability, supply and combat; a visual-only weather layer would not close the genre gap.
6. **Expand and harden content.** Use the existing mission architecture to increase curated scenarios and validate each one against the current tutorial-quality bar.
7. **Completed 2026-08-02 — campaign intelligence, counterintelligence, and operational fog.** The shipped core replaces direct truth rendering and prototype deception targeting with faction knowledge, observation reports, uncertainty, decay, counterplay, knowledge-derived briefings, and belief-constrained AI. Continue source/content breadth and balance tuning against `docs/CAMPAIGN_INTELLIGENCE_COUNTERINTELLIGENCE_FOG_PLAN.md`.

### Tier 1 — creation, longevity, and missing operational rules

1. Ship a supported scenario/map editor backed by the existing JSON architecture, with validation and safe import/export.
2. Add a random or configurable standalone skirmish generator using the campaign battle templates.
3. Complete bridge-building/demolition, minelaying/clearing, transport and amphibious rule families.
4. Add named campaign/battle saves, richer after-action reports, and eventually replay.
5. Add persistent unit leaders, awards, attachment options and an upgrade/replacement economy after core-unit persistence is stable.
6. Add retreat, surrender and isolation/encirclement mechanics if they can be expressed clearly at FSG's 250-meter/5-minute tactical scale.

### Tier 2 — defer until the single-player core is complete

1. Tactical naval warfare and carrier/submarine systems.
2. Multiplayer, PBEM and cooperative networking.
3. Mobile/touch certification.
4. Workshop/cloud ecosystem and broad localization.
5. Thousands of equipment variants. FSG should first deepen meaningful formation choices; raw database size is not a useful goal by itself.

## Positioning recommendation

The defensible promise is:

> **A formation-level WWII command game where initiative, weapon effects, supply movement, intelligence, engineering, and air planning are decisions—not background abstractions.**

Avoid undemonstrated claims such as “the most advanced AI” or comparing FSG's formation definitions directly with a competitor's individual equipment-record count. Market the visible, verifiable difference: a more explicit command problem. Once the Tier 0 loop is complete, the strategic campaign can make that tactical depth persistent and consequential.

## Audit notes for future updates

- Re-run source counts rather than copying marketing documents; the project changed substantially in July 2026.
- Treat `docs/CAMPAIGN_CLASS_A_PLUS_GAP_REVIEW.md` as partially stale: campaign battle generation is now present, although its consequence and AI findings remain relevant.
- Treat the root `COMPETITOR_ANALYSIS_PANZER_MARSHAL.md` as superseded by this report.
- Recheck competitor pages before public use; live-service listings, version numbers, DLC and platform support can change.
