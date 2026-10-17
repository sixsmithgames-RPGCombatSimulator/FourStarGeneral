# Enemy bot correctness audit — 15 October 2026

## 17 October compatibility-path clarification

The subsequent [Simple compatibility repair](GAMEPLAY_COMPATIBILITY_REPAIR_2026-10-17.md) addresses stable stacked actors, observable targets, canonical movement/fuel and stale post-combat state publication without changing the API default or Heuristic policy. That report owns its verification and release status. Autonomous Ally limitations below remain open and are not included in the Simple repair.

Normal newly started UI battles explicitly configure Heuristic and transfer every allied formation to Player before initiative initialization. The Simple and autonomous Ally defects discussed below are compatibility-path limitations, not the active enemy policy. No affected older production save was found during review. The [gameplay-quality follow-up](GAMEPLAY_QUALITY_FOLLOWUP_2026-10-17.md) adds catalog-wide handoff regression coverage without changing a strategy, API default or executor; that report owns current verification and deployment status.

## Intent and evidence before changes

The enemy should challenge the player through legal, purposeful decisions using the same movement and combat rules as the player. Tests must exercise committed engine behavior as well as planner scoring.

Observed in the starting revision:

- `BotPlanner.computeReachableHexes` traverses every friendly occupied hex, including a full stack, but excludes every friendly occupied destination. `GameEngine.executeHeuristicBotTurn` rejects every occupied destination and stops on every occupied intermediate hex. The player already uses available stack capacity. This is three incompatible interpretations of one movement rule.
- The planner calls terrain movement cost without the prior hex. Engine execution supplies it. Edge-dependent roads and crossings can therefore be priced differently during planning and execution.
- `GameEngine.plannerMovementAllowance` supplies at least five movement points and otherwise five times the unit definition, independently of currently available action state and fuel. Plans can expect a shot from a location the committed move cannot reach.
- `buildPlannerInputFor` supplies all opposing units and scenario-authored objective ownership. These deserve integration checks against visibility and current objective control.
- The initiative adapter requires engine methods that the actual engine does not expose. The production initiative integration consequently uses its separate fallback behavior. The unused advanced planner also matches coordinate action keys to unit IDs, so its advertised lookahead is not evidence of production intelligence.
- `calculatePressureDamagePotential` still multiplies the optional legacy top-level `ap` field directly. Shipped formations use canonical weapon definitions without that legacy field. Against armor, this creates a NaN score and the public finite-score guard drops the unit's plan, silently disabling a useful march. The other threat-scoring site already treats absent legacy AP as zero; apply that same optional-stat semantics here and prove shipped formations continue advancing.

## Scoped planned behavior change

Add an optional authoritative entry predicate to the planner map contract and forward the previous hex to movement-cost callbacks. When the engine supplies entry legality, reachable destinations and transit obey that same predicate. Keep the standalone planner contract compatible for existing callers without an entry provider. The production integration must provide the predicate; it is not a substitute engine rule.

Add deterministic regression cases for one-friendly transit/entry, full-stack and hostile blocking, edge-dependent movement cost, and tactical challenge behavior at each difficulty. During the audit, the coordinating agent transferred exclusive ownership of the GameEngine and initiative integration changes into this workstream. The implementation removes the displaced dead adapter and its fallback execution path; it does not introduce a second strategy system or perform an unrelated structural refactor.

## Impact, edge cases, and risk

Consumers are conventional heuristic turns, initiative activations, the existing allied executor, air tasking, and mission/presentation observers. Combat damage formulas are unchanged. Movement and firing choices change to match executable rules. Activation events gain optional stable attacker identity and the actual committed route. Risks include allowing an invalid friendly endpoint, omitting an otherwise reachable lane, changing action budgets, and making existing standalone planner fixtures accidentally depend on a new callback. Tests cover callback decisions independently from the coarse occupancy map and pass source coordinates through each path edge. Allied planning deliberately retains its executor's existing empty-hex endpoint restriction; it does not advertise unsupported stacked moves.

## Implemented corrections

- Both conventional and initiative enemy combat call the same typed engine planning boundary. Each committed action rebuilds knowledge and occupancy before the next decision. Stable unit IDs identify stacked actors throughout planning, movement, supply synchronization, firing and digging in.
- Engine-provided reachability prices entering edges, honors full versus spare friendly stacks, remaining movement and fuel, and follows the same limbered transport costs as Player movement. A deployed gun pays hookup before moving and cannot fire afterward. Missing initial movement credit is materialized and debited; repeated activations cannot recreate free movement.
- Player and Bot share the movement-before-fire and attack-count readiness calculation, including experience scaling. Final review found and corrected a pre-existing Player→Bot commander-mobility leak: each movement consumer now requires the acting faction, preserves saved Player bonuses, and reads Bot/Ally bonuses from their existing side generals. Seven asymmetric regressions fail before and pass after the repair; the combined frozen candidate passes all integrated non-browser gates and its complete browser matrix (484 passed, 35 intentional skips, zero failures). Live certification remains outstanding; see the coordinating gameplay audit. Bot suppression and tow readiness also gate candidate attacks. Bot dig-in consumes the action rather than allowing repeated free entrenchment.
- Opposing tactical identities/locations and air targets are restricted to existing current spotting rules. Planning occupancy and entry checks exclude unseen hostile blockers; committed movement still rejects physical collisions. Flak and CAP risk estimates, escort/CAP availability checks, observer support leverage and newly occupied objective scoring exclude unobserved contacts. Air-operation observation requires an actual airborne mission and uses its target/patrol center (or aircraft hex when no center exists). Real hidden defenses still intercept normally; only the bot's estimate is filtered. Secret reserves and queued orders do not grant intelligence.
- Initiative round completion now services Bot supply exactly once and refreshes Bot movement/actions, suppression, flak and sentry state. Individual combat/truck activations never run a supply tick. The existing once-per-round enemy-air scheduler remains active.
- Initiative attack events consume the canonical activation summary, including stable participants and the first actual counterfire actor. Partial-error diagnostics compare stable report IDs instead of report count; the 50-entry rolling ledger cannot silence later attacks. Committed movement paths survive into presentation even when the actor is destroyed after moving. A detached, non-consuming `peekBotTurnSummary()` lets synchronous mission evaluation observe conventional routes without stealing playback data.
- Automated Player logistics now checks the actual next-step fuel cost before any occupancy, supply, credit or action mutation. Empty convoys hold instead of moving for free.

Affected files: `src/game/GameEngine.ts`, `src/game/GameEngineInitiativeIntegration.ts`, `src/game/bot/BotPlanner.ts`, `src/game/bot/InitiativeBotIntegration.ts`, `src/game/battle/combat/BattleAttackOutcomeProjection.ts`; focused tests in `BotTargeting.heuristic`, `BotPlanner.finiteScores`, `BotAirHeuristic`, `BattleAttackerPreparation` and `BattleAttackOutcomeProjection`. The coordinating workstreams own shared stacking policy, mission transit evaluation and presentation consumers.

## Verification and limitations

Historical isolated sweep after identity and fog corrections: `TEST_FILTER='^BOT_|BATTLE_ATTACK|AIR_|AIRBORNE|AIRSUPPORT|AIR_INTERCEPTION|TOW|MOVEMENT|SUPPRESSION|SENTRY|SUPPLY|INITIATIVE'` passed **240/240**. Whole-project isolated TypeScript compilation and scoped ESLint passed with zero errors/warnings. That source was frozen for the coordinating agent's integrated checks, but the freeze has since been released for the commander-faction correction. These results do not prove faction-isolated commander bonuses. Engine size at that boundary was 17,945 lines, below the released 17,983-line ceiling; the coordinating agent owns the final tightened baseline. The only approved additive ceiling was the nine-line outcome identity contract described below. No combat/RNG numeric assertion was relaxed.

### Presentation identity follow-up (intent and impact)

Stacked units revealed a final identity loss at the resolved-combat boundary: canonical report snapshots carried unit types/hexes but omitted the already-captured stable IDs; conventional Bot summaries omitted those IDs too. After a casualty or assault displacement, a renderer cannot safely reconstruct the actor from the current primary occupant. The bounded change adds optional report attacker/defender IDs and summary attacker/defender IDs from the existing pre-mutation unit snapshots. The existing outcome projection remains the sole owner of attack summaries.

Aggregate Bot counterfire additionally needs its actual first retaliator, which can differ from the selected primary defender in a mixed stack. Capture that actor together with the existing representative retaliation result, and project optional counterfire attacker ID/type. Reports keep their primary-defender retaliation meaning. Normal initiative presentation adapts the returned canonical summary, avoiding the primary-only report limitation; report-ID deltas remain available for partial-error diagnostics. Player target-rich results already enumerate actual retaliating defenders with their IDs/types. No accuracy, casualties, ammunition, action consumption, RNG ordering, or actor-selection rules change. Real transaction hashes necessarily change when metadata is added; old numeric assertions remain fixed and the legacy payload with only new metadata removed must retain its old signature.

### Fog counterfactual follow-up (intent and risk before changes)

Independent review found that filtering enemy snapshots alone was insufficient: the planner's entry callback still consulted unobserved hostile occupancy and silently routed around hidden blockers. Keep one canonical stack-capacity rule, with an optional hostile-observation predicate for planning; committed execution continues checking every real occupant. Counterfactual maps differing only by an unseen enemy must produce identical reachable routes and actor plans. Known friendly capacity and observed hostile blocking remain authoritative.

Purchased Player aircraft remain in reserves, so excluding secret reserves from capability checks also removed legitimate CAP responses to visible strikes. Restore responses to observed in-flight/resolving strikes without reading secret reserve inventory, queued orders, or historical reports (current visibility cannot establish past observation). No persistent intelligence subsystem is introduced. Zero-duration strikes require initiative round completion to launch Player sorties before Bot air planning, matching conventional chronology; advance the Player lifecycle exactly once, then resolve both sides together. Tests must use actual reserve scheduling and both round-completion branches, verifying secret inventory/queued orders and unseen active strikes do not trigger CAP, but observed airborne operations do. The principal risk is confusing private intentions with observed combat or double-advancing mission timers.

The combat identity follow-up adds exactly nine lines to `BattleAttackOutcomeProjection.ts` for optional canonical participant metadata and actual representative counterfire identity. This is a reviewed additive schema extension, not a generalized architecture-budget exemption. Original combat/RNG transaction signatures are retained after stripping only those new identity fields, alongside new full-payload signatures.

The actual reserve-flight tests cover conventional, initiative and Ally round completion, including exactly one arrival per squadron, one resolved strike report and a fresh one-round patrol retaining its full timer. The common air-observation predicate also excludes queued CAP missions from both escort selection and strike-risk scoring; a real launch makes the same visible patrol detectable. An unobserved strike remains unknown even if a scout later visits its target coordinates.

Identity-only full transaction signatures (the previous payload hashes also remain asserted independently):

| Transaction | New metadata-inclusive signature |
| --- | --- |
| Player fire | `cf1ef58b35720bc798e4e01276e3222cc9bbd4a9d5f5ea7601b0697d1b72b501` |
| Bot fire | `faddf78c68cad791d1608d40476e62e254ceef4c8aeff637b133d010d622056d` |
| Player assault | `09049c7edeeae47fb3f63ebea985b81847a688d879668623ce8c887f0eeedc59` |
| Bot assault | `8ef09d1e9f9eb41b110d9c67fdae71464a389f937e3ca3ef2f244b9e3a55c54f` |

### Bounded performance follow-up

The first integrated implementation re-ranked every remaining formation after every action. A direct authored-mission benchmark exposed quadratic candidate work, not merely slow aggregate test execution. Measurements used Windows, Node 24.11.1, the same authored scenario/units and seeded engine, the mission-catalog one-infantry deployment setup, real `endTurn()` execution, suppressed console chatter, and `performance.now()` around each full turn. Other verification processes were running, so these are indicative local timings, not browser frame measurements.

| Authored mission | Before: rounds 1 / 2 / 3 | After: rounds 1 / 2 / 3 | Candidate evaluations per round |
| --- | --- | --- | --- |
| Town Defense | 1,397 / 6,189 / 9,340 ms | 259 / 388 / 412 ms | approximately 950 → 89 |
| Bastogne | 788 / 968 / 3,927 ms | 246 / 336 / 419 ms | 153 → 33 |

The worst observed turn among these six samples improved from 9,340 ms to 419 ms. No claim is made about unmeasured worst-case battles. Both missions retained identical first-round move/attack counts; later order can differ because stable priority is chosen once rather than repeatedly re-ranked.

The correction fixes stable-ID activation order with one initial ranking, executes the first still-current plan, and then recalculates only the next actor's decision against fresh units, visibility and occupancy. No stale later plan is executed. Candidate searches are bounded by `2N - 1` for N acting formations, rather than quadratic repeated army searches. The deterministic `BOT_CONVENTIONAL_REPLANNING_SCORES_ONLY_THE_NEXT_ACTOR_AFTER_INITIAL_RANKING` regression requires `[4, 1, 1, 1]` searches across four decisions, not a brittle wall-clock threshold. The existing production replanning, resource caps, stacking and replay tests still pass.

Isolated compiled regression run after the performance correction: `TEST_FILTER='^BOT_|BATTLE_ATTACKER_PREPARATION'` passed **61/61**. Scoped ESLint passed with no warnings. Whole-project isolated TypeScript compilation passed after the concurrent mission-observer interface was completed. Final combined release gates remain with the coordinating agent.

The additional integration sweep `TEST_FILTER='INITIATIVE|TOW|MOVEMENT|ATTACK|SUPPRESSION|SENTRY|SUPPLY'` passed **144/144**, and scoped `git diff --check` passed. These suites overlap; their totals are not additive. No shared compiled output was regenerated by this workstream.

The architecture check prompted removal of the redundant moved-tow guard inside `resolveBotAttack`; its initial shared readiness check already rejects that exact condition. A dedicated real-engine regression uses a limbered four-movement-point gun after just one point of movement, isolating tow readiness from the normal half-movement firing limit, and verifies an entirely unchanged state on rejection. The method shrank to 594 lines against its existing 596-line ceiling, without expanding the budget.

Production regressions include an actual initiative queue activation with a full 50-entry report ledger, three consecutive combat rounds with no duplicate in-round attacks, an occupied-friendly transit, a full-stack detour, conventional live replanning, hidden targets, empty fuel/exhausted movement, exact Player/Bot tow-cost parity, and a zero-fuel automated convoy with serialized state unchanged. Easy/Normal/Hard execute the same real legal move-and-attack fixture twice with identical results, positive damage and non-decreasing authored difficulty combat modifiers. Shipped canonical combat formations also retain finite pressure plans at all three difficulties. Existing tactical cases cover masked approaches, recon screening/spread, artillery discipline, target-role selection and stronghold staging. Existing air cases still pass: escort assignment, saturation across valuable targets, avoiding lethal observed flak, and accepting justified losses against observers.

The locked Bot attack transaction fixture previously permitted two movement points before a three-movement-point unit fired, contrary to the Player limit of one. Its setup and expected `movementPointsUsed` were corrected from 2 to 1. Every combat value and RNG assertion stayed unchanged. Its legacy-shape signature remains `b066770cf8a92112e4449ec75ad9cf6d65f4c4d9a5aa51621987884a0c4cae35`; the table above records the additional identity metadata. A separate real-engine test rejects the original illegal two-point attack with the entire serialized state unchanged.

Limitations: these deterministic tactical checks establish specific competence and legality, not a campaign-wide win rate or proof of balanced difficulty on every map. The optional explicit `Simple` strategy remains legacy behavior; the playable initiative and conventional Heuristic paths share the corrected planner. Allied execution remains conservative as noted above. No new persistent enemy-intelligence memory or probabilistic fog model was introduced. No live browser, perceptual animation, or audible quality certification is claimed by this code-only workstream. Full suite/build and live gameplay checks remain the coordinating release gate.
