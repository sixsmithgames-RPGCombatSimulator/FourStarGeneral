# Campaign 2.0 M1 — command shell vertical slice

**Task IDs:** C20-010, C20-011  
**Canonical specification:** `docs/CAMPAIGN_2_0_FIRST_CLASS_GAME_PLAN.md`  
**Depends on:** C20-001 through C20-008  
**Governance:** `docs/ITERATION_GOVERNANCE.md`

## Task intake

### Goal

Replace the shipped campaign map/sidebar presentation with the first playable Campaign 2.0 command workspace while preserving the certified runtime, persistence, intelligence, production, redeployment, and tactical handoff behavior.

### In scope

- always-visible theater command bar with projected campaign identity, time, resources, intelligence alerts, save state, and session controls;
- six-workspace navigation rail with keyboard navigation and responsive bottom-switcher behavior;
- operational map stage with explicit overlay and viewport controls;
- right-side context inspector driven only by the Player campaign projection;
- persistent order tray/timeline that presents existing scheduled redeployments as committed transition records;
- explicit redeployment planning controls so a map click selects but never mutates campaign truth;
- narrow-screen inspector sheet and compact order tray;
- developer-only mounting of the legacy campaign editor template;
- focused DOM, keyboard, projection-safety, and no-map-mutation tests.

### Out of scope

- authoritative typed draft/commit/reservation services (C20-012);
- simultaneous segment transaction and stop-condition engine (C20-013/C20-014);
- named save browser, autosave orchestration, and tactical saves (C20-015/C20-016);
- formation registry, complete consequences, objectives/end states, AI, or weather;
- visual redesign of the underlying authored campaign map art.

## Player interaction contract

1. A single map click selects a projected hex and updates the inspector.
2. Selecting a friendly occupied hex exposes **Plan redeployment** in the inspector.
3. The player explicitly chooses that action, selects a destination, and explicitly opens the redeployment planner.
4. The planner previews exact engine costs and legality before confirmation.
5. A confirmed redeployment appears in the persistent order tray as a committed transition order.
6. Advancing time remains a separate action in the order tray.

No pointer gesture directly moves units, spends resources, queues an engagement, or advances time.

## Information-safety contract

- The shell receives scenario identity, Player economy, Player intelligence counts, and legacy order projections through existing Player-safe getters.
- Enemy economy and raw force truth are never passed into shell view models.
- Selection content is built from `getCampaignMapView("Player")`.
- The renderer continues to receive only the Player projection.
- DOM attributes contain workspace, overlay, and projected selection identifiers only.

## Layout and responsive behavior

### Desktop

```text
┌──────────────────────────────── COMMAND BAR ────────────────────────────────┐
├────────┬──────────────┬─────────────────────────────┬───────────────────────┤
│ Rail   │ Workspace    │ Operational map             │ Context inspector     │
├────────┴──────────────┴─────────────────────────────┴───────────────────────┤
│ ORDER TRAY / TIMELINE                                      COMMIT · ADVANCE │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tablet and narrow screens

- the workspace rail becomes a horizontally scrollable bottom switcher;
- the context inspector becomes a dismissible sheet over the map;
- the workspace panel is hidden until its workspace is selected where space requires;
- the order tray retains summary, committed-order count, and Advance;
- no critical action depends on hover, drag, or right click.

## Keyboard and focus model

- focus order follows command bar → workspace rail → workspace content → map controls → inspector → order tray;
- Arrow Up/Down (desktop) and Arrow Left/Right (compact layouts) move through workspace tabs;
- Home/End select the first/last workspace tab;
- number keys 1–6 switch workspaces when focus is not inside an editable control;
- Escape cancels a pending redeployment origin and closes the narrow inspector sheet;
- every icon-like control has a visible text label or explicit accessible name.

## Compatibility boundaries

- `CampaignCommandShell` owns shell DOM composition, workspace state, keyboard navigation, and shell-only rendering.
- `CampaignScreen` remains the compatibility controller for existing campaign rules and Player projections.
- existing element IDs are moved into shell regions rather than duplicated, keeping current handlers stable;
- existing queued `CampaignDecision` redeployments are read-only timeline inputs until C20-012 replaces them with authoritative typed orders;
- the campaign editor is retained in a `<template>` and mounted only in a Vite development build or when `VITE_CAMPAIGN_EDITOR=true`.

## Acceptance checklist

- [x] command bar, rail, workspace panel, map stage, inspector, and order tray exist as semantic regions;
- [x] the six workspace tabs implement tab semantics and roving keyboard focus;
- [x] selecting a workspace updates the active panel without a screen transition;
- [x] campaign title, time, resources, unread intelligence, save state, and committed orders update from projected state;
- [x] map clicks only select and never call movement/redeployment mutation APIs;
- [x] redeployment requires explicit inspector and planner confirmations;
- [x] Advance remains distinct from order confirmation;
- [x] normal production DOM does not contain campaign editor controls;
- [x] responsive CSS provides bottom navigation, inspector sheet, and compact tray behavior;
- [x] reduced-motion styling disables shell transitions;
- [x] focused shell tests pass;
- [x] full tests, build, lint, TypeScript, and diff integrity checks pass.

## Verification record

- `CAMPAIGN_COMMAND_SHELL_COMPOSES_SAFE_KEYBOARD_WORKSPACE` certifies semantic regions, six-tab roving focus, Player-safe text rendering, intelligence callback, and compatibility timeline count.
- `CAMPAIGN_COMMAND_SHELL_OMITS_DEVELOPER_CONTROLS_FROM_PLAYER_DOM` certifies editor/export controls remain inside inert templates without development authorization.
- `CAMPAIGN_MAP_CLICK_IS_SELECTION_ONLY` certifies a player-occupied map click changes neither runtime revision nor canonical campaign projection and exposes an explicit inspector action.
- focused command-shell harness — 3/3 passed;
- repository-wide `npm test` — passed;
- browser verification — passed at 1440×1000 and 800×900 with no Vite overlay or shell errors; command regions, bottom workspace navigation, compact workspace dismissal, automatic inspector handoff, and explicit origin/destination planning flow verified (guest Clerk endpoints returned their pre-existing unauthenticated HTTP 400 responses during the isolated recheck);
- `npx tsc --noEmit` — passed;
- focused ESLint — passed;
- `npm run build` — passed (existing dynamic-import and chunk-size warnings only);
- `npm run lint -- --quiet` — passed repository-wide;
- `git diff --check` — passed (line-ending conversion warnings only).
