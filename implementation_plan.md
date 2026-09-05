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
