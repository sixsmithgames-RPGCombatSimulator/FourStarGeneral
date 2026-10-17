# Autonomous Ally repair

Autonomous Allies now use the same engine-owned movement and combat transaction as Heuristic enemies. This closes the Ally compatibility defects recorded in the [gameplay compatibility repair](GAMEPLAY_COMPATIBILITY_REPAIR_2026-10-17.md) without changing normal new UI battles, which transfer Allied formations to Player control before initiative.

Baseline: `81ea982795f1c882fd825b2bde85c6d042414b4f`. Scope is retained autonomous Allies in direct engine calls and restored battles; no affected production save was identified.

## Behavior repaired

- Every primary and secondary stack member acts by stable formation ID. Coalition stack capacity is shared with Player movement; one friendly occupant permits legal transit, full combat stacks block it, and surviving secondary defenders are promoted correctly.
- Planning uses observed enemy contacts and canonical movement entry. Unknown blockers do not alter planning knowledge; execution checks physical occupancy before committing a step.
- Movement debits fuel, credit and action flags before combat, updates the correct supply identity, and obeys suppression, tow hookup and truck movement costs.
- Attacks use canonical ammunition, counterfire, casualties, suppression, assault advance and reports. Repeating an activation cannot recreate spent actions or resurrect a destroyed actor. Dig-in also consumes its action.
- Estimates and combat requests carry actual attacker and defender factions, including Allies' own commander statistics. Enemy difficulty modifiers remain enemy-only; existing Bot aircraft scheduling and combat are unchanged.
- Initiative resolves Allies rather than passing them to the logistics-only path. Individual activations do not perform round upkeep; completed rounds service and refresh Allies once without replaying their turns.
- Committed results retain allegiance after a casualty. The header, highlights, activity log and controls distinguish Allied from enemy actions. Allied routes cannot contaminate enemy mission-transit objectives. Mixed automated groups label the current actor while keeping enemy counts private.

No new queue/save fields, faction cache, movement clock, strategy default or separate combat implementation was introduced. The engine file shrank from 17,902 to 17,818 lines and its architecture ceiling was tightened. BattleScreen remains within its unchanged 14,360-line ceiling.

## Regression evidence

New default-runner coverage: 23 engine transaction cases, 10 initiative/continuation cases and nine presentation cases. The existing executable-import guard protects all three modules against becoming dormant. Before-fix runs fail 18 of the 23 engine cases, eight of the 10 initiative cases and seven of the initial eight UI cases; their negative compatibility controls pass. Later UI coverage adds current-actor casualty identity.

Fixtures were corrected where initial assertions did not model the real rules: Recon may deliberately hold rather than assault or crowd another scout; valid axial coordinates avoid JavaScript negative zero; the existing phase manager returns `airShow`. Corrected cases were rerun against the baseline. Initial failures and corrected evidence remain separate, not overwritten.

Integrated checks passed on the frozen source:

- Strict isolated compilation and the 43-case Ally/import-guard cohort.
- Complete registered suite: **1,259/1,259**, including the existing authored mission contracts.
- Full zero-warning lint, repository gate self-tests, architecture ratchets, source-asset checks and production build. Six JavaScript bundles, 82,205-byte initial script, no static chunk cycles; the existing large lazy-chunk advisory remains.
- Isolated Jest: **30/30** in two suites, including Airshow presentation checks. Existing dirty tracked Jest output was not rebuilt.
- Airshow diagnostics: **87/87**; the scenario report records nine mission reports, seven engagement events and no anomalies.
- New Allied rail browser checks: **9/9**, with no retries or skips, across Chromium, Firefox and WebKit at 1680, 1440 and 390 CSS-pixel widths. Each checks friendly identity, disabled player commands, text containment and the following enemy label. Representative desktop and mobile screenshots were visually inspected.

- Complete Chromium tutorial: **3/3** at 1680x857, 1440x900 and 390x844, including all 37 main steps and all six command-board briefs. No retries or skipped tests; the existing 210-second per-journey budget and assertions are unchanged. Total run: about five minutes, after the CPU-heavy suite completed.

The corrected command-rail run passes **69/69** across Chromium, Firefox and WebKit, with no retries or skips. This includes 48 regular/expanded-log layout cases and 21 narrow command-rail cases, with unchanged geometry tolerances. Representative desktop and mobile screenshots were inspected. Total browser checks for this batch: **81/81** across the separate Ally rail, tutorial and corrected rail runs; the earlier stopped fixture-failure run is preserved and is not counted as passing.

Evidence is under `diagnostics/ally-repair-20261017/`, `diagnostics/ally-initiative-20261017/` and `diagnostics/ally-ui-20261017/`. Browser rail images are in `ally-rail-results/` and `command-rail-corrected-results/`; tutorial images and JSON results are in `tutorial-results/` and `tutorial-report.json`; the scenario bundle is `diagnostics/air-scenario/air-scenario-20261017-150317/`.

Initial frozen source: 572 files, SHA-256 `eaea57f60268769e35a38fea0d09af86cefd55ea5230477cfbaa903d3047c0dd`. A later browser-fixture-only correction produces final candidate SHA-256 `9217a5bb3ee43a25315d98031df08c7299aa0da9ccacbf45a33fa6145553b8cf` (same 572 files). Production code, registered unit tests, build inputs and tutorial source remain unchanged from the full-suite/build run. Fresh complete typechecking and zero-warning scoped lint pass for the corrected fixture. Existing dirty generated Jest output and previous local release receipts are excluded from this patch.

The first extended command-rail run exposed an outdated fixture contract: it changed only player input permission while keeping a Player actor/group and demanded an Enemy label. Fifteen completed cases failed that same expectation before the run was intentionally stopped; original screenshots, error contexts and log remain under `command-rail*`. Independent review confirmed that actual actor allegiance must own the label, separately from count privacy. The fixture now checks the transitional "Your group / Orders resolving" state, then supplies real Bot presentation data and retains the longer "Enemy group / Enemy orders resolving" check. Readability, clipping, hit-target and layout tolerances were not loosened. The helper restores its original actor (including null), group and permission; both regular and narrow-rail callers are included in the rerun. No production change was made to satisfy the obsolete ownership assumption.

## Limits and separate follow-ups

The supported autonomous path excludes aircraft from the ground planner and services supply trucks through existing logistics. This repair adds neither an Allied air-mission director nor a new supply policy.

Two legacy/manual initiative shortcuts and the manual action validator remain separate from autonomous execution: skip/end-current-turn shortcuts can bypass automated actors, and manual validation still assumes an automated owner means Bot. Normal BattleScreen paced completion and the repaired Ally transaction do not use those paths.

A separate commander damage-bonus investigation remains: an actual 20%-strength infantry estimate stayed at 4.58 readiness damage when only `dmgBonus` changed from 0 to 80, although the request correctly carried the bonus. Canonical weapon-hit damage packets and legacy damage-per-hit may interpret that bonus differently. This was not treated as an Ally-only defect or changed as a balance adjustment; accuracy-based tests prove faction-correct estimate consequences, alongside direct damage-bonus request mapping.

Browser rail fixtures verify production component rendering with supplied activation data, not a whole mission. Tutorial automation is regression evidence, not a manual Class A certificate. Live/manual whole-game certification remains separate.

## Scoped tutorial assessment

**Observed Low / copy-tone finding, OPS Brief 3 (Read The Report):** opening Intelligence Briefs still shows generic "Status pending," an "All units standing by for orders" narrative despite mixed readiness, and a raw ISO timestamp. Expected: fact-bound current advisory and a player-readable time. This is the pre-existing optional follow-up, not introduced or repaired here. Evidence: `tutorial-results/tutorial-flow-Training-tut-8ab2f-nd-sequence-on-wide-desktop-chromium/sidebar-ops-brief.png`. Responsible presentation: `BattleWarRoomDataProvider` and `WarRoomOverlay`. Correct those strings using canonical current state, without inventing an observed event or duplicating readiness state.

Intent: protect the ordinary player/Heuristic initiative journey while fixing retained autonomous Allies. No tutorial definitions or journey actions changed. The tutorial skill guided the complete three-viewport automated journey and screenshot review; isolated equivalent gates preserved prior evidence and dirty generated files instead of overwriting them with the convenience runner.

- Functional bugs and tutorial flow: no illegal, stuck or skipped required action observed in these completed journeys. Actual rail clicks drive all six mini briefs.
- Camera/spotlight and UI/layout: inspected deployment, recon, engineering, edge selection, artillery, firing, smoke and completion captures across wide/mobile, plus desktop movement/order/completion samples. Required controls and target highlights remain visible in the reviewed captures. Representative images from every command-board brief were inspected on wide desktop, with mobile Air and Logistics coverage.
- Mobile: the 390x844 automated journey completes, bounded prompts and highlighted orders fit, and map targeting remains usable. This does not certify every device or native zoom mode.
- Accessibility: reduced-motion behavior and the existing scripted control checks pass; screen-reader, full keyboard-only journey, fullscreen, Back/Skip/reload recovery and comprehensive touch testing were not performed in this batch.
- Copy/tone: displayed main guidance and representative brief text remain consistent with the unchanged definitions; the OPS wording issue above remains. A full subjective review of every alternate/empty/disabled-state string was not performed.
- Standards/testing: all three full automated journeys pass with separate screenshots and preserved run evidence. No manual in-app first-player journey was performed, so **Class A certification is not claimed**.

Passed areas: all three supported tutorial sizes, full main sequence, six briefs, prior Air Brief 3 positioning and highlighted-card contracts. Remaining risks: manual accessibility, alternate recovery paths and whole-game live acceptance. Prioritized non-blocking improvements: factual OPS wording, then broader manual certification and the separate legacy API/damage-bonus investigations described above.

## Release

User authorized production deployment after checks pass. All scoped release gates above pass. Preflight at 19:17:10 UTC verified the expected team `team_MV7H5Yr78mJD46i3lMjAMjOc` and project `prj_OfsbVMolgcUfE5P7I4Ffg5dTVjhg`: the complete 24-hour team listing contained 17 deployments, six in the last hour, none in the last five minutes and no active build/queue. Remote main and the production alias still matched baseline `81ea982795f1c882fd825b2bde85c6d042414b4f`. The source fingerprint is unchanged after the fixture correction. A single scoped Git-connected production release is authorized; its post-deploy receipt will be recorded locally without triggering a second documentation-only deployment.
