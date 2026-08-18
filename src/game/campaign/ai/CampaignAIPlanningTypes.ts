/**
 * MODULE: CampaignAIPlanningTypes
 * WHAT: Defines belief-safe operational plan candidates, selected portfolios, and bounded AI memory.
 * WHY: Strategic AI needs a save-stable commitment layer between theater assessment and ordinary typed orders.
 */

import type { CampaignFactionEconomy, CampaignFactionKey } from "../../../core/campaignTypes";
import type { CampaignAIFriendlyFormationView, CampaignAITheaterAssessment } from "./CampaignAIAssessmentTypes";

export const CAMPAIGN_AI_PLANNING_VERSION = 1;

export type CampaignAIPlanKind =
  | "defendObjective"
  | "reinforceFront"
  | "prepareOffensive"
  | "counterattack"
  | "withdraw"
  | "rebuildReserve"
  | "protectLogistics"
  | "interdictSupply"
  | "gatherIntelligence";

export type CampaignAIPlanningDifficulty = "easier" | "standard" | "harder";
export type CampaignAIPlanOutcome = "superseded" | "completed" | "failed" | "aborted";

/** Explicit behavior policy. Difficulty changes breadth and risk—not knowledge or hidden bonuses. */
export interface CampaignAIPlanningPolicy {
  readonly difficulty: CampaignAIPlanningDifficulty;
  readonly planningHorizonSegments: number;
  readonly candidateLimit: number;
  readonly portfolioPlanLimit: number;
  readonly commitmentSegments: number;
  readonly minimumPlanScore: number;
  readonly riskTolerance: number;
}

export interface CampaignAIPlanResources {
  readonly supplies: number;
  readonly fuel: number;
  readonly ammo: number;
  readonly manpower: number;
  readonly intelligenceCapacity: number;
}

/** Positive factors are benefits; exposure/downside/repetition are explicit penalties. */
export interface CampaignAIPlanScoreBreakdown {
  readonly objectiveValue: number;
  readonly forceAdequacy: number;
  readonly urgency: number;
  readonly logisticsSupport: number;
  readonly intelligenceConfidence: number;
  readonly reserveHealth: number;
  readonly continuityBonus: number;
  readonly exposurePenalty: number;
  readonly downsidePenalty: number;
  readonly repetitionPenalty: number;
}

/** Evaluated option retained so diagnostics can reproduce why a plan won or lost. */
export interface CampaignAIOperationalPlanCandidate {
  readonly id: string;
  readonly signature: string;
  readonly kind: CampaignAIPlanKind;
  /** Campaign UI/contact offset key. It never contains an unobserved truth location. */
  readonly targetHexKey: string;
  readonly sourceFindingIds: readonly string[];
  readonly objectiveKeys: readonly string[];
  readonly contactIds: readonly string[];
  readonly requestedFormationCount: number;
  readonly preferredFormationIds: readonly string[];
  readonly durationSegments: number;
  readonly resources: CampaignAIPlanResources;
  readonly scoreBreakdown: CampaignAIPlanScoreBreakdown;
  readonly score: number;
  readonly viable: boolean;
  readonly rejectionReasons: readonly string[];
  readonly summary: string;
  readonly rationale: readonly string[];
}

export interface CampaignAIPlanTriggers {
  readonly reinforce: readonly string[];
  readonly exploit: readonly string[];
  readonly abort: readonly string[];
  readonly withdraw: readonly string[];
}

/** Portfolio-owned operational commitment. C20-032 translates this through CampaignOrderService. */
export interface CampaignAISelectedPlan {
  readonly planId: string;
  readonly candidateId: string;
  readonly signature: string;
  readonly kind: CampaignAIPlanKind;
  readonly targetHexKey: string;
  readonly sourceFindingIds: readonly string[];
  readonly objectiveKeys: readonly string[];
  readonly contactIds: readonly string[];
  readonly assignedFormationIds: readonly string[];
  readonly resources: CampaignAIPlanResources;
  readonly score: number;
  readonly startedSegment: number;
  readonly lastReviewedSegment: number;
  readonly commitmentUntilSegment: number;
  readonly triggers: CampaignAIPlanTriggers;
  readonly summary: string;
}

export interface CampaignAIRetiredPlan {
  readonly planId: string;
  readonly signature: string;
  readonly kind: CampaignAIPlanKind;
  readonly targetHexKey: string;
  readonly startedSegment: number;
  readonly retiredSegment: number;
  readonly outcome: CampaignAIPlanOutcome;
  readonly finalScore: number;
}

export interface CampaignAIOperationalMemory {
  readonly activePlans: readonly CampaignAISelectedPlan[];
  /** Bounded newest-first history used for failure/repetition penalties. */
  readonly recentPlans: readonly CampaignAIRetiredPlan[];
  readonly repetitionBySignature: Readonly<Record<string, number>>;
}

export interface CampaignAIPlanPortfolio {
  readonly candidates: readonly CampaignAIOperationalPlanCandidate[];
  readonly selectedPlans: readonly CampaignAISelectedPlan[];
  readonly heldReserveFormationIds: readonly string[];
  readonly availableFormationIds: readonly string[];
  readonly resourceBudget: CampaignAIPlanResources;
  readonly resourceCommitted: CampaignAIPlanResources;
  readonly score: number;
  /** Private command trace. Never display while the operation remains secret. */
  readonly rationale: readonly string[];
}

/** Complete save-stable output of one operational planning cycle. */
export interface CampaignAIPlanningRecord {
  readonly version: typeof CAMPAIGN_AI_PLANNING_VERSION;
  readonly id: string;
  readonly faction: CampaignFactionKey;
  readonly assessmentId: string;
  readonly sourceRevision: number;
  readonly sourceSegment: number;
  readonly generatedSegment: number;
  readonly sourceAssessmentIntegrity: string;
  readonly sourcePlanningHash: string;
  readonly policy: CampaignAIPlanningPolicy;
  readonly portfolio: CampaignAIPlanPortfolio;
  readonly memory: CampaignAIOperationalMemory;
  readonly integrityHash: string;
}

/** Narrow legal input. No CampaignRuntimeState, opposing truth, or raw knowledge is accepted. */
export interface CampaignAIPlanningInput {
  readonly faction: CampaignFactionKey;
  readonly campaignId: string;
  readonly sourceRevision: number;
  readonly sourceSegment: number;
  readonly generatedSegment: number;
  readonly assessment: CampaignAITheaterAssessment;
  readonly friendlyFormations: readonly CampaignAIFriendlyFormationView[];
  readonly economy: CampaignFactionEconomy;
  readonly availableCollectionCapacity: number;
  readonly previousRecord: CampaignAIPlanningRecord | null;
  readonly policy?: CampaignAIPlanningDifficulty | CampaignAIPlanningPolicy;
}
