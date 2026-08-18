# Campaign 2.0 M1 — authoritative typed orders

**Task ID:** C20-012  
**Canonical specification:** `docs/CAMPAIGN_2_0_FIRST_CLASS_GAME_PLAN.md`  
**Depends on:** C20-001 through C20-011  
**Governance:** `docs/ITERATION_GOVERNANCE.md`

## Task intake

### Goal

Replace direct player mutations and free-form compatibility decisions with a first-class order loop: plan a typed draft, see exact costs and conflicts, commit every valid draft atomically, and cancel where the underlying action has not started.

### In scope

- authoritative runtime-owned typed orders for redeployment, production, reconnaissance, and counterintelligence;
- machine-readable validation issues with player-facing explanations;
- draft reservations for resources, transport, intelligence capacity, force quantities, assigned assets, and the exclusive production slot;
- deterministic order, reservation, and compatibility-record identities;
- shared draft revalidation and explicit conflict detection;
- atomic multi-order commit with no partial spending or scheduling;
- draft removal plus committed redeployment/intelligence cancellation before execution;
- save/load continuity through the Campaign 2.0 runtime envelope;
- order tray counts, validation messages, commit/remove/cancel controls, status, and ETA;
- conversion of the existing redeployment, production, and intelligence planners from direct mutation to draft creation.

### Out of scope

- simultaneous segment resolution and stop conditions (C20-013/C20-014);
- offensive, defensive, fortification, air, naval, replacement, refit, and upgrade order payloads;
- route editing, dependency authoring, acknowledgement prompts, or drag-to-reorder;
- cancellation after movement or an intelligence operation has begun;
- named save browser, campaign autosaves, and tactical saves.

## Authoritative data contract

`CampaignRuntimeState` owns:

- `orderOrder`: deterministic display/resolution order;
- `orders`: typed records keyed by stable ID;
- `reservationOrder`: deterministic reservation arbitration order;
- `reservations`: typed pool claims keyed by stable ID.

The legacy `CampaignDecision` queue remains an execution adapter only for committed redeployments. It is created from a typed order during the same runtime transaction and never owns a draft.

Each order contains common identity/lifecycle fields plus a complete kind-specific payload:

- **Redeployment:** origin, destination, selected unit quantities, transport, distance, costs, capacity, start, arrival, and transport-return segments.
- **Production:** normalized four-resource allocation and effective segment.
- **Reconnaissance / counterintelligence:** operation type, target, optional contact/asset, duration, capacity, and resource costs.

## Validation and reservation rules

Validation uses stable issue codes and copy. Static legality and shared-pool arbitration are evaluated together in deterministic `orderOrder` sequence.

| Pool | Availability source | Draft conflict behavior |
|---|---|---|
| `resource` | current faction economy | earlier valid draft holds first; later draft reports the shortfall |
| `transport` | total capacity minus committed in-transit capacity | overbooked draft is invalid |
| `intelligenceCapacity` | total minus planned/active operation commitments | overbooked draft is invalid |
| `formation` | current unit quantity at the origin | overlapping move drafts cannot move the same units twice |
| `asset` | current eligible/uncommitted asset | only one valid draft may hold an asset |
| `productionSlot` | one allocation change per commit batch | later production draft conflicts until the earlier draft is removed/committed |

Invalid drafts remain visible and editable-by-removal; they hold no reservations. Removing a draft releases its holds and revalidates later drafts immediately.

## Transaction contract

1. Revalidate the complete order book against current runtime truth.
2. Reject commit if any selected draft is invalid, without changing revision, resources, compatibility records, or operations.
3. Clone the runtime through `runCampaignRuntimeTransaction`.
4. Apply every selected draft in stable order to the clone.
5. Consume its reservations, create the required legacy execution record/operation, and transition the typed order to `committed`.
6. Validate runtime invariants and publish one revision/report only if all operations succeed.

Cancellation is also transactional. A draft is removed. A committed redeployment or intelligence order can be cancelled only while its execution adapter is still queued/planned; costs and committed capacity are restored exactly once and its reservations become `released`.

## UI/UX contract

- Planner confirmation says **Add draft**, never implies that resources have already been spent.
- The tray distinguishes Draft, Conflict, Committed, Executing, Completed, and Cancelled.
- Every invalid draft displays its specific reason next to the order.
- **Commit orders** is enabled only when at least one draft exists and all drafts are valid.
- Removing or cancelling is an explicit per-order button with an accessible label.
- Successful draft creation directs the player to review and commit the tray.
- Successful commit reports how many orders were issued; advancing time remains a separate action.

## Acceptance checklist

- [x] runtime/save schema owns typed orders and reservations;
- [x] invariant validation rejects malformed order/reservation identity, lifecycle, references, and amounts;
- [x] redeployment, production, and all intelligence/counterintelligence operation types create typed drafts;
- [x] draft creation does not spend resources, reserve legacy transport, or schedule intelligence operations;
- [x] competing drafts produce deterministic, machine-readable conflicts;
- [x] invalid multi-order commit is a no-op;
- [x] valid multi-order commit changes one runtime revision and applies every action;
- [x] deterministic IDs contain no wall-clock input;
- [x] draft removal releases holds and revalidates later drafts;
- [x] eligible committed redeployment/intelligence cancellation restores costs and capacity exactly once;
- [x] save/load restores drafts, validation, reservations, statuses, and execution references;
- [x] order tray exposes counts, validation, commit, remove, cancel, status, and ETA;
- [x] focused tests, full tests, TypeScript, lint, build, and diff integrity checks pass.

## Verification record

- `CAMPAIGN_TYPED_ORDERS_RESERVE_AND_CONFLICT_WITHOUT_SPENDING` certifies deterministic IDs, non-spending drafts, stable formation arbitration, proposed-versus-held lifecycle, rejected-commit rollback, and hold reassignment after removal.
- `CAMPAIGN_TYPED_ORDERS_COMMIT_CANCEL_AND_SAVE_ATOMICALLY` certifies cross-domain single-revision commit, execution adapter creation, consumed holds, exact checksummed save/load, cancellation policy, and exact refunds.
- `CAMPAIGN_TYPED_ORDER_INVARIANTS_REJECT_CORRUPT_LEDGER` certifies structured rejection of malformed reservation truth.
- `CAMPAIGN_COMMAND_SHELL_OPERATES_TYPED_DRAFT_TRAY` certifies draft count, enabled atomic commit, remove controls, and controller callbacks.
- focused typed-order and command-shell harnesses — passed;
- repository-wide `npm test` — passed;
- browser verification — passed at 1440×1000 and 800×900: production and Phantom counterintelligence drafts, held-resource/capacity displays, deterministic production-slot conflict, disabled invalid commit, remove/rebalance, atomic commit, responsive Commit visibility, mutually exclusive compact sheets, meaningful page content, and no Vite overlay were verified; the only browser console errors were the pre-existing unauthenticated guest endpoint HTTP 400 responses;
- `npx tsc --noEmit` — passed;
- `npm run build` — passed (existing dynamic-import and chunk-size warnings only);
- `npm run lint -- --quiet` — passed repository-wide;
- `git diff --check` — passed (line-ending conversion warnings only).
