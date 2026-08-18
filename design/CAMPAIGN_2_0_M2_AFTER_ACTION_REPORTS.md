# Campaign 2.0 Milestone 2 — after-action reports and post-battle recovery

**Work package:** C20-027  
**Status:** Implemented and certified  
**Depends on:** C20-016 save UX, C20-022 tactical result extraction, C20-023 consequences, C20-024 control, C20-025 infrastructure, C20-026 objectives/end states  
**Next:** C20-030 campaign AI assessment

## Purpose

C20-027 closes the campaign battle loop. A tactical battle no longer ends with a disposable summary and an unexplained jump back to the map. Headquarters receives a durable report that explains what happened tactically, what changed operationally, what it cost, and what the player must decide next.

The same return boundary writes a verified campaign autosave. A crash after leaving the tactical map therefore cannot force the player to refight a completed battle or accept campaign consequences without a recovery point.

## Player contract

After a campaign-linked tactical battle, the player receives one automatic headquarters review containing:

- the battle result and operational location;
- friendly formations' exact before/after personnel and condition;
- confirmed aggregate opponent losses without leaking persistent hidden enemy identity;
- resources charged to the campaign and any explicit shortfall;
- territorial control, occupation, retreat, front, and infrastructure effects;
- tactical objective results;
- campaign phase, objective, and score changes caused by the battle;
- concrete follow-up decisions such as repairing a captured installation, recovering a shattered formation, resolving a logistics shortfall, or reviewing a campaign end state;
- visible success or failure of the post-battle recovery checkpoint.

Reports remain in the command archive after acknowledgement. Reading a report never changes its historical contents or the campaign simulation revision.

## Campaign and tactical responsibilities

The feature crosses both views but its durable experience belongs to the campaign.

| Layer | Responsibility |
|---|---|
| Tactical battle | Produce the integrity-checked result package from complete battle truth. |
| Campaign resolution | Apply formation, economy, control, infrastructure, and objective rules atomically. |
| Campaign AAR | Freeze a Player-safe explanation of the committed before/after state. |
| Tactical handoff | Await the post-battle campaign autosave before returning to headquarters. |
| Campaign command shell | Automatically present the newest unread report and retain the complete report archive. |

The tactical mission-end presentation remains useful for immediate battlefield closure. It is not the historical authority. The campaign AAR is generated only after all strategic consequences have been accepted.

## Resolution order

The report is built inside the same campaign transaction as the battle consequences:

```text
verified tactical result
        │
        ▼
formation and economy consequences
        │
        ▼
retreat, occupation, control, and fronts
        │
        ▼
infrastructure damage and capture disruption
        │
        ▼
campaign objectives, phase, score, and outcome
        │
        ▼
immutable Player-safe AAR
        │
        ▼
transaction invariant validation and commit
        │
        ▼
post-battle campaign autosave
        │
        ▼
return to campaign and automatic report review
```

If any report binding or invariant fails, the entire campaign transaction rolls back. A report can never describe campaign consequences that were not committed.

## Report authority and integrity

`CampaignAfterActionReport` is stored on the terminal engagement ledger beside:

1. the frozen tactical commitment package;
2. the tactical result package;
3. the campaign consequence audit;
4. the control/front audit;
5. the infrastructure audit.

The report retains all upstream integrity hashes plus campaign, scenario, engagement, resolution, revision, segment, and viewer-faction identity. Its own canonical hash covers every historical display fact and decision prompt.

Runtime validation rejects:

- a report bound to another engagement or result;
- mismatched consequence, control, or infrastructure hashes;
- report revision drift;
- changed report content without a matching integrity hash;
- impossible friendly personnel equations;
- invalid objective progress;
- duplicate decision identities;
- acknowledgements that reference missing reports.

Development saves from before C20-027 remain readable. Missing report and acknowledgement fields reconcile to empty history; the game does not invent historical facts for old battles.

## Player-safe information boundary

The AAR is not a new route around campaign fog of war.

- Friendly formations retain stable IDs, names, exact condition, and placement because they are Player-owned truth.
- Opponent results are aggregated into formations engaged, personnel losses, destroyed, captured, and withdrawn counts.
- Persistent opposing formation IDs and campaign locations are not included in the Player-facing report.
- Tactical objectives and observations are limited to facts already established by the completed battle.
- The command shell consumes the sanitized AAR contract, not the raw enemy campaign runtime.

Future intelligence work may reduce the confidence or precision of opponent-loss estimates. That can change the report builder without changing the authoritative result package.

## Before/after contents

### Friendly formations

Each committed friendly formation freezes:

- name and role;
- source and final legal destination;
- personnel before, after, and lost;
- equipment lost by type;
- readiness, cohesion, and fatigue before and after;
- experience earned;
- persistent status after the complete resolution;
- operational disposition and its explanation.

Terminal formations remain historical rows even though they no longer occupy the map.

### Opponent confirmation

The first version exposes aggregate confirmed tactical facts:

- number of opposing formations engaged;
- confirmed personnel losses;
- formations destroyed;
- formations captured;
- formations withdrawn.

It deliberately does not expose persistent opposing IDs.

### Logistics

The report freezes Player economy before and after, exact charged supplies/fuel/ammo/air/naval power, and explicit shortages. Manpower casualties remain formation losses and are not charged again as abstract campaign manpower.

### Operational effects

The report retains:

- controller before and after;
- whether control changed;
- occupation outcome;
- front count before and after;
- infrastructure role, integrity, and effectiveness before and after;
- campaign phase before and after.

The UI presents these facts directly instead of paraphrasing a fake front-line movement.

### Objectives and score

Tactical objective results are retained separately from campaign objective changes. Campaign changes include status and progress before/after plus points awarded. This lets a player understand both “what I achieved in the battle” and “why the campaign objective changed.”

## Decisions required

Decision prompts are deterministic consequences, not generic advice. The initial rules emit prompts for:

| Condition | Severity | Destination |
|---|---|---|
| Campaign victory or defeat recorded | Critical | Campaign outcome |
| Explicit resource shortfall | Critical | Logistics |
| Friendly formation shattered | Critical | Formation |
| Friendly-controlled damaged infrastructure | Attention or critical below 50% | Infrastructure hex |
| Objective occupation failed | Critical | Engagement area |
| Campaign objective status/progress changed | Attention, critical on failure | Objective workspace |

Selecting a prompt closes the report and routes the player toward the relevant workspace or map location. A report may legitimately contain no immediate decision.

## Command-shell experience

The Reports control now represents the combined command inbox rather than intelligence alone.

- The newest unread AAR opens automatically when the player returns from battle.
- The report is an accessible modal dialog with a close control, Escape behavior, semantic headings, and text-only projections.
- A persistent archive lists reports newest-first and distinguishes new, acknowledged, victory, and defeat entries.
- The detail view groups headline metrics, operational effects, tactical objectives, formations, campaign objective changes, and required decisions.
- “Acknowledge report” clears the AAR unread state without deleting history.
- When no AAR exists, Reports retains its previous route to the intelligence workspace.
- Narrow layouts convert the archive to a horizontal strip and keep the Reports button available.

Acknowledgement is stored outside the integrity-bound report. It is persisted in campaign saves but does not increment the simulation revision or change the report hash.

## Post-battle autosave policy

`CampaignState.savePostBattleAutosave()` writes one copy-on-write autosave slot per campaign:

```text
campaign-post-battle:<campaignId>
```

The slot's bounded immutable history is the post-battle recovery chain. Each record contains:

- the complete resolved runtime;
- the terminal engagement ledger and AAR;
- no active tactical continuation;
- a theater resume context focused on the battle hex;
- report-specific thumbnail metadata;
- campaign result metadata when the battle ended the campaign.

The tactical mission-end handler awaits the write. On success, the report shows that the recovery checkpoint was saved. On failure:

- the already-committed battle outcome is not rolled back;
- headquarters visibly reports the save failure;
- the player is instructed to review the AAR and make a manual campaign save;
- the storage failure remains available through existing save/recovery diagnostics.

Repeated delivery of the same tactical result remains a no-op and does not generate another report or consequence transaction.

## File ownership

| Module | Responsibility |
|---|---|
| `CampaignAfterActionReportTypes.ts` | Immutable report, formation, opponent, objective, and decision contracts. |
| `CampaignAfterActionReportService.ts` | Deterministic build, integrity validation, and archive projection. |
| `CampaignEngagementLedgerTypes.ts` | Durable report ownership beside upstream audits. |
| `CampaignState.ts` | Atomic report creation, archive/acknowledgement APIs, and post-battle autosave policy. |
| `BattleScreen.ts` | Await autosave during the campaign mission-end handoff and surface failure. |
| `CampaignCommandShell.ts` | Accessible automatic review, archive, acknowledgement, and decision navigation. |
| `CampaignScreen.ts` | Player-safe presentation formatting and workspace/map routing. |

## Certification

Automated coverage proves:

- AAR creation occurs exactly once with battle resolution;
- friendly before/after facts match the tactical and consequence packages;
- opponent presentation is aggregate and identity-free;
- report hashes bind to all upstream audits;
- tampering is rejected;
- acknowledgement changes neither report integrity nor campaign revision;
- follow-up decisions are retained;
- runtime invariants accept complete reports and reject invalid acknowledgement references;
- the post-battle autosave contains the report, no active battle, and the correct theater resume target;
- the command shell automatically opens unread reports, renders safe text, exposes checkpoint status, acknowledges reports, and routes decisions;
- the full regression suite, TypeScript, lint, production build, and live browser flow remain clean.

## Deferred work

C20-027 intentionally does not implement:

- campaign AI operational assessment or planning;
- formation replacements, refit, upgrades, commanders, or honors;
- weather and ground-state explanation;
- confidence-banded enemy-loss estimates;
- replay video or tactical turn-by-turn playback;
- cloud synchronization.

Those systems can add sections and decisions to the versioned AAR without weakening its current truth boundary.
