import type { CampaignFactionKey, CampaignScenarioData } from "./campaignTypes";

export const CAMPAIGN_INTEL_SAVE_VERSION = 1;

export type IntelKnowledgeLevel = "unknown" | "reported" | "located" | "identified" | "assessed";
export type IntelContactState = "current" | "stale" | "disputed" | "lost";
export type IntelConfidenceBand = "low" | "medium" | "high";
export type IntelStrengthBand = "trace" | "light" | "moderate" | "heavy" | "massed";
export type IntelReadinessBand = "disrupted" | "degraded" | "ready" | "high";
export type IntelSupplyBand = "isolated" | "strained" | "adequate" | "wellSupplied";
export type IntelSourceType =
  | "directContact"
  | "groundRecon"
  | "airRecon"
  | "sigint"
  | "battleReport"
  | "historicalBrief"
  | "deception";

export type CampaignIntelOperationType =
  | "groundRecon"
  | "airRecon"
  | "verify"
  | "counterRecon"
  | "opsec"
  | "phantom";

export type CampaignIntelOperationStatus =
  | "planned"
  | "active"
  | "complete"
  | "partial"
  | "aborted"
  | "compromised";

export interface CampaignIntelClaim {
  subjectKind: "force" | "installation" | "control" | "route" | "activity";
  locationHexKey: string;
  uncertaintyRadius: number;
  domain?: "ground" | "air" | "naval" | "logistics" | "unknown";
  classificationBand?: string;
  strengthBand?: IntelStrengthBand;
  readinessBand?: IntelReadinessBand;
  supplyBand?: IntelSupplyBand;
  movementState?: "stationary" | "preparing" | "moving" | "withdrawing";
  movementDirection?: string;
  /** Internal correlation key. It is stripped from all player-facing projections. */
  truthEntityKey?: string;
  /** Marks an injected claim internally; the observing faction is not told this value. */
  synthetic?: boolean;
}

export interface CampaignIntelSourceReport {
  id: string;
  observerFaction: CampaignFactionKey;
  sourceType: IntelSourceType;
  sourceLabel: string;
  sourceAssetKey?: string;
  observedSegment: number;
  receivedSegment: number;
  reliability: number;
  claims: CampaignIntelClaim[];
  correlationKeys: string[];
}

export interface CampaignIntelContact {
  id: string;
  observerFaction: CampaignFactionKey;
  subjectKind: CampaignIntelClaim["subjectKind"];
  level: IntelKnowledgeLevel;
  state: IntelContactState;
  confidence: number;
  locationHexKey: string;
  uncertaintyRadius: number;
  domain: NonNullable<CampaignIntelClaim["domain"]>;
  classificationBand?: string;
  strengthBand?: IntelStrengthBand;
  readinessBand?: IntelReadinessBand;
  supplyBand?: IntelSupplyBand;
  movementState?: CampaignIntelClaim["movementState"];
  movementDirection?: string;
  lastObservedSegment: number;
  lastUpdatedSegment: number;
  sourceReportIds: string[];
  sourceLabels: string[];
  analystNotes: string[];
  /** Internal only. Never include in CampaignEnemyContactView. */
  truthEntityKey?: string;
}

export interface CampaignIntelOperationPublicOutcome {
  summary: string;
  detail: string;
  reportsProduced: number;
}

export interface CampaignIntelOperation {
  id: string;
  faction: CampaignFactionKey;
  type: CampaignIntelOperationType;
  status: CampaignIntelOperationStatus;
  targetHexKey: string;
  targetContactId?: string;
  assignedAssetKey?: string;
  capacityCommitted: number;
  suppliesCost: number;
  fuelCost: number;
  startSegment: number;
  resolveSegment: number;
  seed: number;
  publicOutcome: CampaignIntelOperationPublicOutcome | null;
}

/** Seed-free operation projection safe for player-facing UI. */
export type CampaignIntelOperationView = Omit<CampaignIntelOperation, "seed">;

export interface CampaignIntelBriefEvent {
  id: string;
  segment: number;
  kind: "new" | "upgraded" | "downgraded" | "stale" | "disputed" | "operation";
  title: string;
  detail: string;
  contactId?: string;
  operationId?: string;
  read: boolean;
}

export interface CampaignKnowledgeState {
  version: number;
  faction: CampaignFactionKey;
  contacts: CampaignIntelContact[];
  sourceReports: CampaignIntelSourceReport[];
  operations: CampaignIntelOperation[];
  briefEvents: CampaignIntelBriefEvent[];
  capacityTotal: number;
  lastResolvedSegment: number;
  nextId: number;
}

export interface CampaignEnemyContactView {
  id: string;
  subjectKind: CampaignIntelContact["subjectKind"];
  level: IntelKnowledgeLevel;
  state: IntelContactState;
  confidenceBand: IntelConfidenceBand;
  locationHexKey: string;
  uncertaintyRadius: number;
  domain: CampaignIntelContact["domain"];
  label: string;
  classificationBand?: string;
  strengthBand?: IntelStrengthBand;
  readinessBand?: IntelReadinessBand;
  supplyBand?: IntelSupplyBand;
  movementState?: CampaignIntelContact["movementState"];
  movementDirection?: string;
  lastObservedSegment: number;
  ageSegments: number;
  sourceLabels: string[];
  analystNotes: string[];
}

export interface CampaignCoverageHexView {
  hexKey: string;
  strength: "screened" | "observed" | "priority";
}

/** Player-safe fixed-site record sourced only from immutable authored briefing data. */
export interface CampaignKnownStrategicSiteView {
  id: string;
  locationHexKey: string;
  label: string;
  role: string;
  summary: string;
  sourceLabel: string;
  spriteKey: string;
  category: "enemyInstallation" | "strategicGeography" | "alliedSupport";
  locationPrecision: "fixed" | "sector";
  relatedLocations: string[];
}

/** Player-safe theater context that deliberately has no exact map coordinate. */
export interface CampaignKnownStrategicRegionView {
  id: string;
  label: string;
  category: "enemyInstallation" | "strategicGeography" | "alliedSupport";
  summary: string;
  sourceLabel: string;
  locations: string[];
  commandStatus: string;
}

export interface CampaignMapViewModel {
  observerFaction: CampaignFactionKey;
  /** Sanitized scenario: opposing force arrays are always removed. */
  scenario: CampaignScenarioData;
  enemyContacts: CampaignEnemyContactView[];
  /** Fixed locations known before play; never populated from hidden runtime tile state. */
  knownStrategicSites?: CampaignKnownStrategicSiteView[];
  /** Sourced regional context intentionally withheld from false-precision map placement. */
  knownStrategicRegions?: CampaignKnownStrategicRegionView[];
  coverage: CampaignCoverageHexView[];
  capacity: { total: number; committed: number; available: number };
  unreadReportCount: number;
  currentSegment: number;
}

export interface CampaignIntelligenceBriefingContact {
  contactId: string;
  label: string;
  level: IntelKnowledgeLevel;
  confidenceBand: IntelConfidenceBand;
  strengthBand?: IntelStrengthBand;
  locationHexKey: string;
  uncertaintyRadius: number;
  ageSegments: number;
}

export interface CampaignIntelligenceBriefing {
  observerFaction: CampaignFactionKey;
  generatedSegment: number;
  battleHexKey: string;
  confidenceBand: IntelConfidenceBand;
  resistanceBand: "unknown" | "light" | "comparable" | "heavy" | "overwhelming";
  summary: string;
  contacts: CampaignIntelligenceBriefingContact[];
  explicitUnknowns: string[];
}

export interface CampaignIntelOperationRule {
  label: string;
  shortLabel: string;
  description: string;
  durationSegments: number;
  capacityCost: number;
  suppliesCost: number;
  fuelCost: number;
  targetRadius: number;
  /** Maximum distance between an assigned asset and the operation center. */
  assetRangeHex?: number;
  requiresAsset: "groundRecon" | "air" | "security" | "friendlyForce" | "none";
}
