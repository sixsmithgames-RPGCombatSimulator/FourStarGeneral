# Four Star General — Master TODO

**Last updated:** 2026-08-03
**Build status:** `npm test`, air-show report, 20x20 choreography, tutorial continuity, and desktop/mobile painted-frame gates passing
**Active missions:** 5 registered, 4 fully validated, 1 orphaned (Two Bridges)

---

## Archive Notice

The following TODO files have been moved to `docs/archived-todos/` because all tasks inside them are confirmed complete in the live codebase:

- `TODO_deployment_panel_wiring.md` — ✅ complete 2025-10-25
- `TODO_deployment_markup_refresh.md` — ✅ complete 2025-10-25
- `TODO_deployment_state_engine_bridge.md` — ✅ complete 2025-10-25
- `TODO_battle_screen_sync.md` — ✅ complete 2025-10-25
- `TODO_hex_selection_feedback.md` — ✅ complete 2025-10-25
- `TODO_reserve_loadout_sync.md` — ✅ complete 2025-10-25
- `TODO_ground_combat_impactHits_test_fix.md` — ✅ fixed 2026-04-12
- `TODO_precombat_data_module.md` — ✅ complete 2025-10-24
- `TODO_precombat_ui_rendering.md` — ✅ complete 2025-10-24 (most tasks)
- `TODO_precombat_ui_styling.md` — ✅ major tasks complete 2025-10-24
- `TODO_enemy_unit_separation.md` — ✅ separation enforced; follow-ups folded below

---

## ACTIVE TODO FILES (retained, with status)

| File | Status | Priority |
|------|--------|----------|
| `TODO_air_support_system.md` | Mostly complete; AI heuristics + docs remain | Medium |
| `docs/AIR_SHOW_NORTH_STAR_SPEC.md` | Implemented and certified; retained as canonical reference | Complete |
| `TODO_backend_service.md` | Open — not started, deferred | Low |
| `TODO_battle_combat.md` | Open — attack confirmation dialog missing | Medium |
| `TODO_battle_race_monitoring.md` | Monitoring — watchlist items, not blocking | Low |
| `TODO_enemy_ai_upgrade.md` | Open — heuristic planner not started | Medium |
| `TODO_enemy_turn_animation.md` | Open — enemy playback pipeline not built | Medium |
| `TODO_player_turn_animation.md` | Open — player animation pipeline not built | Medium |
| `TODO_precombat_battle_handoff.md` | Partially complete — 2 of 5 tasks done | Medium |
| `TODO_precombat_budget_validation.md` | Open — budget gating not wired | Medium |
| `TODO_precombat_deployment_bridge.md` | Open — allocation → deployment bridge missing | Medium |
| `TODO_precombat_interaction.md` | Open — allocation controls not wired | Medium |
| `TODO_recon_intel_live_feeds.md` | Open — recon panel on placeholder data | Low |
| `TODO_reserve_loadout_sync.md` | ✅ archived (complete) | — |

---

## SYSTEM STATUS (ground truth from code)

### ✅ Working Systems
- Full playable flow: Landing → Commander select → Precombat → Deployment → Battle → Campaign
- Sidebar popup system: 8 panels with content (Air Support, Recon, Intelligence, Logistics, Supplies, Support, Army Roster, General Profile)
- `getSupportSnapshot()` — implemented and wired
- `getLogisticsSnapshot()` — implemented (full pathfinding supply model)
- `getReconIntelSnapshot()` — implemented
- `DeploymentState.mirrorEngineState()` — implemented; deployment panel live
- `assertBattleReady()` — integrity check on battle entry
- Smoke system (`laySmoke`) — confirmed working
- Air support system — scheduling, CAP, escort, interception, HUD, sortie log all working
- Air show timeline — deterministic HQ-side origins, preset choreography, one-clock playback, independent flak, tutorial continuity, and 20x20 desktop/mobile certification working
- Mission phase system — probe / commitment / reserve pressure phases in River Crossing Watch
- Scenario validation gates — `assertScenarioSourceValid` throws loudly at load time
- `npm test` — passing

### ⚠️ Known Gaps
- Two Bridges scenario file exists but is NOT registered in `scenarioRegistry.ts` and has NO deployment zones (unplayable)
- Attack confirmation dialog (`TODO_battle_combat.md`) — player attacks resolve without confirmation prompt
- Enemy turn animation pipeline not built — bot turns produce text announcements only
- Player turn animation pipeline not built — player moves snap without animation
- Precombat budget validation not wired — player can proceed with zero allocations or over budget
- Backend service (general profiles, roster persistence) — still localStorage only

---

## PRIORITY ORDER

### P1 — Ship-blocker or flagship quality

1. **Attack confirmation dialog** (`TODO_battle_combat.md`)
   - Confirm before resolving; cancel leaves state untouched
   - Keyboard shortcuts (Enter / Escape)
   - Accessible ARIA dialog

2. **Precombat budget validation** (`TODO_precombat_budget_validation.md`)
   - Block proceed when zero allocations or over budget
   - Show inline feedback in `#allocationFeedback`

### P2 — Near-term structural

4. **Precombat interaction wiring** (`TODO_precombat_interaction.md`)
   - Wire `+` / `-` allocation controls to `allocationCounts` state
   - Keyboard accessibility (ArrowUp / ArrowDown)
   - Reset button

5. **Precombat → battle handoff hardening** (`TODO_precombat_battle_handoff.md`)
   - Replace rAF-based waits with engine-side readiness checks
   - Synchronous seeding; expand diagnostics

6. **Two Bridges — register or delete**
   - Add deployment zones and register in `scenarioRegistry.ts`, or remove the file

### P3 — Feature depth

7. **Enemy turn animation pipeline** (`TODO_enemy_turn_animation.md`)
   - Focus camera, animate unit moves, play attack effects, skip control

8. **Player turn animation pipeline** (`TODO_player_turn_animation.md`)
   - Smooth movement; attack animation before board re-render

9. **Enemy AI heuristic upgrade** (`TODO_enemy_ai_upgrade.md`)
   - BotPlanner: context builder, candidate actions, scoring, cost-aware pathfinding

10. **Unlock purchasing system**
    - Non-pay-to-win philosophy; sidegrades only
    - Two colleges, two regions baseline accessible
    - Rocket artillery as example low-price unit

### P4 — Content production (highest strategic impact)

11. **New scenarios** — see Scenarios section below

### P5 — Deferred

12. **Recon intel live feeds** (`TODO_recon_intel_live_feeds.md`) — panel on placeholder data; low blocking risk
13. **Backend service** (`TODO_backend_service.md`) — generals stored in localStorage; not blocking gameplay
14. **Race condition monitoring** (`TODO_battle_race_monitoring.md`) — watchlist only; no active bugs

---

## SCENARIOS

### How to add a new scenario

Follow `docs/mission-development-process.md` (9-phase pipeline):
1. Write complete Mission Package (design before code)
2. Register or reuse `missionKey` in `src/state/UIState.ts`
3. Add mission metadata to `src/data/missions.ts`
4. Author `src/data/scenario_<slug>.json`
5. Register in `src/data/scenarioRegistry.ts`
6. Add validation profile in `src/data/scenarioValidation.ts`
7. Add mission rules in `src/state/missionRules.ts` if needed
8. Update `src/ui/screens/LandingScreen.ts` if ordering/gating changes
9. Verify full path: Landing → Precombat → Battle

See also `docs/MISSION_DESIGN_GUIDE.md` for hard rules (no fallbacks, deployment zones required, scenario name must match validation profile exactly).

---

### CURRENT SCENARIOS — FINAL DRAFT

---

#### S-01 · Coastal Push
**Status:** Final Draft  
**Mission key:** `training`, `assault`, `campaign` (shared default)  
**File:** `src/data/scenario01.json`  
**Registered:** ✅ Yes  
**Validation profile:** ✅ Yes

| Field | Value |
|-------|-------|
| **Map size** | 20 × 16 |
| **Terrain** | Coastal: sea tiles on western edge, beach with trenches, plains, forest, hills, roads with bridges, city center and perimeter, mountains on eastern edge |
| **Turn limit** | 20 |
| **Player budget** | Not specified (uses allocation flow) |

**Objectives (3):**
- Hex [5,7] — Bot-held, 100 VP (mid-map hill position)
- Hex [15,8] — Bot-held, 150 VP (inland highway/city approach)
- Hex [2,12] — Player-held, 50 VP (beachhead anchor)

**Player deployment zones (2):**
- Zone Alpha — 12-hex capacity, beachhead corridor (hexes [5–9, rows 5–8])
- Zone Bravo — 16-hex capacity, secondary inland push (hexes [11–16, rows 7–11])

**Player unit restrictions:** None (open allocation)

**Enemy forces (Bot HQ: [18,3]):**
- AT_Gun_50mm (×1), Howitzer_105 (×1), Infantry_42 (×2), Engineer (×1), Panzer_IV (×1), Heavy_Tank (×1), Recon_Bike (×1), Fighter (×1), Bomber (×1)
- Resources: 600
- Strategy: Anchor armor on hills, artillery screens advances, recon probes unknown tiles

**Ally forces:** Recon_Bike (×1) predeployed at [8,6]

---

#### S-02 · Town Defense
**Status:** Final Draft  
**Mission key:** `patrol`  
**File:** `src/data/scenario_town_defense.json`  
**Registered:** ✅ Yes  
**Validation profile:** ✅ Yes

| Field | Value |
|-------|-------|
| **Map size** | 20 × 16 |
| **Terrain** | Same palette as Coastal Push; northern city at [15,2] is the defended objective; road spine runs SW to NE through plains and hills |
| **Turn limit** | 25 |
| **Player budget** | 5,000 requisition points |

**Objectives (1):**
- Hex [15,2] — Player-held, 250 VP (northern town center)

**Player deployment zones (1):**
- Town Perimeter — 20-hex capacity, defense ring around the town and road junction (hexes [11–16, rows 0–3])

**Player unit restrictions:** None (open allocation)

**Enemy forces (Bot HQ: [2,13]) — heavy combined arms assault:**
- Infantry: Infantry_42 (×6), AT_Infantry (×5), Engineer (×3)
- Armor: Panzer_IV (×4), Heavy_Tank (×3), Tank_Destroyer (×3), Assault_Gun (×2)
- AT: AT_Gun_50mm (×1)
- Artillery: Flak_88 (×2), Howitzer_105 (×4), SP_Artillery (×7)
- Recon: Recon_Bike (×2)
- Air: Fighter (×2), Bomber (×4)
- Resources: 900
- Strategy: Advance up road spine with layered armor; artillery and flak in rear; recon screens expose town approaches before main thrust

**Ally forces (HQ: [14,4]):** Infantry_42 (×1), Engineer (×1), AT_Gun_50mm (×1), Recon_Bike (×1) — pre-positioned on town flanks

---

#### S-03 · River Crossing Watch
**Status:** Final Draft  
**Mission key:** `patrol_river_watch`  
**File:** `src/data/scenario_river_watch.json`  
**Registered:** ✅ Yes  
**Validation profile:** ✅ Yes

| Field | Value |
|-------|-------|
| **Map size** | 14 × 12 |
| **Terrain** | River with deep channel and three shallow ford crossings; plains and forest on west bank; open ground on east bank |
| **Turn limit** | 12 (Normal); Easy=14, Hard=11 |
| **Player budget** | 240 requisition points |

**Objectives (3) — all ford hexes:**
- Hex [7,2] — Bot-held, 50 VP (north ford)
- Hex [6,6] — Bot-held, 50 VP (center ford)
- Hex [6,9] — Bot-held, 50 VP (south ford)

**Victory / Defeat:**
- Victory: Hold ALL THREE fords simultaneously for 8 consecutive turns
- Defeat: Enemy secures and holds any ford for 8 consecutive turns

**Mission phases:**
- Phase 1 (turns 1–3): Probe — enemy tests crossings
- Phase 2 (turn 4+): Commitment — enemy escalates pressure
- Phase 3 (Normal/Hard): Reserve pressure — triggers when all fords blocked for 2 consecutive turns

**Player deployment zone (1):**
- Allied Start — 16-hex capacity, west-bank line of departure spanning hamlet, hedgerow lanes, and central rise (hexes [0–3, rows 1–4])

**Player unit restrictions (strict):** infantry, engineer, reconBike, recon, supplyConvoy only — no armor, no artillery, no air

**Player predeployed units (6):**
- Infantry_42 (×3) at [1,2], [2,2], [2,3]
- Engineer (×1) at [1,3]
- Recon_Bike (×2) at [2,4], [3,2]

**Enemy forces (Bot HQ: [12,5]):**
- Infantry_42 (×3), Engineer (×2), AT_Gun_50mm (×1), AT_Infantry (×1), Recon_Bike (×1)
- Resources: 450; experience level 1 across all units
- Strategy: Probe multiple crossings, then commit reserves where resistance is weakest
- Three entry zones: north [11–13, rows 0–2], center [11–13, rows 4–6], south [11–13, rows 8–10]

---

#### S-04 · Citadel Ridge
**Status:** Final Draft  
**Mission key:** `assault_citadel_ridge`  
**File:** `src/data/scenario_citadel_ridge.json`  
**Registered:** ✅ Yes  
**Validation profile:** ✅ Yes

| Field | Value |
|-------|-------|
| **Map size** | 24 × 18 |
| **Terrain** | Rolling plains on west; hills and foothills in center; fortified ridge on east (cols 18–23); road corridor through center row |
| **Turn limit** | 17 |
| **Player budget** | 2,600 requisition points |

**Objectives (4):**
- Hex [16,4] — Bot-held, 120 VP (north battery strongpoint)
- Hex [16,8] — Bot-held, 180 VP (central road strongpoint)
- Hex [16,12] — Bot-held, 120 VP (south battery strongpoint)
- Hex [20,8] — Bot-held, 220 VP (command ridge — primary objective)

**Victory / Defeat:**
- Victory: Capture command ridge [20,8] and at least 2 additional strongpoints before turn limit
- Defeat: Turn limit expires before command ridge is secured, or all friendly combat units destroyed

**Player deployment zones (2):**
- West Assembly North — 20-hex capacity (hexes [0–4, rows 5–8])
- West Assembly South — 20-hex capacity (hexes [0–4, rows 9–12])

**Player unit restrictions:** Open — all unit categories allowed including armor, air, artillery, logistics

**Player allowed units (full list):** infantry, airborneDetachment, engineer, tank, heavyTankCompany, tankDestroyerCompany, assaultGunBattalion, howitzer, rocketArtilleryBattalion, spArtilleryGroup, antiTankBattery, flakBattery, recon, reconBike, fighter, interceptorWing, groundAttackWing, bomber, apcHalftrackCompany, supplyConvoy, ammo, fuel, medic, maintenance

**Enemy forces (Bot HQ: [22,8]) — entrenched ridge defense:**
- Assault_Gun (×2) — flanking the road at [16,4] and [16,12] (experience 2)
- Flak_88 (×2) — anti-air belt at [20,6] and [20,10] (experience 2)
- Howitzer_105 (×2) — rear artillery at [22,5] and [22,11]
- Light_Tank (×3) — mobile counterattack reserve at [18,7], [18,9], [19,8]
- Tank_Destroyer (×1) — central citadel [18,8] (experience 2)
- AT_Gun_50mm (×3) — approach denial at [15,6], [16,8], [15,10]
- AT_Infantry (×2) — entrenched at [17,6] and [17,10] (entrench 2)
- Infantry_42 (×6) — all entrenched at depth 2 across all three strongpoints
- Engineer (×2) — fortification support at [17,5] and [17,11] (entrench 2)
- Interceptor (×2) — air defense at [23,6] and [23,10] (experience 2)
- Resources: 900
- Strategy: Anchor outer batteries, range road with artillery, counterattack breaches with mobile AT reserves

---

#### S-05 · Two Bridges ⚠️ UNREGISTERED
**Status:** Draft — Unplayable until registered  
**Mission key:** None assigned  
**File:** `src/data/scenario_two_bridges.json`  
**Registered:** ❌ No — NOT in `scenarioRegistry.ts`  
**Validation profile:** ❌ No  
**Deployment zones:** ❌ None defined — precombat cannot initialize

| Field | Value |
|-------|-------|
| **Map size** | 20 × 16 |
| **Terrain** | Plains, hills, forest, sea on edges, mountains on east; two bridge/road crossings; city bastion |
| **Turn limit** | 20 |
| **Player budget** | Not specified |

**Objectives (4):**
- Hex [8,3] — Bot-held, 120 VP (north bridge)
- Hex [9,9] — Bot-held, 120 VP (south bridge)
- Hex [15,5] — Bot-held, 150 VP (bastion city)
- Hex [2,13] — Player-held, 60 VP (start anchor)

**Player forces (predeployed, no deployment zones):**
- Panzer_IV, Infantry_42, Engineer, Recon_Bike, Howitzer_105, Fighter, Bomber, Flak_88, Heavy_Tank (×1 each)
- Player HQ: [2,13]

**Enemy forces (Bot HQ: [16,4]):**
- AT_Gun_50mm (×1), Howitzer_105 (×1), Infantry_42 (×2), Engineer (×1), Panzer_IV (×1), Heavy_Tank (×1), Recon_Bike (×1), Fighter (×1), Bomber (×1), Flak_88 (×1)
- Resources: 600
- Strategy: Entrench infantry at bridgeheads, use armor to counterattack crossings, keep air over bastion

**Required work to activate:**
1. Define deployment zones (west bank staging area, capacity ≥ 12)
2. Add mission key to `src/state/UIState.ts`
3. Register in `src/data/scenarioRegistry.ts`
4. Add validation profile in `src/data/scenarioValidation.ts`
5. Add mission metadata in `src/data/missions.ts`

---

### PLANNED SCENARIOS — BACKLOG

Source document: `docs/missions/Major WWII Battles -- USA vs German.txt` (60 US vs German scenarios, 1943–1945, confidence-scored).

These are design seeds, not complete mission packages. A full Mission Package per `docs/MISSION_DESIGN_GUIDE.md` is required before implementation begins. Scenarios are listed chronologically within each campaign theater.

**FSG scenario type key:**
- **Assault** — player attacks a prepared enemy position
- **Patrol** — player defends or holds against enemy pressure
- **Exploitation** — player pursues a breaking enemy / race to objectives
- **Encirclement** — player closes a pocket or escapes one

---

### Campaign: North Africa (1943)

#### PS-01 · Battle of Kasserine Pass
**Date:** Feb 14–25, 1943 | **Location:** Kasserine Pass, Tunisia | **Confidence:** 80
**Terrain:** Narrow mountain passes flanked by rocky ridges; valley tracks turned muddy by winter rains; low visibility in valleys
**Weather:** Winter; cold nights; rain; dust in valley approaches
**US Forces:** 1st Armored Division, 1st Infantry Division elements, artillery support (II Corps)
**German Forces:** 10th and 21st Panzer Divisions (Fifth Panzer Army); Stuka and fighter-bomber air support
**Outcome:** German tactical breakthrough in early phase; US combined-arms defense eventually halted the thrust and forced German retreat — strategic US victory
**Why it was important:** First major US-German clash; exposed gap between untested US doctrine and German combined-arms proficiency; led to wholesale US leadership and training reform
**FSG type:** Patrol (hold the passes). Player commands US holding force defending mountain corridor against armor-superior enemy. Restricted armor forces AT gun and terrain use. Phase trigger: if both passes held for 8 turns, German offensive stalls.

---

#### PS-02 · Battle of El Guettar
**Date:** Mar 23–Apr 3, 1943 | **Location:** El Guettar, Tunisia | **Confidence:** 78
**Terrain:** Rugged hills and narrow valley constricting movement; dusty spring conditions
**Weather:** Cool nights, hot days; dust
**US Forces:** 1st Infantry Division (Big Red One), 1st Armored Division elements, tank destroyer battalions (II Corps)
**German Forces:** 10th Panzer Division with tanks and infantry; Italian Littorio and 90th Light Divisions in support
**Outcome:** US defensive line repelled repeated German tank assaults with heavy Axis losses; proved US combined-arms capability
**Why it was important:** First US offensive victory against German armor in Africa; rehabilitated II Corps after Kasserine
**FSG type:** Patrol (defend valley). Player holds ridge-line against German tank-heavy assault. Tank destroyer placement is key. US air superiority provides fire support after turn 4.

---

#### PS-03 · Battle of Hill 609 (Djebel Tahent)
**Date:** Apr 29–May 1, 1943 | **Location:** Near Chouigui, Tunisia | **Confidence:** 70
**Terrain:** Steep rocky hill dominating surrounding plain; defenders entrenched in caves; dry and warm
**Weather:** Early May; dry and warm
**US Forces:** 34th Infantry Division; elements of 1st and 9th Divisions; artillery and tank support
**German Forces:** 334th Infantry Division with MG nests and AT guns
**Outcome:** US infantry captured the summit after costly assaults; German withdrawal opened road to Bizerte
**Why it was important:** Proved US infantry could storm a prepared German hilltop position; opened route for the final Tunisian offensive
**FSG type:** Assault (hill objective). Player attacks uphill against entrenched defenders. Restricted armor approach due to terrain. Artillery preparation before infantry commitment is the key mechanic.

---

#### PS-04 · Capture of Bizerte
**Date:** May 7–8, 1943 | **Location:** Bizerte, Tunisia | **Confidence:** 73
**Terrain:** Urban port; coastal terrain; clear and warm
**Weather:** Clear; warm
**US Forces:** 9th and 34th Infantry Divisions with armor and artillery
**German Forces:** German and Italian garrison with coastal artillery and anti-aircraft guns
**Outcome:** US stormed Bizerte, overwhelming the garrison; combined with British capture of Tunis ended the North African campaign
**Why it was important:** Seizure of Tunisia's principal port ended Axis resistance in North Africa and secured Allied control of Mediterranean sea routes
**FSG type:** Assault (port city). Naval gunfire available as off-map asset. Enemy holds fortified port buildings and coastal batteries. Victory: capture port hex and two surrounding city hexes.

---

### Campaign: Sicily (1943)

#### PS-05 · Operation Husky — Gela Landings
**Date:** Jul 10–12, 1943 | **Location:** Gela, Sicily | **Confidence:** 85
**Terrain:** Beaches backed by low dunes and farmland; midsummer heat; surf hindered landing craft
**Weather:** Summer heat; initial surf difficulty
**US Forces:** 1st Infantry and 45th Infantry Divisions, Rangers, paratroopers
**German Forces:** Hermann Göring Panzer Division, 15th Panzergrenadier Division; ~150 tanks including Tiger I
**Outcome:** US infantry held the beachhead and repulsed German tank counterattacks; secured Gela and pushed inland
**Why it was important:** Opened the Sicilian campaign; established the base for pushing Axis out of Sicily and invading mainland Italy
**FSG type:** Patrol (beachhead defense). Player lands and must hold the beach hex against armored counterattack. No organic armor in first 3 turns. Naval gunfire available as limited off-map support.

---

#### PS-06 · Battle of Troina
**Date:** Jul 31–Aug 6, 1943 | **Location:** Troina, Sicily | **Confidence:** 72
**Terrain:** Rugged mountains, steep ridges, narrow valleys; hot and dusty
**Weather:** Summer heat; dust
**US Forces:** 1st and 9th Infantry Divisions with artillery and tanks
**German Forces:** 15th Panzergrenadier Division reinforced by Italian units; both sides dug in on ridges
**Outcome:** After a week of assaults and counterattacks, US seized Troina; Germans withdrew toward Messina
**Why it was important:** Key German defensive position in Sicily's mountainous interior; its fall opened the road to Messina
**FSG type:** Assault (town on ridge). Multiple ridge-line objective hexes. Enemy counterattacks after each captured hex. Air bombardment available as pre-assault option consuming air support points.

---

#### PS-07 · Battle of Brolo
**Date:** Aug 11–12, 1943 | **Location:** Brolo, Sicily | **Confidence:** 60
**Terrain:** Coastal cliffs, narrow beaches; hot August weather
**Weather:** Hot; clear
**US Forces:** 3rd Infantry Division (7th Infantry Regiment) — amphibious flanking force
**German Forces:** 29th Panzergrenadier Division with infantry and AT guns
**Outcome:** US raiders temporarily blocked the coastal road but were outnumbered and withdrew; Germans continued retreat
**Why it was important:** Amphibious flanking maneuver aimed to cut off retreating German division; demonstrated the risk of unsupported landings
**FSG type:** Patrol (hold road hex behind enemy lines). Small-force survival scenario. Player lands with a battalion equivalent and must hold a road junction until turn limit without resupply.

---

#### PS-08 · Capture of Messina
**Date:** Aug 16–17, 1943 | **Location:** Messina, Sicily | **Confidence:** 62
**Terrain:** Urban and hilly terrain near the strait; summer heat
**Weather:** Hot; clear
**US Forces:** 3rd and 45th Infantry Divisions advancing from the west
**German Forces:** XIV Panzer Corps rearguard — minimal forces in orderly withdrawal
**Outcome:** US entered Messina hours after the British 8th Army; majority of German units had already crossed the strait
**Why it was important:** Seizing Messina completed conquest of Sicily and opened the Strait for the mainland Italy invasion
**FSG type:** Exploitation (race to city). Turn limit creates urgency. Player must capture the city objective hex before the bot reaches an escape VP threshold. Speed vs. caution tension.

---

### Campaign: Italy (1943–1944)

#### PS-09 · Operation Avalanche — Salerno Landings
**Date:** Sep 9–17, 1943 | **Location:** Salerno, Italy | **Confidence:** 82
**Terrain:** Narrow beaches backed by mountains; vineyards and olive groves; warm late summer
**Weather:** Warm; late summer
**US Forces:** VI Corps — 36th and 45th Infantry Divisions, Rangers, paratroopers; heavy artillery support
**German Forces:** 16th Panzer Division, elements of 26th Panzer and 29th Panzergrenadier Divisions
**Outcome:** Allied forces held the beachhead despite near-breakthrough German counterattack; Germans withdrew under Allied air superiority by Sep 15
**Why it was important:** Amphibious invasion of mainland Italy; near-disaster demonstrated the danger of landing without immediate armor support
**FSG type:** Patrol (beachhead hold). German counterattack peaks on turns 3–6. Naval gunfire available as limited charges. Losing the road junction objective triggers defeat condition.

---

#### PS-10 · Battle of San Pietro Infine
**Date:** Dec 8–17, 1943 | **Location:** San Pietro Infine, Italy | **Confidence:** 70
**Terrain:** Mountainous terrain with terraced slopes and stone villages; winter rain and cold; mud
**Weather:** Winter; cold rain; mud
**US Forces:** 36th Infantry Division, 504th Parachute Infantry Regiment, armor support
**German Forces:** 15th Panzergrenadier Division with well-prepared defenses
**Outcome:** US took San Pietro and dominating ridges after ten days of intense fighting at high cost
**Why it was important:** Part of the US drive toward the Gustav Line; opened Highway 6 toward Cassino
**FSG type:** Assault (mountain village). Multiple hill and town objectives. Winter mud restricts armor movement. Engineers needed to clear minefields before tank advance.

---

#### PS-11 · Rapido River Crossing
**Date:** Jan 20–22, 1944 | **Location:** Rapido River, near Cassino, Italy | **Confidence:** 66
**Terrain:** Wide flooded river with marshy banks; German minefields and barbed wire; cold winter nights
**Weather:** Winter; cold; flooded river
**US Forces:** 36th Infantry Division with engineer units and tanks
**German Forces:** 15th Panzergrenadier Division and elements of 44th Infantry Division — entrenched on east bank
**Outcome:** The assault failed; German defenders repelled the crossings, causing heavy US casualties
**Why it was important:** Failed attempt to breach the Gustav Line; failure led to the prolonged Cassino stalemate
**FSG type:** Assault (river crossing under fire). Engineers required to build crossing. Defenders have LOS advantage. Enemy AT guns cover all ford hexes. Historical outcome was defeat — player must improve on history.

---

#### PS-12 · Operation Shingle — Anzio Landings
**Date:** Jan 22, 1944 | **Location:** Anzio and Nettuno, Italy | **Confidence:** 83
**Terrain:** Low-lying reclaimed marshland surrounded by hills; January cool and damp
**Weather:** Cool; damp; winter
**US Forces:** VI Corps — US 3rd Infantry Division, Ranger battalions; British 1st Division
**German Forces:** Three engineer companies initially (German 14th Army rushed reserves — ad hoc defense)
**Outcome:** Initial landings achieved surprise with minimal casualties; cautious expansion allowed Germans to occupy surrounding hills and contain the beachhead
**Why it was important:** Intended to outflank the Gustav Line; initial success wasted by slow exploitation — became a four-month siege
**FSG type:** Exploitation (expand beachhead before containment). Player must capture hill objectives in turns 1–4 before German reinforcement event triggers. After the event, scenario shifts to patrol/hold mode. Teaches offensive tempo.

---

#### PS-13 · Battle of Cisterna
**Date:** Jan 30, 1944 | **Location:** Cisterna di Latina, Italy | **Confidence:** 62
**Terrain:** Swampy lowland with canals and stone farmhouses; winter; cold and foggy
**Weather:** Winter; fog; cold
**US Forces:** 1st, 3rd, and 4th Ranger Battalions; 3rd Infantry Division support
**German Forces:** 715th Infantry Division and elements of 362nd Infantry Division
**Outcome:** German forces ambushed and overran the Rangers; most were killed or captured
**Why it was important:** Ranger raid intended to cut Highway 7 — catastrophic failure; demonstrated the danger of over-extended infiltration without armor support
**FSG type:** Patrol (infiltration survival). Light infantry raiding force deep in enemy territory. No armor, no resupply. Victory: reach the road objective hex. Defeat: encirclement. Hardest unit restriction scenario in the Italian theater.

---

#### PS-14 · Battle of Anzio — Breakout (Operation Buffalo)
**Date:** May 23–25, 1944 | **Location:** Anzio beachhead, Italy | **Confidence:** 78
**Terrain:** Marshy plains, Pontine roads, Albano hills approaches; spring mud and heat
**Weather:** Spring; warming; mud in low areas
**US Forces:** VI Corps — 3rd, 45th, 34th Infantry Divisions; 1st Armored Division; British 1st and 56th Divisions
**German Forces:** 14th Army — 4th Parachute, 3rd Panzergrenadier, 26th Panzer, 362nd Infantry Divisions
**Outcome:** Operation Buffalo broke through the German line; US forces captured Cisterna and advanced inland but diverted toward Rome instead of cutting off the German 10th Army
**Why it was important:** Ended the four-month Anzio stalemate; decision to divert toward Rome rather than cut off the Germans remains controversial
**FSG type:** Assault (breakout through prepared line). Player must breach the German containment line and seize Cisterna and road junction objectives. Supply system stressed from months of siege — logistics units needed early.

---

#### PS-15 · Battle of Monte Cassino (Operation Diadem)
**Date:** May 11–26, 1944 | **Location:** Gustav Line, Italy | **Confidence:** 75
**Terrain:** Mountainous rocky ridges and river valleys; monastery on commanding heights; May mud in lower areas
**Weather:** Spring; mild; rain in lower areas
**US Forces:** II Corps — 85th and 88th Infantry Divisions; French Expeditionary Corps
**German Forces:** 10th Army — 1st Fallschirmjäger Division (paratroopers), 15th Panzergrenadier Division; fortified high ground
**Outcome:** Coordinated multinational assault breached German lines; Polish troops captured the abbey; road to Rome opened
**Why it was important:** Final break of the Gustav Line after four months and four major assaults; costliest battle of the Italian campaign
**FSG type:** Assault (fortified mountain). Multi-phase: river crossing → ridgeline → abbey objective. Engineers required. Artillery preparation is a pre-turn resource spend. Flanking via the French mountain route is the historical key to victory.

---

#### PS-16 · Liberation of Rome
**Date:** Jun 4, 1944 | **Location:** Rome, Italy | **Confidence:** 72
**Terrain:** Urban streets and outskirts; early June warm and dry
**Weather:** Warm; clear
**US Forces:** Fifth Army — 3rd Infantry Division, 1st Armored Division, 34th Division
**German Forces:** 14th Army rearguard — scattered infantry and armor
**Outcome:** US troops entered Rome June 4; city declared open; minimal resistance; Germans escaped north
**Why it was important:** First Axis capital liberated; major psychological blow two days before D-Day
**FSG type:** Exploitation (city capture before evacuation). Race to reach the Tiber objective hex before the bot achieves its escape VP threshold. Light resistance — speed is the tactical challenge.

---

### Campaign: Normandy and France (1944)

#### PS-17 · Utah Beach (D-Day)
**Date:** Jun 6, 1944 | **Location:** Cotentin Peninsula, France | **Confidence:** 88
**Terrain:** Wide sandy beaches with flooded marshes behind; overcast and rough surf
**Weather:** Overcast; surf; June morning
**US Forces:** 4th Infantry Division, 8th Infantry Regiment, 101st Airborne Division
**German Forces:** 709th Static Infantry Division, 243rd Infantry Division; coastal batteries
**Outcome:** Landing met light resistance (drifted to less-defended sector); US pushed inland and linked with airborne troops quickly with relatively few casualties
**Why it was important:** Part of Operation Overlord; securing Utah Beach allowed Allies to outflank German coastal defenses and capture Cherbourg
**FSG type:** Assault (beach landing + inland link-up). Two phases: secure beach objectives, then advance to link with airborne hexes. Lighter resistance than Omaha — good introductory D-Day scenario.

---

#### PS-18 · Pointe du Hoc (D-Day)
**Date:** Jun 6, 1944 | **Location:** Cliffs west of Omaha Beach, France | **Confidence:** 86
**Terrain:** Sheer 30-meter cliffs; casemate gun positions; debris and craters from naval bombardment
**Weather:** Heavy surf; wind; smoke and debris
**US Forces:** 2nd Ranger Battalion (~225 men) — Lt. Col. James Rudder commanding
**German Forces:** 352nd Infantry Division artillery battery and infantry garrison
**Outcome:** Rangers scaled cliffs under fire, found guns relocated inland and destroyed them, held position against counterattacks until relieved
**Why it was important:** Neutralized guns commanding both Omaha and Utah beaches; daring assault became iconic Ranger action
**FSG type:** Patrol (small force, hold after assault). Player assaults cliff hex with infantry-only force, then must hold against counterattacks for 6 turns. No armor, no artillery. Showcases unit restriction system at small scale.

---

#### PS-19 · Omaha Beach (D-Day)
**Date:** Jun 6, 1944 | **Location:** Omaha Beach, Normandy, France | **Confidence:** 90
**Terrain:** Narrow beach overlooked by bluffs and cliffs; shingle, seawall, anti-tank obstacles; morning fog and rough surf
**Weather:** Overcast; rough surf; fog
**US Forces:** 1st Infantry Division (Big Red One), 29th Infantry Division, Rangers, engineers
**German Forces:** 352nd Infantry Division — coastal batteries, MG nests, concrete bunkers with commanding LOS to beach
**Outcome:** Initial waves suffered heavy casualties but infantry infiltrated flanks, destroyed strongpoints, and secured beachhead by evening
**Why it was important:** Most heavily defended US beach on D-Day; securing it linked British and American sectors and proved the Atlantic Wall could be breached
**FSG type:** Assault (extreme LOS asymmetry). Enemy holds bluffs with fire superiority over beach hexes. Player restricted to infantry and engineers for turns 1–4; no armor (DD tanks lost at sea). Naval gunfire support available as limited charges. Flagship hard scenario.

---

#### PS-20 · Battle of Carentan
**Date:** Jun 10–13, 1944 | **Location:** Carentan, Normandy, France | **Confidence:** 77
**Terrain:** Marshy lowlands, causeways, hedgerows; cloudy with rain showers
**Weather:** Overcast; rain
**US Forces:** 101st Airborne Division; 2nd Armored Division support
**German Forces:** 6th Parachute Regiment, elements of 17th SS Panzergrenadier Division
**Outcome:** US paratroopers captured Carentan after fierce hedgerow fighting; German counterattack repelled by arriving armor
**Why it was important:** Critical to linking Utah and Omaha beachheads and securing a path to Cherbourg
**FSG type:** Assault (causeway + town). Player must advance along a narrow causeway (movement bottleneck) and capture the town. Enemy counterattacks on the flanks after town capture. Armor arrives as a reinforcement event.

---

#### PS-21 · Battle of Cherbourg
**Date:** Jun 22–29, 1944 | **Location:** Cherbourg, Normandy, France | **Confidence:** 75
**Terrain:** Hedgerows and urban fighting inside coastal forts; thick masonry fortifications; variable summer weather
**Weather:** Variable; summer
**US Forces:** VII Corps — 4th, 9th, and 79th Infantry Divisions; heavy artillery
**German Forces:** Garrison of 20,000+ including 77th Infantry Division, 709th Division; coastal fortifications
**Outcome:** US systematically reduced outlying forts and captured the city; Germans sabotaged port facilities
**Why it was important:** Capture of a deep-water port vital for Allied logistics in France
**FSG type:** Assault (fortified port encirclement). Player encircles the city and reduces outer forts sequentially before assaulting the port. Naval bombardment available on forts. Turn limit VP: longer siege = more port VP lost to demolitions.

---

#### PS-22 · Battle of Saint-Lô
**Date:** Jul 7–19, 1944 | **Location:** Saint-Lô, Normandy, France | **Confidence:** 74
**Terrain:** Hedgerows (bocage) and urban rubble; hot July; dust and smoke
**Weather:** Hot; dusty; summer
**US Forces:** XIX Corps — 29th, 35th, and 30th Infantry Divisions; armor and artillery
**German Forces:** 352nd Infantry Division and remnants of 3rd Parachute Division; entrenched in ruins
**Outcome:** US forces fought brutal street battles and cleared the town at heavy cost; set the stage for Operation Cobra
**Why it was important:** Key crossroads whose capture cleared the path for Operation Cobra and the breakout from Normandy
**FSG type:** Assault (urban bocage). Dense bocage limits LOS and movement. Town center is the VP objective; surrounding heights must be cleared first.

---

#### PS-23 · Operation Cobra
**Date:** Jul 25–30, 1944 | **Location:** Near Saint-Lô, Normandy, France | **Confidence:** 86
**Terrain:** Hedgerow country with small fields and sunken lanes; late July heat; dust and smoke
**Weather:** Hot; dusty
**US Forces:** First Army — VII and VIII Corps with infantry and armored divisions
**German Forces:** Panzer Lehr Division, 2nd SS Panzer Division
**Outcome:** Concentrated aerial bombardment shattered German defenses; US armor surged through the gap; rapid liberation of Brittany followed; German front collapsed
**Why it was important:** Massive US offensive that broke through German lines and unleashed maneuver warfare across France; turned a static front into a pursuit
**FSG type:** Exploitation (breakout). Air bombardment pre-event reduces enemy strength at scenario start. Player must exploit the gap by advancing armored units through the objective corridor before German reserves close the breach.

---

#### PS-24 · Operation Lüttich — Mortain Counterattack
**Date:** Aug 7–13, 1944 | **Location:** Mortain, Normandy, France | **Confidence:** 79
**Terrain:** Hedgerow hills and ridges around Mortain; dawn fog giving initial German surprise; clear skies during day
**Weather:** Fog at dawn; clear during day
**US Forces:** 30th Infantry Division, 35th Infantry Division, 2nd Armored Division
**German Forces:** XLVII Panzer Corps — 2nd SS Das Reich, 1st SS Leibstandarte, 17th SS Götz von Berlichingen; ~300 tanks
**Outcome:** US infantry held Hill 317 and key heights; German tanks decimated by air attacks; counteroffensive halted
**Why it was important:** Last German attempt to contain Allied breakout — its failure opened the Falaise pocket and sealed Army Group B's fate
**FSG type:** Patrol (hold the ridge). German-heavy assault on multiple axes. Air support unlocks after turn 3 (clear skies). Key hex is Hill 317 — losing it triggers defeat. Showcases air support as battle-turning mechanic.

---

#### PS-25 · Battle of Brest
**Date:** Aug 7–Sep 19, 1944 | **Location:** Brest, Brittany, France | **Confidence:** 70
**Terrain:** Fortified coastal city with casemates and underground bunkers; late summer; occasional fog and rain
**Weather:** Late summer; fog; rain
**US Forces:** VIII Corps — 2nd, 8th, 29th Infantry Divisions, 6th Armored Division
**German Forces:** General Ramcke's garrison — fortress troops and paratroopers
**Outcome:** US captured Brest after a protracted siege; port wrecked by German demolitions
**Why it was important:** Capture of a fortified deepwater port on Brittany to support Allied logistics; costly in time and casualties
**FSG type:** Assault (long siege). Extended scenario with high turn limit. Systematic fort reduction required. VP loss mechanic for each turn of delay (port demolitions accumulate).

---

#### PS-26 · Falaise Pocket
**Date:** Aug 12–21, 1944 | **Location:** Falaise–Chambois area, Normandy, France | **Confidence:** 84
**Terrain:** Rolling farmland with small villages and hedgerows; August heat; dust and smoke from burning vehicles
**Weather:** Hot; dusty; summer
**US Forces:** Third Army; Canadian First Army; Polish 1st Armoured Division
**German Forces:** Seventh Army and Fifth Panzer Army remnants — numerous divisions attempting escape
**Outcome:** Allies closed the pocket at Chambois; 10,000+ Germans killed, 50,000+ captured; German forces in France shattered
**Why it was important:** Final encirclement of German Army Group B; decisive blow ending the Normandy campaign and opening the road to Paris
**FSG type:** Encirclement (close the pocket). Player commands blocking force at Chambois road junction. Enemy AI conducts breakout attempts each turn. Victory: keep pocket sealed until turn limit.

---

#### PS-27 · Operation Dragoon — Southern France
**Date:** Aug 15–Sep 25, 1944 | **Location:** French Riviera and Rhône Valley | **Confidence:** 74
**Terrain:** Beaches, vineyards, rolling hills; August heat; calm seas
**Weather:** Hot; calm; summer
**US Forces:** VI Corps — 3rd, 36th, and 45th Infantry Divisions; French forces alongside
**German Forces:** 19th Army — coastal defense divisions and reserve panzergrenadiers
**Outcome:** Allied forces quickly overcame coastal defenses, liberated Toulon and Marseille, advanced rapidly north; German Army Group G retreated into eastern France
**Why it was important:** Opened a second Allied front in France, liberated Mediterranean ports, and accelerated German retreat toward the Rhine
**FSG type:** Assault (amphibious landing + exploitation). Beach landing followed by rapid inland advance. Light German resistance — teaches exploitation tempo.

---

### Campaign: Netherlands and Belgium (1944)

#### PS-28 · Operation Market Garden — Eindhoven
**Date:** Sep 17–20, 1944 | **Location:** Eindhoven and Son, Netherlands | **Confidence:** 72
**Terrain:** Flat farmland, dikes, and villages; September; clouds and showers
**Weather:** Variable; clouds; showers
**US Forces:** 101st Airborne Division — three parachute regiments
**German Forces:** Elements of 59th and 85th Infantry Divisions; ad hoc battle groups
**Outcome:** Paratroopers seized Son bridge (Germans blew it) and captured Eindhoven; engineers erected Bailey bridge enabling armored column to pass
**Why it was important:** Part of the largest airborne operation in history; securing Eindhoven opened the corridor to Nijmegen and Arnhem
**FSG type:** Assault (bridge seizure under time pressure). Player must capture multiple bridge hexes before German demolition event triggers. Engineers required to repair blown bridge.

---

#### PS-29 · Operation Market Garden — Nijmegen
**Date:** Sep 17–20, 1944 | **Location:** Nijmegen, Netherlands | **Confidence:** 72
**Terrain:** Urban streets and wide Waal River; strong current; moderate September temperatures
**Weather:** Moderate; September
**US Forces:** 82nd Airborne Division; Guards Armoured Division support
**German Forces:** 406th Infantry Division; SS training units
**Outcome:** After fierce street fighting, paratroopers and British tanks captured Nijmegen bridge via daring river assault; delays further north prevented relief of Arnhem
**Why it was important:** Securing the Waal River bridges was vital to the Market Garden corridor; success here came too late to save Arnhem
**FSG type:** Assault (dual objective: bridge + city). River assault required. Two simultaneous objectives create resource allocation tension. Reinforcement from Guards armored column arrives on turn 4.

---

### Campaign: Germany — Siegfried Line to Rhine (1944–1945)

#### PS-30 · Battle of Hürtgen Forest
**Date:** Sep 19–Dec 16, 1944 | **Location:** Hürtgen Forest, Germany | **Confidence:** 80
**Terrain:** Thick evergreen forest with steep ravines and minefields; cold wet autumn; snow and fog in winter
**Weather:** Cold; fog; rain; snow
**US Forces:** V Corps — 9th, 28th, 4th Infantry Divisions; later 1st and 8th Divisions
**German Forces:** 275th and 353rd Infantry Divisions; elements of 116th Panzer and 3rd Parachute Divisions
**Outcome:** Prolonged attrition battle; US divisions suffered heavy casualties and gained little ground before the Ardennes offensive shifted focus
**Why it was important:** Longest US battle on German soil; fought to secure Roer River dams and protect the Allied right flank; a costly failure of doctrine in dense terrain
**FSG type:** Assault (forest attrition). Dense forest severely limits LOS and armor movement. Infantry-dominant combat. Roer dam hex is the ultimate objective; town hexes must be cleared first.

---

#### PS-31 · Battle of Aachen
**Date:** Oct 2–21, 1944 | **Location:** Aachen, Germany | **Confidence:** 83
**Terrain:** Urban streets and medieval buildings within belts of pillboxes, barbed wire, and AT obstacles; October rains and mud
**Weather:** Rainy; muddy; October
**US Forces:** First Army — 1st Infantry Division, 2nd Armored Division, 30th Infantry Division
**German Forces:** Three Waffen-SS divisions; 246th Volksgrenadier Division; heavily fortified pillbox belt
**Outcome:** After 19 days of intense house-to-house fighting, US forces captured Aachen; Wehrmacht lost two divisions with eight more badly mauled
**Why it was important:** First German city captured by the Allies; controlling Aachen broke the Siegfried Line and opened a path toward the Ruhr industrial region
**FSG type:** Assault (urban encirclement). Player must encircle the city with two converging columns before assaulting the center. Fortified belt must be reduced before the urban fight. Flagship mid-difficulty scenario.

---

#### PS-32 · Battle of Metz
**Date:** Nov 9–21, 1944 | **Location:** Metz, France | **Confidence:** 70
**Terrain:** Ring of forts, Moselle and Seille rivers, marshy ground; November rain and cold
**Weather:** Rainy; cold; November
**US Forces:** Third Army — 95th, 5th, and 90th Infantry Divisions; 10th Armored Division
**German Forces:** 462nd Volksgrenadier Division; fortress artillery garrison
**Outcome:** US methodically reduced forts and captured Metz; many Germans escaped but the strategic route into Germany was opened
**Why it was important:** Heavily fortified city guarding approaches into Germany; its fall opened routes into the Saar region
**FSG type:** Assault (fort encirclement). Player reduces each outer fort hex sequentially before assaulting the city. Each fort is a mini-objective with its own defense value. Artillery is critical; direct assault without preparation is suicidal.

---

#### PS-33 · Operation Clipper — Geilenkirchen
**Date:** Nov 18–22, 1944 | **Location:** Geilenkirchen, Germany | **Confidence:** 65
**Terrain:** Rolling farmland and small towns fortified with pillboxes; cold November rain; mud
**Weather:** Cold; rainy; muddy
**US Forces:** 84th Infantry Division (Railsplitters) with tanks and engineers; British 43rd Wessex Division
**German Forces:** 183rd Volksgrenadier Division; 12th SS Panzer Division
**Outcome:** US and British troops seized Geilenkirchen, breached the Siegfried Line in that sector, and captured hundreds of prisoners
**Why it was important:** Cleared the western edge of the Siegfried Line and created a bridgehead for future offensives; joint US-British operation
**FSG type:** Assault (Siegfried Line breach). Pillbox hex network must be cleared with engineer support. Two-column advance (US + Ally). Mud restricts armor to roads.

---

### Campaign: The Bulge (1944–1945)

#### PS-34 · Battle of St. Vith
**Date:** Dec 16–23, 1944 | **Location:** St. Vith, Belgium | **Confidence:** 78
**Terrain:** Wooded hills and ridges; deep snow and fog
**Weather:** Snow; fog; cold
**US Forces:** 7th Armored Division; elements of 106th and 28th Infantry Divisions
**German Forces:** 5th Panzer Army — 18th and 62nd Volksgrenadier Divisions
**Outcome:** US armor and infantry held St. Vith for nearly a week before withdrawing; delay disrupted the German timetable
**Why it was important:** Rail and road hub vital to German offensive; the US delay critically disrupted the German schedule and contributed to the offensive's failure
**FSG type:** Patrol (hold the road junction). Player must hold the town hex for 7 turns. German pressure escalates each turn. Orderly withdrawal earns reduced VP as a fallback condition.

---

#### PS-35 · Battle of Elsenborn Ridge
**Date:** Dec 16–26, 1944 | **Location:** Elsenborn Ridge, Belgium | **Confidence:** 77
**Terrain:** Elevated forested ridge with open fields to east; snow and ice; freezing
**Weather:** Snow; ice; freezing
**US Forces:** 2nd and 99th Infantry Divisions with attached tank destroyers
**German Forces:** 6th SS Panzer Army — 1st SS Leibstandarte and 12th SS Hitlerjugend Divisions
**Outcome:** Stubborn US defense inflicted heavy SS losses; forced Germans to divert south; blocked the northern shoulder of the Bulge
**Why it was important:** Controlling Elsenborn Ridge prevented a German breakthrough toward Liège; the northern shoulder held the entire offensive's flank
**FSG type:** Patrol (ridge defense). Player holds elevated hex line against SS armor. Tank destroyer placement is critical. No armor organic to player in the first phase. Artillery must be conserved.

---

#### PS-36 · Battle of Clervaux
**Date:** Dec 17–18, 1944 | **Location:** Clervaux, Luxembourg | **Confidence:** 70
**Terrain:** Town in narrow valley with medieval castle; snow and fog; cold
**Weather:** Snow; fog; cold
**US Forces:** 110th Infantry Regiment (28th Division) with tank destroyers
**German Forces:** 2nd Panzer Division and Panzer Lehr Division
**Outcome:** US forces overwhelmed after fierce defense; their stand delayed German armor and bought time for Bastogne's defense
**Why it was important:** Early delaying action in the Bulge — buying even 24 hours allowed Bastogne to prepare its perimeter
**FSG type:** Patrol (doomed delaying action). Player has insufficient force to hold permanently — each turn held earns VP even after the town falls. Tests retreat discipline.

---

#### PS-37 · Battle of La Gleize — Kampfgruppe Peiper
**Date:** Dec 18–23, 1944 | **Location:** La Gleize, Belgium | **Confidence:** 75
**Terrain:** Narrow roads through Ardennes villages and forests; deep snow; freezing
**Weather:** Snow; freezing
**US Forces:** 30th Infantry Division, 82nd Airborne Division, CCB / 3rd Armored Division
**German Forces:** Kampfgruppe Peiper (1st SS Panzer Division) with King Tiger tanks
**Outcome:** Cut off and out of fuel, Peiper abandoned his heavy tanks at La Gleize; US captured or destroyed the spearhead
**Why it was important:** Climax of Peiper's thrust — cutting off this spearhead deprived the Germans of their most dangerous armored wedge
**FSG type:** Encirclement (close the ring). Player commands converging US columns encircling a King Tiger-equipped pocket. Supply system: enemy runs out of fuel over time, creating attrition without direct assault.

---

#### PS-38 · Siege of Bastogne
**Date:** Dec 20–27, 1944 | **Location:** Bastogne, Belgium | **Confidence:** 87
**Terrain:** Surrounded town with open fields and forests; heavy snow and freezing temperatures
**Weather:** Snow; overcast turns 1–5 (no air); clear turn 6+
**US Forces:** 101st Airborne Division; elements of 10th Armored Division and CCB
**German Forces:** XLVII Panzer Corps — 2nd Panzer Division, Panzer Lehr, 26th Volksgrenadier Division
**Outcome:** Surrounded paratroopers held Bastogne despite repeated assaults; Patton's Third Army broke the siege Dec 26
**Why it was important:** Critical road junction controlling movement in the Ardennes; holding Bastogne denied German logistics and disrupted the entire offensive
**FSG type:** Patrol (encirclement survival). No air support turns 1–5; air drops supply units on turns 3 and 5. Air support unlocks turn 6 (clear skies). Relief column arrives turn 8. Player must hold the town hex throughout. Supply system (ammo depletion) creates authentic scarcity. Flagship scenario showcasing FSG supply and air support systems.

---

### Campaign: Germany — Final Offensives (1945)

#### PS-39 · Operation Nordwind
**Date:** Jan 1–25, 1945 | **Location:** Alsace and Lorraine, France | **Confidence:** 72
**Terrain:** Vosges Mountains and Rhine plain; snow and freezing rain
**Weather:** Snow; freezing rain; winter
**US Forces:** Seventh Army — 45th, 79th, and 100th Infantry Divisions
**German Forces:** Army Group Oberrhein and Fifth Panzer Army — 6th SS Mountain Division, 17th SS Panzergrenadier Division
**Outcome:** German attacks achieved limited gains but were halted by resilient US defenses; Allied lines held
**Why it was important:** Germany's last offensive on the Western Front; aimed to divert forces from the Ardennes and threaten Strasbourg
**FSG type:** Patrol (defend mountain passes). Mountain terrain restricts movement to corridors. Luftwaffe Bodenplatte attacks reduce player air assets on turn 1. Player must hold the Strasbourg road junction objective.

---

#### PS-40 · Colmar Pocket
**Date:** Jan 20–Feb 9, 1945 | **Location:** Alsace, France | **Confidence:** 71
**Terrain:** Snow-covered plains, Rhine floodbanks, vineyards; harsh winter
**Weather:** Snow; harsh winter
**US Forces:** XXI Corps — 3rd and 28th Infantry Divisions, 14th Armored Division; French First Army alongside
**German Forces:** 19th Army — several infantry divisions and tanks
**Outcome:** Coordinated US-French attacks cleared the pocket; last German bridgehead west of the Rhine eliminated
**Why it was important:** Secured the Allied flank before the Rhine crossing; eliminated the last German bridgehead on the west bank
**FSG type:** Encirclement (reduce pocket). Player and Ally force converge to close the pocket. Enemy attempts breakout across the Rhine ford hex each turn.

---

#### PS-41 · Operation Grenade — Roer River Crossing
**Date:** Feb 17–Mar 10, 1945 | **Location:** Roer River, Germany | **Confidence:** 70
**Terrain:** River valleys with dikes and flooded plains; winter rain; dam releases creating strong currents
**Weather:** Cold; rain; flooding
**US Forces:** Ninth Army — XVIII Corps, 8th Armored Division
**German Forces:** 15th Army — 11th Panzer Division; Volksgrenadier units
**Outcome:** After delays from flooding, US crossed Feb 23 and quickly expanded the bridgehead; German defenses collapsed enabling advance to the Rhine
**Why it was important:** Crossing the Roer cleared the way to the Rhine for the US Ninth Army and contributed to the Ruhr encirclement
**FSG type:** Assault (river crossing under flood conditions). Engineers required. Flooding event reduces crossing capacity for turns 1–4. Once across, rapid exploitation phase begins.

---

#### PS-42 · Operation Lumberjack
**Date:** Mar 1–7, 1945 | **Location:** Rhineland, Germany | **Confidence:** 73
**Terrain:** Rolling hills and towns along the Rhine; early March cool and wet
**Weather:** Cool; wet
**US Forces:** First Army — III and VII Corps with multiple infantry and armored divisions
**German Forces:** 15th Army remnants and Volkssturm units
**Outcome:** Rapid US advance captured Cologne and reached the Rhine; intact bridge at Remagen unexpectedly seized March 7
**Why it was important:** Offensive to capture the Rhine's west bank unexpectedly led to the Ludendorff Bridge capture, accelerating the invasion of Germany
**FSG type:** Exploitation (rapid advance + bridge capture bonus). Player advances armored columns toward the Rhine. Bridge hex capture on or before turn 5 awards major VP bonus (the Remagen event).

---

#### PS-43 · Battle of Cologne
**Date:** Mar 6–7, 1945 | **Location:** Cologne, Germany | **Confidence:** 71
**Terrain:** Urban ruins from heavy bombing; Rhine bridges rigged for demolition; cool March
**Weather:** Cool; March
**US Forces:** 3rd Armored Division and 104th Infantry Division
**German Forces:** 3rd Panzergrenadier Division and local militia
**Outcome:** US armor and infantry entered Cologne with little organized resistance; key bridge destroyed; intact Remagen bridge found shortly after
**Why it was important:** Clearing Cologne deprived Germany of a major industrial city; bridge demolition set up the Remagen opportunity
**FSG type:** Exploitation (urban sweep). Light resistance; player races armored units to reach the Rhine bridge hex before demolition event. Speed vs. deliberate clearing tension.

---

#### PS-44 · Battle of Remagen
**Date:** Mar 7–25, 1945 | **Location:** Remagen, Germany | **Confidence:** 87
**Terrain:** Bridge spanning swift Rhine; high ridges and tunnels on east bank; fog and rain
**Weather:** Fog; rain; March
**US Forces:** 9th Armored Division — CCB with 14th Tank Battalion and 27th Armored Infantry
**German Forces:** 15th Army elements and weak Volkssturm; engineers attempting to destroy the bridge
**Outcome:** Lt. Karl Timmermann's task force rushed the bridge March 7 and captured it intact; bridgehead established and expanded despite counterattacks; bridge collapsed ten days later but success enabled further crossings
**Why it was important:** Surprise capture of the Ludendorff Bridge gave Allies their first Rhine bridgehead, accelerating the invasion of Germany and shortening the war
**FSG type:** Assault (bridge seizure race + bridgehead defense). Phase 1 (turns 1–2): race to capture the bridge hex before demolition. Phase 2 (turns 3–10): defend the bridgehead against German counterattacks and Luftwaffe sorties. High-drama flagship scenario.

---

#### PS-45 · Operation Plunder and Varsity — Rhine Crossing at Wesel
**Date:** Mar 23–24, 1945 | **Location:** Rhine River near Wesel, Germany | **Confidence:** 76
**Terrain:** Wide river with dikes and flooded plains; morning fog and drizzle
**Weather:** Fog; drizzle; early spring
**US Forces:** Ninth Army XVI Corps; US 17th Airborne Division (Varsity drop)
**German Forces:** First Parachute Army — several infantry divisions
**Outcome:** Multiple Rhine bridgeheads established; Varsity captured key positions; operation facilitated Ruhr encirclement
**Why it was important:** Coordinated river crossing and airborne assault to secure the Rhine's east bank and surround the Ruhr industrial area
**FSG type:** Assault (combined arms river crossing + airborne). Two simultaneous operations: river crossing force and airborne drop. Airborne landing in enemy rear disrupts German defensive line. Showcases combined arms across all unit categories.

---

#### PS-46 · Ruhr Pocket
**Date:** Apr 1–18, 1945 | **Location:** Ruhr region, Germany | **Confidence:** 82
**Terrain:** Urbanized industrial area with rivers and canals; early April mild weather
**Weather:** Mild; April
**US Forces:** First Army, Ninth Army, and British elements
**German Forces:** Army Group B — 300,000+ troops including 15th and 5th Panzer Armies
**Outcome:** Allied armies linked up, trapped German forces; 300,000+ Germans surrendered; organized resistance in western Germany effectively ended
**Why it was important:** Encirclement and destruction of German Army Group B; removed the last significant German forces in the West
**FSG type:** Encirclement (large pocket). Player commands converging columns closing the ring around the Ruhr. Enemy attempts breakout through road corridors. Major VP for each unit captured vs. escaped. Large map, extended turn limit.

---

#### PS-47 · Battle of Nuremberg
**Date:** Apr 16–20, 1945 | **Location:** Nuremberg, Germany | **Confidence:** 69
**Terrain:** Urban rubble and medieval fortifications; April; mild with occasional rain
**Weather:** Mild; April; occasional rain
**US Forces:** Seventh Army — XV Corps (3rd, 45th, and 42nd Infantry Divisions)
**German Forces:** Volkssturm and SS units; 88mm Flak guns used as AT weapons
**Outcome:** US captured Nuremberg after days of street fighting and heavy artillery strikes; thousands of Germans surrendered or killed
**Why it was important:** Symbolic capture of the Nazi Party's ceremonial city; opened the route to southern Germany and Munich
**FSG type:** Assault (symbolic city, medieval fortifications). 88mm Flak used as AT guns creates a strong defensive line. Artillery preparation reduces fortification strength before infantry assault.

---

#### PS-48 · Battle of Leipzig
**Date:** Apr 18–19, 1945 | **Location:** Leipzig, Germany | **Confidence:** 67
**Terrain:** Urban streets, bridges, and parks; mid-April mild weather
**Weather:** Mild; April
**US Forces:** 69th Infantry Division and 9th Armored Division
**German Forces:** Remnants of 574th Infantry Division; Hitler Youth; Volkssturm
**Outcome:** US captured the city centre after short resistance; 69th Division later met Soviet forces at Torgau
**Why it was important:** Seizing a major transportation hub on the Elbe; facilitated the link-up with Soviet forces
**FSG type:** Exploitation (light resistance urban sweep). Low-difficulty late-war scenario. Good as a campaign finale mission.

---

### Scenario Production Priority

| Tier | ID | Scenario | Rationale |
|------|----|----------|-----------|
| 1 | — | **Two Bridges (register existing)** | Exists in code, needs zones + wiring — fastest new content |
| 2 | PS-38 | **Siege of Bastogne** | Hold + supply scarcity + air unlock — showcases all FSG systems |
| 3 | PS-19 | **Omaha Beach** | High drama; extreme LOS asymmetry; flagship hard scenario |
| 4 | PS-44 | **Battle of Remagen** | Two-phase race + defense; high drama; accessible map size |
| 5 | PS-18 | **Pointe du Hoc** | Small map; unit restriction showcase; quick to author |
| 6 | PS-34 | **St. Vith** | Delaying action; tests retreat discipline; teaches time-pressure |
| 7 | PS-01 | **Kasserine Pass** | Mountain pass hold; good tutorial-adjacent difficulty |
| 8 | PS-26 | **Falaise Pocket** | Encirclement / closing mechanic; strong AI breakout logic needed |
| 9 | PS-31 | **Aachen** | Urban encirclement; flagship mid-difficulty scenario |
| 10 | PS-15 | **Monte Cassino** | Fortification damage system showcase; multi-phase assault |
| 11 | PS-23 | **Operation Cobra** | Exploitation mechanic; teaches tempo |
| 12 | PS-24 | **Mortain** | Air support as battle-turner; defensive scenario with drama |

Scenarios PS-02 through PS-17 (North Africa and Italy introductory missions), and PS-39 through PS-48 (late-war Germany), are valid campaign progression missions once the production pipeline is proven with the tier-1 and tier-2 scenarios above.
