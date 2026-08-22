/**
 * MODULE: CampaignEngagementLedgerService
 * WHAT: Creates, commits, validates, resolves, and projects campaign engagement-ledger records.
 * WHY: Tactical launch needs an atomic formation lock and a frozen, integrity-checked package that cannot be duplicated.
 */

import { CAMPAIGN_NON_FORMATION_SUPPORT_KEYS, mapCampaignUnitToAllocationKey } from "../campaignForceMapping";
import {
  createStableCampaignRecordId,
  computeCampaignContentHash
} from "../runtime/CampaignCanonical";
import type { CampaignRuntimeState } from "../runtime/campaignRuntimeTypes";
import {
  isCampaignFormationBattleEligible
} from "../formations/CampaignFormationBattleAdapter";
import { transitionCampaignFormationStatus } from "../formations/FormationLifecycleService";
import type { CampaignFormationRecord } from "../formations/campaignFormationTypes";
import type { CampaignBattleResultPackage } from "../results/CampaignBattleResultTypes";
import {
  CAMPAIGN_BATTLE_PACKAGE_VERSION,
  CAMPAIGN_ENGAGEMENT_LEDGER_VERSION,
  type CampaignBattleAllocationCommitment,
  type CampaignBattlePackage,
  type CampaignEngagementCommitmentRequest,
  type CampaignEngagementCommitmentResult,
  type CampaignEngagementLedgerRecord,
  type CampaignFormationCommitment,
  type CampaignFormationCommitmentBaseline,
  type CampaignFormationCommitmentRole,
  type CampaignResolutionReceiptResult,
  type CampaignSupportCommitment
} from "./CampaignEngagementLedgerTypes";

function snapshotFormationBaseline(formation: CampaignFormationRecord): CampaignFormationCommitmentBaseline {
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

function createLedgerRecord(
  engagementId: string,
  segment: number,
  status: CampaignEngagementLedgerRecord["status"] = "opportunity",
  legacyUnfrozen = false
): CampaignEngagementLedgerRecord {
  return {
    ledgerVersion: CAMPAIGN_ENGAGEMENT_LEDGER_VERSION,
    id: engagementId,
    engagementId,
    status,
    createdSegment: segment,
    plannedRevision: status === "planned" ? 0 : null,
    committedRevision: null,
    launchedRevision: status === "inBattle" ? 0 : null,
    terminalRevision: null,
    package: null,
    resultPackage: null,
    consequenceReport: null,
    controlReport: null,
    infrastructureReport: null,
    afterActionReport: null,
    legacyUnfrozen,
    appliedResolutionIds: [],
    resolutionSummaryHash: null
  };
}

/** Adds missing ledger rows without discarding terminal history for engagements no longer in the live queue. */
export function reconcileCampaignEngagementLedger(runtime: CampaignRuntimeState): void {
  runtime.engagementOrder.forEach((engagementId) => {
    if (runtime.engagementLedger[engagementId]) return;
    const engagement = runtime.engagements[engagementId];
    const activeLegacy = runtime.activeEngagementId === engagementId && engagement?.status === "inBattle";
    runtime.engagementLedgerOrder.push(engagementId);
    runtime.engagementLedger[engagementId] = createLedgerRecord(
      engagementId,
      runtime.currentSegment,
      engagement?.status ?? "opportunity",
      activeLegacy
    );
  });

  runtime.engagementLedgerOrder.forEach((engagementId) => {
    const ledger = runtime.engagementLedger[engagementId];
    if (!ledger) return;
    // Campaign 2.0 packages remain unreleased; still normalize development saves from C20-021.
    const developmentLedger = ledger as unknown as {
      resultPackage?: CampaignBattleResultPackage | null;
      consequenceReport?: CampaignEngagementLedgerRecord["consequenceReport"];
      controlReport?: CampaignEngagementLedgerRecord["controlReport"];
      infrastructureReport?: CampaignEngagementLedgerRecord["infrastructureReport"];
      afterActionReport?: CampaignEngagementLedgerRecord["afterActionReport"];
    };
    if (developmentLedger.resultPackage === undefined) developmentLedger.resultPackage = null;
    if (developmentLedger.consequenceReport === undefined) developmentLedger.consequenceReport = null;
    if (developmentLedger.controlReport === undefined) developmentLedger.controlReport = null;
    if (developmentLedger.infrastructureReport === undefined) developmentLedger.infrastructureReport = null;
    if (developmentLedger.afterActionReport === undefined) developmentLedger.afterActionReport = null;
    const legacyPackage = ledger.package as unknown as (Record<string, unknown> & {
      packageVersion?: number;
      formationCommitments?: Array<Record<string, unknown> & { formationId?: string }>;
    }) | null;
    if (legacyPackage?.packageVersion === 1 && Array.isArray(legacyPackage.formationCommitments)) {
      const commitments = legacyPackage.formationCommitments.map((entry) => {
        const formation = entry.formationId ? runtime.formations[entry.formationId] : null;
        if (!formation) throw new Error("A legacy engagement package references a missing formation.");
        return { ...entry, before: snapshotFormationBaseline(formation) };
      });
      const { integrityHash: _oldIntegrity, ...legacyUnsigned } = legacyPackage;
      const unsigned = {
        ...legacyUnsigned,
        packageVersion: CAMPAIGN_BATTLE_PACKAGE_VERSION,
        formationCommitments: commitments
      } as unknown as Omit<CampaignBattlePackage, "integrityHash">;
      ledger.package = { ...unsigned, integrityHash: computeBattlePackageIntegrity(unsigned) };
    }
    if (runtime.engagements[engagementId]) return;
    if (ledger.status === "opportunity" || ledger.status === "planned") {
      ledger.status = "cancelled";
      ledger.terminalRevision = runtime.revision + 1;
    }
  });
}

/** Marks a live opportunity as the player's current precombat plan without reserving formations. */
export function planCampaignEngagement(runtime: CampaignRuntimeState, engagementId: string): void {
  reconcileCampaignEngagementLedger(runtime);
  const engagement = runtime.engagements[engagementId];
  const ledger = runtime.engagementLedger[engagementId];
  if (!engagement || !ledger) throw new Error(`Engagement ${engagementId} is unavailable.`);
  if (ledger.status === "resolved" || ledger.status === "cancelled" || ledger.status === "abandoned") {
    throw new Error(`Engagement ${engagementId} is already ${ledger.status}.`);
  }
  if (runtime.activeEngagementId && runtime.activeEngagementId !== engagementId) {
    const activeLedger = runtime.engagementLedger[runtime.activeEngagementId];
    if (activeLedger?.status === "committed" || activeLedger?.status === "inBattle") {
      throw new Error("Another engagement already owns committed forces.");
    }
  }
  runtime.activeEngagementId = engagementId;
  runtime.status = "planning";
  engagement.status = ledger.package ? "committed" : "planned";
  ledger.status = engagement.status;
  ledger.plannedRevision ??= runtime.revision + 1;
  ledger.legacyUnfrozen = false;
}

function normalizeSelections(request: CampaignEngagementCommitmentRequest): CampaignBattleAllocationCommitment[] {
  const seen = new Set<string>();
  const selections = request.selections.map((selection) => {
    const allocationKey = selection.allocationKey.trim();
    const category = selection.category.trim();
    if (!allocationKey || !category || seen.has(allocationKey)) {
      throw new Error("Commitment selections require unique, non-empty allocation and category keys.");
    }
    if (!Number.isInteger(selection.quantity) || selection.quantity <= 0
      || !Number.isFinite(selection.unitRpCost) || selection.unitRpCost < 0) {
      throw new Error(`Allocation ${allocationKey} has an invalid quantity or RP cost.`);
    }
    seen.add(allocationKey);
    return {
      allocationKey,
      category,
      quantity: selection.quantity,
      unitRpCost: selection.unitRpCost,
      totalRpCost: selection.quantity * selection.unitRpCost
    };
  });
  return selections.sort((left, right) => left.allocationKey.localeCompare(right.allocationKey));
}

function buildFormationCommitment(
  runtime: CampaignRuntimeState,
  engagementId: string,
  formation: CampaignFormationRecord,
  role: CampaignFormationCommitmentRole,
  allocationKey: string
): CampaignFormationCommitment {
  if (!formation.locationHexKey) throw new Error(`Formation ${formation.id} has no campaign location.`);
  return {
    formationId: formation.id,
    faction: formation.faction,
    role,
    allocationKey,
    sourceHexKey: formation.locationHexKey,
    tacticalUnitId: createStableCampaignRecordId("tactical-unit", runtime.campaignId, engagementId, formation.id),
    beforeStateHash: computeCampaignContentHash(formation),
    before: snapshotFormationBaseline(formation)
  };
}

function selectAttackerCommitments(
  runtime: CampaignRuntimeState,
  engagementId: string,
  selections: readonly CampaignBattleAllocationCommitment[]
): CampaignFormationCommitment[] {
  const context = runtime.engagements[engagementId]?.engagement.context;
  if (!context) throw new Error("The engagement has no structured campaign context to commit.");
  const used = new Set<string>();
  const commitments: CampaignFormationCommitment[] = [];
  selections.forEach((selection) => {
    const cap = context.allocationCaps[selection.allocationKey] ?? 0;
    if (CAMPAIGN_NON_FORMATION_SUPPORT_KEYS.includes(selection.allocationKey)) {
      if (selection.quantity > cap) {
        throw new Error(`${selection.allocationKey} requests ${selection.quantity}, above the campaign cap of ${cap}.`);
      }
      return;
    }
    const candidateIds = context.availableForces
      .filter((group) => mapCampaignUnitToAllocationKey(group.unitType) === selection.allocationKey)
      .flatMap((group) => group.formationIds ?? []);
    if (candidateIds.length === 0) {
      if (cap > 0) throw new Error(`${selection.allocationKey} has no persistent formations behind its campaign cap.`);
      return;
    }
    if (selection.quantity > cap) {
      throw new Error(`${selection.allocationKey} requests ${selection.quantity}, above the campaign cap of ${cap}.`);
    }
    const selected: CampaignFormationRecord[] = [];
    candidateIds.forEach((formationId) => {
      if (selected.length >= selection.quantity || used.has(formationId)) return;
      const formation = runtime.formations[formationId];
      if (!formation || formation.faction !== context.attacker || !isCampaignFormationBattleEligible(formation)) return;
      if (formation.currentOrderId) return;
      used.add(formationId);
      selected.push(formation);
    });
    if (selected.length !== selection.quantity) {
      throw new Error(`${selection.allocationKey} has only ${selected.length} eligible persistent formation(s), not ${selection.quantity}.`);
    }
    selected.forEach((formation) => commitments.push(
      buildFormationCommitment(runtime, engagementId, formation, "attacker", selection.allocationKey)
    ));
  });
  if (commitments.length === 0) throw new Error("Commit at least one persistent combat formation before battle.");
  return commitments;
}

function selectDefenderCommitments(runtime: CampaignRuntimeState, engagementId: string): CampaignFormationCommitment[] {
  const context = runtime.engagements[engagementId]?.engagement.context;
  if (!context) return [];
  const used = new Set<string>();
  const commitments: CampaignFormationCommitment[] = [];
  context.enemyForces.forEach((group) => {
    const allocationKey = mapCampaignUnitToAllocationKey(group.unitType);
    if (!allocationKey) return;
    if ((group.formationIds?.length ?? 0) < group.count) {
      throw new Error(`Defender group ${group.unitType} is missing persistent formation identity.`);
    }
    (group.formationIds ?? []).slice(0, group.count).forEach((formationId) => {
      if (used.has(formationId)) return;
      const formation = runtime.formations[formationId];
      if (!formation || formation.faction !== context.defender || !isCampaignFormationBattleEligible(formation)) return;
      if (formation.currentOrderId) return;
      used.add(formationId);
      commitments.push(buildFormationCommitment(runtime, engagementId, formation, "defender", allocationKey));
    });
  });
  const expectedPersistentDefenders = context.enemyForces.reduce(
    (sum, group) => sum + (mapCampaignUnitToAllocationKey(group.unitType) ? group.count : 0),
    0
  );
  if (commitments.length !== expectedPersistentDefenders) {
    throw new Error("One or more defending formations changed before commitment. Refresh the engagement plan.");
  }
  return commitments;
}

function computeBattlePackageIntegrity(pkg: Omit<CampaignBattlePackage, "integrityHash">): string {
  return `fsg-battle-package-v2-${computeCampaignContentHash(pkg)}`;
}

/** Recomputes the package integrity value without trusting its stored hash. */
export function computeCampaignBattlePackageIntegrity(pkg: CampaignBattlePackage): string {
  const { integrityHash: _storedIntegrity, ...unsigned } = structuredClone(pkg);
  return computeBattlePackageIntegrity(unsigned);
}

/** Throws when a package is malformed, cross-bound, or was modified after commitment. */
export function assertCampaignBattlePackage(
  pkg: CampaignBattlePackage,
  expected?: { campaignId: string; scenarioKey: string; engagementId: string; packageId?: string }
): CampaignBattlePackage {
  if (pkg.packageVersion !== CAMPAIGN_BATTLE_PACKAGE_VERSION
    || !pkg.packageId || !pkg.campaignId || !pkg.scenarioKey || !pkg.engagementId
    || !Number.isInteger(pkg.sourceRevision) || !Number.isInteger(pkg.committedRevision)
    || pkg.sourceRevision < 0
    || pkg.committedRevision !== pkg.sourceRevision + 1
    || !Number.isInteger(pkg.committedSegment) || pkg.committedSegment < 0
    || !/^fnv1a32-[0-9a-f]{8}$/.test(pkg.commitmentRequestHash)
    || !/^fnv1a32-[0-9a-f]{8}$/.test(pkg.engagementContextHash)
    || pkg.engagement.id !== pkg.engagementId
    || pkg.context.engagementId !== pkg.engagementId
    || !Array.isArray(pkg.allocations) || !Array.isArray(pkg.formationCommitments)
    || !Array.isArray(pkg.supportCommitments) || !Array.isArray(pkg.resourceCommitments)) {
    throw new Error("Campaign battle package is malformed.");
  }
  if (expected && (pkg.campaignId !== expected.campaignId
    || pkg.scenarioKey !== expected.scenarioKey
    || pkg.engagementId !== expected.engagementId
    || (expected.packageId !== undefined && pkg.packageId !== expected.packageId))) {
    throw new Error("Campaign battle package belongs to a different campaign engagement.");
  }
  if (computeCampaignBattlePackageIntegrity(pkg) !== pkg.integrityHash) {
    throw new Error("Campaign battle package failed its integrity check.");
  }
  const formationIds = pkg.formationCommitments.map((entry) => entry.formationId);
  if (formationIds.length === 0 || new Set(formationIds).size !== formationIds.length) {
    throw new Error("Campaign battle package has missing or duplicate formation commitments.");
  }
  if (pkg.formationCommitments.some((entry) => !entry.formationId || !entry.allocationKey
    || !entry.sourceHexKey || !entry.tacticalUnitId
    || (entry.role !== "attacker" && entry.role !== "defender")
    || !/^fnv1a32-[0-9a-f]{8}$/.test(entry.beforeStateHash)
    || !entry.before || !entry.before.personnel || !entry.before.equipment
    || !Number.isFinite(entry.before.readiness) || !Number.isFinite(entry.before.cohesion)
    || entry.before.readiness < 0 || entry.before.cohesion < 0
    || !Number.isFinite(entry.before.fatigue) || entry.before.fatigue < 0
    || !entry.before.supply || !(Object.values(entry.before.supply) as number[]).every((value) => Number.isFinite(value) && value >= 0)
    || !entry.before.experience || !(Object.values(entry.before.experience) as number[]).every((value) => Number.isFinite(value) && value >= 0))) {
    throw new Error("Campaign battle package contains a malformed formation commitment.");
  }
  if (pkg.allocations.some((entry) => !entry.allocationKey || !entry.category
    || !Number.isInteger(entry.quantity) || entry.quantity <= 0
    || !Number.isFinite(entry.unitRpCost) || entry.unitRpCost < 0
    || entry.totalRpCost !== entry.quantity * entry.unitRpCost)
    || pkg.supportCommitments.some((entry) => !entry.allocationKey || !entry.category
      || !Number.isInteger(entry.quantity) || entry.quantity <= 0
      || !Number.isFinite(entry.reservedRp) || entry.reservedRp < 0)
    || pkg.resourceCommitments.some((entry) => !Number.isFinite(entry.reservedAmount) || entry.reservedAmount < 0)) {
    throw new Error("Campaign battle package contains malformed allocation or resource commitments.");
  }
  return structuredClone(pkg);
}

/** Locks one exact tactical package. Repeating the same request is a no-op; changing it is rejected. */
export function commitCampaignEngagement(
  runtime: CampaignRuntimeState,
  request: CampaignEngagementCommitmentRequest
): CampaignEngagementCommitmentResult {
  reconcileCampaignEngagementLedger(runtime);
  const engagementRuntime = runtime.engagements[request.engagementId];
  const ledger = runtime.engagementLedger[request.engagementId];
  if (!engagementRuntime || !ledger || !engagementRuntime.engagement.context) {
    throw new Error(`Engagement ${request.engagementId} is unavailable or lacks strategic context.`);
  }
  const allocations = normalizeSelections(request);
  const context = structuredClone(engagementRuntime.engagement.context);
  // Legacy context used Infinity for an undefended target. Frozen packages must remain JSON/canonical-hash safe.
  if (!Number.isFinite(context.forceRatio)) context.forceRatio = Number.MAX_SAFE_INTEGER;
  const engagementContextHash = computeCampaignContentHash(context);
  const commitmentRequestHash = computeCampaignContentHash({
    campaignId: runtime.campaignId,
    engagementId: request.engagementId,
    engagementContextHash,
    allocations
  });
  if (ledger.package) {
    if (ledger.package.commitmentRequestHash !== commitmentRequestHash) {
      throw new Error("This engagement already owns a different committed battle package.");
    }
    return { package: assertCampaignBattlePackage(ledger.package), alreadyCommitted: true };
  }
  if (runtime.revision !== request.expectedRevision) {
    throw new Error(`The campaign changed from revision ${request.expectedRevision} to ${runtime.revision}. Refresh before committing.`);
  }
  if (runtime.activeEngagementId !== request.engagementId) {
    throw new Error("The engagement is no longer the active precombat plan.");
  }
  if (ledger.status !== "planned" && ledger.status !== "opportunity" && !ledger.legacyUnfrozen) {
    throw new Error(`Engagement ${request.engagementId} cannot commit from ${ledger.status}.`);
  }

  const formationCommitments = [
    ...selectAttackerCommitments(runtime, request.engagementId, allocations),
    ...selectDefenderCommitments(runtime, request.engagementId)
  ];
  const committedAllocationKeys = new Set(formationCommitments
    .filter((entry) => entry.role === "attacker")
    .map((entry) => entry.allocationKey));
  const supportCommitments: CampaignSupportCommitment[] = allocations
    .filter((entry) => !committedAllocationKeys.has(entry.allocationKey))
    .map((entry) => ({
      allocationKey: entry.allocationKey,
      category: entry.category,
      quantity: entry.quantity,
      reservedRp: entry.totalRpCost
    }));
  const supportRp = supportCommitments.reduce((sum, entry) => sum + entry.reservedRp, 0);
  if (supportRp > context.rpReserve) {
    throw new Error(`Support commitment requires ${supportRp} RP, above the ${context.rpReserve} RP reserve.`);
  }
  const reservedAirSorties = supportCommitments
    .filter((entry) => /air|fighter|bomber|interceptor|scout/i.test(entry.allocationKey))
    .reduce((sum, entry) => sum + entry.quantity, 0);
  if (reservedAirSorties > context.airSorties) {
    throw new Error(`Air commitment requires ${reservedAirSorties} sorties, but only ${context.airSorties} are available.`);
  }

  const sourceRevision = runtime.revision;
  const committedRevision = sourceRevision + 1;
  const packageId = createStableCampaignRecordId(
    "battle-package",
    runtime.campaignId,
    request.engagementId,
    sourceRevision,
    commitmentRequestHash
  );
  const commitmentIdempotencyKey = createStableCampaignRecordId(
    "engagement-commitment",
    runtime.campaignId,
    request.engagementId,
    commitmentRequestHash
  );
  const unsigned: Omit<CampaignBattlePackage, "integrityHash"> = {
    packageVersion: CAMPAIGN_BATTLE_PACKAGE_VERSION,
    packageId,
    campaignId: runtime.campaignId,
    scenarioKey: runtime.scenarioKey,
    engagementId: request.engagementId,
    sourceRevision,
    committedRevision,
    committedSegment: runtime.currentSegment,
    commitmentIdempotencyKey,
    commitmentRequestHash,
    engagementContextHash,
    engagement: {
      ...structuredClone(engagementRuntime.engagement),
      context: structuredClone(context)
    },
    context,
    allocations,
    formationCommitments,
    supportCommitments,
    resourceCommitments: [
      { faction: context.attacker, poolKey: "requisitionPoints", reservedAmount: supportRp },
      { faction: context.attacker, poolKey: "airSorties", reservedAmount: reservedAirSorties }
    ]
  };
  const pkg: CampaignBattlePackage = { ...unsigned, integrityHash: computeBattlePackageIntegrity(unsigned) };
  formationCommitments.forEach((entry) => {
    const changed = transitionCampaignFormationStatus(
      runtime,
      entry.formationId,
      "committed",
      runtime.currentSegment,
      `${runtime.formations[entry.formationId]?.name ?? entry.formationId} committed to engagement ${request.engagementId}.`
    );
    if (!changed && runtime.formations[entry.formationId]?.status !== "committed") {
      throw new Error(`Formation ${entry.formationId} could not be committed.`);
    }
  });
  ledger.status = "inBattle";
  ledger.package = pkg;
  ledger.legacyUnfrozen = false;
  ledger.plannedRevision ??= sourceRevision;
  ledger.committedRevision = committedRevision;
  ledger.launchedRevision = committedRevision;
  engagementRuntime.status = "inBattle";
  runtime.activeEngagementId = request.engagementId;
  runtime.status = "engagement";
  return { package: structuredClone(pkg), alreadyCommitted: false };
}

/** Returns the frozen active package defensively. */
export function getCampaignBattlePackage(
  runtime: CampaignRuntimeState,
  engagementId: string
): CampaignBattlePackage | null {
  const pkg = runtime.engagementLedger[engagementId]?.package;
  return pkg ? assertCampaignBattlePackage(pkg) : null;
}

/** Releases temporary commitment locks after the legacy outcome bridge records the battle. */
export function releaseResolvedCampaignFormationCommitments(
  runtime: CampaignRuntimeState,
  engagementId: string
): void {
  const pkg = runtime.engagementLedger[engagementId]?.package;
  if (!pkg) return;
  pkg.formationCommitments.forEach((entry) => {
    if (runtime.formations[entry.formationId]?.status === "committed") {
      transitionCampaignFormationStatus(
        runtime,
        entry.formationId,
        "ready",
        runtime.currentSegment,
        `${runtime.formations[entry.formationId]?.name ?? entry.formationId} released after engagement ${engagementId}.`
      );
    }
  });
}

/** Records a result receipt exactly once and retains its verified tactical fact package. */
export function recordCampaignEngagementResolution(
  runtime: CampaignRuntimeState,
  engagementId: string,
  resolutionId: string,
  summary: unknown,
  resultPackage?: CampaignBattleResultPackage
): CampaignResolutionReceiptResult {
  const ledger = runtime.engagementLedger[engagementId];
  if (!ledger) throw new Error(`Engagement ledger ${engagementId} is unavailable.`);
  if (!resolutionId.trim()) throw new Error("Battle resolution ID cannot be empty.");
  if (ledger.appliedResolutionIds.includes(resolutionId)) {
    return { resolutionId, duplicate: true };
  }
  if (ledger.appliedResolutionIds.length > 0) {
    throw new Error("This engagement already accepted a different battle result.");
  }
  if (resultPackage) {
    if (!ledger.package) throw new Error("A tactical result package requires a frozen battle commitment package.");
    if (resultPackage.resolutionId !== resolutionId || resultPackage.engagementId !== engagementId
      || resultPackage.battlePackageId !== ledger.package.packageId
      || resultPackage.battlePackageIntegrityHash !== ledger.package.integrityHash) {
      throw new Error("The tactical result identity does not match the engagement receipt.");
    }
    ledger.resultPackage = structuredClone(resultPackage);
  }
  ledger.appliedResolutionIds.push(resolutionId);
  ledger.resolutionSummaryHash = computeCampaignContentHash(resultPackage ?? summary);
  ledger.status = "resolved";
  ledger.terminalRevision = runtime.revision + 1;
  const engagement = runtime.engagements[engagementId];
  if (engagement) engagement.status = "resolved";
  releaseResolvedCampaignFormationCommitments(runtime, engagementId);
  return { resolutionId, duplicate: false };
}
