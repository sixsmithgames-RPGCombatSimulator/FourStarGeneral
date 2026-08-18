# Campaign 2.0 M0 — live compatibility cutover

**Task IDs:** C20-007, C20-008  
**Canonical specification:** `docs/CAMPAIGN_2_0_FIRST_CLASS_GAME_PLAN.md`  
**Depends on:** C20-001 through C20-006  
**Governance:** `docs/ITERATION_GOVERNANCE.md`

## Task intake

**Goal:** Make `CampaignRuntimeState` the authoritative state behind the shipped `CampaignState` API, route the campaign Save/Load controls through the certified IndexedDB repository, and migrate the existing localStorage record only after verified write-through.

**Scope:**

- runtime/definition ownership inside `CampaignState`;
- behavior-preserving compatibility projection and transaction reconciliation at existing notification boundaries;
- runtime inspection methods required by persistence and certification;
- async primary-slot save/load/recovery APIs using `CampaignSaveRepository`;
- pure legacy save migration using the currently resolved authored scenario;
- a small localStorage migration marker written only after new-save verification and successful hydration;
- CampaignScreen Save/Load status, failure, and explicit recovery handling;
- focused equivalence, revision, migration, persistence, and deterministic-continuation tests;
- documentation, changelog, and traceability updates.

**Out of scope for this bounded iteration:**

- command-shell/interface overhaul, named-slot browser, rename/duplicate/delete/import/export UX;
- autosave scheduling and retention orchestration;
- changing campaign rules, AI, objectives, consequences, formations, weather, or tactical behavior;
- removing editor surfaces or rewriting all legacy domain methods into typed orders;
- deleting the shipped localStorage record;
- tactical battle saving.

## Ownership model

At rest:

```text
CampaignScenarioDefinition (frozen authored content)
                    +
CampaignRuntimeState (only mutable truth)
                    ↓
projectLegacyCampaignState()
                    ↓
compatibility projection used by current getters/screens
```

During one existing synchronous mutation:

```text
committed runtime
      ↓ defensive projection
temporary compatibility draft
      ↓ existing CampaignState rule method
notify(reason) stable boundary
      ↓ canonical change detection
runCampaignRuntimeTransaction()
      ↓ validated commit or exact rollback
fresh compatibility projection
      ↓ listeners render committed state only
```

The compatibility object is a derived draft/cache, not an independently saved or externally shared source of truth. Every notification first reconciles it into runtime. A no-change notification does not advance runtime revision. A failed candidate restores the projection from the last safe runtime before the error escapes.

`setScenario()` is the only authored-content replacement boundary. It freezes a new definition, performs the same shipped initialization on a working clone, creates a new runtime with deterministic session identity/RNG, and then publishes the committed projection.

The shipped `campaign01` Bot economy predates the required ammo stock field. The legacy adapter materializes a missing value as zero, matching existing nullish stock behavior; a present negative, non-finite, or otherwise malformed value still fails runtime invariants.

## Persistence flow

### Save

1. flush/verify the current compatibility projection into runtime;
2. create a new immutable envelope at the current runtime revision;
3. atomically write it to the primary manual IndexedDB slot;
4. report success only after repository read-back/pointer commit succeeds.

### Load existing Campaign 2.0 slot

1. verify slot index, envelope checksum, runtime invariants, and current authored scenario hash;
2. hydrate runtime;
3. regenerate compatibility projection;
4. notify existing screens.

### First load with only legacy localStorage

1. read but do not modify `fourstar.campaign.save.v1`;
2. purely migrate against the currently resolved authored definition;
3. atomically write the new primary IndexedDB slot;
4. load and verify the newly stored envelope;
5. hydrate runtime and projection;
6. write a separate migration marker containing source hash/new save identity;
7. leave the original legacy value byte-for-byte present.

### Corruption/recovery

The state API returns repository failure and its verified prior recovery candidate. CampaignScreen asks the player before applying that candidate. Discovery alone never changes the slot pointer or active campaign.

## Acceptance criteria

- [x] `campaign01` initializes through a frozen definition/runtime split and produces the same visible friendly scenario, economy, time, engagements, and intelligence projection as the shipped path.
- [x] `CampaignRuntimeState` is available as a defensive snapshot and is the payload used by new saves.
- [x] Every changed compatibility notification commits exactly one validated runtime revision at that boundary; unchanged notifications commit none.
- [x] Failed reconciliation restores the compatibility projection from the exact last valid runtime and does not notify listeners with invalid state.
- [x] Existing CampaignState public gameplay methods and existing campaign/intelligence/battle tests retain behavior.
- [x] Primary Save writes only the checksummed IndexedDB envelope/slot path and reports storage failure instead of claiming success.
- [x] Primary Load verifies current authored content before hydrating and never silently applies a recovery candidate.
- [x] First legacy Load writes and verifies a new Campaign 2.0 save before writing a migration marker; the original legacy key remains unchanged.
- [x] Saving/reloading and then advancing a fixture produces the same visible state and deterministic runtime RNG as uninterrupted advancement.
- [x] Player and Bot map/intelligence projections remain faction-filtered after runtime commit, new-save load, and legacy migration.
- [x] CampaignScreen Save/Load handlers await persistence, disable repeated input while busy, surface failures, and require confirmation before recovery.
- [x] Focused tests, full tests, production build, repository lint, and diff validation pass.

## Error handling

- runtime reconciliation failures throw a stable `CampaignRuntimeError` after rollback;
- persistence/migration failures retain `CampaignSaveError` codes and are converted into actionable CampaignScreen status text;
- missing IndexedDB is explicit; live UI never falls back to writing the old localStorage snapshot;
- content mismatch and future versions remain read-only and are not quarantined as corruption;
- migration marker write failure does not invalidate the successfully written/loaded save and is reported as a warning result;
- listener exceptions remain isolated after committed-state publication.

## Compatibility decisions

- existing synchronous `saveToStorage()`, `loadFromStorage()`, and `hasSave()` remain temporarily for non-UI legacy callers/tests but are deprecated and no longer used by CampaignScreen;
- current domain methods are not rewritten into typed commands in the same iteration; that belongs to C20-012/C20-013;
- headquarters status is UI/session state and remains outside authoritative campaign runtime;
- editor `setScenario()` remains an explicit new-definition boundary until developer-mode/editor separation lands.

## Test plan

- campaign01 adapter startup equivalence and recursive definition freeze;
- runtime revision/no-op notification behavior;
- economy, time, decisions, engagements, tile forces/fronts, and faction knowledge projection after representative mutations;
- injected invalid compatibility mutation rollback;
- new primary slot save/load round trip with defensive state;
- legacy v1/v2 first-load migration, verified write, marker, and untouched source bytes;
- current corrupt save with recovery candidate not applied until explicit restore;
- uninterrupted versus save/load/advance deterministic comparison;
- existing full campaign/intelligence/UI/battle suite.

## Rollback and impact

- no rule constants, scenario content, renderer coordinates, tactical package, or public player mechanic changes;
- rollback restores CampaignState storage/UI calls to the legacy path and removes the cutover tests/note while leaving the isolated runtime and save layers intact;
- new IndexedDB saves remain immutable and readable even if the UI temporarily returns to compatibility mode.

## Verification record

Verified on 2026-08-02:

- `npm test` — passed the full custom suite, including five live-cutover cases and all existing campaign, intelligence, UI, battle-generation, and mission-flow tests; existing Node-only relative asset URL warnings remain unchanged;
- focused live-cutover run — passed campaign01 equivalence, commit/rollback, deterministic save/load continuation, v1/v2 write-through, and explicit recovery cases;
- `npm run build` — passed TypeScript compilation and the Vite production build;
- `npm run lint -- --quiet` — passed repository-wide;
- focused CampaignState/CampaignScreen/cutover lint — passed;
- `git diff --check` — passed.

This evidence certifies the Milestone 0 live compatibility cutover. It does not certify the Milestone 1 command shell, named save browser, autosave orchestration, typed orders, or tactical saves.
