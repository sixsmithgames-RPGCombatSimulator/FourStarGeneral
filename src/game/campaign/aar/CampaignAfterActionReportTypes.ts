/** Immutable Campaign 2.0 post-battle report contracts. */

import type { CampaignFactionKey } from "../../../core/campaignTypes";
import type { CampaignObjectiveRuntimeStatus } from "../runtime/campaignRuntimeTypes";
import type { CampaignBattleEconomySnapshot, CampaignBattleEconomyCharge } from "../consequences/CampaignBattleConsequenceTypes";
import type { CampaignFormationStatus } from "../formations/campaignFormationTypes";
import type { CampaignFormationControlDispositionKind, CampaignOccupationOutcome } from "../control/CampaignBattleControlTypes";
import type { CampaignBattleResultOutcome, CampaignTacticalObjectiveResult, CampaignNavalSourceDelta } from "../results/CampaignBattleResultTypes";

export const CAMPAIGN_AFTER_ACTION_REPORT_VERSION = 2 as const;

/** Exact friendly source receipt with the replenishment consequence frozen at resolution. */
export interface CampaignAfterActionNavalSupportResult extends CampaignNavalSourceDelta {
  readonly status: "expended" | "restored";
  readonly nextAvailableSegment: number;
}

export type CampaignAfterActionStrategicResult = "victory" | "defeat" | "stalemate" | "withdrawal";
export type CampaignAfterActionDecisionSeverity = "attention" | "critical";
export type CampaignAfterActionDecisionTarget = "campaign" | "objective" | "formation" | "logistics" | "infrastructure" | "engagement";

/** Historical friendly-formation result. Names and before/after values are frozen at battle resolution. */
export interface CampaignAfterActionFormationResult {
  readonly formationId: string;
  readonly name: string;
  readonly role: "attacker" | "defender";
  readonly sourceHexKey: string;
  readonly destinationHexKey: string | null;
  readonly personnelBefore: number;
  readonly personnelAfter: number;
  readonly personnelLost: number;
  readonly equipmentLost: Readonly<Record<string, number>>;
  readonly readinessBefore: number;
  readonly readinessAfter: number;
  readonly cohesionBefore: number;
  readonly cohesionAfter: number;
  readonly fatigueBefore: number;
  readonly fatigueAfter: number;
  readonly experienceGained: number;
  readonly statusAfter: CampaignFormationStatus;
  readonly disposition: CampaignFormationControlDispositionKind | "terminallyRemoved";
  readonly dispositionExplanation: string;
}

/** Confirmed tactical opponent facts intentionally omit persistent enemy formation identity. */
export interface CampaignAfterActionOpponentSummary {
  readonly formationsEngaged: number;
  readonly personnelLosses: number;
  readonly formationsDestroyed: number;
  readonly formationsCaptured: number;
  readonly formationsWithdrew: number;
}

/** One objective lifecycle change caused by the committed battle transaction. */
export interface CampaignAfterActionObjectiveChange {
  readonly objectiveKey: string;
  readonly label: string;
  readonly statusBefore: CampaignObjectiveRuntimeStatus;
  readonly statusAfter: CampaignObjectiveRuntimeStatus;
  readonly progressBefore: number;
  readonly progressAfter: number;
  readonly scoreAwarded: number;
  readonly explanation: string;
}

/** One concrete follow-up surfaced by the AAR instead of hiding it in prose. */
export interface CampaignAfterActionDecisionRequired {
  readonly id: string;
  readonly severity: CampaignAfterActionDecisionSeverity;
  readonly targetKind: CampaignAfterActionDecisionTarget;
  readonly targetId: string | null;
  readonly title: string;
  readonly detail: string;
}

/** Player-safe, integrity-bound report retained beside the authoritative tactical and campaign audits. */
export interface CampaignAfterActionReport {
  readonly reportVersion: 1 | typeof CAMPAIGN_AFTER_ACTION_REPORT_VERSION;
  readonly reportId: string;
  readonly campaignId: string;
  readonly scenarioKey: string;
  readonly engagementId: string;
  readonly resolutionId: string;
  readonly viewerFaction: CampaignFactionKey;
  readonly sourceRevision: number;
  readonly appliedRevision: number;
  readonly segment: number;
  readonly battleResultIntegrityHash: string;
  readonly consequenceIntegrityHash: string;
  readonly controlIntegrityHash: string;
  readonly infrastructureIntegrityHash: string;
  readonly tacticalResult: CampaignBattleResultOutcome;
  readonly strategicResult: CampaignAfterActionStrategicResult;
  readonly title: string;
  readonly summary: string;
  readonly battleHexKey: string;
  readonly objectiveKey: string | null;
  readonly objectiveLabel: string | null;
  readonly controllerBefore: CampaignFactionKey;
  readonly controllerAfter: CampaignFactionKey;
  readonly controlChanged: boolean;
  readonly occupationOutcome: CampaignOccupationOutcome;
  readonly frontsBefore: number;
  readonly frontsAfter: number;
  readonly friendlyFormations: readonly CampaignAfterActionFormationResult[];
  /** Required in v2 reports; absent from preserved v1 historical reports. */
  readonly navalSupport?: readonly CampaignAfterActionNavalSupportResult[];
  readonly opponent: CampaignAfterActionOpponentSummary;
  readonly economyBefore: CampaignBattleEconomySnapshot;
  readonly economyAfter: CampaignBattleEconomySnapshot;
  readonly economyCharged: CampaignBattleEconomyCharge;
  readonly economyShortfall: CampaignBattleEconomyCharge;
  readonly tacticalObjectives: readonly CampaignTacticalObjectiveResult[];
  readonly campaignPhaseBefore: string;
  readonly campaignPhaseAfter: string;
  readonly campaignScoreBefore: number;
  readonly campaignScoreAfter: number;
  readonly campaignObjectiveChanges: readonly CampaignAfterActionObjectiveChange[];
  readonly infrastructureRole: string | null;
  readonly infrastructureIntegrityBefore: number | null;
  readonly infrastructureIntegrityAfter: number | null;
  readonly infrastructureEffectivenessBefore: number;
  readonly infrastructureEffectivenessAfter: number;
  readonly decisionsRequired: readonly CampaignAfterActionDecisionRequired[];
  readonly integrityHash: string;
}

/** Acknowledgement is mutable UI state and is deliberately outside the report integrity hash. */
export interface CampaignAfterActionReportPresentation extends CampaignAfterActionReport {
  readonly acknowledged: boolean;
}
