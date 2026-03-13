# Flagship Mission Audit Matrix - River Crossing Watch

## Decision

`River Crossing Watch` is the current flagship public-demo mission candidate.

## Why this mission

- It already has a dedicated scenario file: `src/data/scenario_river_watch.json`
- It already has dedicated mission design documentation: `docs/missions/river-crossing-watch.md`
- It already has mission-specific routing and validation hooks in runtime code
- It already received recent frontage and deployment hardening, making it the strongest current showcase base

## Audit matrix

| Mission package area | Current implementation state | Status | Notes / next step |
| --- | --- | --- | --- |
| Mission identity | Present in `src/data/missions.ts` and `docs/missions/river-crossing-watch.md` | Partial | Title and briefing are aligned at a high level, but commander-intent and debrief copy are not yet surfaced as a finished package |
| Unlock and routing definition | Mission key `patrol_river_watch` is wired through `UIState`, `LandingScreen`, `scenarioRegistry`, `PrecombatScreen`, and `BattleScreen` | Complete | Routing is already distinct and reliable enough for a flagship baseline |
| Gameplay role | Patrol identity is documented as ford denial / infiltration interdiction | Partial | Runtime play still lacks stronger contact-discovery and escalation behaviors that differentiate Patrol from Assault-lite |
| Map design package | Dedicated 14x12 river map with ford tiles, hamlet, hills, rubble bridge, and west-bank deployment line | Partial | Core terrain logic exists, but the executable scenario is still a reduced version of the richer authored map fantasy in the mission doc |
| Objective package | Runtime scenario has 3 ford objectives and a 12-turn limit; precombat summary mirrors the intended primary/optional goals | Partial | The actual 4-turn foothold hold logic, comms-team kill objective, and recon-survival objective are not yet implemented in battle outcome logic |
| Force composition package | Runtime scenario currently fields a small predeployed player/bot roster | Gap | Current roster does not yet match the documented patrol package, reinforcement waves, or support-asset expectations |
| Deployment package | Strongest currently implemented area: dedicated player/bot zones, widened player frontage, shared finalized geometry, validation coverage | Strong | Keep as the model baseline for the flagship mission |
| AI behavior package | Scenario contains goal/strategy strings only | Gap | No mission-specific reserve triggers, ford-priority doctrine, or escalation rules are implemented yet |
| Pacing and escalation package | Mission doc defines probe -> synchronized push -> reserve pressure arc | Gap | Runtime mission currently lacks phase triggers, timed reinforcements, and climax logic |
| Difficulty tuning package | Mission doc defines Easy / Normal / Hard expectations | Gap | Runtime mission currently exposes no mission-specific difficulty variants for River Crossing Watch |
| Narrative and UI copy package | Landing and precombat copy partially reflect the mission doc | Partial | Need commander intent, expected resistance, terrain summary, objective summary, and debrief victory/failure copy aligned into one cohesive package |
| Technical integration notes | Mission key, scenario registry, validation profile, and precombat summary all exist | Partial | Still missing explicit mission-state logic for foothold tracking, optional objective completion, and debrief outcome composition |
| QA and validation package | Scenario validation and deployment planner regressions exist | Partial | Need mission-specific tests for ford-hold victory/defeat, optional objectives, escalation triggers, and debrief messaging |

## Highest-value current strengths

- Dedicated authored scenario and mission doc already exist
- Flagship deployment frontage is materially better than before
- Battle and precombat now share the same finalized deployment geometry
- Mission selection and scenario routing are explicit and stable

## Highest-risk current gaps

- The documented primary objective is not yet enforced as actual gameplay logic
- The documented optional objectives do not yet exist in mission-state tracking
- Force composition and pacing are much thinner in runtime than in the authored package
- Debrief quality is still generic rather than mission-specific
- Difficulty variants are documented but not implemented

## Recommended implementation order

1. Implement mission-specific objective state for ford foothold control and optional River Crossing Watch checks.
2. Expand the runtime force package and event pacing to match the authored patrol identity.
3. Add mission-specific debrief outcomes and commander-intent copy.
4. Add focused mission QA coverage for victory, defeat, escalation, and optional objectives.

## Public-demo readiness verdict

`River Crossing Watch` is the correct flagship candidate, but it is **not yet a finished public-demo vertical slice**. It is currently the strongest mission foundation because its identity, map, routing, and deployment package are more mature than the rest of the mission set.
