/**
 * MODULE: CampaignBattleConsequenceResolver
 * WHAT: Reconciles one verified tactical result into persistent formations, support accounting, economy, history, and the engagement ledger.
 * WHY: A finished battle must become one atomic, replay-safe campaign revision without reading tactical UI or inventing control rules.
 */

import type { CampaignFactionEconomy } from "../../../core/campaignTypes";
import type { CampaignDomainEventDraft, CampaignRuntimeState } from "../runtime/campaignRuntimeTypes";
import { computeCampaignContentHash } from "../runtime/CampaignCanonical";
import {
  appendCampaignFormationBattleHistory,
  retireCampaignFormation,
  synchronizeCampaignFormationForceProjection,
  transitionCampaignFormationStatus
} from "../formations/FormationLifecycleService";
import type {
  CampaignFormationRecord,
  CampaignFormationStatus,
  CampaignFormationSupply
} from "../formations/campaignFormationTypes";
import {
  assertCampaignBattlePackage,
  recordCampaignEngagementResolution
} from "../engagements/CampaignEngagementLedgerService";
import type {
  CampaignBattlePackage,
  CampaignFormationCommitment
} from "../engagements/CampaignEngagementLedgerTypes";
import { assertCampaignBattleResultPackage } from "../results/CampaignBattleResultExtractor";
import type {
  CampaignBattleResultPackage,
  CampaignFormationBattleDelta,
  CampaignSupportDelta
} from "../results/CampaignBattleResultTypes";
import {
  CAMPAIGN_BATTLE_CONSEQUENCE_VERSION,
  type CampaignBattleConsequenceReport,
  type CampaignBattleEconomyCharge,
  type CampaignBattleEconomySnapshot,
  type CampaignFactionBattleEconomyConsequence,
  type CampaignFormationBattleConsequence,
  type CampaignSupportBattleConsequence
} from "./CampaignBattleConsequenceTypes";

const SUPPLY_KEYS: ReadonlyArray<keyof CampaignFormationSupply> = ["ammo", "fuel", "rations", "parts"];
const TERMINAL_STATUSES = new Set<CampaignFormationStatus>(["destroyed", "captured"]);

export interface CampaignBattleConsequenceApplication {
  readonly duplicate: boolean;
  readonly report: CampaignBattleConsequenceReport;
  readonly events: readonly CampaignDomainEventDraft[];
}

function emptySupply(): CampaignFormationSupply {
  return { ammo: 0, fuel: 0, rations: 0, parts: 0 };
}

function normalizedFormationBaseline(formation: CampaignFormationRecord): CampaignFormationCommitment["before"] {
  return {
    personnel: structuredClone(formation.personnel),
    equipment: structuredClone(formation.equipment),
    readinessModel: formation.readinessModel ? structuredClone(formation.readinessModel) : null,
    readiness: formation.readiness,
    cohesion: formation.cohesion,
    fatigue: formation.fatigue,
    supply: structuredClone(formation.supply),
    experience: structuredClone(formation.experience)
  };
}

function assertFormationStillMatchesCommitment(
  formation: CampaignFormationRecord,
  commitment: CampaignFormationCommitment,
  delta: CampaignFormationBattleDelta
): void {
  if (formation.status !== "committed"
    || formation.faction !== commitment.faction
    || formation.locationHexKey !== commitment.sourceHexKey
    || computeCampaignContentHash(normalizedFormationBaseline(formation)) !== computeCampaignContentHash(commitment.before)
    || computeCampaignContentHash(delta.personnelStatusBefore) !== computeCampaignContentHash(commitment.before.personnel)
    || computeCampaignContentHash(delta.equipmentStatusBefore) !== computeCampaignContentHash(commitment.before.equipment)
    || computeCampaignContentHash(delta.supplyBefore) !== computeCampaignContentHash(commitment.before.supply)
    || computeCampaignContentHash(delta.experienceBefore) !== computeCampaignContentHash(commitment.before.experience)
    || delta.readinessBefore !== commitment.before.readiness
    || delta.cohesionBefore !== commitment.before.cohesion
    || delta.fatigueBefore !== commitment.before.fatigue) {
    throw new Error(`Formation ${formation.id} changed after its battle commitment and cannot accept this result.`);
  }
}

function persistentStatusFor(delta: CampaignFormationBattleDelta): CampaignFormationStatus {
  switch (delta.status) {
    case "captured": return "captured";
    case "destroyed": return "destroyed";
    case "shattered": return "shattered";
    default: return "ready";
  }
}

function equipmentLosses(delta: CampaignFormationBattleDelta): Record<string, number> {
  const keys = new Set([...Object.keys(delta.equipmentBefore), ...Object.keys(delta.equipmentAfter)]);
  return Object.fromEntries(Array.from(keys).sort().map((key) => [
    key,
    Math.max(0, (delta.equipmentBefore[key] ?? 0) - (delta.equipmentAfter[key] ?? 0))
  ]));
}

function applyFormationDelta(
  runtime: CampaignRuntimeState,
  pkg: CampaignBattlePackage,
  delta: CampaignFormationBattleDelta
): CampaignFormationBattleConsequence {
  const commitment = pkg.formationCommitments.find((entry) => entry.formationId === delta.campaignFormationId);
  const formation = runtime.formations[delta.campaignFormationId];
  if (!commitment || !formation) throw new Error(`Formation ${delta.campaignFormationId} has no live campaign commitment.`);
  assertFormationStillMatchesCommitment(formation, commitment, delta);

  const statusBefore = formation.status;
  const statusAfter = persistentStatusFor(delta);
  formation.personnel = structuredClone(delta.personnelStatusAfter);
  formation.equipment = structuredClone(delta.equipmentStatusAfter);
  if (delta.readinessModel) formation.readinessModel = structuredClone(delta.readinessModel);
  else delete formation.readinessModel;
  formation.readiness = delta.readinessAfter;
  formation.cohesion = delta.cohesionAfter;
  formation.fatigue = delta.fatigueAfter;
  formation.supply = structuredClone(delta.supplyAfter);
  formation.experience = structuredClone(delta.experienceAfter);

  const personnelLost = Math.max(0, delta.personnelBefore - delta.personnelAfter);
  const battleSummary = `${formation.name} ${delta.status} in engagement ${pkg.engagementId}; ${personnelLost} personnel lost, readiness ${Math.round(delta.readinessBefore)} to ${Math.round(delta.readinessAfter)}.`;
  if (!appendCampaignFormationBattleHistory(
    runtime,
    formation.id,
    runtime.currentSegment,
    pkg.engagementId,
    battleSummary
  )) {
    throw new Error(`Formation ${formation.id} could not record its battle history.`);
  }

  if (TERMINAL_STATUSES.has(statusAfter)) {
    if (!retireCampaignFormation(
      runtime,
      formation.id,
      statusAfter as "destroyed" | "captured",
      runtime.currentSegment,
      `${formation.name} was ${statusAfter} in engagement ${pkg.engagementId}.`
    )) {
      throw new Error(`Formation ${formation.id} could not enter terminal status ${statusAfter}.`);
    }
  } else if (!transitionCampaignFormationStatus(
    runtime,
    formation.id,
    statusAfter,
    runtime.currentSegment,
    delta.status === "withdrew"
      ? `${formation.name} withdrew and awaits operational placement after engagement ${pkg.engagementId}.`
      : `${formation.name} left engagement ${pkg.engagementId} as ${statusAfter}.`
  )) {
    throw new Error(`Formation ${formation.id} could not leave committed status.`);
  }

  return {
    campaignFormationId: formation.id,
    faction: formation.faction,
    role: delta.role,
    sourceHexKey: commitment.sourceHexKey,
    locationAfter: TERMINAL_STATUSES.has(statusAfter) ? null : commitment.sourceHexKey,
    statusBefore,
    statusAfter,
    personnelBefore: delta.personnelBefore,
    personnelAfter: delta.personnelAfter,
    personnelLost,
    equipmentLost: equipmentLosses(delta),
    readinessBefore: delta.readinessBefore,
    readinessAfter: delta.readinessAfter,
    cohesionBefore: delta.cohesionBefore,
    cohesionAfter: delta.cohesionAfter,
    fatigueBefore: delta.fatigueBefore,
    fatigueAfter: delta.fatigueAfter,
    experienceBefore: structuredClone(delta.experienceBefore),
    experienceAfter: structuredClone(delta.experienceAfter),
    supplyBefore: structuredClone(delta.supplyBefore),
    supplyAfter: structuredClone(delta.supplyAfter),
    placementResolution: TERMINAL_STATUSES.has(statusAfter) ? "terminallyRemoved" : "heldAtSourcePendingControl"
  };
}

function supportUsesDomain(delta: CampaignSupportDelta, domain: "air" | "naval"): boolean {
  const source = `${delta.allocationKey} ${delta.category}`;
  return domain === "air"
    ? /air|fighter|bomber|interceptor|scout/i.test(source)
    : /naval|ship|destroyer|cruiser|battleship|landing craft/i.test(source);
}

function reconcileSupport(
  pkg: CampaignBattlePackage,
  result: CampaignBattleResultPackage
): CampaignSupportBattleConsequence[] {
  const attackerResources = result.resourcesConsumed[String(pkg.context.attacker)];
  const committedRp = pkg.resourceCommitments.find((entry) => (
    entry.faction === pkg.context.attacker && entry.poolKey === "requisitionPoints"
  ))?.reservedAmount ?? 0;
  const committedAirSorties = pkg.resourceCommitments.find((entry) => (
    entry.faction === pkg.context.attacker && entry.poolKey === "airSorties"
  ))?.reservedAmount ?? 0;
  if (!attackerResources
    || attackerResources.reservedRequisitionPoints !== committedRp
    || attackerResources.reservedAirSorties !== committedAirSorties) {
    throw new Error("The tactical result does not reconcile its frozen campaign resource reservations.");
  }
  const remaining = attackerResources ? {
    ammo: attackerResources.ammo,
    fuel: attackerResources.fuel,
    rations: attackerResources.rations,
    parts: attackerResources.parts
  } : emptySupply();
  const commitmentByKey = new Map(pkg.supportCommitments.map((entry) => [entry.allocationKey, entry]));
  if (result.supportDeltas.length !== pkg.supportCommitments.length
    || new Set(result.supportDeltas.map((entry) => entry.allocationKey)).size !== result.supportDeltas.length) {
    throw new Error("The tactical result does not reconcile every support commitment exactly once.");
  }

  return result.supportDeltas.map((delta) => {
    const commitment = commitmentByKey.get(delta.allocationKey);
    if (!commitment
      || commitment.category !== delta.category
      || commitment.quantity !== delta.committedQuantity
      || commitment.reservedRp !== delta.reservedRp) {
      throw new Error(`Support result ${delta.allocationKey} does not match its frozen commitment.`);
    }
    const payloadConsumed = emptySupply();
    let payloadCommittedTotal = 0;
    let payloadConsumedTotal = 0;
    SUPPLY_KEYS.forEach((key) => {
      const committed = delta.resourcePayloadCommitted[key];
      const consumed = Math.min(committed, remaining[key]);
      payloadConsumed[key] = consumed;
      remaining[key] -= consumed;
      payloadCommittedTotal += committed;
      payloadConsumedTotal += consumed;
    });
    const payloadUseRatio = payloadCommittedTotal > 0 ? payloadConsumedTotal / payloadCommittedTotal : 0;
    const chargeUseRatio = delta.committedQuantity > 0
      ? Math.min(1, delta.chargesUsed / delta.committedQuantity)
      : 0;
    const utilization = delta.trackingMode === "resourcePool"
      ? Math.max(payloadUseRatio, chargeUseRatio)
      : delta.trackingMode === "supportAsset" ? chargeUseRatio : 1;
    const consumedRp = Math.min(delta.reservedRp, Math.ceil(delta.reservedRp * utilization));
    return {
      allocationKey: delta.allocationKey,
      category: delta.category,
      trackingMode: delta.trackingMode,
      committedQuantity: delta.committedQuantity,
      survivingElements: delta.survivingElements,
      lostElements: delta.lostElements,
      chargesUsed: delta.chargesUsed,
      reservedRequisitionPoints: delta.reservedRp,
      consumedRequisitionPoints: consumedRp,
      refundedRequisitionPoints: delta.reservedRp - consumedRp,
      resourcePayloadCommitted: structuredClone(delta.resourcePayloadCommitted),
      resourcePayloadConsumed: payloadConsumed
    };
  });
}

function economySnapshot(economy: CampaignFactionEconomy): CampaignBattleEconomySnapshot {
  return {
    manpower: economy.manpower,
    supplies: economy.supplies,
    fuel: economy.fuel,
    ammo: economy.ammo,
    airPower: economy.airPower,
    navalPower: economy.navalPower
  };
}

function chargeAvailable(before: number, requested: number): { charged: number; shortfall: number; after: number } {
  const charged = Math.min(before, requested);
  return { charged, shortfall: Math.max(0, requested - charged), after: before - charged };
}

function applyEconomyConsequences(
  runtime: CampaignRuntimeState,
  pkg: CampaignBattlePackage,
  result: CampaignBattleResultPackage,
  support: readonly CampaignSupportBattleConsequence[]
): Record<string, CampaignFactionBattleEconomyConsequence> {
  const attacker = String(pkg.context.attacker);
  const supportReserved = support.reduce((sum, entry) => sum + entry.reservedRequisitionPoints, 0);
  const supportConsumed = support.reduce((sum, entry) => sum + entry.consumedRequisitionPoints, 0);
  const supportRefunded = support.reduce((sum, entry) => sum + entry.refundedRequisitionPoints, 0);
  const airAssetsLost = result.supportDeltas
    .filter((entry) => supportUsesDomain(entry, "air"))
    .reduce((sum, entry) => sum + entry.lostElements, 0);
  const navalAssetsLost = result.supportDeltas
    .filter((entry) => supportUsesDomain(entry, "naval"))
    .reduce((sum, entry) => sum + entry.lostElements, 0);
  const consequences: Record<string, CampaignFactionBattleEconomyConsequence> = {};

  Object.entries(result.resourcesConsumed).forEach(([factionKey, consumption]) => {
    const factionRuntime = runtime.factions[factionKey];
    if (!factionRuntime || String(consumption.faction) !== factionKey) {
      throw new Error(`Battle resource result references unavailable faction ${factionKey}.`);
    }
    const before = economySnapshot(factionRuntime.economy);
    const factionSupportConsumed = factionKey === attacker ? supportConsumed : 0;
    const requested: CampaignBattleEconomyCharge = {
      supplies: consumption.rations + consumption.parts + factionSupportConsumed,
      fuel: consumption.fuel,
      ammo: consumption.ammo,
      airPower: factionKey === attacker ? airAssetsLost : 0,
      navalPower: factionKey === attacker ? navalAssetsLost : 0
    };
    const supplies = chargeAvailable(before.supplies, requested.supplies);
    const fuel = chargeAvailable(before.fuel, requested.fuel);
    const ammo = chargeAvailable(before.ammo, requested.ammo);
    const airPower = chargeAvailable(before.airPower, requested.airPower);
    const navalPower = chargeAvailable(before.navalPower, requested.navalPower);
    const charged: CampaignBattleEconomyCharge = {
      supplies: supplies.charged,
      fuel: fuel.charged,
      ammo: ammo.charged,
      airPower: airPower.charged,
      navalPower: navalPower.charged
    };
    const shortfall: CampaignBattleEconomyCharge = {
      supplies: supplies.shortfall,
      fuel: fuel.shortfall,
      ammo: ammo.shortfall,
      airPower: airPower.shortfall,
      navalPower: navalPower.shortfall
    };
    factionRuntime.economy.supplies = supplies.after;
    factionRuntime.economy.fuel = fuel.after;
    factionRuntime.economy.ammo = ammo.after;
    factionRuntime.economy.airPower = airPower.after;
    factionRuntime.economy.navalPower = navalPower.after;
    const after = economySnapshot(factionRuntime.economy);
    const airSortiesReserved = consumption.reservedAirSorties;
    const airSortiesConsumed = factionKey === attacker
      ? Math.min(airSortiesReserved, result.supportDeltas
        .filter((entry) => supportUsesDomain(entry, "air"))
        .reduce((sum, entry) => sum + entry.committedQuantity, 0))
      : 0;
    consequences[factionKey] = {
      faction: consumption.faction,
      before,
      tacticalConsumption: {
        ammo: consumption.ammo,
        fuel: consumption.fuel,
        rations: consumption.rations,
        parts: consumption.parts
      },
      supportRequisitionPointsReserved: factionKey === attacker ? supportReserved : 0,
      supportRequisitionPointsConsumed: factionSupportConsumed,
      supportRequisitionPointsRefunded: factionKey === attacker ? supportRefunded : 0,
      tacticalBattleRequisitionPointsSpent: consumption.battleRequisitionPointsSpent,
      airSortiesReserved,
      airSortiesConsumed,
      airSortiesReleased: airSortiesReserved - airSortiesConsumed,
      requestedCharge: requested,
      charged,
      shortfall,
      after
    };
  });
  return consequences;
}

function consequenceIntegrity(unsigned: Omit<CampaignBattleConsequenceReport, "integrityHash">): string {
  return `fsg-battle-consequence-v1-${computeCampaignContentHash(unsigned)}`;
}

export function computeCampaignBattleConsequenceIntegrity(report: CampaignBattleConsequenceReport): string {
  const { integrityHash: _integrityHash, ...unsigned } = structuredClone(report);
  return consequenceIntegrity(unsigned);
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Rejects modified, cross-bound, incomplete, or arithmetically inconsistent consequence audits. */
export function assertCampaignBattleConsequenceReport(
  report: CampaignBattleConsequenceReport,
  result: CampaignBattleResultPackage
): CampaignBattleConsequenceReport {
  if (report.consequenceVersion !== CAMPAIGN_BATTLE_CONSEQUENCE_VERSION
    || report.campaignId !== result.campaignId
    || report.scenarioKey !== result.scenarioKey
    || report.engagementId !== result.engagementId
    || report.resolutionId !== result.resolutionId
    || report.battleResultIntegrityHash !== result.integrityHash
    || report.result !== result.result
    || !Number.isInteger(report.sourceRevision) || report.sourceRevision < result.campaignRevision
    || report.appliedRevision !== report.sourceRevision + 1
    || !Number.isInteger(report.appliedSegment) || report.appliedSegment < 0
    || computeCampaignBattleConsequenceIntegrity(report) !== report.integrityHash) {
    throw new Error("Campaign battle consequence report is malformed, modified, or cross-bound.");
  }
  const formationIds = report.formationConsequences.map((entry) => entry.campaignFormationId);
  if (formationIds.length !== result.formationDeltas.length
    || new Set(formationIds).size !== formationIds.length
    || result.formationDeltas.some((delta) => !formationIds.includes(delta.campaignFormationId))) {
    throw new Error("Campaign consequence report does not account for every formation exactly once.");
  }
  report.formationConsequences.forEach((entry) => {
    const delta = result.formationDeltas.find((candidate) => candidate.campaignFormationId === entry.campaignFormationId)!;
    const expectedStatus = persistentStatusFor(delta);
    if (![entry.personnelBefore, entry.personnelAfter, entry.personnelLost, entry.readinessBefore,
      entry.readinessAfter, entry.cohesionBefore, entry.cohesionAfter, entry.fatigueBefore, entry.fatigueAfter]
      .every(isNonNegativeFinite)
      || entry.faction !== delta.faction
      || entry.role !== delta.role
      || entry.sourceHexKey !== delta.sourceHexKey
      || entry.statusAfter !== expectedStatus
      || entry.locationAfter !== (TERMINAL_STATUSES.has(expectedStatus) ? null : delta.sourceHexKey)
      || entry.placementResolution !== (TERMINAL_STATUSES.has(expectedStatus)
        ? "terminallyRemoved" : "heldAtSourcePendingControl")
      || entry.personnelBefore !== delta.personnelBefore
      || entry.personnelAfter !== delta.personnelAfter
      || entry.readinessBefore !== delta.readinessBefore
      || entry.readinessAfter !== delta.readinessAfter
      || entry.cohesionBefore !== delta.cohesionBefore
      || entry.cohesionAfter !== delta.cohesionAfter
      || entry.fatigueBefore !== delta.fatigueBefore
      || entry.fatigueAfter !== delta.fatigueAfter
      || computeCampaignContentHash(entry.experienceBefore) !== computeCampaignContentHash(delta.experienceBefore)
      || computeCampaignContentHash(entry.experienceAfter) !== computeCampaignContentHash(delta.experienceAfter)
      || computeCampaignContentHash(entry.supplyBefore) !== computeCampaignContentHash(delta.supplyBefore)
      || computeCampaignContentHash(entry.supplyAfter) !== computeCampaignContentHash(delta.supplyAfter)
      || entry.personnelLost !== Math.max(0, entry.personnelBefore - entry.personnelAfter)
      || !Object.values(entry.equipmentLost).every(isNonNegativeFinite)
      || !Object.values(entry.supplyBefore).every(isNonNegativeFinite)
      || !Object.values(entry.supplyAfter).every(isNonNegativeFinite)) {
      throw new Error(`Formation consequence ${entry.campaignFormationId} has invalid accounting.`);
    }
  });
  const supportKeys = report.supportConsequences.map((entry) => entry.allocationKey);
  if (supportKeys.length !== result.supportDeltas.length
    || new Set(supportKeys).size !== supportKeys.length
    || result.supportDeltas.some((delta) => !supportKeys.includes(delta.allocationKey))) {
    throw new Error("Campaign consequence report does not account for every support commitment exactly once.");
  }
  report.supportConsequences.forEach((entry) => {
    const delta = result.supportDeltas.find((candidate) => candidate.allocationKey === entry.allocationKey)!;
    if (![entry.committedQuantity, entry.survivingElements, entry.lostElements, entry.chargesUsed,
      entry.reservedRequisitionPoints, entry.consumedRequisitionPoints, entry.refundedRequisitionPoints]
      .every(isNonNegativeFinite)
      || entry.category !== delta.category
      || entry.trackingMode !== delta.trackingMode
      || entry.committedQuantity !== delta.committedQuantity
      || entry.survivingElements !== delta.survivingElements
      || entry.lostElements !== delta.lostElements
      || entry.chargesUsed !== delta.chargesUsed
      || entry.reservedRequisitionPoints !== delta.reservedRp
      || computeCampaignContentHash(entry.resourcePayloadCommitted)
        !== computeCampaignContentHash(delta.resourcePayloadCommitted)
      || entry.consumedRequisitionPoints + entry.refundedRequisitionPoints !== entry.reservedRequisitionPoints
      || !Object.values(entry.resourcePayloadCommitted).every(isNonNegativeFinite)
      || !Object.values(entry.resourcePayloadConsumed).every(isNonNegativeFinite)) {
      throw new Error(`Support consequence ${entry.allocationKey} has invalid conservation accounting.`);
    }
  });
  const economyFactions = Object.keys(report.economyConsequences);
  const resultFactions = Object.keys(result.resourcesConsumed);
  if (economyFactions.length !== resultFactions.length
    || new Set(economyFactions).size !== economyFactions.length
    || resultFactions.some((faction) => !economyFactions.includes(faction))) {
    throw new Error("Campaign consequence report does not account for every faction resource result exactly once.");
  }
  Object.entries(report.economyConsequences).forEach(([faction, entry]) => {
    const tactical = result.resourcesConsumed[faction];
    const numericGroups = [entry.before, entry.tacticalConsumption, entry.requestedCharge, entry.charged, entry.shortfall, entry.after];
    if (!tactical
      || String(entry.faction) !== faction
      || computeCampaignContentHash(entry.tacticalConsumption) !== computeCampaignContentHash({
        ammo: tactical.ammo,
        fuel: tactical.fuel,
        rations: tactical.rations,
        parts: tactical.parts
      })
      || entry.tacticalBattleRequisitionPointsSpent !== tactical.battleRequisitionPointsSpent
      || entry.airSortiesReserved !== tactical.reservedAirSorties
      || !numericGroups.every((group) => Object.values(group).every(isNonNegativeFinite))
      || ![entry.supportRequisitionPointsReserved, entry.supportRequisitionPointsConsumed,
        entry.supportRequisitionPointsRefunded, entry.tacticalBattleRequisitionPointsSpent,
        entry.airSortiesReserved, entry.airSortiesConsumed, entry.airSortiesReleased].every(isNonNegativeFinite)
      || entry.supportRequisitionPointsConsumed + entry.supportRequisitionPointsRefunded
        !== entry.supportRequisitionPointsReserved
      || entry.airSortiesConsumed + entry.airSortiesReleased !== entry.airSortiesReserved
      || entry.after.manpower !== entry.before.manpower
      || entry.after.supplies !== entry.before.supplies - entry.charged.supplies
      || entry.after.fuel !== entry.before.fuel - entry.charged.fuel
      || entry.after.ammo !== entry.before.ammo - entry.charged.ammo
      || entry.after.airPower !== entry.before.airPower - entry.charged.airPower
      || entry.after.navalPower !== entry.before.navalPower - entry.charged.navalPower) {
      throw new Error(`Economy consequence ${faction} has invalid conservation accounting.`);
    }
  });
  const expectedEvidence = Object.values(result.observedEvidenceByFaction)
    .reduce((sum, reports) => sum + reports.length, 0);
  if (report.deferred.infrastructureDamageCount !== result.infrastructureDamage.length
    || report.deferred.objectiveResultCount !== result.objectiveResults.length
    || report.deferred.evidenceReportCount !== expectedEvidence
    || report.deferred.honorRecommendationCount !== result.honorsRecommended.length) {
    throw new Error("Campaign consequence report has an invalid deferred-rule handoff.");
  }
  return structuredClone(report);
}

/**
 * Applies all C20-023-owned consequences to a transaction draft and returns the immutable audit plus event facts.
 * Territory/fronts, infrastructure mapping, objectives, evidence fusion, and honors remain unchanged for their named resolvers.
 */
export function applyCampaignBattleConsequences(
  runtime: CampaignRuntimeState,
  untrustedResult: CampaignBattleResultPackage
): CampaignBattleConsequenceApplication {
  const ledger = runtime.engagementLedger[untrustedResult.engagementId];
  if (!ledger?.package) throw new Error("The tactical result has no frozen campaign battle package.");
  const pkg = assertCampaignBattlePackage(ledger.package, {
    campaignId: runtime.campaignId,
    scenarioKey: runtime.scenarioKey,
    engagementId: untrustedResult.engagementId
  });
  const result = assertCampaignBattleResultPackage(untrustedResult, pkg);
  const expectedResourceFactions = new Set([String(pkg.context.attacker), String(pkg.context.defender)]);
  const resultResourceFactions = Object.keys(result.resourcesConsumed);
  if (resultResourceFactions.length !== expectedResourceFactions.size
    || resultResourceFactions.some((faction) => !expectedResourceFactions.has(faction))) {
    throw new Error("The tactical result does not contain one resource account for each engaged faction.");
  }
  if (ledger.appliedResolutionIds.includes(result.resolutionId)) {
    if (!ledger.consequenceReport) {
      throw new Error("This result was accepted before consequence auditing and cannot be applied a second time.");
    }
    return {
      duplicate: true,
      report: assertCampaignBattleConsequenceReport(ledger.consequenceReport, result),
      events: []
    };
  }
  if (ledger.appliedResolutionIds.length > 0 || ledger.status !== "inBattle") {
    throw new Error(`Engagement ${result.engagementId} cannot accept consequences from ${ledger.status}.`);
  }

  const formationConsequences = result.formationDeltas.map((delta) => applyFormationDelta(runtime, pkg, delta));
  synchronizeCampaignFormationForceProjection(runtime);
  const supportConsequences = reconcileSupport(pkg, result);
  const economyConsequences = applyEconomyConsequences(runtime, pkg, result, supportConsequences);
  const evidenceReportCount = Object.values(result.observedEvidenceByFaction)
    .reduce((sum, reports) => sum + reports.length, 0);
  const unsigned: Omit<CampaignBattleConsequenceReport, "integrityHash"> = {
    consequenceVersion: CAMPAIGN_BATTLE_CONSEQUENCE_VERSION,
    campaignId: runtime.campaignId,
    scenarioKey: runtime.scenarioKey,
    engagementId: result.engagementId,
    resolutionId: result.resolutionId,
    battleResultIntegrityHash: result.integrityHash,
    sourceRevision: runtime.revision,
    appliedRevision: runtime.revision + 1,
    appliedSegment: runtime.currentSegment,
    result: result.result,
    formationConsequences,
    supportConsequences,
    economyConsequences,
    deferred: {
      controlResolutionPending: Boolean(pkg.context.battleHexKey),
      infrastructureDamageCount: result.infrastructureDamage.length,
      objectiveResultCount: result.objectiveResults.length,
      evidenceReportCount,
      honorRecommendationCount: result.honorsRecommended.length
    }
  };
  const report: CampaignBattleConsequenceReport = {
    ...unsigned,
    integrityHash: consequenceIntegrity(unsigned)
  };
  assertCampaignBattleConsequenceReport(report, result);

  const receipt = recordCampaignEngagementResolution(
    runtime,
    result.engagementId,
    result.resolutionId,
    report,
    result
  );
  if (receipt.duplicate) throw new Error("The consequence receipt became duplicate during one atomic application.");
  ledger.consequenceReport = structuredClone(report);
  runtime.engagementOrder.splice(
    0,
    runtime.engagementOrder.length,
    ...runtime.engagementOrder.filter((engagementId) => engagementId !== result.engagementId)
  );
  delete runtime.engagements[result.engagementId];
  if (runtime.activeEngagementId === result.engagementId) runtime.activeEngagementId = null;
  if (runtime.status !== "victory" && runtime.status !== "defeat") runtime.status = "planning";

  const events: CampaignDomainEventDraft[] = [{
    type: "stateChanged",
    category: "engagement",
    summary: `Battle consequences applied for engagement ${result.engagementId}: ${result.result}.`,
    details: {
      engagementId: result.engagementId,
      resolutionId: result.resolutionId,
      result: result.result,
      formationCount: formationConsequences.length,
      supportCount: supportConsequences.length
    }
  }];
  formationConsequences.forEach((entry) => events.push({
    type: "stateChanged",
    category: "engagement",
    summary: `${runtime.formations[entry.campaignFormationId]?.name ?? entry.campaignFormationId} ended the battle ${entry.statusAfter}.`,
    details: {
      engagementId: result.engagementId,
      formationId: entry.campaignFormationId,
      status: entry.statusAfter,
      personnelLost: entry.personnelLost,
      readinessAfter: entry.readinessAfter
    }
  }));
  Object.values(economyConsequences).forEach((entry) => {
    const shortfallTotal = Object.values(entry.shortfall).reduce((sum, value) => sum + value, 0);
    events.push({
      type: "stateChanged",
      category: "logistics",
      summary: `${String(entry.faction)} battle stocks reconciled${shortfallTotal > 0 ? " with an emergency shortfall" : ""}.`,
      details: {
        engagementId: result.engagementId,
        faction: String(entry.faction),
        ammoCharged: entry.charged.ammo,
        fuelCharged: entry.charged.fuel,
        suppliesCharged: entry.charged.supplies,
        shortfall: shortfallTotal
      }
    });
  });
  return { duplicate: false, report: structuredClone(report), events };
}
