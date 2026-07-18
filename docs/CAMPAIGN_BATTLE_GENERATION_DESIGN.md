# Campaign Battle Generation — Design

Date: 2026-07-18. Status: Approved direction (type caps + RP reserve; battle hex + adjacent availability; template library; phased implementation).
Related: `design/CAMPAIGN_MAP_DESIGN.md` (Phase 4 "Gameplay Layer"), `docs/CAMPAIGN_CLASS_A_PLUS_GAP_REVIEW.md` (Gaps 2 and 3).

## Summary

Today, every campaign engagement loads the same generic tactical scenario with a fixed 1,300 RP budget and caps derived from the global economy. This design makes the tactical battle a direct consequence of the strategic situation: the mission type comes from what is being attacked, the map comes from where it is, and the requisition budget comes from which forces are actually in position to fight. Outgunned battles are a supported, first-class outcome — the system informs, it never balances.

## Player experience walkthrough

The player moves two infantry groups and a Panzer IV group onto a hex adjacent to an enemy-held heavy fortification on the Normandy coast. They select the enemy hex and click **Queue Engagement**. The confirmation panel shows: mission type **Fortified Assault**, the committed-forces list drawn from the battle hex and adjacent friendly tiles, an intel estimate of the defenders ("Est. enemy strength: heavy — you are outgunned roughly 2:1"), and air support available from the airbase in range. Proceeding opens the requisition screen, where allocation rows are capped by what was committed (3 infantry, 1 armor — no more, because no more are in position) plus a small RP reserve from the economy for consumables (ammo, fuel, a supply convoy). The battle takes place on a fortified-coast template with the defenders entrenched. Victory captures the hex and the survivors return to the map; defeat returns the survivors — minus casualties — to their staging tiles.

## Mission type derivation

Mission type is computed from the defender tile's palette role, the attacker, and the water context between origin and target. No player selection — the map is the truth.

| Defender tile role | Mission type | Notes |
| --- | --- | --- |
| `fortificationHeavy` | Fortified Assault | Defenders entrenched 3; engineer-favored |
| `fortificationLight` | Line Assault | Defenders entrenched 2 |
| `navalBase` | Port Assault | Coastal template; naval gunfire support eligible |
| `airbase` | Airfield Raid | Objective: hangars/strip; defender air scrambles |
| `logisticsHub` | Depot Raid | Objective: depot tiles; victory yields supply bonus |
| `region` / neutral | Meeting Engagement | Symmetric open-ground template |

Modifiers, applied on top of the base type: **Amphibious** when the attacking forces' staging tiles are separated from the target by water hexes (`mapExtents.waterHexes`) — landing-craft framing, no player artillery baseline; **Counterattack** when the Bot is the attacker (Phase 4, once campaign AI exists) — the mission family inverts to a defense (Hold the Line, Port Defense, etc.) using the same table from the defender's perspective.

`CampaignPendingEngagement.tags` already exists as the transport for "which battle template to instantiate"; this design keeps tags for compatibility but adds a structured context object (below) as the authoritative payload.

## Force availability and commitment

**Availability rule: battle hex + adjacent.** Ground forces on the contested hex (defender) or on friendly tiles adjacent to it (attacker) are eligible. One campaign hex is 10 km — adjacency is the operational radius of a same-day attack. Air units are not bound by adjacency: airbases whose sortie range covers the battle hex contribute air-allocation slots, bounded by `airSortieCapacity`. Battleships on naval-base or task-force tiles adjacent to a coastal battle hex contribute `shoreFireControlParty` eligibility rather than appearing as units.

**Requisition model: type caps + RP reserve.** Committed campaign force groups convert to per-allocation-key quantity caps via the mapping table below. The requisition screen additionally receives a discretionary RP reserve derived from the player economy — spendable only on consumables and support (`ammo`, `fuel`, `supplyConvoy`, `medic`, `maintenance`), never on combat formations beyond the caps. This keeps fidelity (what is on the map is what fights) while preserving the requisition screen's role as a planning step.

RP reserve formula (initial tuning): `min(economy.supplies / 4, 600) + general.supplyBonus × 5`, floored at 150 so even a starved offensive can buy minimal ammunition. Values chosen to sit below the 1,300 RP of the authored missions; tune in playtesting.

### Campaign → allocation mapping table

Lives in `src/game/campaign/campaignForceMapping.ts` as the single source of truth.

| Campaign `unitType` | Allocation key | Note |
| --- | --- | --- |
| `Infantry`, `Infantry_42` | `infantry` | |
| `Infantry_Elite` | `infantry` | +1 experience level on spawn (template hook) |
| `AT_Infantry` | `antiTankBattery` | Closest tactical analogue |
| `Panzer_IV`, `Panzer_V`, `Light_Tank` | `tank` | |
| `Heavy_Tank` | `heavyTankCompany` | |
| `Howitzer_105`, `Artillery_105mm` | `howitzer` | |
| `Artillery_155mm` | `corpsArtilleryGroup` | |
| `Rocket_Artillery` | `rocketArtilleryBattalion` | |
| `SP_Artillery` | `spArtilleryGroup` | |
| `Fighter` | `fighter` | Requires in-range airbase |
| `Interceptor` | `interceptorWing` | Requires in-range airbase |
| `Bomber` | `bomber` | Requires in-range airbase |
| `Supply_Truck` | `supplyConvoy` | |
| `Battleship` | `shoreFireControlParty` | Coastal battles only |
| `Transport_Ship` | — | No tactical analogue; enables amphibious modifier |

Unmapped types are logged and skipped, never crash.

## Outgunned doctrine

The system never balances a battle. Before commit, the engagement panel shows an intel-grade force comparison: total mapped RP value of the player's available forces versus an estimate of the defender pool. The estimate is banded, not exact ("light / comparable / heavy / overwhelming"), which leaves room for the deferred fog-of-war system to sharpen or blur it later. If the ratio is worse than 1:1.5 the confirmation requires an explicit acknowledgment ("Launch anyway — we understand the odds"). The precombat screen repeats the warning banner. Defeat consequences are the standard ones — casualties and lost initiative — so a desperate attack is a legitimate strategic gamble, not a punished mistake.

## Enemy force generation

Symmetric with the player rule: the defender pool is the contested hex plus adjacent tiles of the defending faction. The pool converts through the same mapping table into a predeployed Bot roster written into the tactical scenario's `sides.Bot.units`, anchored to template-defined defense zones. Entrenchment comes from the tile role (fortificationHeavy 3, fortificationLight 2, bases 1, region 0). `sides.Bot.resources` scales with the defender's economy share so a starving pocket fights with depleted ammo. The Bot `goal`/`strategy` strings come from the mission type (e.g., Fortified Assault → "Hold the works; artillery breaks assaults on the wire").

## Tactical map templates

A template is an authored tactical scenario (same schema as `scenario_*.json`) with the `sides.*.units` arrays emptied into named **anchor zones** and a metadata block:

```ts
interface BattleTemplateMeta {
  key: string;                       // "fortified_coast_01"
  missionTypes: CampaignMissionType[]; // which mission types this map serves
  terrain: "coastal" | "inland" | "river" | "urban" | "open";
  attackerZones: string[];           // deploymentZones keys for the attacker
  defenderZones: string[];           // anchor zones for generated defenders
  supportsAmphibious: boolean;
}
```

Selection: filter the library by mission type, then by terrain context derived from the campaign hex (coastal if adjacent to water hexes, otherwise inland), then rotate deterministically by engagement id so repeated battles at the same spot vary. Fallback is always the meeting-engagement template. The existing 15+ authored scenarios are the seed stock — most convert to templates by tagging metadata and parameterizing their unit lists.

## Consequences (closes Gap 3)

Committing forces earmarks them: the campaign tiles' force groups are decremented when the battle launches and held in the engagement record. On resolution, `applyBattleOutcome` (extended) returns survivors — committed counts scaled by the battle's casualty fraction per category — to their staging tiles. Victory as attacker transfers `factionControl` of the contested hex to the player and stamps `controlSinceSegment`; the front is recomputed from the new control map rather than polyline-edited. Defeat leaves control unchanged and survivors return. Air and naval contributors decrement sortie capacity for the day rather than being consumed.

## Data contracts

```ts
/** Structured payload attached to a pending engagement when it is queued. */
export interface CampaignEngagementContext {
  engagementId: string;
  battleHexKey: string;
  attacker: CampaignFactionKey;
  defender: CampaignFactionKey;
  missionType: CampaignMissionType;
  amphibious: boolean;
  /** Friendly force groups eligible to commit, with their staging hex. */
  availableForces: Array<{ hexKey: string; unitType: string; count: number }>;
  /** Per-allocation-key caps derived from availableForces via the mapping table. */
  allocationCaps: Partial<Record<UnitAllocationKey, number>>;
  /** Defender pool (exact counts internally; UI shows banded estimate). */
  enemyForces: Array<{ hexKey: string; unitType: string; count: number }>;
  /** Air sorties reachable from in-range friendly airbases. */
  airSorties: number;
  /** Discretionary consumables budget for the requisition screen. */
  rpReserve: number;
  /** Player-vs-enemy mapped RP ratio used for the outgunned banner. */
  forceRatio: number;
  templateKey: string | null;   // resolved in Phase 2; null = legacy default scenario
  frontKey: string | null;
  objectiveKey: string | null;
}
```

The context rides on the pending engagement (new optional `context` field on `CampaignPendingEngagement`) and reaches precombat through the existing campaign bridge snapshot. Everything is optional-tolerant: a missing context falls back to today's behavior.

## Implementation phases

**Phase 1 — Context and requisition (this iteration).** `campaignForceMapping.ts` (mapping + RP values); `EngagementContextBuilder` (mission type, availability, caps, enemy pool, RP reserve, force ratio); CampaignScreen queues engagements with context and shows the outgunned confirmation; PrecombatScreen consumes context — per-type caps on allocation rows, budget = rpReserve, mission-type headline, outgunned banner. Tests for the builder (availability radius, mapping, mission types, ratio banding) and for precombat cap enforcement.

**Phase 2 — Templates and enemy spawning (implemented 2026-07-18).** `battleTemplates.ts` registry tags 12 authored scenarios by mission type and terrain; `CampaignBattleGenerator.ts` clones the selected template, replaces the Bot order of battle from the context's enemy pool (canon loadouts via the allocation mapping, mission-type entrenchment, RP-scaled Bot resources, doctrine strings), and caches per engagement id so precombat and battle share one object. Both screens resolve through `resolveScenarioForMission`; the hardcoded `campaign → defaultScenario` path survives only as the no-context/error fallback. Validation recognizes generated scenarios via the `campaignTemplateKey` marker; the campaign deployment-depth minimum was relaxed to 3 for shallow beachhead templates. Amphibious variants remain future work (coastal flag is captured and steers template terrain).

**Phase 3 — Consequences.** Earmarking, survivor return, territory transfer, front recomputation from control map, sortie-capacity consumption.

**Phase 4 — Counterattacks.** Once campaign AI exists (Gap 1), Bot-initiated engagements invert the mission table to the defense family; the same context builder serves both directions via the `attacker` field.

## Testing strategy

Builder unit tests: adjacency radius (in/out cases), water detection for amphibious, each palette role → mission type, mapping table completeness against `campaign01.json`'s unit types, RP reserve floor and cap, ratio banding edges. Precombat integration test: context with caps {infantry: 2, tank: 1} renders capped steppers and blocks proceed above cap while allowing consumables from reserve. Regression: engagement without context behaves exactly as today (legacy path).
