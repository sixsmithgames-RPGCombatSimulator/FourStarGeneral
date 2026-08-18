# Campaign 2.0 M0 — runtime foundation

**Task IDs:** C20-001, C20-002, C20-003, C20-004  
**Canonical specification:** `docs/CAMPAIGN_2_0_FIRST_CLASS_GAME_PLAN.md`  
**Governance:** `docs/ITERATION_GOVERNANCE.md`

## Task intake

**Goal:** Introduce a behavior-preserving, deterministic, versioned Campaign 2.0 runtime model and legacy scenario adapter that can be certified before replacing the current `CampaignState` mutation path.

**Scope:**

- new files under `src/game/campaign/runtime/`;
- focused runtime tests and test registration;
- this design note and the changelog.

**Out of scope for this bounded iteration:**

- replacing `CampaignState` or the current localStorage save path;
- player-visible campaign UI changes;
- new consequence, objective, AI, formation-lifecycle, or weather behavior;
- tactical engine changes;
- IndexedDB and named save UX.

**Acceptance criteria:**

- [x] Current `CampaignScenarioData` can be split into immutable authored definition and mutable runtime records without losing scenario, tile, force, economy, engagement, decision, segment, or knowledge data.
- [x] Re-projecting that definition/runtime pair produces a legacy scenario equivalent to the input.
- [x] Runtime creation uses stable IDs, a content hash, an explicit version, revision, and serialized named RNG streams.
- [x] Identical seeds produce identical named-stream sequences before and after serialization; one stream does not consume another.
- [x] Runtime invariants reject malformed IDs, versions, segments, tile keys, resources, forces, engagements, active engagement references, and knowledge ownership.
- [x] A transaction helper clones the last safe state, validates the candidate, increments the revision exactly once, emits ordered events, and leaves the source unchanged on failure.
- [x] TypeScript build and the full custom test suite pass.

**Risks:**

- Performance: canonical hashing and defensive cloning occur at campaign creation/transaction boundaries, not per frame.
- State coupling: the adapter must not become a second live source of truth. It is initially unintegrated and has one-way creation plus explicit legacy projection.
- UI/accessibility: none; no UI changes in this iteration.

## Current behavior

- `CampaignScenarioData` combines authored map content with mutable tiles, forces, fronts, objectives, and economies.
- `CampaignState` mutates the scenario directly and stores version-2 snapshots in one localStorage key.
- segment resolution has no transaction, revision, domain-event report, or serialized RNG.
- campaign IDs and engagement IDs use time/random sources in UI/engine paths.

## Intended behavior

- authored definition and mutable runtime are explicit and independently cloned;
- every runtime has stable identity, content version linkage, deterministic RNG state, and revision;
- compatibility projection can feed existing screens without mutating authored data;
- candidate mutations are accepted atomically only after invariant validation;
- event order and random streams are deterministic and testable.

## North-star alignment review

The authoritative owner of campaign truth will be `CampaignRuntimeState`. This iteration does not create another store or connect the runtime alongside `CampaignState`; it creates the contracts, adapter, validation, and transaction primitives needed to replace the current mixed state safely in the next behavior-preserving integration iteration.

The authored `CampaignScenarioDefinition` contains initial state only as immutable scenario content. Runtime records are produced as defensive clones and never share references with the definition or input. Legacy projection is a compatibility output, not a mutable owner.

Named RNG streams prevent weather, AI, intelligence, movement, and delegated-combat changes from rerolling one another. The transaction helper is intentionally system-neutral so later resolvers compose through one revision/event boundary instead of inventing parallel mutation paths.

## Planned modules

- `campaignRuntimeTypes.ts`: version constants, definition/runtime/event/report contracts.
- `CampaignRandom.ts`: serialized named deterministic streams and stable ID factory.
- `CampaignCanonical.ts`: stable canonical serialization and content hash.
- `CampaignScenarioAdapter.ts`: legacy definition split, runtime creation, and compatibility projection.
- `CampaignInvariantValidator.ts`: structured invariant validation and fail-fast assertion.
- `CampaignRuntimeTransaction.ts`: clone/validate/commit/reject transaction boundary.

## Error handling

- public creation APIs throw specific `CampaignRuntimeError` instances for invalid inputs;
- validation returns all structured issues for diagnostic/test use;
- transactional failures return the unchanged safe state plus structured rejection details;
- no catch block silently substitutes defaults;
- legacy hex scale is the only explicit migration default and is fixed at the canonical 10 km value documented in the north-star plan.

## Alternatives considered

### Continue adding fields to `CampaignState`

Rejected because authored content and runtime truth would remain coupled, migrations would remain ad hoc, and later AI/save/weather work would create multiple owners.

### Reuse the rendering `SeededRandom`

Rejected because it has no serialized named streams and lives in a rendering module. Campaign determinism must not depend on visual-effect code.

### Integrate the new runtime immediately

Rejected for this iteration because the project prohibits combining structural refactoring with behavior changes. The adapter and deterministic tests must pass first.

## Test plan

- legacy scenario split/projection round trip and defensive-copy checks;
- deterministic content hash independent of object key insertion order;
- RNG stream independence, serialization, range validation, and ID stability;
- invariant fixtures for every acceptance category;
- successful transaction revision/event order/source immutability;
- rejected transaction source preservation and diagnostic issues;
- full `npm test`, `npm run build`, and `npm run lint` where the repository baseline permits.

## Impact

- No current campaign consumer changes.
- No rendering, coordinate conversion, tactical flow, save key, or browser storage changes.
- New code allocates only at campaign creation/transaction boundaries.
- Rollback consists of removing the new isolated modules, test import, design note, and changelog entry.

## Verification record

Verified on 2026-08-02:

- `npm test` — passed, including the five Campaign 2.0 foundation tests; the existing Node-only sound-catalog URL warnings remain unchanged;
- `npm run build` — passed TypeScript compilation and the Vite production build;
- `npm run lint -- --quiet` — passed repository-wide;
- `npx eslint src/game/campaign/runtime/*.ts tests/CampaignRuntime.foundation.test.ts --quiet` — passed focused lint;
- `git diff --check` — passed.

This evidence certifies C20-001 through C20-004 as isolated foundation work. It does not certify the remaining Milestone 0 persistence, migration, or live-integration exit criteria.
