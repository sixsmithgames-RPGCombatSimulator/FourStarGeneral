## Context

- Mission-start allied control adds the training scenario's predeployed Recon Bike patrol to the player initiative queue.
- The tutorial advances from the first recon move to the engineer lesson after the enemy recon responds, even when another player recon activation remains in initiative 7.
- A stale inactive recon selection can also treat the engineer's occupied hex as a move destination before the click router considers it a new active-unit selection.

## Plan

- Re-enter the recon selection lesson when the initial enemy-response phase returns control to another ready player recon.
- Resolve the active player member of a clicked stack from the authoritative initiative queue.
- Prefer selecting that active member when the previously selected formation belongs to another initiative band; preserve legal friendly-stack movement for an active selected formation.
- Keep mission-start allied ownership and normal non-tutorial initiative sequencing unchanged.

## Alternatives Considered

- Automatically hold the transferred patrol: rejected because it would remove the allied formation from player command during the tutorial.
- Remove the authored allied patrol from training: rejected because the scenario data is valid and the tutorial should support multiple formations in one initiative band.

## Test Plan

- Add a tutorial progression regression proving a second ready recon loops back to the recon lesson and an engineer group advances normally.
- Add a click-routing regression with an inactive selected recon, a highlighted friendly destination, and an active engineer on the clicked hex.
- Preserve the existing regression proving an active formation can move onto a legal friendly stack.
- Run the full unit suite, production build, focused lint, repository lint, and the complete wide-desktop tutorial.

## Impact

- Performance: click-time and tutorial-transition lookups only; no render-loop work.
- Accessibility: guided highlighting remains attached to the real selectable formation.
- State integrity: initiative eligibility remains queue-derived, and no unit ownership or activation state is mutated by selection.
