/**
 * MODULE: CampaignAIBehaviorTypes
 * WHAT: Records how selected private operational plans were translated into common campaign orders.
 * WHY: Plan intent, legal order identity, blocked reasons, and save recovery need an explicit auditable bridge.
 */

import type { CampaignFactionKey } from "../../../core/campaignTypes";
import type { CampaignAIPlanKind } from "./CampaignAIPlanningTypes";

export const CAMPAIGN_AI_BEHAVIOR_VERSION = 1;

export type CampaignAIBehaviorStatus = "ordered" | "holding" | "blocked";

export interface CampaignAIPlanBehaviorDirective {
  readonly planId: string;
  readonly planKind: CampaignAIPlanKind;
  readonly status: CampaignAIBehaviorStatus;
  readonly orderIds: readonly string[];
  readonly reason: string;
}

/** Private save-stable proof that a portfolio used common typed-order rules. */
export interface CampaignAIBehaviorRecord {
  readonly version: typeof CAMPAIGN_AI_BEHAVIOR_VERSION;
  readonly id: string;
  readonly faction: CampaignFactionKey;
  readonly planningId: string;
  readonly sourceRevision: number;
  readonly sourceSegment: number;
  readonly generatedSegment: number;
  readonly directives: readonly CampaignAIPlanBehaviorDirective[];
  readonly committedOrderIds: readonly string[];
  readonly blockedPlanIds: readonly string[];
  readonly sourceBehaviorHash: string;
  readonly integrityHash: string;
}
