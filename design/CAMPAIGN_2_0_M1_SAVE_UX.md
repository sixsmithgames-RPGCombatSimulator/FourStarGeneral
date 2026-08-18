# Campaign 2.0 Milestone 1 — Save UX

**Work item:** C20-016  
**Status:** implemented and certified  
**Depends on:** C20-005, C20-006, C20-015

## Outcome

C20-016 turns the complete tactical snapshot delivered by C20-015 into a player-facing save, load, autosave, and recovery experience. Campaign-linked tactical saves remain owned by their campaign envelope: a player never handles a detached battle file that can be applied to another campaign revision.

The intended player promise is:

> When the battlefield is at a complete decision boundary, Save records the exact battle. If an animation or resolution is still running, the game visibly queues the request and writes it at the next safe boundary. Loading returns directly to that decision point.

## Scope

This slice delivers:

- Save and Load commands in the tactical header;
- a keyboard-operable Save Center with named manual slots and rolling tactical autosaves;
- an explicit save-availability explanation;
- one queued manual request while tactical resolution is unstable;
- three rotating `battle-turn-start` autosave slots per campaign;
- integrity-checked slot loading followed by direct battle hydration;
- explicit earlier-save recovery when the newest record is corrupt;
- visible quota, unsupported-version, binding, and storage errors;
- quarantine diagnostics and export;
- tactical focus, viewport, animation preference, selection, popup, and activity-log restoration;
- tests for scheduling, retention identity, persistence, recovery, and direct resume.

Campaign-wide rename, duplicate, import, export, and deletion commands will use the same repository contracts when the landing-screen campaign save browser is expanded. C20-016 does not weaken or duplicate the existing Campaign 2.0 persistence layer to implement them tactically.

## Authority and ownership

| Concern | Owner | Rule |
|---|---|---|
| Tactical rules truth | `BattleState` / `GameEngine` | Captured only through `serializeComplete()` |
| Stable-boundary proof | `BattleScreen` | Re-evaluated immediately before capture |
| Campaign binding | `ActiveCampaignBattleSave` validator | Campaign, revision, scenario, and engagement must match exactly |
| Envelope/checksum | `CampaignState` + `CampaignSaveEnvelope` | UI never authors or edits a checksum |
| Atomic slot/history | `CampaignSaveRepository` | New immutable save is verified before the slot pointer advances |
| Browser storage | `IndexedDbCampaignSaveBackend` | Payloads and quarantine remain in IndexedDB |
| Save request scheduling | `TacticalSaveCoordinator` | At most one write and one queued request are active |
| Presentation/focus | Tactical Save Center | Restored only after authoritative hydration succeeds |

## Slot policy

All tactical slots contain a complete campaign envelope whose `activeBattle` is non-null.

### Manual slots

- A new slot gets a stable ID under the active campaign namespace.
- The player supplies a visible name.
- Selecting an existing manual slot exposes an explicit overwrite action.
- Overwrite creates a new immutable envelope; prior records remain in bounded repository history.

### Tactical autosaves

Three fixed slots rotate by tactical turn:

- `battle-turn-start-0`
- `battle-turn-start-1`
- `battle-turn-start-2`

The campaign ID namespaces those identities. A turn-start key is remembered in memory so UI refreshes and duplicate state notifications cannot write the same autosave twice. Repository history remains bounded independently.

### Before-exit checkpoint

When the document becomes hidden and the battle is stable, the coordinator requests the fixed `battle-before-exit` autosave. If the battle is unstable, it does not attempt a partial snapshot; the most recent turn-start or manual save remains the recovery point.

## Manual save state machine

```text
Idle
  -> request at stable boundary -> Saving -> Saved | Failed
  -> request while unstable     -> Queued
Queued
  -> next stable boundary       -> Saving -> Saved | Failed
  -> newer manual request       -> Queued (new request replaces old request visibly)
Saving
  -> additional request         -> Queued
```

Autosaves never replace an explicitly queued manual request. They may be skipped while another write is active and retried at the next synchronization point.

## Stable-boundary behavior

The Save Center displays the exact reason returned by `getTacticalSaveAvailability()`.

- Stable: Save is written immediately.
- Resolver/animation active: request becomes `Save queued`.
- Modal decision active: player is told to complete or cancel it; an explicit request may still queue.
- Enemy/Ally automation active: request waits until Player control returns.
- Battle completed: tactical saving is rejected because campaign reconciliation owns the next durable checkpoint.
- Not campaign-linked: tactical campaign saves are unavailable; standalone battle persistence requires a separate envelope mode.

The coordinator polls only while a request is queued and is also flushed by battle-state transitions. It never calls tactical serialization until availability is stable.

## Save Center interaction

The dialog contains:

- current availability and live save status;
- a manual-slot name field and `Save new` action;
- existing tactical slots with type, timestamp, campaign phase, turn metadata, and selected state;
- `Overwrite selected` for manual slots;
- `Resume selected` for any verified tactical slot;
- inline recovery when a failed load provides a verified earlier candidate;
- quarantined record diagnostics with an export action;
- a close action and Escape handling.

Focus is trapped inside the open dialog. Closing returns focus to the invoking Save or Load button. A saved tactical context stores the prior battlefield control ID rather than a Save Center control; resume restores that control after map and popup reconstruction.

## Load and recovery sequence

1. Load the selected slot through `CampaignSaveRepository` with current content policy.
2. Verify envelope checksum, runtime invariants, authored content, and complete active-battle binding.
3. If current data is corrupt, quarantine it and return—but do not apply—the newest verified history candidate.
4. Show the recovery candidate and require explicit player confirmation.
5. Apply the verified campaign runtime.
6. Hydrate tactical authority and mission/initiative state.
7. Recreate rendering and presentation state.
8. Restore viewport, selection, popup, activity panel, animation preference, and focus.

On any failure, the currently running battle remains in memory and existing verified slot pointers are unchanged.

## Error language

| Error | Player outcome |
|---|---|
| `QUOTA_EXCEEDED` | Save failed; existing saves are safe; suggest freeing browser storage |
| `STORAGE_UNAVAILABLE` | Storage is unavailable; keep the session open |
| `CHECKSUM_MISMATCH` / invalid envelope | Current record quarantined; offer earlier verified save if available |
| `CONTENT_MISMATCH` | Save belongs to changed authored content and remains read-only |
| unsupported version | A newer game build is required; never overwrite the record |
| campaign binding failure | Refuse load as a different campaign/engagement revision |

## Certification gates

C20-016 is complete when tests prove:

- a manual request made while unstable is captured only after the next stable boundary;
- simultaneous flush calls create one write;
- tactical turn autosave IDs rotate across exactly three slots and do not duplicate a turn;
- named tactical slots contain a complete active battle and load directly into it;
- current corruption is quarantined and recovery requires explicit application;
- focus and tactical UI resume data round-trip;
- full tests, typecheck, lint, build, and browser Save Center smoke verification pass.

## Certification record

Implemented certification includes:

- `TACTICAL_SAVE_UX_QUEUES_UNTIL_STABLE_BOUNDARY`;
- `TACTICAL_SAVE_UX_SERIALIZES_OVERLAPPING_FLUSHES`;
- `TACTICAL_SAVE_UX_ROTATES_THREE_TURN_AUTOSAVES_WITH_DEDUPE`;
- `TACTICAL_SAVE_UX_NAMED_SLOT_RELOADS_COMPLETE_ACTIVE_BATTLE`;
- `TACTICAL_SAVE_UX_CORRUPTION_REQUIRES_EXPLICIT_RECOVERY`;
- the complete pre-existing test suite;
- TypeScript no-emit compilation, lint with zero errors, and production build;
- desktop and 390 × 844 browser verification of the landing resume action and Save Center;
- browser checks for background inertness, focus return, meaningful interactive content, no Vite overlay, and no captured console errors.

## Next work: C20-020

C20-016 completes the Milestone 1 save/resume slice. C20-020 begins the persistent formation substrate: campaign-owned identity, survivors, replacements, refit, upgrade, commander, honors, and formation history that survive every tactical handoff.
