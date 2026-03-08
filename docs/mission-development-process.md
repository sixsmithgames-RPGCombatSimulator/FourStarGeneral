# Mission Development Process (AI Dev)

This is the living process for creating and implementing missions using `docs/four_star_general_mission_creation_agent_spec.md` as the design authority. Tweak over time as tools and code evolve.

## Phase 1 — Design the Mission Package (per spec)
1) **Classify the mission**: type (training/patrol/assault/campaign/custom), role, identity, player fantasy.
2) **Clarify constraints upfront**: identity, limitations (time/terrain/resources), budget/resources, win/lose conditions, unit availability caps.
3) **Map design package**: theater, size class/footprint, terrain palette, landmarks, cover/LOS, chokepoints/alternates, elevation, mobility/roads, deployment edges, weather/visibility.
4) **Objective package**: primary/secondary, placement logic, victory/defeat conditions, turn pressure, hold/capture logic, hidden hooks if any.
5) **Force composition**: allies/enemies by role tags, quality, reserves, reinforcement logic, support assets, difficulty scaling axes.
6) **Deployment**: start zones, first-contact expectation, spawn safety, neutral/civilian zones, ambush/fog if used.
7) **AI behavior**: doctrine, aggression/defense profile, reserve triggers, fallback/counterattack rules, objective priorities, support usage, difficulty variants.
8) **Pacing/escalation**: opening, midpoint shift, climax, reinforcement/event timings, duration target, recovery opportunities.
9) **Difficulty tuning**: easy/normal/hard/veteran adjustments using pressure/quality/timing/support, not just volume.
10) **Narrative/UI copy**: landing briefing, precombat summary, commander’s intent, expected resistance, terrain summary, objective summary, victory/failure debrief.
11) **Technical integration notes**: mission key, metadata additions, routing/precombat needs, loader/scenario hooks, tutorial needs, persistence, test hooks.
12) **QA/validation**: objective counts, unit count ranges, landmark zones, first-contact window, victory/defeat tests, edge cases, regression risks.

## Phase 2 — Register Metadata & Registry
1) **Mission key**: add to `MissionKey` union in `src/state/UIState.ts` if new.
2) **Title/briefing**: add to `src/data/missions.ts` and ensure `getAllMissionKeys()` returns it.
3) **Summary fallback**: add mission entry in precombat summary fallbacks (objectives, turn limit, doctrine, supplies) so UI renders meaningful copy when no dynamic data.
4) **Scenario registry**: map missionKey → scenario source in `src/data/scenarioRegistry.ts`.
5) **Availability**: update gating in `LandingScreen.getMissionsForGeneral` (or mission eligibility module) to place it in the right tier.
6) **Routing**: branch in `LandingScreen.handleMissionSelection` if non-standard (e.g., campaign/custom). For patrol/assault/training use existing precombat flow.

## Phase 3 — Scenario Data and Map
1) **Create scenario file** (JSON today):
   - Tile palette and layout; allow string tile keys or `{ tile: ... }` entries.
   - Objective zones/IDs (e.g., `ford_north`, `bridge_rubble`). Use [col,row] tuples.
   - Deployment zones (allied/enemy) with [col,row] tuples and capacity/faction.
   - Weather/visibility flags if used.
   - Pre-deployed units set `preDeployed:true` for starting forces.
2) **Tag objectives** with their types and control/hold logic per design (e.g., hold-for-N-turns clusters).
3) **Document coordinates/zones** for QA (align with spec’s QA section).

## Phase 4 — Forces and Phasing
1) **Define force packages** in scenario data or loader hooks using role tags mapped to actual units.
2) **Set reinforcement/reserve timing** per pacing plan.
3) **Implement difficulty scaling** knobs (quality, timing, support, strictness) per design.

## Phase 5 — Objective and Win/Loss Logic
1) **Implement control rules** (e.g., hold for N turns) in scenario scripting or mission controller.
2) **Wire secondary objectives** with clear flags for UI/QA (e.g., destroy comms team, keep recon alive).
3) **Set turn limits and fail conditions** consistent with design.

## Phase 6 — AI Behavior Hooks
1) **Configure AI parameters** to match doctrine (probe/harass vs. entrench/counterattack).
2) **Add triggers** for reserves, fallbacks, counterattacks, and objective reprioritization.
3) **Support usage**: smoke/artillery behaviors aligned with mission role.

## Phase 7 — Precombat/Battle Integration
1) **Precombat summary**: ensure mission copy appears; surface objectives/conditions if UI supports it; ensure fallback entry exists for the mission.
2) **Tutorial toggles**: only enable if mission calls for it (training/mission-specific overlays).
3) **Battle/precombat scenario selection**: refresh scenario via registry using missionKey before rendering/engine init.
4) **Battle loader**: point to the scenario file; ensure allocation/deployment lists respect mission-specific caps.

## Phase 8 — Copy and Localization
1) **Verify UI copy** matches design: landing briefing, precombat text, objective labels, debrief strings.
2) **Keep copy truthful** to terrain/objectives/resistance.

## Phase 9 — QA Hooks and Tests
1) **Author test cases**: victory/defeat paths, objective timers (e.g., hold-for-N), reinforcement triggers, difficulty deltas.
2) **Add automated checks** where possible (e.g., registry resolves missionKey → scenario; summary fallback exists; objective count/zone presence; spawn safety assertions).
3) **Manual checklist**: first contact timing, spawn safety, LOS sanity, objective placement, copy accuracy.

## Phase 10 — Traceability and Review
1) **Document changes**: mission key, scenario file, routing/gating edits, logic changes.
2) **Risk callouts**: new logic paths (e.g., hold-for-N-turns), AI trigger complexity.
3) **Verification log**: list tests run (unit/automated/manual scenarios) before PR.

## Maintenance Notes
- Treat this file as living: update steps when mission format or engine hooks change.
- Keep parity with `four_star_general_mission_creation_agent_spec.md`; that spec is the design authority.
- When adding new mission-type standards or routing modes, append guidance here.
