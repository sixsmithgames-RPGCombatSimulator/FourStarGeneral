/**
 * MODULE: CampaignContentMigration
 * WHAT: Migrates the one certified pre-contact-geometry Central Channel runtime to the repaired authored campaign.
 * WHY: The shipped front repair changes the authored content hash, but valid player progress must not be discarded or silently applied to unknown content.
 */

import { deriveCampaignFrontsFromControl } from "../control/CampaignBattleControlResolver";
import { reconcileCampaignFormationForceCounts } from "../formations/FormationLifecycleService";
import { computeCampaignContentHash } from "../runtime/CampaignCanonical";
import { assertCampaignRuntimeState } from "../runtime/CampaignInvariantValidator";
import { createCampaignRuntime } from "../runtime/CampaignScenarioAdapter";
import type { CampaignRuntimeState, CampaignScenarioDefinition } from "../runtime/campaignRuntimeTypes";
import { CampaignSaveError } from "./CampaignSaveTypes";

/** Exact production content identity immediately before the actionable-contact geometry repair. */
export const CENTRAL_CHANNEL_PRE_CONTACT_CONTENT_HASH = "fnv1a32-9f497e04";

/** Exact repaired production identity this narrowly scoped migration is allowed to create. */
export const CENTRAL_CHANNEL_CONTACT_REPAIR_CONTENT_HASH = "fnv1a32-cb416131";

const NEW_CONTACT_TILE_KEYS = ["27,24", "29,25"] as const;
const AIRFIELD_TILE_KEY = "30,25";
const AIRFIELD_REINFORCEMENT_LABELS = new Set([
  "Airfield Counterattack Group",
  "Airfield Armoured Reserve"
]);

export interface CampaignContentMigrationResult {
  readonly runtime: CampaignRuntimeState;
  readonly migrated: boolean;
}

function contentMismatch(message: string, runtime: CampaignRuntimeState, currentHash: string): CampaignSaveError {
  return new CampaignSaveError("CONTENT_MISMATCH", message, {
    scenarioKey: runtime.scenarioKey,
    receivedContentHash: runtime.scenarioContentHash,
    expectedContentHash: currentHash
  });
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
  if (definition.key !== "central_channel"
    || currentHash !== CENTRAL_CHANNEL_CONTACT_REPAIR_CONTENT_HASH
    || source.scenarioContentHash !== CENTRAL_CHANNEL_PRE_CONTACT_CONTENT_HASH) {
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

  for (const hexKey of NEW_CONTACT_TILE_KEYS) {
    if (migrated.tiles[hexKey]) {
      throw contentMismatch(`Legacy campaign unexpectedly already contains repaired tile ${hexKey}.`, source, currentHash);
    }
    const seededTile = currentSeed.tiles[hexKey];
    if (!seededTile) {
      throw contentMismatch(`Current campaign is missing required repaired tile ${hexKey}.`, source, currentHash);
    }
    migrated.tileOrder.push(hexKey);
    migrated.tiles[hexKey] = { ...structuredClone(seededTile), formationIds: [] };
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
  const repairedFrontKeys = new Set(definition.map.initialFronts.map((front) => front.key));
  migrated.compatibility = {
    ...migrated.compatibility,
    initialFronts: [
      ...definition.map.initialFronts.map((front) => ({
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
      })),
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
