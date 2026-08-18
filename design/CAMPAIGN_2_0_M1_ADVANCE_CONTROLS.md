# Campaign 2.0 Milestone 1: Advance Controls, Event Stops, Alerts, and Timeline

Status: implemented and certified 2026-08-04  
Depends on: C20-013 deterministic segment transaction  
Authoritative time quantum: one three-hour campaign segment

## Outcome

Campaign time is advanced through explicit commander intent rather than a game-speed multiplier. A longer advance is a bounded orchestration of ordinary C20-013 segment transactions. Every successful segment remains its own revision, RNG checkpoint, event group, and rollback boundary.

The player can:

- resolve exactly three hours;
- advance until the next notable report;
- advance to the next dawn or dusk boundary;
- advance eight segments (one day), stopping early for a mandatory interruption;
- enable **Pause after every resolution** without changing simulation rules;
- see the reason automation stopped, any alerts raised, and the persisted segment timeline.

## Non-goals

C20-014 does not invent unfinished weather, objective, tactical consequence, formation-risk, or victory rules. It provides typed stop hooks for those systems and immediately classifies the material movement, order, intelligence, engagement, control, and status changes already resolved by C20-013.

## Command contract

| Mode | Target | Normal stop behavior | Safety bound |
|---|---|---|---|
| `segment` | current segment + 1 | always stops after one resolution | 1 segment |
| `nextReport` | first report-worthy event | ignores bookkeeping and stops for notable, critical, or decision-required alerts | 64 segments |
| `dawn` | next segment beginning at 06:00 | stops at the boundary or sooner for a mandatory interruption | no more than 8 segments |
| `dusk` | next segment beginning at 18:00 | stops at the boundary or sooner for a mandatory interruption | no more than 8 segments |
| `day` | current segment + 8 | stops at the target or sooner for a mandatory interruption | 8 segments |

Dawn is segment-of-day 2 and dusk is segment-of-day 6. If the campaign is already at the named boundary, the command targets the next day's occurrence rather than resolving zero time.

`pauseAfterEveryResolution` is an accessibility/control preference. It converts every multi-segment command into a single successful segment without changing the selected mode, deterministic seed, or domain rules.

## Transaction and failure semantics

1. A command receives a deterministic `commandId` derived from campaign identity, starting revision, starting segment, and mode.
2. The controller requests one C20-013 segment transaction at a time.
3. Each committed transaction appends one persisted advance-step record within that same transaction. No follow-up bookkeeping revision is allowed.
4. The controller evaluates the persisted step's stop reason before requesting another segment.
5. If a later segment rejects, earlier committed segments remain authoritative and the command stops at the last valid boundary. The rejected segment retains its exact pre-segment state.
6. A safety-limit stop is successful but explicit. It must never silently continue or spin indefinitely.

This means save, load, replay diagnostics, and UI refresh can interrupt a long advance after any committed segment without producing half-resolved campaign time.

## Alert model

Severity and stop policy are deliberately separate:

- `routine`: bookkeeping or low-risk completion; timeline only;
- `notable`: something the commander asked to learn about, such as an arrival or new intelligence brief;
- `critical`: a material campaign-state change requiring prominent presentation;
- `decisionRequired`: simulation cannot responsibly continue without player input.

Every alert has a stable ID, segment, player-safe title/detail, category, and semantic target (`time`, `order`, `intelligence`, `engagement`, `objective`, `formation`, or `campaign`). UI links may focus that target when a corresponding workspace exists. Enemy authoritative state must never be copied into an alert; intelligence alerts are derived only from the Player knowledge projection.

Duplicate housekeeping events are aggregated into one routine step summary. Alerts are persisted with the step record, not reconstructed from unrestricted enemy-domain event text.

## Stop precedence

Only one primary stop reason is stored per step. The highest applicable reason wins in this order:

1. campaign victory or defeat;
2. tactical engagement requiring player choice;
3. blocked player order requiring a decision;
4. primary objective state change;
5. formation-destruction risk hook;
6. player preference to pause after every resolution;
7. next-report alert;
8. dawn/dusk/day target reached;
9. single-segment completion.

Mandatory reasons always stop every mode. `nextReport` additionally stops for notable reports. Routine production, time-boundary, finalize, transport-return, and intelligence-cycle bookkeeping do not stop it.

## Persisted records

`CampaignRuntimeState` owns an ordered `advanceRecords` ledger. One `CampaignAdvanceStepRecord` contains:

- stable record, command, and predicted transaction IDs;
- command mode and source/target segments;
- committed revision and number of material domain events;
- all player-safe alerts raised by the segment;
- whether this step stopped the command and its machine-readable reason.

The invariant validator checks identity uniqueness, monotonic revision/segment ordering, transaction linkage, alert shape, and stop consistency. Save-envelope minimum-shape validation requires the ledger so corrupt or pre-contract payloads enter the existing explicit migration/recovery path rather than receiving silent defaults.

## UI/UX contract

The persistent order tray contains separate **Commit orders** and **Advance** actions. Advance controls include:

- a labeled mode selector;
- a primary action whose label mirrors the selected mode;
- a `Pause after every resolution` checkbox;
- an expandable timeline button with an alert count;
- a persistent latest-stop summary;
- severity-coded, text-safe alert and timeline cards.

After execution, status copy leads with elapsed time and the stop reason. A partial failure states how far the campaign safely advanced and identifies the rejected segment. Controls are disabled while no campaign is loaded or the runtime is outside planning state.

The former 1x/2x/4x controls are compatibility markup only and are not interactive campaign mechanics.

## Certification

C20-014 is complete when tests prove:

- all target calculations, including same-boundary dawn/dusk;
- one revision per successful segment and deterministic command/record identities;
- next-report ignores routine cycles and stops on a player arrival or new Player intelligence brief;
- day and boundary modes stop early for mandatory decisions;
- pause-after-every-resolution stops after exactly one transaction;
- later rejection retains earlier committed segments;
- advance records survive save-envelope round trip and reject malformed ledgers;
- shell controls are keyboard/form accessible, render projections as text, and expose stop reason plus timeline;
- full typecheck, lint, test, production build, and browser verification pass.

## Certification record

- Focused C20-014 harness: passed target-boundary, routine/report, mandatory stop, accessibility pause, deterministic identity, later-failure rollback, save/load, and malformed-ledger cases.
- Full `npm test`: passed. Existing Node-only sound-catalog URL diagnostics remain non-fatal and unchanged.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with the repository's pre-existing warning baseline and no errors.
- `npm run build`: passed. Existing Vite chunk-size and static/dynamic campaign JSON notices remain non-fatal.
- Live browser: passed at 1440×900, 800×900, and 520×860. Dawn resolved two transactions, moved the clock from 00:00 to 06:00, persisted two timeline entries, displayed the exact stop reason, and introduced no page overflow or error overlay. Guest-mode Clerk requests returned the existing non-feature 400 responses; no application exception was raised.
