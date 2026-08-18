/** Builds and validates immutable, Player-safe campaign after-action reports. */

import type { CampaignFactionKey } from "../../../core/campaignTypes";
import { computeCampaignContentHash, createStableCampaignRecordId } from "../runtime/CampaignCanonical";
import type { CampaignRuntimeState, CampaignScenarioDefinition } from "../runtime/campaignRuntimeTypes";
import type { CampaignBattlePackage } from "../engagements/CampaignEngagementLedgerTypes";
import type { CampaignBattleResultPackage } from "../results/CampaignBattleResultTypes";
import type { CampaignBattleConsequenceReport, CampaignBattleEconomyCharge, CampaignBattleEconomySnapshot } from "../consequences/CampaignBattleConsequenceTypes";
import type { CampaignBattleControlReport } from "../control/CampaignBattleControlTypes";
import type { CampaignBattleInfrastructureReport } from "../infrastructure/CampaignBattleInfrastructureTypes";
import {
  CAMPAIGN_AFTER_ACTION_REPORT_VERSION,
  type CampaignAfterActionDecisionRequired,
  type CampaignAfterActionFormationResult,
  type CampaignAfterActionObjectiveChange,
  type CampaignAfterActionReport,
  type CampaignAfterActionReportPresentation,
  type CampaignAfterActionStrategicResult
} from "./CampaignAfterActionReportTypes";

const ZERO_ECONOMY: CampaignBattleEconomySnapshot = {
  manpower: 0,
  supplies: 0,
  fuel: 0,
  ammo: 0,
  airPower: 0,
  navalPower: 0
};

const ZERO_CHARGE: CampaignBattleEconomyCharge = {
  supplies: 0,
  fuel: 0,
  ammo: 0,
  airPower: 0,
  navalPower: 0
};

function strategicResultFor(
  tacticalResult: CampaignBattleResultPackage["result"],
  battlePackage: CampaignBattlePackage,
  viewerFaction: CampaignFactionKey
): CampaignAfterActionStrategicResult {
  if (tacticalResult === "stalemate") return "stalemate";
  if (tacticalResult === "withdrawal") return "withdrawal";
  const viewerAttacked = battlePackage.engagement.attacker === viewerFaction;
  const viewerWon = tacticalResult === "attackerVictory" ? viewerAttacked : !viewerAttacked;
  return viewerWon ? "victory" : "defeat";
}

function phaseLabel(runtime: CampaignRuntimeState, definition: CampaignScenarioDefinition): string {
  const key = runtime.campaignPhaseKey ?? "operation";
  return definition.campaignArc?.phases.find((phase) => phase.key === key)?.label ?? key;
}

function objectiveLabel(definition: CampaignScenarioDefinition, objectiveKey: string | null): string | null {
  return objectiveKey
    ? definition.objectives.find((objective) => objective.key === objectiveKey)?.label ?? objectiveKey
    : null;
}

function buildObjectiveChanges(
  before: CampaignRuntimeState,
  after: CampaignRuntimeState,
  definition: CampaignScenarioDefinition
): CampaignAfterActionObjectiveChange[] {
  return after.objectiveOrder.flatMap((key) => {
    const previous = before.objectives[key];
    const current = after.objectives[key];
    if (!previous || !current) return [];
    const previousScore = previous.scoreAwarded ?? 0;
    const currentScore = current.scoreAwarded ?? 0;
    if (previous.status === current.status
      && previous.progress === current.progress
      && previousScore === currentScore) return [];
    const authored = definition.objectives.find((objective) => objective.key === key);
    return [{
      objectiveKey: key,
      label: authored?.label ?? key,
      statusBefore: previous.status,
      statusAfter: current.status,
      progressBefore: previous.progress,
      progressAfter: current.progress,
      scoreAwarded: Math.max(0, currentScore - previousScore),
      explanation: current.progressLabel ?? `${Math.round(current.progress * 100)}% complete`
    }];
  });
}

function sumCharge(charge: CampaignBattleEconomyCharge): number {
  return charge.supplies + charge.fuel + charge.ammo + charge.airPower + charge.navalPower;
}

function buildDecisions(
  reportId: string,
  viewerFaction: CampaignFactionKey,
  after: CampaignRuntimeState,
  control: CampaignBattleControlReport,
  infrastructure: CampaignBattleInfrastructureReport,
  friendlyFormations: readonly CampaignAfterActionFormationResult[],
  objectiveChanges: readonly CampaignAfterActionObjectiveChange[],
  shortfall: CampaignBattleEconomyCharge
): CampaignAfterActionDecisionRequired[] {
  const decisions: CampaignAfterActionDecisionRequired[] = [];
  const add = (
    key: string,
    severity: CampaignAfterActionDecisionRequired["severity"],
    targetKind: CampaignAfterActionDecisionRequired["targetKind"],
    targetId: string | null,
    title: string,
    detail: string
  ): void => {
    decisions.push({
      id: createStableCampaignRecordId("aar-decision", reportId, key, targetId),
      severity,
      targetKind,
      targetId,
      title,
      detail
    });
  };

  if (after.campaignOutcome && !after.campaignOutcome.sandboxContinued) {
    add(
      "campaign-outcome",
      "critical",
      "campaign",
      null,
      after.campaignOutcome.result === "victory" ? "Review the campaign victory" : "Review the campaign defeat",
      after.campaignOutcome.summary
    );
  }
  if (sumCharge(shortfall) > 0) {
    add(
      "logistics-shortfall",
      "critical",
      "logistics",
      null,
      "Resolve the battle shortfall",
      "The battle consumed more immediately available stock than the theater could supply. Review logistics before the next operation."
    );
  }
  friendlyFormations
    .filter((formation) => formation.statusAfter === "shattered")
    .forEach((formation) => add(
      `shattered:${formation.formationId}`,
      "critical",
      "formation",
      formation.formationId,
      `Recover ${formation.name}`,
      "This formation is shattered and cannot be treated as a ready combat formation."
    ));
  if (infrastructure.controllerAfter === viewerFaction
    && infrastructure.infrastructureAfter
    && infrastructure.capacityAfter.effectiveness < 1) {
    add(
      "repair-infrastructure",
      infrastructure.capacityAfter.effectiveness < 0.5 ? "critical" : "attention",
      "infrastructure",
      infrastructure.battleHexKey,
      "Repair the battle area",
      `The installation is operating at ${Math.round(infrastructure.capacityAfter.effectiveness * 100)}% effectiveness.`
    );
  }
  if (control.occupationOutcome === "failedNoEligibleOccupier" || control.occupationOutcome === "failedEnemyPresence") {
    add(
      "occupation-failed",
      "critical",
      "engagement",
      control.engagementId,
      "The objective was not secured",
      control.occupationOutcome === "failedEnemyPresence"
        ? "Uncommitted enemy forces still prevent control of the battle area."
        : "No surviving eligible formation could occupy the battle area."
    );
  }
  const changedObjective = objectiveChanges.find((change) => change.statusAfter === "completed" || change.statusAfter === "failed")
    ?? objectiveChanges[0];
  if (changedObjective) {
    add(
      `objective:${changedObjective.objectiveKey}`,
      changedObjective.statusAfter === "failed" ? "critical" : "attention",
      "objective",
      changedObjective.objectiveKey,
      "Review campaign objectives",
      `${changedObjective.label} is now ${changedObjective.statusAfter}. ${changedObjective.explanation}`
    );
  }
  return decisions;
}

function buildSummary(
  strategicResult: CampaignAfterActionStrategicResult,
  control: CampaignBattleControlReport,
  viewerFaction: CampaignFactionKey,
  personnelLost: number,
  objectiveName: string | null
): string {
  const resultText = strategicResult === "victory"
    ? "The engagement ended in victory."
    : strategicResult === "defeat"
      ? "The engagement ended in defeat."
      : strategicResult === "withdrawal"
        ? "The engagement ended in a withdrawal."
        : "The engagement ended in a stalemate.";
  const controlText = control.controllerAfter === viewerFaction
    ? control.controlChanged ? "The battle area is now under friendly control." : "Friendly control of the battle area was retained."
    : control.controlChanged ? "Control of the battle area was lost." : "The battle area remains outside friendly control.";
  return `${resultText} ${controlText} ${personnelLost.toLocaleString()} personnel were lost${objectiveName ? ` while contesting ${objectiveName}` : ""}.`;
}

/** Creates one immutable report after all campaign consequence services and objectives have committed to the draft. */
export function buildCampaignAfterActionReport(
  before: CampaignRuntimeState,
  after: CampaignRuntimeState,
  definition: CampaignScenarioDefinition,
  battlePackage: CampaignBattlePackage,
  result: CampaignBattleResultPackage,
  consequence: CampaignBattleConsequenceReport,
  control: CampaignBattleControlReport,
  infrastructure: CampaignBattleInfrastructureReport,
  viewerFaction: CampaignFactionKey = "Player"
): CampaignAfterActionReport {
  const reportId = createStableCampaignRecordId("campaign-aar", after.campaignId, result.engagementId, result.resolutionId);
  const dispositionByFormation = new Map(control.formationDispositions.map((entry) => [entry.campaignFormationId, entry]));
  const friendlyFormations: CampaignAfterActionFormationResult[] = consequence.formationConsequences
    .filter((entry) => entry.faction === viewerFaction)
    .map((entry) => {
      const disposition = dispositionByFormation.get(entry.campaignFormationId);
      const formation = before.formations[entry.campaignFormationId] ?? after.formations[entry.campaignFormationId];
      return {
        formationId: entry.campaignFormationId,
        name: formation?.name ?? entry.campaignFormationId,
        role: entry.role,
        sourceHexKey: entry.sourceHexKey,
        destinationHexKey: disposition?.destinationHexKey ?? after.formations[entry.campaignFormationId]?.locationHexKey ?? null,
        personnelBefore: entry.personnelBefore,
        personnelAfter: entry.personnelAfter,
        personnelLost: entry.personnelLost,
        equipmentLost: structuredClone(entry.equipmentLost),
        readinessBefore: entry.readinessBefore,
        readinessAfter: disposition?.readinessAfter ?? entry.readinessAfter,
        cohesionBefore: entry.cohesionBefore,
        cohesionAfter: disposition?.cohesionAfter ?? entry.cohesionAfter,
        fatigueBefore: entry.fatigueBefore,
        fatigueAfter: disposition?.fatigueAfter ?? entry.fatigueAfter,
        experienceGained: Math.max(0, entry.experienceAfter.earned - entry.experienceBefore.earned),
        statusAfter: after.formations[entry.campaignFormationId]?.status ?? entry.statusAfter,
        disposition: disposition?.disposition ?? "terminallyRemoved",
        dispositionExplanation: disposition?.explanation ?? "The formation was removed from operational placement after the battle."
      };
    });
  const enemyDeltas = result.formationDeltas.filter((entry) => entry.faction !== viewerFaction);
  const economy = consequence.economyConsequences[viewerFaction];
  const objectiveName = objectiveLabel(definition, battlePackage.engagement.objectiveKey);
  const strategicResult = strategicResultFor(result.result, battlePackage, viewerFaction);
  const objectiveChanges = buildObjectiveChanges(before, after, definition);
  const decisionsRequired = buildDecisions(
    reportId,
    viewerFaction,
    after,
    control,
    infrastructure,
    friendlyFormations,
    objectiveChanges,
    economy?.shortfall ?? ZERO_CHARGE
  );
  const personnelLost = friendlyFormations.reduce((total, entry) => total + entry.personnelLost, 0);
  const unsigned: Omit<CampaignAfterActionReport, "integrityHash"> = {
    reportVersion: CAMPAIGN_AFTER_ACTION_REPORT_VERSION,
    reportId,
    campaignId: after.campaignId,
    scenarioKey: after.scenarioKey,
    engagementId: result.engagementId,
    resolutionId: result.resolutionId,
    viewerFaction,
    sourceRevision: before.revision,
    appliedRevision: before.revision + 1,
    segment: after.currentSegment,
    battleResultIntegrityHash: result.integrityHash,
    consequenceIntegrityHash: consequence.integrityHash,
    controlIntegrityHash: control.integrityHash,
    infrastructureIntegrityHash: infrastructure.integrityHash,
    tacticalResult: result.result,
    strategicResult,
    title: objectiveName ? `After action: ${objectiveName}` : `After action: ${control.battleHexKey}`,
    summary: buildSummary(strategicResult, control, viewerFaction, personnelLost, objectiveName),
    battleHexKey: control.battleHexKey,
    objectiveKey: battlePackage.engagement.objectiveKey,
    objectiveLabel: objectiveName,
    controllerBefore: control.controllerBefore,
    controllerAfter: control.controllerAfter,
    controlChanged: control.controlChanged,
    occupationOutcome: control.occupationOutcome,
    frontsBefore: control.frontsBefore.length,
    frontsAfter: control.frontsAfter.length,
    friendlyFormations,
    opponent: {
      formationsEngaged: enemyDeltas.length,
      personnelLosses: enemyDeltas.reduce((total, entry) => total + Math.max(0, entry.personnelBefore - entry.personnelAfter), 0),
      formationsDestroyed: enemyDeltas.filter((entry) => entry.status === "destroyed").length,
      formationsCaptured: enemyDeltas.filter((entry) => entry.status === "captured").length,
      formationsWithdrew: enemyDeltas.filter((entry) => entry.status === "withdrew").length
    },
    economyBefore: structuredClone(economy?.before ?? ZERO_ECONOMY),
    economyAfter: structuredClone(economy?.after ?? ZERO_ECONOMY),
    economyCharged: structuredClone(economy?.charged ?? ZERO_CHARGE),
    economyShortfall: structuredClone(economy?.shortfall ?? ZERO_CHARGE),
    tacticalObjectives: structuredClone(result.objectiveResults),
    campaignPhaseBefore: phaseLabel(before, definition),
    campaignPhaseAfter: phaseLabel(after, definition),
    campaignScoreBefore: before.campaignScore?.earned ?? 0,
    campaignScoreAfter: after.campaignScore?.earned ?? 0,
    campaignObjectiveChanges: objectiveChanges,
    infrastructureRole: infrastructure.role,
    infrastructureIntegrityBefore: infrastructure.infrastructureBefore?.integrity ?? null,
    infrastructureIntegrityAfter: infrastructure.infrastructureAfter?.integrity ?? null,
    infrastructureEffectivenessBefore: infrastructure.capacityBefore.effectiveness,
    infrastructureEffectivenessAfter: infrastructure.capacityAfter.effectiveness,
    decisionsRequired
  };
  return { ...unsigned, integrityHash: computeCampaignContentHash(unsigned) };
}

/** Rejects tampered, cross-engagement, or internally inconsistent AAR records. */
export function assertCampaignAfterActionReport(
  report: CampaignAfterActionReport,
  result?: CampaignBattleResultPackage,
  consequence?: CampaignBattleConsequenceReport,
  control?: CampaignBattleControlReport,
  infrastructure?: CampaignBattleInfrastructureReport
): CampaignAfterActionReport {
  // Presentation selectors add mutable acknowledgement outside the integrity-bound report. Accept
  // that projection field without treating it as a modification of immutable AAR content.
  const {
    integrityHash,
    acknowledged: _presentationAcknowledgement,
    ...unsigned
  } = report as CampaignAfterActionReport & { acknowledged?: boolean };
  if (report.reportVersion !== CAMPAIGN_AFTER_ACTION_REPORT_VERSION
    || !report.reportId.trim()
    || !report.campaignId.trim()
    || !report.engagementId.trim()
    || !report.resolutionId.trim()
    || report.sourceRevision < 0
    || report.appliedRevision !== report.sourceRevision + 1
    || report.segment < 0
    || computeCampaignContentHash(unsigned) !== integrityHash
    || new Set(report.decisionsRequired.map((entry) => entry.id)).size !== report.decisionsRequired.length
    || report.friendlyFormations.some((entry) => entry.personnelBefore < entry.personnelAfter || entry.personnelLost !== entry.personnelBefore - entry.personnelAfter)
    || report.campaignObjectiveChanges.some((entry) => entry.progressBefore < 0 || entry.progressBefore > 1 || entry.progressAfter < 0 || entry.progressAfter > 1)) {
    throw new Error("Campaign after-action report failed integrity or structural validation.");
  }
  if (result && (report.engagementId !== result.engagementId
    || report.resolutionId !== result.resolutionId
    || report.battleResultIntegrityHash !== result.integrityHash
    || report.tacticalResult !== result.result)) {
    throw new Error("Campaign after-action report does not match its tactical result.");
  }
  if (consequence && report.consequenceIntegrityHash !== consequence.integrityHash) {
    throw new Error("Campaign after-action report does not match its consequence audit.");
  }
  if (control && (report.controlIntegrityHash !== control.integrityHash || report.battleHexKey !== control.battleHexKey)) {
    throw new Error("Campaign after-action report does not match its control audit.");
  }
  if (infrastructure && report.infrastructureIntegrityHash !== infrastructure.integrityHash) {
    throw new Error("Campaign after-action report does not match its infrastructure audit.");
  }
  return structuredClone(report);
}

/** Projects reports newest-first and adds acknowledgement without mutating integrity-bound history. */
export function projectCampaignAfterActionReports(runtime: CampaignRuntimeState): CampaignAfterActionReportPresentation[] {
  const acknowledged = new Set(runtime.acknowledgedAfterActionReportIds ?? []);
  return runtime.engagementLedgerOrder
    .slice()
    .reverse()
    .flatMap((engagementId) => {
      const report = runtime.engagementLedger[engagementId]?.afterActionReport;
      return report ? [{ ...structuredClone(report), acknowledged: acknowledged.has(report.reportId) }] : [];
    });
}
