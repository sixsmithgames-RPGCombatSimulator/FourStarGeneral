# Campaign 2.0 M0 — save persistence and legacy migration

**Task IDs:** C20-005, C20-006  
**Canonical specification:** `docs/CAMPAIGN_2_0_FIRST_CLASS_GAME_PLAN.md`  
**Depends on:** C20-001 through C20-004  
**Governance:** `docs/ITERATION_GOVERNANCE.md`

## Task intake

**Goal:** Add a durable, integrity-checked Campaign 2.0 save repository and pure migration path for the shipped version-1 and version-2 local campaign snapshots without replacing or mutating the live save key.

**Scope:**

- versioned campaign save envelope, display metadata, payload, slot index, quarantine, and structured error contracts;
- canonical checksum creation and full envelope validation;
- IndexedDB backend with one-transaction temporary write, read-back verification, final record promotion, and slot-pointer update;
- repository-level named slot history, corruption quarantine, and recovery-candidate discovery;
- pure v1/v2 legacy snapshot parsing and deterministic migration into `CampaignRuntimeState`;
- checked-in legacy fixtures and focused persistence/migration tests;
- documentation, changelog, and traceability updates.

**Out of scope for this bounded iteration:**

- replacing `CampaignState.saveToStorage()` or `loadFromStorage()`;
- deleting, changing, or marking the shipped `fourstar.campaign.save.v1` record;
- save-browser UI, thumbnails, rename/duplicate/delete/import/export UX;
- rolling autosave policy orchestration and retention beyond repository history;
- tactical battle serialization or active-battle saves;
- cloud synchronization.

## Current behavior

- `CampaignState` silently writes one version-2 JSON snapshot to localStorage key `fourstar.campaign.save.v1`.
- the same loader accepts version-1-style `currentDay` and seeds missing intelligence state;
- parse/storage errors are swallowed and there is no checksum, quarantine, slot history, recovery candidate, or atomic pointer;
- authored scenario content and mutable runtime truth are stored together.

## Intended behavior

- a complete save is a versioned envelope with explicit metadata, runtime payload, and checksum;
- envelope creation and loading validate the runtime and reject malformed, unsupported, or content-mismatched saves with stable error codes;
- IndexedDB stores payloads while a slot index points to the current save and retains bounded prior-save IDs;
- an atomic write verifies a temporary record inside the same transaction before promoting it and updating the slot pointer;
- a corrupt current save is quarantined and the newest independently verified prior save is returned only as a recovery candidate, never silently loaded;
- legacy migration is a pure transformation: the original string remains byte-for-byte unchanged and unknown future versions are rejected read-only;
- the current authored scenario is resolved by key, its hash becomes authoritative, and saved tiles, fronts, economies, engagements, time, decisions, and faction knowledge become runtime fields;
- v1 missing knowledge is seeded through the existing faction-specific intelligence model at the migrated segment;
- campaign ID, save ID, and RNG seed are deterministic functions of the legacy snapshot and explicit migration context.

## Acceptance criteria

- [x] Campaign envelopes have explicit schema/build/content identity, slot/game mode, timestamps, display metadata, runtime payload, and a checksum covering every field except the checksum itself.
- [x] Envelope validation rejects malformed structure, invalid runtime state, unsupported future envelope versions, checksum changes, and expected scenario-content mismatches.
- [x] IndexedDB writes use one transaction to stage, read back, verify, promote, update the slot pointer, and remove the temporary record.
- [x] A failed/interrupted atomic commit leaves the prior slot pointer and prior verified save readable.
- [x] Slot history is bounded and deterministically ordered; a corrupt current record is quarantined with metadata and exposes the newest verified prior save as an explicit recovery candidate.
- [x] Version-1 `currentDay` snapshots migrate to the canonical three-hour segment and seed isolated Player/Bot knowledge.
- [x] Version-2 `currentSegment`, intelligence, decisions, active engagement, mutable tiles/fronts/economies, and pending engagements survive migration.
- [x] Migration uses the resolver-provided immutable scenario definition and its content hash; incompatible saved mutable references fail without producing an envelope.
- [x] Unknown legacy versions are rejected with an explicit read-only compatibility error.
- [x] Migration does not write, remove, or otherwise mutate the source localStorage record.
- [x] Focused tests, full tests, TypeScript production build, repository lint, and diff validation pass.

## Data and ownership decisions

`CampaignRuntimeState` remains the only mutable game truth inside the payload. Slot labels, timestamps, and landing-screen summaries live in the envelope/index because they describe the stored artifact rather than campaign rules.

The repository stores immutable envelope records by `saveId`. Overwriting a named slot creates a new envelope and atomically moves only the slot pointer. Earlier records remain available through `previousSaveIds` until explicit retention work removes them. This copy-on-write layout prevents an interrupted overwrite from damaging the previous save.

The checksum uses the existing canonical serializer and versioned FNV-1a implementation. It is an integrity and interruption detector, not a cryptographic authenticity mechanism. A future format can introduce a stronger checksum without changing v1 verification.

## Storage transaction

```text
validate envelope/runtime/checksum
              ↓
open one IndexedDB readwrite transaction
              ↓
write temporary envelope record
              ↓
read temporary record back + verify checksum
              ↓
write immutable final save record
              ↓
write slot pointer/history entry
              ↓
delete temporary record
              ↓
transaction commits atomically
```

Any request failure aborts the transaction. The previous slot record and its current save therefore remain unchanged.

## Legacy migration rules

| Legacy field | Campaign 2.0 destination |
|---|---|
| `scenario.key` | scenario resolver key and `runtime.scenarioKey` |
| saved scenario tiles | runtime tile control, forces, control timestamp, visual overrides |
| saved scenario fronts | compatibility projection until derived-front work lands |
| saved economies | runtime faction economies |
| `currentDay` | `(currentDay - 1) * 8` segments |
| `currentSegment` | runtime segment unchanged |
| decisions | compatibility queued decisions |
| engagements | runtime opportunity records |
| `activeEngagementId` | proven in-battle engagement and runtime engagement state |
| v2 faction knowledge | runtime faction-separated knowledge unchanged |
| missing v1 knowledge | seeded through current intelligence initialization rules |
| absent random state | deterministic migration seed derived from canonical legacy content |

The authored definition is never rebuilt from mutable legacy tiles/economies. It is resolved independently by scenario key. The adapter receives explicit runtime-state overrides so the runtime preserves saved progress while keeping the resolver-provided content hash.

## Error handling

- schema, checksum, runtime, content, storage, transaction, quota, unsupported-version, and migration failures have stable `CampaignSaveError` codes;
- unknown values are shape-checked before runtime validation so corrupt input cannot trigger unsafe property access;
- repository reads do not substitute a default campaign;
- recovery candidates are returned separately from successful loads;
- quarantined records retain the raw record when cloneable plus the failure reason and available display metadata;
- browser environments without IndexedDB fail explicitly rather than falling back to localStorage.

## Test plan

- checksum stability and mutation detection;
- malformed/future envelope and content-hash rejection;
- successful atomic slot creation and overwrite history;
- injected interrupted/quota commit with prior-pointer preservation;
- corrupt-current quarantine and verified recovery-candidate selection;
- v1 fixture day conversion, deterministic identity/RNG, knowledge seeding, and repeat migration equality;
- v2 fixture state preservation, active engagement lifecycle, compatibility projection, and envelope round trip;
- incompatible scenario-content fixture and future legacy version rejection;
- source-string immutability assertion;
- full repository gates.

## Rollback and impact

- no existing consumer, save key, localStorage record, UI, tactical state, or campaign mutation path changes;
- the only existing runtime change is an explicit adapter option allowing migration-supplied tiles, economies, and fronts while retaining the immutable resolved definition;
- rollback removes the new persistence modules, tests/fixtures, test registration, this note, and related documentation entries.

## Verification record

Verified on 2026-08-02:

- `npm test` — passed the full custom suite, including all five persistence/migration certification cases; existing Node-only relative asset URL warnings remain unchanged;
- focused Campaign 2.0 persistence run — passed envelope, interruption, recovery, v1 migration, and v2 migration cases;
- `npm run build` — passed TypeScript compilation and the Vite production build;
- `npm run lint -- --quiet` — passed repository-wide;
- focused persistence/runtime/fixture lint — passed;
- `git diff --check` — passed.

This evidence certifies C20-005 and C20-006 as an isolated persistence/migration layer. It does not certify the live `CampaignState` cutover, player-facing save browser, autosave orchestration, or tactical saving.
