# Changelog

## 2026-06-30

### Fixed

- Kept the training tutorial in the recon lesson until every player-controlled initiative-7 patrol has acted.
- Prevented stale inactive-unit movement highlights from blocking selection of the current initiative group.

## 2026-06-29

### Fixed

- Transferred every predeployed allied formation to player control when `Begin Mission` is selected.
- Preserved allied unit identity, damage status, supply state, stacking, and logistics tracking during transfer.
- Ensured transferred allied formations enter the opening player initiative queue without requiring map contact.

## 2026-06-28

### Fixed

- Replaced the initiative `Commit Orders` action with a group-scoped `Next Group` command.
- Prevented group advancement from placing formations in later initiative groups on sentry.
- Exposed `End Turn` only after every initiative group in the round is complete.

## 2026-06-21

### Fixed

- Corrected Recon Bike patrols to use soft-target attack values and exposed-recon hit distributions.
- Prevented platform equipment damage from masking later personnel casualties in readiness calculations.
- Capped abstract expected damage at the defender's remaining strength.
- Unified attack-type reporting between the engine, activity log, and expanded combat breakdown.
