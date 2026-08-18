/**
 * MODULE: CampaignBattleInfrastructureResolver
 * WHAT: Maps tactical structural damage onto the battle tile, resolves capture disruption, and audits capacity loss.
 * WHY: Facilities must remain damaged, change owner, and affect later campaign and tactical decisions.
 */

import type {
  CampaignInfrastructureState,
  CampaignTileDefinition
} from "../../../core/campaignTypes";
import type {
  CampaignDomainEventDraft,
  CampaignRuntimeState,
  CampaignScenarioDefinition
} from "../runtime/campaignRuntimeTypes";
import { computeCampaignContentHash } from "../runtime/CampaignCanonical";
import type { CampaignBattleResultPackage } from "../results/CampaignBattleResultTypes";
import type { CampaignBattleConsequenceReport } from "../consequences/CampaignBattleConsequenceTypes";
import type { CampaignBattleControlReport } from "../control/CampaignBattleControlTypes";
import { assertCampaignBattleConsequenceReport } from "../consequences/CampaignBattleConsequenceResolver";
import { assertCampaignBattleControlReport } from "../control/CampaignBattleControlResolver";
import {
  CAMPAIGN_INFRASTRUCTURE_CAPTURE_DISRUPTION_SEGMENTS,
  refreshCampaignInfrastructureState
} from "./CampaignInfrastructureRules";
import {
  CAMPAIGN_BATTLE_INFRASTRUCTURE_REPORT_VERSION,
  type CampaignBattleInfrastructureReport,
  type CampaignInfrastructureCapacitySnapshot,
  type CampaignInfrastructureDamageAssessment
} from "./CampaignBattleInfrastructureTypes";

export interface CampaignBattleInfrastructureApplication {
  readonly duplicate: boolean;
  readonly report: CampaignBattleInfrastructureReport;
  readonly events: readonly CampaignDomainEventDraft[];
}

function emptyCapacity(): CampaignInfrastructureCapacitySnapshot {
  return {
    effectiveness: 1,
    supplyThroughput: 0,
    airSortieCapacity: 0,
    navalCapacity: 0,
    intelligenceCapacity: 0,
    fortificationStrength: 0
  };
}

function capacitySnapshot(
  definition: CampaignTileDefinition,
  infrastructure: CampaignInfrastructureState | null
): CampaignInfrastructureCapacitySnapshot {
  if (!infrastructure) return emptyCapacity();
  const factor = infrastructure.effectiveness;
  return {
    effectiveness: factor,
    supplyThroughput: (definition.supplyValue ?? 0) * factor,
    airSortieCapacity: (definition.airSortieCapacity ?? 0) * factor,
    navalCapacity: (definition.navalCapacity ?? 0) * factor,
    intelligenceCapacity: definition.role === "intelNode" || definition.role === "airbase"
      || definition.role === "navalBase" || definition.role === "logisticsHub" ? 2 * factor : 0,
    fortificationStrength: definition.role === "fortificationHeavy" || definition.role === "fortificationLight"
      ? factor : 0
  };
}

function infrastructureIntegrity(unsigned: Omit<CampaignBattleInfrastructureReport, "integrityHash">): string {
  return `fsg-battle-infrastructure-v1-${computeCampaignContentHash(unsigned)}`;
}

export function computeCampaignBattleInfrastructureIntegrity(report: CampaignBattleInfrastructureReport): string {
  const { integrityHash: _stored, ...unsigned } = structuredClone(report);
  return infrastructureIntegrity(unsigned);
}

function validState(state: CampaignInfrastructureState | null): boolean {
  if (!state) return true;
  return Number.isInteger(state.maxIntegrity) && state.maxIntegrity > 0
    && Number.isInteger(state.integrity) && state.integrity >= 0 && state.integrity <= state.maxIntegrity
    && Number.isFinite(state.effectiveness) && state.effectiveness >= 0 && state.effectiveness <= 1
    && state.disabled === (state.integrity === 0);
}

/** Rejects modified, cross-bound, or non-conserving infrastructure battle audits. */
export function assertCampaignBattleInfrastructureReport(
  report: CampaignBattleInfrastructureReport,
  result: CampaignBattleResultPackage,
  consequence: CampaignBattleConsequenceReport,
  control: CampaignBattleControlReport
): CampaignBattleInfrastructureReport {
  if (report.infrastructureVersion !== CAMPAIGN_BATTLE_INFRASTRUCTURE_REPORT_VERSION
    || report.campaignId !== result.campaignId
    || report.scenarioKey !== result.scenarioKey
    || report.engagementId !== result.engagementId
    || report.resolutionId !== result.resolutionId
    || report.battleResultIntegrityHash !== result.integrityHash
    || report.consequenceIntegrityHash !== consequence.integrityHash
    || report.controlIntegrityHash !== control.integrityHash
    || report.sourceRevision !== consequence.sourceRevision
    || report.sourceRevision !== control.sourceRevision
    || report.appliedRevision !== report.sourceRevision + 1
    || report.appliedSegment !== control.appliedSegment
    || report.battleHexKey !== control.battleHexKey
    || report.controllerBefore !== control.controllerBefore
    || report.controllerAfter !== control.controllerAfter
    || report.captureApplied !== (Boolean(report.infrastructureAfter) && control.controlChanged)
    || !validState(report.infrastructureBefore)
    || !validState(report.infrastructureAfter)
    || computeCampaignBattleInfrastructureIntegrity(report) !== report.integrityHash) {
    throw new Error("Campaign battle infrastructure report is malformed, modified, or cross-bound.");
  }
  const tacticalKeys = result.infrastructureDamage.map((entry) => `${entry.tacticalHexKey}|${entry.type}`);
  const assessmentKeys = report.damageAssessments.map((entry) => `${entry.tacticalHexKey}|${entry.type}`);
  if (assessmentKeys.length !== tacticalKeys.length
    || new Set(assessmentKeys).size !== assessmentKeys.length
    || tacticalKeys.some((key) => !assessmentKeys.includes(key))) {
    throw new Error("Campaign infrastructure audit does not assess every tactical damage fact exactly once.");
  }
  report.damageAssessments.forEach((entry) => {
    if (!Number.isFinite(entry.integrityBefore) || !Number.isFinite(entry.integrityAfter)
      || !Number.isFinite(entry.maxIntegrity) || entry.maxIntegrity <= 0
      || entry.integrityBefore < entry.integrityAfter || entry.integrityAfter < 0
      || entry.integrityBefore > entry.maxIntegrity || entry.integrityAfter > entry.maxIntegrity
      || !Number.isInteger(entry.integrityLost) || entry.integrityLost < 0
      || (entry.outcome === "applied" && (!entry.mappedCampaignHexKey || entry.integrityLost <= 0))
      || (entry.outcome !== "applied" && entry.integrityLost !== 0)
      || (entry.outcome === "noCampaignInfrastructure" && entry.mappedCampaignHexKey !== null)) {
      throw new Error(`Infrastructure damage assessment ${entry.tacticalHexKey} is malformed.`);
    }
  });
  const appliedLoss = report.damageAssessments.reduce((sum, entry) => sum + entry.integrityLost, 0);
  if (report.infrastructureBefore && report.infrastructureAfter
    && report.infrastructureAfter.integrity !== Math.max(0, report.infrastructureBefore.integrity - appliedLoss)) {
    throw new Error("Campaign infrastructure integrity does not conserve applied tactical damage.");
  }
  return structuredClone(report);
}

function mapDamage(
  battleHexKey: string,
  infrastructure: CampaignInfrastructureState | null,
  result: CampaignBattleResultPackage
): { assessments: CampaignInfrastructureDamageAssessment[]; integrityAfter: number | null } {
  let remaining = infrastructure?.integrity ?? null;
  const assessments = result.infrastructureDamage.map((entry) => {
    const integrityBefore = entry.integrityBefore ?? entry.maxIntegrity;
    if (!infrastructure || remaining === null) return {
      ...structuredClone(entry),
      integrityBefore,
      integrityLost: 0,
      mappedCampaignHexKey: null,
      outcome: "noCampaignInfrastructure" as const
    };
    const campaignEquivalent = Math.round(
      infrastructure.maxIntegrity * (entry.integrityAfter / Math.max(1, entry.maxIntegrity))
    );
    const next = Math.max(0, Math.min(remaining, campaignEquivalent));
    const integrityLost = remaining - next;
    remaining = next;
    return {
      ...structuredClone(entry),
      integrityBefore,
      integrityLost,
      mappedCampaignHexKey: battleHexKey,
      outcome: integrityLost > 0 ? "applied" as const : "noNewDamage" as const
    };
  });
  return { assessments, integrityAfter: remaining };
}

/** Applies C20-025 immediately after C20-024 inside the same public result transaction. */
export function applyCampaignBattleInfrastructure(
  runtime: CampaignRuntimeState,
  definition: CampaignScenarioDefinition,
  result: CampaignBattleResultPackage,
  consequence: CampaignBattleConsequenceReport,
  control: CampaignBattleControlReport
): CampaignBattleInfrastructureApplication {
  const ledger = runtime.engagementLedger[result.engagementId];
  if (!ledger?.package || !ledger.resultPackage || !ledger.consequenceReport || !ledger.controlReport) {
    throw new Error("Infrastructure resolution requires frozen result, consequence, and control records.");
  }
  assertCampaignBattleConsequenceReport(consequence, result);
  assertCampaignBattleControlReport(control, result, consequence);
  if (ledger.infrastructureReport) return {
    duplicate: true,
    report: assertCampaignBattleInfrastructureReport(ledger.infrastructureReport, result, consequence, control),
    events: []
  };
  const tile = runtime.tiles[control.battleHexKey];
  const tileDefinition = tile ? definition.map.tilePalette[tile.tileKey] : null;
  if (!tile || !tileDefinition) throw new Error("Battle infrastructure tile or authored definition is unavailable.");
  const infrastructureBefore = tile.infrastructure ? structuredClone(tile.infrastructure) : null;
  const capacityBefore = capacitySnapshot(tileDefinition as CampaignTileDefinition, infrastructureBefore);
  const mapped = mapDamage(control.battleHexKey, tile.infrastructure ?? null, result);
  if (tile.infrastructure && mapped.integrityAfter !== null) {
    tile.infrastructure.integrity = mapped.integrityAfter;
    if (mapped.assessments.some((entry) => entry.integrityLost > 0)) {
      tile.infrastructure.lastDamageSegment = runtime.currentSegment;
    }
  }
  let blockedRepairOrderId: string | null = null;
  if (tile.infrastructure && control.controlChanged) {
    blockedRepairOrderId = tile.infrastructure.activeRepairOrderId;
    if (blockedRepairOrderId) {
      const order = runtime.orders[blockedRepairOrderId];
      if (order && (order.status === "committed" || order.status === "executing")) {
        order.status = "blocked";
        order.reservationIds.forEach((reservationId) => {
          const reservation = runtime.reservations[reservationId];
          if (reservation && reservation.kind !== "resource") reservation.status = "released";
        });
        if (order.kind === "infrastructureRepair") {
          const engineer = runtime.formations[order.payload.engineerFormationId];
          if (engineer?.currentOrderId === order.id) engineer.currentOrderId = null;
        }
      }
    }
    tile.infrastructure.activeRepairOrderId = null;
    tile.infrastructure.lastCapturedSegment = runtime.currentSegment;
    tile.infrastructure.capturedFrom = control.controllerBefore;
    tile.infrastructure.capturedBy = control.controllerAfter;
    tile.infrastructure.captureDisruptionUntilSegment = runtime.currentSegment
      + CAMPAIGN_INFRASTRUCTURE_CAPTURE_DISRUPTION_SEGMENTS;
  }
  if (tile.infrastructure) refreshCampaignInfrastructureState(tile.infrastructure, runtime.currentSegment);
  const infrastructureAfter = tile.infrastructure ? structuredClone(tile.infrastructure) : null;
  const capacityAfter = capacitySnapshot(tileDefinition as CampaignTileDefinition, infrastructureAfter);
  const unsigned: Omit<CampaignBattleInfrastructureReport, "integrityHash"> = {
    infrastructureVersion: CAMPAIGN_BATTLE_INFRASTRUCTURE_REPORT_VERSION,
    campaignId: runtime.campaignId,
    scenarioKey: runtime.scenarioKey,
    engagementId: result.engagementId,
    resolutionId: result.resolutionId,
    battleResultIntegrityHash: result.integrityHash,
    consequenceIntegrityHash: consequence.integrityHash,
    controlIntegrityHash: control.integrityHash,
    sourceRevision: runtime.revision,
    appliedRevision: runtime.revision + 1,
    appliedSegment: runtime.currentSegment,
    battleHexKey: control.battleHexKey,
    role: tile.infrastructure?.role ?? null,
    controllerBefore: control.controllerBefore,
    controllerAfter: control.controllerAfter,
    captureApplied: Boolean(tile.infrastructure && control.controlChanged),
    blockedRepairOrderId,
    infrastructureBefore,
    infrastructureAfter,
    capacityBefore,
    capacityAfter,
    damageAssessments: mapped.assessments
  };
  const report: CampaignBattleInfrastructureReport = {
    ...unsigned,
    integrityHash: infrastructureIntegrity(unsigned)
  };
  assertCampaignBattleInfrastructureReport(report, result, consequence, control);
  ledger.infrastructureReport = structuredClone(report);
  const events: CampaignDomainEventDraft[] = [];
  if (report.infrastructureAfter) events.push({
    type: "stateChanged",
    category: "logistics",
    summary: `${tileDefinition.role} at ${control.battleHexKey} is ${report.infrastructureAfter.damageState} at ${report.infrastructureAfter.integrity}/${report.infrastructureAfter.maxIntegrity} integrity.`,
    details: {
      engagementId: result.engagementId,
      hexKey: control.battleHexKey,
      integrityBefore: report.infrastructureBefore?.integrity ?? 0,
      integrityAfter: report.infrastructureAfter.integrity,
      effectiveness: report.infrastructureAfter.effectiveness
    }
  });
  if (report.captureApplied) events.push({
    type: "stateChanged",
    category: "control",
    summary: `${String(report.controllerAfter)} captured the ${tileDefinition.role}; disruption limits capacity until segment ${report.infrastructureAfter?.captureDisruptionUntilSegment}.`,
    details: {
      hexKey: control.battleHexKey,
      capturedFrom: String(report.controllerBefore),
      capturedBy: String(report.controllerAfter),
      disruptionUntilSegment: report.infrastructureAfter?.captureDisruptionUntilSegment ?? 0
    }
  });
  return { duplicate: false, report: structuredClone(report), events };
}
