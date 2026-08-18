/**
 * MODULE: CampaignAIAssessmentTypes
 * WHAT: Defines the faction-safe input and persisted operational assessment used by strategic campaign AI.
 * WHY: AI planning must reason from the same fog-limited picture as a player commander without accepting raw enemy truth.
 */

import type {
  CampaignFactionEconomy,
  CampaignFactionKey,
  CampaignObjectiveCategory
} from "../../../core/campaignTypes";
import type {
  CampaignCoverageHexView,
  CampaignEnemyContactView,
  IntelConfidenceBand
} from "../../../core/campaignIntelTypes";
import type { CampaignFormationStatus } from "../formations/campaignFormationTypes";
import type { CampaignOrder } from "../orders/CampaignOrderTypes";
import type {
  CampaignObjectiveRuntimeStatus,
  CampaignOutcomeGrade
} from "../runtime/campaignRuntimeTypes";

export const CAMPAIGN_AI_ASSESSMENT_VERSION = 1;

/** The five strategic postures promised by the Campaign 2.0 design. */
export type CampaignAIPosture = "preserve" | "delay" | "balanced" | "pressure" | "decisiveOffensive";

export type CampaignAIFindingPriority = "routine" | "important" | "urgent" | "critical";
export type CampaignAILogisticsState = "critical" | "strained" | "adequate" | "secure";
export type CampaignAIForceBalance = "unknown" | "critical" | "unfavorable" | "even" | "favorable" | "dominant";

/** Exact friendly formation truth deliberately stripped of tactical-only and opposing fields. */
export interface CampaignAIFriendlyFormationView {
  readonly id: string;
  readonly name: string;
  readonly campaignUnitType: string;
  readonly locationHexKey: string | null;
  readonly status: CampaignFormationStatus;
  readonly effectiveStrengthPercent: number;
  readonly readiness: number;
  readonly cohesion: number;
  readonly fatigue: number;
  readonly sustainmentPercent: number;
  readonly mobile: boolean;
  readonly hasActiveOrder: boolean;
}

/** Public objective facts. Secret unresolved objectives never enter this projection. */
export interface CampaignAIObjectiveView {
  readonly key: string;
  readonly label: string;
  /** Authoritative axial runtime key, distinct from the UI/contact offset-key convention. */
  readonly runtimeHexKey: string;
  readonly owner: CampaignFactionKey;
  readonly requiredFaction: CampaignFactionKey;
  /** True when location control is a legal condition; false prevents non-territorial goals becoming capture plans. */
  readonly controlRelevant: boolean;
  readonly currentController: CampaignFactionKey;
  readonly category: CampaignObjectiveCategory;
  readonly status: CampaignObjectiveRuntimeStatus;
  readonly progress: number;
  readonly deadlineSegment: number | null;
  readonly score: number;
}

/** Public campaign direction supplied without exposing private opposing resources or orders. */
export interface CampaignAIPublicCampaignView {
  readonly phaseKey: string;
  readonly score: {
    readonly earned: number;
    readonly available: number;
    readonly percent: number;
    readonly projectedGrade: CampaignOutcomeGrade;
  };
}

/** Minimal intelligence projection: no scenario tiles, opposing control truth, or opposing infrastructure can enter AI code. */
export interface CampaignAIOperationalPictureView {
  readonly observerFaction: CampaignFactionKey;
  readonly enemyContacts: readonly CampaignEnemyContactView[];
  readonly coverage: readonly CampaignCoverageHexView[];
  readonly capacity: {
    readonly total: number;
    readonly committed: number;
    readonly available: number;
  };
  readonly unreadReportCount: number;
  readonly currentSegment: number;
}

/** Only legal input accepted by the assessment service. There is intentionally no CampaignRuntimeState field. */
export interface CampaignAIAssessmentInput {
  readonly faction: CampaignFactionKey;
  readonly campaignId: string;
  readonly sourceRevision: number;
  readonly sourceSegment: number;
  readonly economy: CampaignFactionEconomy;
  readonly operationalPicture: CampaignAIOperationalPictureView;
  readonly orders: readonly CampaignOrder[];
  readonly friendlyFormations: readonly CampaignAIFriendlyFormationView[];
  readonly objectives: readonly CampaignAIObjectiveView[];
  readonly campaign: CampaignAIPublicCampaignView;
}

/** One ranked, explainable conclusion derived only from projected contacts and public objectives. */
export interface CampaignAIFinding {
  readonly id: string;
  readonly kind: "threat" | "opportunity";
  readonly targetHexKey: string;
  readonly score: number;
  readonly priority: CampaignAIFindingPriority;
  readonly confidence: IntelConfidenceBand;
  readonly summary: string;
  readonly detail: string;
  readonly factors: readonly string[];
  readonly contactIds: readonly string[];
  readonly objectiveKeys: readonly string[];
}

export interface CampaignAIForceAssessment {
  readonly activeFormations: number;
  readonly combatReadyFormations: number;
  readonly committedFormations: number;
  readonly averageEffectiveStrength: number;
  readonly averageReadiness: number;
  readonly averageCohesion: number;
  readonly averageFatigue: number;
  readonly assessedEnemyPressure: number;
  readonly assessedBalance: CampaignAIForceBalance;
}

export interface CampaignAIReserveAssessment {
  readonly availableFormations: number;
  readonly requiredFormations: number;
  readonly deficit: number;
  readonly adequate: boolean;
}

export interface CampaignAILogisticsAssessment {
  readonly state: CampaignAILogisticsState;
  readonly averageFormationSustainment: number;
  readonly lowResourceKeys: readonly ("supplies" | "fuel" | "ammo" | "manpower")[];
  readonly explanation: string;
}

export interface CampaignAIIntelligenceAssessment {
  readonly visibleContacts: number;
  readonly currentContacts: number;
  readonly staleOrDisputedContacts: number;
  readonly highConfidenceContacts: number;
  readonly availableCollectionCapacity: number;
  readonly uncertainty: "low" | "moderate" | "high";
}

export interface CampaignAIObjectivePressureAssessment {
  readonly activeObjectives: number;
  readonly protectedObjectives: number;
  readonly threatenedObjectives: number;
  readonly urgentDeadlines: number;
  readonly scoreAtRisk: number;
  readonly nearestDeadlineSegments: number | null;
}

/** Latest save-stable situation assessment for one faction. Planning consumes this in C20-031. */
export interface CampaignAITheaterAssessment {
  readonly version: typeof CAMPAIGN_AI_ASSESSMENT_VERSION;
  readonly id: string;
  readonly faction: CampaignFactionKey;
  readonly sourceRevision: number;
  readonly sourceSegment: number;
  readonly generatedSegment: number;
  readonly sourceViewHash: string;
  readonly posture: CampaignAIPosture;
  readonly forces: CampaignAIForceAssessment;
  readonly reserves: CampaignAIReserveAssessment;
  readonly logistics: CampaignAILogisticsAssessment;
  readonly intelligence: CampaignAIIntelligenceAssessment;
  readonly objectivePressure: CampaignAIObjectivePressureAssessment;
  readonly threats: readonly CampaignAIFinding[];
  readonly opportunities: readonly CampaignAIFinding[];
  /** Private reproducibility trace. Production player UI must not surface this before the related operation resolves. */
  readonly rationale: readonly string[];
  readonly integrityHash: string;
}
