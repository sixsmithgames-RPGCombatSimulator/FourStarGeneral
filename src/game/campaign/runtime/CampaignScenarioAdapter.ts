/**
 * MODULE: CampaignScenarioAdapter
 * WHAT: Splits shipped campaign scenarios into immutable definitions and mutable Campaign 2.0 runtime records, then projects compatibility snapshots.
 * WHY: Campaign 2.0 must replace mixed scenario/runtime ownership without breaking current content or screens during migration.
 *
 * DEPENDENCIES: Existing campaign contracts provide legacy data; CampaignCanonical and CampaignRandom provide deterministic identity; invariant validation rejects corrupt output.
 * EXPORTS: Scenario split, runtime creation, definition freezing, and legacy projection APIs.
 */

import {
  CAMPAIGN_HEX_SCALE_KM,
  type CampaignBriefedStrategicRegion,
  type CampaignArcDefinition,
  type CampaignBriefedStrategicSite,
  type CampaignFactionEconomy,
  type CampaignForceGroup,
  type CampaignFrontLine,
  type CampaignMapExtents,
  type CampaignObjective,
  type CampaignPendingEngagement,
  type CampaignScenarioData,
  type CampaignTileDefinition,
  type CampaignTileInstance,
  type CampaignTurnState
} from "../../../core/campaignTypes";
import type { CampaignKnowledgeState } from "../../../core/campaignIntelTypes";
import { computeCampaignContentHash, createStableCampaignRecordId } from "./CampaignCanonical";
import { CampaignRandom } from "./CampaignRandom";
import { assertCampaignRuntimeState } from "./CampaignInvariantValidator";
import {
  projectCampaignFormationForces,
  seedLegacyCampaignFormationRegistry
} from "../formations/FormationLifecycleService";
import { createCampaignInfrastructureState } from "../infrastructure/CampaignInfrastructureRules";
import { attachCampaignFormationProvenanceToContext } from "../formations/CampaignFormationBattleAdapter";
import { reconcileCampaignEngagementLedger } from "../engagements/CampaignEngagementLedgerService";
import {
  assertCampaignObjectiveDefinitionContent,
  reconcileCampaignObjectiveRuntime
} from "../objectives/CampaignObjectiveEvaluator";
import {
  CAMPAIGN_RUNTIME_VERSION,
  CAMPAIGN_SCENARIO_DEFINITION_VERSION,
  CampaignRuntimeError,
  type CampaignDomainEvent,
  type CampaignInitialStateDefinition,
  type CampaignLegacyProjection,
  type CampaignReadonly,
  type CampaignRuntimeState,
  type CampaignScenarioDefinition,
  type CampaignScenarioMapDefinition,
  type CampaignTileRuntime
} from "./campaignRuntimeTypes";

type CampaignTileWithSegment = CampaignTileInstance & { controlSinceSegment?: number };

/** Inputs required to create a runtime without implicit time, identity, or random defaults. */
export interface CreateCampaignRuntimeOptions {
  readonly campaignId: string;
  readonly seed: number;
  readonly currentSegment: number;
  readonly turnState: CampaignTurnState | null;
  readonly queuedDecisions: CampaignRuntimeState["compatibility"]["queuedDecisions"];
  readonly engagements: readonly CampaignPendingEngagement[];
  readonly activeEngagementId: string | null;
  readonly knowledgeByFaction: Readonly<Record<string, CampaignKnowledgeState>>;
  /** Explicit mutable snapshot fields supplied only by a certified legacy/save migration. */
  readonly runtimeSeedOverride?: CampaignRuntimeSeedOverride;
}

/** Mutable legacy fields that replace authored initial state while retaining the resolved definition identity. */
export interface CampaignRuntimeSeedOverride {
  readonly tiles: CampaignReadonly<CampaignScenarioData["tiles"]>;
  readonly economies: CampaignReadonly<CampaignFactionEconomy[]>;
  readonly fronts: CampaignReadonly<CampaignFrontLine[]>;
}

/**
 * WHAT: Produces a mutable defensive clone from immutable campaign content.
 * WHY: Compatibility projections and runtime creation must never share references with the frozen authored definition.
 *
 * @param value - Immutable campaign content.
 * @returns Structurally equivalent mutable clone.
 */
function cloneReadonlyCampaignData<T>(value: CampaignReadonly<T>): T {
  // structuredClone creates new writable objects; the assertion removes only compile-time readonly markers.
  return structuredClone(value) as T;
}

/**
 * WHAT: Recursively freezes authored campaign content.
 * WHY: Compile-time readonly types alone do not prevent accidental JavaScript mutation at runtime.
 *
 * @param value - Campaign definition value to freeze.
 * @returns The same value with recursively readonly typing.
 */
function deepFreezeCampaignData<T>(value: T): CampaignReadonly<T> {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((entry) => {
      deepFreezeCampaignData(entry);
    });
    Object.freeze(value);
  }
  // Every reachable object was frozen above, so recursively readonly typing matches runtime behavior.
  return value as CampaignReadonly<T>;
}

function assertForceGroupAvailability(
  forces: readonly CampaignForceGroup[] | undefined,
  path: string
): void {
  (forces ?? []).forEach((force, index) => {
    if (force.availableFromSegment !== undefined
      && (!Number.isInteger(force.availableFromSegment) || force.availableFromSegment < 0)) {
      throw new CampaignRuntimeError(
        "INVALID_SCENARIO",
        `Campaign force availability at ${path}.${index} must be a non-negative integer segment.`,
        { path: `${path}.${index}.availableFromSegment`, value: String(force.availableFromSegment) }
      );
    }
    if (force.availabilityCopy !== undefined
      && (force.availableFromSegment === undefined || force.availabilityCopy.trim().length === 0)) {
      throw new CampaignRuntimeError(
        "INVALID_SCENARIO",
        `Campaign force availability copy at ${path}.${index} requires an arrival segment and non-empty copy.`,
        { path: `${path}.${index}.availabilityCopy` }
      );
    }
  });
}

/**
 * WHAT: Validates the minimum authored scenario identity and map geometry needed by runtime creation.
 * WHY: A malformed definition must fail before partial runtime records or save identities are produced.
 *
 * @param scenario - Shipped campaign scenario candidate.
 * @throws CampaignRuntimeError when identity, dimensions, or scale are invalid.
 */
function assertLegacyScenarioCanSplit(scenario: CampaignScenarioData): void {
  if (scenario.key.trim().length === 0) {
    throw new CampaignRuntimeError("INVALID_SCENARIO", "Campaign scenario key cannot be empty.", { path: "scenario.key" });
  }
  if (!Number.isInteger(scenario.dimensions.cols) || scenario.dimensions.cols <= 0) {
    throw new CampaignRuntimeError(
      "INVALID_SCENARIO",
      "Campaign scenario column count must be a positive integer.",
      { path: "scenario.dimensions.cols", value: scenario.dimensions.cols }
    );
  }
  if (!Number.isInteger(scenario.dimensions.rows) || scenario.dimensions.rows <= 0) {
    throw new CampaignRuntimeError(
      "INVALID_SCENARIO",
      "Campaign scenario row count must be a positive integer.",
      { path: "scenario.dimensions.rows", value: scenario.dimensions.rows }
    );
  }
  const scale = scenario.hexScaleKm ?? CAMPAIGN_HEX_SCALE_KM;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new CampaignRuntimeError(
      "INVALID_SCENARIO",
      "Campaign scenario hex scale must be a positive finite number.",
      { path: "scenario.hexScaleKm", value: String(scale) }
    );
  }
  scenario.tiles.forEach((tile, index) => {
    const col = tile.hex.q;
    const row = tile.hex.r + Math.floor(tile.hex.q / 2);
    if (!Number.isInteger(tile.hex.q) || !Number.isInteger(tile.hex.r)
      || col < 0 || col >= scenario.dimensions.cols
      || row < 0 || row >= scenario.dimensions.rows) {
      throw new CampaignRuntimeError(
        "INVALID_SCENARIO",
        `Campaign tile ${index} falls outside the declared ${scenario.dimensions.cols}x${scenario.dimensions.rows} operational grid.`,
        { path: `scenario.tiles.${index}.hex`, q: tile.hex.q, r: tile.hex.r, col, row }
      );
    }
    assertForceGroupAvailability(tile.forces, `scenario.tiles.${index}.forces`);
  });
  Object.entries(scenario.tilePalette).forEach(([paletteKey, tile]) => {
    if (tile.productionCapacity !== undefined
      && (!Number.isFinite(tile.productionCapacity) || tile.productionCapacity < 0)) {
      throw new CampaignRuntimeError(
        "INVALID_SCENARIO",
        `Campaign support capacity ${paletteKey} must be a non-negative finite number.`,
        { path: `scenario.tilePalette.${paletteKey}.productionCapacity`, value: tile.productionCapacity }
      );
    }
    assertForceGroupAvailability(tile.forces, `scenario.tilePalette.${paletteKey}.forces`);
  });
  const registrationAnchors = new Map((scenario.mapExtents?.registrationAnchors ?? []).map((anchor, index) => {
    const row = anchor.hex.r + Math.floor(anchor.hex.q / 2);
    if (!anchor.key.trim() || !anchor.label.trim() || !anchor.sourceLabel.trim()
      || !Number.isInteger(anchor.hex.q) || !Number.isInteger(anchor.hex.r)
      || anchor.hex.q < 0 || anchor.hex.q >= scenario.dimensions.cols
      || row < 0 || row >= scenario.dimensions.rows) {
      throw new CampaignRuntimeError(
        "INVALID_SCENARIO",
        `Campaign registration anchor ${index} is incomplete or outside the declared operational grid.`,
        { path: `scenario.mapExtents.registrationAnchors.${index}` }
      );
    }
    return [anchor.key, anchor] as const;
  }));
  if (registrationAnchors.size !== (scenario.mapExtents?.registrationAnchors?.length ?? 0)) {
    throw new CampaignRuntimeError(
      "INVALID_SCENARIO",
      "Campaign registration anchors must use unique keys.",
      { path: "scenario.mapExtents.registrationAnchors" }
    );
  }
  (scenario.mapExtents?.distanceCalibrations ?? []).forEach((calibration, index) => {
    const from = registrationAnchors.get(calibration.fromAnchorKey);
    const to = registrationAnchors.get(calibration.toAnchorKey);
    if (!from || !to || from.key === to.key
      || !Number.isFinite(calibration.expectedDistanceKm) || calibration.expectedDistanceKm <= 0
      || !Number.isFinite(calibration.toleranceKm) || calibration.toleranceKm < 0
      || !calibration.sourceLabel.trim()) {
      throw new CampaignRuntimeError(
        "INVALID_SCENARIO",
        `Campaign distance calibration ${index} is incomplete or references an unknown anchor.`,
        { path: `scenario.mapExtents.distanceCalibrations.${index}` }
      );
    }
    const hexDistance = Math.max(
      Math.abs(from.hex.q - to.hex.q),
      Math.abs(from.hex.r - to.hex.r),
      Math.abs((-from.hex.q - from.hex.r) - (-to.hex.q - to.hex.r))
    );
    const measuredKm = hexDistance * scale;
    if (Math.abs(measuredKm - calibration.expectedDistanceKm) > calibration.toleranceKm) {
      throw new CampaignRuntimeError(
        "INVALID_SCENARIO",
        `Campaign distance calibration ${calibration.fromAnchorKey} to ${calibration.toAnchorKey} exceeds its registered tolerance.`,
        { path: `scenario.mapExtents.distanceCalibrations.${index}`, measuredKm, expectedKm: calibration.expectedDistanceKm }
      );
    }
  });
  const briefedSiteKeys = new Set<string>();
  const briefedSiteLocations = new Set<string>();
  (scenario.briefedStrategicSites ?? []).forEach((site, index) => {
    const col = site.hex.q;
    const row = site.hex.r + Math.floor(site.hex.q / 2);
    const locationKey = `${site.observerFaction}:${site.hex.q},${site.hex.r}`;
    if (!site.key.trim() || briefedSiteKeys.has(site.key)) {
      throw new CampaignRuntimeError(
        "INVALID_SCENARIO",
        `Campaign briefing site ${index} must have a unique non-empty key.`,
        { path: `scenario.briefedStrategicSites.${index}.key`, key: site.key }
      );
    }
    briefedSiteKeys.add(site.key);
    if (briefedSiteLocations.has(locationKey)) {
      throw new CampaignRuntimeError(
        "INVALID_SCENARIO",
        `Campaign briefing site ${site.key} duplicates another marker at the same location.`,
        { path: `scenario.briefedStrategicSites.${index}.hex`, q: site.hex.q, r: site.hex.r }
      );
    }
    briefedSiteLocations.add(locationKey);
    if (!Number.isInteger(site.hex.q) || !Number.isInteger(site.hex.r)
      || col < 0 || col >= scenario.dimensions.cols
      || row < 0 || row >= scenario.dimensions.rows) {
      throw new CampaignRuntimeError(
        "INVALID_SCENARIO",
        `Campaign briefing site ${site.key} falls outside the declared operational grid.`,
        { path: `scenario.briefedStrategicSites.${index}.hex`, q: site.hex.q, r: site.hex.r, col, row }
      );
    }
    if (!site.label.trim() || !site.summary.trim() || !site.sourceLabel.trim() || !site.spriteKey.trim()
      || !["enemyInstallation", "strategicGeography", "alliedSupport"].includes(site.category)
      || !["fixed", "sector"].includes(site.locationPrecision)
      || site.relatedLocations?.some((location) => !location.trim())) {
      throw new CampaignRuntimeError(
        "INVALID_SCENARIO",
        `Campaign briefing site ${site.key} requires public label, summary, source, and marker art.`,
        { path: `scenario.briefedStrategicSites.${index}` }
      );
    }
  });
  const briefedRegionKeys = new Set<string>();
  (scenario.briefedStrategicRegions ?? []).forEach((region, index) => {
    if (!region.key.trim() || briefedRegionKeys.has(region.key)) {
      throw new CampaignRuntimeError(
        "INVALID_SCENARIO",
        `Campaign briefing region ${index} must have a unique non-empty key.`,
        { path: `scenario.briefedStrategicRegions.${index}.key`, key: region.key }
      );
    }
    briefedRegionKeys.add(region.key);
    if (!region.observerFaction.trim() || !region.label.trim() || !region.summary.trim()
      || !region.sourceLabel.trim() || !region.commandStatus.trim()
      || !["enemyInstallation", "strategicGeography", "alliedSupport"].includes(region.category)
      || region.locations.length === 0 || region.locations.some((location) => !location.trim())) {
      throw new CampaignRuntimeError(
        "INVALID_SCENARIO",
        `Campaign briefing region ${region.key} requires a category, public copy, source, command status, and named places.`,
        { path: `scenario.briefedStrategicRegions.${index}` }
      );
    }
  });
}

/**
 * WHAT: Converts a shipped mixed campaign scenario into a frozen authored definition.
 * WHY: Later runtime mutations must not modify map content or the initial-state source used by migrations and new campaigns.
 *
 * @param scenario - Existing `CampaignScenarioData` content.
 * @returns Recursively frozen Campaign 2.0 definition.
 * @throws CampaignRuntimeError when required scenario identity or geometry is invalid.
 */
export function splitLegacyCampaignScenario(scenario: CampaignScenarioData): CampaignScenarioDefinition {
  assertLegacyScenarioCanSplit(scenario);
  const map: CampaignScenarioMapDefinition = {
    dimensions: structuredClone(scenario.dimensions),
    ...(scenario.mapExtents ? { mapExtents: structuredClone(scenario.mapExtents) } : {}),
    background: structuredClone(scenario.background),
    tilePalette: structuredClone(scenario.tilePalette),
    ...(scenario.briefedStrategicSites
      ? { briefedStrategicSites: structuredClone(scenario.briefedStrategicSites) }
      : {}),
    ...(scenario.briefedStrategicRegions
      ? { briefedStrategicRegions: structuredClone(scenario.briefedStrategicRegions) }
      : {}),
    initialFronts: structuredClone(scenario.fronts)
  };
  const initialState: CampaignInitialStateDefinition = {
    tiles: structuredClone(scenario.tiles),
    economies: structuredClone(scenario.economies)
  };
  const definition: CampaignScenarioDefinition = {
    schemaVersion: CAMPAIGN_SCENARIO_DEFINITION_VERSION,
    key: scenario.key,
    title: scenario.title,
    description: scenario.description,
    ...(scenario.historicalCalendar ? { historicalCalendar: structuredClone(scenario.historicalCalendar) } : {}),
    hexScaleKm: scenario.hexScaleKm ?? CAMPAIGN_HEX_SCALE_KM,
    map,
    objectives: structuredClone(scenario.objectives),
    ...(scenario.campaignArc ? { campaignArc: structuredClone(scenario.campaignArc) } : {}),
    initialState
  };
  assertCampaignObjectiveDefinitionContent(definition);
  return deepFreezeCampaignData(definition) as CampaignScenarioDefinition;
}

/**
 * WHAT: Converts an axial coordinate into the canonical runtime tile key.
 * WHY: Runtime identity must use the engine coordinate system rather than current UI offset keys.
 *
 * @param q - Axial q coordinate.
 * @param r - Axial r coordinate.
 * @returns Stable `q,r` key.
 */
function campaignAxialKey(q: number, r: number): string {
  return `${q},${r}`;
}

/**
 * WHAT: Resolves the segment at which migrated tile control began.
 * WHY: Current saves may contain the newer segment field or the legacy day field; migration must preserve either explicitly.
 *
 * @param tile - Legacy tile record.
 * @param hexKey - Tile key used in diagnostics.
 * @returns Non-negative control-start segment.
 * @throws CampaignRuntimeError when a present legacy timestamp is malformed.
 */
function resolveControlSinceSegment(tile: CampaignReadonly<CampaignTileInstance>, hexKey: string): number {
  // CampaignState already writes this runtime extension even though the legacy interface did not declare it.
  const extended = tile as CampaignReadonly<CampaignTileWithSegment>;
  if (extended.controlSinceSegment !== undefined) {
    if (!Number.isInteger(extended.controlSinceSegment) || extended.controlSinceSegment < 0) {
      throw new CampaignRuntimeError(
        "INVALID_SCENARIO",
        `Campaign tile ${hexKey} has an invalid controlSinceSegment value.`,
        { path: `tiles.${hexKey}.controlSinceSegment`, value: String(extended.controlSinceSegment) }
      );
    }
    return extended.controlSinceSegment;
  }
  if (tile.controlSinceDay !== undefined) {
    if (!Number.isInteger(tile.controlSinceDay) || tile.controlSinceDay < 1) {
      throw new CampaignRuntimeError(
        "INVALID_SCENARIO",
        `Campaign tile ${hexKey} has an invalid controlSinceDay value.`,
        { path: `tiles.${hexKey}.controlSinceDay`, value: String(tile.controlSinceDay) }
      );
    }
    return (tile.controlSinceDay - 1) * 8;
  }
  return 0;
}

/**
 * WHAT: Resolves a tile's initial force list using the shipped tile-over-palette inheritance rule.
 * WHY: Runtime state needs an explicit mutable force list and cannot continue reading mutable defaults from authored content.
 *
 * @param tile - Initial tile instance.
 * @param paletteForces - Palette force list inherited when the tile has no override.
 * @returns Mutable, defensive force clone.
 */
function resolveInitialForces(
  tile: CampaignReadonly<CampaignTileInstance>,
  paletteForces: readonly CampaignReadonly<CampaignForceGroup>[] | undefined
): CampaignForceGroup[] {
  const forces = tile.forces ?? paletteForces;
  return forces ? cloneReadonlyCampaignData<CampaignForceGroup[]>(forces) : [];
}

/**
 * WHAT: Materializes one mutable legacy faction economy with fields introduced after early campaign content.
 * WHY: Shipped campaign01 predates the ammo stock field for the Bot; absence means no tracked ammunition, while malformed present values must still fail invariants.
 *
 * @param economy - Immutable authored or migrated legacy economy.
 * @returns Defensive complete mutable economy.
 */
function materializeLegacyEconomy(economy: CampaignReadonly<CampaignFactionEconomy>): CampaignFactionEconomy {
  const mutable = cloneReadonlyCampaignData<CampaignFactionEconomy>(economy);
  if (mutable.ammo === undefined || mutable.ammo === null) mutable.ammo = 0;
  return mutable;
}

/**
 * WHAT: Creates the first immutable domain event for a runtime.
 * WHY: Every campaign history begins with explicit identity, content, segment, and revision facts.
 *
 * @param campaignId - Stable campaign identity.
 * @param scenarioKey - Authored scenario key.
 * @param contentHash - Frozen definition content identity.
 * @param segment - Starting campaign segment.
 * @returns Runtime-created event at revision zero.
 */
function createRuntimeCreatedEvent(
  campaignId: string,
  scenarioKey: string,
  contentHash: string,
  segment: number
): CampaignDomainEvent {
  return {
    id: createStableCampaignRecordId("event", campaignId, 0, 0, "runtimeCreated"),
    campaignId,
    revision: 0,
    sequence: 0,
    segment,
    type: "runtimeCreated",
    category: "system",
    summary: "Campaign runtime created.",
    details: { scenarioKey, contentHash }
  };
}

/**
 * WHAT: Creates authoritative mutable campaign truth from a frozen definition and explicit legacy/current state inputs.
 * WHY: New campaigns and save migrations need one deterministic construction path with no wall-clock or hidden defaults.
 *
 * @param definition - Frozen authored definition.
 * @param options - Explicit identity, seed, time, engagements, decisions, and knowledge state.
 * @returns Validated Campaign 2.0 runtime.
 * @throws CampaignRuntimeError when content references are duplicate, missing, or invariant-invalid.
 */
export function createCampaignRuntime(
  definition: CampaignScenarioDefinition,
  options: CreateCampaignRuntimeOptions
): CampaignRuntimeState {
  const scenarioContentHash = computeCampaignContentHash(definition);
  const initialTiles = options.runtimeSeedOverride?.tiles ?? definition.initialState.tiles;
  const initialEconomies = options.runtimeSeedOverride?.economies ?? definition.initialState.economies;
  const initialFronts = options.runtimeSeedOverride?.fronts ?? definition.map.initialFronts;
  const tileOrder: string[] = [];
  const tiles: Record<string, CampaignTileRuntime> = {};

  initialTiles.forEach((tile) => {
    const hexKey = campaignAxialKey(tile.hex.q, tile.hex.r);
    if (tiles[hexKey]) {
      throw new CampaignRuntimeError(
        "INVALID_SCENARIO",
        `Campaign scenario contains duplicate tile coordinate ${hexKey}.`,
        { path: `initialState.tiles.${hexKey}` }
      );
    }
    const palette = definition.map.tilePalette[tile.tile];
    if (!palette) {
      throw new CampaignRuntimeError(
        "INVALID_SCENARIO",
        `Campaign tile ${hexKey} references missing palette key ${tile.tile}.`,
        { path: `initialState.tiles.${hexKey}.tile`, tileKey: tile.tile }
      );
    }
    const infrastructure = createCampaignInfrastructureState(palette, options.currentSegment, tile.infrastructure);
    tileOrder.push(hexKey);
    tiles[hexKey] = {
      hexKey,
      hex: cloneReadonlyCampaignData(tile.hex),
      tileKey: tile.tile,
      controller: tile.factionControl ?? palette.factionControl,
      controlSinceSegment: resolveControlSinceSegment(tile, hexKey),
      formationIds: [],
      forces: resolveInitialForces(tile, palette.forces),
      ...(infrastructure ? { infrastructure } : {}),
      ...(tile.spriteKey ? { spriteKey: tile.spriteKey } : {}),
      ...(tile.rotation !== undefined ? { rotation: tile.rotation } : {}),
      ...(tile.controlSinceDay !== undefined ? { legacyControlSinceDay: tile.controlSinceDay } : {})
    };
  });

  const factionOrder: string[] = [];
  const factions: CampaignRuntimeState["factions"] = {};
  initialEconomies.forEach((economy) => {
    if (factions[economy.faction]) {
      throw new CampaignRuntimeError(
        "INVALID_SCENARIO",
        `Campaign scenario contains duplicate economy for faction ${economy.faction}.`,
        { path: `initialState.economies.${economy.faction}` }
      );
    }
    factionOrder.push(economy.faction);
    factions[economy.faction] = {
      faction: economy.faction,
      economy: materializeLegacyEconomy(economy)
    };
  });

  const formationRegistry = seedLegacyCampaignFormationRegistry(
    options.campaignId,
    tileOrder,
    tiles,
    options.currentSegment
  );

  const engagementOrder: string[] = [];
  const engagements: CampaignRuntimeState["engagements"] = {};
  options.engagements.forEach((engagement) => {
    if (engagements[engagement.id]) {
      throw new CampaignRuntimeError(
        "INVALID_SCENARIO",
        `Campaign runtime input contains duplicate engagement ID ${engagement.id}.`,
        { path: `engagements.${engagement.id}` }
      );
    }
    engagementOrder.push(engagement.id);
    engagements[engagement.id] = {
      id: engagement.id,
      status: engagement.id === options.activeEngagementId ? "inBattle" : "opportunity",
      engagement: structuredClone(engagement)
    };
  });

  const objectiveOrder: string[] = [];
  const objectives: CampaignRuntimeState["objectives"] = {};
  definition.objectives.forEach((objective) => {
    if (objectives[objective.key]) {
      throw new CampaignRuntimeError(
        "INVALID_SCENARIO",
        `Campaign scenario contains duplicate objective key ${objective.key}.`,
        { path: `objectives.${objective.key}` }
      );
    }
    objectiveOrder.push(objective.key);
    objectives[objective.key] = {
      objectiveKey: objective.key,
      status: "active",
      progress: 0,
      rewardApplied: false
    };
  });

  const runtime: CampaignRuntimeState = {
    runtimeVersion: CAMPAIGN_RUNTIME_VERSION,
    campaignId: options.campaignId,
    scenarioKey: definition.key,
    scenarioContentHash,
    revision: 0,
    status: options.activeEngagementId ? "engagement" : "planning",
    currentSegment: options.currentSegment,
    activeEngagementId: options.activeEngagementId,
    rng: new CampaignRandom(options.seed).serialize(),
    tileOrder,
    tiles,
    factionOrder,
    factions,
    formationOrder: formationRegistry.formationOrder,
    formations: formationRegistry.formations,
    engagementOrder,
    engagements,
    engagementLedgerOrder: [],
    engagementLedger: {},
    objectiveOrder,
    objectives,
    campaignPhaseKey: definition.campaignArc?.phases[0]?.key ?? "operation",
    campaignPhaseEnteredSegment: options.currentSegment,
    campaignScore: { earned: 0, available: 0, percent: 0, projectedGrade: "costlyVictory" },
    campaignOutcome: null,
    awardedRewardKeys: [],
    acknowledgedAfterActionReportIds: [],
    acknowledgedCampaignAlertIds: [],
    orderOrder: [],
    orders: {},
    reservationOrder: [],
    reservations: {},
    knowledgeByFaction: structuredClone(options.knowledgeByFaction),
    aiAssessmentsByFaction: {},
    aiPlanningByFaction: {},
    aiBehaviorsByFaction: {},
    eventLog: [createRuntimeCreatedEvent(options.campaignId, definition.key, scenarioContentHash, options.currentSegment)],
    lastResolution: null,
    advanceRecordOrder: [],
    advanceRecords: {},
    compatibility: {
      initialFronts: cloneReadonlyCampaignData<CampaignFrontLine[]>(initialFronts),
      queuedDecisions: structuredClone(options.queuedDecisions),
      turnState: structuredClone(options.turnState)
    }
  };
  runtime.engagementOrder.forEach((engagementId) => {
    const engagement = runtime.engagements[engagementId]?.engagement;
    if (engagement?.context) {
      engagement.context = attachCampaignFormationProvenanceToContext(engagement.context, runtime);
    }
  });
  reconcileCampaignEngagementLedger(runtime);
  reconcileCampaignObjectiveRuntime(runtime, definition);
  assertCampaignRuntimeState(runtime);
  return runtime;
}

/**
 * WHAT: Rebuilds the shipped campaign shape and auxiliary state from Campaign 2.0 truth.
 * WHY: The current UI can remain playable while later iterations replace direct scenario mutation with runtime selectors and actions.
 *
 * @param definition - Matching frozen authored scenario definition.
 * @param runtime - Valid authoritative runtime for that definition.
 * @returns Defensive compatibility snapshot with no shared runtime references.
 * @throws CampaignRuntimeError when definition/runtime identity differs or runtime invariants fail.
 */
export function projectLegacyCampaignState(
  definition: CampaignScenarioDefinition,
  runtime: CampaignRuntimeState
): CampaignLegacyProjection {
  assertCampaignRuntimeState(runtime);
  const expectedHash = computeCampaignContentHash(definition);
  if (runtime.scenarioKey !== definition.key || runtime.scenarioContentHash !== expectedHash) {
    throw new CampaignRuntimeError(
      "INVALID_RUNTIME",
      "Campaign runtime does not match the supplied authored scenario definition.",
      {
        runtimeScenarioKey: runtime.scenarioKey,
        definitionScenarioKey: definition.key,
        runtimeContentHash: runtime.scenarioContentHash,
        definitionContentHash: expectedHash
      }
    );
  }

  const tiles: CampaignTileWithSegment[] = runtime.tileOrder.map((hexKey) => {
    const tile = runtime.tiles[hexKey];
    if (!tile) {
      throw new CampaignRuntimeError(
        "INVALID_RUNTIME",
        `Campaign tile order references missing runtime tile ${hexKey}.`,
        { path: `tileOrder.${hexKey}` }
      );
    }
    return {
      tile: tile.tileKey,
      hex: structuredClone(tile.hex),
      factionControl: tile.controller,
      forces: projectCampaignFormationForces(runtime, tile),
      controlSinceSegment: tile.controlSinceSegment,
      ...(tile.spriteKey ? { spriteKey: tile.spriteKey } : {}),
      ...(tile.rotation !== undefined ? { rotation: tile.rotation } : {}),
      ...(tile.legacyControlSinceDay !== undefined ? { controlSinceDay: tile.legacyControlSinceDay } : {}),
      ...(tile.infrastructure ? { infrastructure: structuredClone(tile.infrastructure) } : {})
    };
  });

  const economies: CampaignFactionEconomy[] = runtime.factionOrder.map((faction) => {
    const factionState = runtime.factions[faction];
    if (!factionState) {
      throw new CampaignRuntimeError(
        "INVALID_RUNTIME",
        `Campaign faction order references missing runtime faction ${faction}.`,
        { path: `factionOrder.${faction}` }
      );
    }
    return structuredClone(factionState.economy);
  });

  const scenario: CampaignScenarioData = {
    key: definition.key,
    title: definition.title,
    description: definition.description,
    ...(definition.historicalCalendar
      ? { historicalCalendar: cloneReadonlyCampaignData(definition.historicalCalendar) }
      : {}),
    hexScaleKm: definition.hexScaleKm,
    dimensions: cloneReadonlyCampaignData(definition.map.dimensions),
    ...(definition.map.mapExtents
      ? { mapExtents: cloneReadonlyCampaignData<CampaignMapExtents>(definition.map.mapExtents) }
      : {}),
    background: cloneReadonlyCampaignData(definition.map.background),
    tilePalette: cloneReadonlyCampaignData<Record<string, CampaignTileDefinition>>(definition.map.tilePalette),
    ...(definition.map.briefedStrategicSites
      ? { briefedStrategicSites: cloneReadonlyCampaignData<CampaignBriefedStrategicSite[]>(definition.map.briefedStrategicSites) }
      : {}),
    ...(definition.map.briefedStrategicRegions
      ? { briefedStrategicRegions: cloneReadonlyCampaignData<CampaignBriefedStrategicRegion[]>(definition.map.briefedStrategicRegions) }
      : {}),
    tiles,
    fronts: structuredClone(runtime.compatibility.initialFronts),
    objectives: cloneReadonlyCampaignData<CampaignObjective[]>(definition.objectives),
    ...(definition.campaignArc ? { campaignArc: cloneReadonlyCampaignData<CampaignArcDefinition>(definition.campaignArc) } : {}),
    economies
  };

  return {
    scenario,
    currentSegment: runtime.currentSegment,
    turnState: structuredClone(runtime.compatibility.turnState),
    activeEngagementId: runtime.activeEngagementId,
    queuedDecisions: structuredClone(runtime.compatibility.queuedDecisions),
    engagements: runtime.engagementOrder.map((id) => structuredClone(runtime.engagements[id].engagement)),
    intelligenceByFaction: structuredClone(runtime.knowledgeByFaction)
  };
}
