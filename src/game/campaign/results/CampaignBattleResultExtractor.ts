/**
 * MODULE: CampaignBattleResultExtractor
 * WHAT: Converts complete terminal tactical truth into one immutable, faction-safe campaign result package.
 * WHY: The campaign must reconcile exact formation and resource facts once, independent of battle UI summaries.
 */

import type { CampaignFactionKey } from "../../../core/campaignTypes";
import type { PersonnelStatusPool, ScenarioUnit, VehicleStatusPool } from "../../../core/types";
import type { SupplyKey } from "../../../core/SupplyState";
import { getAllocationOption } from "../../../data/unitAllocation";
import { calculateFormationReadiness } from "../../../data/unitSystem/status";
import type { SerializedBattleState, TurnFaction } from "../../GameEngine";
import type { MissionStatus } from "../../../state/missionRules";
import { campaignPackageNavalSources, CAMPAIGN_NAVAL_SUPPORT_ALLOCATION_KEY } from "../logistics/CampaignNavalSupportService";
import {
  assertCampaignBattlePackage
} from "../engagements/CampaignEngagementLedgerService";
import type {
  CampaignBattlePackage,
  CampaignFormationCommitment
} from "../engagements/CampaignEngagementLedgerTypes";
import {
  buildCampaignTacticalSupportAssets,
  campaignSupportAssetId
} from "../CampaignTacticalSupportAdapter";
import {
  computeCampaignContentHash,
  createStableCampaignRecordId
} from "../runtime/CampaignCanonical";
import {
  CAMPAIGN_BATTLE_RESULT_PACKAGE_VERSION,
  type CampaignBattleResultOutcome,
  type CampaignBattleResultPackage,
  type CampaignFormationBattleDelta,
  type CampaignInfrastructureDamage,
  type CampaignResourceDelta,
  type CampaignSupportDelta,
  type CampaignTacticalUnitDisposition,
  type TacticalEvidenceReport
} from "./CampaignBattleResultTypes";

export interface CampaignBattleResultExtractionInput {
  readonly battlePackage: CampaignBattlePackage;
  readonly tacticalState: SerializedBattleState;
  readonly missionStatus: MissionStatus | null;
  readonly result: CampaignBattleResultOutcome;
}

interface LocatedTacticalUnit {
  readonly unit: ScenarioUnit;
  readonly disposition: CampaignTacticalUnitDisposition;
}

const SUPPLY_KEYS: readonly SupplyKey[] = ["ammo", "fuel", "rations", "parts"];
const RESULT_OUTCOMES = new Set<CampaignBattleResultOutcome>([
  "attackerVictory", "defenderVictory", "stalemate", "withdrawal"
]);
const FORMATION_RESULT_STATUSES = new Set([
  "survived", "shattered", "destroyed", "captured", "withdrew"
]);
const TACTICAL_DISPOSITIONS = new Set<CampaignTacticalUnitDisposition>([
  "deployed", "reserve", "airborneReserve", "casualty"
]);

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function personnelSurvivors(pools: Readonly<Record<string, PersonnelStatusPool>>): number {
  return Object.values(pools).reduce(
    (sum, pool) => sum + pool.fit + pool.injured + pool.wounded + pool.severelyWounded,
    0
  );
}

function equipmentSurvivorsByType(
  pools: Readonly<Record<string, VehicleStatusPool>>
): Readonly<Record<string, number>> {
  return Object.fromEntries(Object.entries(pools).map(([key, pool]) => [
    key,
    pool.operational + pool.damaged + pool.disabled
  ]));
}

function locateTacticalUnits(state: SerializedBattleState): Map<string, LocatedTacticalUnit> {
  const located = new Map<string, LocatedTacticalUnit>();
  const add = (unit: ScenarioUnit, disposition: CampaignTacticalUnitDisposition): void => {
    const unitId = unit.unitId?.trim();
    if (!unitId) return;
    const prior = located.get(unitId);
    if (prior) {
      throw new Error(`Tactical unit ${unitId} appears in both ${prior.disposition} and ${disposition} result sources.`);
    }
    located.set(unitId, { unit: structuredClone(unit), disposition });
  };
  state.playerPlacements.forEach((unit) => add(unit, "deployed"));
  state.botPlacements.forEach((unit) => add(unit, "deployed"));
  (state.allyPlacements ?? []).forEach((unit) => add(unit, "deployed"));
  state.reserves.forEach((unit) => add(unit, "reserve"));
  (state.airborneReserves ?? []).forEach((unit) => add(unit, "airborneReserve"));
  (state.casualtyLog ?? []).forEach((entry) => add(entry.unit, "casualty"));
  return located;
}

function assertCommittedUnit(
  pkg: CampaignBattlePackage,
  commitment: CampaignFormationCommitment,
  located: LocatedTacticalUnit | undefined
): LocatedTacticalUnit {
  if (!located) {
    throw new Error(`Committed tactical unit ${commitment.tacticalUnitId} has no live, reserve, or casualty result record.`);
  }
  const provenance = located.unit.campaignProvenance;
  if (!provenance || !located.unit.status
    || provenance.campaignId !== pkg.campaignId
    || provenance.engagementId !== pkg.engagementId
    || provenance.formationId !== commitment.formationId
    || provenance.sourceRevision !== pkg.sourceRevision
    || provenance.faction !== String(commitment.faction)
    || located.unit.unitId !== commitment.tacticalUnitId) {
    throw new Error(`Tactical result provenance for formation ${commitment.formationId} is missing or cross-bound.`);
  }
  return located;
}

function extractFormationDelta(
  pkg: CampaignBattlePackage,
  commitment: CampaignFormationCommitment,
  located: LocatedTacticalUnit
): CampaignFormationBattleDelta {
  const unit = assertCommittedUnit(pkg, commitment, located).unit;
  const status = structuredClone(unit.status!);
  const personnelAfter = personnelSurvivors(status.personnel);
  const equipmentAfter = equipmentSurvivorsByType(status.equipment);
  const survivingEquipment = Object.values(equipmentAfter).reduce((sum, value) => sum + value, 0);
  const terminal = located.disposition === "casualty";
  const resultStatus: CampaignFormationBattleDelta["status"] = terminal
    ? (personnelAfter <= 0 && survivingEquipment <= 0 ? "destroyed" : "shattered")
    : "survived";
  const earnedExperience = Math.max(0, unit.earnedExperience ?? 0);
  const experienceAfter = {
    base: Math.max(0, unit.baseExperience ?? unit.experience ?? commitment.before.experience.base),
    earned: earnedExperience,
    battles: commitment.before.experience.battles + 1
  };
  const fatigueAfter = Math.max(0, status.fatigue ?? commitment.before.fatigue);
  return {
    campaignFormationId: commitment.formationId,
    tacticalUnitId: commitment.tacticalUnitId,
    faction: commitment.faction,
    role: commitment.role,
    sourceHexKey: commitment.sourceHexKey,
    beforeStateHash: commitment.beforeStateHash,
    tacticalDisposition: located.disposition,
    committedElementIds: [commitment.tacticalUnitId],
    personnelBefore: personnelSurvivors(commitment.before.personnel),
    personnelAfter,
    personnelStatusBefore: structuredClone(commitment.before.personnel),
    personnelStatusAfter: structuredClone(status.personnel),
    equipmentBefore: equipmentSurvivorsByType(commitment.before.equipment),
    equipmentAfter,
    equipmentStatusBefore: structuredClone(commitment.before.equipment),
    equipmentStatusAfter: structuredClone(status.equipment),
    readinessModel: commitment.before.readinessModel
      ? structuredClone(commitment.before.readinessModel)
      : null,
    readinessBefore: commitment.before.readiness,
    readinessAfter: calculateFormationReadiness(status, unit.strength).readiness,
    cohesionBefore: commitment.before.cohesion,
    // Tactical cohesion is not yet an independent pool; preserve the baseline instead of fabricating change.
    cohesionAfter: commitment.before.cohesion,
    fatigueBefore: commitment.before.fatigue,
    fatigueAfter,
    fatigueGained: Math.max(0, fatigueAfter - commitment.before.fatigue),
    experienceBefore: structuredClone(commitment.before.experience),
    experienceAfter,
    experienceGained: Math.max(0, experienceAfter.earned - commitment.before.experience.earned),
    supplyBefore: structuredClone(commitment.before.supply),
    supplyAfter: {
      ammo: Math.max(0, unit.ammo),
      fuel: Math.max(0, unit.fuel),
      rations: commitment.before.supply.rations,
      parts: commitment.before.supply.parts
    },
    status: resultStatus
  };
}

function extractSupportDeltas(
  pkg: CampaignBattlePackage,
  locatedUnits: ReadonlyMap<string, LocatedTacticalUnit>,
  state: SerializedBattleState
): CampaignSupportDelta[] {
  const expectedCampaignAssets = buildCampaignTacticalSupportAssets(pkg);
  const expectedCampaignAssetById = new Map(expectedCampaignAssets.map((asset) => [asset.id, asset]));
  const serializedAssets = new Map((state.supportAssets ?? []).map((asset) => [asset.id, asset]));
  if (serializedAssets.size !== (state.supportAssets ?? []).length) throw new Error("Tactical support state contains duplicate asset identities.");
  return pkg.supportCommitments.map((commitment) => {
    const option = getAllocationOption(commitment.allocationKey);
    const resourcePayloadCommitted = {
      ammo: (option?.depotPayload?.ammo ?? 0) * commitment.quantity,
      fuel: (option?.depotPayload?.fuel ?? 0) * commitment.quantity,
      rations: (option?.depotPayload?.rations ?? 0) * commitment.quantity,
      parts: (option?.depotPayload?.parts ?? 0) * commitment.quantity
    };
    const candidates = Array.from(locatedUnits.values())
      .filter(({ unit }) => !unit.campaignProvenance && unit.formationKey === commitment.allocationKey)
      .sort((left, right) => (left.unit.unitId ?? "").localeCompare(right.unit.unitId ?? ""))
      .slice(0, commitment.quantity);
    const lostElements = candidates.filter((entry) => entry.disposition === "casualty").length;
    const hasResourcePayload = Object.values(resourcePayloadCommitted).some((amount) => amount > 0);
    const expectedAssets = Array.from({ length: commitment.quantity }, (_, ordinal) =>
      expectedCampaignAssetById.get(campaignSupportAssetId(pkg, commitment.allocationKey, ordinal))
    ).filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
    const campaignAssets = expectedAssets.map((expected) => {
      const actual = serializedAssets.get(expected.id);
      if (!actual || actual.maxCharges !== expected.maxCharges || actual.strikeDamageCap !== expected.strikeDamageCap
        || !Number.isInteger(actual.charges) || actual.charges < 0 || actual.charges > actual.maxCharges) {
        throw new Error(`Campaign support ${commitment.allocationKey} is missing or does not match its frozen tactical profile.`);
      }
      return actual;
    });
    const tacticalElementIds = campaignAssets.length > 0
      ? campaignAssets.map((asset) => asset.id)
      : candidates.flatMap(({ unit }) => unit.unitId ? [unit.unitId] : []);
    const chargesUsed = campaignAssets.reduce(
      (sum, asset) => sum + Math.max(0, asset.maxCharges - asset.charges),
      0
    );
    return {
      ...(commitment.allocationKey === CAMPAIGN_NAVAL_SUPPORT_ALLOCATION_KEY ? {
        navalSourceDeltas: campaignPackageNavalSources(pkg).map((source, ordinal) => {
          const asset = campaignAssets[ordinal];
          if (!asset) throw new Error("Naval source has no matching tactical charge receipt.");
          return { ...source, tacticalAssetId: asset.id, chargesUsed: asset.maxCharges - asset.charges, chargesRemaining: asset.charges };
        })
      } : {}),
      allocationKey: commitment.allocationKey,
      category: commitment.category,
      committedQuantity: commitment.quantity,
      reservedRp: commitment.reservedRp,
      trackingMode: hasResourcePayload
        ? "resourcePool"
        : campaignAssets.length > 0
          ? "supportAsset"
          : candidates.length > 0 ? "tacticalElements" : "reservationOnly",
      tacticalElementIds,
      survivingElements: campaignAssets.length > 0
        ? campaignAssets.length
        : Math.max(0, candidates.length - lostElements),
      lostElements: campaignAssets.length > 0 ? 0 : lostElements,
      chargesUsed,
      resourcePayloadCommitted
    };
  });
}

function sumConsumedResources(state: SerializedBattleState, tacticalFaction: TurnFaction): Record<SupplyKey, number> {
  const consumed: Record<SupplyKey, number> = { ammo: 0, fuel: 0, rations: 0, parts: 0 };
  const ledger = state.supplyStates?.[tacticalFaction]?.ledger ?? [];
  ledger.forEach((entry) => {
    if (entry.delta < 0 && SUPPLY_KEYS.includes(entry.type)) consumed[entry.type] += Math.abs(entry.delta);
  });
  return consumed;
}

function extractResourceDeltas(pkg: CampaignBattlePackage, state: SerializedBattleState): Record<string, CampaignResourceDelta> {
  const tacticalFactionMap: ReadonlyArray<readonly [TurnFaction, CampaignFactionKey]> = [
    ["Player", "Player"],
    ["Bot", "Bot"]
  ];
  const result: Record<string, CampaignResourceDelta> = {};
  tacticalFactionMap.forEach(([tacticalFaction, campaignFaction]) => {
    const consumed = sumConsumedResources(state, tacticalFaction);
    const isAttacker = campaignFaction === pkg.context.attacker;
    result[String(campaignFaction)] = {
      faction: campaignFaction,
      ...consumed,
      battleRequisitionPointsSpent: tacticalFaction === "Player"
        ? Math.max(0, state.battleRequisitionPointsSpent ?? 0)
        : 0,
      reservedRequisitionPoints: isAttacker
        ? pkg.resourceCommitments.find((entry) => entry.poolKey === "requisitionPoints")?.reservedAmount ?? 0
        : 0,
      reservedAirSorties: isAttacker
        ? pkg.resourceCommitments.find((entry) => entry.poolKey === "airSorties")?.reservedAmount ?? 0
        : 0
    };
  });
  return result;
}

function extractInfrastructureDamage(
  state: SerializedBattleState,
  pkg: CampaignBattlePackage
): CampaignInfrastructureDamage[] {
  return (state.hexModifications ?? []).flatMap((entry) => {
    const maxIntegrity = Math.max(1, entry.maxIntegrity ?? 100);
    const integrityAfter = Math.max(0, Math.min(maxIntegrity, entry.integrity ?? maxIntegrity));
    const projectedBaseline = Math.round(
      maxIntegrity * Math.max(0, Math.min(1, pkg.context.infrastructureEffectiveness ?? 1))
    );
    const integrityBefore = Math.max(integrityAfter, projectedBaseline);
    if (integrityAfter >= maxIntegrity && (!entry.damageState || entry.damageState === "intact")) return [];
    return [{
      tacticalHexKey: `${entry.hex.q},${entry.hex.r}`,
      type: entry.type,
      integrityBefore,
      integrityAfter,
      maxIntegrity,
      damageState: entry.damageState ?? (integrityAfter <= 0 ? "destroyed" : "damaged")
    }];
  }).sort((left, right) => left.tacticalHexKey.localeCompare(right.tacticalHexKey) || left.type.localeCompare(right.type));
}

function evidenceId(pkg: CampaignBattlePackage, faction: CampaignFactionKey, kind: string, ...parts: unknown[]): string {
  return createStableCampaignRecordId("tactical-evidence", pkg.packageId, faction, kind, ...parts);
}

function extractEvidence(
  pkg: CampaignBattlePackage,
  state: SerializedBattleState,
  result: CampaignBattleResultOutcome,
  missionStatus: MissionStatus | null,
  formationDeltas: readonly CampaignFormationBattleDelta[]
): Record<string, TacticalEvidenceReport[]> {
  const factions = Array.from(new Set(pkg.formationCommitments.map((entry) => entry.faction)));
  const evidence: Record<string, TacticalEvidenceReport[]> = Object.fromEntries(
    factions.map((faction) => [String(faction), []])
  );
  factions.forEach((faction) => {
    evidence[String(faction)]!.push({
      evidenceId: evidenceId(pkg, faction, "outcome", result),
      kind: "battleOutcome",
      turn: state.turnNumber,
      summary: `Battle ended with ${result}.`,
      confidence: "high",
      tacticalHexKey: null,
      ownFormationId: null,
      observedUnitType: null,
      observedStrength: null
    });
  });
  formationDeltas.forEach((delta) => {
    evidence[String(delta.faction)]?.push({
      evidenceId: evidenceId(pkg, delta.faction, "formation", delta.campaignFormationId, delta.status),
      kind: "ownFormation",
      turn: state.turnNumber,
      summary: `${delta.status} at ${Math.round(delta.readinessAfter)} readiness.`,
      confidence: "high",
      tacticalHexKey: null,
      ownFormationId: delta.campaignFormationId,
      observedUnitType: null,
      observedStrength: delta.readinessAfter
    });
  });
  (missionStatus?.objectives ?? []).forEach((objective) => {
    factions.forEach((faction) => evidence[String(faction)]?.push({
      evidenceId: evidenceId(pkg, faction, "objective", objective.id, objective.state),
      kind: "objective",
      turn: state.turnNumber,
      summary: `${objective.label}: ${objective.state}.`,
      confidence: "high",
      tacticalHexKey: null,
      ownFormationId: null,
      observedUnitType: null,
      observedStrength: null
    }));
  });
  // Tactical enemy-contact state is the human commander's observation picture regardless of
  // which campaign faction owns the operational initiative.
  const observingFaction: CampaignFactionKey = "Player";
  (state.enemyContactStates ?? []).forEach((contact) => {
    evidence[String(observingFaction)]?.push({
      evidenceId: evidenceId(pkg, observingFaction, "contact", contact.unitId, contact.lastSeenTurn),
      kind: "enemyContact",
      turn: contact.lastSeenTurn,
      summary: `${contact.state} enemy contact from ${contact.source}.`,
      confidence: contact.state === "visible" ? "high" : contact.state === "identified" ? "medium" : "low",
      tacticalHexKey: `${contact.lastKnownHex.q},${contact.lastKnownHex.r}`,
      ownFormationId: null,
      observedUnitType: contact.knownUnitType ?? null,
      observedStrength: contact.lastKnownStrength ?? null
    });
  });
  return evidence;
}

function computeResultIntegrity(unsigned: Omit<CampaignBattleResultPackage, "integrityHash">): string {
  return `fsg-battle-result-v${unsigned.packageVersion}-${computeCampaignContentHash(unsigned)}`;
}

export function computeCampaignBattleResultIntegrity(pkg: CampaignBattleResultPackage): string {
  const { integrityHash: _integrityHash, ...unsigned } = structuredClone(pkg);
  return computeResultIntegrity(unsigned);
}

/** Extracts one deterministic result package from complete tactical state and the frozen commitment. */
export function extractCampaignBattleResultPackage(
  input: CampaignBattleResultExtractionInput
): CampaignBattleResultPackage {
  const pkg = assertCampaignBattlePackage(input.battlePackage);
  const state = structuredClone(input.tacticalState);
  if (state.completeStateVersion !== 1 || !Number.isInteger(state.turnNumber) || state.turnNumber < 1) {
    throw new Error("Campaign result extraction requires a complete tactical state at a valid turn.");
  }
  if (!Array.isArray(state.playerPlacements) || !Array.isArray(state.botPlacements)
    || !Array.isArray(state.reserves) || !Array.isArray(state.airborneReserves)
    || !Array.isArray(state.casualtyLog) || !Array.isArray(state.enemyContactStates)
    || !Array.isArray(state.hexModifications) || !state.supplyStates?.Player || !state.supplyStates.Bot) {
    throw new Error("Campaign result extraction requires every tactical survivor, casualty, supply, evidence, and damage collection.");
  }
  const locatedUnits = locateTacticalUnits(state);
  const formationDeltas = pkg.formationCommitments.map((commitment) => extractFormationDelta(
    pkg,
    commitment,
    assertCommittedUnit(pkg, commitment, locatedUnits.get(commitment.tacticalUnitId))
  ));
  const tacticalStateHash = computeCampaignContentHash(state);
  const resolutionId = createStableCampaignRecordId(
    "battle-resolution",
    pkg.packageId,
    tacticalStateHash,
    input.result,
    state.turnNumber
  );
  const objectiveResults = (input.missionStatus?.objectives ?? []).map((objective) => ({
    objectiveId: objective.id,
    label: objective.label,
    tier: objective.tier,
    state: objective.state,
    detail: objective.detail ?? null
  }));
  const unsigned: Omit<CampaignBattleResultPackage, "integrityHash"> = {
    packageVersion: CAMPAIGN_BATTLE_RESULT_PACKAGE_VERSION,
    battlePackageId: pkg.packageId,
    battlePackageIntegrityHash: pkg.integrityHash,
    campaignId: pkg.campaignId,
    scenarioKey: pkg.scenarioKey,
    engagementId: pkg.engagementId,
    campaignRevision: pkg.committedRevision,
    resolutionId,
    result: input.result,
    endedAtTacticalTurn: state.turnNumber,
    tacticalStateHash,
    objectiveResults,
    formationDeltas,
    supportDeltas: extractSupportDeltas(pkg, locatedUnits, state),
    resourcesConsumed: extractResourceDeltas(pkg, state),
    infrastructureDamage: extractInfrastructureDamage(state, pkg),
    observedEvidenceByFaction: extractEvidence(pkg, state, input.result, input.missionStatus, formationDeltas),
    honorsRecommended: []
  };
  return { ...unsigned, integrityHash: computeResultIntegrity(unsigned) };
}

/** Rejects modified, incomplete, duplicated, cross-engagement, or truth-leaking result packages. */
export function assertCampaignBattleResultPackage(
  result: CampaignBattleResultPackage,
  battlePackage: CampaignBattlePackage
): CampaignBattleResultPackage {
  const pkg = assertCampaignBattlePackage(battlePackage);
  if ((result.packageVersion !== CAMPAIGN_BATTLE_RESULT_PACKAGE_VERSION && result.packageVersion !== 1)
    || result.battlePackageId !== pkg.packageId
    || result.battlePackageIntegrityHash !== pkg.integrityHash
    || result.campaignId !== pkg.campaignId
    || result.scenarioKey !== pkg.scenarioKey
    || result.engagementId !== pkg.engagementId
    || result.campaignRevision !== pkg.committedRevision
    || !result.resolutionId?.trim()
    || !Number.isInteger(result.endedAtTacticalTurn) || result.endedAtTacticalTurn < 1
    || !/^fnv1a32-[0-9a-f]{8}$/.test(result.tacticalStateHash)
    || !Array.isArray(result.formationDeltas) || !Array.isArray(result.supportDeltas)
    || !Array.isArray(result.objectiveResults) || !Array.isArray(result.infrastructureDamage)
    || !result.resourcesConsumed || !result.observedEvidenceByFaction
    || !RESULT_OUTCOMES.has(result.result)) {
    throw new Error("Campaign battle result package is malformed or cross-bound.");
  }
  if (computeCampaignBattleResultIntegrity(result) !== result.integrityHash) {
    throw new Error("Campaign battle result package failed its integrity check.");
  }
  const commitmentById = new Map(pkg.formationCommitments.map((entry) => [entry.formationId, entry]));
  const deltaIds = result.formationDeltas.map((entry) => entry.campaignFormationId);
  if (deltaIds.length !== pkg.formationCommitments.length || new Set(deltaIds).size !== deltaIds.length
    || deltaIds.some((id) => !commitmentById.has(id))) {
    throw new Error("Campaign battle result does not reconcile every committed formation exactly once.");
  }
  result.formationDeltas.forEach((delta) => {
    const commitment = commitmentById.get(delta.campaignFormationId)!;
    if (delta.tacticalUnitId !== commitment.tacticalUnitId
      || delta.beforeStateHash !== commitment.beforeStateHash
      || delta.faction !== commitment.faction
      || delta.role !== commitment.role
      || delta.committedElementIds.length !== 1
      || delta.committedElementIds[0] !== commitment.tacticalUnitId
      || !FORMATION_RESULT_STATUSES.has(delta.status)
      || !TACTICAL_DISPOSITIONS.has(delta.tacticalDisposition)
      || ![delta.personnelBefore, delta.personnelAfter, delta.readinessBefore, delta.readinessAfter,
        delta.cohesionBefore, delta.cohesionAfter, delta.fatigueBefore, delta.fatigueAfter,
        delta.fatigueGained, delta.experienceGained].every(isNonNegativeFinite)
      || delta.personnelAfter > delta.personnelBefore
      || !Object.values(delta.equipmentBefore).every(isNonNegativeFinite)
      || !Object.values(delta.equipmentAfter).every(isNonNegativeFinite)
      || !Object.values(delta.supplyBefore).every(isNonNegativeFinite)
      || !Object.values(delta.supplyAfter).every(isNonNegativeFinite)) {
      throw new Error(`Formation delta ${delta.campaignFormationId} does not match its frozen commitment.`);
    }
  });
  result.supportDeltas.forEach((delta) => {
    if (!delta.allocationKey || !delta.category || !Number.isInteger(delta.committedQuantity)
      || delta.committedQuantity <= 0 || !isNonNegativeFinite(delta.reservedRp)
      || !Number.isInteger(delta.survivingElements) || !Number.isInteger(delta.lostElements)
      || delta.survivingElements < 0 || delta.lostElements < 0
      || delta.survivingElements + delta.lostElements > delta.committedQuantity
      || !isNonNegativeFinite(delta.chargesUsed)
      || !Object.values(delta.resourcePayloadCommitted).every(isNonNegativeFinite)) {
      throw new Error(`Support delta ${delta.allocationKey || "<missing>"} is malformed.`);
    }
  });
  if (pkg.packageVersion >= 3) {
    const expectedNaval = campaignPackageNavalSources(pkg);
    const navalDeltas: readonly CampaignSupportDelta[] = result.supportDeltas.filter((entry) => entry.allocationKey === CAMPAIGN_NAVAL_SUPPORT_ALLOCATION_KEY);
    if (navalDeltas.length !== (expectedNaval.length > 0 ? 1 : 0)) throw new Error("Naval result omits or duplicates the committed source receipt.");
    if (expectedNaval.length > 0) {
      const navalDelta = navalDeltas[0];
      const deltas = navalDelta.navalSourceDeltas;
      const assets = buildCampaignTacticalSupportAssets(pkg);
      if (!deltas || deltas.length !== expectedNaval.length || navalDelta.committedQuantity !== expectedNaval.length
        || new Set(deltas.map((entry) => entry.sourceId)).size !== deltas.length
        || deltas.some((delta, ordinal) => {
          const source = expectedNaval[ordinal];
          const assetId = campaignSupportAssetId(pkg, CAMPAIGN_NAVAL_SUPPORT_ALLOCATION_KEY, ordinal);
          const expected = assets.find((asset) => asset.id === assetId);
          return delta.sourceId !== source.sourceId || delta.sourceHexKey !== source.sourceHexKey || delta.label !== source.label
            || delta.tacticalAssetId !== assetId || !expected
            || !Number.isInteger(delta.chargesUsed) || delta.chargesUsed < 0
            || !Number.isInteger(delta.chargesRemaining) || delta.chargesRemaining < 0
            || delta.chargesUsed + delta.chargesRemaining !== expected.maxCharges;
        }) || navalDelta.chargesUsed !== deltas.reduce((sum, entry) => sum + entry.chargesUsed, 0)
        || navalDelta.trackingMode !== "supportAsset"
        || navalDelta.tacticalElementIds.length !== deltas.length
        || navalDelta.tacticalElementIds.some((id, index) => id !== deltas[index].tacticalAssetId)) {
        throw new Error("Naval result does not reconcile each reserved source and tactical charge exactly once.");
      }
    }
  }
  Object.entries(result.resourcesConsumed).forEach(([faction, delta]) => {
    if (String(delta.faction) !== faction
      || ![delta.ammo, delta.fuel, delta.rations, delta.parts, delta.battleRequisitionPointsSpent,
        delta.reservedRequisitionPoints, delta.reservedAirSorties].every(isNonNegativeFinite)) {
      throw new Error(`Resource delta ${faction} is malformed.`);
    }
  });
  result.infrastructureDamage.forEach((entry) => {
    const integrityBefore = entry.integrityBefore ?? entry.maxIntegrity;
    if (!entry.tacticalHexKey || !entry.type || !entry.damageState
      || ![integrityBefore, entry.integrityAfter, entry.maxIntegrity].every(isNonNegativeFinite)
      || entry.maxIntegrity <= 0 || integrityBefore > entry.maxIntegrity
      || entry.integrityAfter > integrityBefore) {
      throw new Error(`Infrastructure damage ${entry.tacticalHexKey || "<missing>"} is malformed.`);
    }
  });
  const factionByFormation = new Map(pkg.formationCommitments.map((entry) => [entry.formationId, String(entry.faction)]));
  Object.entries(result.observedEvidenceByFaction).forEach(([faction, reports]) => {
    reports.forEach((report) => {
      if (report.kind === "enemyContact" && report.ownFormationId !== null) {
        throw new Error("Enemy contact evidence cannot expose persistent formation identity.");
      }
      if (report.ownFormationId && factionByFormation.get(report.ownFormationId) !== faction) {
        throw new Error("Faction evidence contains another faction's persistent formation identity.");
      }
    });
  });
  return structuredClone(result);
}
