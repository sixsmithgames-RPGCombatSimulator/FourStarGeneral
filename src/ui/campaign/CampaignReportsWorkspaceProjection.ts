import type { CampaignLocationPresentation } from "./CampaignLocationPresentation";
import type {
  CampaignAfterActionFormationResult,
  CampaignAfterActionReportPresentation
} from "../../game/campaign/aar/CampaignAfterActionReportTypes";
import type { CampaignBattleInfrastructureReport } from "../../game/campaign/infrastructure/CampaignBattleInfrastructureTypes";
import type { CampaignFormationRecord } from "../../game/campaign/formations/campaignFormationTypes";
import { resolveCampaignFormationRecordPresentation } from "../../game/campaign/formations/CampaignFormationPresentation";
import type {
  CampaignCommandAfterActionFormationView,
  CampaignCommandAfterActionReportView
} from "./CampaignCommandShell";
import {
  projectCampaignAfterActionDecisionTargetId,
  projectCampaignAfterActionInfrastructureEffect,
  projectCampaignAfterActionTitle,
  shouldPresentCampaignAfterActionDecision
} from "./CampaignCommandProjection";

/** Player-visible map identity resolved by CampaignScreen for one immutable battle report. */
export interface CampaignReportLocationProjection {
  readonly locationHexKey: string;
  readonly presentation: CampaignLocationPresentation;
}

/** Explicit state and formatting seams required to build the Reports workspace view. */
export interface CampaignReportsWorkspaceProjectionInput {
  readonly reports: readonly CampaignAfterActionReportPresentation[];
  readonly postBattleAutosaveStatus: { readonly reportId: string; readonly message: string } | null;
  readonly resolveInfrastructureReport: (engagementId: string) => CampaignBattleInfrastructureReport | null;
  readonly resolveLocation: (report: CampaignAfterActionReportPresentation) => CampaignReportLocationProjection;
  readonly resolveFormation: (formationId: string) => CampaignFormationRecord | null;
  readonly formatLabel: (value: string) => string;
  readonly formatSegment: (segment: number) => string;
}

function formatEquipmentLabel(storageKey: string): string {
  const words = storageKey
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words || "equipment";
}

/** Projects every reported non-loss condition change into concise, player-facing AAR evidence. */
export function projectCampaignAfterActionFormationEffects(formation: {
  readonly equipmentLost: Readonly<Record<string, number>>;
  readonly fatigueBefore: number;
  readonly fatigueAfter: number;
  readonly experienceGained: number;
  readonly statusAfter: string;
}): string[] {
  const effects = Object.entries(formation.equipmentLost)
    .filter(([, lost]) => lost > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, lost]) => `${lost.toLocaleString()} ${formatEquipmentLabel(key)} lost`);
  if (formation.fatigueBefore !== formation.fatigueAfter) {
    effects.push(`Fatigue ${Math.round(formation.fatigueBefore)} → ${Math.round(formation.fatigueAfter)}`);
  }
  if (formation.experienceGained > 0) {
    effects.push(`+${formation.experienceGained.toLocaleString()} experience`);
  }
  if (formation.statusAfter !== "ready") {
    effects.push(`Status: ${formation.statusAfter.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}`);
  }
  return effects;
}

function projectFormation(
  formation: CampaignAfterActionFormationResult,
  current: CampaignFormationRecord | null
): CampaignCommandAfterActionFormationView {
  const presentation = current ? resolveCampaignFormationRecordPresentation(current) : null;
  const materiallyChanged = formation.personnelLost > 0
    || Object.values(formation.equipmentLost).some((loss) => loss > 0)
    || formation.readinessBefore !== formation.readinessAfter
    || formation.cohesionBefore !== formation.cohesionAfter
    || formation.fatigueBefore !== formation.fatigueAfter
    || formation.experienceGained > 0
    || formation.statusAfter !== "ready"
    || formation.disposition !== "held";
  return {
    id: formation.formationId,
    name: presentation?.formationName ?? formation.name,
    commandLabel: presentation?.commandLabel ?? formation.name,
    personnel: `${formation.personnelAfter.toLocaleString()} / ${formation.personnelBefore.toLocaleString()} personnel · −${formation.personnelLost.toLocaleString()}`,
    condition: `Readiness ${Math.round(formation.readinessBefore)} → ${Math.round(formation.readinessAfter)} · Cohesion ${Math.round(formation.cohesionBefore)} → ${Math.round(formation.cohesionAfter)}`,
    effects: projectCampaignAfterActionFormationEffects(formation),
    disposition: `${formation.disposition.replace(/([a-z])([A-Z])/g, "$1 $2")} · ${formation.dispositionExplanation}`,
    materiallyChanged
  };
}

function projectReport(
  report: CampaignAfterActionReportPresentation,
  input: CampaignReportsWorkspaceProjectionInput
): CampaignCommandAfterActionReportView {
  const infrastructureAudit = input.resolveInfrastructureReport(report.engagementId);
  const infrastructureAfter = infrastructureAudit?.infrastructureAfter ?? null;
  const location = input.resolveLocation(report);
  const charged = [
    [report.economyCharged.supplies, "supply"],
    [report.economyCharged.fuel, "fuel"],
    [report.economyCharged.ammo, "ammo"],
    [report.economyCharged.airPower, "air power"],
    [report.economyCharged.navalPower, "naval power"]
  ] as const;
  const resourcesSpent = charged
    .filter(([value]) => value > 0)
    .map(([value, label]) => `${value.toLocaleString()} ${label}`)
    .join(" · ") || "None";
  const resultLabel = report.strategicResult === "victory"
    ? "Victory"
    : report.strategicResult === "defeat"
      ? "Defeat"
      : report.strategicResult === "withdrawal"
        ? "Withdrawal"
        : "Stalemate";
  const projectedInfrastructureEffect = projectCampaignAfterActionInfrastructureEffect({
    roleLabel: input.formatLabel(report.infrastructureRole ?? "Installation"),
    integrityBefore: report.infrastructureIntegrityBefore,
    infrastructureAfter,
    effectivenessAfter: report.infrastructureEffectivenessAfter,
    disruptionTimeLabel: infrastructureAfter?.captureDisruptionUntilSegment == null
      ? null
      : input.formatSegment(infrastructureAfter.captureDisruptionUntilSegment)
  });
  const infrastructureEffect = projectedInfrastructureEffect
    ?? (report.infrastructureIntegrityBefore !== null || report.infrastructureIntegrityAfter !== null
      ? `${input.formatLabel(report.infrastructureRole ?? "Installation")}: ${report.infrastructureIntegrityBefore ?? 0} → ${report.infrastructureIntegrityAfter ?? 0} integrity · ${Math.round(report.infrastructureEffectivenessAfter * 100)}% operational capacity`
      : null);
  const operationalEffects = [
    `Control: ${report.controllerBefore} → ${report.controllerAfter}`,
    `Fronts: ${report.frontsBefore} → ${report.frontsAfter}`,
    infrastructureEffect,
    report.campaignPhaseBefore !== report.campaignPhaseAfter
      ? `Campaign phase: ${report.campaignPhaseBefore} → ${report.campaignPhaseAfter}`
      : null,
    ...(report.navalSupport ?? []).map((source) => `${source.label}: ${source.chargesUsed} fire mission${source.chargesUsed === 1 ? "" : "s"} fired · ${source.chargesRemaining} tactical charge${source.chargesRemaining === 1 ? "" : "s"} unused · ${source.status === "expended" ? `replenishes ${input.formatSegment(source.nextAvailableSegment)}` : "unused support restored"}`)
  ].filter((entry): entry is string => entry !== null);
  return {
    id: report.reportId,
    title: projectCampaignAfterActionTitle(report.title, report.objectiveLabel, report.battleHexKey, location.presentation),
    timeLabel: input.formatSegment(report.segment),
    result: report.strategicResult,
    resultLabel,
    acknowledged: report.acknowledged,
    summary: report.summary,
    location: location.presentation.primaryLabel,
    locationPresentation: location.presentation,
    locationHexKey: location.locationHexKey,
    checkpointStatus: input.postBattleAutosaveStatus?.reportId === report.reportId
      ? input.postBattleAutosaveStatus.message
      : null,
    personnelLosses: report.friendlyFormations.reduce((total, formation) => total + formation.personnelLost, 0).toLocaleString(),
    opponentLosses: report.opponent.personnelLosses.toLocaleString(),
    resourcesSpent,
    scoreChange: report.campaignScoreAfter === report.campaignScoreBefore
      ? `${report.campaignScoreAfter} · no change`
      : `${report.campaignScoreBefore} → ${report.campaignScoreAfter}`,
    operationalEffects,
    tacticalObjectives: report.tacticalObjectives.map((objective) => (
      `${objective.label}: ${String(objective.state).replace(/([a-z])([A-Z])/g, "$1 $2")}`
    )),
    formations: report.friendlyFormations.map((formation) => projectFormation(
      formation,
      input.resolveFormation(formation.formationId)
    )),
    objectiveChanges: report.campaignObjectiveChanges.map((objective) => (
      `${objective.label}: ${objective.statusBefore} → ${objective.statusAfter} · ${Math.round(objective.progressAfter * 100)}%${objective.scoreAwarded > 0 ? ` · +${objective.scoreAwarded} points` : ""}`
    )),
    decisions: report.decisionsRequired
      .filter((decision) => shouldPresentCampaignAfterActionDecision(decision.targetKind, decision.title, infrastructureAfter))
      .map((decision) => ({
        id: decision.id,
        severity: decision.severity,
        targetKind: decision.targetKind,
        targetId: projectCampaignAfterActionDecisionTargetId(decision.targetKind, decision.targetId),
        title: decision.title,
        detail: decision.detail
      }))
  };
}

/** Builds the complete Player-safe Reports workspace projection without reading CampaignState or touching the DOM. */
export function projectCampaignReportsWorkspace(
  input: CampaignReportsWorkspaceProjectionInput
): CampaignCommandAfterActionReportView[] {
  return input.reports.map((report) => projectReport(report, input));
}
