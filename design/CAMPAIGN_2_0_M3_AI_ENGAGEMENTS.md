# Campaign 2.0 Milestone 3 — Bot offensives and Player defensive battles

**Work package:** C20-033  
**Status:** Implemented and certified  
**Depends on:** C20-013 segment transaction, C20-014 advance interruption, C20-015/016 tactical persistence, C20-020 persistent formations, C20-021 engagement ledger, C20-022–027 consequence/control/objective/AAR pipeline, C20-030–032 AI assessment/planning/behavior  
**Next:** C20-034 AI soak, diagnostic rationale, and operational-memory outcome closure

## Product outcome

The campaign opponent can now initiate an offensive or counterattack that becomes a real tactical battle. The campaign clock stops at contact, the Player receives a mandatory defensive briefing, exact persistent formations cross into tactical play, and the result returns through the same campaign consequence pipeline used by Player attacks.

This feature is deliberately both campaign and tactical:

- the campaign decides whether, where, and with which persistent formations the Bot attacks;
- the campaign ledger freezes the combatants and owns save/recovery identity;
- precombat presents the Player's defensive deployment without revealing exact enemy truth;
- the tactical battle uses an attacker-oriented Bot roster and defender-oriented Player deployment zones;
- tactical losses, supply use, evidence, control, infrastructure, objectives, and the AAR return to campaign truth.

It is not a campaign-only event card, an automatic force comparison, or a reskinned Player assault.

## Player experience

When a Bot operation reaches a legal attack position:

1. Campaign time resolves to the current three-hour boundary.
2. An `engagement` interruption is recorded in the advance timeline.
3. The campaign automatically opens a defensive precombat briefing.
4. The briefing identifies the threatened hex, mission family, friendly formations caught in the battle, and the Player's current intelligence estimate.
5. Exact enemy formation counts remain concealed; uncertainty and unknowns remain visible.
6. The Player deploys the exact friendly formations already committed by the operational situation. These rows are locked: the attack cannot be escaped by removing formations or buying unrelated reinforcements.
7. The tactical map places the Player on the authored defender side, gives defensive entrenchment when the campaign installation supports it, and gives the Bot an offensive force and doctrine on the attacking side.
8. Tactical saving and direct campaign-battle recovery use the existing package-bound save system.
9. On battle end, the result is interpreted from the correct operational perspective: a Player tactical win is a defender victory when Bot attacked.
10. Campaign consequences, territorial control, infrastructure, objectives, formation history, and the Player-safe AAR resolve before campaign planning resumes.

The Player may return to the campaign screen to inspect the situation. Doing so does not cancel a committed enemy attack. The campaign action becomes **Respond to Enemy Offensive** and reopens the same package.

## Rules boundary

### Eligible plans

Only a selected, non-blocked `prepareOffensive` or `counterattack` plan can initiate contact. The directive must belong to the current private planning record. Defensive, reinforcement, withdrawal, production, logistics, and intelligence plans cannot create a tactical battle.

### Belief-safe target selection

The target comes unchanged from `CampaignAISelectedPlan.targetHexKey`. That target was produced by the C20-030/C20-031 belief-constrained pipeline.

The engagement service may consult authoritative campaign state only to answer physical questions after selection:

- does that exact target hex exist;
- is it currently Player-controlled;
- are the exact assigned Bot formations legally staged beside it;
- which Player formations are physically available to defend;
- can all participating persistent formations produce tactical units.

If the selected target is invalid or out of reach, initiation returns no engagement. The service does not search nearby authoritative tiles for a weaker, closer, or otherwise preferable Player target. This non-substitution rule is the critical campaign-fog boundary.

### Exact attacker commitment

The plan's assigned formation IDs are filtered only for ordinary battle legality:

- Bot ownership;
- persistent placement;
- supported tactical mapping;
- ready/isolated battle eligibility;
- no active order;
- friendly staging tile;
- range of one campaign hex from the exact target.

The engagement context's attacker pool is then narrowed to precisely those IDs before the common ledger commit runs. Other Bot formations on the same staging tile are not silently added. At least one non-logistics combat formation is required.

### Exact defender commitment

Player formations on the target and adjacent Player-held tiles are attached through persistent provenance. Formations already moving, unavailable, terminal, or lacking a tactical mapping are excluded. The remaining exact defenders are frozen by the ordinary defender commitment path. At least one non-logistics combat formation is required for a Player tactical defense.

The current rule commits all legally available defenders in the engagement area. Strategic reserve-selection agency is future work; the present UI gives tactical deployment agency without permitting a committed enemy attack to be erased in precombat.

### Single active contact

Campaign runtime permits one active tactical package. The engagement phase initiates at most one Bot contact per segment, in stable faction/plan order. If another package is active, later operations remain staged.

## Segment and transaction timing

The `engagements` phase is now active in the shared segment resolver:

```text
frozen faction views
  → movement resolves previously committed orders
  → intelligence / AI assessment / planning / behavior
  → Bot engagement initiation
  → consequences / control / objectives / finalize
  → advance command detects active engagement
  → mandatory Player-safe stop
```

A formation can attack after its ordinary redeployment reaches the legal staging line and releases its movement order. No formation teleports, moves twice, or receives a free AI-only action.

Engagement creation, ledger reconciliation, planning, exact formation status transitions, package integrity, event creation, and the segment revision commit occur inside one runtime transaction. Any invariant failure rolls the entire segment back.

## Engagement package and persistence

Bot attacks reuse `CampaignBattlePackage` version 2 without a parallel AI package type. The frozen package contains:

- campaign/scenario/engagement/revision binding;
- attacker `Bot` and defender `Player` context;
- exact attacker and defender formation baselines;
- stable tactical unit IDs and campaign provenance;
- attacker allocation lines derived from exact Bot formations;
- resource/support commitments owned by the operational attacker;
- context and request hashes plus package integrity;
- tags identifying AI initiation, Player defense, offensive/counterattack family, and private plan linkage.

The package is already committed before defensive precombat appears. Therefore precombat does not recommit it or create a second campaign revision. The existing campaign-before-battle, active tactical battle, and post-battle persistence flows remain authoritative.

## Tactical orientation

Existing authored tactical scenarios are offensive templates. A Bot attack reorients the selected template deterministically:

- Player and Bot deployment-zone faction labels swap;
- objective ownership swaps;
- Player and Bot HQ locations swap;
- authored Player units become Bot attacker placement anchors;
- authored Player units are removed so no uncommitted formations appear;
- the generated Bot roster comes from Bot `attacker` commitments, not defender commitments;
- Bot attackers receive zero defensive entrenchment;
- Player campaign defenders receive mission/infrastructure-derived entrenchment through their formation seeds;
- Bot goal/strategy uses an offensive doctrine for the mission family;
- Player goal/strategy describes holding and force preservation;
- Bot tactical resources derive from the campaign attacker force value.

For Player attacks, existing orientation and generated Bot defenders remain unchanged.

## Precombat UI/UX contract

Defensive precombat is a deployment surface, not a requisition surface.

- Primary action: **Deploy Defense & Begin Battle**.
- Banner: **Enemy offensive** plus defensive mission label and target hex.
- Friendly information: exact number and types of Player formations already caught in the battle.
- Enemy information: only the Player intelligence briefing's resistance band, confidence, contacts, and explicit unknowns.
- Allocation rows: only exact Player defender commitment types are visible.
- Quantity floor and ceiling: both equal the committed count, disabling additions and removals.
- Budget: equals the exact friendly committed value; no Bot reserve or enemy support pool is exposed.
- Recommended convoy/support seeding: disabled unless such a persistent Player formation is actually committed.
- Return behavior: returns to the campaign without clearing the package.
- Campaign resume action: **Respond to Enemy Offensive**.

The UI never displays `context.availableForces` totals for a Bot attack because that pool is authoritative Bot truth.

## Result orientation and evidence safety

Tactical faction identity is stable even when campaign initiative reverses:

| Tactical side | Campaign faction | Operational role in Bot attack |
|---|---|---|
| Player | Player | defender |
| Bot | Bot | attacker |

Battle-end translation therefore uses:

- Player tactical victory + Player campaign attacker → `attackerVictory`;
- Player tactical defeat + Player campaign attacker → `defenderVictory`;
- Player tactical victory + Bot campaign attacker → `defenderVictory`;
- Player tactical defeat + Bot campaign attacker → `attackerVictory`.

Supply ledgers also remain faction-identical: tactical Player consumption is charged to campaign Player and tactical Bot consumption to campaign Bot. Tactical enemy-contact evidence belongs to Player knowledge regardless of who attacked. The result package still stores attacker/defender roles separately for control and retreat rules.

## Failure behavior

The operation remains staged and campaign time continues normally when:

- the selected plan is not offensive/counterattack;
- its directive is blocked or mismatched;
- another tactical package is active;
- the exact target is missing, non-Player, or out of reach;
- no exact assigned Bot combat formation is ready;
- no legal Player combat formation is available to defend;
- persistent provenance cannot represent every required formation.

Once package creation begins, ledger or invariant errors fail closed and roll the segment back. The system never falls back to an approximate battle package.

## Certification

Automated coverage proves:

- one staged plan creates one in-battle ledger package;
- only the plan's selected Bot formation is committed even when another Bot formation shares its tile;
- every legal Player defender receives an exact defender commitment;
- package context retains the selected target and a Player-owned briefing;
- a non-adjacent target does not substitute an adjacent hidden alternative and produces no mutation;
- Player defender commitments generate battle-owned units with Player provenance and defensive entrenchment;
- defensive scenario generation swaps zones/objectives/HQs, removes phantom Player units, generates attacking Bot units, uses offensive doctrine, and gives Bot attackers no entrenchment;
- defensive tactical resource consumption remains assigned to the correct campaign faction;
- tactical enemy-contact evidence remains Player-owned;
- normal Player-attack Bot roster generation remains unchanged;
- TypeScript validation and production Vite build pass.

## Code map

| File | Responsibility |
|---|---|
| `src/game/campaign/ai/CampaignAIEngagementService.ts` | Belief-target non-substitution, physical legality, exact force pools, ledger planning/commit, and contact event. |
| `src/game/campaign/runtime/CampaignSegmentResolver.ts` | Runs Bot contact creation in the authoritative engagement phase. |
| `src/game/campaign/CampaignBattleGenerator.ts` | Reorients authored templates and builds the Bot attacker from attacker commitments. |
| `src/state/CampaignState.ts` | Builds battle-owned Player units from either attacker or defender commitments. |
| `src/ui/screens/CampaignScreen.ts` | Routes mandatory advance stops and supports re-entry into the active defensive package. |
| `src/ui/screens/PrecombatScreen.ts` | Defensive briefing, exact locked allocations, safe return, and package reuse. |
| `src/ui/screens/BattleScreen.ts` | Converts Player tactical victory/defeat into role-correct campaign outcome. |
| `src/game/campaign/results/CampaignBattleResultExtractor.ts` | Preserves tactical faction identity for resources and Player evidence. |
| `tests/CampaignAI.engagements.test.ts` | Exact commitment, anti-omniscience, defensive deployment, and result-identity certification. |
| `tests/CampaignBattleGenerator.test.ts` | Defensive tactical template-orientation certification. |

## Deliberate limits and next work

C20-033 does not yet:

- delegate or auto-resolve a Player defensive battle;
- select only part of the locally available Player defense;
- close the originating plan as completed/failed/aborted after the AAR;
- expose a development-only AI rationale inspector;
- run the 500-seed multi-day soak/performance/oscillation gate;
- create an unopposed strategic occupation when no Player tactical defender exists;
- author bespoke defense-only maps instead of deterministically reorienting the current template stock.

C20-034 should close operational memory from terminal battle results, add diagnostic rationale correlation from assessment through AAR, exercise offense/counterattack continuity across many deterministic seeds, prove invariant and performance budgets, and quantify engagement frequency in the baseline campaign.
