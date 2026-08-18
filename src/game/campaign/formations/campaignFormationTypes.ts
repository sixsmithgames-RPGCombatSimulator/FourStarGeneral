/**
 * MODULE: campaignFormationTypes
 * WHAT: Defines campaign-owned formation identity, condition, history, and tactical handoff contracts.
 * WHY: Persistent formations must survive movement, battles, and saves independently of aggregate map counters or live tactical objects.
 *
 * DEPENDENCIES: Shared campaign faction and tactical status-pool types.
 * EXPORTS: Formation records, lifecycle enums, history/honor records, seed provenance, and tactical snapshot contracts.
 */

import type { CampaignFactionKey } from "../../../core/campaignTypes";
import type {
  FormationReadinessModel,
  PersonnelStatusPool,
  ScenarioUnit,
  VehicleStatusPool
} from "../../../core/types";

/** How long and under what player authority a formation belongs to the campaign force. */
export type CampaignFormationOwnership = "core" | "attached" | "auxiliary";

/** Campaign lifecycle states shared by player and strategic AI formations. */
export type CampaignFormationStatus =
  | "ready"
  | "committed"
  | "inTransit"
  | "isolated"
  | "refitting"
  | "shattered"
  | "destroyed"
  | "captured";

/** Stable origin facts retained after the legacy aggregate counter is gone. */
export interface CampaignFormationOrigin {
  readonly kind: "legacyAggregate" | "authored" | "reconstituted";
  readonly initialHexKey: string | null;
  readonly legacyGroupIndex: number | null;
  readonly legacyOrdinal: number | null;
  readonly legacyLabel: string | null;
}

/** Campaign supply carried by one formation; later logistics rules replenish these pools. */
export interface CampaignFormationSupply {
  ammo: number;
  fuel: number;
  rations: number;
  parts: number;
}

/** Experience values retain the tactical base/earned split and multi-battle participation count. */
export interface CampaignFormationExperience {
  base: number;
  earned: number;
  battles: number;
}

/** Data-ready honor record. Award triggers and effects arrive in C20-042. */
export interface CampaignFormationHonorAward {
  readonly id: string;
  readonly honorKey: string;
  readonly name: string;
  readonly awardedSegment: number;
  readonly engagementId: string | null;
  readonly citation: string;
}

/** Append-only identity and lifecycle fact for one formation. */
export interface CampaignFormationHistoryEntry {
  readonly id: string;
  readonly type: "formed" | "moved" | "statusChanged" | "battle" | "refit" | "upgrade" | "honor" | "retired";
  readonly segment: number;
  readonly summary: string;
  readonly engagementId: string | null;
  readonly fromHexKey: string | null;
  readonly toHexKey: string | null;
}

/** Authoritative campaign record represented—but never owned—by tactical ScenarioUnit objects. */
export interface CampaignFormationRecord {
  readonly id: string;
  readonly faction: CampaignFactionKey;
  ownership: CampaignFormationOwnership;
  name: string;
  /** Legacy campaign unit type used by map projections and force mapping. */
  readonly campaignUnitType: string;
  /** Tactical allocation/formation key, or the campaign type when no tactical analogue exists. */
  formationKey: string;
  equipmentPackageKey: string;
  locationHexKey: string | null;
  status: CampaignFormationStatus;
  personnel: Record<string, PersonnelStatusPool>;
  equipment: Record<string, VehicleStatusPool>;
  readinessModel?: FormationReadinessModel;
  readiness: number;
  cohesion: number;
  fatigue: number;
  supply: CampaignFormationSupply;
  experience: CampaignFormationExperience;
  commanderId: string | null;
  honors: CampaignFormationHonorAward[];
  battleHistory: CampaignFormationHistoryEntry[];
  currentOrderId: string | null;
  readonly createdSegment: number;
  retiredSegment: number | null;
  readonly origin: CampaignFormationOrigin;
}

/** Result of adapting a campaign formation into a battle-owned defensive unit copy. */
export interface CampaignFormationBattleSeed {
  readonly campaignFormationId: string;
  readonly tacticalUnitId: string;
  readonly unit: ScenarioUnit;
}

/** Minimal tactical state captured by provenance for the later result-extraction milestone. */
export interface CampaignFormationTacticalSnapshot {
  readonly campaignFormationId: string;
  readonly tacticalUnitId: string;
  readonly strength: number;
  readonly status: NonNullable<ScenarioUnit["status"]>;
  readonly baseExperience: number;
  readonly earnedExperience: number;
  readonly ammo: number;
  readonly fuel: number;
}

