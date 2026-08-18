# Campaign 2.0 Milestone 1 — Deterministic Segment Transaction

**Task ID:** C20-013  
**Status:** Implemented and certified  
**Depends on:** C20-003, C20-004, C20-012

## Goal

Replace `CampaignState.advanceSegment()`'s multi-mutation compatibility path with one authoritative, deterministic Campaign 2.0 transaction. Every three-hour boundary must resolve from a frozen start state, publish a phase-ordered report, and either commit in full or retain the exact pre-segment runtime and random checkpoints.

## Player contract

- **Advance 3 hours** resolves exactly one campaign segment.
- Friendly and enemy systems cannot react to information produced during that same segment's planning boundary.
- Movement due at the boundary is calculated from start-of-segment locations and force quantities, then applied as net changes. A unit arriving during the segment cannot depart again until a later segment.
- Daily production uses the territory and allocation owned at the start of the boundary.
- Movement, transport returns, production, intelligence, control/front maintenance, and typed-order lifecycle changes resolve together.
- A successful resolution reports the elapsed time and material outcomes.
- A failed resolution advances nothing, spends nothing, consumes no random draw, and leaves a recoverable diagnostic.

## Frozen-view contract

Before mutation, the resolver creates one deeply frozen legal view for each runtime faction. A frozen view contains:

- source campaign ID, revision, and segment;
- only that faction's economy;
- the existing sanitized campaign-map projection, including friendly truth and assessed enemy contacts;
- that faction's typed orders.

The complete views are returned to the caller for strategic-AI and test use. Only stable content hashes and source metadata are persisted in the resolution report. This prevents save bloat while proving which information boundary a resolver or future AI planner consumed.

## Resolution phases

Every resolver phase has a fixed sequence and an explicit report, even when the current slice has no material work for that phase.

| Sequence | Phase | Current responsibility |
|---:|---|---|
| 0 | `timeBoundary` | lock resolution and advance the candidate exactly one segment |
| 1 | `environment` | reserved deterministic weather/ground boundary |
| 2 | `orders` | preserve committed intent for this boundary |
| 3 | `movement` | calculate due redeployments from frozen forces; apply simultaneous net deltas; release returned transport |
| 4 | `logistics` | apply boundary production from frozen control and allocation |
| 5 | `intelligence` | schedule affordable baseline enemy collection, resolve both factions symmetrically, update knowledge |
| 6 | `engagements` | reserved contact-to-engagement lifecycle boundary |
| 7 | `consequences` | reserved idempotent tactical/delegated result boundary |
| 8 | `control` | extend fronts from eligible held tiles using stable faction/tile order |
| 9 | `objectives` | reserved objective/score/victory evaluation boundary |
| 10 | `finalize` | recalculate derived theater power, synchronize typed execution lifecycle, and return to planning/engagement state |

Within a phase, records use explicit stable order. Redeployments sort by due segment and then stable decision ID. Tile, faction, order, and reservation processing follows their persisted order arrays.

## Transaction and rollback contract

1. Validate the source runtime and authored-content identity.
2. Build and hash legal faction views from the source.
3. Enter `runCampaignRuntimeTransaction` with a stable `segment:<from>:<to>` label.
4. Resolve every phase against its defensive candidate while retaining a frozen copy for calculations that must not observe same-segment output.
5. Return material events plus structured segment-report metadata to the transaction boundary.
6. The boundary owns revision, event identity/order, RNG serialization, report identity, and final invariant validation.
7. Publish the candidate only after every invariant passes.
8. On an exception or invariant failure, return the structured rejection and an exact defensive copy of the source.

No compatibility method may notify or reconcile during the segment. `CampaignState` hydrates the legacy UI projection only after the authoritative result commits.

## Resolution report contract

`CampaignResolutionReport` now records:

- `resolutionKind`: ordinary mutation or segment;
- `fromSegment` and `toSegment`;
- frozen faction view checkpoints with content hashes;
- ordered phase reports with material event counts and affected record IDs;
- transaction/revision identity and final event IDs.

The report is runtime-owned, covered by save checksums, and validated on load. UI uses the report rather than reconstructing consequences from mutable state.

## Current-slice boundaries

- C20-014 owns multi-segment advance, event stops, alerts, pause reasons, and timeline controls.
- Weather/ground simulation remains C20-050; its stable phase is present but empty.
- Strategic AI order generation remains C20-030/C20-031; frozen views are ready for it.
- New offensive/contact/interception/retreat movement rules remain future domain resolvers.
- Pre/post autosave policy and named save UI remain the save milestone; C20-013 guarantees an atomic state suitable for those checkpoints.

## Acceptance checklist

- [x] one button action produces one runtime revision and one segment increment;
- [x] persisted report identifies the segment, frozen views, phases, and emitted events;
- [x] legal faction views contain no opposing exact force arrays and are deeply frozen;
- [x] same-origin and chained due moves cannot consume same-segment arrivals;
- [x] daily production reads frozen control/allocation rather than movement results;
- [x] intelligence resolves once for both factions inside the same transaction;
- [x] typed order and reservation execution lifecycles synchronize before commit;
- [x] a thrown phase rolls back segment, state, event history, and RNG exactly;
- [x] an invariant-invalid phase candidate rolls back with a structured issue;
- [x] save/load preserves the complete last segment report;
- [x] UI reports success or a recoverable failure without presenting partial state;
- [x] focused tests, full tests, TypeScript, lint, build, browser, and diff checks pass.

## Verification record

- `CAMPAIGN_SEGMENT_FREEZES_AND_RESOLVES_SIMULTANEOUSLY` certifies deeply frozen faction-safe views, opposing-truth filtering, exact one-segment/one-revision advancement, complete phase/event accounting, no same-segment movement chaining, frozen-control production, symmetric intelligence, and deterministic replay.
- `CAMPAIGN_SEGMENT_ROLLS_BACK_THROW_AND_INVARIANT_FAILURE` certifies exact state/event/RNG rollback for thrown and invariant-invalid phases plus structured invariant diagnostics.
- `CAMPAIGN_STATE_SEGMENT_REPORT_SURVIVES_SAVE_LOAD` certifies CampaignState integration, typed production/reservation lifecycle finalization, checksummed report persistence, and deterministic continuation after load.
- focused C20-013 harness — passed;
- repository-wide `npm test` — passed;
- full-theater isolated segment profile — 12 ms on the certification workstation;
- browser verification — passed across 1440×1000 and 800×900: HTTP 200, meaningful command shell, no Vite overlay or page exception; the narrow interaction flow verified the Day 1 00:00–03:00 to 03:00–06:00 atomic clock transition, player-facing three-material-update report, visible Advance/tray/status, and no horizontal overflow; only the pre-existing unauthenticated guest endpoint HTTP 400 console responses were observed;
- `npx tsc --noEmit` — passed;
- `npm run lint -- --quiet` — passed repository-wide;
- `npm run build` — passed with existing dynamic-import and chunk-size warnings only;
- `git diff --check` — passed with line-ending conversion warnings only.
