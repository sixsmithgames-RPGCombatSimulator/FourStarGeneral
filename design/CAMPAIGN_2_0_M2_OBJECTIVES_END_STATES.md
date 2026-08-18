# Campaign 2.0 Milestone 2 — objectives, score, and campaign end states

**Work package:** C20-026  
**Status:** Implemented and certified  
**Depends on:** C20-004 atomic transactions, C20-013 segment resolution, C20-014 advance stops, C20-021 engagement ledger, C20-023 battle consequences, C20-024 operational control, C20-025 persistent infrastructure  
**Next:** C20-027 campaign after-action review and post-battle autosave

## Purpose

C20-026 turns campaign objectives from decorative map stars into authoritative rules. The campaign now knows what must be achieved, what can be lost, how long ground must be held, which chapter of the operation is active, what every objective is worth, which rewards have been earned, and exactly when victory or defeat becomes final.

The complete authority loop is:

```text
authored objective and campaign arc
  -> locked/active objective runtime
  -> post-consequence, post-control, post-infrastructure evaluation
  -> progress explanation, deadline, phase transition, score
  -> idempotent reward application
  -> victory/defeat and grade record
  -> mandatory automation stop
  -> checksummed save and first-class outcome presentation
```

## Player contract

To a player, the feature works as follows:

- the Situation workspace lists briefed objectives in operation order;
- every row says whether it is upcoming, in progress, completed, or failed;
- measurable progress, the next unmet requirement, the deadline, and the point value are visible;
- some objectives unlock only after an earlier objective or campaign phase is complete;
- capturing a hex can be insufficient: an objective may require uninterrupted control or a minimum operational installation condition;
- progress is evaluated only from committed campaign truth, never from a tactical victory banner alone;
- completing an objective applies its authored resources, power, or unlock exactly once;
- primary objectives determine the required campaign path, while secondary and optional objectives improve the score and victory grade;
- a missed required deadline or visible failure condition can end the operation in defeat;
- campaign automation stops immediately when an objective changes or the campaign ends;
- victory and defeat show a recorded result, grade, score, and completed/failed count;
- a scenario may explicitly allow non-scoring sandbox continuation, but the recorded result never changes.

There is no surprise defeat contract. A terminal failure objective cannot use `secretUntilResolved` visibility. Scenario validation rejects it before runtime creation.

## Campaign view versus tactical battle

This is a cross-layer system with campaign-owned rules and UI.

- Strategic objectives, phase progress, score, deadlines, rewards, victory, and defeat live in the campaign runtime and Situation workspace.
- Tactical battles retain their own local mission objectives and victory rules.
- A tactical result immediately feeds campaign consequences, occupation/control, infrastructure condition, and then campaign objective evaluation in the same atomic post-battle transaction.
- A campaign objective can explicitly depend on an engagement result through `operationResult`.
- A tactical victory does not guarantee strategic progress: failure to occupy, severe installation damage, a hold-duration requirement, or a missed campaign deadline can prevent completion.
- A tactical defeat can still contribute to an operational condition such as delay/survival, formation preservation, or an authored operation-result branch.

The player therefore sees tactical objective markers during battle and strategic objective progress after returning to theater command. The two layers are connected without pretending they are the same rule.

## Authored definition model

Legacy fields remain valid map-marker and display content:

- `key`, `label`, `description`, `hex`, `owner`;
- `rewards` and `penalties` remain legacy display strings.

C20-026 adds optional first-class rules:

| Field | Purpose | Default |
|---|---|---|
| `category` | `primary`, `secondary`, `optional`, or `failure` | `primary` |
| `visibility` | briefed/revealed/secret presentation policy | `briefed` |
| `conditions` | one or more typed conditions | Player controls marker hex |
| `completionMode` | all conditions or any condition | `all` |
| `deadlineSegment` | absolute inclusive evaluation boundary | none |
| `holdSegments` | legacy shorthand for control holds | zero |
| `score` | points awarded on completion | 100/50/25/0 by category |
| `requiresObjectives` | dependency keys required for activation | none |
| `phaseKey` | operation phase that can activate the objective | unrestricted |
| `rewardEffects` | typed mechanical rewards | none |

`CampaignArcDefinition` authors ordered phases, explicit victory and defeat objective keys, optional command-viability defeat, grade thresholds, and optional sandbox continuation.

### Supported conditions

| Condition | Authoring use | Progress explanation |
|---|---|---|
| `controlHex` | capture/hold/protect a campaign tile; optionally require infrastructure effectiveness | controller, hold segments remaining, installation threshold |
| `formationStrength` | preserve or reduce a named persistent formation above/below a percentage | current effective strength and threshold |
| `formationStatus` | require or detect ready, committed, isolated, shattered, destroyed, captured, and other lifecycle states | current named status |
| `resourceThreshold` | retain or exhaust personnel, supply, fuel, ammo, air, naval, or intelligence power | current stock/power and threshold |
| `operationResult` | depend on a resolved engagement from the Player perspective | pending or victory/defeat/stalemate |
| `surviveUntil` | delay, endure, or preserve conditions until a campaign segment | exact remaining segments |
| `objectiveStatus` | compose an objective from another completed/failed objective | linked objective state |

All-condition progress is the mean of condition progress and completes only when every condition is satisfied. Any-condition progress uses the best branch and completes when one branch is satisfied. Exact condition labels are retained in runtime for UI, saves, diagnostics, and the later AAR.

## Objective lifecycle

The legal lifecycle is:

```text
locked -> active -> completed
                 -> failed
```

- `locked` means its dependency or phase is not yet available.
- `active` means current committed truth is evaluated every campaign boundary and after typed tactical results.
- `completed` and `failed` are terminal for that objective.
- activation and resolution segments are retained.
- progress is normalized from 0 through 1 and keeps exact current/target facts plus readable labels.
- completion score and reward-applied state are stored with the objective.

Dependencies and phases can unlock more than one objective on the same boundary. The evaluator repeats a bounded stable-order pass so an objective completion, phase transition, and newly available objective activation commit atomically without unbounded recursion.

## Holds and deadlines

Control holds use `controlSinceSegment`, which C20-024 stamps only when legal occupation actually changes control.

- Capturing on segment 10 produces zero completed hold segments at that boundary.
- At segment 11, one uninterrupted segment is complete.
- Losing control resets progress because the new controller receives a new control-start stamp.
- A minimum infrastructure threshold is combined with control/hold progress, so a captured but unusable port may remain incomplete.

Deadlines are inclusive evaluation boundaries. On the deadline segment, the objective condition is evaluated first. If a positive objective is still unsatisfied, it fails. A failure-category objective triggers failure when its undesirable condition becomes true; if it has a deadline and the trigger was avoided through that boundary, it completes as avoided.

## Phases

The runtime stores the current phase key and entry segment. The default legacy phase is `operation`.

For an authored arc:

1. only objectives assigned to the current phase and with satisfied dependencies activate;
2. the current phase advances when all primary objectives listed for that phase complete;
3. secondary/optional objectives do not block phase advancement;
4. the next phase and its eligible objectives activate in the same transaction;
5. the command bar displays the authored phase label.

## Score and victory grade

The runtime retains:

- points earned from completed objectives;
- total available points;
- actual earned percentage;
- projected grade based on the maximum score still achievable.

Default grade thresholds are:

- 90%: decisive victory;
- 60%: victory;
- below 60% after satisfying the victory expression: costly victory;
- terminal failure: defeat.

Scenarios can override both victory thresholds. The outcome freezes the actual score, grade, phase, segment, completed objective keys, failed objective keys, and summary. Optional goals can therefore distinguish an efficient decisive campaign from a costly success without invalidating the required victory.

## Rewards and idempotency

Typed completion rewards support:

- personnel, supplies, fuel, and ammunition;
- air power, naval power, and intelligence coverage;
- named unlock records.

Every effect receives a stable `<objective>:reward:<index>` key. The key enters `awardedRewardKeys` before the effect is emitted. The objective also sets `rewardApplied`. Re-evaluation, replay, save/load, duplicate tactical-result delivery, or sandbox review cannot award it again. Economy application is zero-bounded.

Legacy free-form reward strings are deliberately not parsed into mechanics. That prevents old labels such as `supplyBonus:5` from silently acquiring an ambiguous new economic meaning. The baseline campaign now carries explicit typed effects beside those display strings.

## Victory, defeat, and continuation

The terminal policy is deterministic:

1. defeat is evaluated first;
2. any failed authored defeat objective, or an enabled no-viable-Player-formations rule, causes defeat;
3. otherwise every authored victory objective must be completed for victory;
4. the outcome is created once and runtime status becomes `victory` or `defeat`;
5. the advance controller writes a decision-required campaign alert and stops with `campaignEnded`;
6. further time advance is rejected.

If `allowContinueAfterOutcome` is true, the terminal dialog may explicitly enter a non-scoring sandbox. The outcome record remains intact, `sandboxContinued` is stamped, and runtime returns to planning. Objective/score evaluation stays frozen, making continuation clearly separate from the service record.

## Baseline campaign authoring

The shipped campaign now contains two real operational objective tiles at its previous beachhead and port marker coordinates:

- **Beachhead phase:** hold the Player beachhead/naval base for two completed segments, keep at least 50% installation effectiveness, and finish by segment 16.
- **Expansion phase primary:** capture and hold the enemy port for two completed segments, retain at least 25% effectiveness, and finish by segment 96.
- **Expansion phase secondary:** capture the forward airfield with at least 25% effectiveness by segment 80.

The beachhead and port are required for victory. The airfield improves the score and makes decisive victory available. Rewards use exact supply, air/naval power, intelligence, and unlock effects.

## UI/UX

The Situation workspace now provides:

- campaign score and projected grade;
- semantic objective category, status, and stable identity;
- exact progress bar with accessible numeric value;
- the next unmet rule in plain language;
- deadline time and awarded/available points;
- completed and failed visual states.

The terminal dialog provides:

- outcome-specific victory/defeat styling;
- grade, summary, exact score, completed count, and failed count;
- Review Campaign Map, which returns focus to the Situation workspace;
- Continue Without Scoring only when the scenario explicitly enables it.

The advance action is disabled in terminal status. Command status reads Campaign Ended. Save-browser metadata uses the authored campaign phase or recorded grade and retains `victory`/`defeat` result.

## Persistence and compatibility

- New runtimes initialize objective lifecycle, phase, score, null outcome, and reward-key storage.
- Runtime-v1 saves created before C20-026 may omit the new aggregate fields; reconciliation adds them without replaying rewards.
- Objective extension fields are optional on legacy runtime records and receive safe defaults.
- The complete state is inside the existing checksummed campaign envelope.
- Terminal outcomes load directly into terminal status; sandbox-continuation state also survives.
- The compatibility scenario projection carries the authored campaign arc but never owns objective truth.

## Invariants and authoring validation

Runtime validation rejects:

- invalid lifecycle status or progress outside 0–1;
- invalid activation/resolution segments or score facts;
- partially present phase/score/outcome/reward aggregate state;
- duplicate reward keys;
- score above available score;
- mismatched outcome result, grade, runtime status, or sandbox state;
- malformed completed/failed key collections.

Definition validation rejects:

- empty or duplicate objective/phase keys;
- unknown phase, dependency, victory, defeat, or linked-objective keys;
- dependency cycles and self-dependencies;
- authored control conditions targeting a missing operational tile;
- invalid holds, deadlines, scores, percentages, resource thresholds, or grade thresholds;
- standard victory threshold above decisive threshold;
- secret terminal failure objectives.

Any evaluator exception or invariant failure rolls back objective progress, phase, rewards, economy, score, outcome, events, and revision with the rest of the segment or battle-result transaction.

## Certification coverage

- [x] Hold progress counts completed uninterrupted campaign segments.
- [x] Infrastructure effectiveness gates completion.
- [x] Completion activates dependencies and advances phases atomically.
- [x] Typed rewards and unlock keys apply exactly once.
- [x] Required and secondary scores produce the intended standard grade.
- [x] Victory freezes outcome and rejects further advance.
- [x] Inclusive deadline failure creates defeat.
- [x] Multi-segment automation stops with `campaignEnded` and a decision-required alert.
- [x] Checksummed save validation retains terminal outcome, score, phase, and objective records.
- [x] Dependency cycles and secret failure objectives are rejected before runtime creation.
- [x] Situation UI exposes semantic progress and the terminal dialog supports review.
- [x] Full TypeScript, campaign-focused, and repository test suites pass.

## Deliberate handoffs

- **C20-027:** build the campaign AAR from the completed objective/score/outcome facts plus the existing formation, resource, control, and infrastructure audits; add post-battle autosave at the resolved campaign boundary.
- **C20-030/C20-031:** make strategic AI assess deadlines, score, objective value, and failure risk from faction-safe projections.
- **C20-040/C20-042:** add force-preservation scoring and persistent formation honors/service-record effects to authored victory grades.
- **C20-050:** let weather and ground conditions change the difficulty of reaching objectives without changing their deterministic authored meaning.

## Follow-on readiness

C20-027 now has the exact facts required for an operational debrief: what changed in battle, what territory and infrastructure changed, which objectives advanced or failed, which phase began, which rewards applied, how the score changed, and whether the campaign ended. The next slice can present those facts without deriving or guessing them after the transaction.
