/**
 * MODULE: CampaignBattleResultTypes
 * WHAT: Versioned, integrity-bound facts extracted from one completed campaign tactical battle.
 * WHY: Campaign consequences must consume exact tactical deltas without rereading mutable UI state or revealing hidden truth.
 */

import type { CampaignFactionKey } from "../../../core/campaignTypes";
import type {
  FormationReadinessModel,
  HexModificationType,
  PersonnelStatusPool,
  VehicleStatusPool
} from "../../../core/types";
import type { ObjectiveState, ObjectiveTier } from "../../../state/missionRules";
import type {
  CampaignFormationExperience,
  CampaignFormationSupply
} from "../formations/campaignFormationTypes";
import type { CampaignFormationCommitmentRole } from "../engagements/CampaignEngagementLedgerTypes";

export const CAMPAIGN_BATTLE_RESULT_PACKAGE_VERSION = 1 as const;

export type CampaignBattleResultOutcome =
  | "attackerVictory"
  | "defenderVictory"
  | "stalemate"
  | "withdrawal";

export type CampaignFormationBattleResultStatus =
  | "survived"
  | "shattered"
  | "destroyed"
  | "captured"
  | "withdrew";

export type CampaignTacticalUnitDisposition =
  | "deployed"
  | "reserve"
  | "airborneReserve"
  | "casualty";

/** Exact before/after formation facts. C20-023 decides their strategic consequences. */
export interface CampaignFormationBattleDelta {
  readonly campaignFormationId: string;
  readonly tacticalUnitId: string;
  readonly faction: CampaignFactionKey;
  readonly role: CampaignFormationCommitmentRole;
  readonly sourceHexKey: string;
  readonly beforeStateHash: string;
  readonly tacticalDisposition: CampaignTacticalUnitDisposition;
  readonly committedElementIds: readonly string[];
  readonly personnelBefore: number;
  readonly personnelAfter: number;
  readonly personnelStatusBefore: Readonly<Record<string, PersonnelStatusPool>>;
  readonly personnelStatusAfter: Readonly<Record<string, PersonnelStatusPool>>;
  readonly equipmentBefore: Readonly<Record<string, number>>;
  readonly equipmentAfter: Readonly<Record<string, number>>;
  readonly equipmentStatusBefore: Readonly<Record<string, VehicleStatusPool>>;
  readonly equipmentStatusAfter: Readonly<Record<string, VehicleStatusPool>>;
  readonly readinessModel: FormationReadinessModel | null;
  readonly readinessBefore: number;
  readonly readinessAfter: number;
  readonly cohesionBefore: number;
  readonly cohesionAfter: number;
  readonly fatigueBefore: number;
  readonly fatigueAfter: number;
  readonly fatigueGained: number;
  readonly experienceBefore: CampaignFormationExperience;
  readonly experienceAfter: CampaignFormationExperience;
  readonly experienceGained: number;
  readonly supplyBefore: CampaignFormationSupply;
  readonly supplyAfter: CampaignFormationSupply;
  readonly status: CampaignFormationBattleResultStatus;
}

export interface CampaignTacticalObjectiveResult {
  readonly objectiveId: string;
  readonly label: string;
  readonly tier: ObjectiveTier;
  readonly state: ObjectiveState;
  readonly detail: string | null;
}

export type CampaignSupportTrackingMode = "tacticalElements" | "resourcePool" | "supportAsset" | "reservationOnly";

/** Tactical evidence for a non-persistent support or consumable commitment. */
export interface CampaignSupportDelta {
  readonly allocationKey: string;
  readonly category: string;
  readonly committedQuantity: number;
  readonly reservedRp: number;
  readonly trackingMode: CampaignSupportTrackingMode;
  readonly tacticalElementIds: readonly string[];
  readonly survivingElements: number;
  readonly lostElements: number;
  readonly chargesUsed: number;
  readonly resourcePayloadCommitted: CampaignFormationSupply;
}

/** Exact tactical consumption. Strategic charging/refund policy remains C20-023. */
export interface CampaignResourceDelta {
  readonly faction: CampaignFactionKey;
  readonly ammo: number;
  readonly fuel: number;
  readonly rations: number;
  readonly parts: number;
  readonly battleRequisitionPointsSpent: number;
  readonly reservedRequisitionPoints: number;
  readonly reservedAirSorties: number;
}

/** Damage located in tactical coordinates until C20-023/C20-025 map it to campaign infrastructure. */
export interface CampaignInfrastructureDamage {
  readonly tacticalHexKey: string;
  readonly type: HexModificationType;
  /** Tactical structural baseline at battle start. Optional only on pre-C20-025 development receipts. */
  readonly integrityBefore?: number;
  readonly integrityAfter: number;
  readonly maxIntegrity: number;
  readonly damageState: string;
}

export type TacticalEvidenceKind = "battleOutcome" | "objective" | "ownFormation" | "enemyContact";

/** Faction-private evidence; enemy formation IDs are deliberately absent from contact reports. */
export interface TacticalEvidenceReport {
  readonly evidenceId: string;
  readonly kind: TacticalEvidenceKind;
  readonly turn: number;
  readonly summary: string;
  readonly confidence: "low" | "medium" | "high";
  readonly tacticalHexKey: string | null;
  readonly ownFormationId: string | null;
  readonly observedUnitType: string | null;
  readonly observedStrength: number | null;
}

export interface CampaignHonorRecommendation {
  readonly campaignFormationId: string;
  readonly recommendationKey: string;
  readonly reason: string;
}

/** Immutable output of C20-022 and sole tactical input accepted by the C20-023 consequence resolver. */
export interface CampaignBattleResultPackage {
  readonly packageVersion: typeof CAMPAIGN_BATTLE_RESULT_PACKAGE_VERSION;
  readonly battlePackageId: string;
  readonly battlePackageIntegrityHash: string;
  readonly campaignId: string;
  readonly scenarioKey: string;
  readonly engagementId: string;
  readonly campaignRevision: number;
  readonly resolutionId: string;
  readonly result: CampaignBattleResultOutcome;
  readonly endedAtTacticalTurn: number;
  readonly tacticalStateHash: string;
  readonly objectiveResults: readonly CampaignTacticalObjectiveResult[];
  readonly formationDeltas: readonly CampaignFormationBattleDelta[];
  readonly supportDeltas: readonly CampaignSupportDelta[];
  readonly resourcesConsumed: Readonly<Record<string, CampaignResourceDelta>>;
  readonly infrastructureDamage: readonly CampaignInfrastructureDamage[];
  readonly observedEvidenceByFaction: Readonly<Record<string, readonly TacticalEvidenceReport[]>>;
  readonly honorsRecommended: readonly CampaignHonorRecommendation[];
  readonly integrityHash: string;
}
