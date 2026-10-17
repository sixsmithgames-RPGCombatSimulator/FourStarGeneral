# Mission correctness audit — 15 October 2026

## 17 October follow-up

Subsequent review found terminal reporting inconsistencies in Pointe du Hoc and Citadel Ridge that the original outcome-only checks did not catch. See [the gameplay-quality follow-up](GAMEPLAY_QUALITY_FOLLOWUP_2026-10-17.md) for the current repair, regression and deployment receipt. Original results below remain historical evidence, not primary-objective/debrief parity checks for elimination victories.

## Intent and scope

Validate every registered authored mission against the same normalization, movement, deployment, and mission-rule contracts used in play. Fix proven contradictions without changing mission difficulty or inventing new victory conditions. The campaign registry entry is a seed map; generated campaign engagements require their separate campaign tests and live certification.

Source scope: `src/data/missions.ts`, authored scenario data, scenario validation, `src/state/missionRules.ts`, and mission/scenario regressions. No animation, combat, AI heuristic, or UI implementation changes belong to this slice.

## Findings before implementation

1. **Hold counters advance when a battle is loaded.** River Crossing Watch and Pointe du Hoc increment their consecutive-turn counters on every status evaluation. BattleScreen evaluates after save hydration, and several faction phase notifications can occur within one numbered round. Intended behavior is one hold check per player-round boundary, with that boundary serialized; re-evaluating a saved round must not award another turn.
2. **River Crossing Watch awards a false victory.** Its briefing explicitly requires all three fords simultaneously for eight consecutive turns. The timer branch nevertheless awards victory at turn 12 even with no occupied ford. Expected behavior is defeat when the published primary objective is unmet at the deadline; elimination victory remains available.
3. **Gela gives conflicting tertiary orders.** Precombat says to silence flak/artillery; the live mission controller checks engineer survival. Use the live engineer-survival condition consistently in the precombat summary.
4. **Town Defense starts over the stacking limit.** Three SP artillery units occupy hexes already containing two combat formations, at offset coordinates 4,15; 5,15; and 2,15. Move only the surplus artillery into valid nearby unused rear tiles, retaining the same enemy force and combat statistics.
5. **Scenario validation does not inspect units.** It validates side HQ coordinates but accepts unknown unit types, off-map formations, invalid strengths, hostile overlap, and illegal combat stacks. Add exact actionable placement errors so authored data cannot reintroduce these faults silently.
6. **Other briefing drift.** Town Defense promises an untracked secondary objective although its established scoring controller and regression intentionally expose one primary order. Arnhem omits engineers from its eligible survival formations. River Watch understates its predeployed force. Match these descriptions to the existing rules and roster.
7. **River Watch does not record comms arrival.** Destroying the enemy recon bike after it occupied the central ford still completes the explicit before-arrival secondary. Persist observed arrival so later destruction cannot reverse the failure.
8. **Inherited properties pass the mission-key guard.** `constructor`, `toString`, and `__proto__` are accepted by an `in` check despite not being registered missions, leading to a downstream crash. Check own properties and preserve the registry's actionable unknown-key error.

## Impact and risk

Mission status feeds objective markers, mission-end dialogs, campaign handoff, saves, and debriefs. Hold counters sample objective occupancy once at each numbered player-round boundary; they do not measure continuous control between actions. Old serialized counter states adopt their first restored boundary without awarding a hold tick. Present malformed, negative, or future markers fail explicitly; terminal mission counters stay frozen. River Watch timeout behavior intentionally changes a false win to the already advertised failure condition. Town Defense artillery moves within the rear deployment area, changing initial lines of fire slightly; no units are added or removed. Scenario validation and engine entry rules share `src/core/Stacking.ts` for capacity and supply-truck exemptions. Undeployed player reserve placeholder positions are not counted as live stacks.

## Catalog inventory

| Mission | Map | Turns | Initial Player / Bot / Ally | Objectives |
| --- | --- | ---: | ---: | ---: |
| Training | Coastal Push, 20×16 | 8 metadata / 20 seed | 0 / 10 / 1 | 3; tutorial-owned completion |
| Town Defense | 20×16 | 25 | 0 / 49 / 4 | 1 |
| River Crossing Watch | 14×12 | 12 | 6 / 9 / 0 | 3 |
| Pointe du Hoc | 16×14 | 20 | 0 / 15 / 0 | 3 |
| El Alamein | 30×20 | 20 | 10 / 12 / 0 | 4 |
| Kasserine Pass | 26×20 | 16 | 8 / 16 / 0 | 4 |
| Gela Landings | 28×18 | 18 | 6 / 16 / 0 | 4 |
| Anzio Beachhead | 30×20 | 18 | 9 / 11 / 0 | 4 |
| Monte Cassino | 28×22 | 20 | 9 / 11 / 0 | 4 |
| Omaha Beach | 30×18 | 20 | 7 / 18 / 0 | 4 |
| Carentan | 26×18 | 18 | 7 / 14 / 0 | 4 |
| Arnhem Bridge | 30×18 | 18 | 8 / 11 / 0 | 4 |
| Falaise Pocket | 30×22 | 20 | 10 / 12 / 0 | 4 |
| Hurtgen Forest | 28×22 | 20 | 9 / 12 / 0 | 4 |
| Citadel Ridge | 24×18 | 17 | 0 / 25 / 0 | 4 |
| Bastogne | 28×22 | 18 | 11 / 19 / 0 | 4 |
| Remagen | 30×20 | 18 | 6 / 16 / 0 | 4 |
| Two Bridges | 20×16 | 20 | 7 / 11 / 0 | 4 |
| Campaign registry seed | Coastal Push, 20×16 | Unbounded runtime | 0 / 10 / 1 | 3; replaced by generated engagements |

Initial counts above are authored formations, before engine-provided logistics or player requisitions. Every map has a player deployment zone, registered tile coverage, valid objective spacing, and distinct authored terrain. Only campaign deliberately shares the training seed map.

## Verification plan

- Registry-wide validation and normalization of all 19 keys.
- Canonical terrain traversal from player deployment zones to every objective, including ford and bridge feature overrides.
- Engine initialization, deployment, legal movement, and a complete enemy/player round on every authored tactical map.
- Authored victory, timeout/critical-objective loss, elimination, and saved-state resolution checks through the mission controller.
- Duplicate-round, faction-phase, and save/resume regressions for both hold missions.
- Invalid-unit and illegal-stack fixtures proving validation rejects corrupt scenario sources.
- Parent task runs the combined test suite, lint/build gates, and visual/audio checks. This slice must not overwrite existing `dist-tsc-jest` artifacts.

## Known certification limits

Deterministic scenario checks establish reachability and rule outcomes; they do not establish that every mission is fairly balanced against a skilled human or that all authored narrative events occur visually. Live complete-game playthroughs and subjective difficulty assessment remain distinct evidence requirements. Training completion is driven by the tutorial and must not be certified solely from the generic mission controller.

**Comms-transit correction:** The snapshot-only arrival check missed a comms team traversing the central ford and leaving it within one bot round. The mission controller now offers an optional typed movement-observation capability, consuming only engine-committed unit type and full axial route. River Watch records a sticky arrival flag before the next status evaluation; duplicate observation is harmless. Conventional play must read a cloned, non-consuming pending bot summary before the synchronous turn-status evaluation, and initiative play must supply its committed route before presentation awaits. These hooks belong to the concurrent engine/presentation integration slices. Both modes retain the same serialized arrival flag. Other unit types, paths missing the central ford, and observations after terminal resolution have no effect. The risk is evaluation ordering, especially movement followed by destruction in the same activation or final round; integration regressions must cover both hooks before mission finalization. Snapshot occupancy remains legacy-compatible evidence, not a separate rule. Old saves cannot reconstruct unrecorded past arrivals. Hold clocks still intentionally use round-boundary observations, not continuous occupancy.

Authored goal/strategy strings are narrative metadata, not executable per-mission bot policies. The enemy planner consumes objectives, visibility, legal movement, fuel, weapon opportunities, and difficulty. Narrative phrases about reserves, naval support, relief, or demolition are not proof of an implemented scripted event. This audit does not certify every narrative event as simulated.

## Executed results

- Independent compilation to ignored `tmp/mission-audit-20261015`: passed.
- Targeted ESLint for mission/data/rule/test edits: passed, zero warnings.
- Focused mission and existing rule/validation harness: **68/68 passed** before the additional cross-review logistics regression.
- All **18 authored maps**: scenario validation, canonical normalization, finalized deployment zones, real affordable infantry reserve deployment, accepted player movement, objective terrain connectivity through the engine's pathfinder, complete heuristic enemy/player round, and identical unit snapshots after saved-round replay passed.
- All **17 non-tutorial authored missions**: scripted legal-rule victory, unmet deadline defeat, and elimination resolution passed. Every one also advanced through real enemy turns to a natural terminal result with a passive player. No mission remained in progress after its deadline.
- Passive natural outcomes from the **15 October 2026 focused run before final bot ordering/performance corrections** (deliberately not a competent-player balance test): Town Defense defeated on turn 7; River Watch 12; Pointe du Hoc 20; El Alamein 20; Kasserine 14; Gela 12; Anzio 18; Monte Cassino 20; Omaha 20; Carentan 18; Arnhem 3; Falaise 20; Hurtgen 20; Citadel Ridge 17; Bastogne 5; Remagen 18; Two Bridges 20. All were defeats, as expected for an idle or severely under-purchased force. These are dated observations, not invariant balance targets: final bot ordering can change the exact loss round. The final combined suite verifies natural resolution by each deadline, not unchanged passive-game loss turns.
- Briefing/live tier-count parity, Gela/Arnhem exact tertiary-order parity, unknown inherited mission names, invalid units, hostile overlaps, over-capacity stacks, hold duplicate/phase/reload behavior, legacy migration, corrupt save rejection, terminal counter freeze, and comms arrival persistence passed.
- Cross-review initiative logistics regression: **1/1 passed** after the bot integration correction. Two real `botTurn` round completions each produce exactly one Bot supply-history entry and replenish a stranded armored formation. Individual truck and tank activations produce no extra supply ticks. This protects the single round-boundary logistics authority; the engine correction belongs to the bot integration slice.
- Comms arrival/transit rules: **3/3 passed** after the follow-up correction, including intermediate-hex arrival followed by destruction, duplicate observation, save/resume equivalence, unrelated formation/routes, empty movement, and frozen terminal truth. Independent compilation and targeted ESLint passed again. Parent-owned conventional/initiative integration regressions remain the evidence for event ordering across layers.

Evidence log: `tmp/mission-audit-20261015/focused.log`. Parent task owns final combined suite, architecture/build gates, initiative-mode regression integration, and browser/visual/audio certification. No tracked generated files were changed by this mission slice.

Focused reproducible command after compilation: set `TEST_FILTER` to `MISSION_CATALOG|MISSION_HOLD|MISSION_RIVER|MISSION_PRECOMBAT|MISSION_REGISTRY|MISSION_INITIATIVE|missionRules|SCENARIO_VALIDATION` and execute the compiled `tests/index.js` using `tools/resolve-js-extension-loader.mjs`. Do not run the destructive Jest script against user-owned `dist-tsc-jest` artifacts.
