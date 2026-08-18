# Campaign first-class interface — FCI-0 and FCI-1 baseline and certification

**Date:** 2026-08-15

**Scope:** FCI-001 through FCI-015 baseline, interface foundation, command-frame extraction, synchronized selection/inspector behavior, compact accessibility, browser comparison, and compatibility fallback

**Canonical plan:** [`CAMPAIGN_FIRST_CLASS_INTERFACE_IMPLEMENTATION_PLAN.md`](./CAMPAIGN_FIRST_CLASS_INTERFACE_IMPLEMENTATION_PLAN.md)

**Later certification addenda:** [`FCI-2 map and inspectors`](./CAMPAIGN_FIRST_CLASS_INTERFACE_FCI2_MAP_2026-08-15.md) · [`FCI-3 Situation, alerts, reports, and outcomes`](./CAMPAIGN_FIRST_CLASS_INTERFACE_FCI3_SITUATION_2026-08-18.md)

## Certification result

FCI-0 and FCI-1 are implemented and certified. The campaign command interface now has a presentation-only migration boundary, immutable Player-safe component views, one ephemeral navigation/selection store, typed UI events, deterministic deep-link routing, shared design tokens, projection/DOM information-leak assertions, extracted command-frame regions, synchronized selection, typed inspector routes, and compact sheets that match their visual, keyboard, and accessibility state.

The authoritative Campaign 2.0 runtime, order services, fog projections, persistence schema, tactical bridge, and strategic AI were not changed by this slice.

## Captured reference states

Compatibility baseline captured before the FCI-0 architectural cut:

- [1440×1000 compatibility baseline](./images/campaign-interface-compat-baseline-1440x1000.png)
- [1280×720 compatibility baseline](./images/campaign-interface-compat-baseline-1280x720.png)
- [800×900 compatibility baseline](./images/campaign-interface-compat-baseline-800x900.png)

Certified FCI-0/FCI-1 foundation with the Situation command-priority card:

- [1440×1000 managed interface](./images/campaign-interface-fci-0-1-1440x1000.png)
- [1280×720 managed interface](./images/campaign-interface-fci-0-1-1280x720.png)
- [800×900 managed interface](./images/campaign-interface-fci-0-1-800x900.png)

Certified FCI-1 selection and inspector states:

- [1440×1000 objective inspector](./images/campaign-interface-fci-1-inspector-1440x1000.png)
- [800×900 compact objective inspector](./images/campaign-interface-fci-1-compact-inspector-800x900.png)

Certified FCI-3 consequence-driven Situation states:

- [1440×1000 Situation opening](./images/campaign-interface-fci-3-situation-1440x1000.png)
- [1440×1000 command alert center](./images/campaign-interface-fci-3-alert-center-1440x1000.png)
- [800×900 compact command-traffic sheet](./images/campaign-interface-fci-3-compact-800x900.png)

## Compatibility DOM inventory

The preserved campaign frame contains:

- one persistent command bar with theater identity, phase, operational clock, command state, Player resources, reports, save status, and session controls;
- six workspaces: Situation, Forces, Logistics, Intelligence, Air & Naval, and Headquarters;
- one operational map with selection-only hex interaction, viewport controls, operational legend, and intelligence-coverage control;
- one context inspector that currently rehomes the compatibility selection/action surface;
- one persistent order tray with typed drafts, committed orders, conflicts, reservations, commit, advance modes, and resolution timeline;
- modal after-action archive and campaign-outcome surfaces;
- compact workspace and inspector sheets below the existing responsive breakpoints;
- developer controls absent from the normal Player DOM.

## Keyboard and focus inventory

- `1` through `6` select the six workspaces when focus is not in an editable control.
- Arrow keys move within the workspace tab list; `Home` and `End` move to its bounds.
- `Escape` closes the top campaign sheet/gesture without committing or mutating campaign truth.
- Map selection never issues an order by itself.
- All order mutation uses explicit buttons in the inspector, planner, or order tray.
- Compact close controls return the map to its full usable width.
- Managed V2 state now mirrors workspace, overlay, selection kind, and mutually exclusive compact-sheet state.

## Implemented foundation

| Work package | Result | Evidence |
|---|---|---|
| FCI-001 | Three compatibility captures, three managed captures, DOM inventory, and keyboard inventory recorded | This document and linked PNG files |
| FCI-002 | `CampaignCommandUIState` contains only workspace, overlay, selection identity, and sheet/layout state; snapshots are immutable | `CAMPAIGN_COMMAND_UI_STATE_IS_EPHEMERAL_AND_SHEET_EXCLUSIVE` |
| FCI-003 | `CampaignCommandNavigator` resolves alert/report/entity targets to one workspace, overlay, selection, and focus request | `CAMPAIGN_COMMAND_NAVIGATOR_ROUTES_ALL_SURFACES_CONSISTENTLY` |
| FCI-004 | `CampaignCommandViewAssembler` rejects forbidden truth keys and returns detached, deeply frozen views | `CAMPAIGN_COMMAND_VIEW_ASSEMBLER_FREEZES_AND_REJECTS_TRUTH` |
| FCI-005 | Campaign tokens and new component rules live in `src/ui/campaign/styles/campaign-command.css`; no new campaign rules were added to inline `index.html` CSS | Production Vite CSS artifact and build pass |
| FCI-006 | `campaign-ui=v2` and `campaign-ui=compat` select managed and compatibility presentation boundaries; both reuse identical campaign truth and saves | Browser verification in both query modes |
| FCI-007 | Exact forbidden sentinels can be scanned across rendered text and DOM attributes | `CAMPAIGN_COMMAND_SCREEN_MOUNTS_MANAGED_COMPATIBILITY_BOUNDARY` |
| FCI-010 | `CampaignCommandScreen` owns presentation lifecycle and state synchronization without campaign rules | Managed composition-root test and browser data attributes |
| FCI-011 | Command bar is an extracted component over Player-safe view data | Production rendering and managed captures |
| FCI-012 | Workspace rail and pane are extracted components with preserved keyboard and responsive behavior | Foundation test, keyboard inventory, and compact browser flow |
| FCI-013 | Objective, order, force location, map hex, alert, report, contact, and entity navigation share one selection/focus contract | Navigator and command-screen foundation tests plus browser selection flow |
| FCI-014 | Typed inspector routes render only projected fields and unsupported detail produces an explicit safe empty state | Objective/order/formation inspector assertions and DOM leak scan |
| FCI-015 | Only the active compact sheet remains interactive; hidden sheets use `inert` and `aria-hidden`, and close restores focus | Compact regression assertion and 800×900 browser accessibility-tree verification |

## Browser verification

The local Vite application was opened through agent-browser and checked after implementation.

- Landing page and campaign page loaded with meaningful content.
- No Vite/framework error overlay was present.
- The campaign stylesheet was loaded.
- Managed mode exposed `data-campaign-command-ui="v2"` and `data-campaign-command-state="managed"`.
- Compatibility mode exposed `data-campaign-command-ui="compatibility"` and retained workspace navigation.
- The Situation workspace rendered its current command priority.
- Forces navigation synchronized the selected tab and managed workspace state.
- At 800×900, closing the workspace expanded the operational map to 702 CSS pixels.
- The empty order tray remained horizontally legible after the responsive fix.
- Objective, force-location, order, and deep-linked formation selection updated the same managed selection state and inspector route.
- Objective and order inspectors showed only Player-safe projected status, deadline/score, timing, and validation fields; unsupported formation detail showed an explicit safe empty state.
- At 800×900, opening the objective inspector made the workspace inert and `aria-hidden`; closing it made the inspector inert and `aria-hidden`, restored focus to the map fallback, and left no hidden controls in the interactive snapshot.
- Selecting Forces at 800×900 reopened only the workspace and kept the hidden inspector out of the interaction tree.
- Live verification exposed and corrected an inspector-open/workspace-close notification ordering defect before certification.

The campaign entitlement overlay was removed only inside the local browser session to inspect the already-mounted command surface. Production entitlement behavior was not changed.

Final automated verification after the responsive and sheet-synchronization corrections:

- `npm run test:campaign`: 117 tests passed;
- `npm run build`: passed;
- targeted ESLint across the new interface foundation and certification test: passed.

## Next interface slice

FCI-0 and FCI-1 establish and certify the migration boundary and synchronized command frame; they do not certify the whole interface plan. FCI-2 is next:

- introduce the overlay registry and accessible list parity;
- add complete legend/filter controls, map-state styling, zoom/pan/fit polish, and full-roster performance checks;
- preserve synchronized typed selection and information-safety contracts while map surfaces migrate;
- migrate each workspace and remove its compatibility markup only after its own exit gate passes.

## Subsequent progress

The planned FCI-2 map vertical slice was implemented and certified after this baseline. See [`CAMPAIGN_FIRST_CLASS_INTERFACE_FCI2_MAP_2026-08-15.md`](./CAMPAIGN_FIRST_CLASS_INTERFACE_FCI2_MAP_2026-08-15.md) for the overlay registry, five available layers, truthful domain feature gates, accessible map lists, typed hex/front/formation/report inspectors, AAR-to-map focus, the searchable 272-formation live roster, coordinate-safe highlighting, compact exclusivity, responsive focus, 4,650-hex cache, browser captures, and future domain-dependent adapter gates.
