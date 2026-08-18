# Campaign intelligence, counterintelligence, and fog plan

**Date:** 2026-08-01

**Status:** Core vertical slice implemented; tuning and scenario authoring continue

**Product standard:** First-class mechanics and UI/UX

**Primary scope:** Campaign layer, with a truthful handoff into and out of tactical battles

**Follow-on integration:** [Campaign 2.0 — first-class game product and engineering plan](./CAMPAIGN_2_0_FIRST_CLASS_GAME_PLAN.md) preserves this truth/knowledge boundary while adding strategic AI, consequences, persistent formations, weather, saves, objectives, and the command-workspace overhaul.

## Implementation record — 2026-08-02

The release candidate implements the complete core loop described by this plan:

- versioned, faction-local knowledge states with source reports, claims, contacts, provenance, confidence, staleness, uncertainty, and briefing-change events;
- a mandatory `CampaignMapViewModel` projection that removes opposing force arrays and economies before campaign play UI or rendering receives the scenario;
- direct/front-line observation, passive reconnaissance, ground recon, air recon, contact verification, counter-recon, OPSEC, phantom concentrations, and battle/AAR reports;
- Intelligence Capacity plus supply/fuel costs, asset eligibility, duration, deterministic resolution, active-operation status, and public outcomes;
- symmetric Player/Bot resolution, with the baseline Bot choosing collection targets from its own contacts, objectives, and fronts rather than hidden forces;
- campaign contact markers, uncertainty rings, collection-coverage overlay, unread report badge, and a responsive Situation / Contacts / Operations headquarters drawer;
- knowledge-derived, frozen pre-battle briefings and tactical-to-campaign battlefield reporting;
- full save/load persistence for contacts, reports, operations, uncertainty, and faction knowledge, including migration from legacy saves;
- removal of exact opposing force/economy data from normal campaign UI and routing of the old global Intelligence shortcut to the campaign drawer;
- automated no-leak, collection/decay, counter-recon, deception, AI-parity, battle-report, persistence, and renderer tests.

The extensible model deliberately leaves additional source breadth—weather-driven aerial interpretation, dedicated SIGINT traffic analysis, captured-document chains, and route-constrained uncertainty growth—for scenario/content iterations. Those additions enrich the evidence pool without changing the shipped truth/knowledge boundary or UI contract.

The “Current-state correction” below records the pre-implementation audit that motivated this work; it is retained for traceability rather than describing the release candidate.

## Outcome

Four-Star General should model an operational picture, not simply cover enemy icons with a dark overlay. Reconnaissance produces observations. Intelligence turns incomplete and sometimes conflicting observations into useful estimates. Counterintelligence reduces what the enemy can learn and can create plausible false indicators. Campaign fog is the map expression of that faction-specific knowledge.

The completed system must create meaningful command decisions:

- Which sector needs collection effort?
- Is a contact current enough to act on?
- Do we commit an air-recon sortie, expose ground scouts, or accept uncertainty?
- Do we conceal the real concentration or create a false one?
- Is the enemy reacting to the deception, or are we seeing what it wants us to see?
- Do we launch a tactical battle with incomplete information?

This is one system with three responsibilities, not three disconnected features:

```text
Campaign truth
    ↓ produces observable signatures
Recon and intelligence sources
    ↓ produce time-stamped reports
Counterintelligence and deception
    ↓ suppress, distort, or inject reports
Faction-specific fusion and belief state
    ↓ produces a sanitized operational picture
Campaign fog UI ── Strategic AI ── Pre-battle intelligence
                                      ↓
                              Tactical observations/AAR
                                      ↓
                           New campaign intelligence reports
```

## Current-state correction

Intelligence and counterintelligence are **not implemented product features** today. The repository contains useful experiments, but the campaign has no authoritative knowledge model:

- `CampaignState.updatePowerValues()` calculates `intelCoverage` as controlled bases × 2. No campaign mechanic consumes it.
- `CampaignMapRenderer` receives the true scenario and renders enemy sprites, unit types, and exact counts directly.
- `CampaignScreen` displays the scalar `intelCoverage` value but has no collection, fusion, decay, contact, or uncertainty loop.
- The campaign Intelligence popup requests data from the tactical `GameEngine` or falls back to static sample briefs in `reconIntelSnapshot.ts`.
- The tactical counterintelligence prototype uses regenerating “deception charges” and inserts artificial targets directly into bot planning. That proves a UI interaction and an AI reaction, but it is not a symmetric intelligence mechanic.
- `CampaignTileDefinition.intelConfirmed` and campaign `intelNode` roles are schema hooks, not a system.
- `EngagementContextBuilder` knows exact defender forces and computes the true force ratio. The UI bands that result, but the estimate is not derived from player knowledge.

These elements may be reused as plumbing or test fixtures, but none should be marketed or accepted as complete intelligence, counterintelligence, or campaign fog.

## Product principles

1. **Information belongs to a faction.** Player and Bot each maintain a separate knowledge state. Neither plans from omniscient campaign truth.
2. **Fog hides dynamic truth, not the historical map.** Terrain, towns, major geographic objectives, and scenario briefing facts remain legible. Current control, forces, readiness, supply, movement, and temporary installations can be uncertain.
3. **Every claim has provenance and age.** A player can always answer: what was observed, where, when, by what source, and with what confidence?
4. **Uncertainty is graduated.** The system uses contact levels, strength bands, uncertainty areas, and staleness—not binary visible/invisible switches.
5. **Counterintelligence changes enemy evidence.** It never directly moves an enemy unit or gives the player perfect knowledge that a deception succeeded.
6. **Verification is an operation, not a truth button.** Confirming a report requires another source, analyst capacity, or a reconnaissance task. It can remain inconclusive.
7. **No UI information leaks.** The renderer, tooltips, engagement dialogs, DOM attributes, logs, and AI receive sanitized faction views rather than raw enemy truth.
8. **Loss of certainty must not remove agency.** The player always knows available friendly forces, objectives, legal orders, and why an operation is blocked.
9. **Difficulty changes enemy competence, not access to truth.** Hard AI prioritizes and fuses reports better; it does not bypass fog.
10. **The tactical and campaign layers exchange evidence.** Campaign knowledge shapes the pre-battle briefing; tactical contact and battle results update campaign knowledge.

## Player-facing gameplay loop

Each campaign segment represents three hours. The intelligence loop resolves inside the existing segment advance:

1. **Set priorities.** The commander marks priority areas or contacts and assigns reconnaissance/counterintelligence operations.
2. **Create signatures.** Movement, large concentrations, radio traffic, supply throughput, combat, air operations, and construction produce observable signatures.
3. **Collect.** Ground recon, air recon, adjacent contact, SIGINT/intel nodes, and battle reports produce source reports.
4. **Contest.** Enemy screening, concealment, radio silence, terrain, weather, and deception modify or inject evidence.
5. **Fuse.** Reports update existing contacts, create new contacts, conflict with older assessments, or lower confidence.
6. **Brief.** The map and Intelligence drawer highlight new, upgraded, stale, contradicted, or lost contacts.
7. **Act.** The commander moves forces, changes priorities, verifies a report, launches an engagement, or accepts the risk.

The player should never need to inspect raw percentages to play well. Exact scores remain internal; the UI communicates state through named levels, bands, age, source, and analyst language.

## Information model

### Knowledge levels

| Level | Map expression | Player learns | Initial confidence guide |
|---|---|---|---|
| **Unknown** | No enemy marker | Nothing current; historical map remains visible | 0–19 |
| **Reported** | Hatched uncertainty area with generic contact marker | Possible activity and broad area | 20–39 |
| **Located** | Last-known hex plus uncertainty ring | Broad domain/class such as ground, armor, air, or logistics | 40–59 |
| **Identified** | Typed contact symbol | Likely formation type and strength band | 60–79 |
| **Assessed** | Detailed contact card | Formation identity plus qualitative readiness, supply, intent, and tighter strength band | 80–100 |

The thresholds are starting tuning values, not UI-visible rules. Direct observation may jump levels. Conflicting or deceptive reports may lower confidence without deleting the contact.

### Strength and condition bands

Never expose exact enemy counts from campaign truth. Use consistent bands:

- **Strength:** trace, light, moderate, heavy, massed.
- **Readiness:** disrupted, degraded, ready, high readiness.
- **Supply:** isolated, strained, adequate, well supplied.
- **Movement:** stationary, preparing, moving, withdrawing; show direction only when supported.

At lower knowledge levels, omit unavailable fields rather than showing fake precision.

### Recency and decay

Every contact stores `lastObservedSegment`, `lastUpdatedSegment`, and a location uncertainty radius. On each segment:

- stationary or installation contacts decay slowly;
- mobile contacts decay faster and their uncertainty radius expands along legal movement routes;
- movement detected by multiple independent sources slows decay;
- combat, direct adjacency, or a completed reconnaissance operation refreshes the contact;
- below the Reported threshold, a contact moves to the archive as a last-known record instead of disappearing without explanation.

Initial tuning target:

- mobile formation: confidence −12 per segment, uncertainty +1 hex per segment;
- stationary formation: confidence −5 per segment;
- fixed installation/control report: confidence −2 per segment;
- corroborating independent source: +10 to +25 depending on reliability;
- contradictory source: lower confidence and flag the assessment as disputed.

All values must be data-configurable.

### Sources and reliability

| Source | Strength | Limitation/counterplay |
|---|---|---|
| Adjacent/direct contact | High location confidence | Exposes friendly force and may trigger combat |
| Ground reconnaissance patrol | Good classification and route observation | Narrow radius, slower, vulnerable to counter-recon |
| Air reconnaissance sortie | Broad and fast | Weather, range, air defense, interception, sortie cost |
| SIGINT/intel node | Broad activity and intent clues | Weak exact location; defeated by radio silence/spoofing |
| Logistics signature | Reveals traffic and concentration | Can be masked or deliberately simulated |
| Tactical battle/AAR | High-confidence participating-force evidence | Limited to what survived, observed, captured, or was engaged |
| Historical/scenario briefing | Establishes baseline installations/objectives | May be stale and never reveals current exact forces |
| Enemy deception | Plausible false evidence | Requires preparation and enemy collection exposure to be effective |

## First-class operations

Operations use **Intelligence Capacity**, generated by headquarters, recon assets, airbases, and controlled intel nodes. Capacity is committed for the operation duration; it is not a magically refreshing pair of charges. Physical assets are also committed where applicable.

### Intelligence collection

| Operation | Assignment | Duration | Cost/risk | Result |
|---|---|---|---|---|
| **Ground Recon Patrol** | Recon formation + target area/route | 1–2 segments | Movement/readiness, detection and combat risk | High-quality local contacts and route reports |
| **Aerial Reconnaissance** | Recon flight + area/route | 1 segment plus refit | Sortie, fuel, weather, interception/AA risk | Broad snapshot with good location and variable classification |
| **Observe Sector** | Any stationary friendly formation | Ongoing posture | Limits movement/readiness options | Maintains contact on adjacent approaches |
| **SIGINT Priority** | Analyst capacity + sector | 2+ segments | Competes with other priorities | Detects activity, radio networks, and possible intent |
| **Verify Contact** | Existing contact + independent source/asset | 1+ segments | Capacity and collection opportunity | Corroborates, disputes, refines, or remains inconclusive |

`Verify Contact` does not read the truth state and return “true/false.” It schedules collection against the report's claims.

### Counterintelligence

| Operation/posture | Assignment | Tradeoff | Effect on enemy knowledge |
|---|---|---|---|
| **Operational Security** | Force or sector posture | Slower orders/redeployment and reduced coordination while strict | Reduces radio/logistics signature and report reliability |
| **Counter-Recon Sweep** | Recon/security force + area | Consumes movement/readiness; may provoke contact | Disrupts enemy ground collection and can expose observers |
| **Conceal Concentration** | Force stack + terrain/engineer/logistics support | Preparation time and supply cost | Delays classification/strength assessment; movement can break concealment |
| **Phantom Concentration** | Target area + deception team + supporting signatures | Capacity, supply, preparation, discovery risk | Creates plausible reports of a force concentration that does not exist |
| **False Offensive** | Front/axis + deception plan | Preparation and temporary restrictions on real operations | Suggests attack timing/axis through radio and logistics indicators |
| **Masked Withdrawal** | Withdrawing force + deception support | Slower withdrawal and rear-guard cost | Keeps stale “holding” evidence active after movement begins |

The first releasable counterintelligence slice should include Operational Security, Counter-Recon Sweep, and Phantom Concentration. False Offensive and Masked Withdrawal follow once strategic AI and territory consequences can react meaningfully.

### Deception resolution

A deception creates hidden campaign entities and signatures, not artificial planner targets:

1. The player chooses the deception story, target sector, preparation period, and supporting assets.
2. The operation emits false reports only into enemy sources capable of observing those signatures.
3. Enemy fusion treats those reports like other evidence, including corroboration and contradiction.
4. Enemy AI may shift reconnaissance, reserves, or risk posture based on its belief state.
5. The player receives only observed reaction evidence—never a guaranteed “enemy fooled” result.
6. Counter-recon, source capture, direct observation, or contradictory movement can compromise the deception.

This avoids the current prototype's magical direct pull on tactical Bot units.

## Campaign fog rules

### What remains visible

- Geography, terrain, roads, coastlines, towns, and named objectives.
- Friendly-controlled territory and all friendly forces/resources.
- Historically known major installations, labeled with the age/status of current intelligence.
- Legal movement areas, operation costs, and friendly supply routes.

### What becomes knowledge-dependent

- Enemy and neutral control changes.
- Enemy force presence, type, count, readiness, supply, direction, and intent.
- Temporary depots, fortifications, air activity, naval activity, and transport movements.
- Enemy supply routes and operational bottlenecks.
- Whether an old installation is occupied, damaged, operational, or abandoned.

### Rendering policy

The campaign renderer must no longer accept raw `CampaignScenarioData` for player display. It receives a `CampaignMapViewModel` produced for one observing faction.

- **Unknown:** no force icon or truth-bearing tooltip/DOM data.
- **Reported:** generic `?` or domain marker over a patterned uncertainty area.
- **Located:** ghosted last-known symbol with age and radius.
- **Identified:** class symbol and strength band, never exact count.
- **Assessed:** formation label plus qualitative state bands.
- **Stale:** desaturated/dashed symbol with a clock badge; uncertainty expands visibly.
- **Disputed:** split/striped marker and “conflicting reports” label.
- **Suspected deception:** warning glyph only when the player's analysts have evidence for that assessment.

Fog must use pattern, shape, opacity, and text—not color alone. The background should remain readable; operational uncertainty is better represented by softened territory tint and information overlays than opaque black shroud.

### Truth-leak boundary

The following consumers must use the faction projection:

- campaign force and installation rendering;
- map selection panel and tooltips;
- engagement confirmation and enemy-strength estimate;
- War Room/Intelligence drawer;
- notifications and event log;
- strategic AI planning;
- precombat briefing and requisition warning;
- accessibility labels and keyboard navigation data.

The tactical battle generator may use truth internally to create the battle. Its player-facing briefing must use the frozen intelligence package captured when the engagement was committed.

## UI/UX design

### Campaign map hierarchy

The default map remains the primary command surface. Add a compact **Operational Picture** toolbar:

- Intel status: current Intelligence Capacity / committed capacity.
- New reports badge.
- Active operations count.
- Layer toggle: Operational Picture, Collection Coverage, Friendly Supply, and clean map.
- “Advance until report/arrival/contact” control so intelligence events naturally interrupt time passage.

Selecting a contact opens a persistent, non-modal Intelligence drawer. The map remains clickable and targetable.

### Intelligence drawer

Use three top-level tabs:

1. **Situation** — priority warnings, changes since last segment, assessed enemy posture, and sectors losing contact.
2. **Contacts** — sortable/filterable contact list synchronized with the map.
3. **Operations** — available assets, capacity, active orders, order composer, and counterintelligence posture.

Every contact card answers the same questions in the same order:

- **What:** contact/classification and strength band.
- **Where:** last-known hex or uncertainty area; Focus Map action.
- **When:** observed age in campaign time (“3 hours ago”), not a raw timestamp alone.
- **Confidence:** named level and disputed/stale state.
- **Why:** source chips and analyst explanation.
- **So what:** likely implication and available follow-up operations.

Do not show a single ambiguous “Intel 52” score. Coverage and capacity are different concepts and need separate language.

### Operation composer

Use a consistent five-step flow in the drawer:

1. Select operation.
2. Select eligible asset/source.
3. Pick area, route, contact, or force on the map.
4. Preview duration, capacity, supply/fuel, exposure, weather/air risk, and expected information type.
5. Confirm order.

During map selection, collapse the drawer to a narrow instruction rail rather than closing the workflow. Show valid target overlays and provide Cancel/Back. Keyboard users can move a hex cursor, focus contacts, and confirm without a pointer.

### Feedback and report inbox

On segment resolution, group intelligence changes into a concise briefing:

- New contact.
- Contact upgraded/downgraded.
- Contact moved or became stale.
- Conflicting report.
- Operation complete/partial/aborted/compromised.
- Enemy reconnaissance detected.

Clicking an item focuses the map and opens the relevant contact. Avoid narrating hidden truth: “No useful observation obtained” is valid; “There was no enemy there” is not unless verified by sufficient coverage.

### Counterintelligence UX

- Show preparation, active, compromised, and completed states.
- Show the deception story being projected and the signatures supporting it.
- Show an **assessed enemy reaction** only when collected evidence supports one, with its own confidence.
- Never show a binary “Fooled / Not Fooled” result.
- Make tradeoffs explicit before confirmation: capacity, supply, force restrictions, and compromise risk.

### Responsive and accessible behavior

- Desktop: right-side drawer, resizable between compact and detailed widths.
- Narrow view: bottom sheet with map still visible above; no full-screen modal for target picking.
- Contact state must be distinguishable without color through icon shape, border style, pattern, and text.
- Screen-reader labels include contact level, age, location uncertainty, strength band, and available action.
- New reports use an `aria-live="polite"` summary; critical contact changes do not steal focus.
- Respect reduced motion for pulsing contacts, uncertainty animation, and map focus.
- Minimum verification viewports: 1440×900, 1024×768, and 390×844.

### Onboarding

Add a short campaign intelligence lesson after basic campaign movement:

1. A visible enemy force moves out of observation and becomes last-known/stale.
2. The player assigns a ground recon patrol.
3. The report upgrades the contact and changes the engagement estimate.
4. The player activates Operational Security on a friendly concentration.
5. A scripted enemy false report teaches that low-confidence intelligence is a planning risk, not a lie detector minigame.

The tutorial must use the real campaign and operation controls.

## Tactical bridge

### Campaign to tactical

Extend `CampaignEngagementContext` with a frozen `intelligenceBriefing` created from the attacker's knowledge state at commitment time:

- known/estimated defender contacts;
- source, age, and confidence for each estimate;
- known fortifications/installations;
- suspected reserves and approach axes;
- explicit unknowns;
- overall resistance band derived from belief, not true `enemyForceValue`.

The tactical generator still uses actual committed defenders internally. Precombat and deployment display only the briefing. Surprise is therefore an earned consequence of weak intelligence or successful enemy counterintelligence.

### Tactical to campaign

On battle completion, generate source reports from what the player actually observed:

- identified participating formations;
- observed casualties and destroyed equipment;
- captured positions/installations;
- prisoners/documents or overrun HQs when later supported;
- observed retreat direction;
- unconfirmed reserve/contact reports.

Apply those reports to campaign knowledge before the next strategic segment. Do not grant exact survivor counts merely because the tactical engine knows them.

Tactical battlefield LOS/contact mechanics can remain separate internally, but they must emit reports through this shared campaign contract. Tactical counterintelligence actions are out of the first release unless they create campaign-relevant evidence and clear battlefield counterplay.

## AI requirements

First-class campaign fog is blocked until the Bot uses the same knowledge constraints as the player.

- Strategic planning receives `CampaignMapViewModel`/`CampaignKnowledgeState`, never raw enemy forces.
- AI collection priorities are chosen from objectives, stale fronts, missing contact, and suspected player concentration.
- AI assigns ground/air reconnaissance and counter-recon within the same capacity and asset rules.
- AI risk tolerance and verification behavior scale with difficulty.
- AI reacts to deception only through fused reports.
- AI can create deception operations using the same rules.
- Debug logs record `belief → decision` separately from truth, allowing cheating audits.

Difficulty policy:

- **Easy:** slower fusion, lower verification priority, more confidence in single-source reports.
- **Normal:** baseline rules and no hidden bonuses.
- **Hard:** better source prioritization, corroboration, and counter-recon timing; still no truth access.

## Data contracts

Create a dedicated domain module rather than extending the current scalar economy field.

```ts
type IntelKnowledgeLevel = "unknown" | "reported" | "located" | "identified" | "assessed";
type IntelContactState = "current" | "stale" | "disputed" | "lost";
type IntelSourceType =
  | "directContact"
  | "groundRecon"
  | "airRecon"
  | "sigint"
  | "logisticsSignature"
  | "battleReport"
  | "historicalBrief"
  | "deception";

interface CampaignIntelSourceReport {
  id: string;
  observerFaction: CampaignFactionKey;
  sourceType: IntelSourceType;
  sourceAssetId?: string;
  observedSegment: number;
  receivedSegment: number;
  reliability: number;               // internal 0..100
  area: { centerHexKey: string; radius: number };
  claims: IntelClaim[];
  correlationKeys: string[];
}

interface CampaignIntelContact {
  id: string;
  observerFaction: CampaignFactionKey;
  subjectKind: "force" | "installation" | "control" | "route" | "activity";
  level: IntelKnowledgeLevel;
  state: IntelContactState;
  confidence: number;                // internal; UI uses bands
  location: { centerHexKey: string; radius: number };
  classificationBand?: string;
  strengthBand?: "trace" | "light" | "moderate" | "heavy" | "massed";
  readinessBand?: "disrupted" | "degraded" | "ready" | "high";
  supplyBand?: "isolated" | "strained" | "adequate" | "wellSupplied";
  movementAssessment?: { state: string; direction?: string };
  lastObservedSegment: number;
  lastUpdatedSegment: number;
  sourceReportIds: string[];
  analystNotes: string[];
}

interface CampaignIntelOperation {
  id: string;
  faction: CampaignFactionKey;
  type: "groundRecon" | "airRecon" | "observe" | "sigint" | "verify" | "counterRecon" | "opsec" | "conceal" | "phantom";
  status: "planned" | "preparing" | "active" | "complete" | "partial" | "aborted" | "compromised";
  target: IntelOperationTarget;
  assignedAssetIds: string[];
  capacityCommitted: number;
  startSegment: number;
  resolveSegment: number;
  playerVisibleOutcome: IntelOperationPublicOutcome | null;
}

interface CampaignKnowledgeState {
  faction: CampaignFactionKey;
  contacts: CampaignIntelContact[];
  sourceReports: CampaignIntelSourceReport[];
  operations: CampaignIntelOperation[];
  priorities: IntelPriority[];
  capacity: { total: number; committed: number };
  lastBriefedSegment: number;
}

interface CampaignMapViewModel {
  observerFaction: CampaignFactionKey;
  knownTerrain: CampaignKnownTerrainHex[];
  friendlyForces: CampaignFriendlyForceView[];
  enemyContacts: CampaignEnemyContactView[];
  knownInstallations: CampaignInstallationView[];
  controlEstimates: CampaignControlEstimateView[];
  activeOperations: CampaignIntelOperationView[];
}
```

True entity identifiers may be linked internally for correlation, but must never be serialized into the player-facing view model or DOM.

## Resolution pipeline

Create one pure, testable campaign intelligence service. Per segment it runs in this order:

1. `buildObservableSignatures(trueState, segment)`
2. `resolveCollection(factionAssets, priorities, operations, signatures)`
3. `resolveCounterIntelligence(enemyPostures, collectionReports)`
4. `injectObservableDeception(deceptionOperations, enemyCollectionCoverage)`
5. `fuseReports(previousKnowledge, newReports)`
6. `decayAndProjectContacts(knowledge, legalMovementGraph)`
7. `buildCampaignMapView(observerFaction, trueState, knowledge)`
8. `publishIntelBriefDelta(previousView, nextView)`

Use a seeded campaign RNG for probabilistic collection, interception, and compromise outcomes so save/reload and tests reproduce results. Store operation seeds/results in the save.

## Engineering plan

### Milestone 0 — correct contracts and quarantine prototypes

- Mark intelligence, counterintelligence, and campaign fog as unimplemented in competitive/product documentation.
- Add an explicit feature flag such as `campaignIntelV1`; keep it off outside development until the release gate passes.
- Remove static intelligence fallback data from player-facing campaign routes.
- Stop presenting tactical counterintelligence prototypes as strategic features.
- Add architecture tests demonstrating the current truth leak before changing the renderer.

**Exit gate:** the product has no misleading shipped UI or documentation, and tests identify every current enemy-information leak.

### Milestone 1 — truth/knowledge separation and campaign fog substrate

- Add `campaignIntelTypes.ts` and `CampaignIntelligenceState.ts`.
- Add versioned, per-faction knowledge state to campaign saves with migration from `intelCoverage`.
- Build the sanitized `CampaignMapViewModel` projection.
- Refactor `CampaignMapRenderer` and selection/tooltips to consume the projection.
- Render Unknown, Reported, Located, Identified, Assessed, Stale, and Disputed states.
- Add the operational-picture legend and debug-only truth/belief comparison overlay.

**Exit gate:** no enemy exact unit type/count/control value outside current knowledge appears in renderer markup, tooltips, selection panels, logs, or accessibility labels.

### Milestone 2 — collection, confidence, decay, and briefing UI

- Implement observable signatures, source reports, fusion, confidence levels, and movement-aware decay.
- Implement direct contact, ground recon, aerial recon, observe-sector, SIGINT priority, and battle-report sources.
- Replace the scalar Intel card with capacity, coverage, active operations, and new-report summaries.
- Ship Situation and Contacts tabs, coverage overlay, contact cards, report inbox, filters, and map focus.
- Add segment interruption when a material report arrives.

**Exit gate:** a moving enemy force can be discovered, classified, lost, projected as stale, reacquired, and explained entirely through visible reports.

### Milestone 3 — counterintelligence and deception

- Implement Operational Security, Counter-Recon Sweep, Conceal Concentration, and Phantom Concentration.
- Make counterintelligence modify enemy collection/fusion through reports and signatures.
- Implement preparation, compromise, partial outcome, and observed-reaction states.
- Replace direct bot-target injection and static true/false verification.
- Ship Operations tab and the five-step map order composer.

**Exit gate:** deception can alter the opposing faction's belief and decisions without any direct AI target override or truth notification to the deceiving player.

### Milestone 4 — strategic AI parity

- Route all Bot planning through its sanitized knowledge view.
- Add collection priority, reconnaissance assignment, counter-recon, OPSEC, and deception decisions.
- Add belief/decision audit logs and no-cheating tests.
- Tune Easy/Normal/Hard through competence rules only.

**Exit gate:** automated tests fail if Bot strategy reads hidden player forces, and observed AI decisions can be traced to its reports.

### Milestone 5 — tactical handoff and campaign consequences

- Freeze an intelligence briefing when an engagement is committed.
- Derive player-facing resistance bands from belief rather than `enemyForceValue`.
- Use actual truth only inside `CampaignBattleGenerator`.
- Seed tactical deployment contacts/known installations from the briefing.
- Generate campaign source reports from tactical observations and the AAR.
- Connect surviving forces, territory, and strategic consequences when campaign consequence work lands.

**Exit gate:** poor reconnaissance can produce genuine tactical surprise, while good reconnaissance produces demonstrably better—not perfect—pre-battle information.

### Milestone 6 — onboarding, balance, accessibility, and release certification

- Add the real-control campaign intelligence lesson.
- Tune operation costs, confidence, decay, signature, and deception plausibility using playtest data.
- Complete responsive, keyboard, screen-reader, reduced-motion, and non-color state validation.
- Remove the feature flag only after save migration, long-campaign soak, and UX certification.

**Exit gate:** all acceptance criteria below pass and no production route falls back to sample intelligence.

## File-level implementation map

| Area | Planned work |
|---|---|
| `src/core/campaignTypes.ts` | Remove `intelCoverage` as gameplay authority; reference versioned intelligence contracts |
| `src/core/campaignIntelTypes.ts` | New serializable domain types |
| `src/state/CampaignIntelligenceState.ts` | New pure report/fusion/decay/operation service |
| `src/state/CampaignState.ts` | Own per-faction knowledge, resolve it each segment, expose sanitized views |
| `src/rendering/CampaignMapRenderer.ts` | Render `CampaignMapViewModel`, fog/contact/coverage layers, no truth access |
| `src/ui/screens/CampaignScreen.ts` | Operational-picture toolbar, map synchronization, time interruption |
| `src/ui/components/CampaignIntelDrawer.ts` | New Situation/Contacts/Operations UI |
| `src/ui/components/IntelOperationComposer.ts` | New accessible map-targeting workflow |
| `src/game/campaign/EngagementContextBuilder.ts` | Separate true battle context from faction intelligence briefing |
| `src/game/campaign/CampaignBattleGenerator.ts` | Consume truth internally; seed only known tactical information for player UI |
| `src/data/reconIntelSnapshot.ts` | Remove production fallback; retain only explicit test fixtures or delete |
| `src/ui/components/PopupManager.ts` | Retire campaign intelligence dependency on tactical `GameEngine` |
| `src/game/GameEngine.ts` | Keep tactical visibility/report emission; remove/quarantine magical counterintel prototype |
| Save schema/migration | Persist knowledge, reports, operations, seeds, priorities, briefing-read state |
| Editor | Author known-at-start facts, source reliability, intel assets, and tutorial conditions |

## Test plan

### Domain/unit tests

- Knowledge levels and threshold boundaries.
- Independent-source corroboration and contradictory reports.
- Mobile/stationary/fixed-object decay and uncertainty expansion.
- Ground/air/SIGINT source range, cost, weather, and risk.
- OPSEC signature reduction and order tradeoff.
- Counter-recon disruption and observer exposure.
- Deception report generation only where enemy collection can observe it.
- No binary truth return from Verify Contact.
- Save/reload reproducibility with seeded outcomes.
- Old-save migration from scalar `intelCoverage`.

### Security/no-leak contract tests

- Hidden enemy types/counts do not exist in `CampaignMapViewModel`.
- Hidden truth does not appear in SVG/HTML attributes, text, tooltips, ARIA labels, logs, or engagement confirmation.
- Player and Bot receive different projections of the same truth state.
- Strategic AI interfaces reject raw campaign truth.
- Prebattle estimate remains frozen even if truth changes after commitment.

### Renderer/component tests

- Visual state for every knowledge/contact state.
- Pattern/shape distinctions without color.
- Coverage layer and uncertainty rings at multiple zoom levels.
- Contact list ↔ map selection/focus synchronization.
- Empty, no-capacity, no-asset, stale, disputed, partial, compromised, and error states.
- Responsive drawer/bottom sheet and focus restoration.

### End-to-end stories

1. Discover → classify → lose → reacquire a mobile enemy force.
2. Order aerial recon, experience weather/air-defense degradation, and receive a partial report.
3. Verify a disputed contact through an independent source.
4. Activate OPSEC and observe reduced enemy confidence in AI debug audit.
5. Run Phantom Concentration and observe a belief-driven enemy reaction without certainty of success.
6. Commit an under-observed engagement and encounter tactical surprise.
7. Complete a battle and see only observed enemy information update the campaign.
8. Save/reload mid-operation without changing outcomes or report-read state.
9. Complete the intelligence tutorial by keyboard at all certification viewports.

## Release acceptance criteria

### Mechanics

- Both factions have independent, persistent knowledge states.
- At least five meaningful knowledge levels, recency, confidence bands, source provenance, and uncertainty radius affect play.
- Ground recon, air recon, observation, and one signals source create real reports.
- Operational Security, Counter-Recon Sweep, and Phantom Concentration have costs, duration, counterplay, and partial/failure states.
- Deception affects AI only through its belief state.
- Contacts decay and move as estimates without updating from hidden truth.
- Campaign engagements use belief-derived player estimates and truth-derived internal generation.
- Tactical observations feed campaign reports.

### UI/UX

- From the default campaign screen, a player can understand what/where/when/confidence/source for any contact in no more than two interactions.
- A complete collection or counterintelligence order can be issued without leaving the map.
- Exact enemy type/count is never shown below the designed assessment level and exact counts are never exposed as hidden markup.
- New, stale, disputed, and suspected-deception states are distinguishable without color.
- Every operation presents cost, duration, assigned asset, risk, and expected information before confirmation.
- Segment advancement stops or summarizes when material intelligence arrives.
- Tutorial, keyboard, screen reader, reduced motion, and responsive layouts pass the defined viewports.

### Engineering quality

- Production contains no static sample brief fallback.
- Save schema is versioned and old saves migrate safely.
- Intelligence resolution is pure/testable and deterministic from its stored seed.
- Player and AI planning boundaries enforce faction projections.
- Full unit, integration, renderer, and end-to-end suites pass.
- A debug-only truth-versus-belief inspector supports balancing and cheating audits without shipping player access.

## Explicit non-goals for the first release

- A full espionage-agent character system.
- Codebreaking minigames.
- Tactical “press button to become invisible” abilities.
- Exact probabilistic odds shown to the player.
- Omniscient verification of a report.
- Multiplayer secrecy/network authority.
- Dynamic weather implementation itself; intelligence operations should consume a weather interface when it exists.

## Recommended product decisions

These defaults keep the system legible and aligned with FSG's scale:

1. Keep terrain and named objectives visible; fog operational forces and changing state.
2. Make campaign Intelligence the authoritative home; Recon is a collection asset, not a separate competing information screen.
3. Use qualitative confidence and strength bands in the UI, with numeric values internal only.
4. Make Intelligence Capacity a committed operational resource, replacing generic charges and the current global coverage score.
5. Require AI parity before calling campaign fog shipped.
6. Release the system only as one gated feature; avoid shipping decorative fog before collection and counterplay work.
