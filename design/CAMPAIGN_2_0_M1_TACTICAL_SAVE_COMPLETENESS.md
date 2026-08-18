# Campaign 2.0 Milestone 1: Tactical Save Completeness

Status: implemented and certified 2026-08-04  
Work item: C20-015  
Depends on: C20-003 deterministic state, C20-005 campaign save repository  
Unblocks: C20-016 save UX, C20-022 tactical result extraction

## Outcome

A campaign save can now own one complete, engagement-bound tactical continuation. Loading hydrates tactical rule authority before rebuilding presentation. A placement list is no longer treated as sufficient proof of a resumable battle.

The implemented record is:

```text
CampaignSavePayload
  runtime
  activeBattle
    engagementPackage (campaign/revision/scenario/engagement binding)
    battle
      engineConfig
      engine
      initiative
      missionRules + missionStatus
      precombat/commander/campaign bridge
      stable boundary proof
    tacticalUI
  commanderRosterLink
  uiResumeContext
```

The campaign envelope checksum covers the active battle together with campaign runtime. Tactical validation is performed before save-envelope hydration and again at the battle resume boundary.

## Ownership rules

| State | Authority while battle is active | Serialized owner | Hydration owner |
|---|---|---|---|
| Campaign identity, revision, active engagement | `CampaignRuntimeState` | `CampaignBattleSavePackage` binding | `CampaignState` validates before accepting |
| Scenario/config/rule dictionaries | `BattleState.engineConfig` | `CompleteSerializedBattleState.engineConfig` | `BattleState.hydrateComplete()` |
| Placements, reserves, formations, status | `GameEngine` | `SerializedBattleState` | `GameEngine.hydrateFromSerialized()` |
| Turn, faction, action commitments | `GameEngine` | `SerializedBattleState` | `GameEngine.hydrateFromSerialized()` |
| Initiative queue/current activation | initiative integration layer | `SerializedGameEngineInitiativeState` | initiative manager/integration hydration |
| Objective controller closure state | `MissionRulesController` | `SerializedMissionRulesState` | mission-specific controller hydration |
| Supply, logistics, convoy state | `GameEngine` | `SerializedBattleState` | `GameEngine.hydrateFromSerialized()` |
| Air/support pending work | `GameEngine` | `SerializedBattleState` | `GameEngine.hydrateFromSerialized()` |
| Intel/counterintel state | `GameEngine` | `SerializedBattleState` | `GameEngine.hydrateFromSerialized()` |
| Precombat, commander, bridge | `BattleState` | `CompleteSerializedBattleState` | `BattleState.hydrateComplete()` |
| Selection, camera, panels, activity feed | `BattleScreen` | `TacticalUIResumeContext` | `BattleScreen.resumeActiveCampaignBattle()` |

Campaign state is the owner of a campaign-linked battle save. `BattleState` and `BattleScreen` can construct or hydrate the tactical portion, but cannot attach it to another campaign. `CampaignState.setActiveBattleSave()` requires an exact match on:

- campaign ID;
- campaign runtime revision;
- scenario key;
- active engagement ID.

Changing any binding rejects the tactical save. There is no silent rebasing, copying, or “best effort” attachment.

## Tactical completeness matrix

### Formation and map state

Persisted:

- Player, Bot, and Ally placements;
- overflow stacks and stable unit IDs through the flattened faction snapshots;
- ground and airborne reserves;
- formation status pools, strength, experience, ammo, fuel, facing, entrenchment, tow/sentry/suppression data carried by each unit;
- hex modifications, smoke duration, facing-specific works, and fortification integrity;
- base camp and mutable scenario objective records.

Placement hydration clears all faction maps and overflow stacks first, then restores stable units. It does not merge the save with constructor-seeded units.

### Turn and action state

Persisted:

- battle phase, active faction, and turn;
- per-faction action flags keyed by stable unit ID;
- movement, attacks, retaliation use, smoke, facing, sentry/support commitments;
- Player idle-unit registry;
- initiative queue, current queue index, current activation, active flag, and initiative subphase;
- initiative UI band cursor/session and explicitly skipped formations.

Initiative hydration does not regenerate sort order, start a turn, or consume the next activation. It validates duplicate unit IDs and verifies that the current activation belongs to its queue.

### Supply and logistics

Persisted:

- per-unit supply mirrors for all factions;
- depot inventory baseline/bonus/current values;
- production rates, pending shipments, ledger, and last-update turn;
- rolling supply histories used for trends and consumption rules;
- convoy cargo/status/assignment maps;
- convoy service history and monotonic fairness sequences;
- Player supply priorities;
- medical/repair care events;
- transport airlift turn and used-flight count;
- pending battle requisitions and requisition point/counter state.

Supply snapshot reads are now pure when history is empty. They may derive a presentation snapshot, but do not add a new authoritative history entry merely because the UI opened after load.

### Air, support, and deferred effects

Persisted:

- scheduled air missions and unit-to-mission assignments;
- refit timers and aircraft ammunition/rearm state;
- AA engagement counts and limits;
- mission reports;
- pending mission arrivals and air engagement events;
- pre-resolved mission air-phase and escort ledgers;
- support asset charges, cooldown, queued target/caller, and damage cap;
- pending support impact events;
- support-resolution turn in initiative orchestration.

This is important because many of these records are deliberately consumed after the visible command. Omitting them would replay or erase a deferred strike after load.

### Intelligence and counterintelligence

Persisted:

- recon snapshot;
- remembered enemy contacts and confidence state;
- counterintelligence operations;
- false-brief verification state;
- deception/verification resources;
- counterintelligence ID counter.

The save retains only the tactical engine's existing Player intelligence implementation. Expanding tactical faction-local intelligence is a separate rules feature; the save contract already separates the relevant collections rather than reconstructing them from unrestricted unit truth.

### Logs, rules, and deterministic continuation

Persisted:

- combat reports and report counter;
- casualty ledger;
- air mission reports;
- activity feed and its sequence;
- pending Bot turn summary;
- queued precombat allocation requests;
- commander bonuses;
- unit, combat-report, air-mission, requisition, counterintel, and logical-event counters;
- deterministic tactical RNG state;
- mission-specific objective-controller closure state and current `MissionStatus`.

Mission controllers now expose explicit versioned serialization/hydration. River Watch hold counters, Town Defense opening-force baseline, Pointe du Hoc hold/counterattack state, Two Bridges phase/outcome, historical battle phase/outcome, and Citadel Ridge outcome survive reload.

Generated unit IDs no longer include `Date.now()`. Rule-relevant random ordering uses a persisted xorshift32 stream. Persisted event IDs and timestamps use a monotonic logical battle clock. This makes the next transition reproducible from the same snapshot.

## UI resume context

Restored after authority hydration:

- selected hex and selected stacked formation ID;
- intelligence overlay expanded/collapsed state;
- active popup;
- activity-log collapsed state and entries;
- viewport zoom and pan;
- regular/quick animation preference;
- objective-cycle index;
- seen air-report IDs;
- initiative group cursor/session/skipped list.

The accessibility-settings field is a reference slot, currently `null`, because no stable application-wide accessibility profile record exists yet. C20-016/C20-061 may point this field at that profile without changing tactical rules state.

Excluded and rebuilt:

- hover state and derived move/attack previews;
- transient target-range overlays;
- active sound playback positions;
- animation DOM and effect sprites;
- renderer caches, LOS caches, roster/support presentation caches;
- focus history for dialogs that cannot exist at a stable save boundary.

## Stable save boundaries

`BattleScreen.getTacticalSaveAvailability()` returns a typed availability result and one of four boundary proofs:

| Boundary | Allowed condition |
|---|---|
| `deploymentActionComplete` | deployment is idle after a complete placement/recall/base action |
| `playerDecision` | Player owns the decision phase and no resolver/animation/modal is active |
| `activationBoundary` | initiative is active with no current activation in flight |
| `turnBoundary` | a complete non-deployment Player boundary outside automation |

A snapshot is rejected or must be queued by future UI when:

- air/combat presentation or mission-log synchronization is active;
- camera is frozen for an atomic effect;
- initiative turn advance is resolving;
- attack confirmation is committing;
- an attack, end-turn warning, or mission-end decision is open;
- Bot/Ally automation owns the turn;
- the battle has completed and awaits campaign reconciliation.

JavaScript rule mutations are synchronous. A user event cannot interleave inside one mutation call; the additional busy flags cover the asynchronous presentation/resolver windows around those mutations.

## Save and load sequence

### Capture

1. Ask `BattleScreen` for a stable boundary.
2. Serialize `GameEngine` with `completeStateVersion: 1`.
3. Serialize initiative and mission-rule closure state.
4. Add precombat, commander, bridge, and tactical UI context.
5. Bind the result to current campaign ID/revision/scenario/engagement.
6. Run strict completeness and binding validation.
7. Attach the defensive clone to `CampaignState`.
8. Let the existing campaign repository checksum, write, read back, and atomically advance its slot.

### Resume

1. Verify campaign envelope checksum and runtime invariants.
2. Verify the active battle completeness marker and exact campaign binding.
3. Construct a fresh `GameEngine` from the stored config.
4. Clear constructor state and hydrate all tactical authority.
5. Recreate and hydrate the mission controller.
6. Recreate and hydrate initiative integration without advancing it.
7. Rebuild map/render caches and apply tactical UI resume context.
8. Route directly to the battle screen.

Hydration failure is fail-safe: it does not substitute an unrelated tactical state or discard the verified campaign record.

## Compatibility and migration

The existing `SerializedBattleState` shape remains able to read legacy partial snapshots for internal tests and compatibility tools; completeness-only fields are optional at that low-level type. `GameEngine.serialize()` always emits `completeStateVersion: 1` and every required field.

Only `CompleteSerializedBattleState` and `ActiveCampaignBattleSave` are accepted for campaign attachment. The strict validator enumerates every required optional low-level field and rejects any partial record.

The outer campaign envelope remains version 1 because active battle was a planned, explicitly gated nullable field in that same schema stream. Its checksum covers the newly legal complete value. A future incompatible structural change must bump the envelope or add a pure migration.

`CampaignBattleSavePackage` is the C20-015 identity/provenance subset. C20-021 will expand it into the full committed formation, support, resource, briefing, and environment package without weakening the current binding.

## Certification

C20-015 is certified by tests proving:

- a complete engine snapshot includes Ally, supply, action, deferred effect, log, RNG, and counter state;
- serialize → fresh hydrate → serialize is byte-equivalent;
- two engines loaded from the same snapshot produce identical next-turn placements, logistics, logs, queues, RNG, and counters;
- an in-progress initiative queue/current activation round-trips exactly;
- a battle save bound to another campaign revision is rejected;
- the existing full test suite remains green.

Focused certification: `TACTICAL_SAVE_COMPLETE_STATE_ROUND_TRIPS_EXACTLY`, `TACTICAL_SAVE_NEXT_TRANSITION_IS_DETERMINISTIC`, and `TACTICAL_SAVE_INITIATIVE_AND_CAMPAIGN_BINDING_ARE_STRICT` pass.

## Next work: C20-016

C20-015 provides the complete mechanism and direct resume route. C20-016 owns first-class player UX:

- Save/Load command surfaces inside tactical battle;
- visible “Save queued” handling and next-stable-boundary execution;
- rolling tactical autosave slots and retention;
- slot browser metadata/thumbnails;
- explicit recovery choice for quarantined current saves;
- failure, quota, and unsupported-version presentation;
- accessibility profile persistence and focus restoration;
- browser-level certification of capture, reload, and direct battle resume.

