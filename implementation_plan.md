## 2026-09-09 — Campaign map visual-authority and command-surface repair

### Intended behavior
- The registered campaign hex lattice is the sole size, center, orientation and clipping authority for every hex-shaped raster, whether it is rendered as a tile, a friendly base or a known strategic site.
- Map-bound symbols, force actors and intelligence contacts inherit exactly one camera transform. They keep a constant ratio to their owning cell through the full zoom range; only labels, disclosures and pointer/focus affordances may use screen-space compensation.
- The command shell gives the map more room, exposes the current decision and action blockers clearly, identifies selection consistently, and presents map search, zoom and inspector information as one coherent command flow.

### Current behavior
- Ordinary hex art uses the full registered cell diameter, while friendly bases and known sites use a smaller 22 px marker contract. The same raster therefore changes size according to the renderer path that owns it.
- `MapViewport` transforms the complete SVG and also publishes inverse/capped scale variables. Force stacks, contacts, ordinary non-hex symbols and some installation markers consume those variables, so their cell ratio falls as zoom increases.
- The scrollable legacy map viewport remains active behind camera panning, producing a second navigation model and visible native scrollbars.
- The current selection, disabled action reason and exact zoom state do not have sufficiently strong visual hierarchy in the command shell.

### Expected change
- Centralize the registered hex-art extent and use it for all three renderer paths, with the existing exact-cell clip and canonical flat-top rotation.
- Remove counter-scaling from geographic/map-bound visuals. Keep bounded screen-space behavior only for text disclosures and hit/focus geometry whose purpose is interaction readability rather than geographic representation.
- Make the camera transform the only visual transform owner for sprites, forces and contacts; publish a readable zoom percentage without introducing state outside `MapViewport`.
- Hide native map overflow and retain wheel, button, keyboard, touch and captured-pointer panning as the supported camera controls.
- Refine command-bar, workspace, map controls, selection and inspector hierarchy without changing campaign rules or player-safe projections.

### High-risk impact analysis
- Consumers: `CampaignScreen` camera presets and selection restoration, map overlay filtering, map-list selection, base/site pointer and keyboard interaction, formation rendering, intelligence contact rendering, label collision placement, and campaign geometry tests.
- Events: existing campaign render/state events and direct camera input continue to drive repaint. No engine/state event or payload changes.
- Visual risks: a full-cell marker can cover adjacent labels or markers; removing a close-zoom cap can make a force unreadably large if its authored local footprint is not actually contained; hiding overflow can expose a camera-clamping error; stronger selection styling can obscure terrain.
- Interaction risks: screen-space hit targets must remain centered after map zoom, disclosure cards must remain viewport bounded, and single click must remain selection-only.
- State risk: none. This is UI/rendering behavior only; scenario, orders, combat, persistence, RNG and fog-of-war truth are unchanged.

### Regression and verification plan
- Extend renderer/unit tests so all hex-art owner paths have full authoritative dimensions, exact clips and one camera-relative transform.
- Measure force and contact cell ratios at opening, detail and maximum zoom and assert they do not shrink, remain centered and remain contained.
- Verify pointer, keyboard, wheel, button and camera-preserving zoom behavior plus visible zoom status.
- Run focused renderer/viewport/UI tests, campaign professional UI, complete campaign suite, browser geometry and command UI suites, production build, zero-warning lint and the full test suite.
- Inspect the integrated diff, obtain independent expert review, deploy one clean release candidate, then reproduce the screenshot state and zoom/selection/action flows in the connected external browser.

---

## 2026-09-05 — FSG-CAM-004 authoritative naval support: coordinate and persistence impact

### Intended behavior and scope
- One pure campaign-domain evaluator supplies task-force eligibility, engagement caps, exact commitment, tactical source identity, charge receipts, AAR and save/resume. `economy.navalPower` remains a separate economic value.
- Public `sourceHexKey` and `battleHexKey` use offset `col,row`. Runtime tile keys and authored `tile.hex` use axial `q,r`. The range remains six campaign hexes, inclusive; the conversion convention is the existing odd-column convention, not a new geometry rule.
- Each task force grants one indivisible engagement entitlement with the existing two-charge tactical asset. Readiness must be exactly 1: reduced structural integrity, effectiveness or a disabled condition blocks this single entitlement. Unused entitlements release on resolution; any use expends that source until the following campaign segment. Replenishment never bypasses current readiness, target authorization or range.
- Public totals and source rows distinguish `availableSupportAssignments` (eligible engagement reservations) from `availableFireMissions` (actual tactical charges). `fireMissionsPerAssignment` comes from the same `createOffMapSupportAsset` profile used by tactical initialization, currently two. Builder caps and ledger quantities use assignments exclusively. This projection correction does not change persisted package quantities, tactical charges, rules fingerprints or historical hashes.
- V3 tactical support snapshots expose the frozen fleet label as `<fleet label> naval gunfire` through their existing `label` property (the actual engine/display contract). Earlier v2 assets retain their historical generic label. No new engine property or tactical engine edit is required.

### Current behavior and expected change
- Previously the builder counted task-force capacity without current damage, reservation or expenditure checks and could count a naval force twice. Logistics and fleet inspection used independent values. A manually supplied cap could create support with no source.
- Source reservations now freeze into battle-package v3, per-source charge accounting into result v2, and friendly source receipts into AAR v2. Scoped runtime `navalSupportRulesVersion` identifies this rule change. Earlier package/result/report versions retain their historical hashes and tactical IDs.
- An older package with no naval commitment needs no naval attribution. A legacy naval commitment is recoverable when its frozen source identities prove one unique assignment, including an omitted legacy force count. Missing or ambiguous source identity must produce explicit pre-engagement-save recovery guidance instead of inventing a historical fleet.

### High-risk impact analysis, recorded before further coordinate edits
- Consumers: domain engagement builder and AI engagement builder; `CampaignState.getPlayerNavalSupport`; parent-owned Logistics/fleet/precombat views; engagement invariant validation; tactical support adapter; result extraction; AAR; campaign persistence.
- Events: existing campaign scenario load, engagement commitment, result application and segment resolution refresh state projections. No new event, DOM selector, renderer dependency or tactical-engine callback is introduced.
- Visual risk: confusing offset source keys with axial runtime keys can attach availability to the wrong fleet or suppress the correct inspector row. The public contract and tests must make odd/even-column differences explicit. Map centers, pan, zoom, sprites and tactical coordinates are unchanged.
- Rule risk: a coordinate mismatch could incorrectly authorize a target at the range boundary or reassign a persisted source. Reuse core `hexDistance`/neighbors and the existing pure `axialToOffsetKey`/`offsetKeyToAxial` functions exported by `CampaignIntelligence`, already used by campaign-domain control resolution. Core currently exposes no offset conversion helper. Keep strict key validation in the naval boundary, remove copied conversion arithmetic, and do not import rendering `CoordinateSystem` or broaden shared core scope.
- Persistence risk: do not rehash existing active tactical packages to add guessed source identities. Migration must be pure and idempotent; reservations and used/unused source identity must survive serialized round trips.

### Verification and replay checklist
- [x] Baseline RED: destroyed fleet still authorized support (`FSG_CAM_051`); a fabricated cap committed without a fleet (`FSG_CAM_052`).
- [x] Initial isolated TypeScript emission under `dist-tsc-check/naval`: exit 0; no shared `dist-tsc` deletion.
- [x] Initial `FSG_CAM_051..059`: 9 passed; ledger/save/result/AAR regression selection: 27 passed; owned lint: zero warnings.
- [x] Extended coordinate checks cover explicit odd/even offset source/target keys and negative coordinates, inclusive six-hex range and no off-map target acceptance (`FSG_CAM_053_OFFSET_COORDINATE_REPLAY`).
- [x] Extended migration checks cover uniquely attributable missing-count naval records and no-naval records, with repeated migration and complete hash/source-ID comparison (`FSG_CAM_059_LEGACY_MISSING_COUNT_AND_NO_NAVAL_PACKAGES_LOAD`). The 11 naval cases and changed-file lint pass after targeted emission only.
- [ ] Parent completes final single integration typecheck, test registration and live Logistics/fleet/engagement/AAR visual verification. No further parallel full build/compile, no engine/BattleScreen edit, commit, push or deployment is authorized in this domain task.

---

## 2026-08-29 — Campaign professionalization corrective tranche: map ownership and command continuity

### Intended behavior
- One friendly base marker owns its visual identity, pointer/keyboard target, disclosure, accessible name, and selection locator.
- Strategic entities remain legible in screen pixels at theater, normal, and close zoom without transparent targets stealing adjacent hexes.
- A known site exposes one concise custom disclosure and no browser-native gameplay tooltip or authoring/provenance dump.
- A map rerender restores the selected entity, movement origin, front target, order preview, map-list state, inspector route, and accessible selected state.
- The active inspector presents authored strategic geography before installation/formation facts, keeps a fixed parent route during formation drill-down, and retains a visible Orders state with an exact blocker when an action is unavailable.

### Current behavior
- Friendly bases are rendered three times: a hex-scaled installation sprite, a permanent formation footprint, and a counter-scaled circular badge. Selection then recolors the entire hex.
- Marker scale is derived from zoom using map-space transforms, allowing visible markers and their targets to shrink below usable screen-pixel dimensions.
- Known sites combine an SVG `title` with a second custom disclosure whose ordinary map copy contains precision taxonomy, related-location lists, sources, and an instruction.
- `CampaignMapRenderer.render()` reconstructs the SVG while `CampaignScreen.renderCampaignMap()` restores camera binding but not selection or other presentation state.
- The inspector lacks an authored geography contract and places the base-return route after the long formation body; a blocked reconstruction action can lose its only visible explanation.

### Expected change
- Skip standalone installation and permanent force-stack rendering for a friendly base; render one centered owned installation marker with a restrained strength cue and screen-space selection/focus locator.
- Make marker visuals/disclosures counter-scale to a bounded screen-pixel contract while pointer geometry remains explicit and sibling-safe.
- Remove gameplay SVG titles and reduce site disclosure to name, concrete type, and one safe assessment.
- Add one post-render restoration method owned by `CampaignScreen` and call it after renderer/viewport reconstruction.
- Extend the command hex projection with optional authored geography facts and the inspector route with a fixed parent action and state-owned Orders explanation.

### Impact analysis
- Consumers: campaign map/list selection, `MapViewport`, campaign overlay switching, inspector routing, planner origin/target highlighting, keyboard selection, accessibility snapshots, and campaign CSS.
- Events: `scenarioLoaded`, `intelligenceUpdated`, `segmentResolved`, `dayAdvanced`, UI selection changes, and map overlay changes.
- Visual risks: marker density across the 58×50 map, neighboring English-base hit targets, selection contrast, known-site collisions, force visibility, and compact-sheet coverage.
- State risks: renderer changes remain presentation-only. No campaign scenario, economy, formation, order, intelligence, combat, RNG, or save truth is mutated.
- High-risk boundary: `CampaignMapRenderer.ts` and coordinate-derived marker placement change. Canonical hex centers and coordinate conversion stay unchanged; geometry regressions must measure the final rendered screen-space contract.

### Verification
- Add/update focused map renderer, viewport, command foundation, command shell, selection restoration, and action-blocker regressions that fail on the recorded behavior.
- Run focused tests, `npm run test:campaign`, `npm test`, `npm run build`, zero-warning `npm run lint`, skill validation, and `git diff --check`.
- Independently review UI/UX and test nonredundancy before one batched production push; certify exact live reproductions through the external Chrome extension only.

---

## 2026-08-27 — Campaign command interface and period-literacy overhaul

### Decision
- Treat the campaign map as an operational command map, not a database browser. One hex owns one clear map identity; its complete roster, regional relationships, and capabilities appear only after deliberate selection.
- Remove implementation and museum-language from the player experience. `Historical network`, `What this is`, `What is here`, and `What can I do` are replaced by period-appropriate, task-oriented language.
- Stop generating visible unit names from a base, destination, unit type, and global ordinal. Every player-visible formation receives a sourced or explicitly authored WWII formation identity at the correct echelon.
- Collapse the idle bottom tray into a compact command strip. The full order tray and timeline become drawers that open only when the player requests them or when a draft, conflict, mandatory interruption, or new report requires attention.
- Preserve the authoritative campaign model, exact formation identity, save behavior, intelligence boundary, and order legality. This overhaul changes presentation and authored identity first; it does not disguise rule changes as visual cleanup.

### Why the current interface fails
- `historicalNetwork` is an authoring convenience that currently leaks directly into both the hover card and inspector. A WWII commander would see `Satellite airfields`, `Embarkation ports`, `Assigned sector`, or a real supply route—not a generic historical network.
- The hover disclosure combines base type, every represented place, formation summaries, and an instruction. It also owns an SVG `<title>`, so the browser can place a second native tooltip over the authored card. The result is two overlapping explanations for one marker.
- Every positive aggregate count becomes a persistent formation and receives a generated visible suffix. That is why Tangmere becomes a scroll of `Eastern tactical fighter groups 8`, `9`, `10`, and `11`, and why Southampton and Portsmouth name battalions after intended beaches. The identifiers are stable for state, but the names are not acceptable player-facing identities.
- The base inspector lists atomic records rather than an intelligible chain of command. Useful actions are pushed below a long roster, while generic explanatory headings and repeated role/control facts consume the first screen.
- The campaign shell reserves 96 px for an empty order tray and 132 px when populated. That is appropriate for an open planning surface, not an idle state. The permanent height reduces the primary map—the place where most campaign decisions begin.
- Several English sites represent multiple facilities at the 10 km scale. That abstraction is defensible only when the primary marker remains a real place and the related facilities are disclosed as subordinate/satellite locations. Cramming all place names into the marker makes the abstraction look like a geographic error.

### Reference-game lessons to adopt

| Reference | Relevant pattern | Four Star General application |
| --- | --- | --- |
| [Gary Grigsby's War in the West manual](https://www.matrixgames.com/amazon/PDF/WarintheWestmanualPREVIEW.pdf) | A selected hex opens a unit bar with one box per operational unit; the map counter remains bounded, unit names lead to deeper detail, air groups are assigned to fixed air bases, and air directives carry the operational order. | Keep base/unit markers compact, group the roster by real formation, and move complete strength/readiness/attachment detail into drill-down. Airfields host named wings/groups; they do not manufacture generic numbered copies. |
| [Unity of Command II manual](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/809230/manuals/Manual_-_Unity_of_Command_II_-_Revision_9.pdf) | The map remains the primary surface; unit strength is communicated beside the unit, selection reveals details, and supply/HQ capabilities become contextual overlays or actions. | Put only identity, broad state, and a small stack/readiness signal on the map. Reveal range, supply, assigned units, and legal orders contextually after selection. |
| [Decisive Campaigns: Ardennes Offensive manual](https://ftp.matrixgames.com/pub/DecisiveCampaignsArdennesOffensive/DC%20Ardennes%20manual%20EBOOK.pdf) | The game explicitly aims to reduce interface overwhelm without reducing simulation complexity; direct selection and contextual order modes keep turns moving. | Complexity remains in state and detail views, while selection leads directly to the few legal orders for the selected command object. |
| [Strategic Command WWII: World at War manual](https://ftp.matrixgames.com/pub/amazon/PDF/Strategic%20Command%20WWII%20World%20at%20War%20EBOOK.pdf) | The player can choose sprites or counters, while fog of war hides enemy production, strength, and other unearned facts. | Preserve the current sprite-first direction and Player-safe intelligence boundary; do not compensate for sparse presentation by exposing hidden enemy truth. |

These are design references, not templates to copy. Four Star General should retain its own visual language, continuous three-hour campaign clock, exact formation persistence, and campaign-to-tactical handoff.

### Target player experience

#### 1. Map: one clear object per hex
- A base at normal zoom shows one installation sprite, a selection/faction ring, and at most one compact state badge such as `3 wings ready` or `6 formations due`.
- Hover or keyboard focus shows one bounded disclosure, normally two lines:
  - `RAF Tangmere`
  - `No. 126 (RCAF) Wing · 3 squadrons ready`
- The disclosure never lists every represented place or every atomic formation. It contains no instruction such as `Select for full roster`; cursor/focus styling and accessible semantics already communicate interactivity.
- Click, Enter, Space, touch, and the map list select the same base and open the same inspector route.
- Remove the native-tooltip collision. The SVG `<title>` must not duplicate a custom visual card. Keep the full accessible name through `aria-label` and provide one authored visual disclosure.
- Distinct rules-bearing installations occupy distinct registered hexes when the 10 km map and background geography support them. A scale-consolidated base keeps one principal historical name; secondary locations appear only in its details as `Satellite airfields`, `Associated ports`, or `Embarkation anchorages`.
- Nearby markers cluster or suppress subordinate badges at theater zoom; the selected/hovered object can expand without covering a sibling marker center.

#### 2. Inspector: identity, assigned command, orders
Replace the generic three-question framework with a compact military hierarchy:

1. **Header** — `RAF Tangmere` / `Air Station · Operational`.
2. **Station** — one sentence of operational purpose; condition and actual contribution; optional collapsed `Associated fields` detail (`Westhampnett, Ford`). The word `historical` is not player-facing.
3. **Assigned formations** — one row per operational formation at the authored echelon, not one row per legacy count. A row shows name, aircraft/equipment, current strength/readiness, and a small subordinate count. Selecting it opens exact subunit detail.
4. **Orders** — only legal, relevant actions such as `Rebase aircraft`, `Embark formations`, `Allocate air support`, or `Repair airfield`. No empty or disabled generic action block.

The first inspector frame must fit the station purpose, summarized assigned command, and all immediately legal actions at 1440×900. Long rosters scroll inside the formation section; actions remain visible. Exact formation records remain accessible in a secondary detail route without turning the primary base view into an inventory dump.

#### 3. WWII formation naming and hierarchy
- Add authored presentation identity to the campaign formation source: `displayName`, `shortName`, `service`, `echelon`, `parentFormation`, `equipmentLabel`, and optional subordinate identities. Runtime IDs remain machine-stable and invisible.
- Names describe the unit, never its current base or intended destination. Remove visible patterns such as `Eastern tactical fighter groups 11`, `Solent supply columns 8`, and `Gold and Juno follow-on battalion groups 4`.
- Use the correct national organization:
  - RAF/RCAF examples: `No. 126 (RCAF) Wing`, with `No. 401`, `411`, and `412 Squadrons`; equipment `Spitfire IX`.
  - USAAF examples: `354th Fighter Group` or `344th Bombardment Group (Medium)`, with subordinate squadrons in drill-down; equipment `P-51 Mustang` or `B-26 Marauder` where historically correct.
  - Ground examples: division/brigade/battalion identities appropriate to the campaign abstraction, with service and parent formation separate from the visible name.
- Do not invent convincing-sounding unit numbers. The user's `50th P-51 Squadron`/`66th B-17 Wing` examples express the desired tone, but final names must match the 6–7 June 1944 organization and equipment. The [Allied Expeditionary Air Force D-Day OOB](https://www.ibiblio.org/hyperwar/UN/UK/UK-RAF-III/UK-RAF-III-XI.html), [U.S. Army Cross-Channel Attack history](https://history.army.mil/portals/143/Images/Publications/catalog/7-4.pdf), RAF Air Historical Branch material, and service histories are the minimum source set.
- For example, the official OOB records No. 126 (RCAF) Wing with Nos. 401, 411, and 412 Squadrons, and the Canadian government's D-Day table places those squadrons at Tangmere with Spitfire IXs. That is the level of source-to-label traceability required.
- Store source references in authored documentation/tests, not in normal player copy. The player sees the command identity, not a citation or the label `historical`.

#### 4. Compact command strip
- Idle height target: 48–56 px at desktop sizes, replacing the current 96 px empty tray.
- Idle layout:
  - left: `No orders` or `2 orders ready` button;
  - center: advance boundary (`Next report`) and optional pause behavior;
  - right: one primary `Advance` button and compact `Timeline`/`Reports` buttons with counts.
- Selecting `Orders` opens a drawer above the strip. A new draft, conflict, blocked order, or mandatory defense may open or pulse the drawer, but never silently steals focus.
- Selecting `Timeline` opens the existing timeline as a drawer without increasing the idle strip height.
- When drafts exist, the strip shows status and `Commit`; the detailed cards remain in the drawer. Completed history is not kept in the primary order surface.
- Mobile/short-height layouts use the same compact strip and a full-width sheet. The map remains the dominant surface.

#### 5. Period language rules
- Remove from ordinary campaign UI: `Historical network`, `network` without a defined gameplay connection, `What this is`, `What is here`, `What can I do`, `projected forces`, raw role IDs, raw order IDs, and source/research language.
- Use specific military terms only when their rule is real:
  - `Satellite airfields` for associated landing grounds;
  - `Embarkation ports` or `Anchorages` for ports represented by one command node;
  - `Supply line` only if a trace/range/capacity is actually modeled;
  - `Assigned sector` for geographic command responsibility;
  - `Known installation` or `Reported enemy activity` for Player-safe intelligence.
- The interface may be modern in usability, but its nouns and hierarchy must belong to a 1944 headquarters.

### Implementation sequence

#### Work package A — source-backed OOB manifest
- Build a table for every visible Allied air, ground, transport, naval, and logistics formation at the opening: historical name, service, echelon, parent, equipment, 7 June location/status, gameplay abstraction count, and source.
- Decide which existing atomic records are actual subunits and which are only strength steps. Do not rename ten identical strength records into ten fictional squadrons.
- Define aggregation rules before editing `campaign01.json`: the inspector may present one Wing/Group while the runtime retains several exact combat elements beneath it.
- Exit gate: no player-visible formation is location-derived, destination-derived, globally numbered, or unsourced.

#### Work package B — typed presentation projection
- Extend authored formation presentation metadata and create a Player-safe formation-summary projection owned by state, not UI.
- Return grouped base command views with exact child IDs, current readiness, transit/arrival state, and legal action previews.
- Keep saved runtime identities and orders stable. If authored rules truth changes, use pristine reseed/progressed-save fail-closed migration; do not rewrite a progressed campaign's OOB silently.
- Exit gate: renderer and inspector consume the same grouped projection; no UI reconstructs hierarchy from labels.

#### Work package C — map disclosure simplification
- Replace the current multi-line `Network + forces + instruction` hover card with the two-line identity/command summary.
- Remove duplicate native visual tooltips while retaining accessible names.
- Add zoom-aware collision and sibling-center hit testing for denser English bases.
- Exit gate: at theater, normal, and close zoom, only one disclosure is visible; it names one place and one summarized command; no neighboring marker or road/coast contour is obscured.

#### Work package D — base inspector rebuild
- Replace generic headings with `Station`/`Port`/`Headquarters`, `Assigned formations`, and `Orders`.
- Group formations by authored parent; show a maximum of roughly six summary rows before a `View all` route rather than an unbounded first-frame list.
- Keep detailed readiness, cohesion, subordinate units, transit history, and exact identity in formation drill-down.
- Exit gate: a new player can answer in one frame: what did I select, what command is based here, and which orders are legal now?

#### Work package E — command strip and drawers
- Refactor shell layout variables so empty state is 48–56 px and map/inspector bounds use the live strip height.
- Move order cards, commit feedback, completed history, and timeline list into explicit drawers.
- Preserve keyboard focus, advance-boundary semantics, atomic commit, conflict recovery, and mandatory-interruption stops.
- Exit gate: empty campaign frame recovers at least 40 px of vertical map space; drafts/conflicts remain one action away and never become hidden state.

#### Work package F — content and tone pass
- Replace generic base summaries with concise operational copy.
- Replace `historicalNetwork` with typed relationships such as `satelliteFields`, `associatedPorts`, or `assignedSector`; render those only in expanded details.
- Apply the sourced OOB names and equipment labels to the shipped Normandy opening.
- Exit gate: automated DOM/text scan rejects implementation vocabulary, generated ordinal names, raw type IDs, and faux-historical citations in player copy.

#### Work package G — migration, tests, and live certification
- Add exact content-hash handling for presentation-only versus rules-affecting OOB changes.
- Focused tests:
  - one base marker and one disclosure per hex at all supported zooms;
  - no native/custom tooltip double display;
  - grouped formation summary maps to every exact child ID once;
  - RAF/RCAF/USAAF/ground naming fixtures use correct echelon and equipment vocabulary;
  - no visible name contains base/destination-derived prefixes or a generated trailing ordinal;
  - base/map-list/inspector/drill-down identity remains continuous;
  - empty command strip is no more than 56 px; populated drawer preserves commit, edit, cancel, timeline, and advance flows;
  - responsive 1440×900, 1280×720, 800×900, 640×360, and 200%-equivalent layouts preserve map, inspector action, and keyboard reachability.
- Live external-Chrome acceptance:
  1. start a fresh Western Europe campaign;
  2. inspect Tangmere, Southampton, Portsmouth, Plymouth, and Bristol by hover/focus, click, and map list;
  3. drill into a wing/group and a ground/logistics formation;
  4. create, edit, cancel, and commit an order through the collapsed strip/drawer;
  5. advance to the next report and inspect the timeline;
  6. capture screenshots at all supported viewports and reject crowding, duplicate disclosure, hidden actions, or non-period language.
- Update `validate-four-star-campaign` gates after the first implemented slice so later agents reject generic network language, destination-derived unit names, ungrouped atomic rosters, duplicate tooltips, and an oversized empty order tray.

### High-risk and regression boundaries
- `CampaignMapRenderer`, campaign shell geometry, formation projection, and save content identity are high-risk. Follow the repository high-risk protocol and keep behavioral work separate from structural refactoring.
- Do not alter combat strength, production, air-sortie capacity, naval support, formation availability, or order legality merely to make the new names fit.
- Do not reveal hostile formation names or exact counts through the new hierarchy. Friendly OOB richness and enemy intelligence uncertainty are separate contracts.
- Do not use emojis, browser-native dialogs, browser-native gameplay tooltips, raw IDs, or debug/source labels.
- Do not push intermediate visual experiments. Complete the overhaul locally in independently verified slices, then batch one production-triggering push after full campaign, full suite, build, zero-warning lint, skill validation, and live proof are green.

### Definition of done
- The map is the dominant surface and no normal frame looks like an open database table.
- Every base has one concise historical identity; related facilities are subordinate detail, not a phrase crammed into the marker.
- Every visible formation has a correct WWII name and echelon, with equipment and parent command separated into structured facts.
- The base inspector presents summarized command organization and legal orders before detailed subunits.
- The empty command strip consumes no more than 56 px and the full order/timeline surfaces open on demand.
- A player can inspect Tangmere and immediately understand `where`, `who`, `equipment/readiness`, and `available orders` without encountering `historical network`, generated unit ordinals, or redundant tooltips.

---

## 2026-08-26 — Complete the historically grounded full-theater map

### Intended behavior
- The 58×50, 10 km-per-hex Northwestern Europe surface must read as one operational theater rather than a detailed beachhead floating inside empty artwork.
- Southern England exposes the grouped embarkation, build-up, air, naval, command, and reinforcement network that made the invasion possible.
- Occupied Europe exposes fixed ports, airfields, radar sites, coastal-defense sectors, transport nodes, and named objectives already known through maps, aerial photography, naval intelligence, and resistance reporting.
- Fixed-site knowledge remains separate from live controller, garrison, damage, capacity, and mobile-formation truth.
- Every player-controlled runtime base has a truthful contribution or arrival responsibility; geographic context that does not own gameplay capability remains briefing-only.
- Map sprites stay unobtrusive at theater scale. Hover/focus and click disclose identity and purpose; the map list provides the large-target alternative.

### Current behavior
- Five English logistics hubs and two airfields represent the entire Allied staging network.
- Thirteen briefed continental records mix military installations and general towns, leaving most of Brittany, the Channel ports, the Seine approaches, the Pas-de-Calais, and the Low Countries visually and operationally blank.
- The official Neptune loading plan alone names more departure locations than the campaign's complete English base layer; Allied planners also tracked dozens of enemy airfields and coastal batteries.

### Expected new behavior
- A source-backed grouped site matrix covers every declared theater region with concise historical names and explicit category/purpose.
- The authored scenario distinguishes actionable Allied runtime bases, immutable known fixed hostile sites, other strategic geography, and uncertain mobile contacts.
- The opening economy and tactical support balance remain intentional: new base geography redistributes existing abstract capacity unless a sourced new capability has a tested consequence.
- The content hash and migration policy change deliberately. Pristine openings reseed deterministically; progressed saves fail closed when rules truth cannot be reconstructed without rewriting history.

### Edge cases
- No added ground/base marker may land on a registered water hex; no fleet marker may land on land.
- Same-hex known-site/contact records coalesce without losing the historical place name or leaking mobile-force truth.
- Dense neighboring facilities remain independently selectable at minimum, normal, and close zoom.
- Sites outside current command responsibility may be known and searchable without exposing a fake action, production, capacity, or garrison.
- Production remains external theater support routed through England. Beaches, captured ports, airfields, batteries, and towns do not manufacture resources merely because they are strategically important.

### Impact analysis
- Consumers: campaign scenario adapter/runtime creation, map registration, water validation, formation registry, economy, intelligence projection, map renderer/list/inspector, base-action projection, objectives/front derivation, save content identity, and migration.
- State/events: added actionable bases or formations change fresh-campaign runtime truth; briefing-only sites do not enter runtime tile order or derive fronts.
- Visual risk: marker density, hit regions, hover disclosure, list discoverability, and map/inspector identity can regress even when authored coordinates are valid.
- Gameplay risk: decorative capacities, unintended fronts, doubled production, support-range drift, or unavailable formations entering combat would make a historically richer map mechanically false.

### Verification
- Add table-driven historical coverage assertions for every theater region and site category.
- Assert all anchors/sites/tiles are in bounds and agree with registered land/water geometry and at least two independent distance calibrations.
- Assert the Player projection excludes hostile runtime tiles, capacities, control, condition, forces, and raw palette truth while retaining immutable known-site identity.
- Assert every actionable Allied base has a state-owned contribution/action or a truthful arrival explanation and that total abstract production/support remains balanced.
- Assert pristine migration and progressed-save rejection through the normal CampaignState load path.
- Run focused suites, `npm run test:campaign`, `npm test`, `npm run build`, zero-warning lint, skill validation, and live external-Chrome theater sweeps before one batched push.

---

## Normandy D+1 Historical Map and Intelligence Clarity Plan

### Intended behavior
- The 7 June 1944 opening should visibly read as the Normandy lodgment: Utah, Omaha, Gold, Juno, and Sword in west-to-east order on the French coast.
- Allied formations should occupy their D+1 beach and airborne sectors, while German formations should occupy historically plausible opposing and reserve sectors.
- Enemy intelligence should appear as a compact, player-safe assessed-contact token contained inside its hex. Selecting the token or its map-list entry should center the same contact and open the same useful inspector.
- Named geography should explain what a hex represents without covering force art, terrain, or adjacent hexes.

### Current behavior
- Two large `ENEMY` text plates and repeated `Ground contact · current intel` captions cover the terrain and underlying symbols.
- Clicking a contact marker resolves as a generic hex click, so the inspector discards the contact assessment.
- Map-list contact selection opens the contact inspector but does not center the selected contact.
- Most shipped formations are authored outside the declared 50x35 grid. The two opening contacts render only because grid overscan accepts those invalid coordinates, over generic inland roads rather than the Normandy coast.
- The opening uses two generic adjacent installations instead of the five named landing sectors and omits the airborne lodgments that define the D+1 situation.

### Expected new behavior
- Contact markers contain no visible `ENEMY`, age sentence, or generic text plate. A compact confidence/state ring and a broad assessed-domain sprite communicate the contact while exact player-safe details remain in the accessible name and inspector.
- Contact marker clicks carry the contact ID as well as the assessed hex; map and list selection both center, highlight, and reveal the contact route.
- Every authored tile lies inside the declared map bounds.
- The Normandy coast is explicitly named west-to-east, with a source-backed abstract order of battle: U.S. 4th Division at Utah; U.S. 1st/29th at Omaha; British 50th and 8th Armoured Brigade at Gold; Canadian 3rd Division and 2nd Armoured Brigade at Juno; British 3rd Division and 27th Armoured Brigade at Sword; U.S. 82nd/101st and British 6th Airborne behind the flanks. German opposition includes the 709th, 91st Air Landing, 6th Fallschirmjaeger Regiment, 352nd, 716th, 21st Panzer, and deeper operational reserves.
- One named Normandy Lodgment front explains why several nearby locations exist and requires the player to choose a specific sector before launching an attack.

### Edge cases
- Reported contacts without a classification use a question-mark token rather than inventing a unit type.
- Stale and disputed contacts remain visually distinct through stroke style; uncertainty remains a bounded area rather than a false exact unit position.
- Contact presentation never receives or reveals an authoritative enemy unit type or exact formation count.
- Scenario content changes fail closed for progressed legacy saves. A pristine prior campaign can be deterministically replaced with the corrected opening; committed orders, engagements, reports, changed control, or advanced time are not guessed across the new geography.
- Historical naming is presentation metadata only and does not replace authoritative role, control, objective, or formation state.

### Impact analysis
- Systems consuming this output:
  - `CampaignMapRenderer` intelligence and named-location layers
  - `CampaignScreen` map/list selection and inspector projection
  - Campaign runtime creation, front derivation, intelligence initialization, tactical engagement generation, save content identity, and migration
  - Campaign playtest skill acceptance criteria
- Events depending on this structure:
  - Campaign click selection carries an optional contact identity but retains the same hex and tile facts for ordinary map clicks.
  - Fresh-runtime formation IDs and initial intelligence contacts change deterministically with the corrected authored data.
- Visual behaviors that could shift:
  - The initial viewport and labels move to the actual Normandy coast.
  - Friendly formation stacks and assessed enemy contacts are distributed across historically named sectors instead of two adjacent hexes.

### Risk
- Campaign map rendering and content persistence are high-risk because map geometry, front adjacency, intelligence, tactical handoff, and save identity depend on them.
- No tactical combat formula changes. Historical quantities remain an operational abstraction of formations, not a literal soldier counter.

### Verification
- Add renderer tests for bounded, text-free contact tokens and click-carried contact identity.
- Add screen tests proving list and direct map contact selection center and reveal identical useful detail.
- Replace shipped-scenario regressions with bounds, west-to-east geography, source-backed order-of-battle, airborne, exact front adjacency, first-segment survival, and tactical handoff assertions.
- Add persistence coverage for pristine deterministic migration and progressed-save fail-closed recovery.
- Run focused campaign tests, the full test suite, lint, and build.
- Commit once, push once, wait for the one production deployment, then repeat the live external-Chrome acceptance at supported viewports.

---

## Friendly Base Progressive-Disclosure Plan — 2026-08-22

### Intended behavior
- Friendly installations use concise historical place names: Plymouth, Portland, Southampton, Portsmouth, Bristol, Exeter, and Tangmere.
- The normal map frame contains the installation sprite without a permanent operational-description label.
- Pointer hover and keyboard focus reveal a compact card that expands outward from the authoritative base hex with the place name and ready formation summary.
- Click, Enter, and Space select the same base and open an inspector roster whose formation rows lead to the existing detailed formation route.
- The map-list alternative, map marker, hover/focus card, selected base, formation roster, logistics effects, arrivals, and order eligibility all retain one identity.
- Fleet support advertised by the operational map becomes an exact tactical support asset whose fire missions, remaining charges, save state, and campaign cost all reconcile.

### Current behavior
- Friendly staging sites use planning phrases such as `Bristol Build-up`, `Western Ports`, and `Air Support West` as permanent map labels.
- The label layer treats these interactive installations as geographic annotation, creating avoidable obstruction around the base and nearby hexes.
- Selecting a base shows one semicolon-joined force sentence; the detailed persistent formation roster is available elsewhere but is not connected to the base inspector.
- Base sprites are images rather than keyboard-focusable entity markers, so the map itself cannot provide equivalent focus disclosure.

### Expected new behavior
- Persistent labels remain limited to true geographic annotations such as beaches, towns, and regions.
- Every friendly base marker exposes a stable accessible name, a generous but bounded hit target, hover/focus disclosure, and click/keyboard selection.
- The disclosure card is player-safe, names only ready projected groups, never covers its anchor, and stays inside the registered map bounds.
- The inspector lists formations at the selected base with status, readiness, cohesion, availability, and a direct route to full formation details.
- A committed in-range naval support option seeds one real NGFS asset; declining support seeds none, and unrelated placeholder assets never enter a campaign battle.

### Edge cases
- An empty or future-arrival base says that no formations are currently ready while the inspector still shows scheduled formations and their real calendar ETA.
- Dense neighboring bases do not leave persistent label clutter; only the currently hovered/focused marker expands.
- Compact/touch layouts do not depend on hover: click and the map list provide the same details.
- Force art layered over an installation must not prevent base selection or hover/focus disclosure.
- Content-label changes migrate the exact previous full-theater hash without resetting progressed campaigns because no rules truth changes.

### Impact analysis
- Systems consuming this output:
  - authored campaign presentation labels and content-hash migration
  - CampaignMapRenderer sprite, label, force, keyboard, and pointer layers
  - CampaignScreen command projection
  - CampaignContextInspector and CampaignCommandShell selection routing
- Events depending on this structure:
  - map hex selection, inspector reveal, formation selection, keyboard activation, renderer rebuild, and save load
- Visual behaviors that could shift:
  - southern England loses permanent base-name clutter
  - one selected/hovered base gains a bounded anchored disclosure card
  - the inspector gains a formation roster below installation facts

### Risk assessment
- Renderer changes remain player-projection-only and use existing authoritative hex centers.
- Order and tactical support changes cross state boundaries, so exact formation reservations, water-aware routes, package-derived support identity, charge use, and save/hydration require direct regressions.
- Migration accepts only the exact preceding full-theater hash and changes presentation identity without mutating campaign progress.

### Verification
- Add renderer geometry, pointer/focus visibility, keyboard activation, persistent-label exclusion, and no-ready-force regressions.
- Add base-inspector formation routing and projected-detail regressions.
- Add shipped historical-name and exact presentation-only save-migration regressions.
- Run focused tests, `npm run test:campaign`, `npm test`, `npm run build`, zero-warning lint, skill validation, and `git diff --check` before one deployment-triggering push.

---

## 2026-08-22 — Restore the full D+1 theater picture

### Intent
Keep the source-registered 10 km hex scale and historically defensible eight-hex Utah-to-Sword frontage, while restoring the cross-Channel support network, known enemy infrastructure, assessed enemy dispositions, and follow-on Normandy campaign arc that the registered-map rebuild made visually and mechanically absent.

### Current behavior
- The 58×50 background and coastline registration are correct, but only 24 strategic tiles are authored and 22 of them cluster around the lodgment.
- Opening and Reset force a 1.5× primary-objective close-up, so the two small unlabeled UK staging markers are outside the useful frame.
- The Operational map list exposes only fronts, while fixed German sites have no safe knowledge projection: unconfirmed sprites can survive into rendered scenario truth even though force and infrastructure details are stripped.
- The campaign ends after holding the beaches, Cherbourg, and Caen; the map contains no playable Saint-Lô breakout, Falaise encirclement, or Seine pursuit arc.

### Expected new behavior
- The theater view exposes named Allied embarkation, logistics, air, naval, and follow-on-force anchors in southern England and the Channel without making all formations permanent opening-frame clutter.
- Recon-confirmed fixed German ports, batteries, airfields, and road/rail hubs are visible as known sites. Mobile German formations outside direct contact appear only as player-safe, uncertain intelligence assessments.
- Opening presents the cross-Channel command picture; explicit `Theater overview` and `Active front` controls let the player move between strategic scope and tactical relevance without overloading Reset.
- The Normandy arc continues from lodgment through Cherbourg/Caen, Saint-Lô/Avranches breakout, Falaise/Argentan encirclement, and the Seine approach on connected, image-registered land hexes.
- Exact enemy forces, readiness, supply, infrastructure condition, and economy remain absent from the Player projection unless intelligence rules have earned them.

### Impact analysis
- **Consumers:** Campaign scenario adapter/runtime, formation registry, objective evaluator, front derivation, intelligence initialization/projection, map renderer, overlay list, inspector, campaign camera, saves/content migration, and tactical engagement generation.
- **Events/state:** Authored content hash changes. Only pristine prior openings may migrate to the expanded theater; progressed saves on retired geography must continue to fail closed.
- **Visual risk:** Additional anchors can recreate clutter, collide with labels, obscure contours, or become illegible at overview scale. Strategic-site symbology must remain bounded and contacts must stay confined to Intelligence.
- **Gameplay risk:** Added Bot territory must not create unintended opening fronts, immediately accessible reinforcements, duplicate formations, impossible objectives, or truth leaks. Every new phase needs a connected capture route and deterministic natural completion path.

### Edge cases and regression gates
- Verify every new tile, water key, objective, and front endpoint is in bounds and land/water legal under the registered grid.
- Verify the opening front set remains the intended four sectors while future connected territory derives new fronts only after control changes.
- Verify known-site projection contains only label, broad role, location, provenance, objective relationship, and explicit unknown condition; reject hidden supply/capacity/integrity/forces.
- Verify remote photo-recon contacts have uncertainty and broad classification only at earned knowledge levels; do not expose formation names or exact counts.
- Verify full campaign objectives form an achievable dependency chain and victory requires the final pursuit phase.
- Verify overview/active-front camera controls, label collision, marker selection, keyboard/list alternatives, save migration, campaign suite, full suite, build, lint, and external-Chrome live frames before one batched release.

---

## Airshow Camera and Mobile Battle Zoom Plan

### Intended behavior
- Airshow strike playback should focus the full bomber package corridor without over-weighting repeated origin or destination hexes.
- Airshow camera recenter/idle restoration should preserve the most recent point-based package focus instead of reverting to an older hex focus.
- Zero-strength live/tutorial bomber playback should continue to seed bomber visuals from the same stack threshold used by normal unit rendering.
- Battle map zoom and pan should work on mobile through touch gestures while preserving desktop wheel zoom and middle-mouse pan.

### Current behavior
- Point-focused airshow playback updates the viewport transform but does not clear stale hex focus state, so later recenter flows can return to the previous hex.
- Linked strike focus averages duplicate hex centers when clustered operations share origins or destinations.
- The bomber visual seed uses a raw numeric threshold that can drift from stack-count rendering rules.
- Mobile users have no touch-first battle camera path; viewport interactions depend on wheel zoom and middle-mouse panning.

### Expected new behavior
- Linked strike focus deduplicates hex keys before computing the package centroid.
- `BattleScreen` tracks either the last focused hex or the last focused viewport point and recenters using the active focus mode.
- `HexMapRenderer` uses one named minimum-strength-per-stack constant for both stack counts and zero-strength bomber visual seeding.
- `MapViewport` handles one-finger touch panning and two-finger pinch zoom with native page gestures suppressed on the battle map surface.

### Edge cases
- Multi-strike clusters with shared origins should not pull the camera toward repeated hexes.
- Point-focused airshow playback followed by idle-warning dismissal or layout recenter should stay on the package focus.
- A bomber whose recorded strengths are all zero should still receive at least one visual actor.
- Releasing one finger after a two-finger pinch should reset touch state without corrupting the remaining pointer.

### Impact analysis
- Systems consuming this output:
  - `BattleScreen` air playback clusters and viewport restore/recenter flows
  - `HexMapRenderer` airshow runtime flight planning
  - `AirShowPlaybackPlanner.ts` bomber target-run paths
  - `MapViewport` battle map input handling
- Events depending on this structure:
  - Airshow playback timing and visual cluster execution remain unchanged; only camera focus and planned target-run geometry shift.
  - Pointer and wheel events continue to drive viewport transforms through `MapViewport`.
- Visual behaviors that could shift:
  - Strike playback camera centers farther along the full ingress/target corridor.
  - Multi-bomber target-run spacing becomes more symmetric.
  - Mobile battle maps can now pan and pinch-zoom instead of allowing the browser page gesture to own the interaction.

### Risk
- `BattleScreen.ts` and `HexMapRenderer.ts` are high-risk. Changes are targeted UI/rendering behavior fixes only; no engine state, combat math, or event schema changes.

### Verification
- Add touch pan and pinch zoom regressions in `tests/MapViewport.interactions.test.ts`.
- Run `npm run build`.
- Run `npm run test`.
- Run relevant airshow visual/Jest checks if time permits.
- Manual checklist: map panning and zoom stability; airshow camera framing; animation timing.

---

## Campaign Map Registration Rollback Plan

### Intended behavior
- Restore the last campaign map that was visually registered to the existing Central Channel artwork before the D+1 geography rewrite.
- Preserve later non-map fixes where they remain compatible, including player-facing interface cleanup, tactical handoff safety, and deployed-roster integrity.
- Establish a measured background-image registration and scale contract before another historical map rewrite is attempted.

### Current behavior
- The background asset is actually 1024×1024, while the scenario declares 2500×1750 and stretches it non-proportionally.
- The D+1 rewrite places beaches, airborne lodgments, fleets, and fronts from synthetic horizontal terrain bands rather than the painted coastline.
- At the default opening view, the operational area is a tiny unreadable cluster plotted in visible Channel water.

### Expected rollback behavior
- Scenario geometry, renderer presentation, opening focus, and associated persistence/tests return to the pre-rebuild map baseline at `da497d9`.
- Subsequent interface, reporting, battle, and deployment corrections remain unless they specifically depend on the retired D+1 geometry.
- The restored build is treated as a rollback baseline, not as historical certification; a future rewrite must begin from image registration rather than coordinate guesses.

### Impact analysis
- Consumers: campaign runtime creation, map projection, front selection, objective focus, save-content migration, engagement preparation, and visual renderer tests.
- Events: campaign entry, Reset, map selection, first segment, Player engagement preparation, and save load.
- Visual shift: the malformed tiny D+1 cluster is removed and the previously shipped Central Channel placements return.
- Risks: the old map contains known historical and authored-coordinate limitations. Those remain explicit follow-up work and must not be represented as corrected.

### Verification
- Run TypeScript, the campaign suite, the full suite, build, lint, and diff checks before the single rollback push.
- Confirm the public build no longer shows the malformed D+1 cluster before starting a registered redesign.
- For the redesign, verify real asset dimensions/aspect, background-only and grid-overlay evidence, coastline classification at every occupied hex, and a calibrated approximately 10 km-per-hex scale.

---

## Registered Normandy D+1 Map Redesign Plan

### Intended behavior
- Use the 1024×1024 Central Channel illustration as the authoritative geographic surface. The campaign grid must preserve that aspect ratio and follow its painted Channel, English coast, Cotentin, Normandy coast, rivers, and road network.
- Use one regular, contiguous campaign hex lattice whose neighboring centers represent 10 km. The full image is registered as a 58-column × 50-row flat-top odd-q grid, which covers approximately 500 km in both map axes without distorting the source art.
- Place the D+1 lodgment on the painted Normandy coast: Cherbourg at the Cotentin tip; Utah through Sword in west-to-east order along the shore; U.S. airborne forces behind Utah; British airborne forces east of Sword; Caen inland; separate western and eastern naval support stations in visible Channel water.
- Open the campaign framed tightly enough that the lodgment, fleet stations, airborne flanks, objectives, and opposing fronts read as an operational situation while preserving normal pan/zoom access to the full theater.

### Current behavior
- The restored baseline is visually usable but uses a legacy distorted 2500×1750 canvas, a mismatched pointy-top/odd-q renderer, and coordinates that are not historical D+1 placements.
- The rejected retry authored a 50×35 synthetic row-band map and placed its entire Normandy cluster into painted water.
- Source comments and metadata conflict between 5 km and 10 km per hex. Campaign 2.0 runtime and movement rules are already authoritative at 10 km.

### Expected new behavior
- The background renders at its actual 1024×1024 aspect with no crop or stretch. A registered flat-top odd-q lattice covers it edge-to-edge; every official coordinate has one visible hex and every visible neighbor relationship matches campaign axial math.
- The five beaches span eight campaign hexes, consistent with the U.S. Army's 50-mile description of the historical landing frontage. Cherbourg-to-Caen remains a source-art-registered operational abstraction.
- Water classification is derived and then explicitly authored from the painted background. Task forces must occupy water; every ground formation, infrastructure tile, objective, and front endpoint must occupy land.
- No synthetic terrain row may override the painted shoreline. Registration tests prove the asset dimensions, grid geometry, named anchors, land/water legality, front adjacency, and scale.

### Edge cases and risks
- Existing saves from retired Central Channel content identities must migrate only through the existing explicit migration contract; unrecognized geometry must fail closed.
- Coastline cells can straddle land and water. Authored anchor placement must use a land-majority footprint for ground positions and a water-majority footprint for naval stations, with beach cells intentionally centered on the land side of the painted edge.
- The campaign renderer, scenario geometry, map focus, engagement context, persistence migration, and shipped-scenario tests are high-risk consumers. Tactical hex rendering must remain unchanged.
- Named labels, force art, contacts, and front segments must remain inside their authoritative hex footprints and avoid obscuring the shoreline.

### Verification
- Capture background-only, registered-grid, anchor-overlay, and live opening frames at native aspect before certification.
- Assert 10 km scale, 1024×1024 source registration, 58×50 flat-top odd-q dimensions, regular neighbor spacing, and no background distortion.
- Assert both fleets are water; all non-naval authored tiles are land; every objective/front reference is in bounds and adjacent where required.
- Assert Utah → Omaha → Gold → Juno → Sword ordering and approximately 80 km frontage; assert Cherbourg northwest of Utah and Caen inland/east of Sword.
- Run focused renderer/shipped-scenario/persistence tests, TypeScript, campaign suite, full suite, build, diff checks, and a live external-Chrome acceptance pass before one batched push.

---

## Smoke Screen Implementation Plan

### Intent
Add smoke as a free tactical action for tanks, vehicles, artillery, and smoke-capable infantry. Firing smoke on a chosen hex edge blocks LOS across that edge for ground units for one full turn. Smoke requires ammo but does not consume movement or attack actions. Expires at the start of the following player turn.

### Scope
- `src/core/types.ts` — add `"smoke"` to `HexModificationType`; add `expiresOnTurn?: number` to `HexModification`
- `src/core/LOS.ts` — extend `Lister` with optional `smokeEdgeBlocksLOS(from, to): boolean`; apply smoke-edge check in `losClearAdvanced`
- `src/core/balance.ts` — register `"smoke"` in `TRAIT_EFFECTS`
- `src/game/GameEngine.ts` — `resolveLaySmokeAvailability`, `laySmoke()`, smoke expiry at turn start, smoke-aware `createLosLister()`
- `src/rendering/HexMapRenderer.ts` — `appendSmokePuffs()` + `"smoke"` case in `buildHexModificationOverlay()`
- `src/ui/screens/BattleScreen.ts` — `"laySmoke"` action card + handler; reuse fortification facing dialog

### Risk
HexMapRenderer and GameEngine are high-risk. Changes are additive only — no existing code paths modified.

### Verification
`npm run build`, `npm run lint`, `npm run test` must all pass. Manual: lay smoke → edge visual appears → LOS blocked on next attack → smoke clears at turn start.

## Recon Patrol Damage Integrity Plan

### Intended behavior
- Exposed motorcycle reconnaissance patrols use soft-target attack values and exposed-crew hit distributions rather than buttoned-armor treatment.
- Every applied personnel or equipment status change contributes to formation strength, even when the other platform component was already the lower readiness value.
- Previewed readiness loss, applied damage, activity details, and remaining strength all derive from the same engine classification and status model.

### Current behavior
- Combat requests classify only infantry and specialists as soft targets, so Recon Bike patrols use the attacker's hard-attack value.
- Authored recon hit distributions are blended almost entirely toward buttoned armor for small arms, despite the shared hit-distribution contract assigning `vsArtillery` to exposed artillery and recon targets.
- Platform readiness uses `min(personnel, equipment)`. When bike readiness is already lower than personnel readiness, a new personnel casualty is recorded but can produce exactly zero strength loss.

### Expected new behavior
- A canonical combat helper classifies targets from their actual protection: tanks, aircraft, and protected vehicles are hard targets; infantry, specialists, artillery, exposed light recon, and soft-skinned support vehicles are soft targets.
- Light recon uses the authored exposed-target distribution. Armored recon cars remain protected hard targets.
- Platform readiness adds full-strength-equivalent loss from personnel and equipment status channels. This preserves the full loss from a destroyed vehicle at full personnel readiness while ensuring later hits are not dampened by unrelated pre-existing crew or platform damage.

### Edge cases
- An already-damaged Recon Bike patrol at 88.89% equipment readiness receives one injured scout and must lose additional readiness.
- Infantry firing at Recon Bikes at range must produce nonzero status damage when contacts exist.
- Armored cars and tanks must remain hard targets and continue using protected hit distributions.
- A full-strength platform formation must remain exactly 100% ready.

### Impact analysis
- Systems consuming this output:
  - `GameEngine` previews, direct attacks, retaliation, bot combat, and mission combat requests
  - `damagePackets` preview/application parity
  - `BattleScreen` activity-log attack-type details
  - HQ/logistics status summaries derived from formation readiness
- Events depending on this structure:
  - Battle update events emitted after previewed and resolved attacks retain their schema; only corrected values change.
- Visual behaviors that could shift:
  - Recon Bike previews show `Soft Attack` and meaningful casualty/readiness projections.
  - Vehicle and aircraft strength can be lower when personnel and equipment are both degraded because neither status channel is masked.

### Risk assessment
- `Combat.ts`, `armorEffects.ts`, `status.ts`, and `GameEngine.ts` are high-risk deterministic engine modules.
- The change is behavioral and intentionally avoids structural refactoring. Existing public packet and event schemas remain unchanged.

### Verification
- Add deterministic regressions for damaged recon casualty application, exposed recon hit conversion, and armored recon hard-target classification.
- Run focused compiled combat tests, `npm run test`, `npm run lint`, and `npm run build`.
- Verify the attack activity detail uses the canonical engine classification.

---

## Deployment Panel Reserve Guard Plan

### Intended behavior
- A deployment click should consume a reserve at most once.
- If the UI is stale and a requested reserve no longer exists in the live engine queue, the battle screen must refresh from engine truth and provide a clear, actionable message instead of throwing an opaque engine error.

### Current behavior
- `BattleScreen` forwards deployment panel clicks directly to `engine.deployUnitByKey(...)`.
- When the same deployment request is processed after the reserve was already consumed, `GameEngine.findReserveIndexByUnitKey(...)` throws and the user receives a generic deployment failure.
- `BattleScreen.bindPanelEvents()` does not guard against repeated binding, which increases the risk of duplicate deploy handling if the screen is rebound in future flows.

### Expected new behavior
- `BattleScreen` performs a live reserve preflight before issuing a deployment command.
- If the target hex is already occupied by the just-placed unit and the reserve is gone, the second event is treated as a duplicate and ignored after a mirror refresh.
- If the reserve is genuinely absent, the user receives a structured deployment-panel error that explains what was attempted, what went wrong, and what to do next.
- Panel event binding is idempotent.

### Edge cases
- Duplicate deploy events for the same hex and unit key.
- Stale UI state where the panel still advertises a reserve that the engine has already consumed.
- Mixed reserve queues where the requested unit key must still be matched through scenario-type aliasing.

### Impact analysis
- Systems consuming this output:
  - `DeploymentPanel` event stream into `BattleScreen`
  - `DeploymentState` mirror refresh flow
  - `GameEngine.deployUnitByKey(...)`
- Events depending on this structure:
  - Deployment panel `deploy` events
  - `battleState.emitBattleUpdate("deploymentUpdated")`
- Visual behaviors that could shift:
  - Deployment failures should now refresh the panel back to live reserve counts before presenting an error.
  - Duplicate deploy clicks should no longer surface a false-negative panel error after a successful placement.

### Verification
- Add a focused regression test in `tests/BattleScreen.missionFlow.test.ts` covering duplicate/stale deploy handling.
- Run `npm run build`.
- Run the focused battle-screen test harness.

## AT Gun Preview Transparency Plan

### Intended behavior
- The attack confirmation modal should distinguish between authored unit stats and the range-adjusted combat math actually used for the shot.
- Anti-tank previews should explicitly show when `hardAttack` and armor penetration both influence the final damage-per-hit result.

### Current behavior
- `BattleScreen` labels the already range-adjusted accuracy term as `Base`, which reads like the unit's authored `accuracyBase`.
- The damage breakdown omits the attack-type scalar and the AP-vs-armor scalar, so anti-tank fire looks like it is skipping `hardAttack` or penetration even when the engine is applying both.

### Expected new behavior
- The preview should show the authored range-table value, the per-unit accuracy scalar, and the resulting base accuracy as separate steps.
- The damage breakdown should show the attack scalar (`softAttack` or `hardAttack`) and the penetration scalar (`effectiveAP` vs `facingArmor`) before commander bonuses.
- The modal should also surface the attacking weapon inputs (`accuracyBase`, attack stat, and AP) so the player can reconcile the preview with the unit card.

### Edge cases
- Soft targets should show `Soft attack` instead of `Hard attack`.
- Unarmored targets should explicitly indicate that no armor resistance applied.
- High-experience anti-tank units should still show their AP bonus separately from the authored AP stat.

### Impact analysis
- Systems consuming this output:
  - `BattleScreen` attack confirmation modal
  - Shared combat previews returned by `GameEngine.previewAttack(...)`
- Events depending on this structure:
  - Attack-confirmation modal refresh when a player selects a target
  - Stance re-preview refresh triggered by the attack dialog buttons
- Visual behaviors that could shift:
  - The detailed breakdown text in the attack modal becomes more explicit about range-base accuracy and armor-penetration math.
  - AT-gun previews should no longer look like they are using the wrong unit's base accuracy.

### Verification
- Add a focused combat test proving AT-gun damage responds to both `hardAttack` and AP.
- Add a battle-screen preview test asserting the modal text exposes range-table accuracy and penetration math.
- Run `npm run build`.
- Run a focused harness pass for the new AT-gun combat and preview tests.

## AT Gun Sustainment Balance Plan

### Intended behavior
- The 50mm AT-gun battery should model four guns sustaining materially higher fire volume per turn.
- The unit should carry enough ammunition to support that increased fire schedule without immediately exhausting the battery.

### Current behavior
- The shared towed AT profile uses `6` shots per turn.
- `AT_Gun_50mm` carries `5` ammo.

### Expected new behavior
- The towed AT profile should resolve `120` shots per turn, reflecting four guns firing roughly 30 rounds per minute across the turn window.
- `AT_Gun_50mm` should carry `6` ammo.
- The tuning entry should document that the battery's tow trucks keep enough rounds close at hand to sustain the higher fire plan.

### Impact analysis
- Systems consuming this output:
  - Shared combat resolution in `src/core/Combat.ts`
  - Player attack previews and activity summaries
  - AI combat simulations using the same attack resolver
- Visual behaviors that could shift:
  - AT-gun previews and combat results will show substantially higher expected damage than the prior 6-shot abstraction.

### Verification
- Update the focused AT-gun combat regression to the new shot-volume expectation.
- Run `npm run build`.
- Run the focused compiled harness for the AT-gun tests.

## Artillery Observer Tempo Plan

### Intended behavior
- Calling off-map heavy artillery should not consume the observing unit's action for the turn.
- Canceling a queued artillery strike should preserve the caller's real movement/attack state instead of resetting it.

### Current behavior
- `queueSupportActionFromUnit(...)` commits the caller through `resolveCommittedFieldActionFlags(...)`.
- `cancelQueuedSupport(...)` resets the caller back to default action flags, which can incorrectly restore movement or attacks that were already spent before the support order.

### Expected new behavior
- Queueing an artillery support action should leave the caller's movement and attack flags unchanged.
- Canceling a queued artillery support action should only clear the queued marker and support asset state, while keeping the caller's action flags intact.

### Impact analysis
- Systems consuming this output:
  - `BattleScreen` artillery targeting flow
  - `GameEngine.getUnitCommandState(...)`
  - Idle-unit registry and selection intel refresh after support scheduling/canceling
- Visual behaviors that could shift:
  - A unit can call artillery and still retain its normal command options for the turn.
  - Canceling a queued artillery strike no longer falsely refreshes the caller to a fully unused state.

### Verification
- Add a focused regression proving queued artillery leaves the caller's action state untouched.
- Run `npm run build`.
- Run a focused compiled harness for the updated command-state test.

## Connected Supply Upkeep Plan

### Intended behavior
- Units that remain connected to supply should only lose onboard ammo when they actually fire and only lose onboard fuel when they actually move.
- Passive supply upkeep should represent depot consumption, not silent depletion of the unit's carried magazines or fuel tanks.

### Current behavior
- `applyUpkeepForUnit(...)` charges the faction stockpile first, but when the depot runs short it falls back to draining the connected unit's onboard ammo and fuel.
- In missions with many linked defenders such as Town Defense, this makes units look like they are spending ammo faster than they fire.

### Expected new behavior
- Connected-unit upkeep should debit only the faction stockpile.
- If the depot cannot cover upkeep, the shortfall remains a logistics problem instead of silently reducing the unit's onboard ammo or fuel.
- Town Defense's authored `AT_Gun_50mm` loadout should match the updated six-round baseline.

### Impact analysis
- Systems consuming this output:
  - `GameEngine` supply tick and logistics snapshots
  - Unit intel panels reading live onboard ammo and fuel
  - Scenario-authored Town Defense unit loadouts
- Visual behaviors that could shift:
  - Connected defenders stop losing ammo between turns unless they actually fired.
  - Town Defense AT guns now spawn with the same six-round ammo load as the shared unit definition.

### Verification
- Add a focused logistics regression proving a connected unit keeps its onboard ammo when depot ammo is empty.
- Run `npm run build`.
- Run a focused compiled harness for the logistics regression.

## Precombat Depot Handoff Plan

### Intended behavior
- Ammunition and fuel packages bought during precombat should increase the live player depot stock that the battle logistics panel and supply engine read on turn one.
- The logistics resupply queue should use compact single-line rows, with the active selector state carrying the priority instead of redundant prose.

### Current behavior
- Precombat only hands deployable unit entries into battle; `ammo` and `fuel` purchases affect budget math but never reach the engine depot baseline.
- The logistics priority list renders large stacked cards and repeats the selected priority in text even though the active button already shows it.

### Expected new behavior
- Precombat allocation summaries should retain the purchased depot package.
- Battle initialization should inject that package into the player's initial depot stock.
- The logistics popup should render each priority target as a compact row with status, demand summary, and priority buttons on one line where space allows.

### Impact analysis
- Systems consuming this output:
  - `PrecombatScreen` allocation summary persistence
  - `BattleScreen` engine bootstrap configuration
  - `GameEngine` player depot baseline seeding
  - `PopupManager` logistics queue rendering
- Visual behaviors that could shift:
  - Depot ammo and fuel now start higher when the commander bought supply packages in precombat.
  - Logistics priority entries become much denser and no longer show a separate "Current priority" line.

### Verification
- Add a focused logistics regression proving initial depot stock augments the turn-one logistics snapshot.
- Run `npm run build`.
- Run a focused compiled harness for the logistics regression suite.

## Enemy Hex Intel Plan

### Intended behavior
- Clicking a hex with a visible enemy contact should keep showing terrain context while also surfacing a minimal enemy summary for the player.
- That summary should expose only the enemy unit type and strength, not hidden ammo or fuel state.

### Current behavior
- Non-player hex selection falls through to terrain intel only, even when the selected hex contains a spotted enemy formation.

### Expected new behavior
- The selection overlay should prepend an enemy-contact note when the selected hex matches a tracked enemy contact.
- The battle status line should also reflect that visible enemy contact in concise form.

### Impact analysis
- Systems consuming this output:
  - `BattleScreen` map selection feedback
  - `SelectionIntelOverlay` terrain-intel rendering
- Visual behaviors that could shift:
  - Enemy-held hexes now display a simple contact note such as unit type and current strength estimate.

### Verification
- Add a focused selection-intel overlay regression covering terrain intel with an enemy contact note.
- Run `npm run build`.
- Run a focused compiled harness for the selection-intel overlay test.

## Initiative Group Selection Cursor Stability Plan

### Intended behavior
- During an active player initiative group, selecting a different eligible unit in that same group should persist.
- UI sync should not force selection back to the queue head unless the current selection is no longer eligible.

### Current behavior
- `BattleScreen.ensureFocusedPlayerInitiativeUnit(...)` can overwrite an explicit non-current selection if the initiative cursor still points at the current activation.
- The result is visible "snap back" to the current unit after the player clicks another in-group unit.

### Expected new behavior
- If the player has explicitly selected a unit that is still in the active selectable initiative set, the initiative cursor should follow that unit and remain stable across sync ticks.
- Automatic refocus to current activation should occur only when the explicit selection is missing or no longer valid for the group.

### Scope
- `src/ui/screens/BattleScreen.ts`
- `tests/BattleScreen.initiativeFlow.test.ts`

### Impact analysis
- Systems consuming this output:
  - Initiative selection sync in `BattleScreen`
  - Initiative UI controls that read cursor/selection state
- Events depending on this structure:
  - Periodic initiative control sync that calls `ensureFocusedPlayerInitiativeUnit(...)`
- Visual behaviors that could shift:
  - Selecting a non-current unit inside the active initiative group now remains selected instead of snapping back.

### Verification
- Added regression test: `BATTLESCREEN_INITIATIVE_SYNC_PRESERVES_EXPLICIT_NON_CURRENT_GROUP_SELECTION`.
- Ran `npm run test` successfully.
- Ran `npm run lint`; existing repository-wide warnings remain, with no new errors introduced.

## Initiative Retaliation Pacing And Skip-Copy Plan

### Intended behavior
- Initiative bot attack and retaliation sequences should fully play, with readable camera focus transitions, before the queue advances to the next activation.
- Skip-group messaging should describe skipped activations/sentry behavior without "hold" or "waiting" phrasing.

### Current behavior
- Initiative retaliation playback had minimal settle pacing and did not explicitly refocus on the retaliating impact target before continuation.
- Skip-group UI messaging used "hold" language and some initiative-gate copy used "waiting" language after skip scenarios.

### Expected new behavior
- Initiative bot combat flow should include explicit focus/settle beats for attacker, target, and retaliation impact before completion.
- Skip-group message should read as a skip/continue instruction, and null-initiative gate messaging should avoid "waiting" phrasing.

### Scope
- `src/ui/screens/BattleScreen.ts`
- `src/ui/components/EnhancedInitiativeTurnControls.ts`
- `tests/BattleScreen.animations.test.ts`
- `tests/BattleScreen.initiativeFlow.test.ts`

### Impact analysis
- Systems consuming this output:
  - Initiative bot activation playback in `BattleScreen`
  - Initiative command controls copy in `EnhancedInitiativeTurnControls`
- Events depending on this structure:
  - Bot activation listener sequencing from `GameEngineInitiativeMethods`
- Visual behaviors that could shift:
  - Slower, clearer camera settles around retaliation moments.
  - Updated skip-group and initiative-gate wording in commander-facing prompts.

### Verification
- Added regression test: `BATTLESCREEN_INITIATIVE_BOT_RETALIATION_WAITS_FOR_FOCUS_PACING`.
- Added regression test: `BATTLESCREEN_INITIATIVE_SKIP_GROUP_USES_SKIP_COPY_NOT_HOLD`.
- Run `npm run test`.

## Experience AP Plan

### Intended behavior
- Experience should improve crew performance through hit chance and damage efficiency, but it should not change authored armor penetration or armor values.

### Current behavior
- `calculateEffectiveAP(...)` adds an experience-based AP bonus, causing otherwise identical AT guns to show different penetration values when one has EXP and the other does not.
- Armor values already remain authored and fixed.

### Expected new behavior
- Effective AP should match the unit definition's authored AP regardless of experience.
- Experience should continue to affect accuracy and damage-per-hit through the existing veteran crew scalars.

### Impact analysis
- Systems consuming this output:
  - Core combat resolution in `src/core/Combat.ts`
  - Attack previews and combat detail readouts
  - Focused AT-gun and preview regressions
- Visual behaviors that could shift:
  - Veteran anti-tank guns no longer display inflated AP values in previews.
  - Damage into armor may drop slightly where the old EXP-derived AP bonus previously improved penetration margin.

### Verification
- Update focused AT-gun combat tests and attack-preview text tests to authored AP behavior.
- Run `npm run build`.
- Run focused compiled harness passes for the updated AT-gun and attack-preview tests.

## Experience Veteran Tuning Plan

### Intended behavior
- Experience should make veteran crews substantially more accurate while only modestly improving the damage each successful hit causes.
- The tuning rationale should be documented where the shared combat knobs live so future balance passes keep the same doctrine.

### Current behavior
- Accuracy gains only `+3%` per EXP, which undersells how quickly practiced crews improve ranging, fire control, and shot placement.
- Damage per hit gains `+10%` per EXP, which overstates how much experience changes terminal effect after a round already lands.

### Expected new behavior
- Accuracy gains `+10%` per EXP.
- Damage per hit gains `+3%` per EXP.
- Shared combat comments should explain that accuracy is the skill that grows faster with experience, while post-hit lethality improves more slowly.

### Impact analysis
- Systems consuming this output:
  - Core combat resolution in `src/core/Combat.ts`
  - Shared combat tuning in `src/core/balance.ts`
  - Focused AT-gun regressions and mocked attack-preview tests
- Visual behaviors that could shift:
  - Veteran-unit previews will show larger hit-chance increases.
  - Veteran units will show smaller damage-per-hit deltas than before.

### Verification
- Update focused combat and preview regressions to the new experience scalars.
- Run `npm run build`.
- Run focused compiled harness passes for the updated AT-gun and attack-preview tests.

## Counterfire Depth Plan

### Intended behavior
- Defending units should be able to retaliate multiple times during a turn instead of exhausting all return-fire capacity after the first exchange.
- Each retaliation should continue to consume ammunition, and a unit with no remaining ammo should stop retaliating even if it has unused retaliation slots.

### Current behavior
- The engine hard-caps ground and air defensive fire at one retaliation per turn through repeated `>= 1` checks in preview and resolution flows.
- Ammo spending already happens per retaliation, but the one-shot cap prevents that resource rule from mattering in sustained enemy contact.

### Expected new behavior
- Shared counterfire tuning should allow up to six retaliations per turn.
- Player previews, player-initiated combat, and bot-initiated combat should all read the same retaliation cap.
- Once a unit has spent its ammo on retaliation, further attacks in the same turn should not trigger return fire.

### Impact analysis
- Systems consuming this output:
  - Shared counterfire tuning in `src/core/balance.ts`
  - Player attack preview retaliation checks in `src/game/GameEngine.ts`
  - Player and bot combat resolution retaliation gates in `src/game/GameEngine.ts`
  - Focused command-state combat regressions
- Visual behaviors that could shift:
  - Attack previews will continue to show return fire deeper into a turn until the defender reaches six retaliations or runs dry.
  - Defensive units under repeated attack will now keep spending ammo across multiple return-fire exchanges.

### Verification
- Add a focused regression proving a defending unit can retaliate six times and then stops once ammo is exhausted.
- Run `npm run build`.
- Run a focused compiled harness pass for the updated command-state test.

## Towed Gun Tempo Plan

### Intended behavior
- Towed gun formations should alternate between `deployed` and `towed` postures instead of using generic vehicle move-and-fire rules.
- A deployed battery must choose `Move Out` before towing, which spends half its movement to hook up.
- A towed battery gets full movement at the start of the turn, must `Deploy` before firing, and loses the rest of the turn if it deploys after already spending movement.

### Current behavior
- Towed guns have no explicit limbered/unlimbered state.
- Artillery-class batteries are globally blocked from attacking after any movement, which prevents the deploy-after-tow flow the design calls for.
- The battle UI has no `Move Out` or `Deploy` commands for towable batteries.

### Expected new behavior
- Towable batteries persist a `towState` of `deployed` or `towed`.
- `Move Out` switches a deployed battery to `towed` and spends half its movement allowance.
- `Deploy` switches a towed battery back to `deployed`; if the battery already spent movement this turn, deployment commits the rest of the turn.
- A battery that starts the turn already towed can deploy and fire in the same turn as long as it has not moved first.

### Impact analysis
- Systems consuming this output:
  - Shared scenario-unit state in `src/core/types.ts`
  - Player movement and attack gating in `src/game/GameEngine.ts`
  - Player command-state and action cards in `src/ui/screens/BattleScreen.ts`
  - Focused command-state regressions for towable batteries
- Visual behaviors that could shift:
  - Towed batteries now show explicit `Towed` or `Deployed` status chips.
  - Battle intel actions now include `Move Out` and `Deploy` for towable batteries.

### Verification
- Add focused regressions for move-out, deploy-after-movement, and deploy-then-fire flows.
- Run `npm run build`.
- Run a focused compiled harness pass for the updated command-state tests.

## Battle Messaging Plan

### Intended behavior
- Move failures should explain both the blocking rule and the corrective action instead of logging a generic failure.
- The battle intel overlay should keep its expanded mode across unit and hex selection changes until the commander explicitly switches back to compact mode.

### Current behavior
- Player move failures collapse to a generic "Move failed" message even when the engine already provided a specific reason.
- Fresh battle intel forces the overlay back to compact mode on every selection change.

### Expected new behavior
- Move failure announcements and activity-log entries should mirror the engine reason and append the next step the player can take.
- Expanded battle intel should stay expanded while selecting another unit on the same hex or another occupied hex; only the user toggling `Compact` should collapse it.

### Impact analysis
- Systems consuming this output:
  - Player move error handling in `src/ui/screens/BattleScreen.ts`
  - Persistent selection overlay state in `src/ui/announcements/SelectionIntelOverlay.ts`
  - Focused battle-screen and overlay regressions
- Visual behaviors that could shift:
  - System activity entries now explain why a move failed and how to recover.
  - The intel card no longer snaps back to compact mode when the commander keeps reviewing different units.

### Verification
- Add a focused regression for tow-state move failure messaging.
- Add a focused regression proving expanded intel survives a selection change.
- Run `npm run build`.
- Run focused compiled harness passes for the updated selection-intel tests.

## Training Tutorial First-Turn Plan

### Intended behavior
- The training operation should conduct the commander through a short, legal first-turn sequence instead of merely describing controls.
- Recon should demonstrate its full movement reach and explain its speed, scouting value, and weak combat power.
- Engineer fieldworks, smoke, direct fire, and observer-directed artillery should each require the player to issue the real order.
- Tutorial camera framing should keep the acting formation and its legal targets visible while leaving map pan and zoom available.

### Current behavior
- The armor requisition spotlight spans three separated cards and visually includes unrelated rows.
- Recon movement is artificially limited to adjacent hexes.
- Fire Orders follows recon movement even when the patrol has no legal target.
- Smoke, engineering, artillery, and flak lessons mostly describe action cards without requiring the player to use them.
- The tutorial asks the player to end an initiative group before it has conducted a coherent first-turn lesson.
- Battle prompt sizing is inconsistent for phases that are not listed in the older phase-specific CSS selectors.

### Expected new behavior
- The armor spotlight follows the next unfilled Medium Tank, Heavy Tank, or Tank Destroyer card within one tutorial step.
- Recon receives its full legal movement area; the camera frames that area and the tutorial explains map navigation.
- Enemy initiative resolves before the tutorial selects the next legal player group.
- The tutorial guides the player to select an active engineer, expand its order card, build a fortification, select a smoke-capable infantry formation, lay smoke, select a formation with a legal fire target, confirm an attack, and call artillery with an eligible observer.
- The main tutorial ends after those essential orders; it does not require a premature End Turn or explanation-only Skip Group sequence.
- All battle tutorial prompts use one compact typography and sizing system.

### Edge cases
- The player deploys evenly, grouped, or manually.
- The selected recon patrol has legal destinations at several ranges.
- Enemy activation resolves before or after the tutorial phase transition.
- A player group contains several formations, but only one currently has the required capability or legal target.
- Smoke and artillery targeting open secondary map and facing choices before the action is accepted.
- Desktop and mobile prompt placement must not cover the required unit, target, or action card.

### Impact analysis
- Systems consuming this output:
  - `PrecombatScreen` allocation rendering and tutorial quantity progression
  - `TutorialOverlay` spotlight targeting and battle prompt layout
  - `TutorialState` phase definitions
  - `BattleScreen` initiative selection, action completion, and tutorial camera framing
- Events depending on this structure:
  - Tutorial state update notifications
  - Selection intel action clicks
  - Map movement and attack clicks
  - Enemy initiative activation callbacks
- Visual behaviors that could shift:
  - Allocation spotlight position after each armor purchase
  - Battle camera zoom and center during movement, fieldworks, smoke, fire, and artillery
  - Tutorial prompt height and typography on desktop and mobile

### Verification
- [x] Add focused regressions for sequential armor spotlighting, full recon movement reach, real action gates, phase order, coordinate conversion, keyboard isolation, and compact prompt styling.
- [x] Walk the tutorial from requisition through dismissal at desktop and mobile viewport sizes using real controls and map actions.
- [x] Review screenshots for recon movement, engineer work, smoke, fire, artillery, and the final message.
- [x] Assert every tutorial panel remains inside the viewport and its copy is not clipped.
- [x] Run `npm test`, `npm run build`, `npm run lint`, and `git diff --check`.

## Facing Direction Unification Plan

### Intended behavior
- Unit facing and hex-edge facing should use the same six labels: `NW`, `NE`, `E`, `SE`, `SW`, `W`.
- Movement, combat, fortification checks, rendering, scenario validation, and authored data should all consume that same edge-based facing vocabulary.

### Current behavior
- Unit facings used a legacy vertex-style set with `N` and `S`, while fortifications already used edge labels with `E` and `W`.
- Several engine, renderer, adapter, scenario, and test paths still authored or defaulted to the legacy literals.

### Expected new behavior
- `FacingDirection` becomes the shared type for unit facings and edge facings.
- Legacy authored `N` and `S` values normalize to `NW` and `SE` only at compatibility boundaries.
- Runtime movement and combat heading resolution should emit the shared edge labels directly.

### Impact analysis
- Systems consuming this output:
  - Shared facing types and compatibility normalization in `src/core/types.ts`
  - Directional armor math in `src/core/Combat.ts`
  - Engine facing defaults and heading resolution in `src/game/GameEngine.ts`
  - Sprite rotation and fortification rendering in `src/rendering/HexMapRenderer.ts`
  - Authored scenario, adapter, and focused test data using unit facings
- Visual behaviors that could shift:
  - Units now rotate using the same label set shown in directional fortification logic.
  - Newly spawned or allocated units default to `NW` instead of the removed legacy `N`.

### Verification
- Add focused regressions for legacy facing normalization and edge-direction heading resolution.
- Run `npm run build`.
- Run a focused harness pass for the new facing-direction tests.

## Airshow Corridor Architecture Plan

### Intended behavior
- One corridor, one clock, one planned lifecycle per sprite.
- Build one authoritative corridor from HQ/origin to target/egress.
- Place every plane into stable lanes in that corridor at time zero.
- Compute fighter groupings once: 1:1, 2:1, 3:1, etc. No "extra" orbiting fighters.
- Drive all actors from one global timeline, then slice it into renderer phases only after the full motion is planned.
- Keep bombers moving the whole time. Fighter timing adapts to bomber ETA, not the other way around.
- Dogfight is not looping orbit behavior. It should be: head-on pass with tracers, peel/re-pair, tight turn, straight tracer pass, tight turn, straight tracer pass.
- Interceptors that survive then immediately attack bombers while bombers defend. No waiting period.
- Flak runs continuously around sampled bomber positions during the approach/target run, tapering after ordnance. Not interval bursts behind the target.
- Flak only runs when bombers are about eight hexes away from the flak unit.
- Bomber sprites turn before reaching the target so that they do not fly directly over the target hex, but not too soon as to look like they never got close enough.

### Current behavior
- The airshow has separate phase-local path repairs, timing patches, "gap/hold" phases, and static clash positions.
- Sprites look like they teleport, wait, circle, or disappear because each phase is trying to fix the last one.
- Fighters have a "bomber-ingress" wait phase where they hold position before attacking.
- Flak is split between defense and target phases with fixed intervals.
- Dogfight uses looping orbit behavior rather than aggressive head-on passes.

### Expected new behavior
- Fighter assignments in `bomber-ingress` phase now immediately attack bombers (no waiting period).
- Escort-clash-merge phase uses aggressive head-on pass with sharp peel-off after convergence.
- Escort-clash-scramble phase uses re-pair maneuver and second head-on pass before transitioning to bomber attack.
- Dogfight tracers fire during head-on convergence (0.5-0.7 in merge, 0.2-0.8 in scramble) with increased burst count and range.
- Flak is now continuous: sampled at bomber positions throughout approach phases (6 samples in approach, 4 in target run).
- Flak only fires when bombers are within 8 hex range (`HEX_WIDTH * 8`).
- Bomber target run path maintains existing turn-before-target behavior (turnEntry at -78px, nearTarget at -30px).

### Edge cases
- Fighters without escort opponents should still ingress and attack bombers immediately.
- Flak batteries beyond 8 hex range should not fire even if bombers are in other phases.
- Surviving interceptors from scramble phase must seamlessly transition to bomber attack without position jumps.

### Impact analysis
- Systems consuming this output:
  - `AirShowPlaybackPlanner.ts` contested airshow choreography
  - `HexMapRenderer.ts` airshow rendering via `PlannedAirShowScene`
  - Fighter/bomber animation paths and timing
- Events depending on this structure:
  - Airshow phase playback timing
  - Tracer burst rendering during dogfight phases
  - Flak burst rendering during approach and target phases
- Visual behaviors that could shift:
  - Fighters no longer hold position during bomber-ingress phase; they attack immediately.
  - Dogfight shows more aggressive head-on passes with continuous tracer fire.
  - Flak appears continuously during approach rather than in discrete bursts.
  - Bombers maintain existing turn-before-target behavior.

### Risk
AirShowPlaybackPlanner.ts is high-risk. Changes are to existing `buildCorridorContestedAirShowPlan` function only — no new code paths added, existing fallback planning path preserved as fallback (will be removed once corridor plan proves stable).

### Verification
- `npm run build`, `npm run lint`, `npm run test` must all pass.
- Visual verification: fighters attack immediately after escort clash; dogfight shows head-on passes; flak appears continuously during approach.

## Initiative Group Advancement Plan

### Intended behavior
- The primary initiative control reads `Next Group` while a player initiative group can receive orders.
- `Hold Group` applies sentry only to the formations in the active group.
- Selecting `Next Group` commits the active group without skipping any later player initiative groups.
- The primary control reads `End Turn` only after every player and enemy activation in the round is complete.

### Current behavior
- The active-group control reads `Commit Orders`, but dispatches the full initiative end-turn handler.
- That handler marks every remaining player activation for sentry, so advancing one group can end the player's entire round.
- The control label and callback therefore describe different scopes.

### Expected new behavior
- The enhanced control dispatches separate next-group and end-turn events according to queue state.
- Advancing a group preserves formations with committed orders and places only untouched formations in that group on sentry after confirmation.
- End-turn handling validates that the initiative queue is drained before advancing the battle round.

### Edge cases
- Enemy activations keep the primary control disabled.
- Interleaved player and enemy activations in one initiative band retain group identity without affecting later initiative bands.
- A held group advances through the same next-group path without changing later groups.
- Tutorial-only group handoffs use `Next Group` and cannot trigger a full-turn skip.

### Impact analysis
- Systems consuming this output:
  - `EnhancedInitiativeTurnControls.ts` adaptive primary-button state and callbacks
  - `BattleScreen.ts` initiative group commit, sentry assignment, and round advancement
- Events depending on this structure:
  - Enhanced initiative control click and Enter-key actions
  - Initiative activation completion and bot handoff sequencing
  - Tutorial group-handoff completion
- Visual behaviors that could shift:
  - The top-bar primary label changes from `Commit Orders` to `Next Group` during player groups.
  - `End Turn` appears only after all round activations complete.

### Risk
- `BattleScreen.ts` is high-risk. The change is limited to existing initiative controls and their focused tests; combat, movement, deployment, and queue ordering are unchanged.

### Verification
- [x] Add control tests for `Next Group` versus `End Turn` dispatch.
- [x] Add BattleScreen regressions proving current-group-only completion and drained-queue end-turn gating.
- [x] Run `npm test`, `npm run build`, `npm run lint`, and `git diff --check`.
- [x] Load the training requisition and battle surfaces in the local app; verify adaptive control states through deterministic DOM tests because the browser flow requires manual map deployment before initiative begins.

## Allied Command At Mission Start Plan

### Intended behavior
- Every predeployed allied formation transfers to player command when the commander selects `Begin Mission`.
- Allied formations participate in the opening player initiative queue without requiring same-hex contact.
- Transfer preserves unit identity, damage status, supply state, stacking, and logistics tracking.

### Current behavior
- Allied units remain in the engine's Ally placement and initiative collections after deployment.
- The BattleScreen transfers only one allied unit when the player selects its occupied hex during a player activation.
- Mission-start initiative therefore classifies untouched allied formations as AI activations.

### Expected new behavior
- GameEngine provides one authoritative bulk transfer operation for all live allied formations.
- Each transferred unit is explicitly marked `controlledBy: "Player"` and receives player action state.
- BattleScreen invokes the bulk operation after deployment finalization and before initiative initialization.
- The existing contact transfer remains a compatibility path but normally finds no allied units after mission start.

### Edge cases
- Multiple allied formations stacked on one hex all transfer.
- Missions without an Ally side return a zero transfer count and begin normally.
- Supply convoys retain their automatic logistics behavior even though they join the player roster.
- Destroyed or absent allied formations are not recreated from authored scenario data.

### Impact analysis
- Systems consuming this output:
  - `GameEngine.ts` faction placement, supply mirrors, action flags, convoy state, and roster caches
  - `BattleScreen.ts` deployment-to-initiative transition and battle-start announcement
  - `GameEngineInitiativeIntegration.ts` opening activation ownership derived from player placements
- Events depending on this structure:
  - Begin Mission click
  - Initiative queue initialization
  - Player roster, logistics, and idle-unit rendering
- Visual behaviors that could shift:
  - Allied unit pips and stack entries render as player-controlled from the opening activation.
  - No map contact is needed before allied formations become selectable.

### Risk
- `GameEngine.ts` and `BattleScreen.ts` are high-risk. The change is isolated to ownership transfer at mission start and is covered by stacked-unit, state-preservation, queue-ordering, and call-order regressions.

### Verification
- [x] Add an engine regression for bulk transfer of stacked allied units and preserved state.
- [x] Add a BattleScreen regression proving transfer occurs before initiative initialization.
- [x] Run `npm test`, `npm run build`, focused zero-warning lint, repository lint, and `git diff --check`.

## Tutorial Allied Initiative Handoff Plan

### Intended behavior
- Every player-controlled recon formation receives its initiative-7 activation before the tutorial advances to engineers.
- Clicking an active friendly formation selects it even when an inactive formation still exposes a stale move highlight on that hex.
- An active selected formation can still move onto a legal friendly stack.

### Current behavior
- The first recon move completes the movement lesson, and the following enemy response advances directly to the engineer lesson.
- The newly transferred allied recon remains ready in initiative 7, leaving no active engineer for the tutorial to highlight.
- If initiative later reaches the engineers, a stale recon movement destination can intercept the engineer click and report the recon as ineligible.

### Expected new behavior
- The tutorial returns to the recon selection lesson while another ready recon activation remains.
- Stack selection uses the active initiative group as its source of truth.
- Friendly-destination movement retains precedence only when the selected formation belongs to the active initiative group.

### Edge cases
- Training forces with one recon proceed directly to engineers after the enemy response.
- Training forces with multiple recons repeat the recon selection and movement lesson until the band is drained.
- Stacked active and inactive formations select the active member deterministically.
- Non-tutorial initiative play receives the same stale-selection protection.

### Impact analysis
- Systems consuming this output:
  - `BattleScreen.ts` tutorial phase progression, stack resolution, and player click routing
  - Tutorial guided-hex highlighting and initiative status messaging
- Events depending on this structure:
  - Completion of the guided recon move
  - Enemy activation completion
  - Friendly map clicks during player initiative groups
- Visual behaviors that could shift:
  - The recon lesson repeats when more than one recon formation is ready.
  - The engineer receives the guided highlight only after initiative 6 is actually active.

### Risk
- `BattleScreen.ts` is high-risk. The change is limited to tutorial phase selection and click-time initiative selection, with explicit regressions for both selection and legal friendly-stack movement.

### Verification
- [ ] Add tutorial multi-recon progression coverage.
- [ ] Add stale-selection click-routing coverage.
- [ ] Run the complete wide-desktop tutorial, unit tests, build, lint, and `git diff --check`.

## Platform Readiness Damage Progression Plan

### Intended behavior
- Personnel and equipment status transitions each contribute their full-strength-equivalent readiness loss to platform formations.
- Applying the same concrete logistics damage packet to an already-damaged convoy should not lose roughly ten readiness points purely because another status channel was already degraded.
- Legacy scenario `strength` hydration for platform units should remain stable and should not apply the same abstract loss to both crews and vehicles.

### Current behavior
- Platform readiness multiplies personnel readiness by equipment readiness.
- Multiplication makes marginal vehicle damage shrink when personnel readiness is already low, and marginal personnel damage shrink when equipment readiness is already low.
- Legacy `applyReadinessScalarToStatus()` applies platform readiness to both personnel and equipment pools, which can double-apply imported abstract strength once platform readiness is no longer multiplicative.

### Expected new behavior
- Platform readiness is `100 - personnel loss - equipment loss`, capped to the normal 0-100 readiness range.
- Personnel-only or equipment-only platform damage keeps the exact proportional effect expected from the detailed status pools.
- Legacy platform strength seeds equipment availability while leaving crew pools fit, matching the historic meaning of platform strength in authored scenarios.

### Edge cases
- A fresh 8-truck convoy that takes one disabled truck, one damaged truck, and several casualties reports the same full-strength-equivalent damage as a similarly hit already-damaged convoy until fit/operational pools are actually exhausted.
- A one-vehicle loss in tank, air, supply, medical, and maintenance formations keeps using the formation's concrete platform count.
- Infantry-only and combined engineer readiness remain governed by their existing personnel or weighted-combined models.

### Impact analysis
- Systems consuming this output:
  - `damagePackets` packet readiness loss estimation and application parity
  - `GameEngine` attack previews, resolution summaries, activity log damage values, HQ damage records, and logistics repair/medical recovery
  - `BattleScreen` confirm-attack percentages and detailed outcome text
  - Bot scoring and mission combat calls that consume `AttackResult.expectedDamage` or status-derived readiness summaries
- Events depending on this structure:
  - Player attack preview and confirmation
  - Player/enemy attack resolution activity entries
  - HQ and logistics modal status refreshes
- Visual behaviors that could shift:
  - Damaged vehicle/logistics targets may show higher projected readiness loss for concrete follow-up hits.
  - Imported low-strength platform units hydrate with equipment damage instead of duplicated personnel and equipment damage.

### Risk
- `src/data/unitSystem/status.ts` is high-risk engine/status code. The change is isolated to readiness composition and legacy scalar seeding; damage packet distribution and combat accuracy are unchanged.

### Verification
- [x] Add platform follow-up damage regression coverage.
- [x] Run focused damage tests, full unit tests, build, lint, and `git diff --check`.
## First-Class Training Tutorial Completion Plan

### Intended behavior
- The training journey must be one legal, understandable sequence from requisition through deployment, initiative, reconnaissance, fortification, Corps Artillery, direct fire, smoke, and dismissal.
- Each required lesson must select a currently active formation that can perform the named order and must advance only after the engine accepts that order.
- Enemy responses must play without tutorial camera jumps. The next guided camera move begins only when command returns to the player.
- Battle prompts must use one stable upper dock, fit mobile viewports, and keep the required unit, control, hex, or edge visible and clickable.
- Every command-board brief must teach status, controls, and results. Where a live control exists, the player must use it.

### Current behavior
- The smoke lesson follows a firing-unit selection and can be skipped when that unit lacks smoke.
- Automatic enemy-response lessons can complete too quickly and currently pre-focus future units, producing abrupt camera jumps.
- The fortification lesson spotlights only the edge picker after it opens, does not mark the enemy-facing edge, and leaves the mobile Fortify control difficult to reach.
- Main battle step numbers repeat when additional recon activations occur and jump when automatic phases complete.
- Logistics and Roster briefs describe important controls without requiring the player to use them.
- The General profile header collapses into a narrow first grid column on mobile.
- Mission completion can interrupt an active tutorial before its final lessons.

### Expected new behavior
- Direct fire completes before a real initiative handoff. The tutorial then selects an active smoke-capable formation and requires a real Lay Smoke order.
- Enemy responses preserve the current tactical view and remain visible long enough to communicate the handoff.
- Fortify is the initial spotlight target; the edge picker then marks and names the recommended enemy-facing edge.
- Battle lessons use stable named section indicators so repeated initiative drills do not display duplicate numbered steps.
- Logistics requires a real priority change and Roster requires opening Battle Requisitions.
- General profile identity and statistics remain readable at 390px.
- Mission-end presentation is deferred while the training tutorial is active.

### Edge cases
- Multiple initiative-7 recon formations repeat the same drill without misleading step numbers.
- A selected firing formation cannot lay smoke; the tutorial advances initiative until tanks or artillery can.
- Enemy groups may sit between the firing and smoke-capable friendly groups.
- The nearest enemy can lie on any of the six hex facings.
- A command-board control may be unavailable in an empty panel state; the brief remains accurate and dismissible.
- Desktop and mobile prompts must avoid the edge picker, unit card, and map target.

### Impact analysis
- Systems consuming this output:
  - `TutorialState`, `tutorialSteps`, `TutorialOverlay`, and sidebar mini-tutorial definitions
  - `BattleScreen` initiative progression, camera focus, capability selection, fortification picker, and mission-end presentation
  - Responsive styles for the tutorial, edge picker, and General profile
  - Main tutorial and command-board browser tests
- Events depending on this structure:
  - Tutorial phase updates and accepted-action auto-advance
  - Initiative Next Group, selection-intel actions, map target clicks, and enemy activation callbacks
  - Logistics priority and Battle Requisitions popup interactions
- Visual behaviors that could shift:
  - Battle prompt indicator text and dock location
  - Camera framing at enemy/friendly initiative boundaries
  - Recommended fortification edge styling
  - Mobile General profile and engineer-order layout

### Risk
- `BattleScreen.ts` is high-risk. Changes are constrained to tutorial orchestration, camera guidance, edge recommendation presentation, and tutorial-only mission-end deferral. Combat resolution and normal initiative ordering are unchanged.

### Verification
- Update focused tutorial sequence, wait-state, initiative handoff, edge recommendation, and mini-tutorial tests.
- Run build, unit tests, zero-warning lint, and `git diff --check`.
- Run the complete tutorial serially at 1680x857, 1440x900, and 390x844.
- Inspect every major handoff screenshot and repeat the player journey in the in-app browser.
- Run all six command-board briefs and verify their real interactions at desktop and mobile sizes.

---

## Campaign Opening Geography and Premise Repair Plan

### Intended behavior
- The Central Channel campaign opens after the first Allied landings, with that operational moment stated in player-facing briefing and phase copy.
- A water hex may represent a naval task force, but never a shore installation or an unexplained land garrison.
- The first primary objective is to hold the established lodgment on a real Player-controlled French-shore tile; the two exact opening fronts remain playable.
- Saves from both immediately preceding Central Channel content identities migrate without discarding campaign identity, elapsed time, formations, or objective progress.

### Current behavior
- The opening badge and objective imply the beachhead has not yet been established while Player fortifications and formations already occupy two French-shore tiles.
- Hex `20,18`, declared as English Channel water, is a `navalBase` containing infantry and is also the already-controlled target of “Establish Beachhead.”
- The objective therefore completes automatically after two quiet segments without requiring the situation described by its copy.

### Expected new behavior
- Scenario and phase copy identify an established but vulnerable lodgment and the primary objective reads “Hold the Beachhead.”
- The objective targets the Player fortification at axial `27,24`; its uninterrupted-control and infrastructure requirements remain mechanical and visible.
- Axial `20,18` becomes an Allied task-force marker with no land-force projection, while its existing beachhead formations are authored at `27,24`.
- Exact old saves move any still-placed `20,18` garrison formations to `27,24`, preserve their records, replace only the obsolete water installation, and revalidate the full runtime.

### Edge cases
- A garrison formation already destroyed, captured, or moved away is not recreated.
- A garrison with an active order causes migration to fail closed instead of silently changing an in-flight order.
- Already completed or failed objective state is preserved; only the authored location and player-facing premise change.
- Pre-contact saves still receive the exact two contact tiles once before the opening-state repair is applied.

### Impact analysis
- Systems consuming this output:
  - shipped scenario creation, objective evaluation, map/inspector presentation, formation placement, and campaign save loading
- Events depending on this structure:
  - first-segment objective progress, first Player port assault, first Bot airfield offensive, save resume, and subsequent AAR/control consequences
- Visual behaviors that shift:
  - the Channel shows a naval task-force symbol instead of a floating base and infantry marker
  - briefing, phase, objective marker, and visible shore formations describe the same post-landing situation

### Risk assessment
- The authored coordinate math and the two battle edges do not change.
- Persistence accepts only the two exact known prior hashes and the exact repaired current hash; unknown content remains read-only.
- Formation relocation is limited to records still placed on the one obsolete Channel tile and is invariant-checked before hydration.

### Verification
- Add a shipped-scenario semantic regression for water-role/force legality, objective location, opening premise, and both exact fronts.
- Add migrations from both known prior hashes and prove formation identity, revision, elapsed time, objective state, and map repair survive.
- Run `npm run test:campaign`, `npm test`, `npm run build`, zero-warning lint, skill validation, and `git diff --check` before one deployment-triggering push.

---
## Campaign Tactical Save Rule-Migration Plan

### Intended behavior
- Campaign battles have no fixed tactical turn limit and end only through objective control or force collapse.
- A Player defensive battle resumes with defender objectives and defeat conditions even when its active tactical save was written by the immediately preceding fixed-window build.
- Compatible tactical saves retain exact engine, formation, initiative, and campaign-binding state while current campaign rule identity is backfilled from the integrity-checked frozen engagement package.

### Current behavior
- New campaign scenarios preserve role metadata and use `turnLimit: 0`.
- `BattleState.hydrateComplete()` restores an older active save's engine configuration and precombat mission verbatim.
- `BattleScreen` then creates campaign mission rules from that stale scenario; missing `campaignPlayerRole` defaults to attacker and the HUD can retain the former 16–24-turn limit.

### Expected new behavior
- Active campaign tactical-save validation performs a narrow semantic migration for campaign missions.
- The migration derives engagement, mission type, battle hex, package identity, and Player role only from the already integrity-checked frozen campaign package.
- It clears obsolete tactical deadlines in the scenario and precombat mission, refreshes deadline copy in the saved mission status, and leaves non-campaign tactical saves byte-stable.
- Newly captured campaign briefings state that battlefield conditions decide the engagement instead of implying that a tactical window will close.

### Edge cases
- Player attacks and Player defenses derive opposite roles from the frozen attacker/defender identities.
- A legacy save at turn 30 remains in progress while both sides retain effective ground forces and the decisive objectives are contested.
- Existing saved objective progress and outcome state remain intact; only obsolete deadline wording and role metadata are migrated.
- Training and authored standalone battle saves are not changed.

### Impact analysis
- Systems consuming this output:
  - `BattleSaveTypes` campaign-binding validation and returned hydration payload
  - `BattleState` complete engine/precombat hydration
  - `BattleScreen` resumed campaign mission-controller construction and HUD copy
  - campaign tactical autosave/manual-save recapture after resume
- Events depending on this structure:
  - tactical save load and `snapshotHydrated`
  - resumed mission-status rendering and the next turn transition
- Visual behaviors that could shift:
  - resumed campaign HUD changes from an obsolete turn count to `No fixed turn limit`
  - resumed defensive objectives identify the Player as defender and no longer advertise a closing tactical window

### Risk assessment
- `BattleScreen.ts` is a high-risk consumer, but the implementation remains in the persistence boundary and precombat copy; no combat math, coordinate logic, initiative ordering, or engine serialization is changed.
- The migration is behavior-focused and source-bound to an integrity-checked campaign package rather than a fallback guess.

### Verification
- Add a tactical-save regression that validates a legacy Player-defense save, proves the migrated identity/deadline, and confirms the battle remains active beyond turn 20 until opposing objective capture.
- Run the focused tactical-save test, `npm run test:campaign`, `npm run build`, zero-warning lint, `npm test`, and `git diff --check`.
- Live-retest save/resume through the external browser after the browser runtime and deployment capacity are available.

---

## Campaign Contact, Handoff, and First-Class UI Repair Plan

### Intended behavior
- Every launchable campaign front is an exact edge between real opposing-controlled tiles with persistent formations on both sides.
- Tactical generation remains bound to the frozen campaign, template, engagement, objective, and formation package; an invalid handoff stays in Campaign Command with recovery guidance.
- Applying a tactical result is atomic from the player's perspective. A failed strategic write leaves the battle open and retryable.
- Campaign identity, tactical engagement identity, human-readable labels, and recovery actions remain visible and distinct throughout campaign, precombat, and battle screens.
- Existing saves from the immediately preceding Central Channel map and tactical-rule versions migrate only when their exact content and frozen geometry can be proven compatible.

### Current behavior
- The shipped Normandy front points to a nonexistent neutral coordinate and both authored fronts disappear after one derived-control segment.
- Generator failure can substitute a generic standalone battle or retain an unrelated template garrison.
- A failed campaign-result application can still close the tactical UI and navigate away.
- The redeploy planner has nested vertical scrolling, tactical deployment loses its parent campaign title, and raw identifiers can surface in visible or accessible labels.
- Repairing the shipped scenario changes its content hash, which would reject valid previous-build saves without an explicit migration.

### Expected new behavior
- Normandy resolves `27,37 → 28,38` as a Player port assault and Eastern Sector resolves `30,40 → 29,39` as a Bot offensive, with both contacts surviving the first segment.
- Front preparation uses only current `front.edges`, verifies exact opposing ownership and persistent formations, and never mutates campaign state on failure.
- Campaign generation rejects unknown pools, incompatible templates, neutral/same-side contexts, empty opposition, and unmappable opposition.
- Result handoff returns before teardown, service history, or navigation when strategic application fails; one retry records and navigates once.
- The redeploy popup has one vertical scroll owner, campaign and engagement titles remain separate, and shared label formatting removes camelCase/snake_case implementation tokens.
- Exact previous content hash `fnv1a32-9f497e04` migrates to repaired hash `fnv1a32-cb416131`; every other mismatch remains read-only.

### Edge cases
- A Player defensive battle at turn 30 must remain active while objectives are contested, then end from objective capture at turn 31.
- A Western Europe save frozen to an El Alamein template must be rejected even when its package checksum is internally valid.
- Deadline-caused terminal state is reset only for the two exact legacy deadline reasons; objective and force-collapse terminals remain intact.
- A previous campaign save preserves campaign ID, revision, elapsed segment, and every existing formation record while adding repaired contact formations exactly once.
- A captured Eastern airfield does not receive newly spawned Bot reinforcement groups during content migration.
- Multiple legal front edges require an explicit target; zero legal edges remain a no-op.

### Impact analysis
- Systems consuming this output:
  - campaign scenario/runtime creation, front derivation, engagement preparation, tactical generation, result application, and content persistence
  - campaign/precombat/battle headers, redeploy planner, Forces/Inspector labels, mission status, and active battle resume
- Events depending on this structure:
  - first segment resolution, Player battle launch, Bot mandatory defense, mission-end retry, post-battle autosave, and campaign slot load
- Visual behaviors that shift:
  - full theater identity remains visible while the engagement title stays specific
  - blocked redeployment exposes its reason, corrective action, Cancel, and disabled primary action in one scroll context
  - raw campaign role and unit identifiers are formatted for players and assistive technology

### Risk assessment
- `CampaignState.ts` and `BattleScreen.ts` are high-risk state-transition consumers. Changes are fail-closed, preserve existing transaction boundaries, and have direct regression coverage.
- Campaign content migration accepts only one exact prior/current hash pair and revalidates runtime invariants after reconciliation.
- Live visual and end-to-end acceptance remains blocked until the approved external-browser extension runtime initializes and the shared Vercel allowance has deployment capacity.

### Verification
- Run the shipped first-front/first-segment tests, previous-content campaign save migration, turn-30 tactical save migration, incompatible-template rejection, failed-result retry, title continuity, label formatting, and no-deadline briefing tests.
- Run `npm run test:campaign`, `npm test`, `npm run build`, focused zero-warning lint, full repository lint, skill validation, and `git diff --check`.
- Perform one batched push only after Vercel capacity/concurrency preflight; then rerun the complete live campaign journey through the external browser.

---
## Campaign Theater Literacy and Base Inspector Plan — 2026-08-26

### Intended behavior
- The complete theater overview makes every authored friendly base, naval force, and player-safe briefed strategic site discoverable without permanent labels covering the registered map artwork.
- Hover, keyboard focus, map-list selection, and click all expose the same safe identity and route to the same inspector.
- A friendly-base inspector answers three questions in order: `What is this?`, `What is here?`, and `What can I do?`.
- Exact persistent formations replace duplicate aggregate force copy whenever the roster is available. Ready, committed/in-transit, and arriving formations are visibly separated.
- Only legal, relevant actions occupy the persistent action area. An inland logistics base never presents a disabled tactical-engagement button as its primary action.

### Current behavior
- At theater overview scale, seven authored Allied bases and thirteen briefed enemy sites shrink into near-invisible dots, making the otherwise complete theater read as empty.
- Portland's inspector repeats its place, role, aggregate forces, exact formations, and infrastructure condition while the relevant redeployment action is below the fold.
- A disabled `Queue tactical engagement` control remains prominent on ordinary friendly bases where no engagement is available.
- Douvres radar is rendered with airbase artwork, weakening map literacy.

### Expected new behavior
- Installation and known-site marks retain a bounded physical target and recognizable role sprite at every supported overview zoom; details expand outward only on hover/focus and remain available by click.
- The base inspector uses one concise identity/purpose block, one exact grouped roster, and one non-scrolling relevant-action footer.
- The inspector body is the only vertical scroll owner, resets to the top when the selection identity changes, and preserves a direct route back from formation detail to its base.
- Known hostile sites remain briefing-only: fixed identity/location may be shown, but current control, condition, capacity, and hidden formations remain unknown.

### Edge cases
- A base with only scheduled arrivals shows `Arriving here` and a human calendar ETA, but no disabled redeployment action.
- A base whose ready formations are all held by orders gives one concise availability explanation instead of a modal conflict trap.
- A known site sharing a hex with a contact keeps the safe place name in map/list/inspector context without revealing mobile truth.
- Dense neighboring markers stay bounded; only the hovered/focused entity expands, and the expansion remains inside the registered map surface.

### Impact analysis
- Consumers: `CampaignMapRenderer`, `CampaignCommandShell`, `CampaignContextInspector`, `CampaignScreen`, map-list routing, keyboard selection, and campaign command layout CSS.
- State/event boundary: presentation consumes only `getCampaignMapView("Player")` and the Player formation roster. No runtime control, formation, economy, order, or intelligence truth is added.
- Visual risk: inverse-zoom marker sizing and the inspector's scroll/footer ownership can affect all supported desktop and compact campaign layouts.

### Verification
- Add renderer tests for physical marker bounds, safe hover/focus disclosure, keyboard activation, known-site safety, and Douvres role imagery.
- Add command-shell/inspector tests for the three-section hierarchy, exact formation grouping, no duplicate aggregate copy, relevant footer actions, back routing, and scroll reset.
- Run focused campaign UI/renderer tests, TypeScript, the full campaign suite, full tests, build, lint, skill validation, and `git diff --check`.
- Commit and push once, wait for the single production deployment, then recapture complete-theater and base-detail frames through the external Chrome extension.

---

## Campaign AAR Operational-Coordinate Routing Repair — 2026-08-29

### Intended behavior
- An after-action report names and focuses the same operational offset hex shown on the campaign map.
- Continuing to an infrastructure decision opens Logistics with that exact operational hex selected.
- Immutable campaign result and control records retain their existing runtime axial coordinate contract.

### Current behavior
- A battle at operational offset hex `29,23` is retained internally at axial hex `29,9`.
- The focus control projects that location correctly, but the fallback AAR title and infrastructure decision route expose the internal axial key.
- Continuing to the repair decision therefore opens Logistics on nonexistent operational hex `29,9`.

### Expected new behavior
- The command projection converts axial `29,9` to operational offset `29,23` for fallback report copy and infrastructure navigation.
- Objective-titled reports and non-coordinate decision identities remain unchanged.
- Invalid infrastructure coordinate targets fail closed instead of selecting an unrelated map hex.

### Edge cases
- High odd columns retain the row shift required by odd-q offset geometry.
- Formation and engagement decisions continue to resolve their own domain IDs before map focus.
- Existing saved AARs remain valid because no immutable report schema, hash, or runtime coordinate is rewritten.

### Impact analysis
- Consumers: campaign AAR projection, command navigator, Logistics inspector selection, and selected-hex highlighting.
- State boundary: only runtime-to-presentation conversion changes; campaign truth, battle application, and save integrity remain untouched.
- Visual behavior: report title, Focus, Continue, map highlight, and Logistics inspector now agree on one operational hex.

### Verification
- Add a high-column regression proving runtime `29,9` projects to operational `29,23` for both fallback title and infrastructure decision routing.
- Preserve objective titles and formation identifiers in the same regression.
- Run focused campaign command tests, TypeScript, campaign tests, build, lint, and `git diff --check`.

---

## Campaign Capture Reorganization and Reconstruction Decision Repair — 2026-08-29

### Intended behavior
- An after-action report requires reconstruction only when the battle left structural integrity below the installation maximum.
- A newly captured but intact installation reports its temporary garrison handover and the exact time full capacity returns; it does not send the commander to an impossible reconstruction order.
- Existing saved reports generated by the affected build are projected safely: the obsolete repair prompt is suppressed when the immutable infrastructure audit proves the installation was captured intact.
- Genuine structural damage retains the existing costed reconstruction draft, commitment, progress, and completion flow.

### Current behavior
- `buildDecisions` treats any post-battle effectiveness below 100% as structural damage.
- Capture reorganization temporarily caps an intact installation at 50% effectiveness, so a full-integrity fort receives the required decision `Repair the battle area`.
- The Logistics inspector correctly refuses reconstruction at full integrity and therefore offers only ordinary formation orders, leaving the AAR continuation as a dead end.
- The selected installation hides its condition card when it has no missing integrity, so the player cannot see that the 50% capacity is a timed capture handover.

### Expected new behavior
- AAR decision eligibility compares `infrastructureAfter.integrity` with `maxIntegrity`; effectiveness remains a capacity consequence, not a repair proxy.
- Captured-intact AARs describe an intact installation under temporary garrison reorganization and show no required repair decision.
- The installation condition card remains visible during capture reorganization and states that full capacity returns automatically at the authored campaign time.
- Damaged installations continue to present a required reconstruction decision and the existing `Plan reconstruction` action.

### Impact analysis
- Consumers: immutable AAR construction, saved-report command projection, Operational consequences copy, Logistics selection details, and the reconstruction action registry.
- Events: campaign result application and AAR acknowledgement are unchanged; no new state event or order kind is introduced.
- State boundary: campaign infrastructure integrity, disruption timing, repair legality, orders, reservations, and save hashes are not rewritten. The change corrects decision classification and presentation only.
- Visual behavior: an intact captured installation gains one concise condition card during its timed handover; a false required-decision button disappears from new and already-saved affected AARs.

### Edge cases and risk
- Captured installations that also suffered damage still require reconstruction; temporary reorganization and structural repair may coexist.
- An infrastructure report unavailable to an older or invalid projection does not cause a decision to be silently discarded.
- Other decision target kinds and structurally damaged infrastructure decisions remain unchanged.
- `CampaignScreen.ts` is a broad campaign presentation consumer. Changes are confined to condition/AAR projection and are covered by focused semantic tests; no map coordinate, renderer, order, or engine behavior changes.

### Verification
- Add one AAR regression comparing an intact capture against a structurally damaged capture.
- Add projection regressions proving legacy false repair decisions are hidden only with an intact audited installation and that the operational consequence copy explains timed reorganization.
- Add a selected-installation regression proving 50% capture capacity is visible, timed, and not presented as reconstruction.
- Run focused AAR, campaign screen, and campaign command tests; campaign suite; build; zero-warning lint; full tests; and `git diff --check` before release.

---

## Active Inspector Capture-Recovery Clarity — 2026-08-29

### Intended behavior
- Following an AAR focus route selects the affected installation and immediately explains its current condition and recovery in the active campaign inspector.
- Temporary post-capture reorganization states its cause, current operating capacity, and exact automatic return time without presenting reconstruction as a player command.
- The persistent Orders footer contains only commands the player can actually issue.

### Current behavior
- The active command-shell inspector shows `160/160 integrity · 50% effective` but does not explain why capacity is reduced or when it returns.
- A legacy compatibility card contains the recovery explanation, but that card is hidden beneath the active shell and therefore does not help the player.

### Expected new behavior
- The active inspector separates a concise `Condition` fact from a visible `Recovery` fact.
- An intact captured fortification states that the new garrison is reorganizing, gives the exact full-capacity time, and explicitly confirms that no reconstruction order is required.
- A structurally damaged installation retains its real reconstruction workflow while also disclosing any simultaneous capture handover.

### Impact analysis
- Consumers: campaign hex projection, active context inspector, selected-installation legacy compatibility projection, and command-foundation semantic coverage.
- State boundary: presentation only; integrity, effectiveness, disruption timing, order legality, campaign events, and saves remain unchanged.
- Visual risk: the new fact can add inspector height, but it stays in the scrollable body rather than the fixed action footer.

### Verification
- Add an active-shell regression proving `Condition` and `Recovery` project from authoritative infrastructure state, including exact time and absence of a reconstruction action.
- Run campaign tests, full tests, typecheck, focused zero-warning lint, production build, skill validation, and `git diff --check`.
- Push once, wait for the single Vercel deployment, then verify computed visibility and capture the selected installation through external Chrome.

---

## Opposing-Initiative Defense Completion — 2026-08-29

### Intended behavior
- A mandatory campaign defense is resolved by either of the two conditions presented before battle: hold every marked defended position or break the opposing combat force.
- The two objectives report their own state independently; completing one does not falsely mark the other complete.
- Campaign battles remain unbounded by a fixed turn limit and can continue past Turn 20 while neither battlefield condition is satisfied.
- Deployment controls reveal their true prerequisites and readiness before the player commits an action.

### Current behavior
- All four Caen-Orne defensive objective markers can read `Secured` while `Hold the engagement area` remains `In progress` indefinitely.
- Defender victory is only reachable by reducing the Bot ground-force score to zero, despite the briefing promising either objective.
- Supply trucks count as combat-effective ground force and can block the secondary objective after every fighting formation is gone.
- `Deploy Evenly` and `Deploy Grouped` initially appear enabled without a base camp; activating them produces no visible response.

### Expected new behavior
- Friendly control of every tactical objective naturally resolves a campaign defense victory with role-correct explanation.
- Objective-control victory completes only the primary objective; combat-force collapse completes only the secondary objective.
- Air and support-role units do not count toward combat ground-force survival.
- Auto-placement is disabled with accurate guidance until deployment is open, a base camp exists, and a formation remains available.

### Impact analysis
- Consumers: campaign mission-rule controller, battle objective status/modal, tactical-save continuation, deployment header controls, and battle announcement accessibility.
- State boundary: no campaign save schema or fixed deadline is introduced. Existing mission-rule snapshots retain their version and derive terminal truth from the current battlefield on the next stable turn boundary.
- Gameplay: attacker victory and defender defeat rules remain intact; only the previously impossible defender primary and support-only collapse semantics change.

### Verification
- Extend the campaign battle terminal-rule regression with defender 4/4 victory, partial-control combat collapse, a surviving support convoy, independent objective state, and all-objectives-lost defeat.
- Test auto-placement readiness before base camp, after assignment, after exhaustion, and after deployment closes.
- Run typecheck, focused lint, campaign suite, full tests, production build, skill validation, and `git diff --check`.
- Commit and push once, wait for the automatic production deployment, then resume the live Turn 6 defense and prove Mission Complete, AAR, return to campaign, and clean console state.

---

## Source-Backed Formation Identity and AAR Command Density — 2026-08-29

### Intended behavior
- Every exact Allied formation shown to the player uses a dated, source-backed WWII subordinate identity and immediate period command.
- Campaign strength steps and logistics abstractions remain grouped under authentic commands; the interface never invents plausible battalion, squadron, or column numbers.
- Enemy formation identity remains governed by intelligence quality even when the internal scenario OOB is exact.
- The AAR makes the formations that actually changed immediately legible while preserving every exact committed record in accessible drill-down.

### Current behavior
- Ground records without a special mapping collapse to repeated labels such as `British 6th Airborne Division` and `British 3rd Infantry Division battalions`.
- Stored AAR presentation bypasses the current formation resolver and prints the frozen legacy name even when a safe presentation correction exists.
- Every committed row opens at equal visual priority, so one damaged battalion is buried among many unchanged formations.

### Expected new behavior
- U.S., British, and Canadian exact groups resolve deterministically from retained origin label and ordinal into the source-traced OOB manifest.
- Real commands own their subordinate rows; aggregate strength steps opt out of subordinate disclosure and stay grouped.
- AAR display names resolve from current origin metadata without mutating stored report facts or integrity hashes.
- Materially changed rows are open and emphasized. Only rows with no personnel, equipment, readiness, cohesion, fatigue, experience, status, or disposition change are collapsed under a counted disclosure.

### Impact analysis
- Consumers: formation seeding, existing-save roster projection, base inspector, tactical formation label handoff, saved AAR projection, and AAR report density.
- State boundary: persistent IDs, origin records, authored campaign counts, save checksums, and immutable report content remain unchanged. This is a presentation mapping and hierarchy change.
- Historical boundary: exact identities and abstractions are separately declared in `docs/NORMANDY_DPLUS1_OOB_MANIFEST.md`; no generated ordinal fallback is introduced.

### Verification
- Prove exact D-Day ground groups resolve every authored ordinal once with unique subordinate names and correct command echelons.
- Prove known campaign strength steps remain grouped and explicitly lack fabricated subordinate identity.
- Prove AAR default density shows affected rows first, collapses only unchanged rows, and retains every exact formation ID once.
- Run typecheck, campaign suite, full tests, focused lint, production build, skill validation, and `git diff --check`.
- Batch into one push, wait for the one automatic production deployment, then replay the saved defense AAR and inspect exact names, command grouping, disclosure behavior, viewports, console, and broken images through external Chrome.

---
# Campaign release lint gate — 2026-09-05

The audit plan requires zero ESLint warnings. The final repository scan exposed existing unused bindings and const suggestions outside campaign files; the separate baseline checkout also entered the scan. The baseline worktree has been relocated into the existing ignored `dist-tsc-check` evidence area without modifying its audited source. Lint configuration and rule severity will not be weakened.

## Impact analysis before editing

This work removes unused imports/types, marks intentionally unused parameters/bindings explicitly, removes obsolete lint-disable comments, and uses const where no reassignment exists. It must preserve initializer evaluation, parameter order and arity, all gameplay branches, RNG calls, coordinate calculations, persistence, and render timing. The only high-risk file requiring a mechanical edit is `src/rendering/HexMapRenderer.ts`: unused imports/types/bindings, two unused callback parameters and one never-reassigned local declaration. No renderer algorithm, animation timing, or coordinate expression may change. `BattleScreen.ts` and `src/engine` remain outside the edit scope.

## Replay and manual checklist

- Inspect every renderer diff: initializer/call expressions, branch conditions, iteration order, and coordinate math must remain identical.
- Compare emitted renderer JavaScript before/after after normalizing only renamed local identifiers and const/let declaration keywords; any other difference requires investigation.
- Run the existing full repository replay/regression suite and all six mandatory release commands again from a clean worktree; run the six-viewport production browser matrix for actual map/inspector/action operation.
- Confirm zero ESLint warnings without ignores or suppressions and preserve the original warning report for traceability.
- During the separately authorized live run, inspect map rendering, battle handoff, long tactical play, animation, and console/request errors. Local replay and browser checks are not live certification.

---

## Live campaign stacked-formation reporting — 2026-09-05

### Observed and intended behavior

Live Omaha-Gold deployment places eight infantry, two engineers and one convoy across six occupied hexes. The engine and tactical serialization retain all eleven exact identities, but the Army Roster displays six, Logistics reports 30 carried ammunition instead of 60, and its retained supply sample still says Deployment during player turn one. A formation with its full movement allowance and no actions spent is also described as having already moved and attacked when neighboring stacks leave it no legal destinations.

The roster and current supply read models must include every canonical formation, preserve stable unit and campaign identity across stacks and movement, and report the current phase. Lack of a legal option must not be described as an action already spent.

### High-risk impact analysis before editing

- Responsible high-risk files: `src/game/GameEngine.ts` (roster/current-supply read projections only) and `src/ui/screens/BattleScreen.ts` (selection-summary wording only). No combat-resolution, coordinate, deployment, movement, AI, resource-debit, naval-charge or save-schema algorithms may change.
- Roster consumers: Army Roster, reserve/support presentation, War Room counts and combat-power/readiness summaries. Use the existing all-faction-unit iterator and stable identity helper; do not create a second registry or infer identities from type and hex.
- Supply consumers: Logistics current stock/alerts and War Room statistics. Current reads must compute from canonical units and current phase without appending or rewriting historical samples, spending stock, changing action flags, or mutating the ledger. Preserve Player/Bot/Ally isolation and unchanged historical persistence.
- Selection feedback: zero legal moves/attacks can result from occupied neighbors or terrain, not only spent actions. Describe the available options honestly without changing legal-option generation or routing.
- Save compatibility: existing turn-one checkpoints can contain old historical samples. Their current views must become correct after load while serialized units, action flags, stock and historical records remain intact.
- Visual effects: only list row count, current totals/phase and one selection sentence change. No renderer, map transform, animation or timing edits.
- Scope discipline: separate bounded commits for these defect corrections; no general engine cleanup or wholesale replacement of legacy map reads.

### Regression and manual checklist

- Reproduce the live eleven-formation/six-hex stack with same-type members; require eleven unique stable roster identities, every exact campaign ID, 60 carried ammunition and unchanged naval charges.
- Move one member, then serialize/restore: only its location changes; count, identities, resources and unrelated members remain conserved.
- Check conventional and initiative turn starts. Repeated current-supply reads must not alter history, units, stock, ledger or action flags; test all three factions.
- Exercise the actual selection-summary caller with a fresh formation blocked by full neighboring stacks. It must retain its allowance and never claim spent actions merely because zero options exist.
- Run focused failing-then-passing regressions, independent review, all six required release commands from a clean commit and zero-warning lint.
- In the deployed external browser, resume this audit's own named turn-one checkpoint, reconcile all eleven roster identities and supply/phase values, then continue support targeting, long battle, natural outcome/AAR and campaign return. Preserve every pre-existing player save.

### Naval empty-impact feedback — 2026-09-06, before editing

The live turn13 event reports an empty impact hex but the BattleScreen subscriber invents movement as its cause. The authorized high-risk edit is one event-consumer sentence in BattleScreen.ts, plus an actual subscriber regression for hit:false and retained hit:true copy. Report only that no target remained at impact. Do not modify GameEngine resolution, enemy visibility, naval charge/timing mechanics, renderer, or other combat logs. Preserve exact support name and displayed hex. Focused RED/GREEN, scoped checks, independent review and the consolidated full release gates precede the live retest.

## Live tactical resume title presentation — FSG-CAM-010
- Confirmed deployed trigger: resume the audit's supported turn-one campaign checkpoint. Save validation normalizes the title to raw Hex 24,24; BattleScreen displays it instead of the normal-entry Omaha-Gold Sector title.
- Bounded high-risk surface: BattleScreen.hydrateMissionBriefing presentation only, plus its actual campaign-handoff regression. Resolve the validated frozen mission package's mission type/role/hex through the existing player-safe campaign location presenter used at normal entry.
- Do not change persistence schema/migration/validation, engine or formation identities, campaign ownership, support availability/charges, combat, initiative, renderer or standalone title behavior.
- Proof: honest red actual resume/show lifecycle; named sector, defender suffix and standalone controls; unchanged saved package/engine identities/support charges. Run scoped compile/lint, independent review, all release gates, then exact deployed cold-resume title verification.

## Live selected-intel keyboard boundary — FSG-CAM-008 follow-up
- On corrected production99a3df1, closing the real nonmodal intel card leaves body focus. Native Shift+Tab then stays on body and dispatches formation-selection feedback instead of native backward focus traversal. Tab between actual buttons already works and must remain so.
- Authorize bounded EnhancedInitiativeTurnControls keyboard handler only: preserve native modified Tab and nonmodal dialog traversal; retain deliberate unmodified battlefield shortcuts, active-group guards, modal/input safeguards and disabled behavior.
- Preserve engine/initiative authority, command execution and all current labels/fonts. Prove with actual component browser regression and live native-key retest; any fixture discrepancy must be explained, not hidden by imperative focus shortcuts.

## Live post-battle location and checkpoint access — FSG-CAM-011/013
- AAR after Omaha victory uses the campaign name after runtime front rebuilding; a formation battle-history line exposes an internal engagement ID. Keep stored reports/history immutable, and resolve presentation through bound authored initial-front geography and exact historical ledger/package context. Preserve place/objective precedence and exact focus hex; reject unrelated/ambiguous matches.
- The game writes campaign-post-battle recovery slots but provides no visible loader. HQ Load immediately restores primary; Battles intentionally filters active tactical slots. Add a campaign checkpoint choice at HQ Load, using existing listCampaignSaveSlots and loadCampaignSlot authority. Preserve loadPrimaryCampaign legacy/recovery behavior and existing fail-closed validation; never create another storage path or automatically overwrite primary.
- Scope: CampaignScreen integration, a bounded campaign checkpoint chooser component, appropriate existing/new actual Screen and save-contract tests. Use existing modal styling/focus boundary, explicit load selection, keyboard/Escape and background isolation. Keep source/testing ownership disjoint from tactical CSS/keyboard and recovery domain.
- Verification: honest red live-route regressions, actual selected nonprimary load with resources/reports/campaign preserved, primary untouched, corrupt/wrong-content recovery/no mutation, cancel/focus, authored/historical location parity. Independent review and full release gates precede deployment.

## Unrelated front initiative and authored defense — FSG-CAM-014
- Live/source-confirmed P1: Omaha Player victory passes preferredInitiative=Player into theater-wide front reconstruction. It overrides matched Caen-Orne Bot initiative; the ordinary authored counterattack scheduler then excludes that front. Naturaladvances at06and09 confirmedmissingdefense.
- Bound correction to battle control/front reconstruction: only affected battle front/control neighborhood may inherit winner initiative. Preserve unrelated stableidentity, cadence modifiers, orientation and initiative. Do not bypass scheduler/knowledge/legality/deduplication or retain obsolete livefronts for presentation.
- Add actual sequence firstadvance -> realOmaha consequence -> ordinarynextadvance -> exactCaenmandatorydefense, plus unrelatedotherfront/differentwinner/correctorientation/dedupnegative controls.
- Existing persisted affectedstate needs evidence-bound compatibility consideration using validated historical control audit and authored front identity. Do not globally force Bot initiative or recreate a resolved counterattack. State/load integration must be parent-owned if needed to avoid concurrent ownership with recoverydomain.

## Existing-formation recovery order — FSG-CAM-012
- Live AAR directs the player to Recover the shattered 5th Engineer Special Brigade, but the inspector has no recovery action and no campaign recovery order exists. Implement one typed formationRecovery order through existing preview, draft reservation, transactional commit, segment resolution and persistence authorities. Retain the exact formation identity and repair only living personnel and repairable equipment; killed/destroyed pools remain lost.
- This introduces an explicit campaign policy, rather than claiming current campaign rules already define it: medical throughput 12 work points per three-hour segment and equipment throughput 8, using current status transition costs; supply is ceil(0.3 * medical work + 0.5 * damaged equipment + 2.5 * disabled equipment). Tracks progress concurrently, at least one segment after commit; initially disabled equipment requires at least eight segments. Simulate the shared deterministic transitions for precise preview duration. No replacement personnel, movement, ammunition or fuel charge is included.
- High-risk surfaces: status.ts shared medical/equipment pool-loop extraction must preserve existing tactical wrapper behavior and normalization exactly; CampaignState commit/cancel remains transactional; SegmentResolver advances only the committed typed order and records progress once. Do not use tactical template normalization on persistent campaign pools. Keep status-helper extraction reviewable separately from new campaign behavior.
- Recovery requires a present friendly supplied formation with recoverable work, positive projected readiness and no conflicting order/engagement. Existing friendly supply graph remains the sole authority. Reserve exact identity and supply; reject stale quotes and conflicts. Commit marks refitting and deducts once without immediate pool recovery. Cancellation before first execution restores prior posture and refunds exactly; after execution begins it is unavailable. Supply/control/location changes block further work without discarding completed treatment or overwriting terminal/control-owned states.
- Persist policy version, work schedule and progress in the order, with pools remaining authoritative on the formation. Validate malformed orders; old saves without recovery remain supported. History, experience, honors, fatigue and cohesion are conserved except the explicit recovery history entry. Derived readiness and current order determine eligibility; no duplicate recovery registry or automatic primary save is permitted.
- Domain owner edits order/service/State/SegmentResolver/invariants and focused recovery tests; control owner supplies the existing supply graph access; CampaignScreen remains with its separate owner. Parent alone integrates any compatibility load hook, registers tests, commits and releases.
- Proof: actual battle consequences to the same shattered ID, real preview/draft/commit/advance, exact survivor/loss conservation, sibling isolation, costs/ETA, reservation conflict, stale quote/atomic rollback, pre-work cancellation/refund, supply interruption, readiness, read purity and save/resume without repeated treatment/debit. Existing tactical medical/repair regressions protect extraction. Independent review, all release gates and actual deployed recovery are required.

## Archived report interaction and attainable score wording — FSG-CAM-015/016
- Live99a3df1 after returning to HQ: opening the archived AAR leaves focus on a background workspace tab or body. A subsequent Tab can remain on body while the old tactical controls remain mounted but hidden. The AAR declares aria-modal without an effective interaction boundary. Fix only UI lifecycle/focus/keyboard ownership, preserving campaign state, acknowledgement and decision routing.
- CampaignCommandShell must preserve focus across report refresh/acknowledgement, contain native Tab and background shortcuts while its AAR is open, restore the exact valid invoker on close, and release temporary listeners/inert state on navigation/disposal. Report decision/focus routes must close the modal before moving focus to their destination. Reuse one modal boundary where practical rather than layering competing traps.
- EnhancedInitiativeTurnControls must ignore shortcuts while its owning battle surface is hidden/inert or detached, while preserving enabled in-battle shortcuts and the existing dialog/input exclusions. This is an event ownership guard; do not change initiative or command algorithms.
- At100/875 earned points, Situation says Projected Decisive victory. CampaignObjectiveEvaluator actually computes the best grade from maximum still-achievable points. Relabel this projection as best available outcome with a brief condition that remaining objectives must succeed; preserve scoring and outcome rules and the calm opening display.
- Proof: actual Screen archive open/refresh/acknowledge/close and required-decision routing, keyboard forward/reverse traversal, hidden tactical controls do not capture headquarters keys, nested modal/exit cleanup, preserved state and reports. Real browser checks at compact/short sizes must include populated AAR and new checkpoint picker. Use separate source ownership from CampaignScreen and recovery domain, followed by independent review and all release gates.
- The actual required-decision route regression exposes a second focus target collision: CampaignCommandScreen.findByDataset selects an earlier formation article inside the now-hidden AAR. Permit a presentation-only connected/visible/non-inert target filter there; preserve the exact canonical navigation and existing inspector destination when no available candidate exists. Its destroy method must release the new Shell interaction boundary.

### AAR containing-pane geometry — before scoped CSS edit
Stronger populated-report browser assertions exposed that the 800px viewport AAR card sizes itself from the viewport and extends beyond its narrower campaign pane. Goodall owns the sole campaign stylesheet change: constrain the AAR card to the containing pane with max-width:100%, preserving existing type size, height and scroll ownership. Feynman must rerun all six report and six checkpoint geometries, inspect saved images, and retain the original failing evidence. No domain or renderer behavior changes.


The first max-width-only correction still fails the exact800 report test: the implicit grid track remains768px inside a758px pane. Extend only the same AAR containment correction to give the panel a shrinkable minmax(0,1fr) column (or equivalent measured containing-block constraint), preserving fonts and height/scroll behavior. Goodall remains sole stylesheet owner; retained failing screenshot and all-ancestor assertion govern acceptance.


### Recovery completion notification integration — before edit
Parent review found CampaignAdvanceRules still sends the new recovery kind through its reconnaissance label/category/target fallback. Bernoulli owns a bounded follow-up in that file and the existing recovery test: explicitly label recovery completion/blocking, classify completion as logistics, route to the exact order, preserve severity/stop/dedup rules. Prove actual ordinary completion/interruption alerts through the existing real recovery pipeline before committing. No new event stream or domain authority.


### Legacy intelligence resolution prose — FSG-CAM-017 before edit
Live Recent resolution renders Activity reported near26,23 as primary prose. The immutable brief/alert contains no frozen historical location metadata, and its linked contact can move. Goodall owns a bounded Screen/test presentation correction: use neutral intelligence-report copy and the existing Review Intelligence route for unbound historical contact alerts, preserving their original title, time, severity, read state and identity. Do not infer historical geography from a current contact, parse coordinates from prose, rewrite stored history, or add a competing intelligence record. Focused actual Screen regression must retain original serialized alert data and verify the route after the contact moves. Existing named current-contact/briefing projections remain outside this narrow correction.


The corrected outer track now fits; the same retained800 case reaches a second intrinsic grid inside campaignAarDetail (541px scroll width in514px client width). The same bounded AAR containment scope includes a shrinkable detail grid column and min-width constraint where measured, so real summary text stays within its existing padded scroll owner. Preserve all populated text, fonts, native key assertions and screenshots.

### R4 integration regression — committed formation affordances
The clean ec41704 professional UI gate fails unchanged FSG_CAM_045_FIELD_FORMATION_SELECTION: the new recoveryActionVisible flag admits every placed formation, exposing the selection section for an already committed combat formation. Parent takes sole ownership of one Screen projection expression: the exceptional recovery affordance requires the existing posture authority's presentAtLocation and shattered/refitting posture. Ordinary ready actions continue through existing canReceiveOrders; committed/transit/scheduled/retired behavior stays unchanged. Preserve all existing assertions, rerun045 with093actualrecovery, then independent review and a new clean R5 full sequence. R4 failed logs remain intact.

### Live report-to-recovery selection handoff — FSG-CAM-018 before edit
On exact deployed27b0b51, load ownpostbattle checkpoint -> acknowledge AAR -> Continue to required decision selects5thShattered in canonicalinspector, but legacyselection context remainsnull/priorhex and exposes genericRedeploy with no recoveryquote. DirectForces search/selectsameID gives correct154supply/123hours/94%quote and no siblingredeploy. ScreenonAfterActionTargetSelected callsnavigate thenmanuallyupdateshex without syncCampaignSelection, leaving itsformationidentity stale. Goodall owns a bounded Screencallback correction using the existing canonical selection synchronizer for formationdecision routes; preserve othernaval/infrastructure/engagementroutes and Stateauthority. Add actualStatepostbattleload->AARdecision regression requiringvisibleexactquote+noinvalidredeploy, thenactualdraftID/revision; retain source/storage/resource readpurity until explicitdraft. Independentreview/fullnewreleasegates precederedeploy.


### Live recovery action styling — FSG-CAM-019 before edit
At native200 on27b0b51, direct5thselection reaches Add recovery draft but its unstyled button is21.2CSSpx high. Existing campaign-context-actions buttons already define44px targets. Goodall may wrap the recovery Add/Review controls in that existing action container, preserving quote content, font size, disabled semantics and callbacks; do not add parallel CSS or move quote outside the inspector body scroll owner. The realsource/liveheight measurement and screenshot are the before evidence; existing action geometry gates and deployed200 retest must verify final44px reachablecontrols.


The same live recovery action also drops focus to body when its successful draft replaces Add with Review recovery order. Include explicit focus continuation to the exact newly created order's Review control after the existing render completes; keep any rejected draft on refreshed actionable context. This is UI continuation only, with actual focused-control regression; no extra order or state mutation.


## Defender briefing enemy-unknown wording — FSG-CAM-020, before edit
Live authored Caen-Orne mandatory defense correctly binds the Player observer and18 own defenders, but Enemy estimate lists frozen legacy unknowns as Defender strength/readiness/supply, confusing enemy uncertainty with the player defense. Feynman read-only traced the actual Player knowledge path and found no observer inversion. Authorize only PrecombatScreen.renderEngagementContextBanner presentation and a new focused consumer regression: normalize four exact legacy unknown strings to Enemy wording (strength; strength and number of formations; readiness; supply state), preserving all other strings, bands, contacts, own formation caps, budget, package and save identity. This must work for already-saved briefing packages without mutation or true-force access. No domain/producer/engine/schema change. Parent registers new test after owner freeze; honest RED/GREEN for attacker/defender, zero/two-contact contexts, supplied context immutability, isolated checks and independent review precede consolidated release and exact live retest.

### Expanded tactical log and initial intel visibility — FSG-CAM-008 follow-up before edit
Live27b0b51 authentic Caen defense atnative200%753x356DPR2.5 uses the ordinary expanded BattleActivityLog.show() state. The 280px log and96px rail leave a316px pane, yielding30px-wide turn controls and a long wrapping heading; expanded intel begins clipped below the visible pane. Wegener confirms every existing geometry fixture forcibly collapsed the log, and selected-intel tests pressed End before initial visibility assertions. These are real coverage gaps, not evidence of a missing stylesheet. Toggle/dismiss are also24px high.
Goodall owns only battle-scoped inlineCSS in index.html, SelectionIntelOverlay.ts if necessary for view reveal/positioning, and existing tests/e2e/tactical-command-geometry.spec.ts. Reflow the compact battle shell so expanded log remains accessible without permanently consuming the map width; preserve actual toggle/open state, desktop behavior, font sizes, domain and selection identity. At narrow containing panes stack title/status/save/initiative rows as needed for complete text and44px action controls. Intel header controls must be44px and initial/re-expanded selected content must appear within the visible ancestor intersection. Prefer CSS; if positioning requires code, limit it to existing overlay view reveal/clamp, preserving world coordinates/renderer/state/events. Do not change BattleScreen/engine/initiative ownership or invent auto-collapse state.
Strengthen the same browser contract using actual BattleActivityLog.show/toggle, expanded andcollapsed log, live18-formation defense and long8thMidlands roster title, and initial selection BEFORE keyboardEnd or scrolling. Assert text/ancestors/hit targets/44px controls, then scroll body to actual final legal action, nativefocus/dismiss and usable map. Keep all19existing assertions and retain honest REDs. Cover existing six dimensions plus actual753x356DPR2.5, inspect screenshots, isolatedcompile/lint, independentWegenerreview, completecleanR6release andexactnative200deployedretest. Parent alone commits/deploys/driveslive.

### Defender objective progress presentation — FSG-CAM-021 before high-risk edit
Live Caen-Orne objective-only defense correctly requires visiting each defended point at least once and retaining territorial control; the controller persists securedFriendlyObjectives separately from objectiveControl. However all initiallyfriendly markers are labeled Secured by the BattleScreen header. Shipped index.html has no legacy battleMissionObjectives node, so renderMissionStatus returns without showing Securedpositions0/4 or the requirement; existing tests synthesize absent legacy nodes. This is a confirmed presentation/integration blocker, not authorization to change victory rules.
Bernoulli owns a bounded missionRules ObjectiveMarkerProgress optional readonly secured flag, set only by the existing campaigndefender marker projection from the authoritative visitedset, with truthful tooltips; BattleScreen's existing objectivecard rendering consumes that flag for Friendly-held—needssecuring/Secured/Enemy-held—recapturerequired and updates aggregateprogress/instruction before its legacy-node guard. No newvisitedregistry, textparsing, hiddenengineaccess, win/deadline/combat/control/serialization changes. Attacker/standalone markers omitflag and retainexistingbehavior. Events and MissionStatus structure remaincompatible; this is additional typed presentationdata only.
Goodall remains sole index.html andgeometryspec owner and will add a hidden-by-default objectiveprogress line with agreedstableID inside the existing objectivecard; this appears only for controllerprojected campaigndefender markers. Its long populatedprogress text must be included in the actualcompact/expandedlog geometry proof. Bernoulli must not editindexCSS/markup orGoodalltests.
Bernoulli's existing BattleScreen.objectiveMarkers.test.ts must mount the shippedobjectivecard markup rather than invent legacy missionnodes and exercise generateddefender/actualcontroller+engine evaluation: initialfriendly0/4, repeatednormalturnnotsecured, exactvisit/leavingterritorialretention/enemyrecapture, save/hydrate, finalvisit/allfriendlynaturalobjectivevictory withenemyremaining. Assertrealheadertext/accessiblelabel/progresstext/tooltips, preserveattacker/standalonecases. HonestRED/GREEN, isolatedTS/lint, parentindependentreview andallconsolidatedreleasegates precede liveacceptance. ManualcheckfromownCaentacticalcheckpoint must exposeaccuratebefore/aftercounts andsamebattleidentity, reachnaturaldefensiveresult andapplyconsequencesonce.

### Precombat regression registration integrity — before test-only correction
020's expanded review found existing tests/precombatAllocs.test.ts is not registered in any standard Node runner. Two assertions contradict unchanged authored behavior (medical/maintenance catalog implemented, training minimum13 rather than12), reproducing on pre-edit source. Authorize Feynman only this existing test file to reconcile those two semantic contracts with verified current authoring, preserve all other assertions and prove implemented logistics remain selectable within caps/budget. Do not change product/catalog/mission rules to satisfy stale assertions. Run the full ten-case file in isolation, verify cleanup of singleton/DOM effects, preserve baseline evidence. Parent independently registers it once in full tests/index.ts after review; no duplicate campaign-wide registration or gate waiver. IndependentWegenerreview and unfiltered full release must pass with these newlycoveredcases. Broader unrelated test-file discovery is outside this bounded correction.

### Mixed logistics allocation identity — FSG-CAM-022 before high-risk edit
Live committed4Para+1SupplyConvoy+2Medical+1NGFS (390RP) deploys7ground, but panel collapsesallSupply_Truck variants intoMedical0/3 androster labels actualSupplylogistics/P48/equip8 asMedical#1. Catalog/blueprints/unit formationKey andreserve allocationKey retain1supply+2medical; the actualrole predicates stillconsumeformationKey. No healing/resupply algorithm change is justified. Independentsource audit additionally finds singlefindIndex exactORtype lookup can consume earlierconvoy when requestedmedic existslater; recall/counts also use mutablelast-registeredalias. Therefore label-onlypatchwouldleavewrong manualdeploymentidentity.
Bernoulli owns the bounded existingallocationidentity chain: sharedpure validatedallocation-key resolver using ScenarioUnit.formationKey/ReserveUnit.allocationKey, DeploymentState mirror/counts/placementidentity, GameEngine reserve lookup/recall/affectedrosterlabel, and BattleScreen affectedreservecount/label consumers only. Exactvalididentity compatiblewithunit.type takes precedence; explicitdifferentrole mustnevermatchbysametype, exactsearch mustscanentirequeue. Legacyunits lackingidentity retain canonicalexistinggenericconvoy semantics, never a mutablelast-medicalalias; malformed/inconsistentexplicitidentity mustfailclearly underexistingvalidation. No newunittypes/registry/schema, no cost/cap/combat/movement/heal/resupply/stock/eventchanges. PreserveeveryunitID andall unrelatedtypes/campaignformationidentity. Sharedresolvermustnotintroduceimportcycles or UIenginecoupling. Existing021changesinBattleScreen remainfrozen and preserved.
Use a focused new actualidentity-chain test:1convoy+2medic withrepairnegative, realblueprints andengine/manualdeploymedicwhileconvoyfirst, mirroraftereach, exactpool/reserve/placedcounts, exhaustedmedicrequestcannotconsumeconvoy, recall/redeploy andchecksummed/serializedfreshengine sameIDs/roles. ActualDeploymentPanel mustshowSupplyConvoy1andMedical2 before/afterplacement;rosterlabelsagreewithrole,NGFSremainsseparate. Run directlyaffectedexistingstackedidentity/campaignhandoff/tacticalmedical/repair/groundlogistics regressions unchanged. HonestRED/GREEN, isolatedTS/lint, parentindependentarchitecture/replayreview andfullcleanR6gates precededeployment. ManualcheckfromownCotentinturn1checkpoint retains4paras+1convoy+2medical/2navalcharges/D6completedrecovery andexactrolelabels; actualnewmanualdeployment/recall mustbecheckedthroughvisibleUIwhenavailable.

### Enemy initiative cardinality disclosure — FSG-CAM-023 before edit
Live Cotentin enemy phase displays 19 formations acting despite only a few observed contacts. Read-only tracing confirms BattleScreen forwards the complete remaining enemy initiative group; the display counts it without a fog contract. Parent authorizes Feynman only EnhancedInitiativeTurnControls.ts and its existing focused test: preserve initiative/Enemy group labels and use count-free Enemy orders resolving for enemy groups, including transient null-currentUnit updates. Guard the same component's dormant optional group-progress writer so future markup cannot reintroduce counts or numeric progress; preserve all player counts and callbacks, phase completion and enemy-disabled commands. No changes to queue, activation timing, engine, BattleScreen, fog rules, schema or CSS. Test real component enemy 19/18/1/0 transitions, null current unit, text/title/aria/data surfaces, immutable inputs, friendly counts and existing keyboard guard. Capture honest RED/GREEN and isolated checks; independent review, consolidated release gates and deployed enemy-phase visual retest remain required. Prior saved count artifact was after resolution and does not prove the live number; retain that limitation.

022 consumer completion: frozen review identified PrecombatScreen.seedPredeployedAllocations grouping authored Player/Ally units solely by tactical type, losing explicit medical/repair roles before deployment. Extend Bernoulli ownership only to those two read-only allocation-key expressions plus the shared resolver import in PrecombatScreen, preserving committed020 wording. Extend the same new identity test to actual rendered authored predeployed Player/Ally distinct supply/medical/repair labels/counts and immutable source, interactive allocation caps/budget unchanged. No cost resolver or precombat purchase changes. Core five files remain frozen while this bounded consumer proof is added; independent review must include the final test and consumer diff.

Follow-up before any PrecombatScreen edit: source inspection proves predeployedRoster has no shipped reader or markup and therefore cannot produce the reported live deployment-label defect. Do not add a renderer or test-only DOM to expand 022. The paid allocation → blueprint → engine → deployment panel/roster chain remains the user-visible scope. PrecombatScreen stays unchanged; preserve the dead-code observation for later cleanup and freeze the already-proved five-file correction for review.

### Campaign map marker registration and visual hierarchy — FSG-CAM-024 through 026 before edit
The user-provided D+1 Juno frame was reproduced on exact deployed 27b0b51. The SVG lattice itself is regular: visible rendered row spacing is 70.53–70.54 CSS px, adjacent-column spacing is 61.08–61.09 px with alternating ±35.26–35.27 px offsets. The apparent cell failure comes from overlay registration and art hierarchy.

FSG-CAM-024: Douvres is authored at Grid 29,23, but renderKnownStrategicSites moves its icon and hit target 15 world units left whenever a contact shares the cell. The registered hex radius is only about 11.7 world units, so the declared authoritative anchor lands outside its own hex and visually covers Juno. Operational mode hides contacts but still applies this displacement. Correct the presentation without changing either entity's location, intelligence, selection identity or map rules. At every supported zoom, each icon and its interaction anchor must remain inside its authored hex; co-located entities may use bounded in-cell offsets or progressive disclosure.

FSG-CAM-025: campaign01 declares a flat-top odd-q lattice while the fortification, base, airbase and naval-base raster art has a point-top hex silhouette. At live detail zoom 3.48, 22-unit known-site art grows to 76.56 CSS px, nearly the full 81.45×70.54 hex, and beach cells additionally layer a 65.16 px fortification tile, a 59.96 px force disk, and a 36.8 px label. All image URLs are present and console warnings/errors are empty; this is orientation, scaling and layering failure rather than missing downloads. Provide a coherent map-symbol treatment that remains centered, legible and bounded at maximum zoom. Do not rotate geographic state or change unit composition.

FSG-CAM-026: named-location collision avoidance only considers other labels, although force and site layers render later. In the exact frame every visible Normandy label intersects at least one marker; Juno is almost fully covered by the displaced Douvres badge, while Omaha, Utah, Sword, Ste-Mère-Église and Utah Exits are visibly occluded. Douvres' full disclosure extends about 82.6 CSS px past the actual scroll viewport at the captured pan, so its text is clipped despite data-viewport-fit. Reserve real marker footprints when placing labels and fit disclosures against the intersection of all clipping ancestors. Preserve authored names, map coordinates, keyboard focus, map-list parity and the inspector selection.

Goodall may own CampaignMapRenderer, MapViewport only if a bounded marker scale correction is required, one shared pure core presentation-constant file, CampaignScreen's existing disposal seam, the existing focused renderer/viewport tests, and a dedicated browser geometry test. Record honest REDs first using the shipped 58×50/1024 map and exact Grid 28,23/29,23 overlap at zoom 3.48. Cover Operational and Intelligence layers, opening/detail/max zoom, selected/hover/focus disclosures, all clipping ancestors and label-marker intersections. No campaign state, scenario data, intelligence truth, shell workspace, order, tactical, or save changes.

### FSG-CAM-024 through 026 implemented result

- The site marker remains centered on its authored hex. A co-located contact uses a separate bounded in-cell token, and every marker and hit target is capped from the shared `campaignMapPresentation` zoom contract.
- Generic tile art keeps its authored rotation inside a scale wrapper. Site, base, force and contact symbols use type-specific close-zoom caps, so point-top source art no longer overruns the flat-top lattice or neighboring cells.
- Player-safe geographic labels render above permanent markers, reserve the markers' effective zoom footprint, retain every permitted label, and use a leader when displaced. Their layer remains below transient disclosures.
- Active pointer and focus disclosures refit after pan, zoom, ancestor scrolling, ancestor resize and window resize against the intersection of the SVG, window and every clipping ancestor; rerender or screen disposal disconnects the previous observers and listeners.
- Focused renderer/viewport verification passes 25/25, including rerender/disposal cleanup and non-registered grid leader alignment. The dedicated real-renderer Playwright contract passes 6/6 across Operational and Intelligence modes at zoom 0.714, 1, 3.48 and 7.5, Douvres pointer/keyboard selection parity, player-view immutability, resource loading, computed rotation and clipping-ancestor bounds after pan, scroll and resize.
- Release remains gated on zero-warning lint, independent review, the complete clean R6 sequence and exact deployed external-browser replay.

### Campaign hex-art registration correction — FSG-CAM-027 before edit

The deployed FSG-CAM-024 through 026 treatment correctly repaired entity anchoring, label collisions and disclosure clipping, but it misclassified authored hex-shaped raster art as screen-space marker badges. `MapViewport.updateTransform()` applies an inverse close-zoom scale to `--campaign-map-tile-symbol-scale`, while the map lattice continues to scale with the camera; the painted hex therefore becomes progressively smaller relative to its cell. The same raster sources are point-top hexes, but the shipped campaign lattice is registered flat-top, and `renderSprites()` preserves the source orientation rather than rotating the painted hex into the grid. The result is the exact live mismatch reported by the user.

Correct the presentation contract without changing campaign coordinates, selection, intelligence, map dimensions, scenario data or gameplay. On the registered flat-top map, hex-shaped campaign raster art must rotate 30 degrees about the authoritative cell center. Free-standing tile art must use the cell diameter so its transparent PNG's painted regular hex registers to the lattice. Hex-shaped base and known-site sprites must retain their intended smaller role size but follow map zoom at a constant cell-relative ratio. Selection locators must use the active grid polygon rather than the legacy point-top polygon. Non-hex force, contact, hit-target and disclosure affordances may retain their existing screen-space caps.

Add honest RED/GREEN coverage in the focused renderer, viewport and real-browser geometry suites. Assert one canonical 30-degree lattice orientation even when legacy tile data supplies an authored turn, exact center registration, constant sprite-to-cell ratios from overview through maximum zoom, aligned selection polygons, unchanged pointer/keyboard identity, collision-free labels and fitted disclosures. Run the complete release sequence and verify the deployed production bundle through the connected external browser before closure.

### FSG-CAM-027 implemented result

- Every point-top campaign hex raster now receives one canonical 30-degree registration on the flat-top campaign lattice. Legacy authored rotations cannot flip the outer silhouette back to point-top; non-hex symbols retain their authored facing.
- Free-standing fortification and installation art follows the same camera transform as its cell at a constant cell-relative size. Friendly base and known-site art keeps its smaller role size and the same stable ratio. Non-hex tile, force, contact and marker symbols retain their previous close-zoom caps.
- Each hex raster is wrapped in an SVG clip whose polygon exactly equals its authoritative cell. This contains transparent-canvas and stray alpha pixels without changing geographic or interaction identity. Selection locators use the same active-grid polygon.
- Camera transforms, native viewport scrolling and viewport resizing suppress partially clipped location names and their leaders, leaving only fully readable labels. Geographic text and outlines now share a close-zoom cap so maximum zoom retains readable location context, and each leader endpoint is recomputed against the scaled painted text boundary. `MapViewport.dispose()` releases the new scroll and resize tracking with its existing input listeners when CampaignScreen is disposed, and FSG-CAM-109 proves later state changes cannot recreate the released viewport.
- The review findings were reproduced and closed: the injected 30-degree legacy rotation remains flat-top, isolated PNG alpha sampling proves painted pixels cannot escape the exact cell clip, non-hex intelligence symbols retain their 2.9 close-zoom plateau, clipped labels are not painted after camera, scrollbar or resize changes, and the real Theater overview and repeated zoom-in controls preserve the viewed center and cell-relative sprite ratios through the verified 7.5 maximum.
- Focused TypeScript, zero-warning scoped ESLint, 17/17 renderer/viewport/lifecycle checks, the complete 7/7 real-browser map geometry suite and the real command-control FSG-CAM-108 case pass. The authenticated R6 release validator now requires the expanded 27-case command suite and 7-case map suite. Complete clean release gates, deployment and external production replay remain required before closure.

### Theater-wide tactical battlefield geography — FSG-CAM-028 before edit

The campaign engagement selector currently reduces location to a single `coastal` boolean. A D+1 German strongpoint one operational hex behind Omaha therefore becomes “inland” and selects Hürtgen Forest; airfield raids select Carentan despite that map having no airfield tiles; depot battles may select snow-covered Bastogne. This breaks the campaign map’s geographic promise and the tactical objective’s visual contract.

Implement one deterministic battlefield-geography authority for the shipped `central_channel` theater. It must classify every authored campaign tile, including the full advance corridor from the five beachheads through Cotentin, Saint-Lô, Caen, Falaise, Argentan, Avranches and Rouen. The frozen engagement context records the resulting profile and exact template key. Template selection must require campaign, mission, and geography compatibility; it must fail closed when the theater or profile has no approved map. Existing committed packages retain their already-frozen template identity.

Approved profiles cover beach with bluffs, low coastal beach, flooded lowland/causeway, bocage, open Normandy country, urban approaches, river crossing, port/estuary and airfield. Reuse authored maps only when their actual tile composition supports the profile and objective. Normandy selection excludes snow maps and dense Hürtgen terrain. Omaha supplies beach/bluff and coastal-fortification geometry; Gela supplies low beach and runway geometry; Carentan supplies flooded lowlands and causeways; Falaise supplies Normandy bocage/open/urban maneuver; Arnhem and Remagen supply flat and major river crossings; Anzio supplies port/estuary perimeter geometry. Generated labels remain campaign-generic and player attack/defense orientation must match the engagement regardless of the authored template side.

Impact: `CampaignEngagementContext` gains a typed immutable geography profile; `EngagementContextBuilder` is its sole producer; `battleTemplates` is the compatibility authority; `CampaignBattleGenerator` validates the frozen profile/template pair and generalizes side inversion to the desired campaign role. Save/package hashes naturally include new contexts, while already-frozen legacy contexts continue through their exact template key. No combat, movement, line-of-sight, terrain rules, campaign coordinates, formation commitments, consequence logic or authored standalone mission changes.

Verification: record failing tests for the reported Omaha-Gold strongpoint, all five beachheads, Utah flooded approaches, Orne and Seine crossings, Cherbourg, Caen/Saint-Lô/Falaise/Argentan/Avranches, both airfields and every remaining shipped campaign tile. Assert every tile receives one profile, every selected template contains required geographic/objective terrain, selection is deterministic, snow/Hürtgen never enter Normandy, player attack/defense orientation remains correct, and save identity rejects profile/template drift. Render and inspect representative generated precombat maps for beach/bluffs, low beach, flooded causeway, bocage, open/urban, river, port and airfield. Then run focused campaign tests, campaign and professional UI suites, TypeScript/build, zero-warning lint and the full test suite before production deployment and live external-browser replay.

### FSG-CAM-028 implemented result

- Every one of the 68 playable operational tiles now resolves through one typed Normandy battlefield profile. New campaign packages freeze both that profile and an exact campaign-approved template; an uncovered theater hex or incompatible mission/profile pair fails before tactical planning.
- Omaha and Pointe du Hoc use beach, sea, bluff and coastal-fortification geometry. Utah/Cotentin uses flooded lowlands and causeways. Gold/Juno/Sword use low coastal approaches. The Orne and Seine use bridge maps. Cherbourg and other ports use port/estuary geometry; airfield objectives land on runway cells; the inland corridor uses bocage, open country or urban approaches.
- New Normandy engagements cannot select Hürtgen, Bastogne, Two Bridges, desert or other unapproved geography. Loading also reclassifies older opportunity/planning engagements that have not frozen a force package, so a pre-existing uncommitted plan adopts its current local map. Exact committed packages retain their frozen template and migration path.
- Campaign generation now orients deployment zones, headquarters, objectives and enemy placement from the campaign attacker/defender role even when the reused authored map has the opposite Player role. Campaign objective overrides place named airfield, port and bridge objectives on the matching tactical feature.
- Automated proof covers all operational tiles, actual tactical tile composition, objective feature placement, profile/template drift rejection, formation provenance, save migration and attack/defense orientation. The isolated campaign suite passes 410/410, the professional campaign UI suite passes 183/183 and the clean committed repository suite passes 814/814.
- Real Chromium command-flow checks pass for the Omaha-Gold beach/bluff assault, Douvres low-coastal fortified assault, Cotentin flooded approach and scheduled Caen-Orne river-crossing defense, with screenshots and DOM terrain counts from the generated precombat maps. Production replay of an older uncommitted Douvres plan migrated from a 616-cell Hürtgen field containing 66 snow cells to a 504-cell low-coastal field containing 77 beach, 28 sea, 251 plains and zero snow cells; the browser console remained clear.

### Faction-aware tactical unit names — FSG-CAM-001 before edit

Current behavior: tactical Bot formations intentionally reuse the same deterministic type and combat definitions as Player formations, while the sprite catalog selects German art by faction. Enemy-facing UI copy bypasses any faction presentation and title-cases the shared internal type key, producing labels such as `Infantry 42` beside German infantry.

Expected behavior: known Bot unit types use concise Axis nomenclature consistent with the German sprite/equipment counterpart, while Player and Ally labels, combat data, unit IDs, campaign provenance, reconnaissance disclosure, saves, and results remain unchanged. Unidentified contacts must remain `Enemy Unit`; a presentation label must never reveal persistent campaign formation identity or hidden force truth.

Impact: add a pure data-layer resolver for Bot type labels and use it only at BattleScreen enemy-presentation boundaries (contact intel, attack preview/details, conventional and initiative enemy activity). The resolver is deterministic and state-free. Risks are inconsistent wording across enemy surfaces or accidental relabeling of friendly units; focused semantic tests cover the reported `Infantry_42` contact, representative German armor/artillery/recon/air mappings, hidden-contact behavior, and Player fallback preservation.

### Monotonic repeated combat damage — FSG-CAM-001 before high-risk edit

Intended behavior: when attacker type, range, strength, stance, target type, and expected hits are identical, a later strike against the same increasingly damaged formation inflicts at least the first strike's readiness loss until the target has less readiness remaining than that baseline. Existing wounds make personnel and equipment more vulnerable to further effects; only the target's terminal remaining readiness may cap the result.

Current behavior: damage outcomes are absolute destinations. `PERSONNEL_TRANSITIONS` and `EQUIPMENT_TRANSITIONS` reapply a wound or damage result to existing degraded pools with very small exposure weights, while readiness measures only the effectiveness removed from the source state. Identical hit pressure therefore removes less readiness as the fit/operational pools empty. `resolveDamagePacket` previews that taper accurately, and `applyDamagePacketToUnit` then reconstructs state from aggregate destination counts instead of treating the resolver's source→target transitions as authoritative. Existing repeat-strike assertions permit a 15–30% collapse, one test explicitly expects later taper, and that sequential test is absent from the main runner.

Expected correction: resolved combat outcomes advance each affected member or equipment item by the outcome's severity relative to its source state, allocate each item at most once per packet, and select transitions by actual readiness removed so accumulated injury cannot provide protection. The packet reports the actual resulting destination counts and exact source→target transitions; applying a resolved packet replays those transitions, while legacy/manual packets without transitions keep their existing absolute-destination semantics. Per-weapon attribution falls back to the contributing hit pressure when a promoted destination had no raw same-destination weight.

Edge cases: preserve deterministic integer allocation across multiple personnel/equipment pools; never transition killed/destroyed items; never apply more outcomes than living/non-destroyed capacity; avoid hitting one entity twice within one packet; preserve manual packet/setup compatibility; keep preview and committed status/readiness identical; cap only by remaining readiness at force collapse; preserve suppression, fortification, armor, attack accuracy, ammunition, retaliation, persistence schema, and UI consumers.

Impact analysis: `GameEngine.previewAttack`, attack resolution, AI targeting, BattleScreen expected-outcome copy, activity/AAR casualties, save/resume state, and campaign consequence calculations consume `DamagePacket.readinessLoss`, aggregate deltas, or the mutated formation status. No event or public packet schema changes are planned; existing optional `statusTransitions` becomes authoritative for resolved packets. The visual shape is unchanged, but projected loss numbers and source→target explanation text will rise on later identical attacks. Risk is highest in packet/application parity, weapon-hit attribution, platform equipment readiness, multi-pool formation allocation, and terminal overkill. Verification adds a pre-fix-failing deterministic sequential replay, tightens the unit damage matrix invariants, registers the replay in the standard suite, and runs focused, campaign, build, zero-warning lint, and full test gates.

### Tactical casualty burden, separation, and recovery

Scope: wounded personnel and damaged or disabled equipment remain with their tactical formation by default. A player may order all recoverable casualties left at the formation's current hex; a formation that breaks and routs does this automatically before retreating. Killed personnel and destroyed equipment remain permanent losses and never enter a recovery site. Sites do not occupy stacking capacity, are visibly marked on the tactical map, survive save/resume, and are erased with all pending and staged recovery when a hostile ground unit enters the hex.

Mobility: leg formations multiply their movement allowance by `1 - wounded-survivor ratio`; wheeled, truck, and tracked formations use `1 - damaged-or-disabled surviving-platform ratio`. Permanent losses are excluded from both denominators. Fractional allowance is banked deterministically between activations so a 10% burden is exactly 10% slower over time and a 90% burden is exactly 90% slower rather than being rounded back to a free hex. The existing difficult-terrain first-step guarantee remains only for formations with no casualty burden.

Care and reconstitution: medical and maintenance detachments remain physical map units. They select a viable casualty demand, path toward the site's service radius, consume ordinary movement/fuel, and apply only their authored treatment or repair capacity. Returned-to-fit personnel and returned-to-operational equipment form a new battle-local detachment at the site with readiness proportional to the recovered complement; blocked stacking stages the output until space becomes available. The new unit has no campaign identity, ammo, or fuel and cannot act on the formation turn in which it appears.

Campaign boundary: campaign results aggregate surviving sites, staged recoveries, and battle-local recovered detachments back into the one original committed formation solely for accounting. If a proper same-faction medical or maintenance support unit survived the battle, its corresponding recoverable casualty categories are fully recovered at battle end. Unsupported wounded/damaged states persist, overrun site contents remain lost, and no tactical recovery site or detachment becomes a new campaign formation.

Integration and verification: recovery state is included in complete tactical serialization, logistics projections, initiative and conventional movement, Bot/Ally movement, assaults, routs, terrain intel, command UI, map rendering, campaign extraction, and deterministic event evidence. Regression coverage includes exact 10%/90% mobility, permanent-loss exclusion, manual separation, rout separation and retreat, save round-trip, hostile overrun, physical medical and maintenance movement, proportional personnel/equipment detachments, campaign support recovery, and campaign formation-count conservation.

### Non-finite Bot plan scores — AUD-005

Implemented result (2026-09-17): reproduced the passing-run defect with the complete tactical-save fixture and traced it to `calculateThreatProjection`: shipped `Infantry_42` intentionally has no legacy top-level `ap`, so `def.ap * 0.7` changed a finite `{ expectedDamage: 0.17, expectedRetaliation: 0.03 }` estimate into `NaN`. The threat projection now treats absent top-level AP as zero. `planHeuristicBotTurn` rejects non-finite final candidates before publication and sorting, and both Bot and Ally execution paths independently filter non-finite plan scores before prioritization, logging, or mutation. The boundary uses `Number.isFinite`, so finite negative scores and their deterministic ordering remain valid.

Regression evidence: the registered shipped-infantry characterization requires a nonempty finite plan, one executed attack, and finite-only Bot plan logs; boundary characterization rejects `NaN`, `+Infinity`, and `-Infinity` while retaining a legitimate negative score. Direct coverage passes **2/2**, broader Bot-planner/save integration passes **18/18**, and the campaign suite passes **414/414** with both former `NaN` lines now logging `88.6`. Strict TypeScript, owned zero-warning lint, repository gates, and diff validation pass. `GameEngine.ts` remains at its 18,449-line ceiling; no RNG, combat estimate, movement, ammunition, initiative, event, or mutation ordering changed.

### Core-module regression multiplier — AUD-009 architecture slice before high-risk edit

Current behavior: `BattleScreen.ts` owns mission-outcome calculation, unit-loss aggregation, ammunition estimation, objective summarization, air-operations aggregation, engine access, roster persistence, and DOM orchestration in one class. It directly calls `BattleState.ensureGameEngine()` 76 times. The repository has written separation rules, but no executable size or UI-to-engine import gate, so the three largest modules can keep growing while ordinary build/lint/tests remain green.

Intended behavior: mission reporting becomes a deterministic game-layer capability. `BattleState` exposes one immutable mission-reporting snapshot instead of requiring the reporting path to inspect `GameEngine`; `BattleScreen` only supplies presentation-owned title/status and persists the returned record. A build-time architecture verifier ratchets current core-file line counts, the remaining direct engine-access count, and the exact existing UI-to-engine import allowlist. New coupling or growth fails the production build until accompanied by an extraction and a lower baseline.

Impact analysis: mission completion, headquarters handoff, general service records, mission history, air-loss accounting, ammunition estimates, and objective totals consume this slice. No combat, campaign, save, mission-rule, air-resolution, roster schema, DOM, or player-facing behavior changes are authorized. `BattleState` owns cloning at the engine boundary; the extracted assembler is pure and deterministic except for the explicit completion timestamp supplied by its caller.

Edge cases and regression risk: missing engine returns no mission record and zero casualty fallback; empty supply history returns zero ammunition; only resolved Player air reports count; refit entries remain excluded; reserve aircraft still count as live; objective tiers retain exact completed/total semantics; unit losses never go negative; terminal and manual/in-progress mission outcomes retain existing copy. Characterization tests cover the pure assembler and the existing BattleScreen mission-history path. Focused tests, architecture verification, TypeScript/build, zero-warning lint, campaign tests, and the complete suite are required.

Implemented result (2026-09-17): extracted deterministic mission reporting to `src/game/battle/reporting/BattleMissionReport.ts`; added the detached `BattleState.getMissionReportingSnapshot()` boundary; extracted damage and generic activity formatting into presentation modules; and moved screen-only operation contracts into `src/contracts/BattleScreenContracts.ts`. `BattleScreen.ts` fell from 15,484 to 14,995 lines and direct `ensureGameEngine()` calls fell from 76 to 74. `tools/verify-architecture.mjs` now gates the production build against six core-file ceilings, the direct-access ceiling, and the exact 11-pair grandfathered UI-to-engine import set. Verification: focused reporting/presentation 21/21, campaign 414/414, complete suite 833/833, architecture PASS, production build PASS with the pre-existing missing-large-explosion and chunk-size advisories, and zero-warning lint PASS.

### Core architecture continuation — supply, map markup, and tactical-save seams

Current behavior: three high-risk coordinators still own deterministic calculation or UI session responsibilities that do not require their mutable cores. `GameEngine.ts` computes supply categories, trends, alerts, and display timestamps inline; `HexMapRenderer.ts` builds deterministic terrain/fringe SVG strings alongside DOM lifecycle and animation; `BattleScreen.ts` owns roughly 300 lines of tactical-save-center subscriptions, polling, persistence commands, and browser state even though save serialization and reconstruction already have dedicated services. The current architecture gate prevents growth, but these responsibilities still enlarge review blast radius.

Intended behavior: extract three behavior-preserving vertical slices. A pure `BattleSupplySnapshot` builder receives explicit immutable battle facts while `GameEngine` retains history mutation and observation selection. A pure `HexMapMarkupBuilder` produces exactly the existing terrain and fringe SVG while `HexMapRenderer` retains DOM mutation, caches, recon, effects, and renderer instances. A `BattleTacticalSaveController` owns save-center lifecycle and persistence session orchestration through narrow callbacks while `BattleScreen` retains complete-state capture and resume reconstruction. `BattleState` exposes a detached turn projection so the save controller never receives a `GameEngine` reference.

Consumers and events: supply snapshots feed BattleState caches, War Room, popup/reserve logistics, saves, and campaign/tactical reporting; their order, copy, trend, alert, and timestamp contracts must remain exact. Map markup feeds the SVG viewport, hex interaction cache, terrain overlays, engineering overlays, and visual tests; attribute names, clip IDs, iteration order, and asset resolution must not move. Tactical-save orchestration feeds save-center models, queued-write polling, autosaves, load/recovery, focus restoration, navigation, and announcements; subscription count and async ordering must remain exact.

Edge cases and regression risk: supply current reads omit the newest recorded sample from their comparison baseline; top-level inventory totals and rounded category depot totals intentionally differ; no-consumption status can override low-stock severity; Bot snapshots append recon-confidence copy; returned data must remain detached. Fringe generation depends on `Set` and axial-direction order; beach-water orientation and five-ring noninteractive fringe must remain deterministic; renderer services must not be duplicated. Tactical save must not double-subscribe or leak intervals, load during a write, lose invoker focus, read stale campaign truth after awaits, reorder resume/navigation/close/announce, or move serialization/reconstruction in the same refactor.

Verification: add direct pure-builder/controller characterization tests, retain existing supply/history/hydration, renderer double-render/terrain, and tactical-save/resume/disposal suites, lower all three line ceilings and add a `tryGetGameEngine()` coupling ceiling, then run focused tests, architecture verification, TypeScript/build, zero-warning lint, campaign tests, and the complete suite. This is structural refactoring only; gameplay, copy, save format, rendering output, and timing remain unchanged.

Implemented result (2026-09-17):

- Added cycle-free battle runtime contracts and the pure `BattleSupplySnapshot` builder. `GameEngine` retains authoritative history mutation and sample selection, then delegates projection. Direct tests lock category order, trend/no-consumption precedence, Bot intel copy, deterministic timestamps, rounding behavior, and detached ledger data.
- Added the pure `HexMapMarkupBuilder` and kept DOM lifecycle, viewport, cache, recon, interaction, effects, and renderer-service ownership in `HexMapRenderer`. Tests lock terrain metadata/features, all six beach-water rotations, deterministic noninteractive fringe, and the repeated-render DOM boundary.
- Added `BattleTacticalSaveController` and a detached `BattleState.getBattleTurnSnapshot()` boundary. Save-center subscriptions, queued-write polling, browsing, recovery, and autosave orchestration no longer live in `BattleScreen` and the controller has no `GameEngine` import. Complete-state capture and resume reconstruction remain in the screen as planned.
- Lowered the ratchets to `GameEngine.ts` 18,604 lines, `HexMapRenderer.ts` 15,782, and `BattleScreen.ts` 14,686. `BattleScreen` direct access is capped at 74 `ensureGameEngine()` and 3 `tryGetGameEngine()` calls.
- Extended the architecture verifier from file/import counts to TypeScript-AST method budgets. The build now enforces 10 file ceilings, 2 coupling ceilings, the exact 11 grandfathered UI-to-engine imports, 63 exact inherited oversized-method ceilings, and a 120-line ceiling for every new method or module function.
- Verification passed: integrated focused regressions 27/27, campaign 414/414, complete suite 842/842, architecture verification, TypeScript, production build, and zero-warning lint. The production build still reports the pre-existing unresolved `FSG_Explosion_Large.png` reference and oversized main-chunk advisories; neither was in this structural slice.

### Core architecture continuation — support commands, public UI contracts, and air-show planning

Current behavior: the no-growth ratchet now prevents the largest coordinators from expanding, but `BattleScreen` still reaches into the engine repeatedly to calculate support-command availability and targeting; reserve/popup UI modules still import concrete engine modules; and air-show planning/rendering retains multi-hundred-line methods that combine deterministic geometry with mutable playback ownership. The file budgets are exact today, but the verifier does not yet require a lowered file budget when a tracked file shrinks, so an improvement could be accidentally surrendered later.

Intended behavior: move support targeting and command availability behind a typed projection/controller seam while `BattleScreen` retains interaction and presentation ownership. Introduce cycle-safe public battle contracts so reserve and popup UI consumers depend on narrow data/command capabilities rather than the concrete engine module. Extract one characterized deterministic air-show calculation into a pure module while renderer/planner lifecycle and DOM mutation stay in their existing owner. Make every tracked file budget bidirectional: growth fails, and shrinkage also fails until the baseline is lowered to lock the improvement.

Consumers and events: support actions feed selection intel, target highlighting, confirmation, announcements, activity logs, and queued support resolution. Reserve and popup surfaces consume snapshots, previews, reports, and command callbacks, but must not gain mutable engine ownership. Air-show calculations feed phase assignments, actor continuity, paths, timing, tracers, flak, and destruction cues; exact actor identity and phase ordering must remain stable.

Edge cases and regression risk: unavailable support must retain its exact actionable reason and must never expose hidden contacts; stale selection or faction/phase changes must fail closed before a command is queued. Public contracts must preserve structural typing without introducing a dependency cycle or broad `any` escape hatch. Air-show extraction must preserve deterministic output, formation spacing, headings, phase joins, and loss continuity. Constructor-bypassing test fixtures must receive explicit dependencies instead of making production initialization optional.

Verification: add direct characterization tests for every new boundary, register them in the complete suite, lower file/import/method budgets immediately, and run focused tests, architecture verification, strict TypeScript, zero-warning lint, campaign tests, production build, and the complete registered suite. No gameplay, copy, DOM, persistence schema, serialized identity, or animation timing change is authorized in this tranche.

Implemented result (2026-09-17):

- Added cycle-safe `BattleRuntimeContracts` and pure `BattleSupportTargeting`. `BattleState` now owns support command forwarding and returns detached support, smoke-target, impact, command-state, and Bot-unit projections. Boundary tests assert all command arguments and detachment paths.
- Added the cycle-safe `BattleSidebarEngine` contract and cached state-owned `BattleSidebarEngineFacade`. Popup/reserve consumers receive detached readonly models and exact delegated commands rather than concrete mutable `GameEngine` identity. Removed the unreferenced 3,138-line duplicate `ReserveList.ts`/`PopupManager` implementation after proving it had no production references.
- Added pure `AirShowTimelineInspection`; `HexMapRenderer` delegates deterministic inspection/playback projection while retaining mutable playback and DOM ownership.
- Tightened the ratchets to `GameEngine.ts` 18,516 lines, `HexMapRenderer.ts` 15,580, `BattleScreen.ts` 14,641, 63 direct `ensureGameEngine()` calls, 3 `tryGetGameEngine()` calls, 15 bidirectional file budgets, 62 inherited oversized-method budgets, and 8 grandfathered UI-to-engine import pairs. A tracked-file reduction now fails until its baseline is lowered.
- Hardened the architecture scanner against `.tsx`, re-export, import-equals, and literal dynamic-import bypasses. Added gate self-tests, including an exact-pair allowlist check.
- Verification passed: support boundary **4/4**, sidebar facade/contract **2/2**, air-show inspection **2/2**, animation fixtures **10/10**, gate self-tests, architecture, TypeScript, zero-warning lint, production build, campaign **414/414**, and complete suite **850/850**. Gameplay, copy, persistence, serialized identity, and animation timing remain unchanged.

### Missing large-explosion asset reference — release advisory cleanup

Current behavior: `SpriteSheetAnimator` registers a 24-frame `explosionLarge` sheet at a path that does not exist. The only production branch that appears to select that animation returns earlier into the characterized five-impact bomb-stick path, while tests explicitly require large explosions to avoid the obsolete animation. A layout test nevertheless mocks the missing sheet and makes the dead registry entry appear valid, so Vite warns on every production build.

Intended behavior: remove the nonexistent asset URL and obsolete registry entry, retain the real small-impact bomb-stick behavior, and convert the false layout characterization into a contract that the runtime registry cannot advertise the missing large sheet. Do not substitute the unrelated eight-frame `explosion_large.png`, change impact timing, or alter active combat visuals. Verify focused sprite/combat animation tests, TypeScript, lint, build, and the complete suite.

Implemented result (2026-09-17): removed the nonexistent URL, registry entry, timing helper, and dead procedural-effect case while preserving the characterized five-small-impact bomb-stick path. Replaced the mocked missing-sheet layout test with a registry absence contract. Added a source/public asset verifier covering 348 explicit import-meta, composed unit/formation/directional sprite, runtime JSON, public audio, and sound-catalog references, plus self-tests for the former bypass classes. The production build no longer reports the missing asset; its only remaining Vite advisory is the oversized main chunk. TypeScript, zero-warning lint, build, campaign **414/414**, and complete suite **850/850** pass.

### Core architecture continuation — air-show phases, attack resolution, and campaign shell

Current behavior: the ratchet now prevents growth, but three extreme methods still make unrelated changes expensive. `planResolvedAirCombatShowScene` owns 5,956 lines of actor construction, timing, geometry, phase composition, tracers, flak, loss cues, and audit data. `GameEngine.resolvePlayerAttack` and `resolveBotAttack` each mix command validation, resource mutation, shared combat calculation, damage application, retaliation, activity events, initiative, and mission aftermath. `CampaignScreen.renderCommandShell` owns 840 lines of workspace selection, projections, DOM assembly, accessibility state, event binding, focus, and report-modal routing.

Intended behavior: extract one independently characterized deterministic seam from each coordinator without changing gameplay or presentation. Air-show work must move a coherent phase/projection builder behind explicit immutable inputs while retaining canonical actor identity, path, timing, and cue ordering. Combat work must move shared calculation/event projection behind a pure battle-domain service while `GameEngine` retains authoritative mutation and transaction order. Campaign work must move one complete command workspace projection/markup/binding responsibility into a typed presentation module while `CampaignScreen` retains state ownership, navigation, and lifecycle.

Consumers and events: the air-show scene feeds renderer playback, capture, diagnostics, and loss continuity. Attack resolution feeds preview parity, damage/status transitions, ammunition, retaliation, initiative, activity logs, saves, campaign extraction, and mission results. The campaign shell feeds Situation, Operations, Forces, Intelligence, Logistics, Reports, order tray, AAR, keyboard/focus behavior, and map selection. Extraction boundaries must not reorder RNG, mutate detached inputs, introduce UI-to-engine imports, or conceal required state transitions.

Regression strategy: characterize every extracted function directly and retain the existing end-to-end consumers. Lower file and oversized-method budgets immediately; never increase a ceiling. Constructor-bypassing tests receive explicit dependencies. Run focused direct tests, relevant integration suites, repository-gate self-tests, architecture and asset verification, strict TypeScript, zero-warning lint, production build, campaign **414/414**, and the complete registered suite on the combined final tree.

### Campaign command shell — Reports and formation-roster projection results (2026-09-17)

- Extracted the complete after-action Reports workspace projection into `CampaignReportsWorkspaceProjection.ts`. The module receives immutable reports and narrow lookup/format callbacks; it has no `CampaignState`, DOM, or `GameEngine` dependency. `CampaignScreen` still owns state reads, historical-location resolution, map/navigation callbacks, modal/focus lifecycle, and the single shell render call.
- Preserved report titles and geography validation, checkpoint status, resource/loss/score copy, infrastructure and naval effects, formation identity/effects, objective changes, decision filtering/routes, array order, and unescaped text-as-data consumed by the shell's safe DOM builders. The existing formation-effects export remains source-compatible through `CampaignScreen`.
- `CampaignScreen.ts` fell from 5,284 to 5,156 lines (−128). `CampaignScreen.renderCommandShell` fell from 840 to 747 lines (−93). The new pure presentation module is 192 lines; its largest function is 90 lines, below the 120-line new-method limit. All three exact ceilings are ratcheted.
- Direct Reports projection characterization passes **1/1**; actual CampaignScreen report refresh, acknowledgement, map/recovery routing, modal keyboard/focus restoration, disposal, and scoring pass **12/12**; accessible archive, safe text, condition evidence, and named-sector integration pass **3/3**; the campaign-wide suite passes **414/414**.
- Extracted persistent formation identity, posture, placement, condition, availability, history, and capacity-record filtering into the typed pure `CampaignFormationRosterProjection.ts`. `CampaignScreen` retains the authoritative roster read plus location, historical-battle, and time-format callbacks; DOM, accessibility, selection, navigation, focus, order state, and event ownership remain unchanged.
- The second seam lowers `CampaignScreen.ts` from 5,156 to 5,105 lines (−51) and `CampaignScreen.renderCommandShell` from 747 to 695 lines (−52). The new projection is 116 verifier lines and is ratcheted. Direct detached-input coverage plus the actual canonical Forces workspace and formation-selection/order integrations pass **3/3**; strict TypeScript, owned zero-warning lint, repository gates, architecture, asset verification, and diff validation pass.

Attack-resolution result (2026-09-17): extracted the four duplicated air-result multiplier paths into the cycle-free pure `AirAttackResultScaling` battle-domain module. Tactical player attacks, tactical Bot attacks, retaliation, resolved strike missions, and Bot strike estimation now share the same explicit aircraft/bomber/defender classification contract. `GameEngine` still owns classification, every RNG call, ammunition/resource debit, state mutation, initiative, event publication, and transaction ordering. The engine fell by 67 lines (18,516 to 18,449); `resolveAirStrikeMission` fell by 17 (551 to 534), and both `resolvePlayerAttack` and `resolveBotAttack` fell by 14 (727 to 713 and 657 to 643). Direct characterization locks bomber-to-ground ×10, fighter-to-air ×4, unchanged bomber-to-air and ground-to-ground identity, and input immutability; existing strike, interception, Bot-air, stance, sequential-damage, and campaign regressions remain the integration certificate.

Air-show phase projection result (2026-09-17): extracted deterministic phase inspection, assignment sampling, tracer geometry projection, flak target precedence/wave projection, visible-actor continuity, and timing audit construction into the pure `AirShowPhaseProjection`. Shared planner/projection types and host capabilities now live in the cycle-free `AirShowPhaseProjectionContracts`; the projection no longer imports the planner, while planner type re-exports preserve compatibility. The planner still owns phase sequencing, actor/flight mutation, seeded choreography, loss application, and assignment commits. `AirShowPlaybackPlanner.ts` fell from 6,376 to 6,101 verifier lines (−275), and `planResolvedAirCombatShowScene` fell from 5,956 to 5,782 lines (−174); both exact ceilings were lowered. The 269-line projection (largest function 64) and 125-line contracts module are ratcheted. The remaining largest nested responsibility is `finalizeCorridorPhaseAssignments` at 752 lines inside the 4,309-line `buildCorridorContestedAirShowPlan`. Direct phase/speed/capture regressions passed **15/15**, renderer air-show visual regressions passed **8/8**, and repository gates, strict TypeScript, owned zero-warning lint, and diff validation passed. Actor IDs, coordinates, sample timing, semantic phase/cue order, inactive-loss visibility, deterministic output, RNG ownership, and diagnostics remain unchanged.

Air-show spatial gate result (2026-09-17): reproduced the inert `AIR_SHOW_SPATIAL_SEPARATION_REPORT` result at **96% / 2.6px** overlap with **331** reported proximity events. The root cause was formation members alternating scramble-turn sides and folding through one another; the report also overstated overlap by assuming every aircraft used a 60px sprite and comparing different painted times in coarse 50ms buckets. Fighter formations now keep one coherent deterministic fold while escorts target a faction-separated lane before rejoining the bomber screen. The enforced gate compares exact painted frames using each actor's rendered size and fails above **75%** overlap, below **25% of the smaller sprite diameter**, or above the **41-event** ratchet at 40% overlap. Its only exclusions are semantic attack crossings between opposing actors during the head-on merge, fighter combat, or bomber interception. The final non-exempt worst case is **75% / 11.6px**, with **41** notable events. Actor/loss identity, seeded RNG ownership, phase and cue order, role-speed budgets, tracer/flak/bomb behavior, and leader turn-mask selection remain unchanged. Legacy phase-aggregate diagnostics were migrated to exact immutable timeline-v2 tracks and cues for bomber-specific turn findings, clash timing, tracer origin/aim, target-run/egress continuity, flak flash/smoke timing, and continuous visibility. The complete diagnostics pass **84/84**, renderer visuals pass **8/8**, the anomaly report has no findings, and seven visually reviewed Chromium painted-frame baselines pass **7/7** at deterministic current desktop, large-map, and mobile dimensions.

### Campaign startup lazy-loading boundary

Current behavior before this slice: `main.ts` imported and constructed the campaign screen eagerly even for landing and direct tactical startup. That pulled the strategic screen, campaign renderer, scenario data, and campaign map asset into the initial browser chunk and coupled campaign initialization to unrelated entry paths.

Intended behavior: campaign code must cross one explicit asynchronous bootstrap boundary and load only when the player enters campaign mode. Preserve the synchronous `LandingScreen.attachCampaignScreen` integration once loaded, the singleton `CampaignState`, auth gating, direct `?mode=campaign` entry, battle resume, and campaign-to-precombat handoff. Multiple clicks or entry signals must share one in-flight import, and a load failure must leave a deliberate recoverable state rather than silently booting an incomplete screen.

Implemented result (2026-09-17): added `CampaignScreenBootstrap.ts` as the campaign construction boundary, changed `main.ts` to memoize its dynamic import, and added a deduplicated async campaign loader to `LandingScreen`. Landing and tactical startup no longer eagerly load the strategic screen stack. The final integrated build is **2,635.80 kB / 647.39 kB gzip**, down **426.58 kB raw / 111.69 kB gzip** from the historical **3,062.38 kB / 759.08 kB gzip** baseline (approximately **13.9% / 14.7%**). Campaign code now ships as a **428.16 kB / 112.70 kB gzip** on-demand chunk. Direct lazy-route characterization passes **4/4**; real Chromium direct campaign entry and campaign-to-tactical geography both pass. Build, TypeScript, zero-warning lint, repository gates, asset verification, and static chunk-cycle verification pass. The next delivery slice is an explicit async boundary around the still-eager battle, War Room, and air-show stacks.

### Tutorial objective rail state consistency

Current behavior: an unoccupied tactical point is emitted with authoritative `data-state="inProgress"`, but the same objective card visibly and accessibly labels it `Open`. The governed tutorial requires `In Progress` or `Secured`, so the first-session acceptance journey fails despite the underlying state already being correct.

Intended behavior: the visible status, `aria-label`, title, and `data-state` must agree. Unoccupied actionable tactical points remain in progress; player-held secured points remain `Secured`; defender-only visited-state wording and enemy-held recapture wording remain unchanged. This is presentation-only and must not change objective ownership, mission rules, victory, movement, marker geometry, or persistence.

Regression strategy: update the actual objective-summary characterization to require `In Progress` for an unoccupied in-progress point, retain marker/defender objective suites, and rerun the tutorial-focused contract, TypeScript, lint, build, campaign, and complete suite. The external three-viewport browser certificate remains a separate deployment gate.

The governed local Chromium replay subsequently passed wide desktop and desktop, then exposed a separate compact-layout collision: the 44px activity-log toggle is restored by the later responsive drawer rule, but the mobile header overrides the base toggle clearance with only 0.5rem right padding. At 390px the visible toggle occupies the same horizontal command lane. Preserve the reachable activity drawer and reserve its full 44px target plus a gap in the mobile header; do not hide the control or relax the geometry assertion. Retain failure-only geometry evidence in the acceptance helper and rerun all three viewports.

After clearing that collision, the same real mobile journey exposed the open activity drawer intercepting the first map order. Desktop intentionally opens the side-by-side log after deployment, but the compact layout presents it as a map-covering drawer. Start the compact drawer collapsed while retaining its visible 44px toggle; desktop keeps the existing expanded behavior. Add a direct responsive orchestration regression and continue the governed mobile journey without force-clicking through the overlay.

Implemented result (2026-09-17): the unoccupied objective's player-facing state now reads `In Progress` instead of `Open`, with its visible label, `aria-label`, title, and authoritative `data-state="inProgress"` in agreement. The compact battle header reserves right padding for the visible 44px activity-log toggle. `BattleActivityLog.show` accepts an initial collapsed state, and battle-start orchestration now matches the actual CSS overlay breakpoint: the map-covering drawer starts collapsed through 980px, including intermediate tablet widths, while viewports above 980px preserve the expanded desktop presentation. The direct regression exercises the real activity-log host and toggle state at 390px, 800px, and 1024px. The browser acceptance helper captures failure-only geometry diagnostics without weakening its collision assertions.

Certification status: the final integrated tree passes the complete governed local Chromium tutorial at **1680×857, 1440×900, and 390×844 (3/3)**. This includes every command step and rail mini-tutorial after the objective semantics, compact header, 980px drawer breakpoint, cycle-free air-show contracts, and finite Bot-score corrections. Exact public-deployment replay remains a separate release gate.

### Tactical runtime lazy-loading boundary (2026-09-19)

Current behavior before this slice: campaign entry was lazy, but `main.ts` still imported and constructed BattleState, precombat, BattleScreen, War Room, map rendering, tutorial, and related tactical infrastructure during every landing-page boot. The production initial script remained **2,635.80 kB / 647.39 kB gzip** even for a player who had not requested tactical play.

Implemented result: `TacticalBattleFlowBootstrap.ts` now owns tactical construction behind the narrow `TacticalBattleFlow` contract. A retryable memoized loader deduplicates concurrent requests and clears failed imports for a later retry. Landing training/mission entry, campaign-to-precombat bridge, saved-battle hydration, and direct air-show test routes await the same initialized flow. BattleState remains a singleton; the campaign handoff keeps its two-animation-frame sequencing; `setMissionStartedUI`, synchronous test attachment, auth gating, transition feedback, and boot-ready semantics remain intact.

The final initial script is **80.38 kB raw / 21.61 kB gzip**, a reduction of **2,555.42 kB raw / 625.78 kB gzip** from the campaign-only split. Tactical code is deferred into a **363.96 / 79.40 kB** bootstrap, **764.40 / 178.20 kB** shared map/runtime chunk, and **1,431.04 / 372.55 kB** BattleScreen chunk. Production verification requires a distinct tactical bootstrap chunk, rejects an initial script above **100 KiB raw**, and retains static chunk-cycle detection. Focused lazy lifecycle tests pass **7/7**; real Chromium passes landing-to-training, direct campaign/auth entry, campaign-to-precombat, and full direct air-show harness playback **4/4**.

### Air-show corridor finalizer extraction (2026-09-19)

Implemented result: the former 752-line nested `finalizeCorridorPhaseAssignments` responsibility now lives in the cycle-free `AirShowCorridorPhaseFinalizer.ts` behind explicit immutable input, typed services, and typed geometry capabilities. Phase-specific helpers preserve prepare/alignment/pacing/speed-restoration/separation order without recreating a replacement mega-method. `AirShowPlaybackPlanner` retains seeded RNG, semantic phase composition, actor/loss identity, cue ownership, and final assignment commits.

`AirShowPlaybackPlanner.ts` fell from **6,101 to 5,365** lines (−736), and `planResolvedAirCombatShowScene` fell from **5,782 to 5,058** lines (−724). The 648-line finalizer is itself ratcheted. Direct deterministic, immutability, actor-order/loss-continuity, and pipeline-order characterization adds two registered tests. Air diagnostics pass **86/86** with the governed result unchanged at **75% / 11.6 px / 41 events**; renderer visuals remain **8/8** and the seven painted-frame baselines remain unchanged.

### Campaign Intelligence workspace extraction (2026-09-19)

Implemented result: `CampaignIntelligenceWorkspaceProjection.ts` now owns the complete pure player-safe Intelligence projection for known sites, regions, contacts, brief history, capacity, and strategic geography. It receives authorized snapshots plus narrow location/format callbacks and returns detached arrays. `CampaignScreen` retains every authoritative state read, DOM/event/focus/navigation responsibility, and command-shell lifecycle.

`CampaignScreen.ts` fell from **5,105 to 5,017** lines (−88), while `renderCommandShell` fell from **695 to 633** lines (−62). The new 199-line projection is ratcheted. Direct projection/detachment and real-screen integration pass **4/4**; the final integrated campaign certificate passes **418/418** and the complete registered suite passes **864/864**.

### Single-authority combat, Logistics, and War Room continuation (2026-09-19)

Intended behavior: reduce the cost of changes in `GameEngine`, `CampaignScreen`, and the tactical UI boundary without creating competing sources of truth. Every moved rule must have one canonical owner. The old inline implementation, direct-engine fallback, or duplicate cache must be deleted in the same slice; pure projections may detach and format explicit inputs but may not own mutable game state.

Implemented combat result:

- Added the cycle-safe `BattleAttackOutcomeProjection.ts` as the canonical pure assembler for player attack summaries, Bot attack summaries, and combat-report payloads.
- `resolvePlayerAttack` and `resolveBotAttack` each delegate exactly once. Their former inline output/report assembly is absent and source-characterized.
- `GameEngine` remains the sole authority for validation, RNG order, ammunition/resources, damage mutation, retaliation, initiative, aftermath, and event publication.
- `GameEngine.ts` fell from **18,449 to 18,356** lines; `resolvePlayerAttack` fell from **713 to 707**; `resolveBotAttack` fell from **643 to 632**. The new module is ratcheted at 206 verifier lines.

Implemented campaign result:

- Added `CampaignLogisticsWorkspaceProjection.ts` as the canonical detached projection for command resources and held capacity, production capability, air power, exact naval-source authority, and ordered per-hex Logistics copy.
- `CampaignScreen` remains the only reader of `CampaignState` for this view and retains DOM composition, interaction, focus, navigation, and command-shell lifecycle.
- Naval readiness is never inferred from `economy.navalPower`; a disagreement regression proves the supplied naval-support view is authoritative.
- `CampaignScreen.ts` fell from **5,017 to 5,008** lines and `renderCommandShell` from **633 to 623**. The new projection is ratcheted at 113 verifier lines.

Implemented War Room result:

- Added the cycle-free `BattleWarRoomSnapshot.ts` contract and state-side `BattleWarRoomSnapshotProjection.ts`.
- `BattleWarRoomDataProvider` now performs one `BattleState.getWarRoomInputSnapshot()` read and has no direct `GameEngine`, readiness, precombat, campaign-bridge, or fallback read.
- The snapshot detaches turn, roster, reserves, damage, reconnaissance, combat/air reports, logistics, supply, mission, and frozen campaign timing while preserving provider subscriptions and directive behavior.
- Removed the unused `supplySnapshotByFaction` parallel cache. `supplySnapshotCache` is the sole cache/reset path, and a zero-count architecture budget prevents the removed authority from returning.
- `BattleState.ts` fell from **688 to 680** lines; the UI-to-engine allowlist fell from **8 to 7** pairs. The new contract/projection are ratcheted at 115/46 verifier lines.

Regression result: direct boundary tests cover output parity, input/output detachment, exactly-once delegation, authoritative naval disagreement, War Room campaign timing, subscription disposal, cache reset, and fallback rejection. The final integrated campaign suite passes **422/422**, the complete registered suite passes **870/870**, strict TypeScript and zero-warning lint pass, all repository/asset/architecture gates pass, and the production build verifies a **80,404-byte** initial script with a lazy tactical chunk and no static chunk cycles. Six Campaign command-shell Chromium viewport checks pass. The obsolete War Room query-route check was replaced by a shipped-DOM component certificate that validates every authored hotspot's unique identity, accessible label, visibility, non-zero geometry, and layer containment; it passes **1/1**.

### Canonical Situation, unit-stack, and air-contract continuation (2026-09-19)

Intent: continue reducing regression blast radius without moving mutable game authority or allowing a second implementation to survive beside an extraction. Each slice must delete the former inline path, receive immutable/detached inputs, preserve compatibility where required, and gain an executable ownership or parity guard.

Implemented Campaign Situation result:

- Added `CampaignSituationWorkspaceProjection.ts` as the canonical pure projection for objectives, priority-force hexes, command priorities, front posture, counterattack stage, alerts, timeline, Situation brief/outlook, score/grade, and latest checkpoint.
- `CampaignScreen` retains all authoritative `CampaignState` reads and all DOM, event, focus, navigation, map, and lifecycle ownership. Callback-returned locations and nested uncertainty values are detached.
- An adversarial review found two copies of the alert severity ranking during integration. They now share one module-level rank/comparator, and a table-driven test proves timeline and command-priority selection agree for routine, notable, critical, and decision-required alerts.
- `CampaignScreen.ts` fell from **5,008 to 4,751** lines (−257), and `renderCommandShell` fell from **623 to 399** (−224). The new module is 502 verifier lines; its largest function is 66 lines.

Implemented renderer result:

- Added `UnitStackPresentation.ts` as the canonical deterministic owner of visible-member priority/cap, strength-to-actor count, diamond/corner geometry, recon normalization, sprite/facing selection, suppression/sentry/entrenchment state, and decoration offsets.
- `HexMapRenderer` retains SVG/DOM creation, caches, transforms, effects, errors, and lifecycle; the former inline preparation path is deleted.
- `HexMapRenderer.ts` fell from **15,580 to 15,396** lines (−184), while `renderUnitStack` fell from **169 to 61** and lost its oversized-method exemption. The new pure module is 186 verifier lines.

Implemented air-contract result:

- Added `AirCombatContracts.ts` as the sole declaration owner for nine air mission/event contracts. `GameEngine` and `BattleSidebarEngine` retain source-compatible type re-exports only.
- `AirShowPlaybackCapture`, `ClusterAirPlaybackPlanner`, and `ResolvedAirCombatSceneBuilder` now import the cycle-free contract directly. Their type imports erase at compilation, so the extraction adds no runtime edge or cycle.
- Source guards reject duplicate definitions for all nine symbols and compile-check exact bidirectional compatibility through every `GameEngine` export. The architecture baseline separately holds duplicate declarations at zero in both former owners.
- `GameEngine.ts` fell from **18,356 to 18,213** lines and `BattleSidebarEngine.ts` from **397 to 332**; three more UI-to-engine exceptions were removed, leaving four.

Regression result: the final tree passes the complete registered suite **878/878**, the campaign suite **426/426**, air-show diagnostics **86/86**, strict TypeScript, zero-warning lint, repository/asset gates, and the production build. Architecture verification now enforces **29 file budgets, 5 coupling/symbol budgets, 61 inherited oversized-method ceilings, and exactly 4 grandfathered UI-to-engine import pairs**. The six real Campaign command-shell Chromium checks pass at 1920×1080, 1506×768, 1440×900, 1280×720, 800×900, and 640×360. Production verification retains the **80,404-byte** initial script, lazy tactical delivery, and no static chunk cycles.

### Canonical retaliation, combat-pass geometry, and Campaign Operations continuation (2026-09-19)

Intent: reduce the remaining large coordinators through three behavior-preserving seams while making split-brain ownership a build failure. Each extraction must delete the displaced rule path, keep mutable state/RNG/DOM ownership in its coordinator, return detached outputs, and survive an independent adversarial review before the architecture ceilings move.

Implemented retaliation result:

- Added `BattleRetaliationProjection.ts` as the canonical deterministic preparation for previewed, Player, and Bot retaliation. It owns ordered break, aircraft/ground, tow, pin, range, retaliation-limit, rearm, and ammunition gates plus the detached defender snapshot and reason copy.
- `GameEngine` remains the sole owner of live state reads, `resolveAttack` RNG calls, ammo/resource debits, damage/status mutation, retaliation counts, initiative, reports, and events. All three callers delegate once; their former inline policy paths are absent.
- Cross-agent review caught a critical sentry drift before integration: post-hit breakage had suppressed a simultaneous sentry shot and would have shifted the RNG stream. The final policy explicitly allows sentry fire from the pre-hit snapshot and preserves the historical preview pin-before-tow versus live tow-before-pin ordering.
- `GameEngine.ts` fell from **18,213 to 18,121** lines. `previewRetaliationForPlayerAttack` fell from **162 to 119** and lost its oversized exemption; `resolvePlayerAttack` fell from **707 to 665** and `resolveBotAttack` from **632 to 628**. The new module is 182 verifier lines and its largest function is 104 lines.

Implemented renderer result:

- Added `AirShowCombatPassGeometry.ts` as the canonical pure decision owner for dogfight and bomber-intercept paths behind explicit immutable inputs and injected geometry services.
- `HexMapRenderer` retains viewport/SVG bounds, DOM, animation lifecycle, actor mutation, caches, and service implementation. Its duplicate `AirShowCorridor` shape was removed in favor of the canonical readonly corridor contract.
- Real-renderer adapter coverage now exercises dogfight plus forward and reverse bomber passes, exact goldens, input non-mutation, and point/output detachment. Source guards reject direct runtime globals, retained policy literals, duplicate corridor declarations, or noncanonical delegation.
- `HexMapRenderer.ts` fell from **15,396 to 14,766** lines. Its dogfight/bomber path methods fell from **353/351 to 23/18** and both lost their oversized exemptions. The new module is 815 verifier lines; its largest function is 54 lines.

Implemented Campaign Operations result:

- Added `CampaignOperationsWorkspaceProjection.ts` as the canonical detached projection for all five order kinds, reservation labels, status/ETA/route/cost/risk/objective/dependency copy, cancellation capability, transport-return state, and atomic commit presentation.
- The Operations tray and cancellation review share `projectCampaignOperationOrder`; `CampaignScreen` remains the only `CampaignState` reader and owns DOM, focus, events, command mutation, navigation, and lifecycle. The former 128-line `projectCommandOrder` implementation is deleted.
- `CampaignScreen.ts` fell from **4,751 to 4,654** lines and `renderCommandShell` from **399 to 382**. The new module is 304 verifier lines; its largest function is 48 lines.

No-split-brain prevention:

- Repository-wide AST gates now require the canonical retaliation function, both combat-pass builders, and all three Operations entry functions to be declared exactly once by their expected modules. The same gate already enforces sole ownership of the nine air mission/event types.
- Gate self-tests create duplicate declarations in unrelated `src` modules and prove both type and runtime ownership checks fail closed. Boundary tests separately characterize exact delegation and reject the known former inline/fallback paths.
- Architecture verification now locks **32 file budgets, 5 coupling/symbol budgets, 1 canonical type-owner contract, 3 canonical runtime-owner contracts, 57 inherited oversized-method ceilings, and exactly 4 grandfathered UI-to-engine import pairs**.

Regression result: the consolidated tree passes the complete registered suite **887/887**, campaign **429/429**, air-show diagnostics **90/90**, strict TypeScript, zero-warning lint, all repository/asset/architecture gates, and the production build. The bundle retains the **80,404-byte** initial script, lazy tactical delivery, and no static chunk cycles. Real Chromium passes the seven painted-frame air-show baselines plus Campaign Operations at 1920×1080, 1506×768, 1440×900, 1280×720, 800×900, and 640×360 (**13/13** combined).

### Canonical air events, roster presentation, and production air-show authority (2026-09-20)

Intent: continue reducing regression cost in `GameEngine` and `PopupManager`, while enforcing the user's explicit requirement that no extraction leave a second authority behind. A slice is accepted only after independent adversarial review, executable behavior parity, removal of its old implementation, and a lower architecture ceiling.

Implemented air-engagement result:

- Added `BattleAirEngagementProjection.ts` as the single detached payload projector for every flak, air-to-air, and CAP-clash event.
- Routed all nine production event producers through it: two scheduled-mission strike paths, the CAP-clash builder, the global strike air phase, the global flak helper, two Player direct-attack paths, and two Bot direct-attack paths.
- Removed redundant fact inputs. Ordered flak entries determine top-level damage/final strength/destruction; the interception result determines air-to-air final state; one final-strength pair determines CAP survivor counts and arrays.
- `GameEngine` retains all validation, combat/RNG calls, ammo/resources, live mutations, mission state, initiative, reports, and exact queue publication timing.
- Executable deterministic Player/Bot attacks lock full consumed-event SHA-256 digests, bomber/CAP post-state, ammo/suppression/mission commits, and unchanged RNG checkpoints. Source ownership additionally rejects an inline producer returning beside the projector.
- `GameEngine.ts` fell from **18,121 to 18,013** lines. `resolveAirStrikeMission` fell **534→512**, `resolveStrikeMissionAirPhase` **229→212**, `resolvePlayerAttack` **665→632**, and `resolveBotAttack` **628→606**. The new 159-line projector's largest function is 25 lines.

Implemented roster result:

- Added `RosterEntryPresentation.ts` as the canonical populated-roster presenter for duplicate labels, statuses, stat thresholds, off-map support charges, personnel/equipment/suppression details, escaping, and deploy markup.
- Added `InitialsPresentation.ts` as the one two-character fallback shared by roster tiles and general portraits after review found the old helper still had another caller.
- `PopupManager` retains the empty state, DOM assignment, row pointer shortcut, accessible Deploy button, event publication, focus, and lifecycle. The former inline entry composer, disambiguator, and private initials copy are gone.
- Focused coverage locks exact markup, support/air/exhausted branches, injection escaping, input/output detachment, empty state, keyboard-focusable Deploy control, and live event behavior.
- `PopupManager.ts` fell from **4,594 to 4,450** lines. The presenter is 149 lines and the shared initials helper is 12 lines.

No-split-brain correction:

- An attempted egress extraction initially reduced `AirShowPlaybackPlanner`, but independent review proved that exported planner had no runtime caller. Production was already `HexMapRenderer → AirShowDirector.planAirShowTimeline`; the proposed “canonical” egress module would only have certified a dormant second planner.
- A TypeScript import-graph audit from `src/main.ts` confirmed that `AirShowPlaybackPlanner` and the attempted egress helper were not runtime reachable. The only inbound source imports were type-only, and no dynamic import, package export, or caller existed.
- Redirected the three surviving type imports to `AirShowPhaseProjectionContracts`, then deleted the dormant 3,899-line planner, attempted egress helper, orphaned rail/phase/finalizer/path/clash modules, dead-path tests, and stale tracked compiled artifacts.
- `AirShowDirector.planAirShowTimeline` is now the repository-wide canonical function owner. Its 1,994-line file and four inherited functions above 120 lines have exact no-growth ceilings; future work must split the live planner rather than revive an alternate.

Architecture result:

- The baseline now enforces **33 file budgets, 5 coupling/symbol budgets, 1 canonical type-owner contract, 7 canonical runtime-function owner contracts, 60 inherited oversized-method ceilings, and exactly 4 grandfathered UI-to-engine import pairs**.
- Canonical function ownership now includes `projectBattleAirEngagement`, `projectRosterSectionPresentation`, `extractDisplayInitials`, and the production `planAirShowTimeline`, in addition to the existing retaliation, combat-pass, and Campaign Operations functions.
- Gate self-tests continue to prove duplicate function/type owners fail even when introduced in an unrelated source module.

Regression result:

- Complete registered suite: **892/892**.
- Campaign suite: **429/429**.
- Air diagnostics: **88/88** after removing dead-planner-only tests.
- Direct production `AirShowDirector` Jest suite: **15/15** across all scenario families, origins, speed/duration, heading continuity, separation, escort synchronization, and zero-strength tutorial-bomber survival.
- Chromium: **7/7** painted frames, **2/2** temporal air certificates, **3/3** full tutorial journeys, and **1/1** shipped War Room hotspot certificate.
- Strict TypeScript, zero-warning lint, repository/asset/architecture gates, diff validation, and the production build pass. The build retains the **80,404-byte** initial script, lazy tactical chunk, and no static chunk cycles.

### Canonical attacker preparation, command-hex projection, and live air-show synchronization (2026-09-20)

Intent: continue reducing the two largest gameplay/UI transactions and the live air-show coordinator while preserving one authority for state, RNG, presentation facts, and choreography. Each extraction was independently reviewed for parity, detachment, and split-brain risk before acceptance.

Implemented attacker-preparation result:

- Added `BattleAttackerPreparation.ts` as the canonical pure projector for the detached attack-request unit, resolved facing, sentry clearing, clamped unit-ammunition commitment, and next core action flags.
- Both `GameEngine.resolvePlayerAttack` and `resolveBotAttack` delegate exactly once. `GameEngine` retains RNG, registry-ammunition spending, live mutation, reports, events, initiative, and resource ordering.
- Five focused tests lock legacy parity, input/output detachment, single source ownership, intentional optional-action-flag reset semantics, and complete seeded Player/Bot transaction signatures. The Player signature is `2f4d46abac37869687c1a8726c6acb8d998ace1daf01e4692ea6a5da3b6be0a7`; the Bot signature is `0f67465901f9bad937f09c11c2a3f4786afe880af45a95d8eefaf0e54d574d6b`. RNG checkpoints remain `0x12345678` and `0x0badc0de`.
- `GameEngine.ts` fell **18,013→18,004** lines, `resolvePlayerAttack` **632→627**, and `resolveBotAttack` **606→601**. The new projector is 50 verifier lines.

Implemented campaign command-hex result:

- Added `CampaignCommandHexProjection.ts` as the canonical detached presenter for authored tiles, friendly-base action/summary precedence, infrastructure condition and recovery, geography/water, force/capability/objective/front facts, and supplemental briefed sites with deduplication.
- `CampaignScreen` remains the only `CampaignState` reader and retains DOM, rendering, callbacks, focus, and lifecycle ownership.
- Five focused tests lock damaged-base repair precedence, task-force/known-site deduplication, inactive-base explanation, source ownership, no state/DOM imports, axial-versus-offset coordinate semantics, the non-base engagement branch, callback isolation, and bidirectional capability detachment.
- `CampaignScreen.ts` fell **4,654→4,521** lines and `renderCommandShell` **382→255**. The new projector is 227 verifier lines; its exported coordinator is 5 lines and every helper remains below 120.

Implemented live air-show synchronization result:

- Refactored only the production `AirShowDirector`; no replacement planner or parallel timeline path was introduced.
- `synchronizeBomberTargetRunsForEscortArrival` fell **126→34** lines through bounded internal delay, defense-pass, and cue-retiming helpers. `AirShowDirector.ts` remains at its exact 1,994-line ceiling, and the oversized-method allowlist fell from 60 to 59.
- A new multi-bomber regression proves every bomber receives a nonzero retime, each flak cue resolves to an actual containing visible segment at exact sampled progress, all flak remains within the authored `hypot(27, 56) + 0.001px` radius, and release/impact cues remain attached to their actors.
- Existing calibrated painted snapshots pass unchanged. The full air-show path passes **88/88** diagnostics, **16/16** direct director tests, **8/8** rendered visual tests, **16/16** browser visual scenarios, the **1/1** 20x20 choreography run, and **2/2** temporal certificates overall.

Architecture and regression result:

- The build gate now enforces **35 file budgets, 5 coupling/symbol budgets, 1 canonical type-owner contract, 9 canonical runtime-function owner contracts, 59 inherited oversized-method ceilings, and exactly 4 grandfathered UI-to-engine import pairs**.
- Complete registered suite: **902/902**. Campaign suite: **434/434**. Campaign command UI in Chromium: **27/27** across the governed viewport matrix.
- Strict TypeScript, zero-warning lint, repository/asset/architecture gates, production build, lazy tactical delivery, and static-cycle checks pass. The initial production script remains **80,404 bytes**.

### Canonical defender suppression, campaign command summary, and interceptor geometry (2026-09-20)

Intent: remove another duplicated decision seam from each authoritative coordinator, then use adversarial cross-review to prove the extraction did not create a second state, presentation, or timeline authority.

Implemented defender-damage and suppression result:

- Added `BattleDefenderDamageProjection.ts` as the canonical detached post-damage projector for suppressor attribution and the newly-broken transition used by preview, Player, and Bot transactions.
- Adversarial review found and corrected a real first-pass defect: suppression had been classified before the projector added the attacking formation, so a low-strength defender receiving its second suppressor could remain non-broken and fail to route.
- Added `BattleSuppressionState.ts` as the one classification policy. `GameEngine.resolveUnitSuppressionState` is now a one-line delegate, and preview plus both live attack paths use the same post-attribution projection. Destroyed units are explicitly excluded from a newly-broken transition.
- Regression coverage locks direct detachment and unique attribution, second-suppressor classification, preview retaliation denial, Player and Bot rout/retreat behavior, exact source ownership, seeded transaction signatures, and unchanged RNG checkpoints.
- `GameEngine.ts` fell **18,004→17,989** lines. `resolvePlayerAttack` is now **623** lines and `resolveBotAttack` **598**. The projector and classifier are 42 and 16 verifier lines.

Implemented Campaign command-summary result:

- Added `CampaignCommandSummaryProjection.ts` as the canonical detached owner for priority-sorted force summaries, command-status precedence, unread aggregation, terminal outcome/service ordering, and advance state/copy.
- `CampaignScreen` remains the only `CampaignState` reader and the sole final render, command, DOM, focus, and lifecycle owner. The location callback is bound to the pre-read Player view.
- Five tests lock axial-to-offset location identity, priority/capacity filtering, uncertainty and bidirectional detachment, terminal/engagement/order precedence, exact unread math, sandbox suppression, alert/timeline ordering, `Automation continued` wording, stable service-record ties, and one runtime owner with no state/DOM imports.
- `CampaignScreen.ts` fell **4,521→4,487** lines and `renderCommandShell` **255→223**. The new projection is 158 verifier lines; its largest helper is below 25 lines.

Implemented live interceptor result:

- Refactored only the production `AirShowDirector`; no alternate planner or exported choreography entrypoint was added.
- `buildInterceptorPasses` fell **144→38** lines. A private 103-line `projectInterceptorPassGeometry` helper owns deterministic geometry while the coordinator retains track lookup, mutation, timing, and assembly. `AirShowDirector.ts` remains at its exact 1,994-line ceiling.
- The captured single-interceptor hash remains `25fbf9019cbbe5a1a8452839df27e83a525f21d97c23b0fcb58022a070dc8c33`. Hardening adds a nine-interceptor full-track hash, `23464d345fc8a5d4e110abd6055317fe5f4155e14d36b06d82118646e3e803cf`, plus exact actor order, centered/mirrored lane, and fighter-clash continuation checks.
- Full air certification passes **88/88** diagnostics, **19/19** direct director tests, **8/8** rendered visual tests, **16/16** browser visual scenarios, the **1/1** 20x20 choreography run, and **2/2** temporal certificates. All seven calibrated painted snapshots remain unchanged.

Architecture and regression result:

- The build gate now enforces **38 file budgets, 5 coupling/symbol budgets, 1 canonical type-owner contract, 12 canonical runtime-function owner contracts, 58 inherited oversized-method ceilings, and exactly 4 grandfathered UI-to-engine import pairs**.
- Complete registered suite: **908/908**. Campaign suite: **439/439**. Campaign command UI remains **27/27** in Chromium.
- Strict TypeScript, zero-warning lint, all repository/asset/architecture gates, the production build, lazy tactical delivery, and static-cycle checks pass. The initial script remains **80,404 bytes**.

### Canonical attacker disposition, final command-shell assembly, and live fighter-clash ownership (2026-09-20)

Intent: continue decomposing the three live coordinators while treating any duplicate state, presentation, or choreography formula as a release defect. Each slice must retain mutation and publication in its authoritative coordinator, remove the displaced inline rule, and survive independent adversarial review.

Implemented attacker-disposition result:

- Added `BattleAttackerDispositionProjection.ts` as the single pure decision owner for post-combat destruction, hold, and eligible ground-assault advance.
- Both `GameEngine.resolvePlayerAttack` and `resolveBotAttack` delegate exactly once. `GameEngine` retains validation, live state reads, RNG, damage/resources, removal, movement, recovery-site overrun, supply synchronization, action flags, reports, events, and publication order.
- Review removed a redundant `finalHex` result and its unused origin input, eliminating a future disagreement surface. Pure coverage locks destruction precedence, attacker-aircraft and primary-defender-aircraft hold gates, advance entrench reset, and detachment. Seeded real Player and Bot transactions lock hold signatures `b60a12bab8a2ec17286e636541b855ebf72d9e497deb5cd4414927af2b6730d0` and `1cb60ad8c7385cd7fe0e6d8123c18753e3f2b52d67a9750f3a7d2f5f2f465732`, plus assault-advance signatures `fef10f86c15281112ec587214018e0cf4d0216a99449b0139eababd483e2dadb` and `c2e345f56046b4ab1e73089e9bc5945645c050d34cc9ac2a2496a9f11afbaf29`.
- `GameEngine.ts` fell **17,989→17,988** lines, `resolvePlayerAttack` **623→622**, and `resolveBotAttack` **598→597**. The new projector is 53 verifier lines.

Implemented final command-shell result:

- Added `CampaignCommandShellViewProjection.ts` as the canonical detached assembler for both the no-campaign and loaded campaign shell payloads.
- `CampaignScreen` remains the only `CampaignState` reader and owns rendering, callbacks, DOM, accessibility, focus, navigation, and lifecycle. All state reads complete before projection, and the current time remains read immediately before the terminal render.
- Four tests lock exact payload parity, status precedence, objective/hex ordering and coordinate identity, bidirectional nested detachment, fresh empty collections, and one runtime owner with no state or DOM authority. The final implementation uses the platform structured clone instead of a hand-written plain-object clone, avoiding silent flattening if richer DTO values appear later.
- `CampaignScreen.ts` fell **4,487→4,458** lines and `renderCommandShell` **223→193**. The new projector is 110 verifier lines.

Implemented live fighter-clash result:

- Refactored only production `AirShowDirector`; `planAirShowTimeline` remains the sole exported timeline planner and `HexMapRenderer` remains its sole playback consumer.
- `buildFighterClash` fell **181→88** lines, with a private 73-line turn-side optimizer. Existing cap-clash and full-engagement hashes remain `66a92433c35fca6e77ef289d7edd453a3e6890a5757d3367485dc601f8d3a09f` and `5e840281833984353eba6494315aa5f7fb9c44b540176ecd94e7fd47c81a7cc3`.
- Adversarial review found the scramble geometry formula was still duplicated between candidate scoring and published track construction. A single private 14-line `projectFighterScrambleGeometry` now owns final heading, escort clearance, switched lane, and scramble-path construction for both callers. The source tripwire requires exactly one definition, exactly two calls, and no retained formula copy.
- Added a mirrored Player-interceptor/Bot-escort/Bot-bomber multi-flight certificate with 12 fighter actors, exact faction/role assertions, every phase continuation, and full fighter-track hash `a866f694fe65ffdb580bce5d6fc79616beceb1ebc5ced7011668d8235edca647`.
- `AirShowDirector.ts` fell **1,994→1,992** verifier lines. Its oversized-function allowlist loses `buildFighterClash`; only `planAirShowTimeline` remains above 120 lines in the live director.

Architecture and regression result:

- The build gate now enforces **40 file budgets, 5 coupling/symbol budgets, 1 canonical type-owner contract, 14 canonical runtime-function owner contracts, 57 inherited oversized-method ceilings, and exactly 4 grandfathered UI-to-engine import pairs**.
- Complete registered suite: **914/914**. Campaign suite: **443/443**. Campaign command UI: **27/27** in Chromium across the governed viewport matrix.
- Full air certification passes **88/88** diagnostics with no findings, **21/21** direct director tests, **8/8** rendered visual tests, **16/16** browser visual scenarios, the **1/1** 20x20 choreography run, and **2/2** temporal certificates overall. All seven calibrated painted snapshots remain unchanged.
- Strict TypeScript, zero-warning lint, all repository/asset/architecture gates, the production build, lazy tactical delivery, and static-cycle checks pass. The initial script remains **80,404 bytes**.

### Sole live air-show authority, staged aircraft readiness, and command-shell workspace orchestration (2026-09-20)

Intent: finish the current decomposition without allowing a helper extraction to become a second source of timeline, combat-readiness, or campaign-presentation truth. The live coordinators retain mutation, authoritative reads, RNG, rendering, and publication; pure helpers own only the detached decisions explicitly delegated to them.

Implemented live air-show authority result:

- `AirShowDirector.planAirShowTimeline` remains the sole exported and live timeline authority. A private planning-context resolver reduced that entrypoint from **159 to 101** lines without changing phase order, seeded RNG, tracks, cues, sorting, verification, or publication.
- A deterministic all-fallback certificate, with null headquarters and target positions and an omitted seed, is locked to SHA-256 `c4747fe1662f979c2988e16e97c8926b9c3e2ceb0a000a740f476b5a158cfd37`. The direct production director suite now passes **22/22**.
- A complete TypeScript class call-graph audit found the old private AirShow planner stack in `HexMapRenderer` was unreachable from every public method, constructor, and property-member root. The 150-method closure was deleted instead of retained as a dormant parallel authority.
- `HexMapRenderer.ts` fell **14,766→8,027** verifier lines and its class method count fell **364→214**. Production retains one director import and one planner call; source guards reject restoration of the removed roots or another live planner.

Implemented aircraft-readiness result:

- Added `BattleAircraftAttackReadinessProjection.ts` with two ordered pure stages: maneuver readiness first, ammunition readiness second.
- Adversarial review caught an eager ammunition-state read that would have initialized a missing legacy ammo record before a movement rejection. The final integration now projects movement first and reads/initializes live ammunition only after that stage succeeds, preserving exact rejected-attack serialization for both Player and Bot paths.
- `GameEngine` remains the only live-state, mutation, RNG, resource, report, and publication owner. It is now **17,987** verifier lines; `resolvePlayerAttack` and `resolveBotAttack` are **618** and **596** lines. Source ownership and real transaction tests reject a second readiness implementation or rejection-time registry mutation.

Implemented command-shell workspace result:

- Added `CampaignCommandShellWorkspaceProjection.ts` as the reader-free coordinator for objectives, formations, intelligence, logistics, and command-hex workspaces in the established order.
- `CampaignScreen` remains the only `CampaignState` reader and the sole DOM, rendering, focus, navigation, and lifecycle owner. Lazy reader closures keep the existing read sequence, each child projection runs exactly once, and time is sampled once immediately before the final render.
- `CampaignScreen.ts` is now **4,437** verifier lines and `renderCommandShell` fell **193→38**. Real-screen publication/freshness, ordering, coordinate-identity, and detachment regressions cover the new seam.

Architecture and regression result:

- The build gate now enforces **42 file budgets, 5 coupling budgets, 1 canonical type ownership contract, 16 canonical function ownership contracts, 47 oversized-method budgets, and exactly 4 grandfathered UI-to-engine import pairs**.
- Complete registered suite: **915/915**. Campaign suite: **444/444**. Campaign command UI: **27/27** in Chromium. Zero-warning lint and the production build pass.
- The production initial script remains **80,404 bytes**, campaign remains lazy, static chunk-cycle checks pass, and the `BattleScreen` chunk is reduced to **1,335.18 kB** raw.
- Full AirShow recertification passes **88/88** diagnostics with no findings, **22/22** direct director tests, **8/8** rendered visual tests, **16/16** Chromium visual scenarios, **1/1** 20x20 choreography, and the independently rerun **2/2** temporal certificates. `npm run test:airshow` passes end to end, with all seven calibrated painted snapshots unchanged.

### Canonical Air Support target-tile presentation continuation (2026-09-20)

Intent: remove `PopupManager`'s last inherited oversized method without moving live battle reads, planner state, commands, DOM insertion, event binding, focus, or lifecycle out of the manager. One pure presentation module will own the complete target-card branch and its copy, selectors, accessibility attributes, escaping, and enabled/disabled policy; the displaced inline implementation must be deleted in the same slice so no parallel markup authority remains.

Current state: `PopupManager.ts` is **4,450** verifier lines. `renderAirSortieTargetTileMarkup` is **126** AST lines and is the file's only oversized-method exception. It currently combines unavailable and committed states, escort-package selection, strike/drop-zone/CAP target states, mission-specific button labels, target validity, escaping, and markup. `PopupManager` separately owns the authoritative per-mission/per-squadron target map and resolves engine-backed target labels.

Expected boundary: add `AirSortieTargetTilePresentation.ts` with one exported canonical `renderAirSortieTargetTileMarkup` entrypoint and sub-120-line private branch renderers. `PopupManager` will read the live target value, validate it with the existing parser, resolve its current engine-backed label, and invoke the presenter exactly once. The presenter receives only detached readonly strings, booleans, mission facts, assignment facts, and escort choices; it must not import `BattleSidebarEngine`, battle state, DOM types, or command services.

Parity edges: preserve empty CAP as an enabled base patrol; keep empty or malformed required strike/transport targets disabled; preserve nonempty malformed target display while rejecting submission; committed squadrons expose no action controls; escort choices remain squadron-scoped; mission/squadron target keys do not bleed between cards; all engine-derived labels and data attributes remain escaped; and every `data-air-*`, `aria-pressed`, and `disabled` behavior remains byte-for-byte compatible apart from insignificant surrounding whitespace.

Risk and regression strategy: characterize every branch directly, including hostile strings, and lock one aggregate markup SHA-256 before accepting the move. Prove input detachment and determinism, exercise the real `PopupManager` adapter with independent squadron targets, and add source tripwires for one declaration owner, one production call, deleted inline copy policy, and absence of engine/state/DOM authority in the presenter. Lower the exact file and method ceilings only after focused behavior, TypeScript, scoped zero-warning lint, architecture verification, and diff validation pass.

Implemented result:

- Added the 187-line `AirSortieTargetTilePresentation.ts`. Its exported 18-line entrypoint and sub-120-line branch renderers are the sole target-card markup, copy, escaping, selector, ARIA, and enablement owner. `PopupManager` retains the target registry, existing axial validator, current engine-backed label read, DOM insertion, events, commands, focus, and lifecycle.
- The live manager adapter fell **126→23** AST lines. Source review also found the uncalled 91-line `renderAirTargetPanelMarkup` method, which contained an older second CAP/escort/target presentation path; it was deleted rather than left as a dormant split-brain implementation. A second reachability audit proved `populateAirMissionKind` (8 AST lines), `updateAirSupportBrief` (57), `disableEscortUnlessBomberScheduled` (17), `populateEligibleSquadrons` (47), and `populateTargets` (97) were definition-only. Their complete contiguous 235-source-line legacy form closure was deleted, and forbidden-root source guards now prevent definitions or calls from returning.
- `PopupManager.ts` fell **4,450→4,008** verifier lines (−442) and no longer has an oversized-method exception. The architecture gate now enforces **43** file budgets, **5** coupling budgets, **1** canonical type-owner contract, **17** canonical function-owner contracts, **46** oversized-method budgets, and the exact **4** grandfathered UI-to-engine imports.
- Separate behavior-hardening rationale: the former text escape policy did not encode quotes for double-quoted `data-air-*` attributes, so malicious or malformed squadron/package identifiers could break attribute boundaries even though ordinary legacy markup was unchanged. Every dynamic double-quoted `data-air-*` value now uses attribute-context escaping including `&quot;`; DOM-parsed regression cases prove both payloads round-trip exactly without creating `autofocus`, `onclick`, or injected data attributes. A nonempty malformed CAP mark also remains visible and clearable but can no longer be submitted; empty base CAP and valid marked CAP remain enabled.
- Final surrounding-row hardening: `renderAirSortieRowMarkup` also emits the engine-derived squadron identity in `data-air-squadron`. It now consumes the same exported Air Support attribute encoder as the target-tile presenter, so quote handling has one policy owner. A DOM-parsed adversarial row regression proves the exact quote-bearing identity round-trips without synthesizing `autofocus`, `onclick`, or injected data attributes. Legacy dead-root guards now reject each identifier anywhere in the manager source, not merely method-shaped occurrences. This row-only hardening did not alter the target-tile presentation golden.
- Five focused tests preserve all original ten branch lengths and lock the hardened twelve-case aggregate markup SHA-256 `5e214529915d91ad98065cfafcf73c861751c304a6a4b6ce9cf33b948a161cd3`, committed/escort/strike/CAP/transport action and ARIA states, context-correct hostile-string escaping in both the tile and surrounding squadron row, determinism, input non-mutation, real per-squadron target isolation, and one engine/state/DOM-free presentation owner. Focused tests pass **5/5**; TypeScript, scoped zero-warning lint, architecture verification, and diff validation pass.

### Release-gate determinism and tutorial-overlay readiness hardening (2026-09-20)

- The complete Playwright matrix now runs with one worker locally and in CI. Painted-frame and temporal certificates depend on real browser cadence, so isolating browser load removes scheduler-induced false failures and makes the default release command match the dedicated Airshow gates.
- `openTrainingRequisition` now waits for `#tutorialOverlayContainer:not(.hidden)` instead of checking a title-dependent dialog before its asynchronous publication. After Skip, it waits for the base overlay container to become hidden before interacting with requisition controls.
- Requisition browser checks derive unit costs from the canonical formation catalog and conserve the budget observed at mission entry. They no longer duplicate obsolete 1,200-RP or label-first display contracts after the authored training budget moved to 1,300 RP.
- Focused allocation coverage passes **9/9** and focused requisition coverage passes **8/8**. The registered suite passes **920/920**, campaign passes **444/444**, Jest passes **30/30**, and Airshow passes **86/86** diagnostics, a clean anomaly report, **8/8** renderer visual tests, **16/16** browser visual scenarios, and **1/1** choreography.

### Firefox precombat responsiveness and canonical inert minimap (2026-09-20)

Observed failure: the Firefox requisition journey reached tactical initialization and published precombat, but the browser main thread then stopped servicing both Playwright visibility checks and in-page heartbeat evaluation. Runtime tracing isolated the feedback to the combat-overlay viewport observer: `SVGTransformList.consolidate()` was used as a read, but Firefox normalized the observed SVG `transform` attribute during consolidation and immediately retriggered the same `MutationObserver` path.

Implemented viewport result:

- Added `ViewportTransform.ts` as the sole pure reader for the exact transform forms authored by `MapViewport`: identity, translate/scale, and matrix. It reads the attribute string without touching `SVGTransformList`, rejects non-finite or unowned forms explicitly, and cannot mutate the observed element.
- `HexMapRenderer` now resolves the combat-overlay matrix through that parser and stores the last exact observed transform value. Same-value observer notifications return before layout synchronization, preventing redundant feedback even if a browser reports an unchanged attribute.
- Architecture and source tests require the pure parser to remain the only `parseViewportTransform` owner, prove 50 repeated reads cause zero observed writes, and hold `.consolidate()` at zero occurrences in `HexMapRenderer`.

Implemented precombat minimap result:

- Added `HexMapLayout.ts` as the canonical finite hex-layout/bounds owner shared by full battle rendering and the briefing overview. Added `TerrainFillPalette.ts` as the canonical terrain-fill owner with explicit battle and briefing themes.
- Added `PrecombatMiniMapRenderer.ts` as a dedicated inert presentation boundary. It builds deterministic theater markup and a thin DOM application from normalized `ScenarioData`, using the shared layout and fill owners plus the existing road, river, crossing, and terrain-feature projectors.
- `PrecombatScreen` no longer constructs the full `HexMapRenderer`, queries/removes its battle-only layers, owns a duplicate muted palette, or schedules viewport-dependent rerenders. It invokes the inert renderer once per setup. The overview contains no units, effects, caches, interaction handlers, or alternate gameplay state.
- Single-authority coverage locks all 320 training hexes, deterministic finite bounds, geography metadata, stale-DOM replacement, accessibility labeling, absence of battle sprites/effects, and removal of the former full-renderer/fallback-palette roots. Canonical function ownership now covers layout, both minimap functions, terrain fill, and viewport parsing.

Verified result:

- Complete registered suite: **927/927**; campaign remains **444/444**.
- Architecture verification: **48 file budgets / 7 coupling budgets / 1 canonical type owner / 21 canonical function owners / 46 oversized-method budgets / 4 grandfathered UI-to-engine import pairs**.
- Focused Firefox requisition: **9/9**, including a post-entry event-loop heartbeat proving the precombat screen remains responsive.
- This section does not claim the final full cross-browser E2E run, deployment, or live production acceptance; those remain release gates.
## WebKit Tutorial Initiative Handoff Stability Plan

### Intended behavior
- The tutorial's Next Group click remains bound to the player initiative band that just completed the firing lesson.
- An interleaved enemy or automated activation cannot turn the highlighted control into an inert action or cause a later smoke group to be skipped.

### Impact analysis
- `BattleScreen` consumes the initiative queue projection to route one tutorial-only handoff; normal initiative commands keep their existing behavior.
- The initiative queue and engine remain authoritative. The fix records deferred same-band player peers without mutating later initiative bands.
- Visible behavior changes only in the race window: the accepted click advances to the Initiative Advances lesson while automated activity finishes.

### Verification
- Add a deterministic regression for an activated firing unit, interleaved enemy activation, pending same-band peer, and later smoke unit.
- Run focused BattleScreen tests, TypeScript, lint, architecture gates, and repeated WebKit wide-desktop tutorial journeys.

### Release-candidate completion (2026-09-21)

- Implemented `TutorialInitiativeHandoff.ts` as a narrow reader of the canonical initiative queue. It defers only same-band Player peers during a Bot interleave, preserves later smoke bands, and remains inert when the taught band cannot be proven. Normal initiative ownership and command ordering remain unchanged.
- Corrected WebKit compact tactical layout anchoring by making the battle UI a bounded, non-minimum-height layout participant. The exact 640x360 and 753x356 collapsed/expanded log paths now keep status, initiative, selected intel, and commands visible.
- Centralized campaign segment-time projection, removed the Airshow fallback coordinate formula in favor of `HexMapLayout`, made terminal outcome Save mirror persistence busy state, and routed tactical casualties through the same deployed-plus-reserve mission-reporting snapshot. These changes close the final reviewed split-brain and enabled-but-inert seams.
- Architecture verification now enforces **48 file budgets / 7 coupling budgets / 1 canonical type owner / 22 canonical function owners / 41 oversized-method budgets / 4 grandfathered UI-to-engine import pairs**. `HexMapRenderer` is held to 6,558 verifier lines and `BattleScreen` to 14,383.
- Final local certification is green: strict TypeScript, zero-warning lint, repository gates, **949/949** registered tests, **449/449** campaign tests, and a production build with an **81,182-byte** initial script, lazy campaign/tactical entry, and no static chunk cycles.
- Airshow certification is green at **87/87** diagnostics with no findings, a clean anomaly report, **8/8** renderer visual tests, **16/16** production-build browser visuals across desktop/large-map/mobile, and **1/1** full temporal choreography.
- The complete one-worker Playwright release matrix is green across Chromium, Firefox, and WebKit: **365 passed**, **34 intentional project skips**, **0 failed** in 50.6 minutes. All three browsers pass campaign, requisition, tactical geometry, complete tutorial, and War Room journeys; Chromium owns the calibrated Airshow screenshots and cadence certificates.
- Deployment and same-artifact live acceptance remain the only pending steps for this release candidate.
