# River Crossing Watch

## Fantasy / historical framing
Night patrol along a winding river on the Western Front, 1944. Enemy infiltration teams are probing shallow fords to slip across before dawn. Player leads a mixed patrol to block crossings and prevent a foothold.

## Gameplay role
Patrol-tier mission that is more tactical than Training but below Assault in complexity. Focus on area denial, multi-point defense, and rapid response rather than full-scale assault.

## Clarity checklist
- **Identity**: River-crossing denial and infiltration interdiction; player feels urgency to guard multiple fords at night.
- **Limitations**: Night visibility, limited indirect fire (2x 81mm), compact patrol map (~14–16 hex radius), no heavy armor support.
- **Budget/resources**: Light patrol package (rifle squads, MG, light mortar, recon jeep, engineers) with only 2 off-map mortar calls; must triage across three crossings.
- **Win/Lose**: Win by preventing enemy from holding any ford cluster for 4 consecutive turns within the turn limit; lose if enemy holds a crossing for 4 turns, player force is routed, or timer expires with enemy foothold.
- **Unit availability**: Light infantry-centric; minimal vehicles (1 recon jeep); no tanks or heavy artillery to keep patrol identity and force careful positioning.

## Map and terrain logic
- **Theater**: Western Europe, summer 1944. Rural river valley with hedgerows and farms.
- **Shape/size**: Compact patrol map, ~14–16 hex radius (or ~20x22 grid equivalent). Irregular river bend forming an S-curve to create multiple crossing vectors.
- **Key terrain**:
  - Meandering river running north–south with 3 shallow fords (primary action nodes).
  - One wooden bridge near the southern third (destroyed/impassable to force ford usage, but provides cover as rubble).
  - Hedgerow-lined lanes on the friendly side for covered maneuver; open fields near fords to create LOS contests.
  - Low ridgeline on friendly bank (west) giving overwatch but broken by trees every 3–5 tiles to avoid sniper-lane dominance.
  - Small hamlet on the friendly side near the central ford (2–3 stone buildings, provides hard cover and a defendable anchor).
- **Movement**: Fords reduce movement cost but slow vehicles; bridge rubble is rough terrain; banks give mild elevation/cover.

## Objectives and fail states
- **Primary (Win)**: Prevent enemy from holding any crossing for 4 consecutive turns. Success if, by end of turn limit, no crossing tile cluster has an uncontested enemy presence.
- **Secondary (Optional)**:
  - Destroy the enemy comms team (radio truck or signals squad) before it reaches the central ford.
  - Keep at least one recon unit alive (encourages scouting rather than turtling).
- **Fail (Lose)**:
  - Enemy secures and holds any crossing cluster for 4 consecutive turns, or
  - Player suffers total rout (no active combat units), or
  - Turn limit (e.g., 12 turns) expires with an enemy-held crossing.

## Allied force composition (player)
- Core: 3 infantry battalions, 1 recon car unit (MG), 1 engineer team (demolitions/entrenchment), 1 HQ section.
- Support (limited charges): 1 off-map Artillery (2 fire missions).
- Rationale: Light patrol force with enough tools to block multiple fords, set hasty defenses, and probe.

## Enemy force composition
- Phase 1 (probing): 3 infiltration teams (SMG/MP), 1 sapper team (charges), 1 LMG team. Quality: regulars.
- Phase 2 (commitment): 2 rifle sections + 1 MG42 team + 1 AT rifle/early AT gun (threatens jeep) enter from east edge after turn 4.
- Phase 3 (escalation, optional if player dominates): 1 reserve rifle section + 1 light mortar. Triggered if all three fords are blocked simultaneously for 2 turns (to create pressure).
- Rationale: Infiltration-first, then heavier support; AT present to punish careless vehicle use but not armor-heavy.

## Deployment layout
- **Allied start**: Western bank, dispersed near hedgerow lanes; HQ near hamlet; recon jeep on a road for rapid response. Covered approaches to all three fords within 2–3 moves.
- **Enemy start**: East bank, three entry lanes aligned to each ford. Sappers aimed at the bridge rubble (decoy activity), probes at north/south fords, main push mid once contact is made.
- **Neutral**: None; civilian structures present as cover only.
- **Spawn safety**: No immediate MG arcs on allied spawn. First contact likely on turn 2–3 unless player rushes a ford.

## Pacing and escalation
- Early: stealth/probe—small teams testing crossings; player reacts and positions MG/mortar.
- Mid: synchronized pushes on at least two crossings; mortar smoke from enemy sappers to screen.
- Late: if enemy gains foothold, they dig in; if blocked, reserves push with light mortar pressure.

## Difficulty tuning logic
- **Easy**: Remove Phase 3 reserves; reduce enemy mortar to 0; lower enemy AT to single AT rifle; extend turn limit to 14.
- **Normal**: As listed.
- **Hard**: Add a second MG42 or upgrade a rifle section to veteran; enemy mortar gains an extra smoke; shorten turn limit to 11; increase sapper demo charges.

## UI-facing copy
- **Title**: River Crossing Watch
- **Briefing**: "Recon reports enemy infiltrators massing along the river. Multiple shallow fords cut through the bend—if they slip across, they’ll have a lodgment before dawn. Scramble your patrols, lock down each crossing, and deny them a foothold."
- **Objectives (UI bullets)**:
  - Primary: Deny enemy control of any crossing for 4 consecutive turns until extraction.
  - Optional: Destroy the enemy comms team before it reaches the central ford.
  - Optional: Keep at least one recon unit alive.

## Technical integration notes
- Mission key suggestion: `patrol_river_watch` (Patrol tier).
- Map: S-curve river with 3 ford clusters + 1 destroyed bridge (rough terrain). Western ridgeline + hamlet near center ford.
- Routing: Uses standard patrol flow (precombat → battle). No tutorial. Use patrol difficulty gating.
- Scenario data: needs a new scenario entry with tile layout, objective clusters tagged `ford_north|ford_central|ford_south`, and turn-based foothold check (4-turn hold condition).
- Support hooks: Off-map mortar support (player) limited to 2 calls; enemy smoke-capable mortar in later phase.

## Testing hooks and validation
- Verify objectives:
  - Holding logic: enemy must occupy a ford cluster 4 consecutive turns to win; reset counter if contested.
  - Optional objectives trigger: comms team destroyed flag; recon survival flag.
- Validate unit counts per phase vs difficulty table.
- Confirm turn limit per difficulty (Easy 14 / Normal 12 / Hard 11) and event triggers (Phase 2 at turn 4, Phase 3 on triple-block state).
- Placement checks: player spawn safety (no immediate MG arcs), first contact > 1 turn unless player rushes.
- UI copy matches mission key and briefing in `missions.ts` entry once added.
