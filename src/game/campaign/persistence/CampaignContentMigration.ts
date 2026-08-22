/**
 * MODULE: CampaignContentMigration
 * WHAT: Migrates the two certified prior Central Channel runtimes to the repaired authored campaign.
 * WHY: Contact and opening-geography repairs change authored content hashes, but valid player progress must not be discarded or silently applied to unknown content.
 */

import { deriveCampaignFrontsFromControl } from "../control/CampaignBattleControlResolver";
import {
  reconcileCampaignFormationForceCounts,
  relocateCampaignFormation,
  synchronizeCampaignFormationForceProjection
} from "../formations/FormationLifecycleService";
import { computeCampaignContentHash } from "../runtime/CampaignCanonical";
import { assertCampaignRuntimeState } from "../runtime/CampaignInvariantValidator";
import { createCampaignRuntime, projectLegacyCampaignState } from "../runtime/CampaignScenarioAdapter";
import type { CampaignRuntimeState, CampaignScenarioDefinition } from "../runtime/campaignRuntimeTypes";
import { createCampaignKnowledgeState } from "../../../state/CampaignIntelligence";
import { CampaignSaveError } from "./CampaignSaveTypes";

/** Exact production content identity immediately before the actionable-contact geometry repair. */
export const CENTRAL_CHANNEL_PRE_CONTACT_CONTENT_HASH = "fnv1a32-9f497e04";

/** Exact repaired production identity this narrowly scoped migration is allowed to create. */
export const CENTRAL_CHANNEL_CONTACT_REPAIR_CONTENT_HASH = "fnv1a32-cb416131";

/** Exact production identity after the Channel task-force and established-lodgment repair. */
export const CENTRAL_CHANNEL_OPENING_REPAIR_CONTENT_HASH = "fnv1a32-412d85f7";

/** Exact production identity after the historical-clock and directional-fleet clarity repair. */
export const CENTRAL_CHANNEL_CLARITY_REPAIR_CONTENT_HASH = "fnv1a32-e8f3d4b9";

/** Exact production identity before the authored Caen counterattack cadence became executable. */
export const CENTRAL_CHANNEL_PRE_COUNTERATTACK_CONTENT_HASH = "fnv1a32-b41c5c8a";

/** Exact production identity after the source-backed D+1 campaign and executable counterattack repair. */
export const CENTRAL_CHANNEL_NORMANDY_DPLUS1_CONTENT_HASH = "fnv1a32-e10034d8";

/** Exact identity after registering the D+1 scenario to the native square background and painted coastline. */
export const CENTRAL_CHANNEL_REGISTERED_MAP_CONTENT_HASH = "fnv1a32-fe02aba5";

const NEW_CONTACT_TILE_KEYS = ["27,24", "29,25"] as const;
const AIRFIELD_TILE_KEY = "30,25";
const CHANNEL_TASK_FORCE_TILE_KEY = "20,18";
const BEACHHEAD_TILE_KEY = "27,24";
const BEACHHEAD_RESERVE_LABEL = "Beachhead Reserve";
const AIRFIELD_REINFORCEMENT_LABELS = new Set([
  "Airfield Counterattack Group",
  "Airfield Armoured Reserve"
]);

export interface CampaignContentMigrationResult {
  readonly runtime: CampaignRuntimeState;
  readonly migrated: boolean;
}

function cloneAuthoredFronts(definition: CampaignScenarioDefinition): CampaignRuntimeState["compatibility"]["initialFronts"] {
  return definition.map.initialFronts.map((front) => ({
    key: front.key,
    label: front.label,
    hexKeys: [...front.hexKeys],
    ...(front.edges ? {
      edges: front.edges.map((edge) => ({
        friendlyHexKey: edge.friendlyHexKey,
        opposingHexKey: edge.opposingHexKey
      }))
    } : {}),
    initiative: front.initiative,
    ...(front.modifiers ? { modifiers: [...front.modifiers] } : {})
  }));
}

function applyContactGeometryRepair(
  migrated: CampaignRuntimeState,
  currentSeed: CampaignRuntimeState,
  source: CampaignRuntimeState,
  currentHash: string
): void {
  for (const hexKey of NEW_CONTACT_TILE_KEYS) {
    if (migrated.tiles[hexKey]) {
      throw contentMismatch(`Legacy campaign unexpectedly already contains repaired tile ${hexKey}.`, source, currentHash);
    }
    const seededTile = currentSeed.tiles[hexKey];
    if (!seededTile) {
      throw contentMismatch(`Current campaign is missing required repaired tile ${hexKey}.`, source, currentHash);
    }
    const forces = hexKey === BEACHHEAD_TILE_KEY
      ? seededTile.forces.filter((group) => group.label !== BEACHHEAD_RESERVE_LABEL)
      : seededTile.forces;
    migrated.tileOrder.push(hexKey);
    migrated.tiles[hexKey] = {
      ...structuredClone(seededTile),
      formationIds: [],
      forces: structuredClone(forces)
    };
  }

  const savedAirfield = migrated.tiles[AIRFIELD_TILE_KEY];
  const seededAirfield = currentSeed.tiles[AIRFIELD_TILE_KEY];
  if (!savedAirfield || !seededAirfield) {
    throw contentMismatch("Campaign contact migration could not resolve the Eastern airfield.", source, currentHash);
  }
  if (savedAirfield.controller === "Bot") {
    seededAirfield.forces
      .filter((group) => group.label && AIRFIELD_REINFORCEMENT_LABELS.has(group.label))
      .forEach((group) => {
        const exists = savedAirfield.forces.some((saved) => saved.unitType === group.unitType && saved.label === group.label);
        if (!exists) savedAirfield.forces.push(structuredClone(group));
      });
  }

  reconcileCampaignFormationForceCounts(
    migrated,
    migrated.currentSegment,
    "certified Central Channel contact-geometry migration"
  );
}

function applyOpeningGeographyRepair(
  migrated: CampaignRuntimeState,
  currentSeed: CampaignRuntimeState,
  source: CampaignRuntimeState,
  currentHash: string
): void {
  const obsoleteChannelBase = migrated.tiles[CHANNEL_TASK_FORCE_TILE_KEY];
  const seededTaskForce = currentSeed.tiles[CHANNEL_TASK_FORCE_TILE_KEY];
  const beachhead = migrated.tiles[BEACHHEAD_TILE_KEY];
  if (!obsoleteChannelBase || obsoleteChannelBase.tileKey !== "playerNavalBase" || !seededTaskForce || !beachhead) {
    throw contentMismatch("Campaign opening migration could not prove the obsolete Channel base and shore lodgment.", source, currentHash);
  }

  for (const formationId of [...obsoleteChannelBase.formationIds]) {
    const formation = migrated.formations[formationId];
    if (!formation || formation.locationHexKey !== CHANNEL_TASK_FORCE_TILE_KEY) continue;
    if (formation.currentOrderId !== null) {
      throw contentMismatch("Campaign opening migration cannot move a Channel garrison while it has an active order.", source, currentHash);
    }
    const migratedLabel = formation.origin.legacyLabel === "Beachhead Garrison"
      ? BEACHHEAD_RESERVE_LABEL
      : formation.origin.legacyLabel;
    migrated.formations[formationId] = {
      ...formation,
      name: formation.name.replace("Beachhead Garrison", BEACHHEAD_RESERVE_LABEL),
      origin: { ...formation.origin, legacyLabel: migratedLabel }
    };
    if (!relocateCampaignFormation(
      migrated,
      formationId,
      BEACHHEAD_TILE_KEY,
      migrated.currentSegment,
      `${migrated.formations[formationId].name} was reassigned from the obsolete Channel base to the established beachhead.`
    )) {
      throw contentMismatch(`Campaign opening migration could not relocate formation ${formationId}.`, source, currentHash);
    }
  }

  migrated.tiles[CHANNEL_TASK_FORCE_TILE_KEY] = {
    ...structuredClone(seededTaskForce),
    controller: obsoleteChannelBase.controller,
    controlSinceSegment: obsoleteChannelBase.controlSinceSegment,
    formationIds: [],
    forces: [],
    ...(obsoleteChannelBase.legacyControlSinceDay !== undefined
      ? { legacyControlSinceDay: obsoleteChannelBase.legacyControlSinceDay }
      : {})
  };
  synchronizeCampaignFormationForceProjection(migrated);
}

function contentMismatch(message: string, runtime: CampaignRuntimeState, currentHash: string): CampaignSaveError {
  return new CampaignSaveError("CONTENT_MISMATCH", message, {
    scenarioKey: runtime.scenarioKey,
    receivedContentHash: runtime.scenarioContentHash,
    expectedContentHash: currentHash
  });
}

function isPristineOpening(runtime: CampaignRuntimeState): boolean {
  return runtime.currentSegment === 0
    && runtime.revision === 0
    && runtime.status === "planning"
    && runtime.activeEngagementId === null
    && runtime.orderOrder.length === 0
    && runtime.engagementOrder.length === 0
    && runtime.engagementLedgerOrder.length === 0
    && runtime.advanceRecordOrder.length === 0
    && runtime.lastResolution === null
    && runtime.campaignOutcome === null
    && runtime.eventLog.length === 1;
}

function createCorrectedPristineOpening(
  source: CampaignRuntimeState,
  definition: CampaignScenarioDefinition,
  currentHash: string
): CampaignRuntimeState {
  const migrated = createCampaignRuntime(definition, {
    campaignId: source.campaignId,
    seed: source.rng.baseSeed,
    currentSegment: 0,
    turnState: null,
    queuedDecisions: [],
    engagements: [],
    activeEngagementId: null,
    knowledgeByFaction: {}
  });
  const scenario = projectLegacyCampaignState(definition, migrated).scenario;
  migrated.knowledgeByFaction = {
    Player: createCampaignKnowledgeState(scenario, "Player", 0),
    Bot: createCampaignKnowledgeState(scenario, "Bot", 0)
  };
  if (migrated.scenarioContentHash !== currentHash) {
    throw contentMismatch("Corrected Normandy opening did not adopt the current authored identity.", source, currentHash);
  }
  assertCampaignRuntimeState(migrated);
  return migrated;
}

/**
 * Reconciles a verified runtime with current authored content through one exact, fail-closed migration.
 * Unknown hashes and future content combinations remain read-only instead of receiving guessed map state.
 */
export function migrateCampaignRuntimeContent(
  source: CampaignRuntimeState,
  definition: CampaignScenarioDefinition
): CampaignContentMigrationResult {
  const currentHash = computeCampaignContentHash(definition);
  if (source.scenarioKey !== definition.key) {
    throw contentMismatch("Campaign save belongs to a different authored scenario.", source, currentHash);
  }
  if (source.scenarioContentHash === currentHash) {
    return { runtime: structuredClone(source), migrated: false };
  }

  if (definition.key === "central_channel"
    && currentHash === CENTRAL_CHANNEL_REGISTERED_MAP_CONTENT_HASH) {
    const unregisteredMapHashes = new Set([
      CENTRAL_CHANNEL_PRE_CONTACT_CONTENT_HASH,
      CENTRAL_CHANNEL_CONTACT_REPAIR_CONTENT_HASH,
      CENTRAL_CHANNEL_OPENING_REPAIR_CONTENT_HASH,
      CENTRAL_CHANNEL_CLARITY_REPAIR_CONTENT_HASH,
      CENTRAL_CHANNEL_PRE_COUNTERATTACK_CONTENT_HASH,
      CENTRAL_CHANNEL_NORMANDY_DPLUS1_CONTENT_HASH
    ]);
    if (!unregisteredMapHashes.has(source.scenarioContentHash)) {
      throw contentMismatch("Campaign save content has no certified migration to the registered Central Channel map.", source, currentHash);
    }
    if (!isPristineOpening(source)) {
      throw contentMismatch(
        "This save contains progress on retired, unregistered campaign geography. It was preserved, but cannot be guessed onto the shoreline-registered Normandy map. Start a new Normandy campaign or load it in a compatible earlier build.",
        source,
        currentHash
      );
    }
    return {
      runtime: createCorrectedPristineOpening(source, definition, currentHash),
      migrated: true
    };
  }

  if (definition.key === "central_channel"
    && currentHash === CENTRAL_CHANNEL_NORMANDY_DPLUS1_CONTENT_HASH
    && source.scenarioContentHash === CENTRAL_CHANNEL_PRE_COUNTERATTACK_CONTENT_HASH) {
    const authoredFronts = new Map(definition.map.initialFronts.map((front) => [front.key, front]));
    const migrated: CampaignRuntimeState = {
      ...structuredClone(source),
      scenarioContentHash: currentHash,
      compatibility: {
        ...structuredClone(source.compatibility),
        initialFronts: source.compatibility.initialFronts.map((front) => {
          const authored = authoredFronts.get(front.key);
          return authored
            ? { ...structuredClone(front), ...(authored.modifiers ? { modifiers: [...authored.modifiers] } : { modifiers: undefined }) }
            : structuredClone(front);
        })
      }
    };
    assertCampaignRuntimeState(migrated);
    return { runtime: migrated, migrated: true };
  }

  const priorCentralChannelHashes = new Set([
    CENTRAL_CHANNEL_PRE_CONTACT_CONTENT_HASH,
    CENTRAL_CHANNEL_CONTACT_REPAIR_CONTENT_HASH,
    CENTRAL_CHANNEL_OPENING_REPAIR_CONTENT_HASH,
    CENTRAL_CHANNEL_CLARITY_REPAIR_CONTENT_HASH
  ]);
  if (definition.key === "central_channel"
    && currentHash === CENTRAL_CHANNEL_NORMANDY_DPLUS1_CONTENT_HASH
    && priorCentralChannelHashes.has(source.scenarioContentHash)) {
    if (!isPristineOpening(source)) {
      throw contentMismatch(
        "This save contains progress on the retired out-of-bounds campaign geography. It was preserved, but cannot be guessed onto the corrected D+1 Normandy map. Start a new Normandy campaign or load it in a compatible earlier build.",
        source,
        currentHash
      );
    }
    return {
      runtime: createCorrectedPristineOpening(source, definition, currentHash),
      migrated: true
    };
  }

  if (definition.key === "central_channel"
    && currentHash === CENTRAL_CHANNEL_CLARITY_REPAIR_CONTENT_HASH
    && source.scenarioContentHash === CENTRAL_CHANNEL_OPENING_REPAIR_CONTENT_HASH) {
    const migrated = {
      ...structuredClone(source),
      scenarioContentHash: currentHash
    };
    assertCampaignRuntimeState(migrated);
    return { runtime: migrated, migrated: true };
  }

  const knownPriorHash = source.scenarioContentHash === CENTRAL_CHANNEL_PRE_CONTACT_CONTENT_HASH
    || source.scenarioContentHash === CENTRAL_CHANNEL_CONTACT_REPAIR_CONTENT_HASH;
  if (definition.key !== "central_channel"
    || currentHash !== CENTRAL_CHANNEL_CLARITY_REPAIR_CONTENT_HASH
    || !knownPriorHash) {
    throw contentMismatch("Campaign save content has no certified migration to the current authored scenario.", source, currentHash);
  }

  const currentSeed = createCampaignRuntime(definition, {
    campaignId: source.campaignId,
    seed: source.rng.baseSeed,
    currentSegment: source.currentSegment,
    turnState: null,
    queuedDecisions: [],
    engagements: [],
    activeEngagementId: null,
    knowledgeByFaction: {}
  });
  const migrated: CampaignRuntimeState = {
    ...structuredClone(source),
    scenarioContentHash: currentHash,
    compatibility: {
      ...structuredClone(source.compatibility),
      initialFronts: []
    }
  };

  if (source.scenarioContentHash === CENTRAL_CHANNEL_PRE_CONTACT_CONTENT_HASH) {
    applyContactGeometryRepair(migrated, currentSeed, source, currentHash);
  }
  applyOpeningGeographyRepair(migrated, currentSeed, source, currentHash);
  const repairedFrontKeys = new Set(definition.map.initialFronts.map((front) => front.key));
  migrated.compatibility = {
    ...migrated.compatibility,
    initialFronts: [
      ...cloneAuthoredFronts(definition),
      ...source.compatibility.initialFronts
        .filter((front) => !repairedFrontKeys.has(front.key))
        .map((front) => structuredClone(front))
    ]
  };
  migrated.compatibility = {
    ...migrated.compatibility,
    initialFronts: deriveCampaignFrontsFromControl(migrated)
  };
  assertCampaignRuntimeState(migrated);
  return { runtime: migrated, migrated: true };
}
