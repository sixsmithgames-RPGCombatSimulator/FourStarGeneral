import type {
  AirMissionKind,
  AirMissionTemplate,
  FormationStatusSummary,
  ScenarioUnit,
  UnitClass,
  UnitTypeDefinition
} from "../core/types";
import type { Axial } from "../core/Hex";
import type { SupplyKey } from "../core/SupplyState";
import type {
  ReconIntelSnapshot,
  ReconIntelVerificationStatus
} from "../data/reconIntelSnapshot";
import type { UnitAllocationKey } from "../data/unitSystem/types";
import type { TurnFaction } from "../game/battle/BattleRuntimeTypes";
import type { SerializedAirMission } from "../game/battle/air/AirCombatContracts";
import type { SupplySnapshot } from "../game/logistics/BattleSupplySnapshot";

export type { TurnFaction } from "../game/battle/BattleRuntimeTypes";
export type {
  AirMissionStatus,
  SerializedAirMission
} from "../game/battle/air/AirCombatContracts";
export type {
  SupplyAlert,
  SupplyCategorySnapshot,
  SupplyResourceKey,
  SupplySnapshot
} from "../game/logistics/BattleSupplySnapshot";

/** Commander modifiers displayed by the battle sidebar. */
export interface CommanderBenefits {
  accBonus: number;
  dmgBonus: number;
  moveBonus: number;
  supplyBonus: number;
}

/** Detached reserve entry exposed to deployment and air-planning UI. */
export interface ReserveUnit {
  readonly unit: ScenarioUnit;
  readonly definition: UnitTypeDefinition;
  readonly allocationKey?: string;
  readonly sprite?: string;
}

/** Roster grouping used by battle personnel panels. */
export type RosterStatus = "frontline" | "reserve" | "support" | "casualty";

/** UI-safe summary of one battle formation. */
export interface RosterUnitSummary {
  readonly unitId: string;
  readonly campaignFormationId?: string;
  readonly unitKey: string | null;
  readonly label: string;
  readonly unitType: string;
  readonly unitClass: UnitClass;
  readonly strength: number;
  readonly experience: number;
  readonly ammo: number;
  readonly fuel: number | null;
  readonly morale: number | null;
  readonly location: string | null;
  readonly status: RosterStatus;
  readonly orders: readonly string[];
  readonly attachments: readonly string[];
  readonly tags: readonly string[];
  readonly combatPower: number;
  readonly statusSummary?: FormationStatusSummary;
  readonly logisticsRole?: "supply" | "medical" | "repair" | null;
  readonly sprite?: string;
}

/** Aggregate counts and combat power for the battle roster. */
export interface BattleRosterMetrics {
  readonly totalUnits: number;
  readonly frontline: number;
  readonly support: number;
  readonly reserve: number;
  readonly casualties: number;
  readonly combatPowerTotal: number;
  readonly reserveDepth: number;
}

/** Complete roster projection consumed by sidebar components. */
export interface BattleRosterSnapshot {
  readonly updatedAt: string;
  readonly frontline: readonly RosterUnitSummary[];
  readonly support: readonly RosterUnitSummary[];
  readonly reserves: readonly RosterUnitSummary[];
  readonly casualties: readonly RosterUnitSummary[];
  readonly metrics: BattleRosterMetrics;
}

/** Requisition category shown in the in-battle purchase panel. */
export type BattleRequisitionKind = "supplies" | "support" | "unit";

/** Pending requisition row exposed to the battle sidebar. */
export interface BattleRequisitionPending {
  readonly id: string;
  readonly unitKey: UnitAllocationKey;
  readonly label: string;
  readonly kind: BattleRequisitionKind;
  readonly quantity: number;
  readonly cost: number;
  readonly requestedTurn: number;
  readonly arrivalTurn: number;
  readonly airlifted: boolean;
  readonly supplyPayload?: Partial<Record<SupplyKey, number>>;
  readonly unitType?: ScenarioUnit["type"];
}

/** Purchasable requisition option exposed to the battle sidebar. */
export interface BattleRequisitionOptionSnapshot {
  readonly unitKey: UnitAllocationKey;
  readonly label: string;
  readonly kind: BattleRequisitionKind;
  readonly cost: number;
  readonly requiresTransportFlight: boolean;
  readonly airliftEligible: boolean;
}

/** Read-only requisition budget and queue projection. */
export interface BattleRequisitionSnapshot {
  readonly points: number;
  readonly earned: number;
  readonly spent: number;
  readonly mainSupplyDistanceTurns: number;
  readonly availableTransportFlights: number;
  readonly pending: readonly BattleRequisitionPending[];
  readonly allowed: readonly BattleRequisitionOptionSnapshot[];
}

/** Player-selected logistics urgency. */
export type SupplyPriority = "critical" | "high" | "normal" | "low";

/** One active source feeding the tactical logistics network. */
export interface LogisticsSupplySource {
  key: string;
  label: string;
  connectedUnits: number;
  throughput: number;
  utilization: number;
  averageTravelHours: number;
  bottleneck: string | null;
}

/** Depot resource posture shown in logistics panels. */
export interface LogisticsStockpileEntry {
  resource: "ammo" | "fuel" | "parts";
  total: number;
  averagePerUnit: number;
  trend: "rising" | "stable" | "falling";
}

/** Live convoy assignment and cargo status. */
export interface LogisticsConvoyStatusEntry {
  unitId: string;
  convoyLabel: string;
  route: string;
  status: "loading" | "delivering" | "returning" | "idle" | "blocked";
  etaHours: number;
  cargoAmmo: number;
  cargoFuel: number;
  incident: string | null;
}

/** Congested route node surfaced to the logistics panel. */
export interface LogisticsDelayNode {
  node: string;
  risk: "low" | "medium" | "high";
  reason: string;
}

/** Maintenance work waiting for repair capacity. */
export interface LogisticsMaintenanceEntry {
  unitKey: string;
  issue: string;
  pendingTurns: number;
}

/** Medical or repair demand attached to a formation. */
export interface LogisticsCareEntry {
  unitId: string;
  unitLabel: string;
  hex: string;
  priority: SupplyPriority;
  type: "medical" | "repair";
  need: number;
  assignedAssets: number;
  lastTurnEffect: string | null;
}

/** Medical or repair team's current task and route state. */
export interface LogisticsSupportTeamStatusEntry {
  unitId: string;
  teamLabel: string;
  type: "medical" | "repair";
  route: string;
  status: "treating" | "repairing" | "available" | "blocked";
  etaHours: number;
  assignedUnitLabel: string | null;
  assignedHex: string | null;
  need: number;
  lastTurnEffect: string | null;
  incident: string | null;
}

/** Formation-level demand in the convoy assignment queue. */
export interface LogisticsPriorityEntry {
  unitId: string;
  unitLabel: string;
  hex: string;
  priority: SupplyPriority;
  ammoNeed: number;
  fuelNeed: number;
  assignedConvoys: number;
  status: "direct" | "queued" | "delivering" | "resupplied" | "isolated";
}

/** Player-facing logistics alert. */
export interface LogisticsAlertEntry {
  level: "info" | "warning" | "critical";
  message: string;
}

/** Complete logistics read model consumed by sidebar panels. */
export interface LogisticsSnapshot {
  turn: number;
  deployedUnits: number;
  connectedUnits: number;
  isolatedUnits: number;
  convoyUnits: number;
  loadedConvoys: number;
  convoyCargo: { ammo: number; fuel: number };
  depotStock: { ammo: number; fuel: number; parts: number };
  supplySources: LogisticsSupplySource[];
  stockpiles: LogisticsStockpileEntry[];
  convoyStatuses: LogisticsConvoyStatusEntry[];
  supportTeamStatuses: LogisticsSupportTeamStatusEntry[];
  priorityTargets: LogisticsPriorityEntry[];
  careTargets: LogisticsCareEntry[];
  delayNodes: LogisticsDelayNode[];
  maintenanceBacklog: LogisticsMaintenanceEntry[];
  alerts: LogisticsAlertEntry[];
}

/** Confidence state for one observed enemy contact. */
export type EnemyContactState = "spotted" | "identified" | "visible";

/** Enemy contact facts observed by one player reconnaissance unit. */
export interface ReconObservedContact {
  unitId: string;
  hex: Axial;
  state: EnemyContactState;
  unitType?: ScenarioUnit["type"];
  strengthEstimate?: number;
  movedThisTurn: boolean;
  attackedThisTurn: boolean;
}

/** Reconnaissance report grouped by the observing player unit. */
export interface PlayerReconReport {
  observerUnitId: string;
  observerType: ScenarioUnit["type"];
  observerHex: Axial;
  observerStrength: number;
  source: string;
  spottingRange: number;
  contacts: readonly ReconObservedContact[];
}

/** Air order accepted by the sidebar-facing scheduler facade. */
export interface SidebarAirMissionRequest {
  readonly kind: AirMissionKind;
  readonly faction: TurnFaction;
  readonly unitHex: Axial;
  readonly unitId?: string;
  readonly targetHex?: Axial;
  readonly escortTargetHex?: Axial;
  readonly escortTargetUnitId?: string;
}

/** Stable scheduling error identifiers rendered by air-planning feedback. */
export type SidebarAirMissionErrorCode =
  | "PHASE_INVALID"
  | "WRONG_FACTION"
  | "NO_UNIT_AT_HEX"
  | "NOT_AIRCRAFT"
  | "NO_AIR_SUPPORT_PROFILE"
  | "ROLE_NOT_ELIGIBLE"
  | "ALREADY_ASSIGNED"
  | "NEEDS_REFIT"
  | "TARGET_REQUIRED"
  | "ESCORT_TARGET_REQUIRED"
  | "OUT_OF_RANGE"
  | "ESCORT_TARGET_MISSING"
  | "ESCORT_TARGET_IN_FLIGHT"
  | "AIRBASE_CAPACITY_EXCEEDED";

/**
 * Narrow engine capability exposed to battle sidebar components.
 * This contract contains no mutable engine implementation dependency and is
 * structurally implemented by `GameEngine` at the state boundary.
 */
export interface BattleSidebarEngine {
  readonly phase: "deployment" | "playerTurn" | "allyTurn" | "botTurn" | "completed";
  readonly activeFaction: TurnFaction;
  readonly playerUnits: readonly ScenarioUnit[];
  readonly botUnits: readonly ScenarioUnit[];
  readonly reserveUnits: readonly ReserveUnit[];
  getSupplySnapshot(faction?: TurnFaction): SupplySnapshot;
  getBattleRequisitionSnapshot(): BattleRequisitionSnapshot;
  getPlayerReconReports(): PlayerReconReport[];
  getReconIntelSnapshot(): ReconIntelSnapshot;
  deployCounterIntel(targetHex: Axial): { ok: true; operationId: string } | { ok: false; reason: string };
  verifyIntelBrief(briefId: string): { ok: true; status: ReconIntelVerificationStatus } | { ok: false; reason: string };
  listAirMissionTemplates(): readonly AirMissionTemplate[];
  getScheduledAirMissions(faction?: TurnFaction): readonly SerializedAirMission[];
  tryScheduleAirMission(request: SidebarAirMissionRequest):
    | { ok: true; missionId: string }
    | { ok: false; code: SidebarAirMissionErrorCode; reason: string };
  getAirSupportSummary(): { queued: number; inFlight: number; resolving: number; completed: number; refit: number };
  getAircraftCombatRadiusHex(origin: Axial, unitId?: string | null): number | null;
  getAircraftRefitTurns(origin: Axial, unitId?: string | null): number | null;
  cancelQueuedAirMission(missionId: string): boolean;
  getCommanderBenefits(): CommanderBenefits;
  getLogisticsSnapshot(): LogisticsSnapshot;
  setSupplyPriority(unitId: string, priority: SupplyPriority): boolean;
}
