# Campaign first-class interface — FCI-2 operational map vertical slice

**Date:** 2026-08-15

**Status:** FCI-2 certified for every currently implemented entity and domain projection; FCI-022/FCI-024 future Supply, Air/Naval, and Environment adapters remain explicit non-blocking domain gates

**Canonical plan:** [`CAMPAIGN_FIRST_CLASS_INTERFACE_IMPLEMENTATION_PLAN.md`](./CAMPAIGN_FIRST_CLASS_INTERFACE_IMPLEMENTATION_PLAN.md)

**Foundation:** [`CAMPAIGN_FIRST_CLASS_INTERFACE_BASELINE_2026-08-15.md`](./CAMPAIGN_FIRST_CLASS_INTERFACE_BASELINE_2026-08-15.md)

## Outcome

The campaign map is now a stable, projection-safe planning surface rather than one fixed operational picture. The player can change among Operational, Objectives, Forces, Intelligence, and Orders layers; see a layer-specific legend and truthful filter set; and open a searchable, keyboard-operable list containing the same projected entities represented on the map. Selecting a list item uses the FCI-1 selection and typed-inspector route, so map and list are alternative inputs to one command model.

The same route now presents first-class operational hexes, fronts, and persistent formations. A formation exposes its status, location, readiness, cohesion, fatigue, personnel, equipment, supply, experience, battle count, current order, honors, and latest history. A hex exposes control, role, projected friendly forces, infrastructure, objectives, and fronts. Front and hex routes retain only the legal action controls owned by existing campaign services; the presentation layer does not reproduce their legality rules.

After-action reports now project their battle location into the same rendered offset coordinate system. Both the report archive and the typed report inspector expose a `Focus Operational hex …` action that closes the report modal, selects and highlights the canonical map hex, and opens the shared hex inspector. The report remains the source of historical facts; the map route remains selection-only.

Supply, Air & Naval, and Environment modes exist in the registry but are not presented as working controls. Each has an explicit feature-gate reason tied to the missing domain projection. Workspace defaults fall back to Operational instead of implying that an unavailable visualization exists.

No campaign rule, hidden opponent record, raw runtime object, save schema, order authority, or map-renderer truth boundary changed in this slice.

## Player behavior

1. Choose a map layer from the labeled desktop controls or compact `Layer` selector.
2. Read the layer-specific legend; Intelligence additionally exposes the existing collection-coverage filter.
3. Inspect the emphasized map ground, forces, contacts, fronts, or order targets.
4. Open `Map list N` for a non-spatial and keyboard route to the same projected entities.
5. Select an item. The list closes and the shared context inspector opens with Player-safe detail.
6. On compact layouts, opening the map list first closes workspace/inspector sheets and expands the map to the full 702 CSS-pixel command width.
7. Focus enters the inspector close control in compact sheet mode or the inspector heading when the inspector is a permanent desktop pane.
8. Selecting a persistent formation highlights its campaign-map offset location, even though the authoritative runtime stores the source location in axial coordinates.

Map selection still never creates or commits an order. Legal action buttons remain the only mutation path.

## Overlay registry

| Layer | Status | Projected content | List parity |
|---|---|---|---|
| Operational | Available | Control, fronts, friendly forces, installations, assessed contacts | Derived front list |
| Objectives | Available | Published objective ground with patterned/double-stroke emphasis | Objective name, state, location, shared inspector |
| Forces | Available | Player-controlled force locations and count markers | Searchable persistent formation roster with condition, location, and typed formation inspector; aggregate fallback retained for unmigrated projections |
| Intelligence | Available | Faction-safe contacts plus optional collection coverage | Contact label, confidence, age, assessed location, typed contact inspector |
| Orders | Available | Typed Player order origin/target hexes; theater-wide orders remain explicitly non-spatial | Status, projected route/target, typed order inspector |
| Supply | Feature-gated | No route-level supply-network projection exists yet | Control omitted; registry explains the missing contract |
| Air & Naval | Feature-gated | Mission-area/range projection awaits the support-planning workspace | Control omitted; registry explains the missing contract |
| Environment | Feature-gated | Weather-zone projection does not exist yet | Control omitted; registry explains the missing contract |

The available layer set is stable and ordered. Gated layers can be deep-linked by future services without fabricating data: the controller records the requested layer, marks it `featureGated`, explains why it is unavailable, and truthfully renders the base Operational picture.

## Architecture and ownership

- `CampaignMapOverlayRegistry` owns stable layer identity, labels, descriptions, availability, workspace defaults, and color-independent legend semantics.
- `CampaignMapOverlayController` owns presentation state, layer controls, dynamic legend/filter presentation, accessible list rendering, SVG emphasis classes, compact list exclusivity, and a read-only performance diagnostic.
- `CampaignCommandUIState` remains the one ephemeral owner of active overlay identity.
- `CampaignCommandScreen` synchronizes overlay/list gestures with shared selection and focus state.
- `CampaignScreen` projects only Player-safe objective locations, friendly force locations and persistent formation records, visible fronts, assessed contacts, typed hex facts, and Player-owned order target keys.
- `CampaignCommandProjection` is the explicit coordinate adapter from authoritative axial formation locations to the offset keys rendered by the campaign map.
- `CampaignMapRenderer` remains the owner of base map geometry and receives no new campaign rules. Overlay emphasis is applied to its existing sanitized SVG output.
- `CampaignContextInspector` provides typed hex, formation, front, objective, order, report, and assessed-contact routes. Hex/front routes compose the already-authoritative campaign action surface instead of duplicating mutation logic.
- AAR archive and report-inspector location actions carry only the projected offset hex key and re-enter the same shared selection callback used by direct map/list input.

## Information-safety contract

The map controller receives the deeply frozen `CampaignCommandShellView`; it does not import `CampaignState`, runtime transactions, strategic AI state, opposing economy, hidden forces, random streams, or truth correlation identifiers.

Projected Intelligence list/inspector fields are limited to:

- assessed label and location;
- confidence band and contact state;
- age and uncertainty radius;
- Player-visible source labels;
- assessed strength band when present.

All dynamic strings enter the DOM through `textContent`. Existing projection-key rejection and exact DOM sentinel scans remain active, and the new map regression includes a forbidden hidden-truth sentinel.

## Responsive, keyboard, and focus certification

- Desktop controls use full labels when the map container can support them and stable `OPS`, `OBJ`, `FOR`, `INT`, and `ORD` abbreviations when the actual map container narrows.
- Container queries respond to map-stage width rather than the unrelated browser viewport, preventing legend/control collision in the four-column command layout.
- Compact layouts replace the button row with a labeled native layer selector.
- The map list exposes its item count, layer description, explicit close control, and semantic buttons for every item.
- `Escape` closes the map list and returns focus to its toggle.
- Selecting a list entry closes the list before revealing the inspector.
- Compact map-list opening makes the workspace inert and `aria-hidden`; it cannot coexist as an interactive sheet.
- Inspector focus is responsive: compact close control or permanent-pane heading.
- Replacing an already-open desktop inspector route explicitly transfers focus from the now-hidden list row to the new inspector heading; focus cannot fall back to the document body.
- Color is never the only overlay signal: opacity, symbols, stroke width, and dash patterns provide redundant state.

## Performance certification

The live campaign currently renders 4,650 campaign hex groups. The first implementation performed repeated linear hex searches for every objective, force, order target, and front sector. Certification replaced this with one key-indexed cache per rendered SVG generation.

The controller now:

- rebuilds the hex index only when the renderer replaces the SVG layer root;
- performs constant-time hex marking;
- applies entity-category classes only when a new command view or SVG generation arrives;
- performs no hex scan or class rewrite when the player merely changes layers.

The deterministic regression asserts stable cache-build and entity-application counters across repeated overlay changes. In the live 4,650-hex theater, 100 synchronous layer switches measured:

- median: **0.7 ms**;
- p95: **5.2 ms**;
- maximum: **7.8 ms**;
- certification budget: **p95 below one 16.7 ms frame**.

The live Player projection contains **272 persistent formations**. Layer list search reduced that roster to the 12 matching `1st Infantry` records in approximately **9.5 ms**, while preserving the live result count and keyboard selection route. This certifies the current shipped roster; future campaigns that exceed it materially still require a release-scale stress fixture.

## Browser evidence

- [1440×1000 operational layer](./images/campaign-interface-fci-2-operational-1440x1000.png)
- [1440×1000 objective layer and map list](./images/campaign-interface-fci-2-objective-list-1440x1000.png)
- [800×900 compact objective map list](./images/campaign-interface-fci-2-objective-list-800x900.png)
- [1440×1000 formation search](./images/campaign-interface-fci-2-forces-search-1440x1000.png)
- [1440×1000 persistent formation inspector](./images/campaign-interface-fci-2-formation-inspector-1440x1000.png)
- [1440×1000 operational hex inspector](./images/campaign-interface-fci-2-hex-inspector-1440x1000.png)
- [1440×1000 operational hex with domain-owned actions](./images/campaign-interface-fci-2-hex-actions-1440x1000.png)

Live agent-browser verification confirmed:

- five and only five available layer controls;
- no Supply, Air & Naval, or Environment control falsely presented;
- layer button/select, UI-state overlay, SVG mode, legend, item count, and emphasis classes remain synchronized;
- three authored objectives receive map emphasis and list entries;
- objective list selection closes the list and reaches the typed inspector;
- Forces exposes all 272 projected persistent formations and filters to 12 `1st Infantry` matches;
- formation selection renders the complete persistent condition record and highlights offset hex `26,25`, not the runtime axial key `26,12`;
- friendly and opposing fronts highlight 10 and 5 sectors respectively; the tactical-engagement action is enabled only on the friendly-initiative front;
- the operational hex route shows friendly control, Naval Base role, projected forces, and 140/140 infrastructure while preserving the service-owned `Plan redeployment` action;
- replacing an already-open formation route retains focus on `campaignInspectorTitle`;
- automated AAR certification confirms report modal → projected map hex → shared hex inspector → archive reopen/acknowledge/follow-up decision without losing the report workflow;
- Intelligence exposes the coverage filter and reports zero contacts truthfully in the initial theater state;
- Logistics defaults to Operational while Supply is gated;
- compact map list closes/inerts the workspace and expands the map to 702 CSS pixels;
- compact selection focuses the inspector close control; desktop selection focuses the inspector heading;
- no Vite/framework error overlay appeared.

The entitlement overlay was removed only inside the local browser session to inspect the already-mounted command surface. Production entitlement behavior was not changed.

## Automated verification

- `npm run test:campaign`: **119 tests passed**, including `CAMPAIGN_MAP_OVERLAYS_ARE_STABLE_SAFE_AND_LIST_ACCESSIBLE` and `CAMPAIGN_DESKTOP_MAP_LIST_RESELECTION_RETAINS_INSPECTOR_FOCUS`;
- `npx tsc --noEmit`: passed;
- targeted ESLint across the overlay registry/controller, command composition, inspector, campaign projection, and tests: passed;
- `npm run build`: passed at the final slice gate.

## Defects found and corrected during certification

1. Full desktop labels collided with the legend because responsiveness used viewport width rather than the map container. Container-responsive abbreviations now follow the real available width.
2. Compact map list and workspace sheet could overlap. Opening the list now closes managed compact sheets first.
3. Desktop inspector focus targeted a close button hidden at wide layouts. Focus now targets the permanent inspector heading on desktop and the visible close control in compact mode.
4. Initial entity emphasis used repeated linear searches across 4,650 hexes. A generation-aware key index and dirty-class guard now keep layer changes within one frame.
5. Formation runtime locations were treated as already-renderable map keys. Runtime axial `26,12` is now explicitly projected to campaign offset `26,25` before list display and highlighting.
6. Reselecting an entity while the desktop inspector was already open hid the focused list row without creating an `inspectorExpanded` transition, dropping focus to `<body>`. Every inspector reveal now establishes a valid responsive entry focus.
7. AAR locations were formatted from runtime axial keys and had no canonical map action. Reports now expose only the converted offset key and route through the shared selection/highlight path.

## Deferred domain-dependent follow-ons

- implement Supply, Air/Naval, and weather adapters only when their authoritative projections exist;
- add weather-zone inspector content when projected forecasts are available;
- add a release-scale generated roster stress fixture if authored campaigns materially exceed the certified live 272-formation projection;
- retire only the remaining compatibility inspector markup after every domain-owned action and report-navigation route has a typed replacement.

The FCI-2 exit gate is passed for the currently implemented campaign domains: their entities can be located, selected, understood, and acted on through map/list/report/inspector routes without truth leakage. The unavailable Supply, Air/Naval, and Environment projections are future domain work and remain truthfully absent rather than blocking certification of the implemented surface.
