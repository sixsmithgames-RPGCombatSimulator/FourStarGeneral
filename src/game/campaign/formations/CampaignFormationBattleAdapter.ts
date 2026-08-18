/**
 * MODULE: CampaignFormationBattleAdapter
 * WHAT: Attaches stable campaign identities to engagement pools and creates defensive tactical representations.
 * WHY: Campaign and tactical play need an explicit provenance bridge without sharing mutable formation records.
 *
 * DEPENDENCIES: Campaign engagement contracts, tactical unit templates/status calculation, stable IDs, and formation records.
 * EXPORTS: Context provenance attachment, eligible formation selection, campaign-to-tactical adaptation, and provenance snapshot extraction.
 */

import type {
  CampaignEngagementContext,
  CampaignEngagementForceGroup,
  CampaignFactionKey
} from "../../../core/campaignTypes";
import type { Axial, FormationStatus, ScenarioUnit } from "../../../core/types";
import { calculateFormationReadiness } from "../../../data/unitSystem/status";
import { findTemplateForUnitKey } from "../../adapters";
import { mapCampaignUnitToAllocationKey } from "../campaignForceMapping";
import { createStableCampaignRecordId } from "../runtime/CampaignCanonical";
import type { CampaignRuntimeState } from "../runtime/campaignRuntimeTypes";
import {
  getCampaignFormationEffectiveExperience,
  isCampaignFormationPlaced
} from "./FormationLifecycleService";
import type {
  CampaignFormationBattleSeed,
  CampaignFormationRecord,
  CampaignFormationTacticalSnapshot
} from "./campaignFormationTypes";

/** Frozen campaign facts used to build a tactical unit and its provenance. */
export interface CampaignFormationBattleAdapterContext {
  readonly campaignId: string;
  readonly engagementId: string;
  readonly sourceRevision: number;
  readonly sourceSegment: number;
  readonly hex: Axial;
  readonly facing?: ScenarioUnit["facing"];
  readonly entrench?: number;
}

type FormationRuntimeView = Pick<
  CampaignRuntimeState,
  "campaignId" | "revision" | "currentSegment" | "tiles" | "formations"
>;

function offsetHexKeyToAxial(offsetKey: string): Axial | null {
  const [columnText, rowText] = offsetKey.split(",");
  const column = Number(columnText);
  const row = Number(rowText);
  if (!Number.isInteger(column) || !Number.isInteger(row)) return null;
  return { q: column, r: row - Math.floor(column / 2) };
}

function attachGroupFormationIds(
  groups: readonly CampaignEngagementForceGroup[],
  runtime: FormationRuntimeView,
  faction: CampaignFactionKey
): CampaignEngagementForceGroup[] {
  const used = new Set<string>();
  return groups.map((group) => {
    const axial = offsetHexKeyToAxial(group.hexKey);
    const tile = axial ? runtime.tiles[`${axial.q},${axial.r}`] : null;
    const formationIds = (tile?.formationIds ?? []).filter((formationId) => {
      if (used.has(formationId)) return false;
      const formation = runtime.formations[formationId];
      return Boolean(
        formation
        && formation.faction === faction
        && formation.campaignUnitType === group.unitType
        && isCampaignFormationPlaced(formation)
      );
    }).slice(0, group.count);
    formationIds.forEach((id) => used.add(id));
    return {
      hexKey: group.hexKey,
      unitType: group.unitType,
      count: group.count,
      ...(formationIds.length > 0 ? { formationIds } : {})
    };
  });
}

/**
 * Adds stable identities to truth-bearing engagement pools. Player surfaces must still use the frozen intelligence briefing for enemy assessment.
 */
export function attachCampaignFormationProvenanceToContext(
  context: CampaignEngagementContext,
  runtime: FormationRuntimeView
): CampaignEngagementContext {
  return {
    ...structuredClone(context),
    availableForces: attachGroupFormationIds(context.availableForces, runtime, context.attacker),
    enemyForces: attachGroupFormationIds(context.enemyForces, runtime, context.defender)
  };
}

/** True when the formation has a battle representation and is not unavailable for tactical commitment. */
export function isCampaignFormationBattleEligible(formation: CampaignFormationRecord): boolean {
  return isCampaignFormationPlaced(formation)
    && (formation.status === "ready" || formation.status === "committed" || formation.status === "isolated")
    && mapCampaignUnitToAllocationKey(formation.campaignUnitType) !== null;
}

/**
 * Converts one persistent campaign formation into a battle-owned unit copy.
 * The returned status pools never share references with campaign truth.
 */
export function createCampaignFormationBattleSeed(
  formation: CampaignFormationRecord,
  context: CampaignFormationBattleAdapterContext
): CampaignFormationBattleSeed | null {
  if (!isCampaignFormationBattleEligible(formation)) return null;
  const allocationKey = mapCampaignUnitToAllocationKey(formation.campaignUnitType);
  const template = allocationKey ? findTemplateForUnitKey(allocationKey) : null;
  if (!template) return null;
  const status: FormationStatus = {
    personnel: structuredClone(formation.personnel),
    equipment: structuredClone(formation.equipment),
    ammo: {},
    suppression: 0,
    fatigue: formation.fatigue,
    ...(formation.readinessModel ? { readinessModel: structuredClone(formation.readinessModel) } : {})
  };
  const tacticalUnitId = createStableCampaignRecordId(
    "tactical-unit",
    context.campaignId,
    context.engagementId,
    formation.id
  );
  const baseExperience = formation.experience.base;
  const earnedExperience = formation.experience.earned;
  const unit: ScenarioUnit = {
    type: template.type,
    hex: structuredClone(context.hex),
    strength: calculateFormationReadiness(status, formation.readiness).readiness,
    experience: getCampaignFormationEffectiveExperience(formation),
    baseExperience,
    earnedExperience,
    status,
    formationKey: template.key,
    campaignProvenance: {
      campaignId: context.campaignId,
      formationId: formation.id,
      engagementId: context.engagementId,
      sourceRevision: context.sourceRevision,
      sourceSegment: context.sourceSegment,
      faction: String(formation.faction),
      ownership: formation.ownership,
      formationName: formation.name,
      campaignUnitType: formation.campaignUnitType
    },
    ammo: Math.max(0, formation.supply.ammo),
    fuel: Math.max(0, formation.supply.fuel),
    entrench: Math.max(0, context.entrench ?? template.entrench),
    facing: context.facing ?? template.facing,
    unitId: tacticalUnitId
  };
  return { campaignFormationId: formation.id, tacticalUnitId, unit };
}

/**
 * Selects friendly formation records for one precombat allocation key in the provenance order frozen into the engagement context.
 */
export function selectCampaignFormationsForAllocation(
  runtime: FormationRuntimeView,
  context: CampaignEngagementContext,
  allocationKey: string,
  quantity: number
): CampaignFormationRecord[] {
  const selected: CampaignFormationRecord[] = [];
  const seen = new Set<string>();
  for (const group of context.availableForces) {
    if (mapCampaignUnitToAllocationKey(group.unitType) !== allocationKey) continue;
    for (const formationId of group.formationIds ?? []) {
      if (seen.has(formationId)) continue;
      seen.add(formationId);
      const formation = runtime.formations[formationId];
      if (!formation || formation.faction !== context.attacker || !isCampaignFormationBattleEligible(formation)) continue;
      selected.push(formation);
      if (selected.length >= quantity) return selected;
    }
  }
  return selected;
}

/**
 * Reads the campaign identity and mutable tactical condition needed by the future result extractor.
 * It does not mutate or reconcile campaign state.
 */
export function extractCampaignFormationTacticalSnapshot(unit: ScenarioUnit): CampaignFormationTacticalSnapshot | null {
  const provenance = unit.campaignProvenance;
  if (!provenance || !unit.unitId || !unit.status) return null;
  return {
    campaignFormationId: provenance.formationId,
    tacticalUnitId: unit.unitId,
    strength: unit.strength,
    status: structuredClone(unit.status),
    baseExperience: unit.baseExperience ?? unit.experience,
    earnedExperience: unit.earnedExperience ?? 0,
    ammo: unit.ammo,
    fuel: unit.fuel
  };
}

