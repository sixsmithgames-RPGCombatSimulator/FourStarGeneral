# Campaign first-class interface — FCI-3 Situation, alerts, reports, and outcomes

**Date:** 2026-08-18

**Scope:** FCI-030 through FCI-035 engineering implementation and certification for currently authoritative campaign domains

**Canonical plan:** [`CAMPAIGN_FIRST_CLASS_INTERFACE_IMPLEMENTATION_PLAN.md`](./CAMPAIGN_FIRST_CLASS_INTERFACE_IMPLEMENTATION_PLAN.md)

**Predecessor:** [`CAMPAIGN_FIRST_CLASS_INTERFACE_FCI2_MAP_2026-08-15.md`](./CAMPAIGN_FIRST_CLASS_INTERFACE_FCI2_MAP_2026-08-15.md)

## Result

FCI-3 is implemented and engineering-certified for current campaign projections. Loading the campaign, advancing to a report, returning from battle, reviewing a required consequence, and reaching a campaign outcome now land on an understandable Player-safe priority with a direct next action.

The Situation workspace is no longer an objective list with a single card. It is a command synthesis surface with one concise brief, exactly one dominant priority, objective/deadline/loss-condition presentation, campaign outlook, assessed front posture, a unified alert/report center, and a bounded recent-resolution record. Reports, objectives, fronts, formations, orders, intelligence, map locations, and the full timeline continue to use the shared navigation and inspector model.

The external comprehension metric—at least 80% of representative participants identifying the priority and required decision within ten seconds—still requires a formal user study. The structural gate, internal live review, keyboard routes, responsive routes, and automated acceptance journeys pass.

## Player-facing behavior

### Opening assessment

On campaign entry the player sees, in hierarchy order:

1. a commander's brief summarizing the active phase, active-objective count, and nearest deadline pressure;
2. one dominant decision or priority with one direct Review action;
3. objective progress, dependency, deadline, score, and terminal-failure meaning;
4. projected grade, campaign score, phase intent, objective state, and explicit loss conditions;
5. each projected front's initiative, Player formation posture, assessed contact pressure, objective posture, and last related material change;
6. command alerts, intelligence dispatch count, and after-action-report count;
7. the five most recent resolution checkpoints with bounded aggregation and full-timeline access.

The brief and priority are deliberately different. The brief provides theater context; the priority owns the action. A second priority is never rendered beside the dominant decision.

### Alerts and acknowledgement

- Routine updates remain in the resolution record.
- Notable alerts enter command traffic and the command-bar unread count.
- Critical and decision-required alerts retain their higher visual and semantic severity.
- Every alert preserves its typed navigation target.
- Alert acknowledgement is save-stable in `acknowledgedCampaignAlertIds` and is validated against retained advance records.
- Acknowledgement changes review state only. It does not advance time, change runtime revision, validate an order, resolve a required decision, or mutate campaign outcomes.
- An acknowledged required decision explicitly remains marked as requiring resolution until its owning domain state changes.

### Reports and AAR continuation

The command-bar Reports action now opens and focuses the unified Situation alert center instead of choosing one report silo implicitly. From there the player can open intelligence reporting or the after-action archive.

The AAR keeps its immutable before/after record, map focus, loss and condition details, objective/control/infrastructure effects, checkpoint status, and explicit acknowledgement. Its new Continue action routes to the first required consequence when one exists; otherwise it returns to Situation. Acknowledgement and consequence resolution remain separate actions.

### Campaign outcome

The terminal campaign record now presents:

- result, grade, summary, score, completed objectives, and failed objectives;
- retained formation count;
- up to three distinguished formation service-record lines drawn from existing battle/honor history;
- current checkpoint/save guidance;
- Review campaign map, Save campaign record, authored Continue without scoring, and Return to main menu paths.

The outcome therefore has no presentation dead end. No new honors, commander effects, or service-record mechanics are fabricated; the surface only summarizes already-authoritative formation records.

## Projection and information-safety boundaries

- Components receive only `CampaignCommandShellView` and its nested immutable Player-facing projections.
- Objective dependencies and defeat meaning come from authored objective/campaign-arc rules.
- Deadline pressure comes from published active objective deadlines and current campaign segment.
- Front contact pressure uses faction-safe assessed contacts only; no raw opposing formations, strength counts, orders, resources, AI rationale, or hidden infrastructure state enter the view.
- Friendly front posture uses Player formation locations already projected into campaign offset coordinates.
- Recent front change links only objective/formation targets already present in the Player-safe timeline.
- Alert acknowledgement IDs reference retained Player-safe advance alerts and fail runtime validation when duplicated or unknown.
- AAR opponent loss wording remains aggregate confirmed/assessed evidence, not hidden campaign truth.

## Work-package acceptance

| ID | Result | Evidence |
|---|---|---|
| FCI-030 | Full Situation board implemented; one brief, one dominant priority, outlook, fronts, reports, and recent changes | `CAMPAIGN_COMMAND_SITUATION_PASSES_STRUCTURAL_TEN_SECOND_GATE`, desktop/compact captures, live internal review |
| FCI-031 | Objective, phase, deadline, dependency, progress, score, loss-condition, and front initiative/pressure/posture presentation implemented | Shell test, objective/front inspector routes, live fresh-campaign and advanced-campaign review |
| FCI-032 | Unified command traffic, source counts, severity treatment, typed routes, and save-stable acknowledgement implemented | `CampaignAdvanceControls`, Situation shell test, live unread 1 → acknowledged 0 journey |
| FCI-033 | Bounded newest-first recent record and full save-stable resolution timeline implemented with stop causes and event aggregation | Existing advance certification plus live next-report checkpoint and timeline review |
| FCI-034 | AAR archive migration completed with map focus, before/after consequences, acknowledgement, and Continue-to-consequence route | `CAMPAIGN_COMMAND_SHELL_PRESENTS_ACCESSIBLE_AFTER_ACTION_ARCHIVE` |
| FCI-035 | Outcome record expanded with force preservation, service record, save, review, continue, and exit paths | `CAMPAIGN_COMMAND_SHELL_RENDERS_OBJECTIVE_PROGRESS_AND_TERMINAL_RECORD` |

## Responsive and accessibility behavior

- Situation is structured with named regions and heading hierarchy.
- The Reports button focuses the alert center, causing it to scroll into view.
- At compact widths, Situation is a mutually exclusive sheet over the map.
- The compact sheet header is sticky, so Close remains visible after a deep link scrolls to command traffic.
- Closing the compact workspace restores focus to the Situation tab.
- At 800×900 the alert center, map, order tray, and Advance control remain reachable with no horizontal page overflow.
- At a 640×450 effective viewport (minimum desktop at 200% zoom stress), Reports, the sticky Close control, Timeline, and Advance remain reachable with zero horizontal overflow.
- Color is not the only alert signal: severity text, heading order, border treatment, acknowledgement text, and stop wording carry meaning.

## Live browser evidence

The local Vite application was exercised through a named agent-browser session:

- landing and campaign pages loaded with meaningful content;
- no Vite error overlay was present and the instrumented console-error list remained empty;
- the campaign entitlement overlay was removed only in the local browser DOM to inspect the already-mounted command interface; production entitlement behavior was unchanged;
- fresh campaign entry showed the phase brief, one active priority, deadlines, dependencies, loss conditions, fronts, report sources, and direct actions;
- Reports focused command traffic and scrolled the workspace to it;
- a real Advance to next report generated one notable front-change alert and one stopped timeline checkpoint;
- acknowledging that alert changed the command inbox from 1 to 0 while leaving it inspectable as acknowledged;
- the priority returned to the active primary objective after the notable alert was reviewed;
- Save changed the command status to Saved;
- desktop, 800×900 compact, and 640×450 effective 200%-zoom states had no horizontal overflow;
- compact Close remained visible after alert-center focus and restored focus to the Situation tab.

Captured evidence:

- [1440×1000 Situation opening](./images/campaign-interface-fci-3-situation-1440x1000.png)
- [1440×1000 alert center after a real resolution](./images/campaign-interface-fci-3-alert-center-1440x1000.png)
- [800×900 compact Situation/alert sheet](./images/campaign-interface-fci-3-compact-800x900.png)

## Automated verification

- `npx tsc --noEmit`: passed during implementation.
- `npm run test:campaign`: 120 registered campaign tests passed after adding the FCI-3 structural, acknowledgement-persistence, AAR-continuation, and outcome-path assertions.
- `npm run build`: passed; TypeScript and the production Vite bundle completed successfully.
- Targeted ESLint across every changed runtime, projection, component, screen, and test file: passed.
- All local links in the FCI-3 record, implementation plan, product plan, and certification baseline resolve.

## Deliberate remaining gates

- Formal ten-second user testing remains a release acceptance activity; engineering does not claim an external participant success rate from structural tests.
- Front supply posture and nearby-reserve distance remain unavailable until their own authoritative projected services exist; the Situation board does not guess them.
- Broader commander/service-record effects remain governed by the formation-lifecycle milestone; FCI-3 displays only current retained formations, battles, honors, and history.
- FCI-4 remains responsible for the common schema-driven order composer, full tray editing/conflict workflow, map route/area preview, and authoritative action explanations.

## Next implementation package

Proceed to FCI-4 — common order planning experience: action registry and reason codes, schema-driven composer, route/area and reservation preview, full editable tray, and atomic commit feedback.
