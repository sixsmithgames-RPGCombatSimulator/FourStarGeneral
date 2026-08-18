/**
 * MODULE: CampaignBattleControlTypes
 * WHAT: Defines persistent retreat, occupation, isolation, tile-control, and derived-front audit contracts.
 * WHY: Operational placement must be explainable, save-stable, and independently verifiable after tactical consequences.
 */

import type {
  CampaignFactionKey,
  CampaignFrontLine
} from "../../../core/campaignTypes";
import type {
  CampaignFormationStatus,
  CampaignFormationSupply
} from "../formations/campaignFormationTypes";
import type { CampaignBattleResultOutcome } from "../results/CampaignBattleResultTypes";

export const CAMPAIGN_BATTLE_CONTROL_REPORT_VERSION = 1 as const;
export const CAMPAIGN_RETREAT_STACK_LIMIT = 6;

export interface CampaignRetreatOptionAssessment {
  readonly hexKey: string;
  readonly supplied: boolean;
  readonly occupiedFormationCount: number;
  readonly distanceFromBattle: number;
  readonly legal: boolean;
  readonly rejectionReason: "enemyControl" | "stackLimit" | "missingTile" | null;
}

export type CampaignFormationControlDispositionKind =
  | "held"
  | "occupied"
  | "retreated"
  | "capturedNoRoute";

/** Final operational placement decision for one non-terminal C20-023 participant. */
export interface CampaignFormationControlDisposition {
  readonly campaignFormationId: string;
  readonly faction: CampaignFactionKey;
  readonly disposition: CampaignFormationControlDispositionKind;
  readonly sourceHexKey: string;
  readonly destinationHexKey: string | null;
  readonly statusBefore: CampaignFormationStatus;
  readonly statusAfter: CampaignFormationStatus;
  readonly readinessBefore: number;
  readonly readinessAfter: number;
  readonly cohesionBefore: number;
  readonly cohesionAfter: number;
  readonly fatigueBefore: number;
  readonly fatigueAfter: number;
  readonly supplyBefore: CampaignFormationSupply;
  readonly supplyAfter: CampaignFormationSupply;
  readonly abandonedEquipment: Readonly<Record<string, number>>;
  readonly retreatOptions: readonly CampaignRetreatOptionAssessment[];
  readonly explanation: string;
}

export interface CampaignFormationIsolationChange {
  readonly campaignFormationId: string;
  readonly faction: CampaignFactionKey;
  readonly hexKey: string;
  readonly isolatedBefore: boolean;
  readonly isolatedAfter: boolean;
  readonly reason: "noFriendlySupplyPath" | "friendlySupplyPathRestored";
}

export type CampaignOccupationOutcome =
  | "notRequired"
  | "satisfied"
  | "failedNoEligibleOccupier"
  | "failedEnemyPresence";

/** Immutable, integrity-bound audit produced by C20-024 for one battle. */
export interface CampaignBattleControlReport {
  readonly controlVersion: typeof CAMPAIGN_BATTLE_CONTROL_REPORT_VERSION;
  readonly campaignId: string;
  readonly scenarioKey: string;
  readonly engagementId: string;
  readonly resolutionId: string;
  readonly battleResultIntegrityHash: string;
  readonly consequenceIntegrityHash: string;
  readonly sourceRevision: number;
  readonly appliedRevision: number;
  readonly appliedSegment: number;
  readonly result: CampaignBattleResultOutcome;
  readonly battleHexKey: string;
  readonly controllerBefore: CampaignFactionKey;
  readonly controllerAfter: CampaignFactionKey;
  readonly controlChanged: boolean;
  readonly controlSinceSegmentBefore: number;
  readonly controlSinceSegmentAfter: number;
  readonly controlStateHashBefore: string;
  readonly controlStateHashAfter: string;
  readonly occupationRequired: boolean;
  readonly occupationOutcome: CampaignOccupationOutcome;
  readonly occupyingFormationId: string | null;
  readonly formationDispositions: readonly CampaignFormationControlDisposition[];
  readonly isolationChanges: readonly CampaignFormationIsolationChange[];
  readonly frontsBefore: readonly CampaignFrontLine[];
  readonly frontsAfter: readonly CampaignFrontLine[];
  readonly integrityHash: string;
}
