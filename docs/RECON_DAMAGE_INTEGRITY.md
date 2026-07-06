# Recon Damage Integrity

## Intent

Ensure motorcycle reconnaissance patrols take concrete, status-derived damage from valid weapon contacts and that new personnel casualties cannot be hidden by pre-existing equipment damage.

## Root Cause

Three independent rules disagreed about the target:

1. Combat request builders classified only infantry and specialists as soft targets, so Recon Bike patrols used hard-attack values.
2. The hit-distribution resolver treated exposed light recon almost entirely as buttoned armor, causing valid contacts to become non-effects a second time after accuracy had already determined contact.
3. Platform readiness selected the lower of personnel and equipment readiness. When equipment was already lower, additional personnel damage could be recorded without changing formation strength.

## Corrected Model

- Exposed light recon is a soft target. Armored recon cars remain protected hard targets.
- Recon Bike contacts use the existing authored `vsArtillery` distribution, whose contract already covers exposed artillery and recon targets.
- Platform readiness is calculated as:

  `100 - personnel readiness loss - equipment readiness loss`

  Both values are normalized full-strength-equivalent losses. At full personnel readiness, a destroyed vehicle retains its full proportional effect. Once both channels are degraded, later vehicle or personnel hits are not reduced by unrelated damage in the other channel.
- Abstract expected damage is capped to the defender's remaining strength. Detailed status packets remain the source of truth for displayed and applied damage.

## Impact

- Player preview, attack resolution, retaliation, mission combat, and bot combat use the same soft-target helper.
- Activity details and the expanded technical breakdown use the same classification as the engine.
- HQ and logistics readiness summaries automatically receive corrected values because they already consume formation status summaries.
- Public packet and event schemas are unchanged.

## Regression Coverage

- Two disabled bikes establish an 88.89% equipment baseline; one later injured scout must reduce readiness further.
- Ranged infantry contacts against an already-damaged patrol must produce multiple personnel effects and nonzero readiness loss.
- Motorcycle recon must use exposed-target distributions.
- Armored recon cars must remain hard targets.
- Damage matrix, sequential damage, contact-pressure, and battle-preview suites must remain green.

## Known Limitations

The engine models deterministic expected outcomes rather than individual bullet trajectories. Casualty counts are whole status transitions derived from expected contacts, and platform readiness assumes personnel and equipment availability are independent at formation scale.
