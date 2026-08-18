/** Immutable C20-025 battle-to-campaign infrastructure consequence contracts. */

import type {
  CampaignFactionKey,
  CampaignInfrastructureState,
  CampaignTileRole
} from "../../../core/campaignTypes";
import type { CampaignInfrastructureDamage } from "../results/CampaignBattleResultTypes";

export const CAMPAIGN_BATTLE_INFRASTRUCTURE_REPORT_VERSION = 1 as const;

export interface CampaignInfrastructureCapacitySnapshot {
  readonly effectiveness: number;
  readonly supplyThroughput: number;
  readonly airSortieCapacity: number;
  readonly navalCapacity: number;
  readonly intelligenceCapacity: number;
  readonly fortificationStrength: number;
}

export interface CampaignInfrastructureDamageAssessment extends Omit<CampaignInfrastructureDamage, "integrityBefore"> {
  readonly integrityBefore: number;
  readonly integrityLost: number;
  readonly mappedCampaignHexKey: string | null;
  readonly outcome: "applied" | "noNewDamage" | "noCampaignInfrastructure";
}

/** Integrity-bound audit for one battle's mapped damage, capture disruption, and capacity change. */
export interface CampaignBattleInfrastructureReport {
  readonly infrastructureVersion: typeof CAMPAIGN_BATTLE_INFRASTRUCTURE_REPORT_VERSION;
  readonly campaignId: string;
  readonly scenarioKey: string;
  readonly engagementId: string;
  readonly resolutionId: string;
  readonly battleResultIntegrityHash: string;
  readonly consequenceIntegrityHash: string;
  readonly controlIntegrityHash: string;
  readonly sourceRevision: number;
  readonly appliedRevision: number;
  readonly appliedSegment: number;
  readonly battleHexKey: string;
  readonly role: CampaignTileRole | null;
  readonly controllerBefore: CampaignFactionKey;
  readonly controllerAfter: CampaignFactionKey;
  readonly captureApplied: boolean;
  readonly blockedRepairOrderId: string | null;
  readonly infrastructureBefore: CampaignInfrastructureState | null;
  readonly infrastructureAfter: CampaignInfrastructureState | null;
  readonly capacityBefore: CampaignInfrastructureCapacitySnapshot;
  readonly capacityAfter: CampaignInfrastructureCapacitySnapshot;
  readonly damageAssessments: readonly CampaignInfrastructureDamageAssessment[];
  readonly integrityHash: string;
}
