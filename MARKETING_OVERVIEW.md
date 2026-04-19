# FOUR STAR GENERAL
## Browser-Based Battalion Command Simulator

**Real tactical depth. Real combined arms. Real logistics.**

---

## FOR COMMANDERS WHO DEMAND MORE

Four Star General is a hex-based WWII tactical wargame that respects your intelligence. No hand-holding. No scripted AI. No abstracted logistics that magically appear when you need them.

This is combined-arms warfare where positioning matters, supply lines win battles, and the AI opponent actually understands flanking maneuvers.

**Current Status:** Advanced playable prototype with complete tactical battle engine, campaign layer, and sophisticated AI opponent.

---

## TACTICAL COMBAT SYSTEM

### Combined Arms Warfare That Rewards Coordination

Command 35+ distinct unit types across six operational categories:

**Infantry & Specialists**
- Infantry battalions (720 personnel) with organic support weapons
- Elite airborne detachments with enhanced vision and morale
- Combat engineers with entrenchment, fortification, and obstacle-breaching capabilities
- AT infantry squads specialized for armor hunting
- Paratroopers with improved reconnaissance and skirmish traits

**Armor Forces**
- Medium tank companies (25 vehicles) for breakthrough operations
- Heavy tank companies (8 vehicles) with superior armor but limited mobility
- Tank destroyer companies optimized for long-range anti-armor work
- Assault gun battalions providing armored indirect fire support

**Artillery & Fire Support**
- Howitzer batteries (6x 105mm guns) with fire direction centers
- Rocket artillery battalions delivering 32-rocket salvos
- Self-propelled artillery groups for shoot-and-scoot tactics
- Anti-tank gun batteries (6x 50mm AT guns) for defensive positions
- Flak batteries with dual-role ground/air capability

**Reconnaissance Assets**
- Recon squads (18 armored cars) with enhanced spotting range
- Motorcycle patrols (32 bikes) for rapid screening operations
- Scout plane wings (6 aircraft) providing aerial intelligence
- Vision ranges: Base 2-3 hexes, recon units 3-4 hexes, specialized recon aircraft even further

**Air Wings**
- Fighter squadrons (12 aircraft) for air superiority and combat air patrol
- Interceptor wings (10 optimized interceptors) for high-altitude scrambles
- Ground attack wings (8 close-support aircraft) with mixed ordnance
- Tactical bomber wings (6 bombers) with dedicated bombardier crews
- Transport wings (5 cargo aircraft) for airborne operations

**Logistics & Support Units**
- Supply convoys with mixed fuel/ammo/ration loads
- Ammunition caches for artillery replenishment
- Fuel depots for mechanized operations
- Medical teams with field aid posts and evacuation transport
- Maintenance crews with recovery equipment and spare parts

### Combat Mechanics That Matter

**Directional Armor System**
Your medium tank has 15/8/4 armor (front/side/top). Attack from the flank and watch armor penetration mechanics deliver realistic kill probabilities. Frontal assaults against dug-in armor? Expect casualties.

**Line of Sight & Reconnaissance**
True LOS calculations with elevation awareness. Recon units can spot through light terrain. Enemy positions remain uncertain until visual contact or dedicated reconnaissance missions reveal them. Four intel levels per hex: aerial/intel/firsthand/none.

**Dual-Phase Damage Resolution**
1. **Accuracy phase**: Modified by unit signatures (tiny/small/medium/large), experience stars (+10% accuracy per star), terrain, suppression status
2. **Damage phase**: Armor penetration vs. target protection with continuous blending between soft/hard attack values (+3% damage per experience star)

**Range & Fire Control**
Every unit has minimum and maximum effective ranges. Artillery benefits from positioned fire. Adjacent units can counter-fire with 20% accuracy penalty (maximum 6 retaliations per turn). Optimal engagement distances reward tactical positioning.

**Suppression & Pinning**
Multiple suppressors create cascading pin effects. Suppressed units fight with reduced effectiveness. Fire volume generates suppression per hit. Proper artillery prep isn't optional—it's doctrine.

**Combat Stances (Infantry)**
- **Assault**: Close engagement distance, offensive posture
- **Suppressive**: Area denial, increased suppression generation
- **Dig In**: Maximum defensive bonuses, reduced mobility

**Initiative & Experience**
Units with initiative 2-3 strike first in combat resolution. Veterans earn up to 5 experience stars, translating to measurable accuracy and damage improvements. Your elite airborne battalion *feels* elite.

---

## SUPPLY & LOGISTICS WARFARE

### Because Amateurs Talk Tactics, Professionals Study Logistics

**Dynamic Supply Network**
- **Pathfinding-based delivery**: Supply routes calculated with road vs. offroad cost multipliers
- **Range limitations**: Road supply extends 15 hexes, offroad only 8 hexes (with 2x cost penalty)
- **Supply sources**: HQ depots and logistics hubs provide finite supply points
- **Convoy mechanics**: Dedicated supply convoys with ammo/fuel capacity and unload rates

**Per-Turn Consumption By Unit Class**
- Infantry/Specialist: 1 ammo, 0 fuel
- Vehicles: 1 ammo, 2 fuel
- Tanks: 2 ammo, 3 fuel
- Artillery: 2 ammo, 1 fuel
- Air units: 2 ammo, 4 fuel
- Recon: 1 ammo, 2 fuel

**Attrition Mechanics**
Units out of supply lose 1 ammo and 1 fuel per turn. When completely depleted, they lose 1 strength step. Cut enemy supply lines and watch their offensive collapse. Defend your own logistics tail or pay the price.

**Resource Management**
- Daily faction production: 6 ammo, 8 fuel per turn
- Depot stockpiles with enforced capacity limits
- 50-turn historical ledger tracking supply expenditure
- Rations and spare parts tracked for campaign logistics

**Strategic Depth**
Supply isn't background bookkeeping. It's a parallel battlefield. Destroying enemy convoys, interdicting supply routes, and establishing forward depots are viable paths to victory. Your artillery battery is worthless when it runs dry on turn 8.

---

## TERRAIN & MOVEMENT

### Geography Shapes Tactics

**10 Terrain Types With Distinct Movement & Combat Effects**
- **Plains**: Open ground, 1 hex movement cost, minimal cover
- **Forest**: +4 defensive bonus, concealment for ambushes
- **Hill**: +3 defensive bonus, elevated firing positions
- **Mountain**: +5 defensive bonus, impassable to vehicles, infantry only
- **City**: +5 defensive bonus, urban warfare complexities
- **Marsh**: Movement penalty, poor tank country
- **River**: Crossing obstacles requiring fords or bridges
- **Road**: 0.5x movement cost multiplier for wheeled vehicles
- **Beach**: Landing zone terrain with unique mechanics
- **Sea**: Naval movement only

**Movement Profiles Matter**
- **Leg (Infantry)**: 2-3 hexes per turn on rough terrain, 1 hex on plains
- **Wheeled**: Road specialists (0.5x road cost), struggle offroad
- **Tracked**: Better offroad mobility than wheeled units
- **Air**: Unaffected by ground terrain, range-limited by fuel

**Zone of Control (ZoC)**
Units with ZoC trait impose 2-hex movement penalty when enemies attempt to disengage from adjacent hexes. Pin enemy forces and maneuver around them.

**Fuel Consumption By Terrain**
Roads cut fuel consumption in half (0.5x multiplier). Offroad tracked movement burns fuel at standard rates. Plan your mechanized thrusts accordingly.

---

## FORTIFICATION & ENGINEERING

### Prepared Defenses Win Battles

**Entrenchment System**
- 0-2 entrenchment levels per hex
- Each level provides 15% hit chance reduction
- Engineers build fortifications that persist throughout the battle

**Engineer-Built Structures**
- **Tank traps**: Directional obstacles blocking vehicle movement
- **Fortifications**: Hex-level or edge-facing defensive works (6 directional facings: NW, NE, E, SE, SW, W)
- **Cleared paths**: Progressive breaching through multiple depth levels
- **Dynamic degradation**: Fortifications take damage from concentrated fire

**Terrain Defense Bonuses Stack With Entrenchment**
Forest (+4) + Level 2 entrenchment (-30% enemy accuracy) = killing ground. Combined with suppression fire, prepared positions become nearly impregnable to frontal assault.

**Engineer Capabilities**
- **Entrench buster trait**: Bonus damage vs. fortified positions
- **Construction**: Build/destroy fortifications mid-battle
- **Enhanced mobility**: +2 hex movement for rapid redeployment
- **Breach operations**: Clear obstacles under fire

---

## AIR COMBAT & SUPPORT

### Three-Dimensional Battlefield

**Air Mission Types**
1. **Strike Target**: Direct ground attack on designated hex, resolves same turn
2. **Escort Bombers**: Fighter cover protecting strike packages from interceptors
3. **Combat Air Patrol (CAP)**: 1-turn duration patrol over designated zone
4. **Airborne Drop**: Transport infantry behind enemy lines

**Air-to-Air Interception**
- CAP flights intercept enemy strike packages
- Escort effectiveness reduces bomber attrition during interception phase
- Multiple CAP zones can engage same target (1 interception per flight maximum)
- Damage allocation: Bombers take losses, escorts degrade interceptor effectiveness

**Airbase System**
- Per-base sortie capacity (8 sorties base capacity)
- Squadron sizes: 12 fighters, 10 interceptors, 8 ground-attack, 6 bombers per wing
- Refit timers: Damaged wings require cooldown before next sortie
- Off-map staging: Aircraft maintain base assignment but operate range-limited

**Air Support Roles**
- **Strike**: Direct ground support against enemy hexes
- **Escort**: Fighter protection for bomber missions
- **CAP**: Defensive patrol protecting friendly sectors
- **Transport**: Airborne delivery behind enemy lines

Don't just request air support. Manage sorties, coordinate CAP coverage, plan escort-bomber packages, and deal with refit downtime. Air superiority is earned, not granted.

---

## ARTIFICIAL INTELLIGENCE

### An Opponent That Thinks

Four Star General's bot planner doesn't just react. It plans.

**Strategic AI Constants (50+ Weighted Parameters)**
- **Focus fire system**: Prioritizes damaged units (<50% strength) for efficient kills
- **Flanking awareness**: Bonuses for side/rear attacks with angle-of-attack calculations
- **Combined arms coordination**: Multi-unit attacks receive cooperation bonuses
- **Tactical positioning assessment**:
  - Defensive terrain seeking (+4 bonus)
  - Exposed position penalties (-3)
  - Masked approach bonuses (+6)
  - Lone advance penalties (-7)

**Unit-Specific Behavioral Profiles**
- **Artillery**: Maintains optimal range (max-2 hexes), danger penalty within 4 hexes of enemy
- **Infantry**: Prefers covered movement, exposed march penalties applied
- **Armor**: Unified front bonuses, penalties for overrunning support elements
- **Recon**: Spotting bonuses, cluster avoidance penalties, ideal screening distance 3-5 hexes

**Engagement Distance Awareness**
6-hex proximity engage radius triggers combat pivot. The AI doesn't stumble into contact—it establishes contact deliberately.

**Objective Optimization**
AI receives significant scoring bonus for occupying objectives: 45 points base + 5 per turn held. Expect contested objectives to stay contested.

**Difficulty Tiers With Mechanical Differences**

**Easy**
- 10% accuracy/damage penalty
- Lower damage weighting (2.5x vs. 3.5x)
- Reduced attack bonuses
- Basic tactical AI only—no advanced features

**Normal**
- Balanced tactical decision-making
- Standard damage weighting
- Some tactical AI features enabled
- No bonuses or penalties

**Hard**
- 10% accuracy bonus, 15% damage bonus
- Higher damage weighting (4.5x)
- Flanking coordination (1.2x bonus)
- Focus fire optimization (1.5x bonus)
- Full tactical AI suite:
  - Terrain quality assessment
  - Suppression chain optimization
  - Fire setup scoring for next-turn advantage
  - Retaliation risk calculation
  - Movement efficiency maximization

The Hard AI will flank you, suppress your support weapons, focus fire on weakened units, and coordinate multi-unit attacks. It will punish exposed salients and exploit gaps in your line. **You have been warned.**

---

## CAMPAIGN LAYER

### Theater-Level Command

**Strategic Map**
- **50×35 hex grid** at 5km per hex (250×175km theater representation)
- Historical setting: Central Channel sector (Operation Overlord framework)
- Tile types: Airbases, naval bases, logistics hubs, fortified positions, task forces
- Faction ownership determines supply generation and front lines

**Resource Dynamics**
- Controlled tiles produce daily ammo/fuel supplies
- Unit redeployment costs time (1 day transit per hex)
- VP-based victory tracking
- Economic constraints force meaningful force composition choices

**Operational Decisions**
- **Redeploy units**: Move formations between strategic locations
- **Launch offensive**: Queue tactical battles at contested front lines
- **Fortify positions**: Spend supplies improving defensive posture
- **Air/naval allocation**: Assign wings and fleets to sectors
- **Intel operations**: Spend resources revealing enemy positions

**Supply Generation**
Daily production from strategic installations. Lose your logistics hubs and watch your campaign grind to a halt. Capture enemy supply depots and sustain deep offensives.

**Day-Based Time Advancement**
Time measured in 3-hour segments (8 segments per 24-hour day). Operational planning on a realistic timeline.

---

## MISSION TYPES & SCENARIOS

### Escalating Challenge Through Progressive Unlocks

**Training Exercise**
Low-stakes familiarization emphasizing unit coordination and terrain assessment. No hostile contact expected. Learn mechanics without time pressure.

**Town Defense (Patrol Mission)**
Enemy battle groups push up the southern road net toward a northern town. Establish base camp inside the town perimeter, deploy reserves around crossroads, and break the assault before attackers force entry into the center. Expect strong combined-arms attack with armor, artillery, and recon screens.
- **Turn limit**: 25 turns
- **Victory**: Repel assault, maintain town control
- **Secondary**: Destroy all enemy forces

**River Crossing Watch (Flagship Patrol Mission)**
Enemy infiltrators mass along a river with three shallow fords cutting through the bend. If they slip across, they'll establish a lodgment before dawn. Deploy patrols to occupy and hold each crossing simultaneously.
- **Victory**: Hold ALL THREE fords with your forces for 8 consecutive turns
- **Defeat**: Enemy secures and holds any ford for 8 consecutive turns
- **Turn limit**: 11-14 turns (varies by difficulty: Easy 14, Normal 12, Hard 11)
- **Predeployed forces**: 2 rifle squads, engineers, recon bike patrol
- **Support assets**: 2 off-map artillery fire missions
- **Optional objectives**:
  - Destroy enemy comms team before it reaches central ford
  - Keep at least one recon unit alive

**Citadel Ridge (Assault Mission)**
Fortified ridge complex controls the only road into the sector. Enemy infantry dug in, bunker guns cover slopes, heavy AA batteries protect the rear. Assemble full assault group, break outer batteries, seize command ridge before defenders regroup.
- **Victory**: Capture command ridge + at least two additional strongpoints before turn limit
- **Defeat**: Turn limit expires before command ridge secured, or all friendly combat units destroyed
- **Turn limit**: 15-20 turns (varies by difficulty: Easy 20, Normal 17, Hard 15)
- **Unlock requirement**: 3 previous victories

**Western Europe Campaign**
Launch the grand offensive to liberate occupied territory and secure critical ports. Advance fronts, manage scarce resources, coordinate air support over multiple linked operations. Full strategic layer integration.

---

## VICTORY CONDITIONS & PACING

**Objectives-Based Gameplay**
- Capture and hold specific hexes for turn durations
- Simultaneous multi-objective requirements (e.g., hold three fords at once)
- Optional secondary/tertiary objectives affecting scoring

**Destruction-Based Scenarios**
Eliminate enemy combat effectiveness through attrition and focused fire

**Survival Challenges**
Hold defensive positions for specified turn counts under sustained pressure

**Time-Limited Pressure**
Turn caps create urgency. River Watch gives 11 turns on Hard difficulty—no margin for error. Citadel Ridge demands ridge capture within 15-20 turns depending on difficulty.

**Progressive Difficulty Gates**
Later missions unlock based on previous victories. Citadel Ridge requires 3 victories to unlock. Earn your command.

---

## COMMANDER SYSTEM

**General Bonuses Affect Entire Army**

Players select a general at mission start. Bonuses apply uniformly across all units:

- **Accuracy Bonus (accBonus)**: Directly modifies hit probability calculations
- **Damage Bonus (dmgBonus)**: Scales outgoing damage (0.01% per point)
- **Movement Bonus (moveBonus)**: Increases unit movement allowances
- **Supply Bonus (supplyBonus)**: Extends supply line range (+3 hexes base)

**Strategic Commander Choice**
Pick defensive doctrine general with supply bonuses for extended campaigns. Choose aggressive general with accuracy/damage bonuses for time-limited assaults. Your general matters.

**Persistent General Roster**
Maintain roster of multiple generals with individual stat blocks. Commission new generals with different regional/school backgrounds providing varied bonus profiles.

---

## REALISM & AUTHENTICITY

### Grounded in WWII Battalion-Level Tactics

**Realistic Timescale**
- **5 minutes per turn**: Reflects actual tactical tempo under fire
- **Movement speeds**:
  - Infantry: 3 km/h (250m per 5-minute turn)
  - Medium tanks: 9 km/h (750m per 5-minute turn)
  - Recon: 12 km/h (1000m per 5-minute turn)

**Authentic Equipment Ranges**
- Tank guns: 2-12 hex effective range
- Artillery: 12-60 hex range depending on caliber
- 250m per hex tactical scale (48px hex radius on-screen)

**Period-Accurate Unit Compositions**
- Infantry battalions: 720 personnel with organic support weapons
- Tank companies: 25 medium tanks per company
- Artillery batteries: 6-gun batteries standard
- Recon squads: 18 armored cars per unit
- Fighter squadrons: 12 aircraft standard wing strength

**Directional Armor Realism**
Medium tank: 15mm front / 8mm side / 4mm top armor. Heavy tank: 18mm front / 10mm side / 5mm top. Attack angles matter because they mattered historically.

**Supply Consumption Rates**
Tanks consume 3 fuel per turn. Artillery consumes 2 ammo per turn. Air units consume 4 fuel per sortie. These aren't arbitrary numbers—they reflect operational realities.

---

## TECHNICAL EXCELLENCE

### Built for Performance & Reliability

**Game Engine Architecture**
- Singleton GameEngine manages battle state with clean separation of concerns
- Modular combat resolver with pluggable unit profiles
- Dijkstra-based pathfinding for supply routing with terrain cost integration
- Full battle state serialization for mid-game save/load functionality

**Data-Driven Design**
- 35+ unit types defined in structured JSON with complete stat profiles
- Declarative scenario definitions for missions and campaigns
- Centralized balance constants in dedicated balance configuration
- Extensible trait system (7 trait types: ZoC, indirect, skirmish, entrenchBuster, suppression, intercept, carpet)

**Type Safety & Code Quality**
- Strict TypeScript throughout codebase—no `any` types
- Discriminated unions for faction and phase state management
- Readonly patterns for immutable game configuration
- Automated test coverage for battle flow, deployment, rendering, air support, campaign, and mission rules

**Visual Presentation**
- Hex-based custom canvas renderer (48px hex radius, axial coordinate system)
- Distinct terrain visualization for all 10 terrain types
- 34-point sprite rendering for units at tactical scale
- Frame-sequenced combat effect animations
- Road overlay visualization showing supply routes
- Campaign map with background image overlay and hex grid alignment

---

## USER EXPERIENCE FOR WARGAMERS

**Precombat Allocation Screen**
Requisition-based force composition. You have 5,000 points. Spend wisely. Do you bring two tank companies or one tank company plus artillery support plus engineers? Choices have consequences.

**Deployment Phase**
Hex-by-hex unit placement with base camp assignment requirement. Deployment zones sized by mission doctrine (20-hex frontage for River Watch). Position your forces before first contact—no do-overs.

**Battle Screen Multi-Panel Layout**
- Unit roster with real-time strength/supply status
- Command controls for movement, fire, stance, air support
- Status indicators for turn count, objectives, phase state
- Sidebar panels: Support, Logistics, General, Army, Recon, Supplies
- Activity log tracking turn-by-turn action history

**Keyboard Navigation**
Arrow keys for hex selection, Enter to confirm. Mouse optional. Built for desktop wargamers.

**Tooltip System**
Context-aware information display. Hover over terrain for defense bonuses. Hover over units for full stat blocks including current supply, experience stars, entrenchment level.

**Tutorial Coverage**
Training mission provides structured learning without punishing mistakes. Then the gloves come off.

---

## WHAT FOUR STAR GENERAL IS NOT

Let's be clear about what this game doesn't do:

❌ **No narrative handholding**: You won't get a cinematic story mode. Briefings explain the tactical situation. Everything else is emergent.

❌ **No simplified logistics**: Supply isn't an optional challenge mode you can toggle off. It's core gameplay. Deal with it.

❌ **No scripted AI**: The enemy doesn't follow predetermined patrol routes. It evaluates the battlefield and makes tactical decisions based on 50+ weighted parameters.

❌ **No abstracted terrain**: Hills actually provide elevation advantage for LOS and firing positions. Forests actually conceal units and penalize movement. Rivers actually block movement unless you cross at fords.

❌ **No forgiving difficulty**: Hard mode gives the AI +10% accuracy and +15% damage plus full tactical feature suite including flanking coordination and suppression optimization. If you want a challenge, you'll get one.

❌ **No unlimited resources**: Campaign supply generation is finite. Tactical mission ammo/fuel is finite. Plan accordingly or lose.

❌ **No casual mobile gameplay**: This is desktop wargaming software. Hex-based, keyboard-navigable, designed for 90+ minute tactical engagements.

---

## WHO SHOULD PLAY FOUR STAR GENERAL

### Target Audience: Hardcore Strategy Gamers

**You'll love this game if you:**

✓ Think Panzer General was too forgiving with supply
✓ Believe terrain should matter as much as unit stats
✓ Want AI opponents that actually flank instead of frontal-assault suicide
✓ Consider logistics a parallel battlefield, not a chore
✓ Appreciate WWII tactical realism over Hollywood spectacle
✓ Value emergent scenarios over scripted campaigns
✓ Prefer challenging difficulty over power fantasy
✓ Enjoy deep systems you can master over dozens of hours

**You probably won't enjoy this if you:**

✗ Want casual pick-up-and-play sessions under 20 minutes
✗ Prefer narrative-driven campaigns over sandbox tactics
✗ Find supply management tedious
✗ Expect to win first mission on Hard difficulty
✗ Want simple rock-paper-scissors combat without positioning depth
✗ Dislike hex-based wargames
✗ Need mobile/touchscreen support

---

## DEVELOPMENT STATUS & ROADMAP

**Current State: Advanced Playable Prototype**

What's fully implemented and playable now:
- ✅ Complete tactical battle engine with 35+ unit types
- ✅ Sophisticated AI with difficulty tiers (Easy/Normal/Hard)
- ✅ Full supply and logistics system with dynamic routing
- ✅ Air combat and support mission framework
- ✅ Fortification and engineering mechanics
- ✅ Campaign strategic layer with 50×35 hex theater
- ✅ 5 distinct mission types with progressive unlocks
- ✅ Commander system with general bonuses
- ✅ Complete precombat allocation and deployment workflow
- ✅ Mid-battle save/load serialization
- ✅ Comprehensive automated test coverage

**Flagship Mission: River Crossing Watch**
Currently the most polished vertical slice:
- Dedicated scenario with 20-hex deployment frontage
- Difficulty-specific turn limits (Easy 14, Normal 12, Hard 11)
- Multi-phase pacing system (probe, commitment, reserve pressure)
- Optional objectives with mission-end settlement
- Full briefing integration from landing screen through battle resolution

**Near-Term Polish Priorities (Per Commercial Polish Work Statement)**
1. Lock authoritative scale doctrine across all missions
2. Implement scenario validation gates (map size vs. weapon ranges, deployment capacity, objective spacing)
3. Finish mission routing for all scenario types
4. Expand deployment frontage system beyond flagship mission
5. Professional error UX (replace prototype alerts with in-panel messaging)
6. UI consistency pass across landing/precombat/battle/debrief screens
7. Performance optimization (reduce initial bundle size, improve chunking)

**Definition of Public-Demo-Ready**
According to project roadmap, first public build will be ready when:
- Flagship mission (River Watch) feels tactically coherent and intentionally authored
- Invalid scenario content fails validation before reaching players
- Mission routing is explicit and truthful (no fallback deception)
- Battle screen mission transitions never leak stale state
- Critical deployment errors presented clearly and professionally
- Landing-to-battle-to-debrief session is visually coherent
- App performs reliably on supported browsers
- First session strong enough to make new player want another mission

**What's Not Trying to Be**
Per development philosophy:
- Not trying to be "more complete" in abstract sense
- Not trying to polish every mission equally
- Not trying to add monetization before establishing product trust
- Not trying to appeal to casual mobile audiences

**Four Strategic Goals Driving Development**
1. **Accelerate playtesting and development**: Browser deployment enables rapid iteration
2. **Showcase professional work**: Communicate craft, taste, and systems depth
3. **Attract gamers to the site**: Trustworthy, readable, memorable first-time experience
4. **Create viable monetization path**: Only after trust, clarity, and replayability established

---

## TECHNICAL REQUIREMENTS

**Platform**: Modern desktop browsers (Chrome, Firefox, Edge, Safari)
**Input**: Keyboard + mouse (keyboard-only viable for core flows)
**Display**: Minimum 1280×720 resolution recommended for comfortable hex visibility
**Performance**: Canvas-based rendering, 60fps target for map pan/zoom
**Storage**: LocalStorage for save states and general roster persistence

**Build Status**
- ✅ `npm test` passes (comprehensive automated coverage)
- ✅ `npm run build` passes (production build functional)
- ⚠️ Production bundle size: ~657KB minified (optimization in progress)
- ⚠️ Campaign JSON chunking warning (static + dynamic import, being addressed)

---

## FOR DEVELOPERS & MODDERS

**Open Codebase Philosophy**
Four Star General is built with extensibility in mind:

**Data-Driven Unit Definitions**
All 35+ unit types defined in `src/data/unitTypes.json` with complete stat profiles. Want to add a new unit? Add JSON entry. No code changes required.

**Declarative Scenario Format**
Missions defined in scenario JSON files with:
- Map dimensions and hex grid layout
- Terrain type assignments per hex
- Deployment zone definitions
- Objective placement and victory conditions
- Predeployed unit rosters
- Supply depot locations

**Trait System Architecture**
7 extensible trait types: ZoC, indirect, skirmish, entrenchBuster, suppression, intercept, carpet. Add new trait, update combat resolver logic, done.

**Balance Constants**
Centralized in `src/game/balance.ts`:
- Base accuracy modifiers
- Armor penetration curves
- Suppression thresholds
- Initiative values
- Experience scaling factors
- AI behavioral weights

**Type Safety Throughout**
Strict TypeScript with no `any` types. Discriminated unions for game state. Readonly patterns for configuration. IntelliSense support everywhere.

**Modding Potential**
While not officially supported yet, the architecture enables:
- Custom scenarios via JSON authoring
- New unit types via data files
- Modified balance constants
- Alternative AI behavioral profiles
- Custom campaign maps

---

## COMMUNITY & FEEDBACK

**Current Status**: Pre-alpha playtest phase
**Feedback Channels**: GitHub issues at `https://github.com/anthropics/claude-code/issues` (placeholder—update with actual repo)
**Playtester Profile**: Experienced strategy gamers familiar with hex-based wargames, comfortable with complex systems, willing to report bugs and balance issues

**What Playtesters Should Focus On**
- Mission balance across difficulty tiers
- AI tactical behavior quality (does Hard AI feel challenging and fair?)
- Supply system pacing (too punishing? not punishing enough?)
- Deployment frontage adequacy for mission types
- UI clarity for critical information (objectives, supply status, unit condition)
- Performance issues on various browsers
- Tutorial coverage gaps (what wasn't explained well?)

**Not Currently Seeking Feedback On**
- Visual polish (acknowledged as prototype-level)
- Sound design (not yet implemented)
- Mobile support (out of scope)
- Additional mission types beyond current 5 (focusing on flagship mission first)

---

## THE PITCH

**Four Star General is for the wargamer who's tired of being underestimated.**

Tired of AI that frontal-assaults into your killzone.
Tired of logistics being optional flavor text.
Tired of terrain being cosmetic.
Tired of difficulty settings that just multiply HP.
Tired of "combined arms" meaning "bring one of each unit type."

This is battalion-level WWII tactics where:
- Your artillery runs out of ammunition mid-battle if you don't manage supply routes
- Enemy armor will actually flank your static defense line
- Prepared positions with engineers + entrenchment + terrain bonuses create realistic killing grounds
- Air support requires managing sortie capacity, CAP coverage, and refit downtime
- Hard mode AI receives mechanical bonuses AND improved tactical decision-making
- Deployment frontage matters because tactical space determines maneuver options

**No hand-holding. No fake difficulty. No abstracted logistics.**

**Just combined-arms warfare that respects your intelligence.**

---

## DOWNLOAD & PLAY

**Current Access**: Advanced playable prototype (browser-based)
**Installation**: None required—runs in modern browsers
**First Session Recommendation**: Start with Training Exercise, then attempt River Crossing Watch on Normal difficulty
**Expected Time Commitment**: 60-90 minutes for complete flagship mission playthrough

**Minimum Recommended Experience**
- Familiarity with hex-based wargames (Panzer General, Combat Mission, etc.)
- Comfort with complex UI and multi-panel information displays
- Patience for learning deep systems over multiple sessions
- Willingness to lose first few attempts while learning mechanics

**What to Expect First Session**
1. **Landing screen**: Select River Crossing Watch mission, choose general, set difficulty to Normal
2. **Precombat allocation**: Spend 5,000 requisition points building force (recommend: 2 infantry, 1 engineer, 1 AT gun, 1 recon, 1 howitzer battery)
3. **Deployment phase**: Place units along 20-hex western riverbank frontage, assign base camp
4. **Battle**: 12 turns to achieve simultaneous control of all three fords for 8 consecutive turns
5. **Debrief**: Review objective status, casualties, supply expenditure

**If you succeed on Normal difficulty first try, immediately replay on Hard.**

If you fail on Normal difficulty, analyze:
- Did you run out of ammunition? (Supply management issue)
- Did enemy flank your static positions? (Deployment positioning issue)
- Did you lose too many units to focused fire? (Combined arms coordination issue)
- Did you fail to contest all three fords? (Objective prioritization issue)

Then adjust and try again.

**That's wargaming.**

---

## CLOSING

Four Star General doesn't want to be the biggest WWII game.
It doesn't want to be the prettiest WWII game.
It doesn't want to be the most accessible WWII game.

**It wants to be the most tactically honest WWII battalion command simulator you can play in a browser.**

If that's what you're looking for, you just found it.

---

**FOUR STAR GENERAL**
*Real tactics. Real logistics. Real challenge.*

**Current Version**: Advanced Playable Prototype
**Platform**: Desktop browsers (Chrome/Firefox/Edge/Safari)
**Genre**: Hex-based tactical wargame
**Setting**: WWII Western Europe (Operation Overlord framework)
**Complexity**: High (hardcore strategy audience)
**Session Length**: 60-90 minutes (flagship mission)

**Development**: Ongoing (see Commercial Polish Work Statement for roadmap)
**Status**: Playable vertical slice ready for experienced wargamer feedback

---

*Document Version: 1.0*
*Last Updated: 2026-04-18*
*Audience: Strategy gamers, wargaming community, experienced tactical game players*
