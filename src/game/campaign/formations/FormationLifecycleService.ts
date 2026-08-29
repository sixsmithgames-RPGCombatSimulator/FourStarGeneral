/**
 * MODULE: FormationLifecycleService
 * WHAT: Creates, places, moves, transitions, retires, and projects persistent campaign formation records.
 * WHY: Campaign force identity must survive legacy aggregate-count mutations until every campaign rule names formations directly.
 *
 * DEPENDENCIES: Stable campaign IDs, force-to-tactical mapping, tactical formation templates/status pools, and runtime contracts.
 * EXPORTS: Deterministic legacy seeding, lifecycle mutations, compatibility reconciliation, and force projection helpers.
 */

import type { CampaignFactionKey, CampaignForceGroup } from "../../../core/campaignTypes";
import { getEffectiveExperience } from "../../../core/Experience";
import type { FormationStatus } from "../../../core/types";
import { calculateFormationReadiness, createInitialFormationStatus } from "../../../data/unitSystem/status";
import { findTemplateForUnitKey } from "../../adapters";
import { mapCampaignUnitToAllocationKey } from "../campaignForceMapping";
import { createStableCampaignRecordId } from "../runtime/CampaignCanonical";
import type { CampaignRuntimeState, CampaignTileRuntime } from "../runtime/campaignRuntimeTypes";
import type {
  CampaignFormationHistoryEntry,
  CampaignFormationOwnership,
  CampaignFormationRecord,
  CampaignFormationStatus
} from "./campaignFormationTypes";
import { resolveCampaignFormationPresentation } from "./CampaignFormationPresentation";
import { projectCampaignFormationPosture } from "./CampaignFormationPosture";

const TERMINAL_FORMATION_STATUSES = new Set<CampaignFormationStatus>(["destroyed", "captured"]);

/** Input for deterministic record materialization without exposing runtime mutation details. */
export interface CreateCampaignFormationRecordInput {
  readonly id: string;
  readonly faction: CampaignFactionKey;
  readonly ownership: CampaignFormationOwnership;
  readonly name: string;
  readonly campaignUnitType: string;
  readonly locationHexKey: string | null;
  readonly createdSegment: number;
  readonly availableFromSegment?: number;
  readonly availabilityCopy?: string;
  readonly origin: CampaignFormationRecord["origin"];
}

/** Complete deterministic registry produced from legacy aggregate force groups. */
export interface CampaignFormationRegistrySeed {
  readonly formationOrder: string[];
  readonly formations: Record<string, CampaignFormationRecord>;
}

/** Identity changes made while reconciling a transitional aggregate-force mutation. */
export interface CampaignFormationReconciliation {
  readonly createdFormationIds: readonly string[];
  readonly movedFormationIds: readonly string[];
  readonly retiredFormationIds: readonly string[];
}

/** One authored force-group release applied at a deterministic campaign segment boundary. */
export interface CampaignFormationAvailabilityRelease {
  readonly faction: CampaignFactionKey;
  readonly hexKey: string;
  readonly availableFromSegment: number;
  readonly formationIds: readonly string[];
  readonly summary: string;
}

interface DesiredFormationSlot {
  readonly hexKey: string;
  readonly faction: CampaignFactionKey;
  readonly unitType: string;
  readonly groupIndex: number;
  readonly ordinal: number;
  readonly label: string | null;
}

function formatFormationType(unitType: string): string {
  return unitType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formationHistoryId(
  formationId: string,
  segment: number,
  sequence: number,
  type: CampaignFormationHistoryEntry["type"]
): string {
  return createStableCampaignRecordId("formation-history", formationId, segment, sequence, type);
}

function createHistoryEntry(
  formation: Pick<CampaignFormationRecord, "id" | "battleHistory">,
  type: CampaignFormationHistoryEntry["type"],
  segment: number,
  summary: string,
  fromHexKey: string | null,
  toHexKey: string | null,
  engagementId: string | null = null
): CampaignFormationHistoryEntry {
  return {
    id: formationHistoryId(formation.id, segment, formation.battleHistory.length, type),
    type,
    segment,
    summary,
    engagementId,
    fromHexKey,
    toHexKey
  };
}

function cloneStatusPools(status: FormationStatus): Pick<CampaignFormationRecord, "personnel" | "equipment" | "readinessModel"> {
  return {
    personnel: structuredClone(status.personnel),
    equipment: structuredClone(status.equipment),
    ...(status.readinessModel ? { readinessModel: structuredClone(status.readinessModel) } : {})
  };
}

/** True when an active or scheduled formation retains a concrete campaign-map placement. */
export function isCampaignFormationPlaced(formation: CampaignFormationRecord): boolean {
  return formation.locationHexKey !== null
    && formation.retiredSegment === null
    && !TERMINAL_FORMATION_STATUSES.has(formation.status);
}

/** True when a placed formation has entered the operational order of battle. */
export function isCampaignFormationAvailable(formation: CampaignFormationRecord): boolean {
  const posture = projectCampaignFormationPosture(formation).posture;
  return posture !== "scheduledArrival" && posture !== "retired";
}

/**
 * True when a formation is physically present and can contribute at its recorded location.
 * Scheduled arrivals and formations travelling under a committed redeployment remain in the
 * persistent roster, but neither belongs in a location's aggregate force projection.
 */
export function isCampaignFormationPresentAtLocation(formation: CampaignFormationRecord): boolean {
  return projectCampaignFormationPosture(formation).presentAtLocation;
}

/**
 * Creates one complete campaign-owned formation record from an explicit stable identity.
 * No runtime collection is mutated by this function.
 */
export function createCampaignFormationRecord(input: CreateCampaignFormationRecordInput): CampaignFormationRecord {
  const formationKey = mapCampaignUnitToAllocationKey(input.campaignUnitType) ?? input.campaignUnitType;
  const template = findTemplateForUnitKey(formationKey);
  const tacticalType = template?.type as string | undefined;
  const status = createInitialFormationStatus(tacticalType ?? input.campaignUnitType, template?.key ?? null, template?.strength ?? 100);
  const readiness = calculateFormationReadiness(status, template?.strength ?? 100).readiness;
  const eliteBonus = input.campaignUnitType.includes("Elite") ? 1 : 0;
  const baseExperience = Math.min(5, Math.max(0, (template?.baseExperience ?? 0) + eliteBonus));
  const scheduled = input.availableFromSegment !== undefined && input.availableFromSegment > input.createdSegment;
  const formedEntry: CampaignFormationHistoryEntry = {
    id: formationHistoryId(input.id, input.createdSegment, 0, "formed"),
    type: "formed",
    segment: input.createdSegment,
    summary: scheduled
      ? `${input.name} was scheduled to enter the campaign order of battle at segment ${input.availableFromSegment}.`
      : `${input.name} entered the campaign order of battle.`,
    engagementId: null,
    fromHexKey: null,
    toHexKey: input.locationHexKey
  };

  return {
    id: input.id,
    faction: input.faction,
    ownership: input.ownership,
    name: input.name,
    campaignUnitType: input.campaignUnitType,
    formationKey,
    equipmentPackageKey: input.campaignUnitType,
    locationHexKey: input.locationHexKey,
    status: scheduled ? "unavailable" : "ready",
    ...cloneStatusPools(status),
    readiness,
    cohesion: 100,
    fatigue: 0,
    supply: {
      ammo: Math.max(0, template?.ammo ?? 0),
      fuel: Math.max(0, template?.fuel ?? 0),
      rations: 100,
      parts: 100
    },
    experience: { base: baseExperience, earned: 0, battles: 0 },
    commanderId: null,
    honors: [],
    battleHistory: [formedEntry],
    currentOrderId: null,
    createdSegment: input.createdSegment,
    ...(input.availableFromSegment !== undefined ? { availableFromSegment: input.availableFromSegment } : {}),
    ...(input.availabilityCopy !== undefined ? { availabilityCopy: input.availabilityCopy } : {}),
    retiredSegment: null,
    origin: structuredClone(input.origin)
  };
}

function formationOwnershipForFaction(faction: CampaignFactionKey): CampaignFormationOwnership {
  return faction === "Neutral" ? "auxiliary" : "core";
}

/**
 * Converts every positive legacy aggregate count into one deterministic formation per count.
 * Tile placement arrays are filled in-place because they are part of the registry seed boundary.
 */
export function seedLegacyCampaignFormationRegistry(
  campaignId: string,
  tileOrder: readonly string[],
  tiles: Record<string, CampaignTileRuntime>,
  createdSegment: number
): CampaignFormationRegistrySeed {
  const formationOrder: string[] = [];
  const formations: Record<string, CampaignFormationRecord> = {};
  tileOrder.forEach((hexKey) => {
    const tile = tiles[hexKey];
    if (!tile) return;
    tile.formationIds = [];
    tile.forces.forEach((group, groupIndex) => {
      for (let ordinal = 0; ordinal < group.count; ordinal += 1) {
        const faction = tile.controller;
        const id = createStableCampaignRecordId(
          "formation",
          campaignId,
          faction,
          hexKey,
          group.unitType,
          groupIndex,
          ordinal
        );
        const presentation = resolveCampaignFormationPresentation({
          legacyLabel: group.label,
          legacyOrdinal: ordinal,
          unitType: group.unitType
        });
        const record = createCampaignFormationRecord({
          id,
          faction,
          ownership: formationOwnershipForFaction(faction),
          name: presentation.formationName,
          campaignUnitType: group.unitType,
          locationHexKey: hexKey,
          createdSegment,
          ...(group.availableFromSegment !== undefined ? { availableFromSegment: group.availableFromSegment } : {}),
          ...(group.availabilityCopy !== undefined ? { availabilityCopy: group.availabilityCopy } : {}),
          origin: {
            kind: "legacyAggregate",
            initialHexKey: hexKey,
            legacyGroupIndex: groupIndex,
            legacyOrdinal: ordinal,
            legacyLabel: group.label?.trim() || null
          }
        });
        formationOrder.push(id);
        formations[id] = record;
        tile.formationIds.push(id);
      }
    });
  });

  tileOrder.forEach((hexKey) => {
    const tile = tiles[hexKey];
    if (tile) tile.forces = projectCampaignFormationForces({ formations }, tile);
  });

  return { formationOrder, formations };
}

/** Builds the temporary aggregate force projection for one tile from its placed formation identities. */
export function projectCampaignFormationForces(
  runtime: Pick<CampaignRuntimeState, "formations">,
  tile: Pick<CampaignTileRuntime, "hexKey" | "formationIds">
): CampaignForceGroup[] {
  const groups: CampaignForceGroup[] = [];
  const indexByKey = new Map<string, number>();
  tile.formationIds.forEach((formationId) => {
    const formation = runtime.formations[formationId];
    if (!formation || formation.locationHexKey !== tile.hexKey || !isCampaignFormationPresentAtLocation(formation)) return;
    const label = formation.origin.legacyLabel;
    const key = `${formation.campaignUnitType}\u0000${label ?? ""}`;
    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) {
      groups[existingIndex].count += 1;
      return;
    }
    indexByKey.set(key, groups.length);
    groups.push({
      unitType: formation.campaignUnitType,
      count: 1,
      ...(label ? { label } : {})
    });
  });
  return groups;
}

/** Refreshes every transitional aggregate force group from authoritative formation placement. */
export function synchronizeCampaignFormationForceProjection(runtime: CampaignRuntimeState): void {
  runtime.tileOrder.forEach((hexKey) => {
    const tile = runtime.tiles[hexKey];
    if (tile) tile.forces = projectCampaignFormationForces(runtime, tile);
  });
}

/** Releases every due authored formation exactly once and refreshes the aggregate compatibility projection. */
export function releaseCampaignFormationAvailability(
  runtime: CampaignRuntimeState,
  segment: number
): CampaignFormationAvailabilityRelease[] {
  const grouped = new Map<string, CampaignFormationRecord[]>();
  runtime.formationOrder.forEach((formationId) => {
    const formation = runtime.formations[formationId];
    if (!formation
      || formation.status !== "unavailable"
      || formation.locationHexKey === null
      || formation.availableFromSegment === undefined
      || formation.availableFromSegment > segment) return;
    const authoredReleaseKey = formation.availabilityCopy?.trim()
      ? `copy:${formation.availabilityCopy.trim()}`
      : formation.origin.legacyLabel?.trim()
        ? `label:${formation.origin.legacyLabel.trim()}`
        : `group:${formation.origin.legacyGroupIndex}`;
    const groupKey = JSON.stringify([
      String(formation.faction),
      formation.locationHexKey,
      formation.availableFromSegment,
      formation.origin.initialHexKey,
      authoredReleaseKey
    ]);
    const entries = grouped.get(groupKey) ?? [];
    entries.push(formation);
    grouped.set(groupKey, entries);
  });

  const releases: CampaignFormationAvailabilityRelease[] = [];
  grouped.forEach((formations) => {
    const first = formations[0];
    if (!first || first.locationHexKey === null || first.availableFromSegment === undefined) return;
    const fallbackLabel = first.origin.legacyLabel?.trim()
      || (formations.length === 1 ? first.name : `${formatFormationType(first.campaignUnitType)} formations`);
    const summary = first.availabilityCopy?.trim()
      || `${fallbackLabel} became available at ${first.locationHexKey}.`;
    formations.forEach((formation) => {
      formation.status = "ready";
      formation.battleHistory.push(createHistoryEntry(
        formation,
        "statusChanged",
        segment,
        summary,
        formation.locationHexKey,
        formation.locationHexKey
      ));
    });
    releases.push({
      faction: first.faction,
      hexKey: first.locationHexKey,
      availableFromSegment: first.availableFromSegment,
      formationIds: formations.map((formation) => formation.id),
      summary
    });
  });

  if (releases.length > 0) synchronizeCampaignFormationForceProjection(runtime);
  return releases;
}

/** Moves one formation without changing identity, condition, honors, or campaign ownership. */
export function relocateCampaignFormation(
  runtime: CampaignRuntimeState,
  formationId: string,
  destinationHexKey: string,
  segment: number,
  summary?: string
): boolean {
  const formation = runtime.formations[formationId];
  const destination = runtime.tiles[destinationHexKey];
  if (!formation || !destination || !isCampaignFormationPlaced(formation) || !isCampaignFormationAvailable(formation)) return false;
  const originHexKey = formation.locationHexKey;
  if (originHexKey === destinationHexKey) return true;
  if (originHexKey) {
    const origin = runtime.tiles[originHexKey];
    if (origin) origin.formationIds = origin.formationIds.filter((id) => id !== formationId);
  }
  formation.locationHexKey = destinationHexKey;
  if (formation.status === "inTransit") formation.status = "ready";
  destination.formationIds.push(formationId);
  formation.battleHistory.push(createHistoryEntry(
    formation,
    "moved",
    segment,
    summary ?? `${formation.name} moved from ${originHexKey ?? "reserve"} to ${destinationHexKey}.`,
    originHexKey,
    destinationHexKey
  ));
  synchronizeCampaignFormationForceProjection(runtime);
  return true;
}

/** Applies one legal lifecycle status change and records it in formation history. */
export function transitionCampaignFormationStatus(
  runtime: CampaignRuntimeState,
  formationId: string,
  status: CampaignFormationStatus,
  segment: number,
  summary?: string
): boolean {
  const formation = runtime.formations[formationId];
  if (!formation
    || formation.status === "unavailable"
    || formation.status === status
    || TERMINAL_FORMATION_STATUSES.has(formation.status)) return false;
  const prior = formation.status;
  formation.status = status;
  formation.battleHistory.push(createHistoryEntry(
    formation,
    "statusChanged",
    segment,
    summary ?? `${formation.name} changed status from ${prior} to ${status}.`,
    formation.locationHexKey,
    formation.locationHexKey
  ));
  return true;
}

/** Appends one engagement-bound battle fact without changing formation placement or lifecycle state. */
export function appendCampaignFormationBattleHistory(
  runtime: CampaignRuntimeState,
  formationId: string,
  segment: number,
  engagementId: string,
  summary: string
): boolean {
  const formation = runtime.formations[formationId];
  if (!formation || !summary.trim() || !engagementId.trim()) return false;
  formation.battleHistory.push(createHistoryEntry(
    formation,
    "battle",
    segment,
    summary,
    formation.locationHexKey,
    formation.locationHexKey,
    engagementId
  ));
  return true;
}

/** Retires a formation terminally while retaining its record, pools, honors, and history. */
export function retireCampaignFormation(
  runtime: CampaignRuntimeState,
  formationId: string,
  status: Extract<CampaignFormationStatus, "destroyed" | "captured">,
  segment: number,
  summary?: string
): boolean {
  const formation = runtime.formations[formationId];
  if (!formation || TERMINAL_FORMATION_STATUSES.has(formation.status)) return false;
  const originHexKey = formation.locationHexKey;
  if (originHexKey) {
    const tile = runtime.tiles[originHexKey];
    if (tile) tile.formationIds = tile.formationIds.filter((id) => id !== formationId);
  }
  formation.status = status;
  formation.locationHexKey = null;
  formation.currentOrderId = null;
  formation.retiredSegment = segment;
  formation.battleHistory.push(createHistoryEntry(
    formation,
    "retired",
    segment,
    summary ?? `${formation.name} was ${status}.`,
    originHexKey,
    null
  ));
  synchronizeCampaignFormationForceProjection(runtime);
  return true;
}

function buildDesiredSlots(runtime: CampaignRuntimeState): DesiredFormationSlot[] {
  const slots: DesiredFormationSlot[] = [];
  runtime.tileOrder.forEach((hexKey) => {
    const tile = runtime.tiles[hexKey];
    if (!tile) return;
    tile.forces.forEach((group, groupIndex) => {
      for (let ordinal = 0; ordinal < group.count; ordinal += 1) {
        slots.push({
          hexKey,
          faction: tile.controller,
          unitType: group.unitType,
          groupIndex,
          ordinal,
          label: group.label?.trim() || null
        });
      }
    });
  });
  return slots;
}

function appendPlacement(runtime: CampaignRuntimeState, formation: CampaignFormationRecord, slot: DesiredFormationSlot): void {
  formation.locationHexKey = slot.hexKey;
  runtime.tiles[slot.hexKey]?.formationIds.push(formation.id);
}

/**
 * Reconciles transitional aggregate-force edits into persistent records while preserving every identity that can be conserved.
 * New direct formation-aware rules should call lifecycle operations instead of this compatibility bridge.
 */
export function reconcileCampaignFormationForceCounts(
  runtime: CampaignRuntimeState,
  segment: number,
  reason: string
): CampaignFormationReconciliation {
  const desired = buildDesiredSlots(runtime);
  const nonProjectedIds = runtime.formationOrder.filter((id) => {
    const formation = runtime.formations[id];
    return Boolean(formation && isCampaignFormationPlaced(formation) && !isCampaignFormationPresentAtLocation(formation));
  });
  const availableIds = runtime.formationOrder.filter((id) => {
    const formation = runtime.formations[id];
    return Boolean(formation && isCampaignFormationPresentAtLocation(formation));
  });
  const assigned = new Set<string>();
  const assignments = new Map<number, string>();
  const movedFormationIds: string[] = [];
  const createdFormationIds: string[] = [];
  const retiredFormationIds: string[] = [];

  const assignMatching = (predicate: (formation: CampaignFormationRecord, slot: DesiredFormationSlot) => boolean): void => {
    desired.forEach((slot, slotIndex) => {
      if (assignments.has(slotIndex)) return;
      const id = availableIds.find((candidateId) => {
        if (assigned.has(candidateId)) return false;
        const candidate = runtime.formations[candidateId];
        return Boolean(candidate && predicate(candidate, slot));
      });
      if (id) {
        assigned.add(id);
        assignments.set(slotIndex, id);
      }
    });
  };

  assignMatching((formation, slot) => formation.faction === slot.faction
    && formation.campaignUnitType === slot.unitType
    && formation.locationHexKey === slot.hexKey);
  assignMatching((formation, slot) => formation.faction === slot.faction
    && formation.campaignUnitType === slot.unitType);

  desired.forEach((slot, slotIndex) => {
    if (assignments.has(slotIndex)) return;
    let collision = 0;
    let id = "";
    do {
      id = createStableCampaignRecordId(
        "formation",
        runtime.campaignId,
        "compatibility",
        runtime.revision + 1,
        segment,
        slot.faction,
        slot.hexKey,
        slot.unitType,
        slot.groupIndex,
        slot.ordinal,
        collision
      );
      collision += 1;
    } while (runtime.formations[id]);
    const presentation = resolveCampaignFormationPresentation({
      legacyLabel: slot.label,
      legacyOrdinal: slot.ordinal,
      unitType: slot.unitType
    });
    const record = createCampaignFormationRecord({
      id,
      faction: slot.faction,
      ownership: formationOwnershipForFaction(slot.faction),
      name: presentation.formationName,
      campaignUnitType: slot.unitType,
      locationHexKey: slot.hexKey,
      createdSegment: segment,
      origin: {
        kind: "reconstituted",
        initialHexKey: slot.hexKey,
        legacyGroupIndex: slot.groupIndex,
        legacyOrdinal: slot.ordinal,
        legacyLabel: slot.label
      }
    });
    runtime.formationOrder.push(id);
    runtime.formations[id] = record;
    assignments.set(slotIndex, id);
    assigned.add(id);
    createdFormationIds.push(id);
  });

  runtime.tileOrder.forEach((hexKey) => {
    const tile = runtime.tiles[hexKey];
    if (tile) tile.formationIds = [];
  });
  nonProjectedIds.forEach((id) => {
    const formation = runtime.formations[id];
    if (!formation || formation.locationHexKey === null) return;
    appendPlacement(runtime, formation, {
      hexKey: formation.locationHexKey,
      faction: formation.faction,
      unitType: formation.campaignUnitType,
      groupIndex: formation.origin.legacyGroupIndex ?? 0,
      ordinal: formation.origin.legacyOrdinal ?? 0,
      label: formation.origin.legacyLabel
    });
  });
  desired.forEach((slot, slotIndex) => {
    const id = assignments.get(slotIndex);
    const formation = id ? runtime.formations[id] : null;
    if (!formation) return;
    const priorHexKey = formation.locationHexKey;
    appendPlacement(runtime, formation, slot);
    if (priorHexKey !== slot.hexKey && !createdFormationIds.includes(formation.id)) {
      movedFormationIds.push(formation.id);
      if (formation.status === "inTransit") formation.status = "ready";
      formation.battleHistory.push(createHistoryEntry(
        formation,
        "moved",
        segment,
        `${formation.name} moved from ${priorHexKey ?? "reserve"} to ${slot.hexKey} (${reason}).`,
        priorHexKey,
        slot.hexKey
      ));
    }
  });

  availableIds.forEach((id) => {
    if (assigned.has(id)) return;
    const formation = runtime.formations[id];
    if (!formation) return;
    const originHexKey = formation.locationHexKey;
    formation.status = "destroyed";
    formation.locationHexKey = null;
    formation.currentOrderId = null;
    formation.retiredSegment = segment;
    formation.battleHistory.push(createHistoryEntry(
      formation,
      "retired",
      segment,
      `${formation.name} left the aggregate order of battle (${reason}).`,
      originHexKey,
      null
    ));
    retiredFormationIds.push(id);
  });

  synchronizeCampaignFormationForceProjection(runtime);
  return { createdFormationIds, movedFormationIds, retiredFormationIds };
}

/** Returns the current effective tactical experience without exposing mutable campaign pools. */
export function getCampaignFormationEffectiveExperience(formation: CampaignFormationRecord): number {
  return getEffectiveExperience({
    experience: formation.experience.base + formation.experience.earned,
    baseExperience: formation.experience.base,
    earnedExperience: formation.experience.earned
  });
}
