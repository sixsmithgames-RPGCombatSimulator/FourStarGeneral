import type {
  ScenarioData,
  ScenarioSide,
  ScenarioUnit,
  UnitTypeDictionary,
  UnitTypeDefinition,
  TerrainDictionary,
  TerrainDefinition,
  UnitClass,
  TileInstance,
  AirMissionKind,
  AirMissionTemplate,
  AirSupportProfile,
  CombatStance,
  HexModification,
  HexModificationType
} from "../core/types";
import type {
  CampaignDecision,
  CampaignPendingEngagement,
  CampaignScenarioData,
  CampaignTurnState
} from "../core/campaignTypes";
import {
  resolveAttack,
  type AttackRequest,
  type AttackResult,
  type UnitCombatState,
  type AttackerContext,
  type DefenderContext
} from "../core/Combat";
import { losClear, losClearAdvanced, type Lister } from "../core/LOS";
import {
  applyOutOfSupply,
  createSupplyUnits,
  computeSupplyRoutes,
  hasSupplyPath,
  resolveUpkeepForClass,
  type SupplyRouteSummary,
  type SupplyNetwork,
  type SupplyUnitState,
  type SupplyTerrainCatalog,
  type SupplyAttritionProfile
} from "../core/Supply";
import { axialKey, hexDistance, neighbors, type Axial } from "../core/Hex";
import { ensureDeploymentState, type ReserveBlueprint } from "../state/DeploymentState";
import {
  planHeuristicBotTurn,
  getDifficultyModifiers,
  type BotPlannerInput,
  type BotStrategyMode,
  type BotDifficulty,
  type PlannerUnitSnapshot,
  type AttackEstimate
} from "./bot/BotPlanner";
import { AIR_MISSION_TEMPLATES } from "../data/airMissions";
import {
  getReconIntelSnapshot as buildInitialReconIntelSnapshot,
  type ReconIntelBrief,
  type ReconIntelCounterIntelOperation,
  type ReconIntelSnapshot,
  type ReconIntelVerificationStatus
} from "../data/reconIntelSnapshot";
import { combat as combatBalance, FUEL_COST, supply as supplyBalance } from "../core/balance";
import {
  accumulateProduction,
  advanceShipments,
  applyShipment,
  createSupplyState,
  enforceLedgerLimit,
  getInventoryTotals,
  recordConsumption,
  type SupplyKey,
  type SupplyState,
  type SupplyLedgerEntry
} from "../core/SupplyState";

/**
 * Minimal structure the campaign layer exposes to the tactical engine so transitions between screens stay predictable.
 * We start with a read-only surface describing the active scenario and any pending battles that should spawn.
 */
export interface CampaignBridgeState {
  /** Current campaign scenario the commander operates in (5km hex scale). */
  scenario: CampaignScenarioData | null;
  /** Snapshot of campaign turn data including resources and triggered engagements. */
  turnState: CampaignTurnState | null;
  /** Decisions queued by the player; GameEngine applies them when advancing the strategic layer. */
  queuedDecisions: CampaignDecision[];
  /** Tactical battle hooks waiting to be resolved by the combat flow. */
  pendingEngagements: CampaignPendingEngagement[];
}

/** Machine-readable error codes surfaced by tryScheduleAirMission for UI handling. */
export type ScheduleAirMissionErrorCode =
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

export interface DeploymentAllocation {
  hex: Axial;
  unitType: keyof UnitTypeDictionary;
  strength?: number;
  experience?: number;
  ammo?: number;
  fuel?: number;
  entrench?: number;
  facing?: ScenarioUnit["facing"];
}

export interface TurnSummary {
  phase: BattlePhase;
  activeFaction: TurnFaction;
  turnNumber: number;
}

/** Minimal surface describing commander bonuses so downstream callers avoid poking private state. */
export interface CommanderBenefits {
  accBonus: number;
  dmgBonus: number;
  moveBonus: number;
  supplyBonus: number;
}

/** Movement allowance snapshot used by UI overlays to display remaining steps on standard terrain. */
export interface MovementBudget {
  readonly max: number;
  readonly remaining: number;
}

type AircraftAmmoState = { air: number; ground: number; needsRearm: boolean };

import type { DeploymentUnitTemplate } from "./adapters";

/**
 * Gameplay engine coordinates deployment, turn flow, and combat resolution for the battle screen.
 * Every public method includes human-readable comments describing inputs, outputs, and side-effects.
 */

/**
 * Identifiers for the participant currently taking a turn. Explicit string union keeps the API simple
 * while enabling future expansion (e.g. additional AI factions).
 */
export type TurnFaction = "Player" | "Bot" | "Ally";

/**
 * Lifecycle phases the battle screen can be in. Deployment concludes once the player presses Begin,
 * after which normal turn sequencing governs the flow.
 */
export type BattlePhase = "deployment" | "playerTurn" | "allyTurn" | "botTurn" | "completed";

/**
 * Map of hex-key to scenario units representing deployed forces. This structure powers engine queries
 * and feeds the UI roster/reserve panes.
 */
export type UnitPlacementMap = Map<string, ScenarioUnit>;

/**
 * Hex reference captured during deployment when the commander selects a base camp. The engine stores
 * both the axial coordinate and a precomputed key for constant-time lookups.
 */
export interface BaseCamp {
  hex: Axial;
  key: string;
}

/**
 * Units not deployed when the Begin button is pressed remain in reserves. Each reserve keeps its
 * original scenario unit payload and the option data required for UI presentation.
 */
export interface ReserveUnit {
  unit: ScenarioUnit;
  definition: UnitTypeDefinition;
  allocationKey?: string;
  sprite?: string;
}

export type RosterStatus = "frontline" | "reserve" | "support" | "casualty";

export interface RosterUnitSummary {
  readonly unitId: string;
  readonly unitKey: string | null;
  readonly label: string;
  readonly unitType: string;
  readonly unitClass: UnitClass;
  readonly strength: number;
  /** Battle experience value so roster panels can highlight veteran formations. */
  readonly experience: number;
  readonly ammo: number;
  /** Fuel is null for infantry or other unit classes that do not track fuel reserves. */
  readonly fuel: number | null;
  readonly morale: number | null;
  readonly location: string | null;
  readonly status: RosterStatus;
  readonly orders: readonly string[];
  readonly attachments: readonly string[];
  readonly tags: readonly string[];
  readonly combatPower: number;
  readonly sprite?: string;
}

export interface BattleRosterMetrics {
  readonly totalUnits: number;
  readonly frontline: number;
  readonly support: number;
  readonly reserve: number;
  readonly casualties: number;
  readonly combatPowerTotal: number;
  readonly reserveDepth: number;
}

export interface BattleRosterSnapshot {
  readonly updatedAt: string;
  readonly frontline: readonly RosterUnitSummary[];
  readonly support: readonly RosterUnitSummary[];
  readonly reserves: readonly RosterUnitSummary[];
  readonly casualties: readonly RosterUnitSummary[];
  readonly metrics: BattleRosterMetrics;
}

interface CasualtyRecord {
  readonly unit: ScenarioUnit;
  readonly definition: UnitTypeDefinition;
  readonly unitKey: string | null;
  readonly label: string;
  readonly recordedAt: string;
}

/**
 * Lightweight structure imported from the UI layer describing where a requisitioned unit should deploy.
 * Keeping this shape minimal allows the adapter to run both during initial setup and when restoring saves.
 */
export interface DeploymentPlacementInput {
  hex: Axial;
  unitKey: string;
}

/**
 * Transforms UI deployment decisions into `ScenarioUnit` payloads that the engine understands.
 * We validate that each placement references a registered template and that the resulting unit type exists
 * so bad configuration fails fast before mutating any engine state.
 */
export function buildScenarioUnitsFromAllocation(
  placements: readonly DeploymentPlacementInput[],
  templates: readonly DeploymentUnitTemplate[],
  unitTypes: UnitTypeDictionary
): ScenarioUnit[] {
  const templateMap = new Map<string, DeploymentUnitTemplate>();
  templates.forEach((template) => templateMap.set(template.key, template));
  return placements.map((placement) => {
    const template = templateMap.get(placement.unitKey);
    if (!template) {
      throw new Error(`No deployment template registered for key '${placement.unitKey}'.`);
    }

    if (!unitTypes[template.type as keyof UnitTypeDictionary]) {
      throw new Error(`Unit type '${template.type}' is not defined in the unit dictionary.`);
    }
    return {
      type: template.type as ScenarioUnit["type"],
      hex: structuredClone(placement.hex),
      strength: template.strength,
      experience: template.experience,
      ammo: template.ammo,
      fuel: template.fuel,
      entrench: template.entrench,
      facing: template.facing
    };
  });
}

/**
 * Snapshot of combat resolution used by UI odds preview panels. Including attacker/defender references
 * allows the UI to correlate the result with map selections.
 */
export interface CombatPreview {
  attacker: ScenarioUnit;
  defender: ScenarioUnit;
  result: AttackResult;
  commander: CommanderBenefits;
  damageMultiplier: number;
  suppressionMultiplier: number;
  finalDamagePerHit: number;
  finalExpectedDamage: number;
  finalExpectedSuppression: number;
  expectedRetaliation: number;
  retaliationPossible: boolean;
  retaliationNote?: string;
}

/**
 * Categorizes a support asset by operational readiness. The UI uses this grouping to render distinct
 * sections (ready queue, cooldown, maintenance) inside the support panel.
 */
export type SupportAssetStatus = "ready" | "queued" | "cooldown" | "maintenance";

/**
 * Minimal description of a support capability that the UI can render without touching engine internals.
 * The structure intentionally mirrors the plan in PLAN_battle_Support.md so subsequent wiring remains
 * predictable.
 */
export interface SupportAssetSnapshot {
  readonly id: string;
  readonly label: string;
  readonly type: "artillery" | "air" | "engineering" | "medical" | "other";
  readonly status: SupportAssetStatus;
  readonly charges: number;
  readonly maxCharges: number;
  readonly cooldown: number;
  readonly maxCooldown: number;
  readonly assignedHex: string | null;
  readonly notes: string | null;
  readonly queuedHex: string | null;
}

/**
 * Aggregated snapshot structure consumed by battle UI components to render the Support panel.
 * Sections are grouped by readiness so cards can be slotted directly into the planned layout.
 */
export interface SupportSnapshot {
  readonly updatedAt: string;
  readonly ready: readonly SupportAssetSnapshot[];
  readonly queued: readonly SupportAssetSnapshot[];
  readonly cooldown: readonly SupportAssetSnapshot[];
  readonly maintenance: readonly SupportAssetSnapshot[];
  readonly metrics: SupportSnapshotMetrics;
}

/**
 * Derived support metrics shown above the capability board (e.g., asset readiness counts, average cooldown).
 */
export interface SupportSnapshotMetrics {
  readonly totalAssets: number;
  readonly ready: number;
  readonly queued: number;
  readonly cooldown: number;
  readonly maintenance: number;
  readonly totalCharges: number;
  readonly actionsQueued: number;
  readonly averageCooldown: number | null;
}

export interface SupportImpactEvent {
  readonly assetId: string;
  readonly label: string;
  readonly targetHex: Axial;
  readonly targetFaction: TurnFaction;
  readonly hit: boolean;
  readonly damage: number;
  readonly destroyed: boolean;
  readonly targetUnitType?: ScenarioUnit["type"];
}

/**
 * Internal mutable representation of a support asset. The engine retains write access to these records
 * so status, charge counts, and queued targets can be updated in place without exposing mutation to the UI.
 */
interface InternalSupportAsset {
  id: string;
  label: string;
  type: SupportAssetSnapshot["type"];
  status: SupportAssetStatus;
  charges: number;
  maxCharges: number;
  cooldown: number;
  maxCooldown: number;
  assignedHex: string | null;
  notes: string | null;
  queuedHex: string | null;
}

/**
 * Supply view surfaced back to the UI each turn. The engine recomputes it when the supply tick runs so
 * the UI can highlight units that suffered attrition.
 */
export interface SupplyTickReport {
  faction: TurnFaction;
  outOfSupply: ScenarioUnit[];
}

/**
 * Enumerates the consumable resource pools surfaced in the supplies sidebar.
 * The player-facing plan focuses on ammunition, fuel, and placeholders for future medical/emergency data.
 */
export type SupplyResourceKey = "ammo" | "fuel" | "medical" | "emergency";

/**
 * Aggregated metrics describing the status of a single consumable category.
 * Totals are split between frontline and reserve forces so commanders can gauge distribution.
 */
export interface SupplyCategorySnapshot {
  /** Resource identifier tied to UI copy and icons. */
  resource: SupplyResourceKey;
  /** Human-readable label presented in the UI. */
  label: string;
  /** Combined inventory across frontline and reserves. */
  total: number;
  /** Stock currently attached to deployed frontline units. */
  frontlineTotal: number;
  /** Stock retained by reserve formations. */
  reserveTotal: number;
  /** Stockpile retained in depots and logistics caches. */
  stockpileTotal: number;
  /** Average stock per unit to highlight distribution health. */
  averagePerUnit: number;
  /** Consumption delta compared to the previous recorded snapshot. */
  consumptionPerTurn: number;
  /** Estimated remaining turns before depletion at the observed burn rate. */
  estimatedDepletionTurns: number | null;
  /** Rolling history used to render simple sparkline trend visuals. */
  trend: number[];
  /**
   * Qualitative status flag feeding UI color coding.
   * "unknown" indicates placeholder categories lacking live engine data.
   */
  status: "stable" | "warning" | "critical" | "unknown";
  /** Optional contextual notes (used for medical/emergency placeholders). */
  notes?: string;
}

/**
 * Structured alert message emitted when a supply category drops below plan thresholds.
 */
export interface SupplyAlert {
  resource: SupplyResourceKey;
  level: "info" | "warning" | "critical";
  message: string;
}

/**
 * Snapshot of overall faction supply posture at a specific turn.
 * The supplies panel consumes this payload to render totals, trends, and alerts.
 */
export interface SupplySnapshot {
  faction: TurnFaction;
  turn: number;
  phase: BattlePhase;
  updatedAt: string;
  categories: SupplyCategorySnapshot[];
  alerts: SupplyAlert[];
  /** Aggregate depot stock levels surfaced separately from unit-held munitions. */
  stockpile: {
    ammo: number;
    fuel: number;
    rations: number;
    parts: number;
  };
  /** Rolling ledger entries capturing production, shipments, and consumption deltas. */
  ledger: readonly SupplyLedgerEntry[];
}

export interface LogisticsSupplySource {
  key: string;
  label: string;
  connectedUnits: number;
  throughput: number;
  utilization: number;
  averageTravelHours: number;
  bottleneck: string | null;
}

export interface LogisticsStockpileEntry {
  resource: "ammo" | "fuel" | "parts";
  total: number;
  averagePerUnit: number;
  trend: "rising" | "stable" | "falling";
}

export type SupplyPriority = "critical" | "high" | "normal" | "low";

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

export interface LogisticsDelayNode {
  node: string;
  risk: "low" | "medium" | "high";
  reason: string;
}

export interface LogisticsMaintenanceEntry {
  unitKey: string;
  issue: string;
  pendingTurns: number;
}

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

export interface LogisticsAlertEntry {
  level: "info" | "warning" | "critical";
  message: string;
}

export interface LogisticsSnapshot {
  turn: number;
  deployedUnits: number;
  connectedUnits: number;
  isolatedUnits: number;
  convoyUnits: number;
  loadedConvoys: number;
  convoyCargo: {
    ammo: number;
    fuel: number;
  };
  depotStock: {
    ammo: number;
    fuel: number;
    parts: number;
  };
  supplySources: LogisticsSupplySource[];
  stockpiles: LogisticsStockpileEntry[];
  convoyStatuses: LogisticsConvoyStatusEntry[];
  priorityTargets: LogisticsPriorityEntry[];
  delayNodes: LogisticsDelayNode[];
  maintenanceBacklog: LogisticsMaintenanceEntry[];
  alerts: LogisticsAlertEntry[];
}

interface MovementPathSummary {
  cost: number;
  fuelCost: number;
  steps: number;
  roadSteps: number;
  offroadSteps: number;
}

interface MovementPathPlan {
  path: Axial[];
  summary: MovementPathSummary;
}

interface SupplyTruckState {
  unitId: string;
  ammoCargo: number;
  fuelCargo: number;
  status: "loading" | "delivering" | "returning" | "idle" | "blocked";
  assignedUnitId: string | null;
}

interface SupplyDemandEntry {
  unit: ScenarioUnit;
  definition: UnitTypeDefinition;
  priority: SupplyPriority;
  ammoNeed: number;
  fuelNeed: number;
  directEligible: boolean;
  assignmentCount: number;
  status: LogisticsPriorityEntry["status"];
}

/**
 * Structured combat resolution payload returned to the UI layer after an attack.
 * Bundles the raw `AttackResult` math along with high-level flags so announcements
 * and animations can react without re-deriving game state deltas.
 */
export interface AttackResolution {
  readonly result: AttackResult;
  readonly defenderRemainingStrength: number;
  readonly defenderDestroyed: boolean;
  readonly retaliationResult?: AttackResult;
  readonly attackerRemainingStrength?: number;
  readonly retaliationOccurred: boolean;
  readonly retaliationNote?: string;
}

/** Summary of bot actions executed during its automated turn. */
export interface BotTurnSummary {
  readonly moves: readonly BotMoveSummary[];
  readonly attacks: readonly BotAttackSummary[];
  readonly supplyReport: SupplyTickReport | null;
}

/** Detailed combat engagement report for battle analysis. */
export interface CombatReportEntry {
  readonly id: string;
  readonly turn: number;
  readonly timestamp: string;
  readonly attacker: {
    readonly faction: TurnFaction;
    readonly unitType: string;
    readonly position: Axial;
    readonly strengthBefore: number;
    readonly strengthAfter: number;
  };
  readonly defender: {
    readonly faction: TurnFaction;
    readonly unitType: string;
    readonly position: Axial;
    readonly strengthBefore: number;
    readonly strengthAfter: number;
    readonly destroyed: boolean;
  };
  readonly attackResult: {
    readonly damage: number;
    readonly terrainDefense: number;
    readonly accuracyMod: number;
    readonly range: number;
    readonly los: boolean;
  };
  readonly retaliation?: {
    readonly damage: number;
    readonly terrainDefense: number;
    readonly accuracyMod: number;
    readonly attackerStrengthAfter: number;
  };
}

/**
 * Concise sortie report recorded every time an air mission resolves. Mirrors combat reports so planners can
 * narrate air activity without re-inspecting engine state.
 */
export interface AirMissionReportEntry {
  readonly id: string;
  readonly missionId: string;
  readonly turnResolved: number;
  readonly timestamp: string;
  readonly faction: TurnFaction;
  readonly unitType: string;
  readonly unitKey: string;
  readonly kind: AirMissionKind;
  readonly outcome?: AirMissionOutcome;
  readonly targetHex?: Axial;
  readonly escortTargetUnitKey?: string;
  /** Number of hostile sorties intercepted during this mission's coverage window. */
  readonly interceptions?: number;
  /** Optional event tag for non-resolution entries (e.g., refit start/finish). Defaults to 'resolved' when undefined. */
  readonly event?: "resolved" | "refitStarted" | "refitCompleted";
  /** Tally of aircraft destroyed during this mission's engagements. */
  readonly kills?: { escorts?: number; cap?: number };
  /** Total percentage strength lost by the bomber due to interceptions (strike missions). */
  readonly bomberAttrition?: number;
  /** Freeform notes for UI log rendering. */
  readonly notes?: string[];
}

/** Describes a single bot movement so UI layers can narrate progress. */
export interface BotMoveSummary {
  readonly unitType: string;
  readonly from: Axial;
  readonly to: Axial;
  /**
   * Ordered list of axial coordinates visited during this move, including the starting hex and every intermediate step.
   * Consumers can animate step-by-step while keeping the sprite hidden until the final hex is reached.
   */
  readonly path: readonly Axial[];
  /** Total number of hexes traversed during this move. */
  readonly distance: number;
  /** Suggested animation duration in frames or milliseconds derived from distance (minimum of one). */
  readonly duration: number;
}

/** Describes a single bot attack for announcement and analytics. */
export interface BotAttackSummary {
  readonly attackerType: string;
  readonly defenderType: string;
  readonly from: Axial;
  readonly target: Axial;
  readonly inflictedDamage: number;
  readonly defenderDestroyed: boolean;
  readonly retaliation?: {
    readonly damage: number;
    readonly terrainDefense: number;
    readonly accuracyMod: number;
    readonly attackerStrengthAfter: number;
  };
}

/** Lifecycle markers for air missions so UI widgets can narrate sortie progress consistently. */
export type AirMissionStatus = "queued" | "inFlight" | "resolving" | "completed";

/** Result buckets emitted once an air mission resolves. */
type AirMissionResult = "success" | "partial" | "aborted";

/** Shared outcome fields that every mission report surfaces to the UI layer. */
interface AirMissionOutcomeBase {
  readonly type: AirMissionKind;
  readonly result: AirMissionResult;
  readonly details: string;
  readonly refitRequired: boolean;
  /** Optional engagement metrics used by sortie logs and HUD summaries. */
  readonly meta?: {
    readonly capIntercepts?: number;
    readonly capKills?: number;
    readonly escortsEngaged?: number;
    readonly escortsWins?: number;
    readonly bomberAttrition?: number;
  };
}

/** Mission-specific outcome payload surfaced to sortie logs and planners. */
type AirMissionOutcome =
  | (AirMissionOutcomeBase & {
      readonly type: "strike";
      readonly damageInflicted?: number;
      readonly defenderDestroyed?: boolean;
      readonly defenderType?: string;
    })
  | (AirMissionOutcomeBase & {
      readonly type: "escort";
      readonly interceptions?: number;
      readonly protectedUnitKey?: string;
    })
  | (AirMissionOutcomeBase & {
      readonly type: "airCover";
      readonly interceptions?: number;
      readonly protectedHex?: Axial;
    })
  | (AirMissionOutcomeBase & {
      readonly type: "airTransport";
      readonly droppedUnitType?: string;
      readonly droppedHex?: Axial;
    });

/** Serialized mission payload stored in saves and surfaced to planning UI layers. */
export interface SerializedAirMission {
  readonly id: string;
  readonly kind: AirMissionKind;
  readonly faction: TurnFaction;
  /** Stable squadron identifier (unitId) so resolution can find the unit even when multiple squadrons share a base. */
  readonly unitKey: string;
  /** Origin hex key for airbase capacity tracking and animation starting positions. */
  readonly originHexKey?: string;
  readonly unitType: string;
  readonly status: AirMissionStatus;
  readonly launchTurn: number;
  readonly turnsRemaining: number;
  readonly targetHex?: Axial;
  readonly targetUnitKey?: string;
  readonly escortTargetUnitKey?: string;
  readonly interceptions?: number;
  readonly outcome?: AirMissionOutcome;
}

/** Lightweight mission arrival used by UI to visualize sorties beginning their patrol/strike. */
export interface AirMissionArrival {
  readonly missionId: string;
  readonly faction: TurnFaction;
  readonly unitKey: string;
  readonly originHexKey?: string;
  readonly unitType: string;
  readonly kind: AirMissionKind;
  readonly targetHex?: Axial;
  readonly targetUnitKey?: string;
  readonly escortTargetUnitKey?: string;
}

/**
 * UI-facing event emitted when air-to-air combat occurs during mission resolution.
 * Allows the battle screen to animate bombers continuing to target while fighters/interceptors converge and engage.
 */
export interface AirEngagementEvent {
  readonly type: "airToAir";
  readonly location: Axial;
  readonly bomber: { readonly faction: TurnFaction; readonly unitKey: string; readonly unitType: string };
  readonly interceptors: ReadonlyArray<{ readonly faction: TurnFaction; readonly unitKey: string; readonly unitType: string }>;
  readonly escorts: ReadonlyArray<{ readonly faction: TurnFaction; readonly unitKey: string; readonly unitType: string }>;
}

/** Captures ongoing refit timers so hydration can restore readiness cycles after sorties. */
interface SerializedAirMissionRefit {
  readonly missionId: string;
  readonly unitKey: string;
  readonly faction: TurnFaction;
  readonly remaining: number;
}

/** Request payload accepted by `scheduleAirMission` when the UI queues a sortie. */
export interface ScheduleAirMissionInput {
  readonly kind: AirMissionKind;
  readonly faction: TurnFaction;
  readonly unitHex: Axial;
  readonly targetHex?: Axial;
  readonly escortTargetHex?: Axial;
}

/** Internal representation retains the mission template for validation without re-searching the catalog. */
interface ScheduledAirMission {
  readonly id: string;
  readonly template: AirMissionTemplate;
  readonly faction: TurnFaction;
  /** Stable squadron identifier (unitId) so resolution can find the unit even when multiple squadrons share a base. */
  readonly unitKey: string;
  /** Origin hex key for airbase capacity tracking and animation starting positions. */
  readonly originHexKey?: string;
  readonly unitType: string;
  status: AirMissionStatus;
  launchTurn: number;
  turnsRemaining: number;
  targetHex?: Axial;
  targetUnitKey?: string;
  escortTargetUnitKey?: string;
  interceptions: number;
  outcome?: AirMissionOutcome;
}

/** Arguments provided to the interception helper so we can reuse it across player, bot, and mission-driven attacks. */
interface _AirInterceptionContext {
  readonly interceptorFaction: TurnFaction;
  readonly attackerFaction: TurnFaction;
  readonly attackerHex: Axial;
  readonly attackerKey: string;
  readonly defenderHex: Axial;
  readonly defenderKey?: string;
  readonly attackerUnit: ScenarioUnit;
  readonly defenderUnit?: ScenarioUnit | null;
  readonly source: "playerAttack" | "botAttack" | "missionStrike";
}

/** Outcome emitted by the interception helper so callers know whether to abort the pending attack. */
interface _AirInterceptionResult {
  readonly intercepted: boolean;
  readonly attackerDestroyed: boolean;
  readonly updatedAttacker?: ScenarioUnit;
  readonly message?: string;
}

/** Returns the scheduled mission entries providing direct escort for the specified protected unit. */
const missionIsProtectingUnit = (mission: ScheduledAirMission, unitKey: string): boolean => {
  return mission.template.kind === "escort" && mission.escortTargetUnitKey === unitKey && mission.status === "inFlight";
};

/** Returns active air cover missions guarding the provided hex key.
 *  Supports base CAP: if no targetHex is set, the mission covers its originHexKey. */
const _missionIsCoveringHex = (mission: ScheduledAirMission, hexKey: string): boolean => {
  if (mission.template.kind !== "airCover" || mission.status !== "inFlight") {
    return false;
  }
  // If a target hex is explicitly set, check against it.
  if (mission.targetHex !== undefined) {
    return axialKey(mission.targetHex) === hexKey;
  }
  // Base CAP: no target hex means the mission covers the squadron's origin hex.
  if (mission.originHexKey) {
    return mission.originHexKey === hexKey;
  }
  return false;
};

/**
 * Convenience bundle describing a player's movement action so the UI can
 * refresh selection state without querying the engine again.
 */
export interface MoveResolution {
  readonly unit: ScenarioUnit;
  readonly from: Axial;
  readonly to: Axial;
}

/**
 * Shape returned from `GameEngineState.serialize()` to standardize persistence hooks. Keeping it
 * distinct from the internal class allows us to exclude ephemeral caches (combat previews, LOS
 * memoization).
 */
export interface SerializedBattleState {
  phase: BattlePhase;
  activeFaction: TurnFaction;
  turnNumber: number;
  baseCamp: BaseCamp | null;
  playerPlacements: ScenarioUnit[];
  botPlacements: ScenarioUnit[];
  reserves: ScenarioUnit[];
  /** Airborne reserves are separate from ground reserves; loaded at the airbase for air transport. */
  airborneReserves?: ScenarioUnit[];
  airMissions?: SerializedAirMission[];
  airMissionRefits?: SerializedAirMissionRefit[];
  airMissionReports?: AirMissionReportEntry[];
  reconIntelSnapshot?: ReconIntelSnapshot;
  counterIntelOperations?: SerializedCounterIntelOperation[];
  intelBriefStates?: SerializedReconIntelBriefState[];
  counterIntelResources?: SerializedCounterIntelResources;
  counterIntelIdCounter?: number;
  enemyContactStates?: SerializedEnemyContactState[];
  hexModifications?: HexModification[];
}

export type EnemyContactState = "spotted" | "identified" | "visible";

export interface EnemyContactSnapshot {
  unitId: string;
  hex: Axial;
  state: EnemyContactState;
  lastSeenTurn: number;
  source: string;
  unitType?: ScenarioUnit["type"];
  strengthEstimate?: number;
}

export type UnitSuppressionState = "clear" | "suppressed" | "pinned";

export interface UnitCommandState {
  readonly unitId: string;
  readonly unitType: ScenarioUnit["type"];
  readonly isAutomated: boolean;
  readonly isEngineer: boolean;
  readonly entrenchment: number;
  readonly maxEntrenchment: number;
  readonly suppressionState: UnitSuppressionState;
  readonly suppressorCount: number;
  readonly existingHexModification: HexModification | null;
  readonly canDigIn: boolean;
  readonly digInReason: string | null;
  readonly canBuildModification: boolean;
  readonly buildReason: string | null;
}

interface InternalEnemyContactState {
  unitId: string;
  state: EnemyContactState;
  lastSeenTurn: number;
  lastKnownHex: Axial;
  lastKnownStrength: number | null;
  knownUnitType: ScenarioUnit["type"] | null;
  source: string;
}

interface SerializedEnemyContactState {
  unitId: string;
  state: EnemyContactState;
  lastSeenTurn: number;
  lastKnownHex: Axial;
  lastKnownStrength: number | null;
  knownUnitType: ScenarioUnit["type"] | null;
  source: string;
}

interface InternalCounterIntelOperation {
  id: string;
  faction: TurnFaction;
  targetHex: Axial;
  radius: number;
  remainingTurns: number;
  strength: number;
}

interface InternalReconIntelBriefState {
  briefId: string;
  isFalse: boolean;
  verificationStatus: ReconIntelVerificationStatus;
}

interface SerializedCounterIntelOperation {
  id: string;
  faction: TurnFaction;
  targetHex: Axial;
  radius: number;
  remainingTurns: number;
  strength: number;
}

interface SerializedReconIntelBriefState {
  briefId: string;
  isFalse: boolean;
  verificationStatus: ReconIntelVerificationStatus;
}

interface SerializedCounterIntelResources {
  deceptionCharges: number;
  verificationCharges: number;
}

interface CounterIntelResources {
  deceptionCharges: number;
  verificationCharges: number;
}

interface BotPerceivedTarget {
  hex: Axial;
  bias: number;
  isDeception: boolean;
  id: string;
}

/**
 * Wrapper bundling all read-only data needed to bootstrap a battle. Instantiations of `GameEngine`
 * receive this payload once and then mutate their own state while the canonical scenario data remains
 * untouched.
 */
export interface GameEngineConfig {
  scenario: ScenarioData;
  unitTypes: UnitTypeDictionary;
  terrain: TerrainDictionary;
  playerSide: ScenarioSide;
  botSide: ScenarioSide;
  /** Optional ally faction side. When present, ally units are AI-controlled but can be transferred to player control. */
  allySide?: ScenarioSide;
  /** Optional override that selects the tactical planner driving enemy turns. Defaults to "Heuristic". */
  botStrategyMode?: BotStrategyMode;
  /** Optional per-hex airbase capacity cap. If provided, tryScheduleAirMission enforces max queued departures per hex. */
  airbaseCapacities?: Record<string, number>;
  /** Difficulty setting for bot AI (Easy, Normal, Hard). Affects bot decision-making and combat modifiers. */
  botDifficulty?: BotDifficulty;
}

/**
 * Public interface returned to the UI layer. The UI interacts with the engine through these methods to
 * perform deployment, advance turns, and request combat previews.
 */
export interface GameEngineAPI {
  readonly phase: BattlePhase;
  readonly turnNumber: number;
  readonly activeFaction: TurnFaction;
  readonly baseCamp: BaseCamp | null;
  readonly playerUnits: ScenarioUnit[];
  readonly botUnits: ScenarioUnit[];
  readonly allyUnits: ScenarioUnit[];
  readonly reserveUnits: ReserveUnit[];
  readonly supportAssets: SupportAssetSnapshot[];
  /** Transfers an ally unit at the specified hex to player control. Returns true on success. */
  transferAllyControl(hex: Axial): boolean;
  getSupplySnapshot(faction?: TurnFaction): SupplySnapshot;
  getSupplyHistory(faction?: TurnFaction): SupplySnapshot[];
  getEnemyContactSnapshot(): EnemyContactSnapshot[];
  getReconIntelSnapshot(): ReconIntelSnapshot;
  deployCounterIntel(targetHex: Axial): { ok: true; operationId: string } | { ok: false; reason: string };
  verifyIntelBrief(briefId: string): { ok: true; status: ReconIntelVerificationStatus } | { ok: false; reason: string };
  getSupportSnapshot(): SupportSnapshot;
  beginDeployment(): void;
  setQueuedAllocations(entries: readonly PendingReserveRequest[]): void;
  populateReservesFromPlayerUnits(): void;
  setBaseCamp(hex: Axial): void;
  deployUnit(hex: Axial, reserveIndex: number): void;
  deployUnitByKey(hex: Axial, unitKey: string): void;
  recallUnit(hex: Axial): void;
  recallUnitByHexKey(hexKey: string): void;
  moveToReserves(hex: Axial): void;
  finalizeDeployment(): ReserveUnit[];
  startPlayerTurnPhase(): void;
  callUpReserveByKey(unitKey: string, hex: Axial): void;
  callUpReserve(reserveIndex: number, hex: Axial): void;
  endTurn(): SupplyTickReport | null;
  previewAttack(attackerHex: Axial, defenderHex: Axial, stance?: CombatStance): CombatPreview | null;
  moveUnit(from: Axial, to: Axial): MoveResolution;
  attackUnit(attackerHex: Axial, defenderHex: Axial, stance?: CombatStance): AttackResolution | null;
  toggleRushMode(hex: Axial): boolean;
  getReachableHexes(origin: Axial): Axial[];
  getMovementBudget(origin: Axial): MovementBudget | null;
  getAttackableTargets(attackerHex: Axial): Axial[];
  listAirMissionTemplates(): readonly AirMissionTemplate[];
  getScheduledAirMissions(faction?: TurnFaction): readonly SerializedAirMission[];
  getAirMissionReports(): readonly AirMissionReportEntry[];
  consumeAirMissionArrivals(): AirMissionArrival[];
  scheduleAirMission(request: ScheduleAirMissionInput): string;
  /** Structured scheduling that does not throw; returns an id on success or a code/reason on failure. */
  tryScheduleAirMission(request: ScheduleAirMissionInput): { ok: true; missionId: string } | { ok: false; code: ScheduleAirMissionErrorCode; reason: string };
  /** Lightweight counts for HUD summary widgets. */
  getAirSupportSummary(): { queued: number; inFlight: number; resolving: number; completed: number; refit: number };
  /** Returns the aircraft's combat radius in hexes for the active faction at the given hex, or null if not an aircraft. */
  getAircraftCombatRadiusHex(origin: Axial): number | null;
  /** Returns refit turns for the aircraft at the given hex (active faction), or null if not an aircraft. */
  getAircraftRefitTurns(origin: Axial): number | null;
  /** Cancels a queued air mission for the active faction. Returns true if a mission was canceled. */
  cancelQueuedAirMission(missionId: string): boolean;
  consumeSupportImpactEvents(): SupportImpactEvent[];
  serialize(): SerializedBattleState;
  initializeFromAllocations(units: ScenarioUnit[]): void;
  hydrateFromSerialized(state: SerializedBattleState): void;
  getPlayerPlacementsSnapshot(): ScenarioUnit[];
  getReserveSnapshot(): ReserveUnit[];
  getTurnSummary(): TurnSummary;
  getLogisticsSnapshot(): LogisticsSnapshot;
  setSupplyPriority(unitId: string, priority: SupplyPriority): boolean;
  getCombatReports(): readonly CombatReportEntry[];
  queueSupportAction(assetId: string, targetHex: Axial): void;
  queueSupportActionFromUnit(callerHex: Axial, assetId: string, targetHex: Axial): boolean;
  cancelQueuedSupport(assetId: string): void;
  consumeBotTurnSummary(): BotTurnSummary | null;
  transferAllyControl(hex: Axial): boolean;
  digInUnit(hex: Axial): boolean;
  buildHexModification(hex: Axial, type: HexModificationType): boolean;
  getHexModification(hex: Axial): HexModification | null;
  getHexModificationSnapshots(): HexModification[];
  getUnitCommandState(hex: Axial): UnitCommandState | null;
}

/**
 * Requisition metadata handed off by precombat flows so the engine can rebuild its reserve queue.
 */
export interface PendingReserveRequest {
  readonly unitKey: string;
  readonly count: number;
  readonly label: string;
  readonly sprite?: string;
}

const UNIT_CLASS_VALUES: readonly UnitClass[] = ["infantry", "specialist", "vehicle", "tank", "artillery", "air", "recon"] as const;

function normalizeUnitClass(value: string | undefined, key: string): UnitClass {
  if (!value) {
    throw new Error(`Unit '${key}' is missing a class designation.`);
  }
  if (UNIT_CLASS_VALUES.includes(value as UnitClass)) {
    return value as UnitClass;
  }
  throw new Error(`Unit '${key}' declares unsupported class '${value}'.`);
}

/**
 * Core engine class managing mutable battle state. It exposes a narrow API tailored to the existing UI
 * scaffolding so migration can proceed incrementally.
 */
export class GameEngine implements GameEngineAPI {
  /** Conversion factor mapping a single hex (250m) into kilometers for range validation. */
  private static readonly KILOMETERS_PER_HEX = 0.25;
  private static readonly AIR_COVER_PATROL_RADIUS_HEX = 12;
  private static readonly ENEMY_CONTACT_MEMORY_TURNS = 2;
  private static readonly RECON_SPOTTING_RANGE_BONUS = 2;
  private static readonly AIR_SPOTTING_RANGE_BONUS = 2;
  private static readonly COUNTER_INTEL_MAX_DECEPTION_CHARGES = 2;
  private static readonly COUNTER_INTEL_MAX_VERIFICATION_CHARGES = 2;
  private static readonly COUNTER_INTEL_OPERATION_DURATION_TURNS = 3;
  private static readonly COUNTER_INTEL_OPERATION_RADIUS = 2;
  private static readonly COUNTER_INTEL_OPERATION_STRENGTH = 3;
  private static readonly DEFAULT_FALSE_INTEL_BRIEF_IDS = new Set<string>(["brief-phantom"]);
  /** Maximum number of historical entries retained per faction for trend math. */
  private static readonly SUPPLY_HISTORY_LIMIT = 12;
  /** Optional per-hex capacity caps for airbase launch queues provided by config. */
  private readonly airbaseCapMap: Record<string, number> | null = null;
  /** Number of turns graphed in the mini trend sparkline shown in the supplies sidebar. */
  private static readonly SUPPLY_TREND_WINDOW = 4;
  /** Scenario blueprint retained for terrain lookups and unit cloning. */
  private readonly scenario: ScenarioData;

  /** Unit lookup table used to clone definitions when building combat states. */
  private readonly unitTypes: UnitTypeDictionary;

  /** Terrain dictionary required to translate palette entries into movement/LOS properties. */
  private readonly terrain: TerrainDictionary;

  /** Player-facing and AI-facing scenario slices kept immutable to derive fresh unit instances. */
  private readonly playerSide: ScenarioSide;
  private readonly botSide: ScenarioSide;
  private readonly allySide: ScenarioSide | null;

  /** Cache of deployed units on the battle map keyed by hex coordinate. */
  private readonly playerPlacements: UnitPlacementMap = new Map();
  private readonly botPlacements: UnitPlacementMap = new Map();
  private readonly allyPlacements: UnitPlacementMap = new Map();

  /** Hex modifications built by engineers (tank traps, fortifications, cleared paths). */
  private readonly hexModifications: Map<string, HexModification> = new Map();

  /** Units not deployed at battle start; accessible via reserve UI. */
  private readonly reserves: ReserveUnit[] = [];

  /** Airborne infantry reserves for air transport missions; separate from ground reserves.
   *  These units are loaded at the airbase, not at the base camp. */
  private readonly airborneReserves: ReserveUnit[] = [];

  /** Controls which tactical planner drives the bot's behavior. */
  private readonly botStrategyMode: BotStrategyMode;

  /** Difficulty level for bot AI decision-making and combat modifiers. */
  private readonly botDifficulty: BotDifficulty;

  /** Combat engagement history for battle analysis and reporting. */
  private readonly combatReports: CombatReportEntry[] = [];
  private combatReportIdCounter = 0;

  /**
   * Support assets available to the commander. Stored as mutable records internally so cooldown math can
   * update them in place while the UI only receives defensive snapshots.
   */
  private readonly privateSupportAssets: InternalSupportAsset[] = [];

  /** Persistent casualty ledger feeding the roster casualty section. */
  private readonly casualtyLog: CasualtyRecord[] = [];

  /** Cached roster snapshot so UI layers can render without recomputing on every frame. */
  private cachedRosterSnapshot: BattleRosterSnapshot | null = null;

  /** Cached support snapshot mirroring readiness groups for the sidebar panel. */
  private cachedSupportSnapshot: SupportSnapshot | null = null;

  /**
   * Clears the cached roster snapshot so subsequent requests rebuild from live engine state.
   * Keeping this helper centralized ensures every mutation path stays consistent.
   */
  private invalidateRosterCache(): void {
    this.cachedRosterSnapshot = null;
  }

  /** Latest recon & intelligence fusion snapshot surfaced to battle UI panels. */
  private reconIntelSnapshot: ReconIntelSnapshot | null = null;
  private readonly counterIntelOperations: Map<string, InternalCounterIntelOperation> = new Map();
  private readonly intelBriefStates: Map<string, InternalReconIntelBriefState> = new Map();
  private playerCounterIntelResources: CounterIntelResources = {
    deceptionCharges: GameEngine.COUNTER_INTEL_MAX_DECEPTION_CHARGES,
    verificationCharges: GameEngine.COUNTER_INTEL_MAX_VERIFICATION_CHARGES
  };
  private counterIntelIdCounter = 0;

  /** Rolling supply ledger grouped by faction so consumption trends can be derived quickly. */
  private readonly supplyHistoryByFaction: Record<TurnFaction, SupplySnapshot[]> = {
    Player: [],
    Bot: [],
    Ally: []
  };

  /**
   * Clears the rolling supply history so fresh deployments do not retain stale trend lines.
   * Called whenever the engine is constructed or the scenario state is rehydrated from serialized data.
   */
  private resetSupplyHistory(): void {
    (Object.keys(this.supplyHistoryByFaction) as TurnFaction[]).forEach((faction) => {
      this.supplyHistoryByFaction[faction].length = 0;
    });
  }

  private resetCounterIntelState(): void {
    this.counterIntelOperations.clear();
    this.intelBriefStates.clear();
    this.playerCounterIntelResources = {
      deceptionCharges: GameEngine.COUNTER_INTEL_MAX_DECEPTION_CHARGES,
      verificationCharges: GameEngine.COUNTER_INTEL_MAX_VERIFICATION_CHARGES
    };
    this.counterIntelIdCounter = 0;
    this.reconIntelSnapshot = null;
  }

  /**
   * Recomputes faction supply ledgers from the current unit mirrors so stockpile math starts from a consistent baseline.
   */
  private rebuildSupplyStates(): void {
    (Object.keys(this.supplyStateByFaction) as TurnFaction[]).forEach((faction) => {
      this.supplyStateByFaction[faction] = this.createFactionSupplyState(faction);
    });
  }

  /**
   * Builds a fresh supply state seeded from the faction's onboard ammo/fuel totals and the configured production rates.
   */
  private createFactionSupplyState(faction: TurnFaction): SupplyState {
    const totals = this.calculateUnitStockTotals(faction);
    const ammoTotal = totals?.ammo ?? 0;
    const fuelTotal = totals?.fuel ?? 0;
    // Defensive guard: malformed supply mirrors can leave totals undefined; treat as zero stock to keep engine alive.
    const baselineAmmo = Math.max(0, Math.round(ammoTotal * supplyBalance.stockpileMultiplier.ammo));
    const baselineFuel = Math.max(0, Math.round(fuelTotal * supplyBalance.stockpileMultiplier.fuel));
    return createSupplyState({
      baseline: {
        ammo: baselineAmmo,
        fuel: baselineFuel,
        rations: 0,
        parts: 0
      },
      productionRate: {
        ammo: supplyBalance.production.ammo,
        fuel: supplyBalance.production.fuel,
        rations: 0,
        parts: 0
      },
      lastUpdatedTurn: this._turnNumber
    });
  }

  /**
   * Sums current ammo and fuel values for all supply-mirrored units controlled by the requested faction.
   */
  private calculateUnitStockTotals(faction: TurnFaction): { ammo: number; fuel: number } {
    const units = faction === "Player" ? this.playerSupply : faction === "Bot" ? this.botSupply : this.allySupply;
    return units.reduce<{ ammo: number; fuel: number }>((accumulator, unit, index) => {
      if (!unit) {
        console.warn("[GameEngine] calculateUnitStockTotals skipped null supply entry", { faction, index });
        return accumulator;
      }

      // Treat missing ammo/fuel as zero so malformed mirrors cannot crash supply seeding.
      accumulator.ammo += unit.ammo ?? 0;
      accumulator.fuel += unit.fuel ?? 0;
      return accumulator;
    }, { ammo: 0, fuel: 0 });
  }

  /** Validates that the requested target lies within the squadron's combat radius. */
  private assertAirMissionRange(profile: AirSupportProfile, origin: Axial, target: Axial): void {
    const distance = hexDistance(origin, target);
    const kilometers = distance * GameEngine.KILOMETERS_PER_HEX;
    if (kilometers > profile.combatRadiusKm + 1e-6) {
      throw new Error("Mission target lies beyond this squadron's combat radius.");
    }
  }

  /** Escorts must remain close enough to the package they are protecting to remain effective. */
  private assertEscortDistance(profile: AirSupportProfile, origin: Axial, escortTarget: Axial): void {
    const distance = hexDistance(origin, escortTarget);
    const kilometers = distance * GameEngine.KILOMETERS_PER_HEX;
    if (kilometers > profile.combatRadiusKm + 1e-6) {
      throw new Error("Escort assignment exceeds the squadron's patrol radius.");
    }
  }

  /** Retrieve the mission template for the requested kind or throw so callers fail fast. */
  private getAirMissionTemplate(kind: AirMissionKind): AirMissionTemplate {
    const template = this.airMissionCatalog.find((entry) => entry.kind === kind);
    if (!template) {
      throw new Error(`Unsupported air mission kind '${kind}'.`);
    }
    return template;
  }

  /**
   * Derives a new mission id while keeping counters monotonic so restored saves do not collide with live ids.
   */
  private nextAirMissionId(): string {
    this.airMissionIdCounter += 1;
    return `air-mission-${this.airMissionIdCounter}`;
  }

  /** Serialize mission state into a lightweight snapshot safe for persistence and UI consumers. */
  private serializeAirMission(mission: ScheduledAirMission): SerializedAirMission {
    return {
      id: mission.id,
      kind: mission.template.kind,
      faction: mission.faction,
      unitKey: mission.unitKey,
      originHexKey: mission.originHexKey,
      unitType: mission.unitType,
      status: mission.status,
      launchTurn: mission.launchTurn,
      turnsRemaining: mission.turnsRemaining,
      targetHex: mission.targetHex ? structuredClone(mission.targetHex) : undefined,
      targetUnitKey: mission.targetUnitKey,
      escortTargetUnitKey: mission.escortTargetUnitKey,
      interceptions: mission.interceptions,
      outcome: mission.outcome ? structuredClone(mission.outcome) : undefined
    } satisfies SerializedAirMission;
  }

  /** Restore scheduled sorties from serialized state so hydration preserves pending missions. */
  private restoreAirMission(entry: SerializedAirMission): void {
    const template = this.getAirMissionTemplate(entry.kind);
    const mission: ScheduledAirMission = {
      id: entry.id,
      template,
      faction: entry.faction,
      unitKey: entry.unitKey,
      originHexKey: entry.originHexKey,
      unitType: entry.unitType,
      status: entry.status,
      launchTurn: entry.launchTurn,
      turnsRemaining: entry.turnsRemaining,
      targetHex: entry.targetHex ? structuredClone(entry.targetHex) : undefined,
      targetUnitKey: entry.targetUnitKey,
      escortTargetUnitKey: entry.escortTargetUnitKey,
      interceptions: entry.interceptions ?? 0,
      outcome: entry.outcome ? structuredClone(entry.outcome) : undefined
    };

    this.scheduledAirMissions.set(mission.id, mission);

    // The unitKey is now the stable squadronId (unitId), so use it directly for assignment tracking.
    // For legacy saves where unitKey was a hex key, try to look up the unit and get its squadronId.
    let assignmentKey = mission.unitKey;
    if (mission.unitKey.includes(",") && !mission.unitKey.startsWith("u_")) {
      // Legacy format: unitKey is a hex coordinate like "0,0" - try to find the unit and get its squadronId.
      try {
        const origin = GameEngine.parseAxialKey(mission.unitKey);
        const unit = this.lookupUnit(origin, mission.faction, true);
        if (unit) {
          assignmentKey = this.getSquadronId(unit);
        }
      } catch {
        // Fall back to the stored unit key if lookups fail; scheduling guards remain defensive.
      }
    }
    this.airMissionAssignmentsByUnit.set(assignmentKey, mission.id);
    this.syncAirMissionCounterFromId(mission.id);
  }

  /** Keeps the autogenerated id counter aligned with any ids encountered during hydration. */
  private syncAirMissionCounterFromId(missionId: string): void {
    const match = /^(?:air-mission-)(\d+)$/.exec(missionId);
    if (!match) {
      return;
    }
    const value = Number.parseInt(match[1], 10);
    if (!Number.isNaN(value)) {
      this.airMissionIdCounter = Math.max(this.airMissionIdCounter, value);
    }
  }

  /** Clears the assignment lock for the squadron flying the specified mission, if present. */
  private clearAirMissionAssignment(mission: ScheduledAirMission): void {
    for (const [squadronId, missionId] of this.airMissionAssignmentsByUnit.entries()) {
      if (missionId === mission.id) {
        this.airMissionAssignmentsByUnit.delete(squadronId);
        break;
      }
    }
  }

  /**
   * Advances mission lifecycles for the specified faction, transitioning queued sorties into flight and
   * completing any packages that have finished their duration.
   */
  private stepAirMissionsForFaction(faction: TurnFaction): void {
    if (this.scheduledAirMissions.size === 0) {
      return;
    }

    const active: ScheduledAirMission[] = [];
    const launchedThisStep = new Set<string>();

    // Phase 1: Transition all queued missions to inFlight first so downstream resolution can see escorts/CAP
    // regardless of insertion order.
    for (const mission of this.scheduledAirMissions.values()) {
      if (mission.faction !== faction || mission.status === "completed") {
        continue;
      }

      if (mission.status === "queued") {
        this.refreshStrikeTargetHex(mission, 6);
        mission.status = "inFlight";
        mission.turnsRemaining = Math.max(0, mission.template.durationTurns);
        launchedThisStep.add(mission.id);
        const originHexKey =
          mission.originHexKey ?? this.lookupUnitBySquadronId(mission.unitKey, mission.faction)?.hexKey;
        this.pendingAirMissionArrivals.push({
          missionId: mission.id,
          faction: mission.faction,
          unitKey: mission.unitKey,
          originHexKey,
          unitType: mission.unitType,
          kind: mission.template.kind,
          targetHex: mission.targetHex ? structuredClone(mission.targetHex) : undefined,
          targetUnitKey: mission.targetUnitKey,
          escortTargetUnitKey: mission.escortTargetUnitKey
        });
      }

      active.push(mission);
    }

    // Phase 2: Tick down active inFlight missions.
    for (const mission of active) {
      if (mission.status !== "inFlight") {
        continue;
      }
      if (launchedThisStep.has(mission.id)) {
        continue;
      }
      if (mission.turnsRemaining > 0) {
        mission.turnsRemaining = Math.max(0, mission.turnsRemaining - 1);
      }
    }

    // Phase 3: Resolve missions in deterministic order so escort missions remain available while strikes resolve.
    const order: AirMissionKind[] = ["strike", "escort", "airTransport", "airCover"];
    for (const kind of order) {
      for (const mission of active) {
        if (mission.template.kind !== kind || mission.status === "completed") {
          continue;
        }
        if (mission.status === "resolving") {
          this.resolveAirMission(mission);
          continue;
        }
        if (mission.status !== "inFlight") {
          continue;
        }
        if (mission.turnsRemaining > 0) {
          continue;
        }
        this.refreshStrikeTargetHex(mission, 6);
        mission.status = "resolving";
        this.resolveAirMission(mission);
      }
    }
  }

  /**
   * Decrements active refit timers (optionally scoped to a faction). Completed refits trigger automatic
   * rearming so the squadron is ready for future tasking.
   */
  private advanceAirMissionRefits(faction?: TurnFaction): void {
    if (this.airMissionRefitTimers.size === 0) {
      return;
    }

    const completed: Array<{ missionId: string; unitKey: string; faction: TurnFaction }> = [];
    for (const [unitKey, timer] of this.airMissionRefitTimers.entries()) {
      if (faction && timer.faction !== faction) {
        continue;
      }

      const remaining = Math.max(0, timer.remaining - 1);
      if (remaining <= 0) {
        completed.push({ missionId: timer.missionId, unitKey, faction: timer.faction });
        this.airMissionRefitTimers.delete(unitKey);
      } else {
        this.airMissionRefitTimers.set(unitKey, { ...timer, remaining });
      }
    }

    completed.forEach((entry) => this.finishMissionRefit(entry.missionId, entry.unitKey, entry.faction));
  }

  /** Dispatch entry point that advances a mission into its completed state and records the outcome. */
  private resolveAirMission(mission: ScheduledAirMission): void {
    if (mission.status === "completed") {
      return;
    }

    let outcome: AirMissionOutcome;
    if (mission.template.kind === "strike") {
      outcome = this.resolveAirStrikeMission(mission);
    } else if (mission.template.kind === "escort") {
      outcome = this.resolveEscortMission(mission);
    } else if (mission.template.kind === "airCover") {
      outcome = this.resolveAirCoverMission(mission);
    } else {
      outcome = this.resolveAirTransportMission(mission);
    }

    mission.outcome = structuredClone(outcome);
    mission.status = "completed";
    mission.turnsRemaining = 0;

    // Record a sortie report for HUD/log consumption. The reporter derives extra metrics from the outcome meta.
    this.recordAirMissionReport(mission, { outcome, event: "resolved" });

    if (outcome.refitRequired) {
      this.enqueueAirMissionRefit(mission);
    } else {
      this.clearAirMissionAssignment(mission);
    }
  }

  private refreshStrikeTargetHex(mission: ScheduledAirMission, maxFollowDistanceHex: number): void {
    if (mission.template.kind !== "strike") {
      return;
    }
    if (!mission.targetUnitKey || !mission.targetHex) {
      return;
    }

    const opponentFaction: TurnFaction = mission.faction === "Player" ? "Bot" : "Player";
    const targetLookup = this.lookupUnitBySquadronId(mission.targetUnitKey, opponentFaction);
    if (!targetLookup) {
      return;
    }
    const candidateHex = targetLookup.unit.hex;
    if (hexDistance(mission.targetHex, candidateHex) > maxFollowDistanceHex) {
      return;
    }

    const attackerLookup = this.lookupUnitBySquadronId(mission.unitKey, mission.faction);
    const attackerUnit = attackerLookup?.unit;
    if (!attackerUnit) {
      return;
    }
    const attackerDefinition = this.getUnitDefinition(attackerUnit.type);
    const profile = attackerDefinition.airSupport;
    if (profile) {
      const originHex = mission.originHexKey ? GameEngine.parseAxialKey(mission.originHexKey) : attackerUnit.hex;
      try {
        this.assertAirMissionRange(profile, originHex, candidateHex);
      } catch {
        return;
      }
    }

    mission.targetHex = structuredClone(candidateHex);
  }

  /** Resolves a strike mission by running the standard combat math against the target hex. */
  private resolveAirStrikeMission(mission: ScheduledAirMission): AirMissionOutcome {
    if (!mission.targetHex) {
      return {
        type: "strike",
        result: "aborted",
        details: "Strike mission scrubbed because no target hex was supplied.",
        refitRequired: false
      };
    }

    const attackerPlacements = mission.faction === "Player" ? this.playerPlacements : this.botPlacements;
    const defenderPlacements = mission.faction === "Player" ? this.botPlacements : this.playerPlacements;

    // Look up the attacker by its stable squadronId (unitId) instead of hex key.
    // This allows multiple squadrons at the same base to each have active missions.
    const attackerLookup = this.lookupUnitBySquadronId(mission.unitKey, mission.faction);
    if (!attackerLookup) {
      return {
        type: "strike",
        result: "aborted",
        details: "Assigned squadron was not found when the strike resolved.",
        refitRequired: false
      };
    }
    const { unit: attacker, hexKey: attackerHexKey } = attackerLookup;

    const attackerDefinition = this.getUnitDefinition(attacker.type);
    if (!this.isAircraft(attackerDefinition)) {
      return {
        type: "strike",
        result: "aborted",
        details: "Only aircraft can execute strike missions.",
        refitRequired: false
      };
    }

    this.refreshStrikeTargetHex(mission, 6);

    const defenderKey = axialKey(mission.targetHex);
    const defender = defenderPlacements.get(defenderKey);
    if (!defender) {
      return {
        type: "strike",
        result: "partial",
        details: "Strike package reached the objective but found no enemy forces to attack.",
        refitRequired: true
      };
    }

    const defenderDefinition = this.getUnitDefinition(defender.type);
    const attackerBefore = structuredClone(attacker);
    const defenderBefore = structuredClone(defender);

    // Interception: hostile air cover over the objective may engage the strike package before ordnance release.
    const opponentFaction: TurnFaction = mission.faction === "Player" ? "Bot" : "Player";
    // Collect all eligible CAP flights covering the target hex (limit: 1 interception per CAP per resolution).
    const capMissions = this.findAllActiveAirCoverForHex(opponentFaction, defenderKey).filter((m) => m.interceptions < 1);
    // Collect all eligible friendly escorts protecting this bomber (limit: 1 engagement per escort per resolution).
    const escortMissions = this.findAllActiveEscortsForUnit(mission.faction, mission.unitKey).filter((m) => m.interceptions < 1);

    // Engagement metrics for reporting
    let escortsEngaged = 0;
    let escortsWins = 0;
    let capIntercepts = 0;
    let bomberAttrition = 0;

    if (capMissions.length > 0) {
      const interceptorsForEvent: Array<{ faction: TurnFaction; unitKey: string; unitType: string }> = [];
      const escortsForEvent: Array<{ faction: TurnFaction; unitKey: string; unitType: string }> = [];

      // Build event lists using current unit types (omit missing units gracefully)
      for (const cap of capMissions) {
        const capLookup = this.lookupUnitBySquadronId(cap.unitKey, opponentFaction);
        if (capLookup) {
          interceptorsForEvent.push({
            faction: opponentFaction,
            unitKey: cap.unitKey,
            unitType: capLookup.unit.type as string
          });
        }
      }
      for (const em of escortMissions) {
        const escortLookup = this.lookupUnitBySquadronId(em.unitKey, mission.faction);
        if (escortLookup) {
          escortsForEvent.push({
            faction: mission.faction,
            unitKey: em.unitKey,
            unitType: escortLookup.unit.type as string
          });
        }
      }
      this.pendingAirEngagements.push({
        type: "airToAir",
        location: structuredClone(mission.targetHex!),
        bomber: { faction: mission.faction, unitKey: mission.unitKey, unitType: mission.unitType as string },
        interceptors: interceptorsForEvent,
        escorts: escortsForEvent
      });

      // Step 1: Escorts engage CAP first (one escort per CAP where available)
      for (let i = 0; i < capMissions.length; i++) {
        const cap = capMissions[i];
        const capLookup = this.lookupUnitBySquadronId(cap.unitKey, opponentFaction);
        if (!capLookup) {
          continue;
        }
        const { unit: capUnit, hexKey: capHexKey } = capLookup;
        const escort = escortMissions.find((e) => e.interceptions < 1);
        if (!escort) {
          continue;
        }
        const escortLookup = this.lookupUnitBySquadronId(escort.unitKey, mission.faction);
        if (!escortLookup) {
          continue;
        }
        const { unit: escortUnit } = escortLookup;
        const escortReq = this.buildMissionAttackRequest(mission.faction, escortUnit, capUnit);
        if (!escortReq) {
          continue;
        }
        escortsEngaged += 1;
        let escortResult = resolveAttack(escortReq);
        const escortDef = this.getUnitDefinition(escortUnit.type);
        const capDef = this.getUnitDefinition(capUnit.type);
        const escortIsBomber = this.isBomber(escortDef);
        if (this.isAircraft(escortDef) && !escortIsBomber && this.isAircraft(capDef)) {
          escortResult = {
            ...escortResult,
            damagePerHit: escortResult.damagePerHit * 4,
            expectedDamage: escortResult.expectedDamage * 4,
            expectedSuppression: escortResult.expectedSuppression * 4
          };
        }
        const inflicted = Math.max(0, Math.round(escortResult.expectedDamage));
        const updatedCap = structuredClone(capUnit);
        updatedCap.strength = Math.max(0, updatedCap.strength - inflicted);
        // Spend fighter ammo and count the engagement for the escort.
        const escortUnitId = this.getSquadronId(escortUnit);
        this.spendAircraftAmmo(mission.faction, escortUnitId, true);
        escort.interceptions += 1;
        if (opponentFaction === "Player") {
          this.playerPlacements.set(capHexKey, updatedCap);
          this.syncPlayerStrength(updatedCap.hex, updatedCap.strength);
        } else {
          this.botPlacements.set(capHexKey, updatedCap);
          this.syncBotStrength(updatedCap.hex, updatedCap.strength);
        }
        if (updatedCap.strength <= 0) {
          escortsWins += 1;
          if (opponentFaction === "Player") {
            this.playerPlacements.delete(capHexKey);
            this.removeSupplyEntryFor(capUnit.hex);
          } else {
            this.botPlacements.delete(capHexKey);
            this.removeBotSupplyEntryFor(capUnit.hex);
          }
          // Mark CAP as having consumed its interception opportunity even if destroyed.
          cap.interceptions += 1;
        }
      }

      // Step 2: Any surviving CAP engages the bomber (sequentially)
      // Track bomber state as it may suffer multiple engagements.
      let currentBomber = attackerPlacements.get(attackerHexKey) ?? attacker;
      for (const cap of capMissions) {
        if (cap.interceptions >= 1) {
          continue; // this CAP already spent its interception
        }
        const liveCapUnit = this.lookupUnitBySquadronId(cap.unitKey, opponentFaction)?.unit;
        if (!liveCapUnit || currentBomber.strength <= 0) {
          continue;
        }
        const capReq = this.buildMissionAttackRequest(opponentFaction, liveCapUnit, currentBomber);
        if (!capReq) {
          continue;
        }
        let capResult = resolveAttack(capReq);
        const capDef = this.getUnitDefinition(liveCapUnit.type);
        if (this.isAircraft(capDef) && !this.isBomber(capDef) && this.isAircraft(attackerDefinition)) {
          capResult = {
            ...capResult,
            damagePerHit: capResult.damagePerHit * 4,
            expectedDamage: capResult.expectedDamage * 4,
            expectedSuppression: capResult.expectedSuppression * 4
          };
        }
        const suffered = Math.max(0, Math.round(capResult.expectedDamage));
        const updatedBomber = structuredClone(currentBomber);
        updatedBomber.strength = Math.max(0, updatedBomber.strength - suffered);
        // Spend fighter ammo for CAP and record interception.
        const capUnitId = this.getSquadronId(liveCapUnit);
        this.spendAircraftAmmo(opponentFaction, capUnitId, true);
        cap.interceptions += 1;
        capIntercepts += 1;
        attackerPlacements.set(attackerHexKey, updatedBomber);
        if (mission.faction === "Player") {
          this.syncPlayerStrength(updatedBomber.hex, updatedBomber.strength);
        } else {
          this.syncBotStrength(updatedBomber.hex, updatedBomber.strength);
        }
        currentBomber = updatedBomber;
        if (updatedBomber.strength <= 0) {
          attackerPlacements.delete(attackerHexKey);
          if (mission.faction === "Player") {
            this.removeSupplyEntryFor(attacker.hex);
          } else {
            this.removeBotSupplyEntryFor(attacker.hex);
          }
          this.invalidateRosterCache();
          return {
            type: "strike",
            result: "aborted",
            details: "Strike package was intercepted and destroyed before reaching the target.",
            refitRequired: true,
            meta: { capIntercepts, escortsEngaged, escortsWins, bomberAttrition: attackerBefore.strength }
          };
        }
      }
      // Record bomber attrition vs. its initial strength after all CAP passes.
      bomberAttrition = Math.max(0, attackerBefore.strength - (attackerPlacements.get(attackerHexKey)?.strength ?? attackerBefore.strength));
    }

    let request = this.buildAttackRequest(attacker, defender, mission.faction, opponentFaction, { allowBomberAirAttack: true });
    if (!request) {
      request = this.buildMissionAttackRequest(mission.faction, attacker, defender);
    }
    if (!request) {
      // Escort/CAP attrition may have already mutated placements (e.g., CAP destroyed), so ensure UI snapshots rebuild.
      this.invalidateRosterCache();
      return {
        type: "strike",
        result: "aborted",
        details: "Strike geometry could not be established, so ordnance was not released.",
        refitRequired: true
      };
    }

    let attackResult = resolveAttack(request);
    const attackerIsBomber = this.isBomber(attackerDefinition);
    const defenderIsAircraft = this.isAircraft(defenderDefinition);
    if (attackerIsBomber && !defenderIsAircraft) {
      const boostedDamage = attackResult.expectedDamage * 10;
      attackResult = {
        ...attackResult,
        damagePerHit: attackResult.damagePerHit * 10,
        expectedDamage: boostedDamage,
        expectedSuppression: attackResult.expectedSuppression * 10
      };
    } else if (this.isAircraft(attackerDefinition) && !attackerIsBomber && defenderIsAircraft) {
      const dogfightDamage = attackResult.expectedDamage * 4;
      attackResult = {
        ...attackResult,
        damagePerHit: attackResult.damagePerHit * 4,
        expectedDamage: dogfightDamage,
        expectedSuppression: attackResult.expectedSuppression * 4
      };
    }

    const inflicted = Math.max(
      0,
      attackerIsBomber && !defenderIsAircraft
        ? Math.ceil(attackResult.expectedDamage)
        : Math.round(attackResult.expectedDamage)
    );
    const updatedDefender = structuredClone(defender);
    updatedDefender.strength = Math.max(0, updatedDefender.strength - inflicted);
    const defenderDestroyed = updatedDefender.strength <= 0;

    // Aircraft expend one ammo salvo per sortie. Hitting zero shifts them into the refit pipeline.
    // Use the stable squadronId (mission.unitKey) for ammo tracking, but hexKey for placement updates.
    this.spendAircraftAmmo(mission.faction, mission.unitKey, defenderIsAircraft);
    const updatedAttacker = structuredClone(attacker);
    if (typeof updatedAttacker.ammo === "number") {
      updatedAttacker.ammo = Math.max(0, updatedAttacker.ammo - 1);
    }
    attackerPlacements.set(attackerHexKey, updatedAttacker);
    if (mission.faction === "Player") {
      this.syncPlayerAmmo(updatedAttacker.hex, typeof updatedAttacker.ammo === "number" ? updatedAttacker.ammo : 0);
    } else {
      this.syncBotAmmo(updatedAttacker.hex, typeof updatedAttacker.ammo === "number" ? updatedAttacker.ammo : 0);
    }

    if (defenderDestroyed) {
      defenderPlacements.delete(defenderKey);
      if (mission.faction === "Player") {
        this.removeBotSupplyEntryFor(mission.targetHex);
      } else {
        this.removeSupplyEntryFor(mission.targetHex);
      }
    } else {
      defenderPlacements.set(defenderKey, updatedDefender);
      if (mission.faction === "Player") {
        this.syncBotStrength(mission.targetHex, updatedDefender.strength);
      } else {
        this.syncPlayerStrength(mission.targetHex, updatedDefender.strength);
      }
    }

    if (mission.faction === "Player") {
      this.recordCombatReport({
        attacker: {
          unit: attackerBefore,
          hex: attackerBefore.hex,
          faction: "Player",
          strengthBefore: attackerBefore.strength,
          strengthAfter: updatedAttacker.strength
        },
        defender: {
          unit: defenderBefore,
          hex: defenderBefore.hex,
          faction: "Bot",
          strengthBefore: defenderBefore.strength,
          strengthAfter: updatedDefender.strength,
          destroyed: defenderDestroyed
        },
        attackResult,
        retaliationResult: undefined
      });
    } else {
      this.recordCombatReport({
        attacker: {
          unit: defenderBefore,
          hex: defenderBefore.hex,
          faction: "Bot",
          strengthBefore: defenderBefore.strength,
          strengthAfter: updatedDefender.strength
        },
        defender: {
          unit: attackerBefore,
          hex: attackerBefore.hex,
          faction: "Player",
          strengthBefore: attackerBefore.strength,
          strengthAfter: updatedAttacker.strength,
          destroyed: false
        },
        attackResult,
        retaliationResult: undefined
      });
    }

    // Strike missions can resolve outside of direct player interactions; clear cached roster so UI reflects damage immediately.
    this.invalidateRosterCache();

    return {
      type: "strike",
      result: defenderDestroyed ? "success" : inflicted > 0 ? "partial" : "partial",
      details: defenderDestroyed
        ? `Strike destroyed the enemy ${defender.type} at ${defenderKey}.`
        : inflicted > 0
          ? `Strike damaged the enemy ${defender.type} at ${defenderKey}, inflicting ${inflicted}% strength loss.`
          : `Strike expended ordnance on the enemy ${defender.type}, but no significant damage was recorded.`,
      refitRequired: true,
      meta: { capIntercepts, escortsEngaged, escortsWins, bomberAttrition },
      damageInflicted: inflicted,
      defenderDestroyed,
      defenderType: defender.type
    };
  }

  /** Resolves an escort mission by verifying the protected package and recording the sweep. */
  private resolveEscortMission(mission: ScheduledAirMission): AirMissionOutcome {
    if (!mission.escortTargetUnitKey) {
      return {
        type: "escort",
        result: "aborted",
        details: "Escort flight was cancelled because no strike package was linked to the mission.",
        refitRequired: false
      };
    }

    // Look up the protected unit by its stable squadronId instead of hex key.
    const protectedLookup = this.lookupUnitBySquadronId(mission.escortTargetUnitKey, mission.faction);
    if (!protectedLookup) {
      return {
        type: "escort",
        result: "aborted",
        details: "Assigned strike package was no longer present, so the escort returned to base.",
        refitRequired: false
      };
    }

    return {
      type: "escort",
      result: "success",
      details: `Escort maintained air cover for ${protectedLookup.unit.type}; no enemy interceptors challenged the route.`,
      refitRequired: true,
      interceptions: mission.interceptions,
      protectedUnitKey: mission.escortTargetUnitKey
    };
  }

  /** Resolves an air cover patrol by validating the zone and logging the sortie. */
  private resolveAirCoverMission(mission: ScheduledAirMission): AirMissionOutcome {
    // If no target hex was provided, use the squadron's origin hex (base CAP).
    // This allows interceptors to be assigned to air cover without selecting a specific hex.
    let patrolHex = mission.targetHex;
    if (!patrolHex && mission.originHexKey) {
      patrolHex = GameEngine.parseAxialKey(mission.originHexKey);
    }
    if (!patrolHex) {
      // Fall back to looking up the squadron's current hex if originHexKey is also missing.
      const squadronLookup = this.lookupUnitBySquadronId(mission.unitKey, mission.faction);
      if (squadronLookup) {
        patrolHex = squadronLookup.unit.hex;
      }
    }
    if (!patrolHex) {
      return {
        type: "airCover",
        result: "aborted",
        details: "Air cover patrol was cancelled because no patrol zone could be determined.",
        refitRequired: false
      };
    }

    // CAP is valid even if the patrol zone has no friendly units - it protects the airspace.
    return {
      type: "airCover",
      result: "success",
      details: `Combat air patrol completed over ${axialKey(patrolHex)}; no hostile bombers entered the area.`,
      refitRequired: true,
      interceptions: mission.interceptions,
      protectedHex: structuredClone(patrolHex)
    };
  }

  /** Resolves an airborne transport mission by consuming an airborne reserve and deploying it at the target hex. */
  private resolveAirTransportMission(mission: ScheduledAirMission): AirMissionOutcome {
    if (!mission.targetHex) {
      return {
        type: "airTransport",
        result: "aborted",
        details: "Airborne drop was cancelled because no target hex was supplied.",
        refitRequired: false
      };
    }

    // For now, only the player fields modeled airborne reserves.
    if (mission.faction !== "Player") {
      return {
        type: "airTransport",
        result: "aborted",
        details: "Only the player currently fields airborne reserves for transport missions.",
        refitRequired: false
      };
    }

    // Try the target hex first; if occupied, scatter to nearby unoccupied hexes.
    let finalHex = mission.targetHex;
    let scattered = false;
    if (this.playerPlacements.has(axialKey(finalHex)) || this.botPlacements.has(axialKey(finalHex))) {
      // Scatter: find the nearest unoccupied hex within a small radius.
      const scatterHex = this.findNearestUnoccupiedHex(mission.targetHex, 3);
      if (scatterHex) {
        finalHex = scatterHex;
        scattered = true;
      } else {
        return {
          type: "airTransport",
          result: "aborted",
          details: "Airborne drop zone and all nearby hexes are occupied; transport returned to base.",
          refitRequired: false
        };
      }
    }
    const targetKey = axialKey(finalHex);

    // Locate an airborne detachment in the dedicated airborne reserves pool.
    // Airborne units are separate from ground reserves and loaded at the airbase.
    let reserveIndex = this.airborneReserves.findIndex((reserve) => reserve.allocationKey === "airborneDetachment");
    if (reserveIndex < 0) {
      reserveIndex = this.airborneReserves.findIndex((reserve) => reserve.unit.type === "Paratrooper");
    }
    const entry = reserveIndex >= 0 ? this.airborneReserves[reserveIndex] : undefined;
    if (!entry) {
      return {
        type: "airTransport",
        result: "aborted",
        details: "No airborne detachments remain in reserves to conduct the drop.",
        refitRequired: false
      };
    }

    const placement = structuredClone(entry.unit);
    placement.hex = structuredClone(mission.targetHex);
    this.playerPlacements.set(targetKey, placement);
    this.updateIdleRegistryFor(targetKey);
    this.playerSupply.push({
      hex: structuredClone(mission.targetHex),
      ammo: placement.ammo,
      fuel: placement.fuel,
      entrench: placement.entrench,
      strength: placement.strength
    });
    // Remove the deployed unit from the airborne reserves pool.
    this.airborneReserves.splice(reserveIndex, 1);
    this.resetPlayerHistoryCheckpoint();
    this.invalidateRosterCache();

    return {
      type: "airTransport",
      result: "success",
      details: scattered
        ? `Airborne detachment scattered to ${targetKey} (target was occupied).`
        : `Airborne detachment dropped at ${targetKey}.`,
      refitRequired: true,
      droppedUnitType: placement.type,
      droppedHex: structuredClone(finalHex)
    };
  }

  /**
   * Finds the nearest unoccupied hex within a given radius of the target hex.
   * Used for scattering airborne drops when the target is occupied.
   */
  private findNearestUnoccupiedHex(center: Axial, maxRadius: number): Axial | null {
    // Spiral outward from the center to find the nearest unoccupied hex.
    for (let radius = 1; radius <= maxRadius; radius++) {
      const ring = this.getHexRing(center, radius);
      // Shuffle the ring to add some randomness to scattering.
      const shuffled = ring.sort(() => Math.random() - 0.5);
      for (const hex of shuffled) {
        const key = axialKey(hex);
        if (!this.playerPlacements.has(key) && !this.botPlacements.has(key)) {
          // Check that the hex is within map bounds using the scenario dimensions.
          if (this.isHexInBounds(hex)) {
            return hex;
          }
        }
      }
    }
    return null;
  }

  /** Returns the ring of hexes at a given radius from a center hex. */
  private getHexRing(center: Axial, radius: number): Axial[] {
    if (radius === 0) return [center];
    const ring: Axial[] = [];
    // Axial direction vectors for the six hex directions.
    const directions: Axial[] = [
      { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
      { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }
    ];
    // Start at one corner and walk around the ring.
    let hex: Axial = { q: center.q + directions[4].q * radius, r: center.r + directions[4].r * radius };
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < radius; j++) {
        ring.push({ q: hex.q, r: hex.r });
        hex = { q: hex.q + directions[i].q, r: hex.r + directions[i].r };
      }
    }
    return ring;
  }

  /** Checks if a hex is within the map bounds defined by the scenario. */
  private isHexInBounds(hex: Axial): boolean {
    // Use the scenario size to determine bounds. Axial coordinates can be negative,
    // so we use a simple heuristic based on reasonable map bounds.
    const { cols, rows } = this.scenario.size;
    // For odd-r offset hex grids, approximate bounds in axial space.
    // This is a conservative estimate that should work for most map sizes.
    const maxQ = cols;
    const maxR = rows;
    return hex.q >= -maxQ && hex.q <= maxQ && hex.r >= -maxR && hex.r <= maxR;
  }

  /** Builds a guaranteed attack request for mission resolution when LOS shortcuts are required. */
  private buildMissionAttackRequest(faction: TurnFaction, attacker: ScenarioUnit, defender: ScenarioUnit): AttackRequest | null {
    const attackerDefinition = this.getUnitDefinition(attacker.type);
    const defenderDefinition = this.getUnitDefinition(defender.type);
    if (!attackerDefinition || !defenderDefinition) {
      return null;
    }

    const attackerState: UnitCombatState = {
      unit: attackerDefinition,
      strength: attacker.strength,
      experience: attacker.experience,
      general: faction === "Player" ? this.playerSide.general : this.botSide.general
    };
    const defenderState: UnitCombatState = {
      unit: defenderDefinition,
      strength: defender.strength,
      experience: defender.experience,
      general: faction === "Player" ? this.botSide.general : this.playerSide.general
    };

    return {
      attacker: attackerState,
      defender: defenderState,
      attackerCtx: { hex: structuredClone(attacker.hex) },
      defenderCtx: {
        terrain: this.terrainAt(defender.hex) ?? this.defaultTerrain(),
        class: defenderDefinition.class,
        facing: defender.facing,
        hex: structuredClone(defender.hex),
        isRushing: false,
        isSpottedOnly: false
      },
      targetFacing: defender.facing,
      isSoftTarget: defenderDefinition.class === "infantry" || defenderDefinition.class === "specialist"
    } satisfies AttackRequest;
  }

  /** Locate an active escort mission protecting the specified friendly unit key for a faction. */
  private findActiveEscortForUnit(faction: TurnFaction, unitKey: string): ScheduledAirMission | null {
    for (const mission of this.scheduledAirMissions.values()) {
      if (mission.faction !== faction) {
        continue;
      }
      if (missionIsProtectingUnit(mission, unitKey)) {
        return mission;
      }
    }
    return null;
  }

  /** Locate an active CAP mission covering the specified hex key for a faction. */
  private findActiveAirCoverForHex(faction: TurnFaction, hexKey: string): ScheduledAirMission | null {
    return this.findAllActiveAirCoverForHex(faction, hexKey)[0] ?? null;
  }

  /** Returns all active escort missions protecting the specified friendly unit key for a faction. */
  private findAllActiveEscortsForUnit(faction: TurnFaction, unitKey: string): ScheduledAirMission[] {
    const results: ScheduledAirMission[] = [];
    for (const mission of this.scheduledAirMissions.values()) {
      if (mission.faction !== faction) {
        continue;
      }
      if (missionIsProtectingUnit(mission, unitKey)) {
        results.push(mission);
      }
    }
    return results;
  }

  /** Returns all active CAP missions covering the specified hex key for a faction. */
  private findAllActiveAirCoverForHex(faction: TurnFaction, hexKey: string): ScheduledAirMission[] {
    let interceptHex: Axial;
    try {
      interceptHex = GameEngine.parseAxialKey(hexKey);
    } catch {
      return [];
    }

    const results: ScheduledAirMission[] = [];
    for (const mission of this.scheduledAirMissions.values()) {
      if (mission.faction !== faction) {
        continue;
      }
      if (mission.template.kind !== "airCover" || mission.status !== "inFlight") {
        continue;
      }

      let patrolCenter: Axial | null = mission.targetHex ? structuredClone(mission.targetHex) : null;
      if (!patrolCenter && mission.originHexKey) {
        try {
          patrolCenter = GameEngine.parseAxialKey(mission.originHexKey);
        } catch {
          patrolCenter = null;
        }
      }

      const capLookup = this.lookupUnitBySquadronId(mission.unitKey, faction);
      const capUnit = capLookup?.unit ?? null;
      if (!patrolCenter && capUnit) {
        patrolCenter = structuredClone(capUnit.hex);
      }
      if (!patrolCenter) {
        continue;
      }

      if (hexDistance(patrolCenter, interceptHex) > GameEngine.AIR_COVER_PATROL_RADIUS_HEX) {
        continue;
      }

      if (!capUnit) {
        continue;
      }
      const capDef = this.getUnitDefinition(capUnit.type);
      if (!this.isAircraft(capDef) || !capDef.airSupport) {
        continue;
      }

      let originHex: Axial | null = null;
      if (mission.originHexKey) {
        try {
          originHex = GameEngine.parseAxialKey(mission.originHexKey);
        } catch {
          originHex = null;
        }
      }
      if (!originHex) {
        originHex = structuredClone(capUnit.hex);
      }

      try {
        this.assertAirMissionRange(capDef.airSupport, originHex, interceptHex);
      } catch {
        continue;
      }

      results.push(mission);
    }
    return results;
  }

  /** Flags the assigned squadron for refit and schedules the timer based on its air support profile. */
  private enqueueAirMissionRefit(mission: ScheduledAirMission): void {
    const definition = this.getUnitDefinition(mission.unitType as keyof UnitTypeDictionary);
    const profile = definition.airSupport;
    const lookup = this.lookupUnitBySquadronId(mission.unitKey, mission.faction);
    const unit = lookup?.unit ?? null;
    const squadronId = unit ? this.getSquadronId(unit) : mission.unitKey;
    if (unit) {
      this.getAircraftAmmoState(mission.faction, squadronId, definition);
    }
    this.markAircraftNeedsRearm(mission.faction, squadronId);

    if (!profile || profile.refitTurns <= 0) {
      this.finishMissionRefit(mission.id, squadronId, mission.faction);
      return;
    }

    // Log refit start event for sortie ledger so HUD/UX can reflect recovery windows.
    this.recordAirMissionReport(mission, { event: "refitStarted", notes: ["Squadron entered refit cycle"] });

    this.airMissionRefitTimers.set(squadronId, {
      missionId: mission.id,
      faction: mission.faction,
      remaining: profile.refitTurns
    });
  }

  /** Completes refit for a squadron, restoring ammo and clearing mission assignment locks. */
  private finishMissionRefit(missionId: string, unitKey: string, faction: TurnFaction): void {
    const mission = this.scheduledAirMissions.get(missionId);
    if (!mission) {
      this.airMissionAssignmentsByUnit.delete(unitKey);
      return;
    }

    const registry = faction === "Player" ? this.playerAttackAmmo : this.botAttackAmmo;
    const lookup = this.lookupUnitBySquadronId(unitKey, faction);
    const unit = lookup?.unit ?? null;

    if (unit) {
      const definition = this.getUnitDefinition(unit.type);
      const refreshed = this.createInitialAircraftAmmo(definition);
      registry.set(unitKey, refreshed);
      this.applyAircraftRepair(faction, unitKey, unit);
    } else {
      registry.delete(unitKey);
    }

    this.airMissionAssignmentsByUnit.delete(unitKey);
    // Emit a refit-completed report so UI can surface a readiness ping.
    const finishedMission = this.scheduledAirMissions.get(missionId);
    if (finishedMission) {
      this.recordAirMissionReport(finishedMission, { event: "refitCompleted", notes: ["Squadron refit complete; ready for tasking"] });
    }
  }

  /**
   * Returns the current depot stockpile totals derived from the faction supply state inventory.
   */
  private getFactionStockpileTotals(
    faction: TurnFaction
  ): { ammo: number; fuel: number; rations: number; parts: number } {
    const state = this.supplyStateByFaction[faction];
    return {
      ammo: Math.max(0, Math.round(state.inventory.ammo.current)),
      fuel: Math.max(0, Math.round(state.inventory.fuel.current)),
      rations: Math.max(0, Math.round(state.inventory.rations.current)),
      parts: Math.max(0, Math.round(state.inventory.parts.current))
    };
  }

  /**
   * Applies production gains and delivers any pending shipments slated for the active turn before upkeep drains occur.
   */
  private advanceFactionSupplyState(faction: TurnFaction): void {
    const state = this.supplyStateByFaction[faction];
    const arrivals = advanceShipments(state, this._turnNumber);
    arrivals.forEach((shipment) => applyShipment(state, shipment, this._turnNumber));
    const production = accumulateProduction(state, state.lastUpdatedTurn, this._turnNumber);
    production.forEach((shipment) => applyShipment(state, shipment, this._turnNumber));
    state.lastUpdatedTurn = this._turnNumber;
  }

  /**
   * Deducts upkeep for a single unit, drawing from stockpiles first and falling back to onboard reserves when supply falters.
   */
  private applyUpkeepForUnit(
    faction: TurnFaction,
    supplyState: SupplyState,
    unit: ScenarioUnit,
    state: SupplyUnitState,
    upkeep: { ammo: number; fuel: number }
  ): void {
    if (upkeep.ammo > 0) {
      const available = Math.max(0, supplyState.inventory.ammo.current);
      const stockpileDraw = Math.min(upkeep.ammo, available);
      if (stockpileDraw > 0) {
        this.trackSupplyConsumption(faction, "ammo", stockpileDraw, `${unit.type} upkeep draw`);
      }
      const unmet = upkeep.ammo - stockpileDraw;
      if (unmet > 0) {
        const onboardDrain = Math.min(unmet, state.ammo);
        if (onboardDrain > 0) {
          state.ammo = Math.max(0, state.ammo - onboardDrain);
          unit.ammo = state.ammo;
        }
      }
    }

    if (upkeep.fuel > 0) {
      const available = Math.max(0, supplyState.inventory.fuel.current);
      const stockpileDraw = Math.min(upkeep.fuel, available);
      if (stockpileDraw > 0) {
        this.trackSupplyConsumption(faction, "fuel", stockpileDraw, `${unit.type} upkeep draw`);
      }
      const unmet = upkeep.fuel - stockpileDraw;
      if (unmet > 0) {
        const onboardDrain = Math.min(unmet, state.fuel);
        if (onboardDrain > 0) {
          state.fuel = Math.max(0, state.fuel - onboardDrain);
          unit.fuel = state.fuel;
        }
      }
    }
  }

  private isSupplyTruckType(unitType: ScenarioUnit["type"] | string): boolean {
    return unitType === "Supply_Truck";
  }

  private isAutomatedPlayerUnit(unit: ScenarioUnit): boolean {
    return this.isSupplyTruckType(unit.type) || unit.controlledBy === "AI";
  }

  private getPlacementMapForFaction(faction: TurnFaction): UnitPlacementMap {
    if (faction === "Player") {
      return this.playerPlacements;
    }
    if (faction === "Bot") {
      return this.botPlacements;
    }
    return this.allyPlacements;
  }

  private getSupplyMirrorForFaction(faction: TurnFaction): SupplyUnitState[] {
    if (faction === "Player") {
      return this.playerSupply;
    }
    if (faction === "Bot") {
      return this.botSupply;
    }
    return this.allySupply;
  }

  private getSupplyTruckStateMap(faction: TurnFaction): Map<string, SupplyTruckState> {
    return this.supplyTruckStateByFaction[faction];
  }

  private getSupplySourceHexes(faction: TurnFaction): Axial[] {
    const sources: Axial[] = [];
    if (faction === "Player" && this._baseCamp) {
      sources.push(structuredClone(this._baseCamp.hex));
    }
    const side = faction === "Player" ? this.playerSide : faction === "Bot" ? this.botSide : this.allySide;
    if (side?.hq) {
      sources.push(structuredClone(side.hq));
    }
    return sources;
  }

  private isHexWithinSupplySourceRadius(hex: Axial, faction: TurnFaction): boolean {
    return this.getSupplySourceHexes(faction)
      .some((source) => hexDistance(source, hex) <= supplyBalance.convoy.sourceRadius);
  }

  private getSupplyStateForHex(faction: TurnFaction, hex: Axial): SupplyUnitState | null {
    const key = axialKey(hex);
    return this.getSupplyMirrorForFaction(faction).find((entry) => axialKey(entry.hex) === key) ?? null;
  }

  private getDisplayUnitLabel(unit: ScenarioUnit): string {
    if (this.isSupplyTruckType(unit.type)) {
      return "Supply Convoy";
    }
    return String(unit.type).replace(/_/g, " ");
  }

  private getDefaultSupplyPriority(definition: UnitTypeDefinition): SupplyPriority {
    if (definition.class === "tank" || definition.class === "artillery") {
      return "high";
    }
    if (definition.class === "recon") {
      return "low";
    }
    return "normal";
  }

  private getSupplyPriorityForUnit(unit: ScenarioUnit, definition?: UnitTypeDefinition): SupplyPriority {
    if (unit.unitId && this.supplyPriorityByUnitId.has(unit.unitId)) {
      return this.supplyPriorityByUnitId.get(unit.unitId)!;
    }
    return this.getDefaultSupplyPriority(definition ?? this.getUnitDefinition(unit.type));
  }

  private getSupplyPriorityWeight(priority: SupplyPriority): number {
    switch (priority) {
      case "critical":
        return 400;
      case "high":
        return 240;
      case "normal":
        return 120;
      case "low":
      default:
        return 0;
    }
  }

  private ensureSupplyTruckStatesForFaction(faction: TurnFaction): void {
    const placements = this.getPlacementMapForFaction(faction);
    const stateMap = this.getSupplyTruckStateMap(faction);
    const liveIds = new Set<string>();

    placements.forEach((unit) => {
      if (!this.isSupplyTruckType(unit.type)) {
        return;
      }
      const unitId = this.ensureUnitId(unit);
      liveIds.add(unitId);
      if (!stateMap.has(unitId)) {
        stateMap.set(unitId, {
          unitId,
          ammoCargo: 0,
          fuelCargo: 0,
          status: "idle",
          assignedUnitId: null
        });
      }
    });

    Array.from(stateMap.keys()).forEach((unitId) => {
      if (!liveIds.has(unitId)) {
        stateMap.delete(unitId);
      }
    });
  }

  private loadSupplyTruckFromDepot(
    faction: TurnFaction,
    supplyState: SupplyState,
    truck: ScenarioUnit,
    truckSupplyState: SupplyUnitState,
    truckState: SupplyTruckState
  ): void {
    const ammoNeed = Math.max(0, supplyBalance.convoy.ammoCapacity - truckState.ammoCargo);
    const ammoLoad = Math.min(ammoNeed, Math.max(0, supplyState.inventory.ammo.current));
    if (ammoLoad > 0) {
      this.trackSupplyConsumption(faction, "ammo", ammoLoad, "Supply convoy loadout");
      truckState.ammoCargo = Number((truckState.ammoCargo + ammoLoad).toFixed(2));
    }

    const fuelNeed = Math.max(0, supplyBalance.convoy.fuelCapacity - truckState.fuelCargo);
    const fuelLoad = Math.min(fuelNeed, Math.max(0, supplyState.inventory.fuel.current));
    if (fuelLoad > 0) {
      this.trackSupplyConsumption(faction, "fuel", fuelLoad, "Supply convoy loadout");
      truckState.fuelCargo = Number((truckState.fuelCargo + fuelLoad).toFixed(2));
    }

    const truckDefinition = this.getUnitDefinition(truck.type);
    const drivetrainFuelNeed = Math.max(0, (truckDefinition.fuel ?? 0) - truckSupplyState.fuel);
    const drivetrainFuelLoad = Math.min(drivetrainFuelNeed, Math.max(0, supplyState.inventory.fuel.current));
    if (drivetrainFuelLoad > 0) {
      this.trackSupplyConsumption(faction, "fuel", drivetrainFuelLoad, "Supply convoy refuel");
      truckSupplyState.fuel = Number((truckSupplyState.fuel + drivetrainFuelLoad).toFixed(2));
      truck.fuel = truckSupplyState.fuel;
    }

    if (ammoLoad > 0 || fuelLoad > 0) {
      truckState.status = "loading";
    }
  }

  private applyDirectDepotResupply(
    faction: TurnFaction,
    supplyState: SupplyState,
    unit: ScenarioUnit,
    state: SupplyUnitState,
    definition: UnitTypeDefinition
  ): void {
    const ammoCapacity = Math.max(0, (definition.ammo ?? 0) - state.ammo);
    const ammoTransfer = Math.min(ammoCapacity, Math.max(0, supplyState.inventory.ammo.current));
    if (ammoTransfer > 0) {
      this.trackSupplyConsumption(faction, "ammo", ammoTransfer, `${unit.type} depot issue`);
      state.ammo = Number((state.ammo + ammoTransfer).toFixed(2));
      unit.ammo = state.ammo;
    }

    if (!this.unitConsumesFuel(definition)) {
      return;
    }

    const fuelCapacity = Math.max(0, (definition.fuel ?? 0) - state.fuel);
    const fuelTransfer = Math.min(fuelCapacity, Math.max(0, supplyState.inventory.fuel.current));
    if (fuelTransfer > 0) {
      this.trackSupplyConsumption(faction, "fuel", fuelTransfer, `${unit.type} depot issue`);
      state.fuel = Number((state.fuel + fuelTransfer).toFixed(2));
      unit.fuel = state.fuel;
    }
  }

  private deliverConvoyCargoToUnit(
    _faction: TurnFaction,
    truckState: SupplyTruckState,
    unit: ScenarioUnit,
    state: SupplyUnitState,
    definition: UnitTypeDefinition
  ): boolean {
    let transferred = false;

    const ammoCapacity = Math.max(0, (definition.ammo ?? 0) - state.ammo);
    const ammoTransfer = Math.min(
      ammoCapacity,
      supplyBalance.convoy.unloadAmmoPerTurn,
      Math.max(0, truckState.ammoCargo)
    );
    if (ammoTransfer > 0) {
      truckState.ammoCargo = Number((truckState.ammoCargo - ammoTransfer).toFixed(2));
      state.ammo = Number((state.ammo + ammoTransfer).toFixed(2));
      unit.ammo = state.ammo;
      transferred = true;
    }

    if (this.unitConsumesFuel(definition)) {
      const fuelCapacity = Math.max(0, (definition.fuel ?? 0) - state.fuel);
      const fuelTransfer = Math.min(
        fuelCapacity,
        supplyBalance.convoy.unloadFuelPerTurn,
        Math.max(0, truckState.fuelCargo)
      );
      if (fuelTransfer > 0) {
        truckState.fuelCargo = Number((truckState.fuelCargo - fuelTransfer).toFixed(2));
        state.fuel = Number((state.fuel + fuelTransfer).toFixed(2));
        unit.fuel = state.fuel;
        transferred = true;
      }
    }

    if (transferred) {
      truckState.status = "delivering";
    }
    return transferred;
  }

  private resolveSupplyDemandEntries(faction: TurnFaction): SupplyDemandEntry[] {
    const placements = Array.from(this.getPlacementMapForFaction(faction).values());
    const entries: SupplyDemandEntry[] = [];

    placements
      .filter((unit) => !this.isSupplyTruckType(unit.type))
      .forEach((unit) => {
        const definition = this.getUnitDefinition(unit.type);
        const state = this.getSupplyStateForHex(faction, unit.hex);
        if (!state || definition.moveType === "air") {
          return;
        }
        const ammoNeed = Math.max(0, (definition.ammo ?? 0) - state.ammo);
        const fuelNeed = this.unitConsumesFuel(definition) ? Math.max(0, (definition.fuel ?? 0) - state.fuel) : 0;
        if (ammoNeed <= 0 && fuelNeed <= 0) {
          return;
        }
        entries.push({
          unit,
          definition,
          priority: this.getSupplyPriorityForUnit(unit, definition),
          ammoNeed,
          fuelNeed,
          directEligible: this.isHexWithinSupplySourceRadius(unit.hex, faction),
          assignmentCount: 0,
          status: "queued"
        });
      });

    return entries;
  }

  private applyDirectDepotIssues(
    faction: TurnFaction,
    supplyState: SupplyState,
    demands: SupplyDemandEntry[]
  ): void {
    demands.forEach((entry) => {
      if (!entry.directEligible) {
        return;
      }
      const state = this.getSupplyStateForHex(faction, entry.unit.hex);
      if (!state) {
        return;
      }
      this.applyDirectDepotResupply(faction, supplyState, entry.unit, state, entry.definition);
      entry.ammoNeed = Math.max(0, (entry.definition.ammo ?? 0) - state.ammo);
      entry.fuelNeed = this.unitConsumesFuel(entry.definition) ? Math.max(0, (entry.definition.fuel ?? 0) - state.fuel) : 0;
      entry.status = entry.ammoNeed <= 0 && entry.fuelNeed <= 0 ? "direct" : "queued";
    });
  }

  private scoreSupplyDemand(entry: SupplyDemandEntry): number {
    const urgency = (entry.ammoNeed * 12) + (entry.fuelNeed * 8);
    const emptyPenalty = (entry.unit.ammo <= 0 ? 60 : 0) + (entry.unit.fuel <= 0 && this.unitConsumesFuel(entry.definition) ? 60 : 0);
    return this.getSupplyPriorityWeight(entry.priority) + urgency + emptyPenalty - (entry.assignmentCount * 30);
  }

  private chooseBestSupplyTarget(
    faction: TurnFaction,
    truck: ScenarioUnit,
    truckState: SupplyTruckState,
    demands: SupplyDemandEntry[]
  ): SupplyDemandEntry | null {
    const availableDemand = demands
      .filter((entry) => entry.status !== "direct" && entry.status !== "resupplied")
      .filter((entry) => entry.ammoNeed > 0 || entry.fuelNeed > 0);
    if (availableDemand.length === 0) {
      return null;
    }

    const occupied = this.buildUnifiedOccupancySet();
    occupied.delete(axialKey(truck.hex));

    let best: { entry: SupplyDemandEntry; score: number } | null = null;
    for (const entry of availableDemand) {
      const serviceHexes = this.collectServiceHexes(entry.unit.hex, truck.hex);
      const plan = this.findCheapestPathToAny(truck.hex, serviceHexes, this.getUnitDefinition(truck.type).moveType, occupied);
      const travelPenalty = plan ? plan.summary.cost * 4 : 80;
      const cargoMismatchPenalty = (entry.ammoNeed > 0 && truckState.ammoCargo <= 0 ? 45 : 0)
        + (entry.fuelNeed > 0 && truckState.fuelCargo <= 0 ? 45 : 0);
      const score = this.scoreSupplyDemand(entry) - travelPenalty - cargoMismatchPenalty;
      if (!best || score > best.score) {
        best = { entry, score };
      }
    }

    if (!best || best.score < -20) {
      return null;
    }
    return best.entry;
  }

  private collectServiceHexes(targetHex: Axial, origin: Axial): Axial[] {
    const candidates: Axial[] = [];
    if (!this.isOccupied(targetHex) || (targetHex.q === origin.q && targetHex.r === origin.r)) {
      candidates.push(structuredClone(targetHex));
    }
    neighbors(targetHex).forEach((neighbor) => {
      if (!this.inBounds(neighbor)) {
        return;
      }
      const key = axialKey(neighbor);
      if (this.isOccupied(neighbor) && key !== axialKey(origin)) {
        return;
      }
      candidates.push(structuredClone(neighbor));
    });
    return candidates;
  }

  private collectSourceApproachHexes(faction: TurnFaction, origin: Axial): Axial[] {
    const candidates: Axial[] = [];
    this.getSupplySourceHexes(faction).forEach((source) => {
      if (!this.isOccupied(source) || axialKey(source) === axialKey(origin)) {
        candidates.push(structuredClone(source));
      }
      neighbors(source).forEach((neighbor) => {
        if (!this.inBounds(neighbor)) {
          return;
        }
        const key = axialKey(neighbor);
        if (this.isOccupied(neighbor) && key !== axialKey(origin)) {
          return;
        }
        candidates.push(structuredClone(neighbor));
      });
    });
    return candidates;
  }

  private automateSupplyConvoys(
    faction: TurnFaction,
    supplyState: SupplyState,
    demands: SupplyDemandEntry[]
  ): void {
    this.ensureSupplyTruckStatesForFaction(faction);
    const placements = this.getPlacementMapForFaction(faction);
    const mirror = this.getSupplyMirrorForFaction(faction);
    const stateMap = this.getSupplyTruckStateMap(faction);

    Array.from(placements.values())
      .filter((unit) => this.isSupplyTruckType(unit.type))
      .forEach((truck) => {
        const truckId = this.ensureUnitId(truck);
        const truckState = stateMap.get(truckId)!;
        const truckDefinition = this.getUnitDefinition(truck.type);
        const truckSupplyState = mirror.find((entry) => axialKey(entry.hex) === axialKey(truck.hex)) ?? null;
        if (!truckSupplyState) {
          return;
        }

        const atSource = this.isHexWithinSupplySourceRadius(truck.hex, faction);
        if (atSource) {
          this.loadSupplyTruckFromDepot(faction, supplyState, truck, truckSupplyState, truckState);
        }

        let assignedEntry = demands.find((entry) => entry.unit.unitId === truckState.assignedUnitId) ?? null;
        if (assignedEntry && assignedEntry.status === "direct") {
          assignedEntry = null;
        }

        if (assignedEntry) {
          const assignedState = this.getSupplyStateForHex(faction, assignedEntry.unit.hex);
          if (!assignedState || ((assignedEntry.ammoNeed <= 0 && assignedEntry.fuelNeed <= 0))) {
            assignedEntry = null;
          }
        }

        if (!assignedEntry && (truckState.ammoCargo > 0 || truckState.fuelCargo > 0)) {
          assignedEntry = this.chooseBestSupplyTarget(faction, truck, truckState, demands);
          truckState.assignedUnitId = assignedEntry?.unit.unitId ?? null;
        }

        if (assignedEntry) {
          assignedEntry.assignmentCount += 1;
        }

        const adjacentToAssigned = assignedEntry
          ? hexDistance(truck.hex, assignedEntry.unit.hex) <= supplyBalance.convoy.serviceRadius
          : false;

        if (assignedEntry && adjacentToAssigned) {
          const assignedState = this.getSupplyStateForHex(faction, assignedEntry.unit.hex);
          if (assignedState) {
            const delivered = this.deliverConvoyCargoToUnit(faction, truckState, assignedEntry.unit, assignedState, assignedEntry.definition);
            assignedEntry.ammoNeed = Math.max(0, (assignedEntry.definition.ammo ?? 0) - assignedState.ammo);
            assignedEntry.fuelNeed = this.unitConsumesFuel(assignedEntry.definition)
              ? Math.max(0, (assignedEntry.definition.fuel ?? 0) - assignedState.fuel)
              : 0;
            assignedEntry.status = delivered
              ? (assignedEntry.ammoNeed <= 0 && assignedEntry.fuelNeed <= 0 ? "resupplied" : "delivering")
              : assignedEntry.status;
            if (assignedEntry.ammoNeed <= 0 && assignedEntry.fuelNeed <= 0) {
              truckState.assignedUnitId = null;
            }
          }
          return;
        }

        const occupied = this.buildUnifiedOccupancySet();
        occupied.delete(axialKey(truck.hex));

        let destinationOptions: Axial[] = [];
        if (assignedEntry && (truckState.ammoCargo > 0 || truckState.fuelCargo > 0)) {
          destinationOptions = this.collectServiceHexes(assignedEntry.unit.hex, truck.hex);
          truckState.status = "delivering";
        } else {
          destinationOptions = this.collectSourceApproachHexes(faction, truck.hex);
          truckState.assignedUnitId = null;
          truckState.status = atSource ? "idle" : "returning";
        }

        const availableFuel = this.resolveFuelBudget(truck, truckDefinition);
        const plan = this.findCheapestPathToAny(
          truck.hex,
          destinationOptions,
          truckDefinition.moveType,
          occupied,
          Number.isFinite(availableFuel) ? availableFuel : undefined
        );

        if (!plan || plan.path.length <= 1) {
          if (!atSource && destinationOptions.length > 0) {
            truckState.status = "blocked";
          }
          return;
        }

        let remainingMove = Math.max(1, truckDefinition.movement ?? 1);
        let fuelSpent = 0;
        let current = structuredClone(truck.hex);
        const traveled: Axial[] = [structuredClone(truck.hex)];

        for (let index = 1; index < plan.path.length; index += 1) {
          const step = plan.path[index];
          const stepCost = this.resolveMoveCost(truckDefinition.moveType, this.terrainAt(step), step);
          const stepFuel = this.resolveMovementFuelStep(truckDefinition.moveType, step);
          if (stepCost > remainingMove) {
            break;
          }
          if (Number.isFinite(availableFuel) && fuelSpent + stepFuel > availableFuel + 1e-6) {
            break;
          }
          if (this.isOccupied(step) && axialKey(step) !== axialKey(truck.hex)) {
            break;
          }
          current = structuredClone(step);
          remainingMove -= stepCost;
          fuelSpent += stepFuel;
          traveled.push(structuredClone(step));
        }

        if (traveled.length <= 1) {
          return;
        }

        const fromKey = axialKey(truck.hex);
        const toKey = axialKey(current);
        this.getPlacementMapForFaction(faction).delete(fromKey);
        truck.facing = this.resolveFacingToward(truck.hex, current, truck.facing);
        truck.hex = structuredClone(current);
        if (Number.isFinite(availableFuel) && fuelSpent > 0) {
          truck.fuel = Math.max(0, Number((truck.fuel - fuelSpent).toFixed(2)));
        }
        this.getPlacementMapForFaction(faction).set(toKey, structuredClone(truck));
        this.updateSupplyPositionForFaction(faction, traveled[0], current);
        this.syncFuelForFaction(faction, current, truck.fuel);

        if (this.isHexWithinSupplySourceRadius(truck.hex, faction)) {
          this.loadSupplyTruckFromDepot(faction, supplyState, truck, truckSupplyState, truckState);
        }

        if (assignedEntry && hexDistance(truck.hex, assignedEntry.unit.hex) <= supplyBalance.convoy.serviceRadius) {
          const assignedState = this.getSupplyStateForHex(faction, assignedEntry.unit.hex);
          if (assignedState) {
            const delivered = this.deliverConvoyCargoToUnit(faction, truckState, assignedEntry.unit, assignedState, assignedEntry.definition);
            assignedEntry.ammoNeed = Math.max(0, (assignedEntry.definition.ammo ?? 0) - assignedState.ammo);
            assignedEntry.fuelNeed = this.unitConsumesFuel(assignedEntry.definition)
              ? Math.max(0, (assignedEntry.definition.fuel ?? 0) - assignedState.fuel)
              : 0;
            assignedEntry.status = delivered
              ? (assignedEntry.ammoNeed <= 0 && assignedEntry.fuelNeed <= 0 ? "resupplied" : "delivering")
              : assignedEntry.status;
            if (assignedEntry.ammoNeed <= 0 && assignedEntry.fuelNeed <= 0) {
              truckState.assignedUnitId = null;
            }
          }
        }
      });
  }

  /**
   * Appends a ledger entry for stockpile usage and reduces the corresponding inventory bucket.
   */
  private trackSupplyConsumption(faction: TurnFaction, key: SupplyKey, amount: number, reason: string): void {
    if (amount <= 0) {
      return;
    }
    const state = this.supplyStateByFaction[faction];
    recordConsumption(state, key, amount, this._turnNumber, reason);
  }

  /** Current supply mirror used between turns to track attrition. */
  private playerSupply: SupplyUnitState[] = [];
  private botSupply: SupplyUnitState[] = [];
  private allySupply: SupplyUnitState[] = [];
  /** Faction-level supply ledgers tracking stockpiles, shipments, and production history. */
  private supplyStateByFaction: Record<TurnFaction, SupplyState> = {
    Player: createSupplyState({ baseline: { ammo: 0, fuel: 0, rations: 0, parts: 0 } }),
    Bot: createSupplyState({ baseline: { ammo: 0, fuel: 0, rations: 0, parts: 0 } }),
    Ally: createSupplyState({ baseline: { ammo: 0, fuel: 0, rations: 0, parts: 0 } })
  };
  /** Convoy cargo and assignment state tracked independently from the truck unit's onboard fuel. */
  private readonly supplyTruckStateByFaction: Record<TurnFaction, Map<string, SupplyTruckState>> = {
    Player: new Map(),
    Bot: new Map(),
    Ally: new Map()
  };
  /** Optional player-configured resupply priorities keyed by the stable unit id. */
  private readonly supplyPriorityByUnitId = new Map<string, SupplyPriority>();
  /** Player-facing contact picture for enemy formations. Contacts persist briefly after LOS is lost. */
  private readonly playerEnemyContactStates = new Map<string, InternalEnemyContactState>();

  /** Per-turn action flags keyed by hex for basic gating. */
  private readonly playerActionFlags = new Map<string, { movementPointsUsed: number; attacksUsed: number; retaliationsUsed: number; isRushing: boolean }>();
  /** Hex keys for player-controlled units that still have full actions available this turn. */
  private readonly playerIdleUnitKeys = new Set<string>();
  private readonly botActionFlags = new Map<string, { movementPointsUsed: number; attacksUsed: number; retaliationsUsed: number; isRushing: boolean }>();
  /** Tracks remaining attack salvos for aircraft so we can require rearming after sustained operations. */
  private readonly playerAttackAmmo = new Map<string, AircraftAmmoState>();
  private readonly botAttackAmmo = new Map<string, AircraftAmmoState>();
  /** Static sortie definitions mirrored from data tables for quick lookup. */
  private readonly airMissionCatalog = AIR_MISSION_TEMPLATES;
  /** Active air missions keyed by mission id plus quick reverse lookup by squadron id. */
  private readonly scheduledAirMissions = new Map<string, ScheduledAirMission>();
  private readonly airMissionAssignmentsByUnit = new Map<string, string>();
  private readonly airMissionReports: AirMissionReportEntry[] = [];
  /** One-shot queue surfaced to the UI so arrivals can be animated at turn start. */
  private readonly pendingAirMissionArrivals: AirMissionArrival[] = [];
  /** One-shot queue of air-to-air engagements so UI can animate fighter interceptions. */
  private readonly pendingAirEngagements: AirEngagementEvent[] = [];
  private readonly pendingSupportImpactEvents: SupportImpactEvent[] = [];
  private airMissionIdCounter = 0;
  /** Refitting squadrons keyed by squadron id so planners know when they return to Ready status. */
  private readonly airMissionRefitTimers = new Map<string, { missionId: string; faction: TurnFaction; remaining: number }>();

  /** Counter for generating unique unit IDs within this engine session. */
  private unitIdCounter = 0;

  /** Generates a new unique unit ID. Format: "u_<timestamp>_<counter>" for global uniqueness. */
  private generateUnitId(): string {
    this.unitIdCounter += 1;
    return `u_${Date.now()}_${this.unitIdCounter}`;
  }

  /** Ensures a ScenarioUnit has a stable unitId assigned. Mutates the unit in place if missing. */
  private ensureUnitId(unit: ScenarioUnit): string {
    if (!unit.unitId) {
      unit.unitId = this.generateUnitId();
    }
    return unit.unitId;
  }

  /** Builds a stable id for a squadron so assignments remain distinct even when sharing a base hex.
   *  Uses the unit's persistent unitId if available; falls back to type@hex for legacy units. */
  private getSquadronId(unit: ScenarioUnit): string {
    // Prefer the stable unitId if present; otherwise fall back to legacy type@hex format.
    return unit.unitId ?? `${unit.type}@${axialKey(unit.hex)}`;
  }
  /** Commander bonuses mirrored from the assigned general so UI panels can surface live modifiers. */
  private playerCommanderStats: CommanderBenefits = { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 };
  /** Cached summary of the most recent bot turn so callers can announce actions exactly once. */
  private pendingBotTurnSummary: BotTurnSummary | null = null;

  /** Reusable factory for default per-turn action flags so new entries stay consistent. */
  private createDefaultActionFlags(): { movementPointsUsed: number; attacksUsed: number; retaliationsUsed: number; isRushing: boolean } {
    return { movementPointsUsed: 0, attacksUsed: 0, retaliationsUsed: 0, isRushing: false };
  }

  private shouldTrackAsPlayerIdle(unit: ScenarioUnit): boolean {
    return !this.isAutomatedPlayerUnit(unit);
  }

  private updateIdleRegistryFor(hexKey: string): void {
    const unit = this.playerPlacements.get(hexKey);
    if (!unit) {
      this.playerIdleUnitKeys.delete(hexKey);
      return;
    }
    if (!this.shouldTrackAsPlayerIdle(unit)) {
      this.playerIdleUnitKeys.delete(hexKey);
      return;
    }
    const flags = this.playerActionFlags.get(hexKey) ?? this.createDefaultActionFlags();
    if (flags.movementPointsUsed === 0 && flags.attacksUsed === 0) {
      this.playerIdleUnitKeys.add(hexKey);
    } else {
      this.playerIdleUnitKeys.delete(hexKey);
    }
  }

  private rebuildPlayerIdleUnitSet(): void {
    this.playerIdleUnitKeys.clear();
    this.playerPlacements.forEach((unit, key) => {
      if (!this.shouldTrackAsPlayerIdle(unit)) {
        return;
      }
      const flags = this.playerActionFlags.get(key) ?? this.createDefaultActionFlags();
      if (flags.movementPointsUsed === 0 && flags.attacksUsed === 0) {
        this.playerIdleUnitKeys.add(key);
      }
    });
  }

  /** Clear suppression status for units of the given faction at the start of their turn. */
  private clearSuppressionFor(faction: TurnFaction): void {
    const placements = faction === "Player" ? this.playerPlacements : faction === "Bot" ? this.botPlacements : this.allyPlacements;

    placements.forEach(unit => {
      if (unit.suppressedBy && unit.suppressedBy.length > 0) {
        unit.suppressedBy = [];
      }
    });
  }

  private reconcilePlayerIdleUnitSet(): void {
    for (const key of Array.from(this.playerIdleUnitKeys)) {
      if (!this.playerPlacements.has(key)) {
        this.playerIdleUnitKeys.delete(key);
        continue;
      }
      const flags = this.playerActionFlags.get(key) ?? this.createDefaultActionFlags();
      if (flags.movementPointsUsed > 0 || flags.attacksUsed > 0) {
        this.playerIdleUnitKeys.delete(key);
      }
    }
  }

  getIdlePlayerUnitKeys(): string[] {
    this.reconcilePlayerIdleUnitSet();
    return Array.from(this.playerIdleUnitKeys);
  }

  /** Phase/turn tracking exposed to UI. */
  private _phase: BattlePhase = "deployment";
  private _activeFaction: TurnFaction = "Player";
  private _turnNumber = 1;

  /** Optional base camp chosen during deployment to anchor supply sources. */
  private _baseCamp: BaseCamp | null = null;

  /** Units purchased during precombat awaiting conversion into engine reserves. */
  private queuedAllocations: PendingReserveRequest[] = [];

  /**
   * Translates the mobility bonus percentage into a scalar applied to unit movement allowances.
   */
  private commanderMoveScalar(): number {
    const pct = this.playerCommanderStats.moveBonus ?? 0;
    return Math.max(0, 1 + pct / 100);
  }

  /**
   * Converts the supply bonus into a consumption/attrition reduction multiplier.
   * Returns 1 for the bot faction to prevent cross-faction leakage.
   */
  private commanderSupplyScalar(faction: TurnFaction): number {
    if (faction === "Player") {
      const bonus = this.playerSide.general?.supplyBonus ?? 0;
      return 1 - bonus / 100;
    }
    if (faction === "Ally" && this.allySide) {
      const bonus = this.allySide.general?.supplyBonus ?? 0;
      return 1 - bonus / 100;
    }
    return 1;
  }

  /**
   * Rounds scaled supply costs to two decimals so ledgers remain readable while preserving gradual savings.
   */
  private scaleSupplyAmount(amount: number, scalar: number): number {
    if (amount <= 0) {
      return 0;
    }
    return Number((amount * scalar).toFixed(2));
  }

  constructor(config: GameEngineConfig) {
    if (!config.botSide) {
      throw new Error("GameEngine initialization failed: botSide missing in config. Provide enemy forces in scenario before starting engine.");
    }

    this.scenario = config.scenario;
    this.unitTypes = config.unitTypes;
    this.terrain = config.terrain;
    this.playerSide = structuredClone(config.playerSide);
    this.botSide = structuredClone(config.botSide);
    this.allySide = config.allySide ? structuredClone(config.allySide) : null;
    this.ensureBaselineSupplyConvoysForSide(this.botSide);
    if (this.allySide) {
      this.ensureBaselineSupplyConvoysForSide(this.allySide);
    }
    // Default to legacy Simple bot to avoid behavior changes unless explicitly enabled.
    this.botStrategyMode = config.botStrategyMode ?? "Simple";
    // Default to Normal difficulty if not specified.
    this.botDifficulty = config.botDifficulty ?? "Normal";
    const generalStats = this.playerSide.general ?? { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0, moraleBonus: 0 };
    this.playerCommanderStats = structuredClone(generalStats);
    this.playerSupply = createSupplyUnits(this.playerSide.units ?? []);
    this.botSupply = createSupplyUnits(this.botSide.units ?? []);
    this.allySupply = createSupplyUnits(this.allySide?.units ?? []);
    this.rebuildSupplyStates();
    (this.botSide.units ?? []).forEach((unit) => {
      const clone = structuredClone(unit);
      // Assign a stable unique ID to each bot unit so air squadrons can be distinguished.
      this.ensureUnitId(clone);
      this.botPlacements.set(axialKey(clone.hex), clone);
    });
    // Seed ally placements if ally side is present. Ally units are always predeployed.
    if (this.allySide) {
      (this.allySide.units ?? []).forEach((unit) => {
        const clone = structuredClone(unit);
        this.ensureUnitId(clone);
        this.allyPlacements.set(axialKey(clone.hex), clone);
      });
    }
    if ((this.botSide.units?.length ?? 0) > 0 && this.botPlacements.size === 0) {
      // Fail fast so missing enemies are explicit instead of silently disappearing.
      throw new Error(
        `GameEngine initialization failed: seeded 0 bot placements from ${(this.botSide.units ?? []).length} bot units. Ensure scenario bot units are present and valid.`
      );
    }
    this.seedSupportAssets();
    this.resetSupplyHistory();
    this.recordSupplySnapshot("Player");
    this.recordSupplySnapshot("Bot");
    if (this.allySide) {
      this.recordSupplySnapshot("Ally");
    }

    // Initialize optional airbase capacity map from configuration if present.
    if (config.airbaseCapacities && Object.keys(config.airbaseCapacities).length > 0) {
      this.airbaseCapMap = { ...config.airbaseCapacities };
    }
  }

  /**
   * Placeholder helper seeding a tiny roster of support assets so UI scaffolding can render meaningful
   * cards until the real campaign data is wired. Intentional TODO marker keeps the follow-up visible.
   */
  private seedSupportAssets(): void {
    if (this.privateSupportAssets.length > 0) {
      return;
    }
    this.privateSupportAssets.push(
      {
        id: "support-artillery-alpha",
        label: "Heavy Artillery Battery",
        type: "artillery",
        status: "ready",
        charges: 2,
        maxCharges: 2,
        cooldown: 0,
        maxCooldown: 3,
        assignedHex: null,
        notes: "Off-map heavy artillery battery available for observer-directed fire missions.",
        queuedHex: null
      },
      {
        id: "support-airstrike-bravo",
        label: "Strike Wing Bravo",
        type: "air",
        status: "cooldown",
        charges: 1,
        maxCharges: 2,
        cooldown: 2,
        maxCooldown: 4,
        assignedHex: null,
        notes: "Fast attack squadron cycling through refuel/rearm",
        queuedHex: null
      },
      {
        id: "support-engineer-charlie",
        label: "Engineer Company Charlie",
        type: "engineering",
        status: "maintenance",
        charges: 0,
        maxCharges: 2,
        cooldown: 1,
        maxCooldown: 2,
        assignedHex: null,
        notes: "Bridging gear inspection scheduled",
        queuedHex: null
      }
    );
    this.invalidateSupportSnapshot();
  }

  /**
   * Finds the first reserve index whose scenario type matches the provided UI allocation key using DeploymentState aliasing.
   */
  private findReserveIndexByUnitKey(unitKey: string): number {
    const deploymentState = ensureDeploymentState();
    const scenarioType = deploymentState.getScenarioTypeForUnitKey(unitKey);
    console.log("[GameEngine] Resolving reserve index", {
      unitKey,
      scenarioType,
      reserveSnapshot: this.reserves.map((reserve, reserveIndex) => ({
        reserveIndex,
        allocationKey: reserve.allocationKey ?? null,
        scenarioType: reserve.unit.type
      }))
    });
    return this.reserves.findIndex((reserve) => {
      if (reserve.allocationKey === unitKey) {
        return true;
      }
      if (scenarioType) {
        return reserve.unit.type === scenarioType;
      }
      return false;
    });
  }

  /**
   * Shared deployment write-path used by deployUnit() and deployUnitByKey() once the reserve entry has been resolved.
   */
  private commitDeployment(hex: Axial, entry: ReserveUnit): void {
    const key = axialKey(hex);
    if (this.playerPlacements.has(key)) {
      throw new Error(`Hex ${key} already contains a deployed unit.`);
    }
    const clone = structuredClone(entry.unit);
    clone.hex = structuredClone(hex);
    const deploymentState = ensureDeploymentState();
    const allocationKey = entry.allocationKey ?? deploymentState.getUnitKeyForScenarioType(clone.type as string);
    if (allocationKey) {
      const sprite = entry.sprite ?? deploymentState.getSpritePath(allocationKey);
      if (sprite) {
        deploymentState.registerSprite(allocationKey, sprite);
      }
    }
    this.playerPlacements.set(key, clone);
    this.playerIdleUnitKeys.add(key);
    // Refresh cached roster data so battle panels reflect newly deployed units without a manual refresh.
    this.invalidateRosterCache();
  }

  /**
   * Converts an axial key string back into Axial coordinates; throws if malformed so callers fail fast during deployment orchestration.
   */
  static parseAxialKey(hexKey: string): Axial {
    const [qPart, rPart] = hexKey.split(",");
    const q = Number.parseInt(qPart ?? "", 10);
    const r = Number.parseInt(rPart ?? "", 10);
    if (Number.isNaN(q) || Number.isNaN(r)) {
      throw new Error(`Invalid axial key '${hexKey}'. Expected format 'q,r'.`);
    }
    return { q, r } satisfies Axial;
  }

  /**
   * Builds a fully-initialized engine from a serialized battle snapshot. The helper instantiates a fresh
   * engine using the provided config and then hydrates placements, reserves, and turn metadata so callers
   * can resume previous sessions without touching private internals.
   */
  static fromSerialized(config: GameEngineConfig, state: SerializedBattleState): GameEngine {
    const engine = new GameEngine(config);
    engine.hydrateFromSerialized(state);
    return engine;
  }

  static buildScenarioUnitsFromAllocation(
    allocations: readonly DeploymentAllocation[],
    unitTypes: UnitTypeDictionary
  ): ScenarioUnit[] {
    return allocations.map((allocation) => {
      const definition = unitTypes[allocation.unitType];
      if (!definition) {
        throw new Error(`Unknown unit type '${allocation.unitType}'.`);
      }
      return {
        type: allocation.unitType,
        hex: structuredClone(allocation.hex),
        strength: allocation.strength ?? 100,
        experience: allocation.experience ?? 0,
        ammo: allocation.ammo ?? definition.ammo,
        fuel: allocation.fuel ?? definition.fuel,
        entrench: allocation.entrench ?? 0,
        facing: allocation.facing ?? "N"
      } satisfies ScenarioUnit;
    });
  }

  /** Current lifecycle phase (deployment, player turn, etc.). */
  get phase(): BattlePhase {
    return this._phase;
  }

  /** Numeric turn counter starting at 1. */
  get turnNumber(): number {
    return this._turnNumber;
  }

  /** Faction currently able to issue orders. */
  get activeFaction(): TurnFaction {
    return this._activeFaction;
  }

  /** Base camp hex chosen by the player, or null if not yet selected. */
  get baseCamp(): BaseCamp | null {
    return this._baseCamp;
  }

  /**
   * Returns defensive copies of all player-controlled units currently on the map so UI lists can sync
   * without mutating the engine's internal state.
   */
  get playerUnits(): ScenarioUnit[] {
    return Array.from(this.playerPlacements.values()).map((unit) => structuredClone(unit));
  }

  /**
   * Surfaces bot deployments with defensive copies for dashboards and debugging tools that render AI assets.
   */
  get botUnits(): ScenarioUnit[] {
    return Array.from(this.botPlacements.values()).map((unit) => structuredClone(unit));
  }

  /**
   * Surfaces ally deployments with defensive copies. Ally units are AI-controlled but can be transferred to player control.
   */
  get allyUnits(): ScenarioUnit[] {
    return Array.from(this.allyPlacements.values()).map((unit) => structuredClone(unit));
  }

  /**
   * Supplies a snapshot of the reserve queue so UI panes can display upcoming reinforcements.
   */
  get reserveUnits(): ReserveUnit[] {
    return this.reserves.map((entry) => ({ unit: structuredClone(entry.unit), definition: entry.definition }));
  }

  /**
   * Returns defensive copies of support assets so UI consumers cannot mutate engine state directly.
   */
  get supportAssets(): SupportAssetSnapshot[] {
    return this.privateSupportAssets.map((asset) => this.mapSupportAsset(asset));
  }

  /**
   * Provides an aggregated, readiness-grouped snapshot of all support assets for the Support sidebar.
   * The snapshot is cached and cloned so UI consumers can render without mutating engine state.
   */
  getSupportSnapshot(): SupportSnapshot {
    if (this.cachedSupportSnapshot) {
      return structuredClone(this.cachedSupportSnapshot);
    }
    const snapshot = this.buildSupportSnapshot();
    this.cachedSupportSnapshot = snapshot;
    return structuredClone(snapshot);
  }

  /**
   * Returns the latest cached supply snapshot for the requested faction.
   * The snapshot is cloned to protect internal history arrays from mutation by UI layers.
   */
  getSupplySnapshot(faction: TurnFaction = "Player"): SupplySnapshot {
    const history = this.supplyHistoryByFaction[faction];
    if (history.length === 0) {
      const snapshot = this.computeSupplySnapshot(faction);
      this.storeSupplySnapshot(faction, snapshot);
      return structuredClone(snapshot);
    }
    return structuredClone(history[history.length - 1]);
  }

  /**
   * Exposes a defensive copy of the rolling supply history so overlays can plot trendlines.
   */
  getSupplyHistory(faction: TurnFaction = "Player"): SupplySnapshot[] {
    return this.supplyHistoryByFaction[faction].map((entry) => structuredClone(entry));
  }

  /**
   * Supplies a unified recon & intelligence snapshot so sidebar panels can render coordinated insights.
   * The engine lazily seeds a placeholder snapshot until live battlefield sensors are wired.
   */
  getReconIntelSnapshot(): ReconIntelSnapshot {
    const snapshot = this.ensureReconIntelSnapshot();
    return structuredClone(snapshot);
  }

  getEnemyContactSnapshot(): EnemyContactSnapshot[] {
    this.refreshPlayerEnemyContactStates();
    return Array.from(this.playerEnemyContactStates.values())
      .map((entry) => this.mapEnemyContactSnapshot(entry))
      .filter((entry): entry is EnemyContactSnapshot => entry !== null)
      .sort((left, right) => {
        const stateRank = this.rankEnemyContactState(right.state) - this.rankEnemyContactState(left.state);
        if (stateRank !== 0) {
          return stateRank;
        }
        return right.lastSeenTurn - left.lastSeenTurn;
      });
  }

  deployCounterIntel(targetHex: Axial): { ok: true; operationId: string } | { ok: false; reason: string } {
    if (this._phase !== "playerTurn" || this._activeFaction !== "Player") {
      return { ok: false, reason: "Counter-intelligence can only be deployed during your turn." };
    }
    if (!this.inBounds(targetHex)) {
      return { ok: false, reason: "Choose an in-bounds map hex for the deception screen." };
    }
    if (this.playerCounterIntelResources.deceptionCharges <= 0) {
      return { ok: false, reason: "No deception teams are available this turn." };
    }

    const duplicate = Array.from(this.counterIntelOperations.values()).find((entry) => {
      return entry.faction === "Player" && axialKey(entry.targetHex) === axialKey(targetHex);
    });
    if (duplicate) {
      return { ok: false, reason: "A deception screen is already active on that axis." };
    }

    this.counterIntelIdCounter += 1;
    const operationId = `counter-intel-${this.counterIntelIdCounter}`;
    this.counterIntelOperations.set(operationId, {
      id: operationId,
      faction: "Player",
      targetHex: structuredClone(targetHex),
      radius: GameEngine.COUNTER_INTEL_OPERATION_RADIUS,
      remainingTurns: GameEngine.COUNTER_INTEL_OPERATION_DURATION_TURNS,
      strength: GameEngine.COUNTER_INTEL_OPERATION_STRENGTH
    });
    this.playerCounterIntelResources.deceptionCharges = Math.max(0, this.playerCounterIntelResources.deceptionCharges - 1);
    this.ensureReconIntelSnapshot();
    return { ok: true, operationId };
  }

  verifyIntelBrief(briefId: string): { ok: true; status: ReconIntelVerificationStatus } | { ok: false; reason: string } {
    if (!briefId) {
      return { ok: false, reason: "Select an intelligence brief to verify." };
    }
    if (this._phase !== "playerTurn" || this._activeFaction !== "Player") {
      return { ok: false, reason: "Intel verification can only be ordered during your turn." };
    }

    const snapshot = this.ensureReconIntelSnapshot();
    const brief = snapshot.intelBriefs.find((entry) => entry.id === briefId);
    if (!brief) {
      return { ok: false, reason: "The selected intelligence brief is no longer available." };
    }

    const state = this.intelBriefStates.get(briefId);
    if (!state) {
      return { ok: false, reason: "The selected intelligence brief is not tracked by the current scenario." };
    }
    if (state.verificationStatus === "verified" || state.verificationStatus === "confirmed-false") {
      return { ok: false, reason: "That brief has already been resolved." };
    }
    if (this.playerCounterIntelResources.verificationCharges <= 0) {
      return { ok: false, reason: "No verification cells are available this turn." };
    }

    this.playerCounterIntelResources.verificationCharges = Math.max(0, this.playerCounterIntelResources.verificationCharges - 1);
    state.verificationStatus = state.isFalse ? "confirmed-false" : "verified";
    this.intelBriefStates.set(briefId, state);
    this.ensureReconIntelSnapshot();
    return { ok: true, status: state.verificationStatus };
  }

  /**
   * Allows upstream systems (e.g., recon pipeline) to push updated intel snapshots into the engine cache.
   * Downstream UI consumers will receive the refreshed data the next time they request it.
   */
  updateReconIntelSnapshot(nextSnapshot: ReconIntelSnapshot): void {
    this.reconIntelSnapshot = structuredClone(nextSnapshot);
    this.ensureIntelBriefStatesForSnapshot(this.reconIntelSnapshot);
  }

  private rankEnemyContactState(state: EnemyContactState): number {
    switch (state) {
      case "visible":
        return 3;
      case "identified":
        return 2;
      case "spotted":
      default:
        return 1;
    }
  }

  private mapEnemyContactSnapshot(entry: InternalEnemyContactState): EnemyContactSnapshot | null {
    const liveLookup = this.lookupUnitBySquadronId(entry.unitId, "Bot");
    const currentlyObserved = Boolean(liveLookup && entry.lastSeenTurn === this._turnNumber);
    const turnsSinceSeen = this._turnNumber - entry.lastSeenTurn;
    if (!currentlyObserved && turnsSinceSeen >= GameEngine.ENEMY_CONTACT_MEMORY_TURNS) {
      return null;
    }

    const state: EnemyContactState = currentlyObserved ? entry.state : "spotted";
    const strengthSource = currentlyObserved ? liveLookup?.unit.strength ?? entry.lastKnownStrength : entry.lastKnownStrength;
    const strengthEstimate = this.resolveEnemyContactStrengthEstimate(state, strengthSource);

    return {
      unitId: entry.unitId,
      hex: structuredClone(currentlyObserved && liveLookup ? liveLookup.unit.hex : entry.lastKnownHex),
      state,
      lastSeenTurn: entry.lastSeenTurn,
      source: entry.source,
      unitType: state === "spotted" ? undefined : liveLookup?.unit.type ?? entry.knownUnitType ?? undefined,
      strengthEstimate: strengthEstimate ?? undefined
    };
  }

  private resolveEnemyContactStrengthEstimate(state: EnemyContactState, strength: number | null): number | null {
    if (!Number.isFinite(strength)) {
      return null;
    }
    if (state === "visible") {
      return Math.max(0, Math.round(strength!));
    }
    if (state === "identified") {
      return Math.min(100, Math.max(25, Math.round(strength! / 25) * 25));
    }
    return null;
  }

  private refreshPlayerEnemyContactStates(): void {
    const observers = this.listPlayerReconObservers();
    const liveBotIds = new Set<string>();

    this.botPlacements.forEach((target) => {
      const targetDefinition = this.getUnitDefinition(target.type);
      if (targetDefinition.moveType === "air") {
        return;
      }

      const unitId = this.ensureUnitId(target);
      liveBotIds.add(unitId);
      const observation = this.evaluateEnemyObservationForPlayer(target, observers);
      const existing = this.playerEnemyContactStates.get(unitId);

      if (observation) {
        this.playerEnemyContactStates.set(unitId, {
          unitId,
          state: observation.state,
          lastSeenTurn: this._turnNumber,
          lastKnownHex: structuredClone(target.hex),
          lastKnownStrength: target.strength,
          knownUnitType: target.type,
          source: observation.source
        });
        return;
      }

      if (!existing) {
        return;
      }

      if (this._turnNumber - existing.lastSeenTurn >= GameEngine.ENEMY_CONTACT_MEMORY_TURNS) {
        this.playerEnemyContactStates.delete(unitId);
        return;
      }

      if (existing.state !== "spotted") {
        this.playerEnemyContactStates.set(unitId, {
          ...existing,
          state: "spotted",
          lastKnownHex: structuredClone(existing.lastKnownHex)
        });
      }
    });

    Array.from(this.playerEnemyContactStates.entries()).forEach(([unitId, entry]) => {
      if (!liveBotIds.has(unitId) || this._turnNumber - entry.lastSeenTurn >= GameEngine.ENEMY_CONTACT_MEMORY_TURNS) {
        this.playerEnemyContactStates.delete(unitId);
      }
    });
  }

  private listPlayerReconObservers(): ScenarioUnit[] {
    return [...Array.from(this.playerPlacements.values()), ...Array.from(this.allyPlacements.values())].filter((unit) => {
      const definition = this.getUnitDefinition(unit.type);
      return definition.moveType !== "air" || definition.class === "recon";
    });
  }

  private evaluateEnemyObservationForPlayer(
    target: ScenarioUnit,
    observers: readonly ScenarioUnit[]
  ): { state: EnemyContactState; source: string } | null {
    interface CandidateContact {
      rank: number;
      state: EnemyContactState;
      source: string;
    }

    const lister = this.createLosLister();
    let bestContact: CandidateContact | null = null;

    for (const observer of observers) {
      const observerDef = this.getUnitDefinition(observer.type);
      const distance = hexDistance(observer.hex, target.hex);
      if (distance > this.resolveSpottingRange(observerDef)) {
        continue;
      }

      const hasLOS = losClearAdvanced({
        attackerClass: observerDef.class,
        attackerHex: observer.hex,
        targetHex: target.hex,
        isAttackerAir: observerDef.moveType === "air",
        lister
      });
      if (!hasLOS) {
        continue;
      }

      const state: EnemyContactState = observerDef.class === "recon" || observerDef.moveType === "air" ? "identified" : "visible";
      const rank = this.rankEnemyContactState(state);
      if (!bestContact || rank > bestContact.rank) {
        bestContact = {
          rank,
          state,
          source: this.describeEnemyObservationSource(observerDef, observer)
        };
      }
    }

    if (!bestContact) {
      return null;
    }
    return { state: bestContact.state, source: bestContact.source };
  }

  /**
   * Auto-provisions a small convoy pool for AI-controlled factions when scenarios omit dedicated
   * logistics units. This keeps enemy supply lines targetable without requiring every mission author
   * to hand-place truck counters.
   */
  private ensureBaselineSupplyConvoysForSide(side: ScenarioSide): void {
    const units = side.units ?? [];
    if (!side.units) {
      side.units = units;
    }
    if (units.some((unit) => this.isSupplyTruckType(unit.type))) {
      return;
    }

    const frontlineUnits = units.filter((unit) => {
      if (this.isSupplyTruckType(unit.type)) {
        return false;
      }
      const definition = this.getUnitDefinition(unit.type);
      return definition.moveType !== "air";
    });
    if (frontlineUnits.length === 0) {
      return;
    }

    const origin = side.hq ?? frontlineUnits[0]?.hex;
    if (!origin) {
      return;
    }

    const convoyTemplate = this.getUnitDefinition("Supply_Truck" as ScenarioUnit["type"]);
    const desiredConvoys = Math.max(1, Math.min(3, Math.ceil(frontlineUnits.length / 4)));
    const occupied = new Set<string>();
    [this.playerSide.units ?? [], this.botSide.units ?? [], this.allySide?.units ?? []].forEach((group) => {
      group.forEach((unit) => occupied.add(axialKey(unit.hex)));
    });

    const stagingHexes = this.collectConvoyStagingHexes(origin, desiredConvoys, occupied);
    stagingHexes.forEach((hex) => {
      units.push({
        type: "Supply_Truck" as ScenarioUnit["type"],
        hex: structuredClone(hex),
        strength: 100,
        experience: 0,
        ammo: 0,
        fuel: convoyTemplate.fuel ?? 70,
        entrench: 0,
        facing: "N"
      });
      occupied.add(axialKey(hex));
    });
  }

  /**
   * Finds a handful of open tiles around an HQ/source hex so auto-provisioned convoys spawn on-map
   * and remain immediately targetable.
   */
  private collectConvoyStagingHexes(origin: Axial, limit: number, occupied: Set<string>): Axial[] {
    const results: Axial[] = [];
    const queue: Axial[] = [structuredClone(origin)];
    const visited = new Set<string>([axialKey(origin)]);

    while (queue.length > 0 && results.length < limit) {
      const hex = queue.shift()!;
      const key = axialKey(hex);
      if (this.inBounds(hex) && !occupied.has(key)) {
        results.push(structuredClone(hex));
      }

      neighbors(hex).forEach((neighbor) => {
        const neighborKey = axialKey(neighbor);
        if (visited.has(neighborKey) || !this.inBounds(neighbor)) {
          return;
        }
        visited.add(neighborKey);
        queue.push(structuredClone(neighbor));
      });
    }

    return results;
  }

  private describeEnemyObservationSource(definition: UnitTypeDefinition, observer: ScenarioUnit): string {
    if (definition.moveType === "air") {
      return "Aerial Reconnaissance";
    }
    if (definition.class === "recon") {
      return "Recon Patrol";
    }
    if (observer.controlledBy === "AI") {
      return "Allied Forward Observer";
    }
    return "Frontline Observation";
  }

  private resolveSpottingRange(definition: UnitTypeDefinition): number {
    const baseRange = Math.max(1, definition.vision ?? 0);
    if (definition.moveType === "air") {
      return baseRange + GameEngine.AIR_SPOTTING_RANGE_BONUS;
    }
    if (definition.class === "recon") {
      return baseRange + GameEngine.RECON_SPOTTING_RANGE_BONUS;
    }
    return baseRange;
  }

  private getPlayerEnemyContactStateAtHex(targetHex: Axial): EnemyContactState | null {
    this.refreshPlayerEnemyContactStates();
    const targetKey = axialKey(targetHex);
    for (const entry of this.playerEnemyContactStates.values()) {
      const snapshot = this.mapEnemyContactSnapshot(entry);
      if (snapshot && axialKey(snapshot.hex) === targetKey) {
        return snapshot.state;
      }
    }
    return null;
  }

  private mapSupportAsset(asset: InternalSupportAsset): SupportAssetSnapshot {
    return {
      id: asset.id,
      label: asset.label,
      type: asset.type,
      status: asset.status,
      charges: asset.charges,
      maxCharges: asset.maxCharges,
      cooldown: asset.cooldown,
      maxCooldown: asset.maxCooldown,
      assignedHex: asset.assignedHex,
      notes: asset.notes,
      queuedHex: asset.queuedHex
    } satisfies SupportAssetSnapshot;
  }

  /**
   * Clears the cached support snapshot so the next request recomputes readiness groupings.
   * Called whenever support asset state changes (e.g., queueing actions, cooldown ticks).
   */
  private invalidateSupportSnapshot(): void {
    this.cachedSupportSnapshot = null;
  }

  /**
   * Queue a support asset for deployment to the selected hex. Marks the asset as queued and records the target.
   */
  queueSupportAction(assetId: string, targetHex: Axial): void {
    const asset = this.getInternalSupportAsset(assetId);
    asset.queuedHex = axialKey(targetHex);
    asset.status = "queued";
    this.invalidateSupportSnapshot();
    this.invalidateRosterCache();
  }

  queueSupportActionFromUnit(callerHex: Axial, assetId: string, targetHex: Axial): boolean {
    if (this._phase !== "playerTurn") {
      return false;
    }
    const caller = this.lookupUnit(callerHex, "Player");
    if (!caller || this.isAutomatedPlayerUnit(caller) || !this.getPlayerEnemyContactStateAtHex(targetHex)) {
      return false;
    }
    const callerDefinition = this.getUnitDefinition(caller.type);
    const canObserveSupport = callerDefinition.class === "infantry"
      || callerDefinition.class === "recon"
      || (callerDefinition.class === "specialist" && callerDefinition.moveType === "leg");
    if (!canObserveSupport) {
      return false;
    }
    const callerKey = axialKey(callerHex);
    const flags = this.playerActionFlags.get(callerKey) ?? this.createDefaultActionFlags();
    if (flags.attacksUsed > 0 || flags.movementPointsUsed > 0) {
      return false;
    }
    const asset = this.getInternalSupportAsset(assetId);
    if (asset.status !== "ready" || asset.charges <= 0) {
      return false;
    }
    asset.queuedHex = axialKey(targetHex);
    asset.status = "queued";
    this.playerActionFlags.set(callerKey, this.resolveCommittedFieldActionFlags(callerHex, flags));
    this.updateIdleRegistryFor(callerKey);
    this.invalidateSupportSnapshot();
    this.invalidateRosterCache();
    return true;
  }

  /**
   * Exposes mission templates so UI layers can present identical copy without duplicating data lookups.
   * The catalog is read-only and sourced from `src/data/airMissions.ts`.
   */
  listAirMissionTemplates(): readonly AirMissionTemplate[] {
    return this.airMissionCatalog;
  }

  /**
   * Returns lightweight counts used by HUD widgets to summarize Air Support activity for the active faction.
   */
  getAirSupportSummary(): { queued: number; inFlight: number; resolving: number; completed: number; refit: number } {
    const missions = Array.from(this.scheduledAirMissions.values()).filter((m) => m.faction === this._activeFaction);
    const byStatus = missions.reduce<Record<AirMissionStatus, number>>((acc, m) => {
      acc[m.status] = (acc[m.status] ?? 0) + 1;
      return acc;
    }, { queued: 0, inFlight: 0, resolving: 0, completed: 0 } as Record<AirMissionStatus, number>);
    const refit = Array.from(this.airMissionRefitTimers.values()).filter((t) => t.faction === this._activeFaction).length;
    return {
      queued: byStatus.queued,
      inFlight: byStatus.inFlight,
      resolving: byStatus.resolving,
      completed: byStatus.completed,
      refit
    };
  }

  /**
   * Returns the aircraft's combat radius in hexes at the provided origin for the active faction.
   * UI uses this to draw a range overlay when scheduling missions. Null when no friendly aircraft present.
   */
  getAircraftCombatRadiusHex(origin: Axial): number | null {
    const unit = this.lookupUnit(origin, this._activeFaction);
    if (!unit) {
      return null;
    }
    const def = this.getUnitDefinition(unit.type);
    if (!this.isAircraft(def) || !def.airSupport) {
      return null;
    }
    const radiusKm = def.airSupport.combatRadiusKm;
    const radiusHex = Math.max(0, Math.floor(radiusKm / GameEngine.KILOMETERS_PER_HEX));
    return Number.isFinite(radiusHex) ? radiusHex : null;
  }

  /**
   * Returns refit turns for a friendly aircraft at the given origin, or null when not applicable.
   */
  getAircraftRefitTurns(origin: Axial): number | null {
    const unit = this.lookupUnit(origin, this._activeFaction);
    if (!unit) {
      return null;
    }
    const def = this.getUnitDefinition(unit.type);
    if (!this.isAircraft(def) || !def.airSupport) {
      return null;
    }
    return def.airSupport.refitTurns ?? null;
  }

  /** Returns serialized mission snapshots, optionally filtered to a specific faction for UI convenience. */
  getScheduledAirMissions(faction: TurnFaction = this._activeFaction): readonly SerializedAirMission[] {
    const missions = Array.from(this.scheduledAirMissions.values()).filter((mission) => mission.faction === faction);
    return missions.map((mission) => this.serializeAirMission(mission));
  }

  /** Returns a snapshot of recorded sortie reports so UI/analytics can surface mission outcomes. */
  getAirMissionReports(): readonly AirMissionReportEntry[] {
    return this.airMissionReports.map((entry) => structuredClone(entry));
  }

  /** Returns and clears the queue of mission arrivals that transitioned to inFlight since last read. */
  consumeAirMissionArrivals(): AirMissionArrival[] {
    if (this.pendingAirMissionArrivals.length === 0) {
      return [];
    }
    const copy = this.pendingAirMissionArrivals.map((e) => ({ ...e, targetHex: e.targetHex ? structuredClone(e.targetHex) : undefined }));
    this.pendingAirMissionArrivals.length = 0;
    return copy;
  }

  /** Returns and clears any recorded air-to-air engagements since the last read. */
  consumeAirEngagements(): AirEngagementEvent[] {
    if (this.pendingAirEngagements.length === 0) {
      return [];
    }
    const copy = this.pendingAirEngagements.map((e) => ({
      ...e,
      location: structuredClone(e.location),
      bomber: { ...e.bomber },
      interceptors: e.interceptors.map((x) => ({ ...x })),
      escorts: e.escorts.map((x) => ({ ...x }))
    }));
    this.pendingAirEngagements.length = 0;
    return copy;
  }

  consumeSupportImpactEvents(): SupportImpactEvent[] {
    if (this.pendingSupportImpactEvents.length === 0) {
      return [];
    }
    const copy = this.pendingSupportImpactEvents.map((event) => ({
      ...event,
      targetHex: structuredClone(event.targetHex)
    }));
    this.pendingSupportImpactEvents.length = 0;
    return copy;
  }

  /**
   * Register a new sortie for the active faction. Validation is intentionally strict to prevent partial state.
   * Future resolution phases will consume the queued missions at end-of-turn.
   */
  scheduleAirMission(request: ScheduleAirMissionInput): string {
    const result = this.tryScheduleAirMission(request);
    if (!result.ok) {
      throw new Error(result.reason);
    }
    return result.missionId;
  }

  /**
   * Structured scheduling entry point that returns error codes and reasons instead of throwing.
   * The method performs all validations and, on success, queues a mission identical to scheduleAirMission.
   */
  tryScheduleAirMission(request: ScheduleAirMissionInput): { ok: true; missionId: string } | { ok: false; code: ScheduleAirMissionErrorCode; reason: string } {
    if (this._phase === "deployment" || this._phase === "completed") {
      return { ok: false, code: "PHASE_INVALID", reason: "Air missions can only be scheduled during an active battle." };
    }
    if (request.faction !== this._activeFaction) {
      return { ok: false, code: "WRONG_FACTION", reason: "Only the active faction may schedule missions during its turn." };
    }

    const template = this.getAirMissionTemplate(request.kind);

    // Resolve the squadron at the requested origin, preferring aircraft whose roles match the mission requirements.
    const originKey = axialKey(request.unitHex);
    let unit: ScenarioUnit | null = null;

    // Collect candidate units at this origin: deployed first, then (for the player) matching reserves.
    const candidates: ScenarioUnit[] = [];
    const placementMap = request.faction === "Player" ? this.playerPlacements : this.botPlacements;
    const deployed = placementMap.get(originKey) ?? null;
    if (deployed) {
      candidates.push(deployed);
    }
    if (request.faction === "Player") {
      this.reserves.forEach((entry) => {
        if (axialKey(entry.unit.hex) === originKey) {
          candidates.push(entry.unit);
        }
      });
    }

    if (candidates.length === 0) {
      return { ok: false, code: "NO_UNIT_AT_HEX", reason: "No eligible squadron is stationed at the selected hex." };
    }

    // Prefer an aircraft with an Air Support profile whose roles intersect with the mission's allowed roles.
    let hasAircraft = false;
    let hasRoleEligibleAircraft = false;
    let sawAssigned = false;
    let sawNeedsRefit = false;
    for (const candidate of candidates) {
      const def = this.getUnitDefinition(candidate.type);
      if (this.isAircraft(def)) {
        hasAircraft = true;
      }
      if (!this.isAircraft(def) || !def.airSupport) {
        continue;
      }
      const roles = def.airSupport.roles ?? [];
      if (!template.allowedRoles.some((role) => roles.includes(role))) {
        continue;
      }

      hasRoleEligibleAircraft = true;
      const candidateKey = this.getSquadronId(candidate);
      if (this.airMissionAssignmentsByUnit.has(candidateKey)) {
        sawAssigned = true;
        continue;
      }
      if (this.aircraftNeedsRearm(request.faction, candidateKey)) {
        sawNeedsRefit = true;
        continue;
      }

      unit = candidate;
      break;
    }

    if (!unit) {
      if (!hasAircraft) {
        return {
          ok: false,
          code: "NOT_AIRCRAFT",
          reason:
            "The selected squadron is not an aircraft and cannot fly air missions. Choose an air squadron in the Squadron list."
        };
      }
      if (hasRoleEligibleAircraft && (sawAssigned || sawNeedsRefit)) {
        if (sawNeedsRefit && !sawAssigned) {
          return { ok: false, code: "NEEDS_REFIT", reason: "All eligible squadrons at this hex must rearm before another mission." };
        }
        if (sawAssigned && !sawNeedsRefit) {
          return { ok: false, code: "ALREADY_ASSIGNED", reason: "All eligible squadrons at this hex already have missions queued." };
        }
        return { ok: false, code: "ALREADY_ASSIGNED", reason: "No eligible squadron at this hex is available to fly another mission." };
      }
      return { ok: false, code: "ROLE_NOT_ELIGIBLE", reason: "This aircraft is not suited to the requested mission." };
    }

    const unitDefinition = this.getUnitDefinition(unit.type);
    // Defensive guard: by construction, `unit` should already be an aircraft.
    if (!this.isAircraft(unitDefinition)) {
      return {
        ok: false,
        code: "NOT_AIRCRAFT",
        reason:
          "The selected squadron is not an aircraft and cannot fly air missions. Choose an air squadron in the Squadron list."
      };
    }
    if (!unitDefinition.airSupport) {
      return { ok: false, code: "NO_AIR_SUPPORT_PROFILE", reason: "This aircraft lacks an Air Support profile." };
    }

    // Enforce role eligibility against the template
    const roles = unitDefinition.airSupport.roles ?? [];
    if (!template.allowedRoles.some((role) => roles.includes(role))) {
      return { ok: false, code: "ROLE_NOT_ELIGIBLE", reason: "This aircraft is not suited to the requested mission." };
    }

    // Use the stable squadronId (derived from unitId) as the mission's unit key so multiple
    // squadrons at the same base can each fly missions without collision.
    const squadronId = this.getSquadronId(unit);
    if (this.airMissionAssignmentsByUnit.has(squadronId)) {
      return { ok: false, code: "ALREADY_ASSIGNED", reason: "This squadron already has a mission queued." };
    }
    if (this.aircraftNeedsRearm(request.faction, squadronId)) {
      return { ok: false, code: "NEEDS_REFIT", reason: "This squadron must rearm before another mission." };
    }
    // Keep the hex-based key for airbase capacity checks (multiple squadrons can share a base).
    const originHexKey = axialKey(request.unitHex);

    if (template.requiresTarget && !request.targetHex) {
      return { ok: false, code: "TARGET_REQUIRED", reason: "This mission requires selecting a target hex." };
    }
    if (template.requiresFriendlyEscortTarget && !request.escortTargetHex) {
      return { ok: false, code: "ESCORT_TARGET_REQUIRED", reason: "Escort missions require pairing with a friendly unit." };
    }
    if (request.targetHex && unitDefinition.airSupport) {
      try {
        this.assertAirMissionRange(unitDefinition.airSupport, request.unitHex, request.targetHex);
      } catch (e) {
        return { ok: false, code: "OUT_OF_RANGE", reason: (e as Error).message };
      }
    }

    // Escort guardrails: target must exist and not already be in-flight.
    let escortTargetUnitKey: string | undefined;
    if (request.escortTargetHex) {
      const escortTargetUnit = this.lookupUnit(request.escortTargetHex, request.faction, true);
      if (!escortTargetUnit) {
        return { ok: false, code: "ESCORT_TARGET_MISSING", reason: "Escort target unit was not found at the selected hex." };
      }
      try {
        this.assertEscortDistance(unitDefinition.airSupport, request.unitHex, request.escortTargetHex);
      } catch (e) {
        return { ok: false, code: "OUT_OF_RANGE", reason: (e as Error).message };
      }
      // Use the stable squadronId of the escort target so we can find it later even if multiple units share a hex.
      escortTargetUnitKey = this.getSquadronId(escortTargetUnit);
      const existingStrike = Array.from(this.scheduledAirMissions.values()).find(
        (m) => m.faction === request.faction && m.template.kind === "strike" && m.unitKey === escortTargetUnitKey && (m.status === "inFlight" || m.status === "resolving")
      );
      if (existingStrike) {
        return { ok: false, code: "ESCORT_TARGET_IN_FLIGHT", reason: "The protected strike package is already airborne." };
      }
    }

    // Airbase capacity: limit total queued departures from the origin hex when configured.
    // Note: capacity is checked per-hex, not per-squadron, so multiple squadrons at the same base share the limit.
    if (this.airbaseCapMap) {
      const cap = this.airbaseCapMap[originHexKey];
      if (typeof cap === "number" && cap >= 0) {
        const queuedFromBase = Array.from(this.scheduledAirMissions.values()).filter(
          (m) => m.status === "queued" && m.originHexKey === originHexKey
        ).length;
        if (queuedFromBase >= cap) {
          return { ok: false, code: "AIRBASE_CAPACITY_EXCEEDED", reason: "Airbase launch queue is at capacity for this hex." };
        }
      }
    }

    // Passed all validations: queue the mission.
    const missionId = this.nextAirMissionId();
    let targetUnitKey: string | undefined;
    if (template.kind === "strike" && request.targetHex) {
      const opponentPlacements = request.faction === "Player" ? this.botPlacements : this.playerPlacements;
      const defender = opponentPlacements.get(axialKey(request.targetHex));
      if (defender) {
        this.ensureUnitId(defender);
        targetUnitKey = defender.unitId;
      }
    }
    const mission: ScheduledAirMission = {
      id: missionId,
      template,
      faction: request.faction,
      // Store the stable squadronId so resolution can find the unit even if it moves or shares a base.
      unitKey: squadronId,
      // Preserve the origin hex for airbase capacity tracking and animation starting positions.
      originHexKey,
      unitType: unit.type,
      status: "queued",
      launchTurn: this._turnNumber,
      turnsRemaining: 0,
      targetHex: request.targetHex ? structuredClone(request.targetHex) : undefined,
      targetUnitKey,
      escortTargetUnitKey,
      interceptions: 0
    };
    this.scheduledAirMissions.set(missionId, mission);
    this.airMissionAssignmentsByUnit.set(squadronId, missionId);
    return { ok: true, missionId };
  }

  /** Cancels a queued air mission for the active faction. Returns true when a mission was canceled. */
  cancelQueuedAirMission(missionId: string): boolean {
    const mission = this.scheduledAirMissions.get(missionId);
    if (!mission) {
      return false;
    }
    if (mission.faction !== this._activeFaction) {
      return false;
    }
    if (mission.status !== "queued") {
      return false;
    }
    // Free the unit assignment lock and drop the mission.
    this.scheduledAirMissions.delete(missionId);
    this.clearAirMissionAssignment(mission);
    return true;
  }

  /**
   * Cancel any queued support orders so the asset returns to its previous readiness cycle.
   */
  cancelQueuedSupport(assetId: string): void {
    const asset = this.getInternalSupportAsset(assetId);
    asset.queuedHex = null;
    if (asset.cooldown > 0) {
      asset.status = "cooldown";
    } else if (asset.charges > 0) {
      asset.status = "ready";
    } else {
      asset.status = "maintenance";
    }
    this.invalidateSupportSnapshot();
    this.invalidateRosterCache();
  }

  private resolveQueuedSupportActions(): void {
    let mutated = false;
    this.privateSupportAssets.forEach((asset) => {
      if (asset.status !== "queued" || !asset.queuedHex) {
        return;
      }
      const targetKey = asset.queuedHex;
      const targetHex = GameEngine.parseAxialKey(targetKey);
      const defender = this.botPlacements.get(targetKey) ?? null;
      let damage = 0;
      let destroyed = false;
      let targetUnitType: ScenarioUnit["type"] | undefined;
      if (defender) {
        targetUnitType = defender.type;
        damage = Math.min(Math.max(0, Math.round(defender.strength)), 22);
        const updatedDefender = structuredClone(defender);
        updatedDefender.strength = Math.max(0, defender.strength - damage);
        if (updatedDefender.strength <= 0) {
          destroyed = true;
          this.botPlacements.delete(targetKey);
          this.removeBotSupplyEntryFor(targetHex);
          this.botAttackAmmo.delete(targetKey);
        } else {
          this.botPlacements.set(targetKey, updatedDefender);
          this.syncBotStrength(targetHex, updatedDefender.strength);
        }
        mutated = true;
      }
      this.pendingSupportImpactEvents.push({
        assetId: asset.id,
        label: asset.label,
        targetHex: structuredClone(targetHex),
        targetFaction: "Bot",
        hit: defender !== null,
        damage,
        destroyed,
        targetUnitType
      });
      asset.assignedHex = targetKey;
      asset.queuedHex = null;
      asset.cooldown = 0;
      asset.charges = Math.max(0, asset.charges - 1);
      asset.status = asset.charges > 0 ? "ready" : "maintenance";
      mutated = true;
    });
    if (!mutated) {
      return;
    }
    this.invalidateSupportSnapshot();
    this.invalidateRosterCache();
  }

  private ensureIntelBriefStatesForSnapshot(snapshot: ReconIntelSnapshot): void {
    snapshot.intelBriefs.forEach((brief) => {
      if (this.intelBriefStates.has(brief.id)) {
        return;
      }
      const isFalse = this.resolveFalseIntelFlag(brief);
      const verificationStatus: ReconIntelVerificationStatus =
        brief.id.startsWith("brief-recon-")
          ? "verified"
          : isFalse && brief.confidence === "low"
            ? "suspected-false"
            : "unverified";
      this.intelBriefStates.set(brief.id, {
        briefId: brief.id,
        isFalse,
        verificationStatus
      });
    });
  }

  private resolveFalseIntelFlag(brief: ReconIntelBrief): boolean {
    if (GameEngine.DEFAULT_FALSE_INTEL_BRIEF_IDS.has(brief.id)) {
      return true;
    }
    const text = `${brief.title} ${brief.assessment} ${brief.projectedImpact}`.toLowerCase();
    return brief.confidence === "low" && (text.includes("spoof") || text.includes("diversion") || text.includes("conflict"));
  }

  private countActiveReconObservers(): number {
    return this.listPlayerReconObservers().filter((unit) => {
      const definition = this.getUnitDefinition(unit.type);
      return definition.class === "recon" || definition.moveType === "air";
    }).length;
  }

  private summarizeEnemyContactAnchors(contacts: readonly EnemyContactSnapshot[]): string {
    const anchors = Array.from(new Set(contacts.slice(0, 3).map((contact) => axialKey(contact.hex))));
    return anchors.length > 0 ? anchors.join(" / ") : "Unknown axis";
  }

  private countKnownEnemyArmorContacts(contacts: readonly EnemyContactSnapshot[]): number {
    return contacts.reduce((count, contact) => {
      if (!contact.unitType) {
        return count;
      }
      const definition = this.getUnitDefinition(contact.unitType);
      return definition.class === "tank" || definition.class === "vehicle" ? count + 1 : count;
    }, 0);
  }

  private buildBattlefieldReconSectors(contacts: readonly EnemyContactSnapshot[]): ReconIntelSnapshot["sectors"] {
    const currentContacts = contacts.filter((entry) => entry.lastSeenTurn === this._turnNumber);
    const staleContacts = contacts.filter((entry) => entry.lastSeenTurn < this._turnNumber);
    const sectors: ReconIntelSnapshot["sectors"] = [];

    if (currentContacts.length > 0) {
      const visibleCount = currentContacts.filter((entry) => entry.state === "visible").length;
      const identifiedCount = currentContacts.filter((entry) => entry.state === "identified").length;
      const staleInPicture = currentContacts.filter((entry) => entry.state === "spotted").length;
      const confidence: ReconIntelSnapshot["sectors"][number]["confidence"] =
        visibleCount > 0 ? "high" : identifiedCount > 0 ? "medium" : "low";
      const coordinates = this.summarizeEnemyContactAnchors(currentContacts);
      const armorContacts = this.countKnownEnemyArmorContacts(currentContacts);
      sectors.push({
        id: "sector-recon-current",
        name: "Live Contact Picture",
        summary:
          armorContacts > 0
            ? `${currentContacts.length} hostile contact${currentContacts.length === 1 ? "" : "s"} plotted near ${coordinates}, including ${armorContacts} armored formation${armorContacts === 1 ? "" : "s"}.`
            : `${currentContacts.length} hostile contact${currentContacts.length === 1 ? "" : "s"} plotted near ${coordinates}.`,
        timeframe: "current",
        confidence,
        linkedBriefs: ["brief-recon-current"],
        coordinates,
        activity:
          visibleCount > 0
            ? `${visibleCount} formation${visibleCount === 1 ? "" : "s"} under direct observation, ${identifiedCount} held by recon sensors, ${staleInPicture} carried as stale contact memory.`
            : `${identifiedCount} formation${identifiedCount === 1 ? "" : "s"} held by recon sensors; fires can be cued without exposing line battalions.`
      });
    } else {
      const reconAssets = this.countActiveReconObservers();
      sectors.push({
        id: "sector-recon-gap",
        name: "Recon Coverage Gap",
        summary:
          reconAssets > 0
            ? "Recon screen has not confirmed enemy positions this turn."
            : "No dedicated recon elements are feeding the operational picture.",
        timeframe: "current",
        confidence: reconAssets > 0 ? "medium" : "low",
        linkedBriefs: ["brief-recon-gap"],
        coordinates: "Front-wide",
        activity:
          reconAssets > 0
            ? "Last known contacts have faded. Push scouts forward or re-task aircraft before committing reserves."
            : "Deploy recon battalions or launch scout aircraft to rebuild the enemy picture."
      });
    }

    if (staleContacts.length > 0) {
      const coordinates = this.summarizeEnemyContactAnchors(staleContacts);
      sectors.push({
        id: "sector-recon-last",
        name: "Last Reliable Contact",
        summary: `${staleContacts.length} enemy contact${staleContacts.length === 1 ? "" : "s"} remain on the board as last-known positions near ${coordinates}.`,
        timeframe: "last",
        confidence: staleContacts.some((entry) => entry.unitType) ? "medium" : "low",
        linkedBriefs: ["brief-recon-last"],
        coordinates,
        activity: "These plots are aging. Reconfirm them before committing reserves or planning interdiction fires."
      });
    }

    return sectors;
  }

  private buildBattlefieldIntelBriefs(
    contacts: readonly EnemyContactSnapshot[],
    sectors: readonly ReconIntelSnapshot["sectors"][number][]
  ): ReconIntelSnapshot["intelBriefs"] {
    const currentContacts = contacts.filter((entry) => entry.lastSeenTurn === this._turnNumber);
    const staleContacts = contacts.filter((entry) => entry.lastSeenTurn < this._turnNumber);
    const briefs: ReconIntelSnapshot["intelBriefs"] = [];

    if (currentContacts.length > 0) {
      const armorContacts = this.countKnownEnemyArmorContacts(currentContacts);
      const visibleCount = currentContacts.filter((entry) => entry.state === "visible").length;
      briefs.push({
        id: "brief-recon-current",
        title: armorContacts > 0 ? "Enemy armored elements fixed" : "Enemy contact picture refreshed",
        assessment:
          armorContacts > 0
            ? `${armorContacts} armored formation${armorContacts === 1 ? "" : "s"} are now plotted inside the live contact picture. Direct observation and recon hand-offs can cue counter-fire before the enemy closes.`
            : `${currentContacts.length} enemy contact${currentContacts.length === 1 ? "" : "s"} are tracked by the recon network. The contact picture is now good enough to shape fires and reserve posture.`,
        timeframe: "current",
        confidence: visibleCount > 0 ? "high" : "medium",
        linkedSectors: sectors.filter((sector) => sector.id === "sector-recon-current").map((sector) => sector.id),
        source: visibleCount > 0 ? "Frontline Observation" : "Recon Network",
        recommendedAction:
          armorContacts > 0
            ? "Shift anti-armor fires and hold reserves on the tracked axis while recon keeps the enemy fixed."
            : "Use the live contact picture to align fires, screen flanks, and protect convoy routes.",
        projectedImpact:
          armorContacts > 0
            ? "Shift anti-armor assets and artillery onto the tracked axis while recon keeps the column fixed."
            : "Exploit the refreshed picture to screen flanks and align supporting fires."
      });
    } else {
      const reconAssets = this.countActiveReconObservers();
      briefs.push({
        id: "brief-recon-gap",
        title: reconAssets > 0 ? "Enemy maneuver picture degraded" : "Recon net not established",
        assessment:
          reconAssets > 0
            ? "Your recon elements are deployed, but they are not feeding any confirmed enemy contacts right now. The operational picture is degraded rather than empty."
            : "No dedicated recon battalion or scout aircraft is currently building the contact picture, so enemy movement can develop without warning.",
        timeframe: "current",
        confidence: reconAssets > 0 ? "medium" : "low",
        linkedSectors: sectors.filter((sector) => sector.id === "sector-recon-gap").map((sector) => sector.id),
        source: "Recon Network",
        recommendedAction:
          reconAssets > 0
            ? "Push scouts onto likely avenues and re-establish contact before moving reserves."
            : "Commit recon assets before you trust the frontage to remain quiet.",
        projectedImpact:
          reconAssets > 0
            ? "Push scouts onto likely avenues and re-establish line-of-sight before reallocating reserves."
            : "Commit recon assets before you trust the enemy frontage to stay quiet."
      });
    }

    if (staleContacts.length > 0) {
      briefs.push({
        id: "brief-recon-last",
        title: "Last-known enemy plots are aging",
        assessment:
          "Some enemy markers now represent last-known positions rather than live observation. They still show likely approach lanes, but they must be revalidated before you commit a major response.",
        timeframe: "last",
        confidence: staleContacts.some((entry) => entry.unitType) ? "medium" : "low",
        linkedSectors: sectors.filter((sector) => sector.id === "sector-recon-last").map((sector) => sector.id),
        source: "Recon Network",
        recommendedAction: "Re-run reconnaissance over the aging plots before you swing reserves or logistics away from the sector.",
        projectedImpact: "Re-run reconnaissance over the aging plots before shifting logistics or reserve battalions off the main line."
      });
    }

    return briefs;
  }

  private buildBattlefieldIntelAlerts(contacts: readonly EnemyContactSnapshot[]): ReconIntelSnapshot["alerts"] {
    const currentContacts = contacts.filter((entry) => entry.lastSeenTurn === this._turnNumber);
    const staleContacts = contacts.filter((entry) => entry.lastSeenTurn < this._turnNumber);
    const alerts: ReconIntelSnapshot["alerts"] = [];

    if (currentContacts.length > 0) {
      const directSightContacts = currentContacts.filter((entry) => entry.state === "visible").length;
      const identifiedContacts = currentContacts.filter((entry) => entry.state === "identified").length;
      alerts.push({
        id: "alert-recon-current",
        severity: directSightContacts > 0 ? "critical" : "warning",
        timeframe: "current",
        message:
          directSightContacts > 0
            ? `${directSightContacts} enemy formation${directSightContacts === 1 ? "" : "s"} are under direct observation. The contact picture is firing-grade.`
            : `${identifiedContacts} enemy formation${identifiedContacts === 1 ? "" : "s"} are identified by recon but not yet held by direct LOS.`,
        action:
          directSightContacts > 0
            ? "Exploit the live picture with artillery, anti-armor fires, and reserve positioning."
            : "Keep recon sensors on station so the contact does not fall back to last-known only."
      });
    } else if (this.countActiveReconObservers() === 0) {
      alerts.push({
        id: "alert-recon-gap",
        severity: "warning",
        timeframe: "current",
        message: "No dedicated recon elements are feeding the enemy picture. Surprise movement risk is elevated.",
        action: "Deploy recon battalions or launch scout aircraft before the next turn cycle."
      });
    }

    if (staleContacts.length > 0) {
      alerts.push({
        id: "alert-recon-stale",
        severity: "info",
        timeframe: "last",
        message: `${staleContacts.length} contact${staleContacts.length === 1 ? "" : "s"} now sit on last-known plots rather than live observation.`,
        action: "Verify the stale plots before you pivot reserves or convoy routes."
      });
    }

    return alerts;
  }

  private buildVisibleReconIntelSnapshot(baseSnapshot: ReconIntelSnapshot): ReconIntelSnapshot {
    const contacts = this.getEnemyContactSnapshot();
    const activeOperations = this.getActiveCounterIntelOperations("Player");
    const battlefieldSectors = this.buildBattlefieldReconSectors(contacts);
    const battlefieldBriefs = this.buildBattlefieldIntelBriefs(contacts, battlefieldSectors);
    this.ensureIntelBriefStatesForSnapshot({
      ...baseSnapshot,
      intelBriefs: [...battlefieldBriefs, ...baseSnapshot.intelBriefs.filter((brief) => !brief.id.startsWith("brief-recon-"))]
    });
    const baseAlerts = baseSnapshot.alerts.filter((alert) => {
      return !alert.id.startsWith("alert-counter-intel-") && !alert.id.startsWith("alert-suspected-false-") && !alert.id.startsWith("alert-recon-");
    });
    const baseSectors = baseSnapshot.sectors.filter((sector) => !sector.id.startsWith("sector-recon-"));
    const combinedBriefs = [...battlefieldBriefs, ...baseSnapshot.intelBriefs.filter((brief) => !brief.id.startsWith("brief-recon-"))];
    const visibleBriefs = combinedBriefs.map((brief) => {
      const state = this.intelBriefStates.get(brief.id);
      const verificationStatus = state?.verificationStatus ?? "unverified";
      return {
        ...brief,
        verificationStatus,
        source: brief.source ?? this.describeIntelBriefSource(brief),
        recommendedAction:
          verificationStatus === "confirmed-false"
            ? "Disregard the false report and keep reserves committed to the confirmed axis."
            : brief.recommendedAction ?? brief.projectedImpact
      } satisfies ReconIntelBrief;
    });

    const suspectedFalseBriefs = visibleBriefs.filter((brief) => brief.verificationStatus === "suspected-false").length;
    const confirmedFalseBriefs = visibleBriefs.filter((brief) => brief.verificationStatus === "confirmed-false").length;
    const verifiedBriefs = visibleBriefs.filter((brief) => brief.verificationStatus === "verified").length;

    return {
      ...baseSnapshot,
      generatedAt: new Date().toISOString(),
      sectors: [...battlefieldSectors.map((sector) => ({ ...sector })), ...baseSectors.map((sector) => ({ ...sector }))],
      intelBriefs: visibleBriefs,
      alerts: [
        ...this.buildBattlefieldIntelAlerts(contacts).map((alert) => ({ ...alert })),
        ...baseAlerts.map((alert) => ({ ...alert })),
        ...this.buildDynamicReconIntelAlerts(activeOperations, suspectedFalseBriefs)
      ],
      counterIntel: {
        deceptionCharges: this.playerCounterIntelResources.deceptionCharges,
        deceptionMaxCharges: GameEngine.COUNTER_INTEL_MAX_DECEPTION_CHARGES,
        verificationCharges: this.playerCounterIntelResources.verificationCharges,
        verificationMaxCharges: GameEngine.COUNTER_INTEL_MAX_VERIFICATION_CHARGES,
        suspectedFalseBriefs,
        confirmedFalseBriefs,
        verifiedBriefs,
        doctrineSummary:
          "Deception screens create a false operational axis for three turns. Verification confirms whether a brief is true or enemy-fed noise before you redeploy reserves.",
        activeOperations: activeOperations.map((operation) => this.mapCounterIntelOperation(operation))
      }
    };
  }

  private buildDynamicReconIntelAlerts(
    operations: readonly InternalCounterIntelOperation[],
    suspectedFalseBriefs: number
  ): ReconIntelSnapshot["alerts"] {
    const alerts: ReconIntelSnapshot["alerts"] = [];
    if (operations.length > 0) {
      const focus = operations[0];
      alerts.push({
        id: `alert-counter-intel-${focus.id}`,
        severity: "info",
        timeframe: "current",
        message: `Counter-intelligence screen active near ${axialKey(focus.targetHex)}. Enemy maneuver estimates are being pulled off-axis.`,
        action: "Mask the real main effort while the decoy axis burns enemy time."
      });
    }
    if (suspectedFalseBriefs > 0) {
      alerts.push({
        id: `alert-suspected-false-${suspectedFalseBriefs}`,
        severity: "warning",
        timeframe: "current",
        message: `${suspectedFalseBriefs} brief${suspectedFalseBriefs === 1 ? "" : "s"} carry deception risk and should be verified before you shift reserves.`,
        action: "Commit verification cells before reacting to low-confidence intercepts."
      });
    }
    return alerts;
  }

  private describeIntelBriefSource(brief: ReconIntelBrief): string {
    if (brief.linkedSectors.length > 0 && brief.confidence === "high") {
      return "Field Recon + Analyst Fusion";
    }
    if (brief.assessment.toLowerCase().includes("signals") || brief.assessment.toLowerCase().includes("intercept")) {
      return "Signals Intercept";
    }
    return "Analyst Estimate";
  }

  private mapCounterIntelOperation(operation: InternalCounterIntelOperation): ReconIntelCounterIntelOperation {
    return {
      id: operation.id,
      label: `Deception Screen ${axialKey(operation.targetHex)}`,
      targetHex: axialKey(operation.targetHex),
      radius: operation.radius,
      remainingTurns: operation.remainingTurns,
      effect: "Enemy planning is biased toward this false approach."
    };
  }

  private getActiveCounterIntelOperations(faction: TurnFaction): InternalCounterIntelOperation[] {
    return Array.from(this.counterIntelOperations.values())
      .filter((entry) => entry.faction === faction && entry.remainingTurns > 0)
      .map((entry) => ({
        ...entry,
        targetHex: structuredClone(entry.targetHex)
      }));
  }

  private replenishPlayerCounterIntelResources(): void {
    this.playerCounterIntelResources = {
      deceptionCharges: Math.min(
        GameEngine.COUNTER_INTEL_MAX_DECEPTION_CHARGES,
        this.playerCounterIntelResources.deceptionCharges + 1
      ),
      verificationCharges: Math.min(
        GameEngine.COUNTER_INTEL_MAX_VERIFICATION_CHARGES,
        this.playerCounterIntelResources.verificationCharges + 1
      )
    };
  }

  private advanceCounterIntelTurn(): void {
    const expiredIds: string[] = [];
    this.counterIntelOperations.forEach((operation, key) => {
      if (operation.remainingTurns <= 0) {
        expiredIds.push(key);
        return;
      }
      operation.remainingTurns = Math.max(0, operation.remainingTurns - 1);
      if (operation.remainingTurns <= 0) {
        expiredIds.push(key);
      }
    });
    expiredIds.forEach((key) => this.counterIntelOperations.delete(key));
    this.replenishPlayerCounterIntelResources();
    this.ensureReconIntelSnapshot();
  }

  /**
   * Lazily hydrates the recon/intel snapshot cache, layering verification state and active counter-intel.
   */
  private ensureReconIntelSnapshot(): ReconIntelSnapshot {
    if (!this.reconIntelSnapshot) {
      this.reconIntelSnapshot = buildInitialReconIntelSnapshot();
    }
    this.ensureIntelBriefStatesForSnapshot(this.reconIntelSnapshot);
    this.reconIntelSnapshot = this.buildVisibleReconIntelSnapshot(this.reconIntelSnapshot);
    return this.reconIntelSnapshot;
  }

  /**
   * Reset deployment state by clearing placements and reserves. Called before presenting the
   * deployment UI. Does not mutate the scenario blueprint.
   */
  beginDeployment(): void {
    this.assertPhase("deployment", "Deployment can only begin in the deployment phase.");
    this.playerPlacements.clear();
    this.reserves.length = 0;
    this.airborneReserves.length = 0; // Clear airborne reserves as well.
    this.airMissionReports.length = 0; // Fresh deployment wipes historical sortie logs so saves start clean.
    this.playerAttackAmmo.clear();
    this.botAttackAmmo.clear();
    this.scheduledAirMissions.clear();
    this.airMissionAssignmentsByUnit.clear();
    this.airMissionIdCounter = 0;
    this.airMissionRefitTimers.clear();
    this.resetCounterIntelState();
    this.playerEnemyContactStates.clear();
    const deploymentState = ensureDeploymentState();
    const reserveBlueprints = deploymentState.toReserveBlueprints();
    // Capture scenario-authored units (including any preDeployed flags) before allocations overwrite the roster.
    const scenarioUnits: ScenarioUnit[] = (this.playerSide.units ?? []).map((unit) => structuredClone(unit));

    if (reserveBlueprints.length > 0) {
      // Mirror precombat-approved units into the engine roster so reserves reflect the latest allocation state.
      this.playerSide.units = reserveBlueprints.map((blueprint) => structuredClone(blueprint.unit));

      // Preserve any scenario-authored predeployed units even when precombat allocations are present.
      const scenarioPredeployed = scenarioUnits
        .filter((unit) => (unit as { preDeployed?: boolean }).preDeployed === true)
        .map((unit) => structuredClone(unit));

      if (scenarioPredeployed.length > 0) {
        scenarioPredeployed.forEach((unit) => {
          this.ensureUnitId(unit);
          const key = axialKey(unit.hex);
          this.playerPlacements.set(key, unit);
        });
        // Keep predeployed units in the playerSide roster so downstream snapshots stay consistent.
        this.playerSide.units.push(...scenarioPredeployed);
        console.warn("[GameEngine] Preserved scenario predeployed units alongside precombat allocations", {
          count: scenarioPredeployed.length,
          hexes: scenarioPredeployed.map((u) => axialKey(u.hex))
        });
      }

      this.populateReservesFromBlueprints(reserveBlueprints);
    } else {
      // Default to whatever units the scenario already listed for the player side.
      this.populateReservesFromPlayerUnits();
    }
    this._baseCamp = null;
    this.resetSupplyHistory();
    // Deployment roster changed drastically; drop cached snapshot so UI reads the refreshed reserve list immediately.
    this.invalidateRosterCache();
  }

  /**
   * Caches precombat requisitions so beginDeployment() can hydrate a fresh reserve list.
   * Entries are copied defensively to avoid mutating UI-managed data structures.
   */
  setQueuedAllocations(entries: readonly PendingReserveRequest[]): void {
    this.queuedAllocations = entries
      .filter((entry) => entry.count > 0)
      .map((entry) => ({ ...entry }));
  }

  /**
   * Builds reserve entries from the current `playerSide.units`, cloning each so UI movements never mutate the engine source.
   */
  populateReservesFromPlayerUnits(): void {
    const deploymentState = ensureDeploymentState();
    (this.playerSide.units ?? []).forEach((unit) => {
      const clone = structuredClone(unit);
      // Assign a stable unique ID to each unit if missing so air squadrons can be distinguished.
      this.ensureUnitId(clone);
      const definition = this.getUnitDefinition(clone.type);
      const scenarioType = clone.type as string;
      const allocationKey = deploymentState.getUnitKeyForScenarioType(scenarioType) ?? scenarioType;
      // Maintain alias tables even when the engine falls back to scenario defaults so DeploymentState can aggregate counts reliably.
      deploymentState.registerScenarioAlias(allocationKey, scenarioType);
      const sprite = deploymentState.getSpritePath(allocationKey);
      const isPreDeployed = (unit as unknown as { preDeployed?: boolean }).preDeployed === true;
      if (isPreDeployed) {
        // Treat scenario-predeployed player units as placed on the map at deployment start.
        const key = axialKey(clone.hex);
        this.playerPlacements.set(key, clone);
      } else {
        // Route airborne units to the separate airborne reserves pool.
        // These units are loaded at the airbase for air transport missions, not at the base camp.
        const isAirborne = allocationKey === "airborneDetachment" || clone.type === "Paratrooper";
        if (isAirborne) {
          this.airborneReserves.push({ unit: clone, definition, allocationKey, sprite });
        } else {
          // Preserve the allocation key and sprite so reserve presenters can render consistent imagery.
          this.reserves.push({ unit: clone, definition, allocationKey, sprite });
        }
      }
    });
  }

  /**
   * Populates reserves using blueprints emitted by `DeploymentState`, preserving unit-key associations for deploy-by-key flows.
   */
  private populateReservesFromBlueprints(blueprints: readonly ReserveBlueprint[]): void {
    const deploymentState = ensureDeploymentState();
    blueprints.forEach((blueprint) => {
      const clone = structuredClone(blueprint.unit);
      // Assign a stable unique ID to each unit if missing so air squadrons can be distinguished.
      this.ensureUnitId(clone);
      const definition = this.getUnitDefinition(clone.type);
      const sprite = blueprint.sprite ?? deploymentState.getSpritePath(blueprint.unitKey);
      const scenarioType = clone.type as string;
      // Sync alias mapping so the mirror logic can reconcile engine scenario types with UI allocation keys.
      deploymentState.registerScenarioAlias(blueprint.unitKey, scenarioType);
      // Route airborne units to the separate airborne reserves pool.
      // These units are loaded at the airbase for air transport missions, not at the base camp.
      const isAirborne = blueprint.unitKey === "airborneDetachment" || clone.type === "Paratrooper";
      if (isAirborne) {
        this.airborneReserves.push({ unit: clone, definition, allocationKey: blueprint.unitKey, sprite });
      } else {
        // Blueprint metadata links back to the allocation key so deploy-by-key flows stay accurate.
        this.reserves.push({ unit: clone, definition, allocationKey: blueprint.unitKey, sprite });
      }
    });
  }

  /** Assign the commander-selected base camp and update supply origins accordingly. */
  setBaseCamp(hex: Axial): void {
    this.assertPhase("deployment", "Base camp selection is limited to deployment.");
    this._baseCamp = { hex: structuredClone(hex), key: axialKey(hex) };
    this.playerAttackAmmo.clear(); // Reset aircraft attack ammo counters
  }

  /**
   * Deploy a unit from the reserve pool to a specific hex during the deployment phase.
   * Units are addressed by reserve index so UI state does not need to carry references.
   */
  deployUnit(hex: Axial, reserveIndex: number): void {
    this.assertPhase("deployment", "Units can only be deployed during the deployment phase.");
    const entry = this.reserves[reserveIndex];
    if (!entry) {
      throw new Error("Reserve index out of range.");
    }
    if (this.isAircraft(entry.definition)) {
      throw new Error("Air units are controlled via Air Support and cannot be deployed on the ground map.");
    }
    // Commit the deployment before mutating the reserve queue so failed placements do not discard the unit.
    this.commitDeployment(hex, entry);
    this.reserves.splice(reserveIndex, 1);
    this.playerAttackAmmo.delete(axialKey(hex));
  }

  /**
   * Deploy a unit by referencing its allocation key instead of relying on reserve indexes.
   * UI flows prefer stable keys, so we scan the reserve queue, remove the first matching entry, and forward to commitDeployment().
   */
  deployUnitByKey(hex: Axial, unitKey: string): void {
    this.assertPhase("deployment", "Units can only be deployed during the deployment phase.");
    console.log("[GameEngine] deployUnitByKey invoked", { hex: axialKey(hex), unitKey });
    const index = this.findReserveIndexByUnitKey(unitKey);
    if (index < 0) {
      console.error("[GameEngine] deployUnitByKey failed to locate reserve", {
        unitKey,
        reserves: this.reserves.map((reserve, reserveIndex) => ({
          reserveIndex,
          allocationKey: reserve.allocationKey,
          scenarioType: reserve.unit.type
        }))
      });
      throw new Error(`No reserve unit found for key '${unitKey}'.`);
    }
    const entry = this.reserves[index];
    if (!entry) {
      throw new Error(`Reserve queue returned undefined entry for key '${unitKey}'.`);
    }
    if (this.isAircraft(entry.definition)) {
      throw new Error("Air units are controlled via Air Support and cannot be deployed on the ground map.");
    }
    // Commit placement first so errors (e.g., hex already occupied) do not permanently remove the reserve.
    this.commitDeployment(hex, entry);
    this.reserves.splice(index, 1);
    this.playerAttackAmmo.delete(axialKey(hex));
  }

  /** Verify that deployment can be undone and return the unit to reserves. */
  recallUnit(hex: Axial): void {
    this.assertPhase("deployment", "Recalling units is only possible during deployment.");
    const key = axialKey(hex);
    const unit = this.playerPlacements.get(key);
    if (!unit) {
      return;
    }
    this.playerPlacements.delete(key);
    this.removeSupplyEntryFor(hex);
    const definition = this.getUnitDefinition(unit.type);
    const deploymentState = ensureDeploymentState();
    const allocationKey = deploymentState.getUnitKeyForScenarioType(unit.type as string) ?? unit.type;
    const sprite = deploymentState.getSpritePath(allocationKey);
    this.reserves.push({ unit: structuredClone(unit), definition, allocationKey, sprite });
    // Unit returns to reserve pool; clear roster cache so reserve counts rise immediately in the UI.
    this.invalidateRosterCache();
  }

  /**
   * Recall a unit using the precomputed axial key string so UI emitters do not need to reconstruct Axial coordinates.
   */
  recallUnitByHexKey(hexKey: string): void {
    const axial = GameEngine.parseAxialKey(hexKey);
    this.recallUnit(axial);
  }

  initializeFromAllocations(units: ScenarioUnit[]): void {
    this.assertPhase("deployment", "Allocations can only be loaded during deployment.");
    // Capture any scenario-predeployed units BEFORE replacing playerSide.units with allocations.
    // This preserves predeployed units even when precombat flows provide a replacement roster.
    const scenarioPredeployed = (this.playerSide.units ?? [])
      .filter((unit) => (unit as { preDeployed?: boolean }).preDeployed === true)
      .map((unit) => structuredClone(unit));

    this.playerSide.units = units.map((unit) => structuredClone(unit));

    // Append preserved predeployed units so beginDeployment can detect and place them.
    if (scenarioPredeployed.length > 0) {
      this.playerSide.units.push(...scenarioPredeployed);
      console.log("[GameEngine] initializeFromAllocations preserved predeployed scenario units", {
        count: scenarioPredeployed.length,
        types: scenarioPredeployed.map((u) => u.type)
      });
    }

    this.beginDeployment();
  }

  /**
   * Applies a serialized battle state to the current engine instance. We clear existing placements and
   * reserves, rebuild them from the snapshot, and refresh phase/turn metadata to match the saved session.
   */
  hydrateFromSerialized(state: SerializedBattleState): void {
    this.playerPlacements.clear();
    this.botPlacements.clear();
    this.hexModifications.clear();
    this.reserves.length = 0;
    this.airborneReserves.length = 0;
    this.scheduledAirMissions.clear();
    this.airMissionAssignmentsByUnit.clear();
    this.airMissionRefitTimers.clear();
    this.airMissionReports.length = 0;
    this.counterIntelOperations.clear();
    this.intelBriefStates.clear();
    this.playerEnemyContactStates.clear();

    state.playerPlacements.forEach((unit) => {
      const clone = structuredClone(unit);
      // Preserve existing unitId from saved state or assign a new one if missing (legacy saves).
      this.ensureUnitId(clone);
      this.playerPlacements.set(axialKey(clone.hex), clone);
    });
    state.botPlacements.forEach((unit) => {
      const clone = structuredClone(unit);
      // Preserve existing unitId from saved state or assign a new one if missing (legacy saves).
      this.ensureUnitId(clone);
      this.botPlacements.set(axialKey(clone.hex), clone);
    });
    state.reserves.forEach((unit) => {
      const clone = structuredClone(unit);
      // Preserve existing unitId from saved state or assign a new one if missing (legacy saves).
      this.ensureUnitId(clone);
      this.reserves.push({ unit: clone, definition: this.getUnitDefinition(clone.type) });
    });
    // Restore airborne reserves if present in the snapshot.
    if (Array.isArray(state.airborneReserves)) {
      state.airborneReserves.forEach((unit) => {
        const clone = structuredClone(unit);
        this.ensureUnitId(clone);
        this.airborneReserves.push({ unit: clone, definition: this.getUnitDefinition(clone.type) });
      });
    }
    if (Array.isArray(state.enemyContactStates)) {
      state.enemyContactStates.forEach((entry) => {
        this.playerEnemyContactStates.set(entry.unitId, {
          unitId: entry.unitId,
          state: entry.state,
          lastSeenTurn: entry.lastSeenTurn,
          lastKnownHex: structuredClone(entry.lastKnownHex),
          lastKnownStrength: entry.lastKnownStrength,
          knownUnitType: entry.knownUnitType,
          source: entry.source
        });
      });
    }
    if (Array.isArray(state.hexModifications)) {
      state.hexModifications.forEach((entry) => {
        const clone = structuredClone(entry);
        this.hexModifications.set(axialKey(clone.hex), clone);
      });
    }

    this._phase = state.phase;
    this._activeFaction = state.activeFaction;
    this._turnNumber = state.turnNumber;
    this._baseCamp = state.baseCamp
      ? { hex: structuredClone(state.baseCamp.hex), key: state.baseCamp.key }
      : null;

    this.playerSupply = createSupplyUnits(Array.from(this.playerPlacements.values()));
    this.botSupply = createSupplyUnits(Array.from(this.botPlacements.values()));
    this.resetSupplyHistory();

    // Restore air mission state if present in the snapshot so live sorties persist across saves.
    if (Array.isArray(state.airMissions)) {
      state.airMissions.forEach((entry) => this.restoreAirMission(entry));
    }
    if (Array.isArray(state.airMissionRefits)) {
      state.airMissionRefits.forEach((refit) => {
        this.airMissionRefitTimers.set(refit.unitKey, { missionId: refit.missionId, faction: refit.faction, remaining: refit.remaining });
      });
    }
    if (Array.isArray(state.airMissionReports)) {
      state.airMissionReports.forEach((entry) => this.airMissionReports.push(structuredClone(entry)));
    }

    this.reconIntelSnapshot = state.reconIntelSnapshot ? structuredClone(state.reconIntelSnapshot) : null;
    if (Array.isArray(state.counterIntelOperations)) {
      state.counterIntelOperations.forEach((entry) => {
        this.counterIntelOperations.set(entry.id, {
          id: entry.id,
          faction: entry.faction,
          targetHex: structuredClone(entry.targetHex),
          radius: entry.radius,
          remainingTurns: entry.remainingTurns,
          strength: entry.strength
        });
      });
    }
    if (Array.isArray(state.intelBriefStates)) {
      state.intelBriefStates.forEach((entry) => {
        this.intelBriefStates.set(entry.briefId, {
          briefId: entry.briefId,
          isFalse: entry.isFalse,
          verificationStatus: entry.verificationStatus
        });
      });
    }
    this.playerCounterIntelResources = {
      deceptionCharges: Math.max(
        0,
        Math.min(
          GameEngine.COUNTER_INTEL_MAX_DECEPTION_CHARGES,
          Math.round(state.counterIntelResources?.deceptionCharges ?? GameEngine.COUNTER_INTEL_MAX_DECEPTION_CHARGES)
        )
      ),
      verificationCharges: Math.max(
        0,
        Math.min(
          GameEngine.COUNTER_INTEL_MAX_VERIFICATION_CHARGES,
          Math.round(state.counterIntelResources?.verificationCharges ?? GameEngine.COUNTER_INTEL_MAX_VERIFICATION_CHARGES)
        )
      )
    };
    this.counterIntelIdCounter = Math.max(
      0,
      Math.round(state.counterIntelIdCounter ?? state.counterIntelOperations?.length ?? 0)
    );
  }

  /** Move the unit occupying the given hex into the reserve pool without deleting its stats. */
  moveToReserves(hex: Axial): void {
    const key = axialKey(hex);
    const unit = this.playerPlacements.get(key);
    if (!unit) {
      return;
    }
    this.playerPlacements.delete(key);
    this.playerIdleUnitKeys.delete(key);
    this.removeSupplyEntryFor(hex);
    this.reserves.push({ unit: structuredClone(unit), definition: this.getUnitDefinition(unit.type) });
    // Moving a unit back into reserves changes roster composition; clear cache so UI mirrors the new state.
    this.invalidateRosterCache();
  }

  /**
   * Transition from deployment to the main player turn. Returns the reserve list for UI display.
   * Throws if the base camp has not been selected.
   */
  finalizeDeployment(): ReserveUnit[] {
    this.assertPhase("deployment", "Deployment can only be finalized from the deployment phase.");
    if (!this._baseCamp) {
      throw new Error("Select a base camp before beginning the battle.");
    }
    // Ground units remain subject to normal deployment rules; air units stay off-map and operate solely via Air Support.
    // Previously, autoDeployAirReservesToBaseZone() would place aircraft into the base camp zone, which
    // caused them to appear as on-map units. That behavior is now disabled so squadrons are managed only
    // through the air mission system and not as standard ground deployments.
    this.playerSupply = createSupplyUnits(Array.from(this.playerPlacements.values()));
    this.botSupply = createSupplyUnits(this.botSide.units ?? []);
    this.recordSupplySnapshot("Player");
    return this.reserves.map((entry) => ({ unit: structuredClone(entry.unit), definition: entry.definition }));
  }

  /**
   * Switch the engine into the opening player turn once deployment is locked. Throws if deployment prerequisites are unmet.
   */
  startPlayerTurnPhase(): void {
    this.assertPhase("deployment", "Player turn can only begin immediately after deployment.");
    if (!this._baseCamp) {
      throw new Error("Select a base camp before beginning the battle.");
    }
    this._phase = "playerTurn";
    this._activeFaction = "Player";
    this._turnNumber = 1;
    this.playerActionFlags.clear();
    this.rebuildPlayerIdleUnitSet();
    this.refreshAircraftAmmoForFaction("Player");
  }

  /** Deploy a reserve unit mid-battle into an empty hex. */
  callUpReserve(reserveIndex: number, hex: Axial): void {
    this.assertNotPhase("deployment", "Call-ups happen after deployment.");
    if (!this.baseCamp) {
      throw new Error("Assign a base camp before calling up reserves.");
    }

    const deploymentState = ensureDeploymentState();
    const baseCampOffsetKey = this.toOffsetKey(this.baseCamp.hex);
    const targetOffsetKey = this.toOffsetKey(hex);

    const baseCampZoneKey = deploymentState.getZoneKeyForHex(baseCampOffsetKey);
    if (!baseCampZoneKey) {
      throw new Error("Base camp is not aligned with a deployment zone; reserves cannot deploy.");
    }

    if (!deploymentState.isHexWithinPlayerZone(targetOffsetKey)) {
      throw new Error("Reserves can only deploy within player-controlled deployment zones.");
    }

    if (deploymentState.getZoneKeyForHex(targetOffsetKey) !== baseCampZoneKey) {
      throw new Error("Reserves can only deploy within the base camp deployment zone.");
    }
    const entry = this.reserves[reserveIndex];
    if (!entry) {
      throw new Error("Reserve index out of range.");
    }
    if (this.isAircraft(entry.definition)) {
      throw new Error("Air units are controlled via Air Support and cannot be deployed as ground reserves.");
    }
    const key = axialKey(hex);
    if (this.playerPlacements.has(key)) {
      throw new Error("Target hex already occupied.");
    }
    const placement = structuredClone(entry.unit);
    placement.hex = structuredClone(hex);
    this.playerPlacements.set(key, placement);
    this.updateIdleRegistryFor(key);
    this.playerSupply.push({
      hex: structuredClone(hex),
      ammo: placement.ammo,
      fuel: placement.fuel,
      entrench: placement.entrench,
      strength: placement.strength
    });
    this.reserves.splice(reserveIndex, 1);
    this.resetPlayerHistoryCheckpoint();
    // Reserve queue shrank and frontline expanded; invalidate roster snapshot so roster popup updates instantly.
    this.invalidateRosterCache();
  }

  /** Deploy a reserve unit by its allocation key (or scenario alias) during player turns. */
  callUpReserveByKey(unitKey: string, hex: Axial): void {
    this.assertNotPhase("deployment", "Call-ups happen after deployment.");
    const index = this.findReserveIndexByUnitKey(unitKey);
    if (index < 0) {
      throw new Error("No matching reserve found for the provided unit key.");
    }
    this.callUpReserve(index, hex);
  }

  /** Converts an axial coordinate into the offset-key format used by DeploymentState zone maps. */
  private toOffsetKey(axial: Axial): string {
    const col = axial.q;
    const row = axial.r + Math.floor(axial.q / 2);
    return `${col},${row}`;
  }

  private parseOffsetKey(key: string): Axial {
    const parts = key.split(",");
    if (parts.length !== 2) {
      throw new Error(`Invalid offset key '${key}'`);
    }
    const col = Number(parts[0]);
    const row = Number(parts[1]);
    if (!Number.isFinite(col) || !Number.isFinite(row)) {
      throw new Error(`Invalid offset key '${key}'`);
    }
    const q = col;
    const r = row - Math.floor(q / 2);
    return { q, r };
  }

  private autoDeployAirReservesToBaseZone(): void {
    // Intentionally left inert: aircraft are no longer auto-deployed onto the map.
    // Kept for backward compatibility with saves and callers, but performs no work.
  }

  /**
   * End the current faction's turn, execute supply attrition, and advance to the opposing faction.
   * Returns a report of out-of-supply units so UI can surface warnings.
   */
  endTurn(): SupplyTickReport | null {
    if (this._phase === "deployment" || this._phase === "completed") {
      return null;
    }

    this.stepAirMissionsForFaction(this._activeFaction);
    this.advanceAirMissionRefits(this._activeFaction);

    if (this._phase === "playerTurn") {
      // Player upkeep resolves before the ally/bot acts so ledgers and alerts update immediately.
      const playerSupplyReport = this.applySupplyTickFor("Player");
      this.resolveQueuedSupportActions();

      // If allies are present, run their turn next.
      if (this.allySide && this.allyPlacements.size > 0) {
        this._phase = "allyTurn";
        this._activeFaction = "Ally";
        this.clearSuppressionFor("Ally");
        this.stepAirMissionsForFaction("Ally");
        this.advanceAirMissionRefits("Ally");
        this.applySupplyTickFor("Ally");
        this.executeHeuristicAllyTurn();
      }

      // Ally (if any) complete → Bot turn. Execute bot logic immediately before UI refresh.
      this._phase = "botTurn";
      this._activeFaction = "Bot";
      this.botActionFlags.clear();
      this.clearSuppressionFor("Bot");
      const botSummary = this.executeBotTurn();
      this.pendingBotTurnSummary = botSummary;
      this.stepAirMissionsForFaction("Bot");
      this.advanceAirMissionRefits("Bot");

      // After the bot finishes, advance back to player turn to keep UI interactive.
      this._phase = "playerTurn";
      this._activeFaction = "Player";
      this._turnNumber += 1;
      this.advanceCounterIntelTurn();
      this.playerActionFlags.clear();
      this.clearSuppressionFor("Player");
      this.rebuildPlayerIdleUnitSet();
      this.refreshAircraftAmmoForFaction("Player");
      return playerSupplyReport;
    }

    // Bot turn was already resolved, so simply advance to the player's next turn.
    if (this._phase === "botTurn" || this._phase === "allyTurn") {
      this._phase = "playerTurn";
      this._activeFaction = "Player";
      this._turnNumber += 1;
      this.advanceCounterIntelTurn();
      this.playerActionFlags.clear();
      this.rebuildPlayerIdleUnitSet();
      this.refreshAircraftAmmoForFaction("Player");
      return this.applySupplyTickFor("Player");
    }

    return this.applySupplyTickFor(this._activeFaction);
  }

  /** Prepare combat preview by building the standardized request object and invoking `resolveAttack()`. */
  previewAttack(attackerHex: Axial, defenderHex: Axial, stance?: CombatStance): CombatPreview | null {
    const attacker = this.lookupUnit(attackerHex, "Player");
    const defender = this.lookupUnit(defenderHex, "Bot");
    if (!attacker || !defender || !this.getPlayerEnemyContactStateAtHex(defenderHex)) {
      return null;
    }
    const attackerDef = this.getUnitDefinition(attacker.type);
    const effectiveStance = this.resolveCombatStanceForAttacker(attacker, attackerDef, stance);
    const request = this.buildAttackRequest(attacker, defender, "Player", "Bot", { stance: effectiveStance });
    if (!request) {
      return null;
    }
    const attackResult = resolveAttack(request);

    const defenderDef = this.getUnitDefinition(defender.type);
    const attackerIsAircraft = this.isAircraft(attackerDef);
    const attackerIsBomber = this.isBomber(attackerDef);
    const defenderIsAircraft = this.isAircraft(defenderDef);

    let damageMultiplier = 1;
    let suppressionMultiplier = 1;
    if (attackerIsBomber && !defenderIsAircraft) {
      damageMultiplier = 10;
      suppressionMultiplier = 10;
    } else if (attackerIsAircraft && !attackerIsBomber && defenderIsAircraft) {
      damageMultiplier = 4;
      suppressionMultiplier = 4;
    }

    const finalDamagePerHit = attackResult.damagePerHit * damageMultiplier;
    const finalExpectedDamage = attackResult.expectedDamage * damageMultiplier;
    const finalExpectedSuppression = attackResult.expectedSuppression * suppressionMultiplier;
    const projectedDefenderLoss = Math.max(
      0,
      attackerIsBomber && !defenderIsAircraft
        ? Math.ceil(finalExpectedDamage)
        : Math.round(finalExpectedDamage)
    );
    const projectedDefender = structuredClone(defender);
    projectedDefender.strength = Math.max(0, projectedDefender.strength - projectedDefenderLoss);
    const retaliationPreview = this.previewRetaliationForPlayerAttack(
      attacker,
      attackerHex,
      attackerDef,
      projectedDefender,
      defenderHex,
      defenderDef,
      effectiveStance
    );

    return {
      attacker: structuredClone(attacker),
      defender: structuredClone(defender),
      result: attackResult,
      commander: this.getCommanderBenefits(),
      damageMultiplier,
      suppressionMultiplier,
      finalDamagePerHit,
      finalExpectedDamage,
      finalExpectedSuppression,
      expectedRetaliation: retaliationPreview.expectedDamage,
      retaliationPossible: retaliationPreview.possible,
      retaliationNote: retaliationPreview.note
    };
  }

  /**
   * Mirrors the retaliation checks used by player-initiated combat so the confirmation modal can surface
   * expected return fire without reimplementing engine rules in the UI layer.
   */
  private previewRetaliationForPlayerAttack(
    attacker: ScenarioUnit,
    attackerHex: Axial,
    attackerDef: UnitTypeDefinition,
    defender: ScenarioUnit,
    defenderHex: Axial,
    defenderDef: UnitTypeDefinition,
    effectiveStance: CombatStance | undefined
  ): { expectedDamage: number; possible: boolean; note?: string } {
    const attackerIsAircraft = this.isAircraft(attackerDef);
    const defenderIsAircraft = this.isAircraft(defenderDef);
    const defenderIsBomber = this.isBomber(defenderDef);
    const defenderKey = axialKey(defenderHex);
    const defenderGroundAmmoCost = defenderIsAircraft ? 0 : this.resolveGroundAttackAmmoCost(defenderDef);

    if (defender.strength <= 0) {
      return {
        expectedDamage: 0,
        possible: false,
        note: "Target is expected to be destroyed before it can return fire."
      };
    }

    if (attackerIsAircraft && !defenderIsAircraft) {
      return {
        expectedDamage: 0,
        possible: false,
        note: "Ground units cannot retaliate against fast-moving aircraft."
      };
    }

    if (this.resolveUnitSuppressionState(defender).state === "pinned") {
      return {
        expectedDamage: 0,
        possible: false,
        note: "Target is pinned and cannot return fire."
      };
    }

    const distance = hexDistance(defenderHex, attackerHex);
    const defenderRangeMin = defenderDef.rangeMin ?? 1;
    let defenderRangeMax = defenderDef.rangeMax ?? 1;
    if (defenderIsBomber && attackerIsAircraft) {
      defenderRangeMax = Math.max(defenderRangeMax, 2);
    }
    if (distance < defenderRangeMin || distance > defenderRangeMax) {
      return {
        expectedDamage: 0,
        possible: false,
        note: "Target is out of return-fire range."
      };
    }

    const defenderFlags = this.botActionFlags.get(defenderKey) ?? this.createDefaultActionFlags();
    if (defenderFlags.retaliationsUsed >= 1) {
      return {
        expectedDamage: 0,
        possible: false,
        note: "Target has already used its retaliation this turn."
      };
    }

    if (defenderIsAircraft) {
      const defenderAmmoState = this.getAircraftAmmoState("Bot", defenderKey, defenderDef);
      if (this.aircraftNeedsRearm("Bot", defenderKey)) {
        return {
          expectedDamage: 0,
          possible: false,
          note: "Enemy aircraft must rearm before it can retaliate."
        };
      }
      if (defenderAmmoState.air <= 0) {
        return {
          expectedDamage: 0,
          possible: false,
          note: "Enemy aircraft has no interception ammo remaining."
        };
      }
    } else {
      const defenderAmmo = typeof defender.ammo === "number" ? defender.ammo : null;
      if (defenderAmmo !== null && defenderAmmo < defenderGroundAmmoCost) {
        return {
          expectedDamage: 0,
          possible: false,
          note: defenderGroundAmmoCost > 1
            ? `Enemy unit lacks the ${defenderGroundAmmoCost.toFixed(0)} ammo needed to return indirect fire.`
            : "Enemy unit has no ammunition remaining to retaliate."
        };
      }
    }

    const retaliationReq = this.buildAttackRequest(defender, attacker, "Bot", "Player", {
      allowBomberAirAttack: true,
      stance: effectiveStance === "assault" ? "assault" : undefined
    });
    if (!retaliationReq) {
      return {
        expectedDamage: 0,
        possible: false,
        note: "Target lacks line of fire for retaliation."
      };
    }

    let retaliation = resolveAttack(retaliationReq);
    if (defenderIsBomber && attackerIsAircraft) {
      retaliation = {
        ...retaliation,
        expectedDamage: retaliation.expectedDamage * 2,
        damagePerHit: retaliation.damagePerHit * 2,
        expectedSuppression: retaliation.expectedSuppression * 2
      };
    } else if (defenderIsAircraft && !defenderIsBomber && attackerIsAircraft) {
      retaliation = {
        ...retaliation,
        expectedDamage: retaliation.expectedDamage * 4,
        damagePerHit: retaliation.damagePerHit * 4,
        expectedSuppression: retaliation.expectedSuppression * 4
      };
    }

    return {
      expectedDamage: Math.max(0, retaliation.expectedDamage),
      possible: true
    };
  }

  /**
   * Normalizes terrain move costs so the rest of the engine can treat air movement as a flat cost per hex.
   * Airframes ignore ground terrain entirely, while ground units fall back to terrain-specific tables.
   * Ford features override river impassability for ground units.
   * Hex modifications (tank traps, cleared paths) further adjust movement costs.
   */
  private resolveMoveCost(moveType: string, terrain: TerrainDefinition | null, hex?: Axial): number {
    if (moveType === "air") {
      return 1;
    }
    const catalog = terrain?.moveCost ?? null;
    if (!catalog) {
      return 1;
    }
    let cost = catalog[moveType as keyof typeof catalog];
    if (typeof cost !== "number") {
      cost = 1;
    }

    // Check for ford feature that makes rivers crossable
    if (cost >= 999 && hex) {
      const features = this.getTileFeaturesAt(hex);

      if (features.includes("ford")) {
        if (moveType === "leg") {
          return 1; // Infantry can cross fords at normal speed
        } else if (moveType === "track") {
          return 2;
        } else if (moveType === "wheel") {
          return 2; // Wheeled vehicles can use prepared fords
        }
      }
      if (features.includes("shallow")) {
        if (moveType === "leg") {
          return 1; // Infantry can cross shallow water at normal speed
        } else if (moveType === "track") {
          return 2;
        } else if (moveType === "wheel") {
          return 999; // Wheeled vehicles can't ford unprepared shallow crossings
        }
      }
    }

    // Apply hex modification effects
    if (hex) {
      const modification = this.getHexModification(hex);
      if (modification) {
        if (modification.type === "tankTraps") {
          // Tank traps triple movement cost for vehicles
          if (moveType === "track" || moveType === "wheel") {
            cost = cost * 3;
          }
        } else if (modification.type === "clearedPath") {
          // Cleared paths reduce movement cost by 50% (min 1)
          cost = Math.max(1, Math.round(cost * 0.5));
        }
      }
    }

    return cost;
  }

  /**
   * Returns the features array for the tile at the given hex.
   */
  private getTileFeaturesAt(hex: Axial): readonly string[] {
    const entry = this.lookupTileEntry(hex);
    if (!entry) {
      return [];
    }
    const paletteEntry = this.scenario.tilePalette[entry.tile];
    if (!paletteEntry) {
      return [];
    }
    return paletteEntry.features ?? [];
  }

  /**
   * Derives the effective movement budget for the unit stationed at the given origin.
   * The summary respects commander bonuses, rush mode, and attack penalties so UI layers
   * can show remaining steps without reimplementing engine math.
   */
  private resolveMovementContext(origin: Axial): {
    unit: ScenarioUnit;
    definition: UnitTypeDefinition;
    flags: { movementPointsUsed: number; attacksUsed: number; retaliationsUsed: number; isRushing: boolean };
    moveType: string;
    max: number;
    remaining: number;
  } | null {
    if (!this.inBounds(origin)) {
      return null;
    }

    const unit = this.lookupUnit(origin, "Player");
    if (!unit) {
      return null;
    }
    if (this.isAutomatedPlayerUnit(unit)) {
      return null;
    }
    const definition = this.getUnitDefinition(unit.type);
    const moveType = definition.moveType ?? "track";
    const flags = this.playerActionFlags.get(axialKey(origin)) ?? {
      movementPointsUsed: 0,
      attacksUsed: 0,
      retaliationsUsed: 0,
      isRushing: false
    };

    const moveScalar = this.commanderMoveScalar();
    const baseMovement = Math.max(1, Math.ceil((definition.movement ?? 1) * moveScalar));
    const rushingBonus = flags.isRushing && definition.class === "infantry" ? 1 : 0;
    let adjustedMax = baseMovement + rushingBonus;

    if (flags.attacksUsed > 0) {
      if (definition.class === "artillery") {
        adjustedMax = 0;
      } else {
        adjustedMax = Math.floor(adjustedMax / 2);
      }
    }

    const remaining = Math.max(0, adjustedMax - flags.movementPointsUsed);
    return {
      unit,
      definition,
      flags,
      moveType,
      max: Math.max(0, adjustedMax),
      remaining
    };
  }

  /** Supplies remaining movement points so overlays can report accurate "moves" counts. */
  getMovementBudget(origin: Axial): MovementBudget | null {
    const context = this.resolveMovementContext(origin);
    if (!context) {
      return null;
    }
    return { max: context.max, remaining: context.remaining };
  }

  /** Returns true when the unit's movement profile burns fuel while traversing the map. */
  private unitConsumesFuel(definition: UnitTypeDefinition): boolean {
    const moveType = definition.moveType as keyof typeof FUEL_COST;
    return (FUEL_COST[moveType] ?? 0) > 0;
  }

  /** Resolve the fuel burned for a single step, discounting ground movement when the hex is on a road. */
  private resolveMovementFuelStep(moveType: string, hex: Axial): number {
    if (moveType === "leg") {
      return 0;
    }
    if (moveType === "air") {
      return combatBalance.ammoFuel.fuelPerAirHex;
    }
    const baseFuel = combatBalance.ammoFuel.fuelPerGroundHex;
    return this.isRoad(hex) ? baseFuel * combatBalance.ammoFuel.fuelRoadMultiplier : baseFuel;
  }

  /** Pull the available fuel budget for a unit, using infinity for formations that do not consume fuel. */
  private resolveFuelBudget(unit: ScenarioUnit, definition: UnitTypeDefinition): number {
    if (!this.unitConsumesFuel(definition)) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.max(0, Number(unit.fuel ?? 0));
  }

  /**
   * Calculates the cheapest reachable path summary between two hexes, tracking both movement cost and
   * fuel expenditure so movement validation and UI overlays share the same logistics math.
   */
  private calculateMovementPathSummary(from: Axial, to: Axial, moveType: string): MovementPathSummary | null {
    if (from.q === to.q && from.r === to.r) {
      return { cost: 0, fuelCost: 0, steps: 0, roadSteps: 0, offroadSteps: 0 };
    }

    const visited = new Map<string, { cost: number; fuelCost: number }>();
    const queue: Array<{ hex: Axial; cost: number; fuelCost: number; steps: number; roadSteps: number; offroadSteps: number }> = [
      { hex: from, cost: 0, fuelCost: 0, steps: 0, roadSteps: 0, offroadSteps: 0 }
    ];

    while (queue.length > 0) {
      queue.sort((left, right) => left.cost - right.cost || left.fuelCost - right.fuelCost);
      const current = queue.shift()!;
      const key = axialKey(current.hex);
      const existing = visited.get(key);
      if (existing && existing.cost <= current.cost && existing.fuelCost <= current.fuelCost) {
        continue;
      }
      visited.set(key, { cost: current.cost, fuelCost: current.fuelCost });

      if (current.hex.q === to.q && current.hex.r === to.r) {
        return {
          cost: current.cost,
          fuelCost: Number(current.fuelCost.toFixed(2)),
          steps: current.steps,
          roadSteps: current.roadSteps,
          offroadSteps: current.offroadSteps
        };
      }

      for (const neighbor of neighbors(current.hex)) {
        if (!this.inBounds(neighbor)) {
          continue;
        }
        const terrain = this.terrainAt(neighbor);
        const moveCost = this.resolveMoveCost(moveType, terrain, neighbor);
        if (moveCost >= 999) {
          continue;
        }
        const onRoad = moveType !== "air" && this.isRoad(neighbor);
        queue.push({
          hex: neighbor,
          cost: current.cost + moveCost,
          fuelCost: current.fuelCost + this.resolveMovementFuelStep(moveType, neighbor),
          steps: current.steps + 1,
          roadSteps: current.roadSteps + (onRoad ? 1 : 0),
          offroadSteps: current.offroadSteps + (onRoad ? 0 : 1)
        });
      }
    }

    return null;
  }

  /** Retained as a small wrapper for any legacy call sites that only need movement points. */
  private calculateMovementCost(from: Axial, to: Axial, moveType: string): number {
    return this.calculateMovementPathSummary(from, to, moveType)?.cost ?? 999;
  }

  private findCheapestPathToAny(
    from: Axial,
    destinations: readonly Axial[],
    moveType: string,
    occupied: ReadonlySet<string>,
    maxFuel?: number
  ): MovementPathPlan | null {
    if (destinations.length === 0) {
      return null;
    }

    const destinationKeys = new Set(destinations.map((hex) => axialKey(hex)));
    const originKey = axialKey(from);
    const queue: Array<{ hex: Axial; cost: number; fuelCost: number; steps: number; roadSteps: number; offroadSteps: number }> = [
      { hex: from, cost: 0, fuelCost: 0, steps: 0, roadSteps: 0, offroadSteps: 0 }
    ];
    const visited = new Map<string, { cost: number; fuelCost: number; steps: number }>();
    const bestKnown = new Map<string, { cost: number; fuelCost: number; steps: number }>();
    const previous = new Map<string, string | null>();
    const nodeSummaries = new Map<string, MovementPathSummary>();
    previous.set(originKey, null);
    bestKnown.set(originKey, { cost: 0, fuelCost: 0, steps: 0 });
    nodeSummaries.set(originKey, { cost: 0, fuelCost: 0, steps: 0, roadSteps: 0, offroadSteps: 0 });

    while (queue.length > 0) {
      queue.sort((left, right) => left.cost - right.cost || left.fuelCost - right.fuelCost || left.steps - right.steps);
      const current = queue.shift()!;
      const key = axialKey(current.hex);
      const frontierBest = bestKnown.get(key);
      if (
        frontierBest &&
        (current.cost > frontierBest.cost ||
          (current.cost === frontierBest.cost &&
            (current.fuelCost > frontierBest.fuelCost ||
              (current.fuelCost === frontierBest.fuelCost && current.steps > frontierBest.steps))))
      ) {
        continue;
      }
      const seen = visited.get(key);
      if (
        seen &&
        (seen.cost < current.cost ||
          (seen.cost === current.cost &&
            (seen.fuelCost < current.fuelCost ||
              (seen.fuelCost === current.fuelCost && seen.steps <= current.steps))))
      ) {
        continue;
      }
      visited.set(key, { cost: current.cost, fuelCost: current.fuelCost, steps: current.steps });
      nodeSummaries.set(key, {
        cost: current.cost,
        fuelCost: Number(current.fuelCost.toFixed(2)),
        steps: current.steps,
        roadSteps: current.roadSteps,
        offroadSteps: current.offroadSteps
      });

      if (destinationKeys.has(key)) {
        const path: Axial[] = [];
        let cursor: string | null = key;
        while (cursor) {
          const parsed = this.parseAxialKey(cursor);
          if (!parsed) {
            break;
          }
          path.push(parsed);
          cursor = previous.get(cursor) ?? null;
        }
        path.reverse();
        return {
          path,
          summary: nodeSummaries.get(key)!
        };
      }

      for (const neighbor of neighbors(current.hex)) {
        if (!this.inBounds(neighbor)) {
          continue;
        }
        const neighborKey = axialKey(neighbor);
        if (occupied.has(neighborKey) && !destinationKeys.has(neighborKey)) {
          continue;
        }
        const terrain = this.terrainAt(neighbor);
        const moveCost = this.resolveMoveCost(moveType, terrain, neighbor);
        if (moveCost >= 999) {
          continue;
        }
        const fuelCost = current.fuelCost + this.resolveMovementFuelStep(moveType, neighbor);
        if (typeof maxFuel === "number" && fuelCost > maxFuel + 1e-6) {
          continue;
        }
        const onRoad = moveType !== "air" && this.isRoad(neighbor);
        const nextCost = current.cost + moveCost;
        const nextSteps = current.steps + 1;
        const existing = bestKnown.get(neighborKey);
        if (
          existing &&
          (existing.cost < nextCost ||
            (existing.cost === nextCost &&
              (existing.fuelCost < fuelCost ||
                (existing.fuelCost === fuelCost && existing.steps <= nextSteps))))
        ) {
          continue;
        }
        bestKnown.set(neighborKey, { cost: nextCost, fuelCost, steps: nextSteps });
        previous.set(neighborKey, key);
        queue.push({
          hex: neighbor,
          cost: nextCost,
          fuelCost,
          steps: nextSteps,
          roadSteps: current.roadSteps + (onRoad ? 1 : 0),
          offroadSteps: current.offroadSteps + (onRoad ? 0 : 1)
        });
      }
    }

    return null;
  }

  /** Calculate reachable hexes using unit movement points and terrain costs. */
  getReachableHexes(origin: Axial): Axial[] {
    const context = this.resolveMovementContext(origin);
    if (!context) {
      return [];
    }
    const { unit, definition, moveType, remaining } = context;
    if (this.resolveUnitSuppressionState(unit).state === "pinned") {
      return [];
    }
    if (remaining <= 0) {
      return [];
    }
    const availableFuel = this.resolveFuelBudget(unit, definition);
    if (Number.isFinite(availableFuel) && availableFuel <= 0) {
      return [];
    }

    // BFS to find all hexes reachable within both movement and fuel budgets.
    const visited = new Map<string, { cost: number; fuelCost: number }>();
    const queue: Array<{ hex: Axial; cost: number; fuelCost: number }> = [{ hex: origin, cost: 0, fuelCost: 0 }];
    const reachable: Axial[] = [];
    const reachableKeys = new Set<string>();
    const originKey = axialKey(origin);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const key = axialKey(current.hex);

      const seen = visited.get(key);
      if (seen && seen.cost <= current.cost && seen.fuelCost <= current.fuelCost) {
        continue;
      }
      visited.set(key, { cost: current.cost, fuelCost: current.fuelCost });

      for (const neighbor of neighbors(current.hex)) {
        if (!this.inBounds(neighbor)) continue;
        const nKey = axialKey(neighbor);

        const occupied = this.isOccupied(neighbor);
        if (occupied && moveType !== "air") {
          continue;
        }

        const terrain = this.terrainAt(neighbor);
        const moveCost = this.resolveMoveCost(moveType, terrain, neighbor);
        if (moveCost >= 999) {
          continue;
        }
        const newCost = current.cost + moveCost;
        const newFuelCost = current.fuelCost + this.resolveMovementFuelStep(moveType, neighbor);

        if (newCost <= remaining && (!Number.isFinite(availableFuel) || newFuelCost <= availableFuel + 1e-6)) {
          queue.push({ hex: neighbor, cost: newCost, fuelCost: newFuelCost });
          if (!occupied && nKey !== originKey && !reachableKeys.has(nKey)) {
            // Airframes may pass over other units but cannot land on them, so exclude occupied tiles from the reachable set.
            reachableKeys.add(nKey);
            reachable.push(structuredClone(neighbor));
          }
        }
      }
    }

    return reachable;
  }

  /** Attackable enemy hexes within unit range where LOS is clear. */
  getAttackableTargets(attackerHex: Axial): Axial[] {
    const unit = this.lookupUnit(attackerHex, "Player");
    if (!unit) {
      return [];
    }
    if (this.isAutomatedPlayerUnit(unit)) {
      return [];
    }
    const flags = this.playerActionFlags.get(axialKey(attackerHex)) ?? { movementPointsUsed: 0, attacksUsed: 0, retaliationsUsed: 0, isRushing: false };

    const def = this.getUnitDefinition(unit.type);
    const halfMovement = Math.floor(def.movement / 2);

    // Determine if unit can attack based on movement and attacks used
    // Time scale halved: max 1 attack per turn regardless of movement
    const maxAttacks = 1;
    if (flags.movementPointsUsed > halfMovement) {
      return []; // Moved too far to attack
    }

    // Artillery cannot attack if they've moved
    if (def.class === "artillery" && flags.movementPointsUsed > 0) {
      return [];
    }

    if (flags.attacksUsed >= maxAttacks) {
      return []; // Used all attacks
    }

    const rangeMin = def.rangeMin ?? 1;
    const rangeMax = def.rangeMax ?? 1;

    const out: Axial[] = [];

    // Trace every hex within firing range using a bounded BFS. The queue carries both the axial
    // coordinate and the distance from the attacker so we can stop expanding once the max range is met.
    const visited = new Set<string>();
    const queue: Array<{ hex: Axial; distance: number }> = [{ hex: attackerHex, distance: 0 }];

    while (queue.length > 0) {
      const { hex, distance } = queue.shift()!;
      const key = axialKey(hex);

      if (visited.has(key)) {
        continue;
      }
      visited.add(key);

      if (distance >= rangeMin && distance <= rangeMax && distance !== 0) {
        const defender = this.lookupUnit(hex, "Bot");
        if (defender && this.getPlayerEnemyContactStateAtHex(hex)) {
          const req = this.buildAttackRequest(unit, defender, "Player", "Bot");
          if (req) {
            out.push(structuredClone(hex));
          }
        }
      }

      // Stop exploring beyond maximum range so artillery retains the correct firing envelope.
      if (distance >= rangeMax) {
        continue;
      }

      for (const neighbor of neighbors(hex)) {
        if (!this.inBounds(neighbor)) {
          continue;
        }
        const neighborKey = axialKey(neighbor);
        if (visited.has(neighborKey)) {
          continue;
        }
        queue.push({ hex: neighbor, distance: distance + 1 });
      }
    }

    return out;
  }

  /** Ground attacks expend one salvo, with indirect fire formations burning an additional ammo point. */
  private resolveGroundAttackAmmoCost(definition: UnitTypeDefinition): number {
    let cost = combatBalance.ammoFuel.attackAmmoCost;
    if (definition.class === "artillery" || definition.traits.includes("indirect")) {
      cost += combatBalance.ammoFuel.indirectExtraAmmo;
    }
    return Math.max(1, cost);
  }

  /** Clear player-facing copy explaining why a formation cannot fire. */
  private buildGroundAmmoShortageMessage(definition: UnitTypeDefinition, currentAmmo: number, requiredAmmo: number): string {
    const roundedCurrent = Number(currentAmmo.toFixed(2));
    if (definition.class === "artillery" || definition.traits.includes("indirect")) {
      return `This battery needs ${requiredAmmo.toFixed(0)} ammo to fire a mission but only has ${roundedCurrent.toFixed(2)} remaining.`;
    }
    return `This unit is out of ammunition and must be resupplied before it can attack.`;
  }

  /** Toggle rush mode for infantry units (gives +1 movement but loses terrain cover) */
  toggleRushMode(hex: Axial): boolean {
    if (this._phase !== "playerTurn") {
      throw new Error("Rush mode can only be toggled during player turn.");
    }

    const unit = this.lookupUnit(hex, "Player");
    if (!unit) {
      throw new Error("No unit at this hex.");
    }

    const def = this.getUnitDefinition(unit.type);
    if (def.class !== "infantry") {
      throw new Error("Only infantry units can use rush mode.");
    }

    const key = axialKey(hex);
    const flags = this.playerActionFlags.get(key) ?? {
      movementPointsUsed: 0,
      attacksUsed: 0,
      retaliationsUsed: 0,
      isRushing: false
    };

    // Can't toggle rush after moving
    if (flags.movementPointsUsed > 0) {
      throw new Error("Cannot toggle rush mode after moving.");
    }

    // Toggle the rush state
    const newRushState = !flags.isRushing;
    this.playerActionFlags.set(key, {
      ...flags,
      isRushing: newRushState
    });

    return newRushState;
  }

  /** Move the player's unit to any reachable hex within movement range. */
  moveUnit(from: Axial, to: Axial): MoveResolution {
    if (this._phase !== "playerTurn") {
      throw new Error("Movement is allowed only during the player turn.");
    }
    const fromKey = axialKey(from);
    const toKey = axialKey(to);
    const originUnit = this.lookupUnit(from, "Player");
    if (originUnit && this.isAutomatedPlayerUnit(originUnit)) {
      throw new Error("This logistics convoy is AI-controlled and will move automatically during the supply phase.");
    }
    const context = this.resolveMovementContext(from);
    if (!context) {
      throw new Error("No player unit at the origin hex.");
    }
    const { unit, definition, flags, moveType, max, remaining } = context;
    const availableFuel = this.resolveFuelBudget(unit, definition);
    if (this.resolveUnitSuppressionState(unit).state === "pinned") {
      throw new Error("Pinned formations cannot move until the pin is broken.");
    }

    if (definition.class === "artillery" && flags.attacksUsed > 0) {
      throw new Error("Artillery cannot move after attacking.");
    }

    const moveSummary = this.calculateMovementPathSummary(from, to, moveType);
    if (!moveSummary || moveSummary.cost >= 999) {
      throw new Error("Destination is not reachable with available movement points.");
    }
    const moveCost = moveSummary.cost;

    if (moveCost > remaining) {
      throw new Error(`Not enough movement points. Cost: ${moveCost}, Remaining: ${Math.max(0, remaining).toFixed(1)}`);
    }
    if (Number.isFinite(availableFuel) && moveSummary.fuelCost > availableFuel + 1e-6) {
      throw new Error(`Not enough fuel. Required: ${moveSummary.fuelCost.toFixed(2)}, Available: ${availableFuel.toFixed(2)}`);
    }

    const newTotalMovement = flags.movementPointsUsed + moveCost;
    if (newTotalMovement > max) {
      const leftover = Math.max(0, max - flags.movementPointsUsed);
      throw new Error(`Not enough movement points. Cost: ${moveCost}, Remaining: ${leftover.toFixed(1)}`);
    }

    if (!this.inBounds(to)) {
      throw new Error("Destination out of bounds.");
    }
    if (this.isOccupied(to)) {
      throw new Error("Destination hex is occupied.");
    }

    // Verify destination is reachable within movement budget
    const reachable = this.getReachableHexes(from);
    const canReach = reachable.some((hex) => hex.q === to.q && hex.r === to.r);
    if (!canReach && (from.q !== to.q || from.r !== to.r)) {
      throw new Error("Destination is not reachable with available movement points.");
    }

    this.playerPlacements.delete(fromKey);
    this.playerIdleUnitKeys.delete(fromKey);
    const moved = structuredClone(unit);
    moved.facing = this.resolveFacingToward(from, to, unit.facing);
    moved.hex = structuredClone(to);
    if (Number.isFinite(availableFuel) && moveSummary.fuelCost > 0) {
      moved.fuel = Math.max(0, Number((moved.fuel - moveSummary.fuelCost).toFixed(2)));
    }
    this.playerPlacements.set(toKey, moved);
    this.transferAircraftAmmoState(this.playerAttackAmmo, fromKey, toKey);
    this.updatePlayerSupplyPosition(from, to);
    this.syncPlayerFuel(to, moved.fuel);

    // Update action flags
    this.playerActionFlags.delete(fromKey);
    this.playerActionFlags.set(toKey, {
      movementPointsUsed: newTotalMovement,
      attacksUsed: flags.attacksUsed,
      retaliationsUsed: flags.retaliationsUsed,
      isRushing: flags.isRushing
    });

    this.playerIdleUnitKeys.delete(fromKey);
    this.updateIdleRegistryFor(toKey);

    this.invalidateRosterCache();

    return { unit: structuredClone(moved), from: structuredClone(from), to: structuredClone(to) };
  }

  /** Resolve a basic attack and update units in place. */
  attackUnit(attackerHex: Axial, defenderHex: Axial, stance?: CombatStance): AttackResolution | null {
    if (this._phase !== "playerTurn") {
      throw new Error("Attacks are allowed only during the player turn.");
    }
    const attacker = this.lookupUnit(attackerHex, "Player");
    const defender = this.lookupUnit(defenderHex, "Bot");
    if (!attacker || !defender || !this.getPlayerEnemyContactStateAtHex(defenderHex)) {
      return null;
    }
    if (this.isAutomatedPlayerUnit(attacker)) {
      throw new Error("This logistics convoy is AI-controlled. Set resupply priorities from the Logistics panel instead of issuing manual orders.");
    }
    const atkKey = axialKey(attackerHex);
    const flags = this.playerActionFlags.get(atkKey) ?? { movementPointsUsed: 0, attacksUsed: 0, retaliationsUsed: 0, isRushing: false };

    const unitDef = this.getUnitDefinition(attacker.type);
    const defenderDef = this.getUnitDefinition(defender.type);
    const effectiveStance = this.resolveCombatStanceForAttacker(attacker, unitDef, stance);
    if (stance === "assault" && effectiveStance !== "assault") {
      throw new Error(this.buildAssaultUnavailableMessage(attacker, unitDef));
    }
    const attackerIsAircraft = this.isAircraft(unitDef);
    const attackerIsBomber = this.isBomber(unitDef);
    const defenderIsAircraft = this.isAircraft(defenderDef);
    const defenderIsBomber = this.isBomber(defenderDef);
    const groundAttackAmmoCost = attackerIsAircraft ? 0 : this.resolveGroundAttackAmmoCost(unitDef);
    const defenderGroundAmmoCost = defenderIsAircraft ? 0 : this.resolveGroundAttackAmmoCost(defenderDef);
    let attackManeuverCost = 0;
    const moveScalar = this.commanderMoveScalar();
    const boostedMovement = Math.max(1, Math.ceil((unitDef.movement ?? 1) * moveScalar));
    const halfMovement = Math.floor(boostedMovement / 2);

    // Determine max allowed attacks based on movement
    // Time scale halved: max 1 attack per turn regardless of movement
    const maxAttacks = 1;

    const movedTooFar = flags.movementPointsUsed > halfMovement;
    // Aircraft sorties are resolved at altitude, so they can reposition freely before attacking in the same turn.
    if (!attackerIsAircraft && movedTooFar) {
      // Exception: Artillery can never attack after moving
      if (unitDef.class === "artillery") {
        throw new Error("Artillery cannot attack after moving.");
      }
      throw new Error("Unit moved too far to attack this turn.");
    }

    // Special case: Artillery (non-SPA) can only attack if they haven't moved
    if (unitDef.class === "artillery" && flags.movementPointsUsed > 0) {
      throw new Error("Artillery cannot attack after moving.");
    }

    if (flags.attacksUsed >= maxAttacks) {
      throw new Error(`This unit can only attack ${maxAttacks} time(s) this turn.`);
    }

    if (!attackerIsAircraft && attacker.ammo < groundAttackAmmoCost) {
      throw new Error(this.buildGroundAmmoShortageMessage(unitDef, attacker.ammo, groundAttackAmmoCost));
    }

    if (attackerIsAircraft) {
      attackManeuverCost = defenderIsAircraft ? 2 : 1;
      const remainingAirMovement = boostedMovement - flags.movementPointsUsed;
      if (remainingAirMovement + 1e-6 < attackManeuverCost) {
        throw new Error(
          defenderIsAircraft
            ? "This squadron expended its flight time and cannot execute another aerial dogfight this turn."
            : "This squadron lacks the flight time to line up another ground strike this turn."
        );
      }
      const ammoState = this.getAircraftAmmoState("Player", atkKey, unitDef);
      if (this.aircraftNeedsRearm("Player", atkKey)) {
        throw new Error("This squadron must return to base to rearm before flying another sortie.");
      }
      if (defenderIsAircraft) {
        if (ammoState.air <= 0) {
          throw new Error("The fighter wing has exhausted its interception ammo and needs to rearm at base.");
        }
      } else if (ammoState.ground <= 0) {
        throw new Error("The squadron has expended its bomb load and must rearm at the base camp before attacking ground targets again.");
      }
    }

    // Pre-attack interception: layered CAP vs escort resolution before ground strike.
    if (attackerIsAircraft && !defenderIsAircraft) {
      const opponentFaction: TurnFaction = "Bot";
      const defKeyForCap = axialKey(defenderHex);
      const capMissions = this.findAllActiveAirCoverForHex(opponentFaction, defKeyForCap).filter((m) => m.interceptions < 1);
      // Use the stable squadronId to find escorts protecting this attacker.
      const attackerSquadronId = this.getSquadronId(attacker);
      const escortMissions = this.findAllActiveEscortsForUnit("Player", attackerSquadronId).filter((m) => m.interceptions < 1);
      if (capMissions.length > 0) {
        // Emit a consolidated engagement event for UI animation
        const interceptorsForEvent: Array<{ faction: TurnFaction; unitKey: string; unitType: string }> = [];
        const escortsForEvent: Array<{ faction: TurnFaction; unitKey: string; unitType: string }> = [];
        for (const cap of capMissions) {
          // Look up CAP unit by squadronId since mission.unitKey is now the stable unitId.
          const capLookup = this.lookupUnitBySquadronId(cap.unitKey, opponentFaction);
          if (capLookup) interceptorsForEvent.push({ faction: opponentFaction, unitKey: cap.unitKey, unitType: capLookup.unit.type as string });
        }
        for (const em of escortMissions) {
          // Look up escort unit by squadronId since mission.unitKey is now the stable unitId.
          const escortLookup = this.lookupUnitBySquadronId(em.unitKey, "Player");
          if (escortLookup) escortsForEvent.push({ faction: "Player", unitKey: em.unitKey, unitType: escortLookup.unit.type as string });
        }
        this.pendingAirEngagements.push({
          type: "airToAir",
          location: structuredClone(defenderHex),
          bomber: { faction: "Player", unitKey: atkKey, unitType: attacker.type as string },
          interceptors: interceptorsForEvent,
          escorts: escortsForEvent
        });

        // Step 1: escorts attrit CAP
        for (const cap of capMissions) {
          // Look up CAP unit by squadronId.
          const capLookup = this.lookupUnitBySquadronId(cap.unitKey, opponentFaction);
          if (!capLookup) continue;
          const { unit: capUnit, hexKey: capHexKey } = capLookup;
          const escort = escortMissions.find((e) => e.interceptions < 1);
          if (!escort) continue;
          // Look up escort unit by squadronId.
          const escortLookup = this.lookupUnitBySquadronId(escort.unitKey, "Player");
          if (!escortLookup) continue;
          const { unit: escortUnit } = escortLookup;
          const escortReq = this.buildMissionAttackRequest("Player", escortUnit, capUnit);
          if (!escortReq) continue;
          let escortRes = resolveAttack(escortReq);
          const escortDef = this.getUnitDefinition(escortUnit.type);
          const capDef = this.getUnitDefinition(capUnit.type);
          if (this.isAircraft(escortDef) && !this.isBomber(escortDef) && this.isAircraft(capDef)) {
            escortRes = { ...escortRes, damagePerHit: escortRes.damagePerHit * 4, expectedDamage: escortRes.expectedDamage * 4, expectedSuppression: escortRes.expectedSuppression * 4 };
          }
          const inflicted = Math.max(0, Math.round(escortRes.expectedDamage));
          const updatedCap = structuredClone(capUnit);
          updatedCap.strength = Math.max(0, updatedCap.strength - inflicted);
          this.spendAircraftAmmo("Player", escort.unitKey, true);
          escort.interceptions += 1;
          // Use capHexKey for placement operations since mission.unitKey is now the squadronId.
          this.botPlacements.set(capHexKey, updatedCap);
          this.syncBotStrength(updatedCap.hex, updatedCap.strength);
          if (updatedCap.strength <= 0) {
            this.botPlacements.delete(capHexKey);
            this.removeBotSupplyEntryFor(capUnit.hex);
            cap.interceptions += 1; // mark as spent
          }
        }

        // Step 2: any surviving CAP engages bomber sequentially
        let currentAtk = this.playerPlacements.get(atkKey) as ScenarioUnit;
        for (const cap of capMissions) {
          if (cap.interceptions >= 1) continue;
          // Look up the surviving CAP unit by squadronId.
          const liveCapLookup = this.lookupUnitBySquadronId(cap.unitKey, opponentFaction);
          if (!liveCapLookup || currentAtk.strength <= 0) continue;
          const { unit: liveCap } = liveCapLookup;
          const capReq = this.buildMissionAttackRequest("Bot", liveCap, currentAtk);
          if (!capReq) continue;
          let capRes = resolveAttack(capReq);
          const capDef = this.getUnitDefinition(liveCap.type);
          if (this.isAircraft(capDef) && !this.isBomber(capDef) && this.isAircraft(unitDef)) {
            capRes = { ...capRes, damagePerHit: capRes.damagePerHit * 4, expectedDamage: capRes.expectedDamage * 4, expectedSuppression: capRes.expectedSuppression * 4 };
          }
          const suffered = Math.max(0, Math.round(capRes.expectedDamage));
          const updatedAtkIntercept = structuredClone(currentAtk);
          updatedAtkIntercept.strength = Math.max(0, updatedAtkIntercept.strength - suffered);
          this.spendAircraftAmmo("Bot", cap.unitKey, true);
          cap.interceptions += 1;
          this.playerPlacements.set(atkKey, updatedAtkIntercept);
          this.syncPlayerStrength(attackerHex, updatedAtkIntercept.strength);
          currentAtk = updatedAtkIntercept;
          if (updatedAtkIntercept.strength <= 0) {
            this.playerPlacements.delete(atkKey);
            this.playerAttackAmmo.delete(atkKey);
            this.removeSupplyEntryFor(attackerHex);
            this.invalidateRosterCache();
            return null;
          }
        }
      }
    }

    const req = this.buildAttackRequest(attacker, defender, "Player", "Bot", { stance: effectiveStance });
    if (!req) {
      return null;
    }
    let attackResult = resolveAttack(req);

    if (attackerIsBomber && !defenderIsAircraft) {
      const boostedDamage = attackResult.expectedDamage * 10;
      attackResult = {
        ...attackResult,
        // Tenfold bomb load (40 x 500lb across four aircraft) compared to fighters (4 bombs) to mirror supply accounting and battlefield impact.
        damagePerHit: attackResult.damagePerHit * 10,
        expectedDamage: boostedDamage,
        expectedSuppression: attackResult.expectedSuppression * 10
      };
    }

    if (attackerIsAircraft && !attackerIsBomber && defenderIsAircraft) {
      const acceleratedAirDamage = attackResult.expectedDamage * 4;
      attackResult = {
        ...attackResult,
        // Air-to-air dogfights resolve far faster than ground engagements; quadruple damage reflects five minutes of concentrated gun passes.
        damagePerHit: attackResult.damagePerHit * 4,
        expectedDamage: acceleratedAirDamage,
        expectedSuppression: attackResult.expectedSuppression * 4
      };
    }

    if (attackerIsAircraft) {
      // Deduct the appropriate sortie (guns vs bombs). Hitting zero flags the unit for a rearm cycle back at base.
      this.spendAircraftAmmo("Player", atkKey, defenderIsAircraft);
    }

    const inflicted = Math.max(
      0,
      attackerIsBomber && !defenderIsAircraft
        ? Math.ceil(attackResult.expectedDamage)
        : Math.round(attackResult.expectedDamage)
    );

    // Apply to defender
    const defKey = axialKey(defenderHex);
    const updatedDef = structuredClone(defender);
    updatedDef.facing = this.resolveFacingToward(defenderHex, attackerHex, defender.facing);
    updatedDef.strength = Math.max(0, updatedDef.strength - inflicted);
    if (updatedDef.strength <= 0) {
      this.botPlacements.delete(defKey);
      this.removeBotSupplyEntryFor(defenderHex);
      this.botAttackAmmo.delete(defKey);
    } else {
      this.botPlacements.set(defKey, updatedDef);
      this.syncBotStrength(defenderHex, updatedDef.strength);

      // Apply suppression status if using suppressive fire
      if (effectiveStance === "suppressive") {
        const attackerUnitId = attacker.unitId ?? atkKey;
        if (!updatedDef.suppressedBy) {
          updatedDef.suppressedBy = [];
        }
        if (!updatedDef.suppressedBy.includes(attackerUnitId)) {
          updatedDef.suppressedBy.push(attackerUnitId);
          this.botPlacements.set(defKey, updatedDef);
        }
      }
    }

    // Ammo consumption (minimal)
    const updatedAtk = structuredClone(attacker);
    updatedAtk.facing = this.resolveFacingToward(attackerHex, defenderHex, attacker.facing);
    updatedAtk.ammo = attackerIsAircraft
      ? Math.max(0, updatedAtk.ammo - 1)
      : Math.max(0, updatedAtk.ammo - groundAttackAmmoCost);
    this.playerPlacements.set(atkKey, updatedAtk);
    this.syncPlayerAmmo(attackerHex, updatedAtk.ammo);

    // Update action flags
    this.playerActionFlags.set(atkKey, {
      movementPointsUsed: flags.movementPointsUsed + attackManeuverCost,
      attacksUsed: flags.attacksUsed + 1,
      retaliationsUsed: flags.retaliationsUsed,
      isRushing: flags.isRushing
    });
    this.updateIdleRegistryFor(atkKey);

    // Retaliation: Defender fires back if still alive and can reach attacker
    // Exception: No counter-attack when aircraft attack ground units (aircraft are too fast/high)
    let retaliationResult: AttackResult | undefined;
    let retaliationOccurred = false;
    let attackerRemainingStrength = updatedAtk.strength;

    // No retaliation if aircraft attacked ground unit
    let retaliationAllowed = !(attackerIsAircraft && !defenderIsAircraft);

      if (updatedDef.strength > 0 && retaliationAllowed) {
        if (this.resolveUnitSuppressionState(updatedDef).state === "pinned") {
          retaliationAllowed = false;
        }
        // Check defender's range - can they reach the attacker?
        const distance = hexDistance(defenderHex, attackerHex);
      const defenderRangeMin = defenderDef.rangeMin ?? 1;
      let defenderRangeMax = defenderDef.rangeMax ?? 1;
      if (defenderIsBomber && attackerIsAircraft) {
        // Heavy bombers can return fire against interceptors out to two tiles, albeit with poor accuracy from the core tables.
        defenderRangeMax = Math.max(defenderRangeMax, 2);
      }
      if (distance < defenderRangeMin || distance > defenderRangeMax) {
        retaliationAllowed = false; // Out of range
      }

      // Check retaliation limit - defenders can only retaliate once per turn
      const defenderFlags = this.botActionFlags.get(defKey) ?? { movementPointsUsed: 0, attacksUsed: 0, retaliationsUsed: 0, isRushing: false };
      if (defenderFlags.retaliationsUsed >= 1) {
        retaliationAllowed = false; // Already retaliated this turn
      }

      // Build reverse attack request (defender attacking attacker)
      // This also checks LOS - if null, defender can't see attacker
      if (defenderIsAircraft) {
        const defenderAmmoState = this.getAircraftAmmoState("Bot", defKey, defenderDef);
        if (this.aircraftNeedsRearm("Bot", defKey)) {
          retaliationOccurred = false;
          this.playerPlacements.set(atkKey, updatedAtk);
          this.syncPlayerStrength(attackerHex, updatedAtk.strength);
          this.updateIdleRegistryFor(atkKey);
          this.invalidateRosterCache();
          return {
            result: attackResult,
            defenderRemainingStrength: updatedDef.strength,
            defenderDestroyed: updatedDef.strength <= 0,
            retaliationResult: undefined,
            attackerRemainingStrength,
            retaliationOccurred: false,
            retaliationNote: "Enemy aircraft must rearm before it can retaliate."
          };
        }
        if (defenderAmmoState.air <= 0) {
          retaliationOccurred = false;
          this.playerPlacements.set(atkKey, updatedAtk);
          this.syncPlayerStrength(attackerHex, updatedAtk.strength);
          this.invalidateRosterCache();
          return {
            result: attackResult,
            defenderRemainingStrength: updatedDef.strength,
            defenderDestroyed: updatedDef.strength <= 0,
            retaliationResult: undefined,
            attackerRemainingStrength,
            retaliationOccurred: false,
            retaliationNote: "Enemy aircraft has depleted interception ammo and must rearm before retaliating."
          };
        }
      } else {
        const defenderAmmo = typeof updatedDef.ammo === "number" ? updatedDef.ammo : null;
        if (defenderAmmo !== null && defenderAmmo < defenderGroundAmmoCost) {
          retaliationOccurred = false;
          this.playerPlacements.set(atkKey, updatedAtk);
          this.syncPlayerStrength(attackerHex, updatedAtk.strength);
          this.invalidateRosterCache();
          return {
            result: attackResult,
            defenderRemainingStrength: updatedDef.strength,
            defenderDestroyed: updatedDef.strength <= 0,
            retaliationResult: undefined,
            attackerRemainingStrength,
            retaliationOccurred: false,
            retaliationNote: defenderGroundAmmoCost > 1
              ? `Enemy unit lacks the ${defenderGroundAmmoCost.toFixed(0)} ammo needed to return indirect fire.`
              : "Enemy unit has no ammunition remaining to retaliate."
          };
        }
      }

      // Only attempt retaliation if all checks passed (range, LOS, limit)
      // If attacker used assault stance, retaliation also happens at close range
      const retaliationReq = retaliationAllowed
        ? this.buildAttackRequest(updatedDef, updatedAtk, "Bot", "Player", {
            allowBomberAirAttack: true,
            stance: effectiveStance === "assault" ? "assault" : undefined
          })
        : null;
      if (retaliationReq) {
        // Retaliation uses full combat damage now that LOS, range, and per-turn limits are enforced
        const baseRetaliation = resolveAttack(retaliationReq);
        let appliedRetaliation: AttackResult;
        let retaliationDamage: number;

        if (defenderIsBomber && attackerIsAircraft) {
          const doubledDamage = baseRetaliation.expectedDamage * 2;
          appliedRetaliation = {
            ...baseRetaliation,
            expectedDamage: doubledDamage,
            damagePerHit: baseRetaliation.damagePerHit * 2,
            expectedSuppression: baseRetaliation.expectedSuppression * 2
          };
          retaliationDamage = Math.max(0, Math.round(doubledDamage));
          // Bomber defensive fire is exaggerated to compensate for fighters enjoying the first strike initiative in the resolution order.
        } else if (defenderIsAircraft && !defenderIsBomber && attackerIsAircraft) {
          const acceleratedAirDamage = baseRetaliation.expectedDamage * 4;
          appliedRetaliation = {
            ...baseRetaliation,
            expectedDamage: acceleratedAirDamage,
            damagePerHit: baseRetaliation.damagePerHit * 4,
            expectedSuppression: baseRetaliation.expectedSuppression * 4
          };
          retaliationDamage = Math.max(0, Math.round(acceleratedAirDamage));
          // Fighter squadrons trading fire at altitude resolve engagements rapidly, so counter-fire mirrors the quadrupled dogfight tempo.
        } else {
          // Ground units (or non-air defenders) retaliate at 100% damage
          appliedRetaliation = baseRetaliation;
          retaliationDamage = Math.max(0, Math.round(baseRetaliation.expectedDamage));
        }

        retaliationResult = appliedRetaliation;

        // Apply retaliation damage to attacker
        updatedAtk.strength = Math.max(0, updatedAtk.strength - retaliationDamage);
        attackerRemainingStrength = updatedAtk.strength;

        if (defenderIsAircraft) {
          this.spendAircraftAmmo("Bot", defKey, attackerIsAircraft);
          if (typeof updatedDef.ammo === "number") {
            updatedDef.ammo = Math.max(0, updatedDef.ammo - 1);
            this.botPlacements.set(defKey, updatedDef);
            this.syncBotAmmo(defenderHex, updatedDef.ammo);
          }
        }

        if (updatedAtk.strength <= 0) {
          // Attacker destroyed by retaliation!
          this.playerPlacements.delete(atkKey);
          this.playerIdleUnitKeys.delete(atkKey);
          this.playerAttackAmmo.delete(atkKey);
          this.removeSupplyEntryFor(attackerHex);
        } else {
          this.playerPlacements.set(atkKey, updatedAtk);
          this.syncPlayerStrength(attackerHex, updatedAtk.strength);
          this.updateIdleRegistryFor(atkKey);
        }

        if (!defenderIsAircraft && typeof updatedDef.ammo === "number") {
          // Ground-based retaliations spend one ammo just like primary attacks so supply mirrors stay accurate.
          updatedDef.ammo = Math.max(0, updatedDef.ammo - defenderGroundAmmoCost);
          this.botPlacements.set(defKey, updatedDef);
          this.syncBotAmmo(defenderHex, updatedDef.ammo);
        }

        // Update bot action flags to track retaliation used
        const defenderFlags = this.botActionFlags.get(defKey) ?? { movementPointsUsed: 0, attacksUsed: 0, retaliationsUsed: 0, isRushing: false };
        this.botActionFlags.set(defKey, {
          ...defenderFlags,
          retaliationsUsed: defenderFlags.retaliationsUsed + 1
        });

        retaliationOccurred = true;
      } else if (retaliationAllowed) {
        this.invalidateRosterCache();
        return {
          result: attackResult,
          defenderRemainingStrength: updatedDef.strength,
          defenderDestroyed: updatedDef.strength <= 0,
          retaliationResult: undefined,
          attackerRemainingStrength,
          retaliationOccurred: false,
          retaliationNote: "Enemy unit lacked line of fire for retaliation."
        };
      }
    }

    // Record combat report for battle analysis
    this.recordCombatReport({
      attacker: {
        unit: attacker,
        hex: attackerHex,
        faction: "Player",
        strengthBefore: attacker.strength,
        strengthAfter: attackerRemainingStrength
      },
      defender: {
        unit: defender,
        hex: defenderHex,
        faction: "Bot",
        strengthBefore: defender.strength,
        strengthAfter: updatedDef.strength,
        destroyed: updatedDef.strength <= 0
      },
      attackResult,
      retaliationResult: retaliationOccurred ? retaliationResult : undefined
    });

    this.invalidateRosterCache();

    return {
      result: attackResult,
      defenderRemainingStrength: updatedDef.strength,
      defenderDestroyed: updatedDef.strength <= 0,
      retaliationResult,
      attackerRemainingStrength,
      retaliationOccurred
    };
  }

  /** Serialize core battle state, excluding transient caches, for persistence or debugging output. */
  serialize(): SerializedBattleState {
    return {
      phase: this._phase,
      activeFaction: this._activeFaction,
      turnNumber: this._turnNumber,
      baseCamp: this._baseCamp ? { hex: structuredClone(this._baseCamp.hex), key: this._baseCamp.key } : null,
      playerPlacements: Array.from(this.playerPlacements.values()).map((unit) => structuredClone(unit)),
      botPlacements: Array.from(this.botPlacements.values()).map((unit) => structuredClone(unit)),
      reserves: this.reserves.map((entry) => structuredClone(entry.unit)),
      // Serialize airborne reserves separately from ground reserves.
      airborneReserves: this.airborneReserves.map((entry) => structuredClone(entry.unit)),
      airMissions: Array.from(this.scheduledAirMissions.values()).map((mission) => this.serializeAirMission(mission)),
      airMissionRefits: Array.from(this.airMissionRefitTimers.entries()).map(([unitKey, timer]) => ({
        missionId: timer.missionId,
        unitKey,
        faction: timer.faction,
        remaining: timer.remaining
      })),
      airMissionReports: this.airMissionReports.map((entry) => structuredClone(entry)),
      reconIntelSnapshot: structuredClone(this.ensureReconIntelSnapshot()),
      counterIntelOperations: Array.from(this.counterIntelOperations.values()).map((entry) => ({
        id: entry.id,
        faction: entry.faction,
        targetHex: structuredClone(entry.targetHex),
        radius: entry.radius,
        remainingTurns: entry.remainingTurns,
        strength: entry.strength
      })),
      intelBriefStates: Array.from(this.intelBriefStates.values()).map((entry) => ({
        briefId: entry.briefId,
        isFalse: entry.isFalse,
        verificationStatus: entry.verificationStatus
      })),
      counterIntelResources: {
        deceptionCharges: this.playerCounterIntelResources.deceptionCharges,
        verificationCharges: this.playerCounterIntelResources.verificationCharges
      },
      counterIntelIdCounter: this.counterIntelIdCounter,
      enemyContactStates: Array.from(this.playerEnemyContactStates.values()).map((entry) => ({
        unitId: entry.unitId,
        state: entry.state,
        lastSeenTurn: entry.lastSeenTurn,
        lastKnownHex: structuredClone(entry.lastKnownHex),
        lastKnownStrength: entry.lastKnownStrength,
        knownUnitType: entry.knownUnitType,
        source: entry.source
      })),
      hexModifications: Array.from(this.hexModifications.values()).map((entry) => structuredClone(entry))
    };
  }

  /**
   * Supplies a read-only snapshot of current player placements so UI layers can mirror the battlefield.
   * The payload is cloned to prevent accidental mutation of engine-managed unit state.
   */
  getPlayerPlacementsSnapshot(): ScenarioUnit[] {
    return Array.from(this.playerPlacements.values()).map((unit) => structuredClone(unit));
  }

  getReserveSnapshot(): ReserveUnit[] {
    return this.reserves.map((entry) => ({
      unit: structuredClone(entry.unit),
      definition: entry.definition,
      allocationKey: entry.allocationKey,
      sprite: entry.sprite
    }));
  }

  /**
   * Returns a categorized roster snapshot covering frontline, support, reserve, and casualty groupings.
   * The snapshot is cached until underlying battle state mutates so UI layers can request it frequently
   * without forcing redundant aggregation work.
   */
  getRosterSnapshot(): BattleRosterSnapshot {
    if (this.cachedRosterSnapshot) {
      return structuredClone(this.cachedRosterSnapshot);
    }

    const snapshot = this.buildRosterSnapshot();
    this.cachedRosterSnapshot = snapshot;
    return structuredClone(snapshot);
  }

  getTurnSummary(): TurnSummary {
    return {
      phase: this._phase,
      activeFaction: this._activeFaction,
      turnNumber: this._turnNumber
    } satisfies TurnSummary;
  }

  /**
   * Consumes and returns the pending bot turn summary, clearing it so it can only be read once.
   * Returns null if no bot turn has been executed since the last consumption.
   */
  consumeBotTurnSummary(): BotTurnSummary | null {
    const result = this.pendingBotTurnSummary;
    this.pendingBotTurnSummary = null;
    return result;
  }

  /** Transfers an ally unit at the specified hex to player control. Returns true if a unit was transferred. */
  transferAllyControl(hex: Axial): boolean {
    const key = axialKey(hex);
    const allyUnit = this.allyPlacements.get(key);
    if (!allyUnit) {
      return false;
    }

    // Remove from ally placements and supply mirror.
    this.allyPlacements.delete(key);
    this.allySupply = this.allySupply.filter((s) => axialKey(s.hex) !== key);

    // Transfer to player placements and supply mirror.
    const clone = structuredClone(allyUnit);
    this.ensureUnitId(clone);
    this.playerPlacements.set(key, clone);
    const [supplyEntry] = createSupplyUnits([clone]);
    if (supplyEntry) {
      this.playerSupply.push(supplyEntry);
    }

    // Reset action flags/idle state for the new player unit.
    this.playerActionFlags.set(key, this.createDefaultActionFlags());
    this.updateIdleRegistryFor(key);

    // Keep mirrors and caches consistent.
    this.invalidateRosterCache();
    this.recordSupplySnapshot("Player");

    return true;
  }

  /** Executes the ally turn. Placeholder: allies hold position until dedicated ally AI is implemented. */
  private executeAllyTurn(): void {
    // Intentionally minimal: allies currently do not perform autonomous maneuvers.
    // Supply upkeep and air mission progression are still applied in endTurn sequencing.
  }

  setSupplyPriority(unitId: string, priority: SupplyPriority): boolean {
    if (!unitId) {
      return false;
    }

    const validPriorities: SupplyPriority[] = ["critical", "high", "normal", "low"];
    if (!validPriorities.includes(priority)) {
      return false;
    }

    const unit = Array.from(this.playerPlacements.values()).find((candidate) => candidate.unitId === unitId) ?? null;
    if (!unit || this.isSupplyTruckType(unit.type)) {
      return false;
    }

    this.supplyPriorityByUnitId.set(unitId, priority);
    this.recordSupplySnapshot("Player");
    return true;
  }

  getLogisticsSnapshot(): LogisticsSnapshot {
    this.ensureSupplyTruckStatesForFaction("Player");
    const allPlacements = Array.from(this.playerPlacements.values());
    const convoyUnits = allPlacements.filter((unit) => this.isSupplyTruckType(unit.type));
    const placements = allPlacements.filter((unit) => !this.isSupplyTruckType(unit.type));
    const totalUnits = placements.length;
    const network = this.buildSupplyNetwork("Player");
    const catalog: SupplyTerrainCatalog = { terrain: this.terrain, unitTypes: this.unitTypes };
    const sources: Array<{ key: string; label: string; hex: Axial }> = [];
    if (this._baseCamp) {
      sources.push({ key: "baseCamp", label: "Base Camp", hex: this._baseCamp.hex });
    }
    if (this.playerSide.hq) {
      sources.push({ key: "hq", label: "Headquarters", hex: this.playerSide.hq });
    }
    const depotTotals = getInventoryTotals(this.supplyStateByFaction.Player, ["ammo", "fuel", "parts"]);
    const carriedAmmoTotal = this.playerSupply.reduce<number>((sum, entry) => sum + (entry.ammo ?? 0), 0);
    const carriedFuelTotal = this.playerSupply.reduce<number>((sum, entry) => sum + (entry.fuel ?? 0), 0);
    const maintenanceDemand = placements.reduce<number>((sum, unit) => sum + Math.max(0, 10 - unit.strength), 0);
    const convoyStateMap = this.getSupplyTruckStateMap("Player");
    const convoyCargo = Array.from(convoyStateMap.values()).reduce<{ ammo: number; fuel: number }>((totals, convoy) => {
      totals.ammo += convoy.ammoCargo;
      totals.fuel += convoy.fuelCargo;
      return totals;
    }, { ammo: 0, fuel: 0 });

    const routesBySource = sources.map((source) => ({
      source,
      routes: this.computePlayerLogisticsRoutes(source.hex, catalog, network, placements)
    }));
    const sourceAssignments = new Map<string, Array<{ sourceLabel: string; targetKey: string; unit: ScenarioUnit; summary: SupplyRouteSummary }>>();
    sources.forEach((source) => sourceAssignments.set(source.key, []));

    type AssignedSourceRoute = { sourceKey: string; sourceLabel: string; summary: SupplyRouteSummary };

    placements.forEach((unit) => {
      const targetKey = axialKey(unit.hex);
      let bestRoute: AssignedSourceRoute | null = null;
      for (const { source, routes } of routesBySource) {
        const summary = routes.get(targetKey);
        if (!summary) {
          continue;
        }
        if (!bestRoute || summary.totalCost < bestRoute.summary.totalCost) {
          bestRoute = { sourceKey: source.key, sourceLabel: source.label, summary };
        }
      }
      if (!bestRoute) {
        return;
      }
      sourceAssignments.get(bestRoute.sourceKey)?.push({
        sourceLabel: bestRoute.sourceLabel,
        targetKey,
        unit,
        summary: bestRoute.summary
      });
    });

    const connectedUnits = Array.from(sourceAssignments.values()).reduce((sum, entries) => sum + entries.length, 0);
    const isolatedUnits = Math.max(0, totalUnits - connectedUnits);

    const nearestSourceForHex = (hex: Axial): string | null => {
      if (sources.length === 0) {
        return null;
      }
      let best: { key: string; distance: number } | null = null;
      for (const source of sources) {
        const distance = hexDistance(source.hex, hex);
        if (!best || distance < best.distance) {
          best = { key: source.key, distance };
        }
      }
      return best?.key ?? null;
    };

    const supplySources: LogisticsSupplySource[] = sources.map((source) => {
      const assignedRoutes = sourceAssignments.get(source.key) ?? [];
      const routeValues = assignedRoutes.map((entry) => entry.summary);
      const sourceConnectedUnits = assignedRoutes.length;
      const sourceConvoys = convoyUnits.filter((unit) => nearestSourceForHex(unit.hex) === source.key);
      const operationalConvoys = sourceConvoys.filter((unit) => {
        const convoyState = unit.unitId ? convoyStateMap.get(unit.unitId) : null;
        return convoyState?.status !== "blocked";
      });
      const throughput = operationalConvoys.length * (supplyBalance.convoy.unloadAmmoPerTurn + supplyBalance.convoy.unloadFuelPerTurn);
      const averageTravelHours = routeValues.length === 0
        ? 0
        : Number((routeValues.reduce<number>((sum, summary) => sum + summary.estimatedHours, 0) / routeValues.length).toFixed(2));
      const utilization = convoyUnits.length === 0 ? 0 : Number((sourceConvoys.length / convoyUnits.length).toFixed(2));
      const bottleneckSummary = this.selectHighestCostRoute(routeValues);
      const bottleneck = sourceConnectedUnits > 0 && sourceConvoys.length === 0
        ? "No convoy coverage"
        : bottleneckSummary
          ? this.describeRouteBottleneck(bottleneckSummary)
          : null;
      return {
        key: source.key,
        label: source.label,
        connectedUnits: sourceConnectedUnits,
        throughput: Number(throughput.toFixed(2)),
        utilization,
        averageTravelHours,
        bottleneck
      } satisfies LogisticsSupplySource;
    });

    const stockpiles: LogisticsStockpileEntry[] = [
      {
        resource: "ammo",
        total: depotTotals.ammo ?? 0,
        averagePerUnit: totalUnits === 0 ? 0 : Number((carriedAmmoTotal / totalUnits).toFixed(2)),
        trend: (depotTotals.ammo ?? 0) >= totalUnits * supplyBalance.resupply.ammo ? "stable" : "falling"
      },
      {
        resource: "fuel",
        total: depotTotals.fuel ?? 0,
        averagePerUnit: totalUnits === 0 ? 0 : Number((carriedFuelTotal / totalUnits).toFixed(2)),
        trend: (depotTotals.fuel ?? 0) >= totalUnits * supplyBalance.resupply.fuel ? "stable" : "falling"
      },
      {
        resource: "parts",
        total: depotTotals.parts ?? 0,
        averagePerUnit: totalUnits === 0 ? 0 : Number((maintenanceDemand / Math.max(totalUnits, 1)).toFixed(2)),
        trend: (depotTotals.parts ?? 0) > maintenanceDemand ? "rising" : "stable"
      }
    ];

    const delayNodesMap = new Map<string, number>();
    const priorityTargets = this.resolveSupplyDemandEntries("Player")
      .map((entry) => {
        const assignedConvoys = convoyUnits.reduce((count, convoy) => {
          const convoyId = convoy.unitId ?? "";
          const convoyState = convoyStateMap.get(convoyId);
          return convoyState?.assignedUnitId === entry.unit.unitId ? count + 1 : count;
        }, 0);
        const reachableFromNetwork = hasSupplyPath(entry.unit.hex, network);
        return {
          unitId: entry.unit.unitId ?? `${entry.unit.type}@${axialKey(entry.unit.hex)}`,
          unitLabel: this.getDisplayUnitLabel(entry.unit),
          hex: this.formatAxial(entry.unit.hex),
          priority: entry.priority,
          ammoNeed: Number(entry.ammoNeed.toFixed(2)),
          fuelNeed: Number(entry.fuelNeed.toFixed(2)),
          assignedConvoys,
          status: entry.directEligible
            ? "direct"
            : assignedConvoys > 0
              ? "delivering"
              : reachableFromNetwork
                ? "queued"
                : "isolated"
        } satisfies LogisticsPriorityEntry;
      })
      .sort((left, right) =>
        this.getSupplyPriorityWeight(right.priority) - this.getSupplyPriorityWeight(left.priority)
        || (right.ammoNeed + right.fuelNeed) - (left.ammoNeed + left.fuelNeed)
      );

    const convoyStatuses: LogisticsConvoyStatusEntry[] = convoyUnits.map((unit) => {
      const convoyId = unit.unitId ?? this.ensureUnitId(unit);
      const convoyState = convoyStateMap.get(convoyId)!;
      const assignedUnit = placements.find((candidate) => candidate.unitId === convoyState.assignedUnitId) ?? null;
      const occupancy = this.buildUnifiedOccupancySet();
      occupancy.delete(axialKey(unit.hex));
      const routePlan = assignedUnit
        ? this.findCheapestPathToAny(
          unit.hex,
          this.collectServiceHexes(assignedUnit.hex, unit.hex),
          this.getUnitDefinition(unit.type).moveType,
          occupancy
        )
        : this.isHexWithinSupplySourceRadius(unit.hex, "Player")
          ? null
          : this.findCheapestPathToAny(
            unit.hex,
            this.collectSourceApproachHexes("Player", unit.hex),
            this.getUnitDefinition(unit.type).moveType,
            occupancy
          );

      if (routePlan) {
        let cumulativeCost = 0;
        routePlan.path.slice(1).forEach((hex) => {
          cumulativeCost += this.resolveMoveCost("wheel", this.terrainAt(hex), hex);
          const nodeKey = this.formatAxial(hex);
          const seen = delayNodesMap.get(nodeKey) ?? 0;
          delayNodesMap.set(nodeKey, Math.max(seen, cumulativeCost));
        });
      }

      const etaHours = routePlan
        ? Number((((routePlan.path.length - 1) * 5) / 60).toFixed(2))
        : 0;
      const incident = unit.fuel <= 0
        ? "Out of fuel"
        : convoyState.status === "blocked" || (assignedUnit !== null && !routePlan)
          ? "Route blocked"
          : null;
      const routeLabel = assignedUnit
        ? `${this.getDisplayUnitLabel(unit)} → ${this.getDisplayUnitLabel(assignedUnit)} @ ${this.formatAxial(assignedUnit.hex)}`
        : this.isHexWithinSupplySourceRadius(unit.hex, "Player")
          ? `${this.getDisplayUnitLabel(unit)} rearming at depot`
          : `${this.getDisplayUnitLabel(unit)} → Depot`;
      return {
        unitId: convoyId,
        convoyLabel: `${this.getDisplayUnitLabel(unit)} @ ${this.formatAxial(unit.hex)}`,
        route: routeLabel,
        status: incident ? "blocked" : convoyState.status,
        etaHours,
        cargoAmmo: Number(convoyState.ammoCargo.toFixed(2)),
        cargoFuel: Number(convoyState.fuelCargo.toFixed(2)),
        incident
      } satisfies LogisticsConvoyStatusEntry;
    });

    const delayNodes: LogisticsDelayNode[] = Array.from(delayNodesMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([node, cost]) => ({
        node,
        risk: this.resolveDelayRisk(cost),
        reason: cost > 25 ? "Extended travel time" : "Moderate congestion"
      }));

    const maintenanceBacklog: LogisticsMaintenanceEntry[] = [];

    const alerts: LogisticsAlertEntry[] = [];
    if (isolatedUnits > 0) {
      alerts.push({
        level: isolatedUnits === totalUnits ? "critical" : "warning",
        message: `${isolatedUnits} deployed unit${isolatedUnits === 1 ? "" : "s"} ${isolatedUnits === totalUnits ? "are" : "is"} outside the current supply network.`
      });
    }
    if ((depotTotals.ammo ?? 0) <= 0) {
      alerts.push({ level: "critical", message: "Depot ammunition has been exhausted." });
    } else if (stockpiles[0]?.averagePerUnit < 3) {
      alerts.push({ level: "warning", message: "Ammunition reserves are trending low." });
    }
    if ((depotTotals.fuel ?? 0) <= 0) {
      alerts.push({ level: "critical", message: "Depot fuel stock has been exhausted." });
    } else if (stockpiles[1]?.averagePerUnit < 3) {
      alerts.push({ level: "warning", message: "Fuel availability is below desired levels." });
    }
    const forwardUnitsNeedingConvoys = priorityTargets.filter((entry) => entry.status !== "direct");
    if (forwardUnitsNeedingConvoys.length > 0 && convoyUnits.length === 0) {
      alerts.push({ level: "critical", message: "Forward units need resupply but no supply convoys are deployed." });
    } else if (forwardUnitsNeedingConvoys.length > convoyUnits.length && convoyUnits.length > 0) {
      alerts.push({ level: "warning", message: "Convoy coverage is thinner than the current resupply queue." });
    }
    if (sources.length === 0 && totalUnits > 0) {
      alerts.push({ level: "critical", message: "No active base camp or headquarters is feeding the logistics network." });
    }

    return {
      turn: this._turnNumber,
      deployedUnits: totalUnits,
      connectedUnits,
      isolatedUnits,
      convoyUnits: convoyUnits.length,
      loadedConvoys: convoyStatuses.filter((entry) => entry.cargoAmmo > 0 || entry.cargoFuel > 0).length,
      convoyCargo: {
        ammo: Number(convoyCargo.ammo.toFixed(2)),
        fuel: Number(convoyCargo.fuel.toFixed(2))
      },
      depotStock: {
        ammo: depotTotals.ammo ?? 0,
        fuel: depotTotals.fuel ?? 0,
        parts: depotTotals.parts ?? 0
      },
      supplySources,
      stockpiles,
      convoyStatuses,
      priorityTargets,
      delayNodes,
      maintenanceBacklog,
      alerts
    } satisfies LogisticsSnapshot;
  }

  /**
   * Returns a read-only copy of all combat reports for battle analysis.
   */
  getCombatReports(): readonly CombatReportEntry[] {
    return [...this.combatReports];
  }

  /**
   * Exposes the commander bonus package so UI overlays can mirror the exact modifiers applied in-engine.
   * Structured cloning guards the internal mutable copy from accidental downstream mutation.
   */
  getCommanderBenefits(): CommanderBenefits {
    return structuredClone(this.playerCommanderStats);
  }

  /** Quick guard helpers keep aircraft logic consistent. */
  private isAircraft(definition: UnitTypeDefinition): boolean {
    return definition.moveType === "air";
  }

  private isBomber(definition: UnitTypeDefinition): boolean {
    return this.isAircraft(definition) && (definition.traits ?? []).includes("carpet");
  }

  /** Dedicated reconnaissance aircraft provide spotting only and never conduct offensive sorties. */
  private isScoutPlane(definition: UnitTypeDefinition): boolean {
    return this.isAircraft(definition) && definition.class === "recon";
  }

  /** Returns the baseline sortie ammunition for the provided airframe. */
  private createInitialAircraftAmmo(definition: UnitTypeDefinition): AircraftAmmoState {
    if (!this.isAircraft(definition)) {
      return { air: 0, ground: 0, needsRearm: false };
    }

    if (this.isScoutPlane(definition)) {
      // Reconnaissance planes only provide spotting and never carry ordnance.
      return { air: 0, ground: 0, needsRearm: false };
    }

    return { air: 4, ground: 1, needsRearm: false };
  }

  /** Applies quick-repair strength restoration when an aircraft successfully rearms. */
  private applyAircraftRepair(faction: TurnFaction, unitKey: string, unit: ScenarioUnit): void {
    const currentStrength = unit.strength ?? 0;
    const repairedStrength = Math.min(100, Math.round(currentStrength * 1.1));
    if (repairedStrength <= currentStrength) {
      return;
    }

    const updatedUnit = structuredClone(unit);
    updatedUnit.strength = repairedStrength;

    if (faction === "Player") {
      this.playerPlacements.set(unitKey, updatedUnit);
      this.syncPlayerStrength(updatedUnit.hex, repairedStrength);
    } else {
      this.botPlacements.set(unitKey, updatedUnit);
      this.syncBotStrength(updatedUnit.hex, repairedStrength);
    }
  }

  /** Ensures aircraft ammo trackers stay aligned when units move between hexes. */
  private transferAircraftAmmoState(
    registry: Map<string, AircraftAmmoState>,
    fromKey: string,
    toKey: string
  ): void {
    if (!registry.has(fromKey)) {
      return;
    }
    const payload = registry.get(fromKey);
    registry.delete(fromKey);
    if (payload) {
      registry.set(toKey, payload);
    }
  }

  /** Fetch or initialize the aircraft ammo record for a given unit. */
  private getAircraftAmmoState(
    faction: TurnFaction,
    hexKey: string,
    definition: UnitTypeDefinition
  ): AircraftAmmoState {
    const registry = faction === "Player" ? this.playerAttackAmmo : this.botAttackAmmo;
    const existing = registry.get(hexKey);
    if (existing) {
      return existing;
    }
    const initialState = this.createInitialAircraftAmmo(definition);
    registry.set(hexKey, initialState);
    return initialState;
  }

  /** Reset aircraft sortie ammo after the unit spends a turn sitting on the base camp hex. */
  private resetAircraftAmmoIfAtBase(unit: ScenarioUnit, faction: TurnFaction): void {
    // Only the player currently has a modeled base camp rearming loop.
    const base = faction === "Player" ? this._baseCamp : null;
    if (!base) {
      return;
    }
    const unitKey = this.getSquadronId(unit);
    const registry = faction === "Player" ? this.playerAttackAmmo : this.botAttackAmmo;
    const state = registry.get(unitKey);
    if (!state) {
      return;
    }
    const definition = this.getUnitDefinition(unit.type);
    if (!this.isAircraft(definition)) {
      return;
    }
    if (axialKey(base.hex) !== axialKey(unit.hex)) {
      return;
    }

    const flags = faction === "Player" ? this.playerActionFlags.get(unitKey) : undefined;
    // Require the squadron to finish the turn on the base hex (no fractional move points remaining).
    if (flags && flags.movementPointsUsed > 0) {
      return;
    }
    const baseline = this.createInitialAircraftAmmo(definition);
    const wasDepleted = state.needsRearm || state.air < baseline.air || state.ground < baseline.ground;
    registry.set(unitKey, baseline);
    if (wasDepleted) {
      this.applyAircraftRepair(faction, unitKey, unit);
    }
  }

  /** Determine if an aircraft is flagged for rearming and therefore cannot launch more attacks. */
  private aircraftNeedsRearm(faction: TurnFaction, hexKey: string): boolean {
    const registry = faction === "Player" ? this.playerAttackAmmo : this.botAttackAmmo;
    const state = registry.get(hexKey);
    return state?.needsRearm ?? false;
  }

  /** Tag an aircraft as requiring rearm, preventing further attacks until it parks on the base. */
  private markAircraftNeedsRearm(faction: TurnFaction, hexKey: string): void {
    const registry = faction === "Player" ? this.playerAttackAmmo : this.botAttackAmmo;
    const snapshot = registry.get(hexKey);
    if (!snapshot) {
      return;
    }
    registry.set(hexKey, { ...snapshot, needsRearm: true });
  }

  /** Consume one sortie from the appropriate ammo pool. Returns updated state for logging. */
  private spendAircraftAmmo(
    faction: TurnFaction,
    hexKey: string,
    targetIsAir: boolean
  ): AircraftAmmoState | null {
    const registry = faction === "Player" ? this.playerAttackAmmo : this.botAttackAmmo;
    const snapshot = registry.get(hexKey);
    if (!snapshot) {
      return null;
    }
    const next: AircraftAmmoState = { ...snapshot };
    if (targetIsAir) {
      next.air = Math.max(0, next.air - 1);
      if (next.air <= 0) {
        next.needsRearm = true;
      }
    } else {
      next.ground = Math.max(0, next.ground - 1);
      if (next.ground <= 0) {
        next.needsRearm = true;
      }
    }
    registry.set(hexKey, next);
    return next;
  }

  /** Re-arm aircraft for the specified faction at the start of a fresh turn. */
  private refreshAircraftAmmoForFaction(faction: TurnFaction): void {
    const registry = faction === "Player" ? this.playerAttackAmmo : this.botAttackAmmo;
    const placements = faction === "Player" ? this.playerPlacements : this.botPlacements;

    // Drop stale entries for units that no longer exist on the board.
    for (const key of Array.from(registry.keys())) {
      if (!placements.has(key)) {
        registry.delete(key);
      }
    }

    placements.forEach((unit, key) => {
      const definition = this.getUnitDefinition(unit.type);
      if (!this.isAircraft(definition)) {
        registry.delete(key);
        return;
      }

      const state = this.getAircraftAmmoState(faction, key, definition);

      if (faction === "Player") {
        // Player squadrons only rearm once they actually spend a turn parked on the base hex.
        this.resetAircraftAmmoIfAtBase(unit, faction);
      } else {
        // AI logistics are abstracted off-map, so bots rearm automatically between turns using baseline loadouts.
        const baseline = this.createInitialAircraftAmmo(definition);
        const wasDepleted = state.needsRearm || state.air < baseline.air || state.ground < baseline.ground;
        registry.set(key, baseline);
        if (wasDepleted) {
          this.applyAircraftRepair(faction, key, unit);
        }
      }
    });
  }

  /** Guard helper ensuring a method is used in the correct phase. */
  private assertPhase(expected: BattlePhase, message: string): void {
    if (this._phase !== expected) {
      throw new Error(message);
    }
  }

  /** Guard rejecting calls when still in deployment. */
  private assertNotPhase(disallowed: BattlePhase, message: string): void {
    if (this._phase === disallowed) {
      throw new Error(message);
    }
  }

  /** Retrieve a unit at the specified hex for the given faction. Optionally includes reserves for air units. */
  private lookupUnit(hex: Axial, faction: TurnFaction, includeReserves = false): ScenarioUnit | null {
    const map = faction === "Player" ? this.playerPlacements : this.botPlacements;
    const deployed = map.get(axialKey(hex)) ?? null;
    if (deployed) {
      return deployed;
    }
    // Optionally check reserves for player faction (air units may fly missions without being deployed)
    if (includeReserves && faction === "Player") {
      const key = axialKey(hex);
      const reserveEntry = this.reserves.find((r) => axialKey(r.unit.hex) === key);
      return reserveEntry?.unit ?? null;
    }
    return null;
  }

  /**
   * Finds a unit by its stable squadronId (unitId). Searches deployed placements and reserves.
   * Returns the unit and its current hex key if found, null otherwise.
   * This is critical for air mission resolution since squadrons may share a base hex.
   */
  private lookupUnitBySquadronId(
    squadronId: string,
    faction: TurnFaction
  ): { unit: ScenarioUnit; hexKey: string } | null {
    const placements = faction === "Player" ? this.playerPlacements : this.botPlacements;

    // Search deployed units first
    for (const [hexKey, unit] of placements.entries()) {
      if (this.getSquadronId(unit) === squadronId) {
        return { unit, hexKey };
      }
    }

    // For player faction, also check reserves (air units may fly missions without being deployed)
    if (faction === "Player") {
      for (const entry of this.reserves) {
        if (this.getSquadronId(entry.unit) === squadronId) {
          return { unit: entry.unit, hexKey: axialKey(entry.unit.hex) };
        }
      }
    }

    return null;
  }

  /** Backward-compatible overload (legacy call sites assume Player attacks Bot). */
  private buildAttackRequest(attacker: ScenarioUnit, defender: ScenarioUnit, options?: { allowBomberAirAttack?: boolean; stance?: CombatStance }): AttackRequest | null;
  /** Faction-aware overload. */
  private buildAttackRequest(
    attacker: ScenarioUnit,
    defender: ScenarioUnit,
    attackerFaction: TurnFaction,
    defenderFaction: TurnFaction,
    options?: { allowBomberAirAttack?: boolean; stance?: CombatStance }
  ): AttackRequest | null;
  private buildAttackRequest(
    attacker: ScenarioUnit,
    defender: ScenarioUnit,
    a3?: any,
    a4?: any,
    a5?: any
  ): AttackRequest | null {
    let attackerFaction: TurnFaction = "Player";
    let defenderFaction: TurnFaction = "Bot";
    let options: { allowBomberAirAttack?: boolean; stance?: CombatStance } | undefined;

    if (a3 === "Player" || a3 === "Bot" || a3 === "Ally") {
      attackerFaction = a3 as TurnFaction;
      defenderFaction = (a4 as TurnFaction) ?? (attackerFaction === "Player" ? "Bot" : "Player");
      options = a5 as typeof options;
    } else {
      options = a3 as typeof options;
    }

    const attackerType = this.getUnitDefinition(attacker.type);
    const defenderType = this.getUnitDefinition(defender.type);
    const lister = this.createLosLister();

    // Aircraft combat restrictions: Only aircraft and Flak 88 can attack aircraft
    const defenderIsAircraft = defenderType.moveType === "air";
    const attackerIsAircraft = attackerType.moveType === "air";
    const attackerIsFlak = attacker.type.toLowerCase().includes("flak");
    const attackerIsBomber = this.isBomber(attackerType);
    if (!attackerIsAircraft && attacker.ammo < this.resolveGroundAttackAmmoCost(attackerType)) {
      return null;
    }

    if (defenderIsAircraft && !attackerIsAircraft && !attackerIsFlak) {
      return null; // Ground units (except Flak) cannot target aircraft
    }

    if (!options?.allowBomberAirAttack && attackerIsBomber && defenderIsAircraft) {
      return null; // Bombers only engage aircraft defensively during retaliation.
    }

    // Check direct LOS using advanced system with unit-specific rules
    const hasDirectLOS = losClearAdvanced({
      attackerClass: attackerType.class,
      attackerHex: attacker.hex,
      targetHex: defender.hex,
      isAttackerAir: attackerType.moveType === "air",
      lister
    });

    // If no direct LOS, check if the attacker's faction has spotting coverage on the defender.
    let isSpottedOnly = false;
    if (!hasDirectLOS) {
      const hasSpotting = this.checkTargetSpotted(defender.hex, attackerFaction);
      if (!hasSpotting) {
        return null; // No LOS and no spotting = can't attack
      }
      isSpottedOnly = true;
    }

    const attackerGeneral = attackerFaction === "Player" ? this.playerSide.general : this.botSide.general;
    const defenderGeneral = defenderFaction === "Player" ? this.playerSide.general : this.botSide.general;

    const attackerState: UnitCombatState = {
      unit: attackerType,
      strength: attacker.strength,
      experience: attacker.experience,
      general: attackerGeneral
    };
    const defenderState: UnitCombatState = {
      unit: defenderType,
      strength: defender.strength,
      experience: defender.experience,
      general: defenderGeneral
    };
    // Combat stance logic (infantry-type units only)
    const stance = options?.stance;
    const isAssault = stance === "assault";

    const attackerCtx: AttackerContext = {
      hex: attacker.hex,
      stance: stance
    };

    // Check if defender is rushing (loses terrain cover). We inspect both flag collections because previews may look across factions.
    const defKey = axialKey(defender.hex);
    const botFlags = this.botActionFlags.get(defKey);
    const playerFlags = this.playerActionFlags.get(defKey);
    const isDefenderRushing = !!(botFlags?.isRushing || playerFlags?.isRushing);

    // Check for fortifications on defender's hex
    const defenderMod = this.getHexModification(defender.hex);
    const defenderFortified = defenderMod?.type === "fortifications";

    const defenderCtx: DefenderContext = {
      terrain: this.terrainAt(defender.hex) ?? this.defaultTerrain(),
      class: defenderType.class,
      facing: defender.facing,
      hex: defender.hex,
      isRushing: isDefenderRushing || isAssault, // Attacker loses cover when assaulting
      isSpottedOnly,
      stance: isAssault ? "assault" : undefined, // Defender also at close range if assaulted
      fortified: defenderFortified
    };
    return {
      attacker: attackerState,
      defender: defenderState,
      attackerCtx,
      defenderCtx,
      targetFacing: defender.facing,
      isSoftTarget: defenderType.class === "infantry" || defenderType.class === "specialist"
    };
  }

  /** Check if target hex is spotted by any friendly unit that can plausibly see it. */
  private checkTargetSpotted(targetHex: Axial, faction: "Player" | "Bot" | "Ally"): boolean {
    const placements = faction === "Player" ? this.playerPlacements : faction === "Bot" ? this.botPlacements : this.allyPlacements;
    const lister = this.createLosLister();

    // Check all friendly units for spotting capability
    for (const [_, unit] of placements) {
      const unitDef = this.getUnitDefinition(unit.type);
      const distanceToTarget = hexDistance(unit.hex, targetHex);
      const spottingRange = this.resolveSpottingRange(unitDef);
      if (distanceToTarget > spottingRange) {
        continue;
      }

      // Check if this unit has LOS to the target
      const hasLOS = losClearAdvanced({
        attackerClass: unitDef.class,
        attackerHex: unit.hex,
        targetHex: targetHex,
        isAttackerAir: unitDef.moveType === "air",
        lister
      });

      if (hasLOS) {
        // Ground units only spot when the target sits inside their vision bubble, maintaining the need for dedicated recon at long range.
        return true; // Target spotted!
      }
    }

    return false; // No friendly unit can see target
  }

  /**
   * Apply supply upkeep or attrition to whichever faction just finished its turn.
   */
  private applySupplyTickFor(faction: TurnFaction): SupplyTickReport {
    const units = faction === "Player" ? this.playerSupply : faction === "Bot" ? this.botSupply : this.allySupply;
    const placements = faction === "Player" ? this.playerPlacements : faction === "Bot" ? this.botPlacements : this.allyPlacements;
    const supplyState = this.supplyStateByFaction[faction];
    // Credit baseline production and deliver any shipments slated for this turn before upkeep drains consume stock.
    this.advanceFactionSupplyState(faction);
    const network = this.buildSupplyNetwork(faction);
    const outOfSupply: ScenarioUnit[] = [];
    const supplyScalar = this.commanderSupplyScalar(faction);
    const attritionProfile: SupplyAttritionProfile = {
      ammoLoss: this.scaleSupplyAmount(supplyBalance.tick.ammoLoss, supplyScalar),
      fuelLoss: this.scaleSupplyAmount(supplyBalance.tick.fuelLoss, supplyScalar),
      entrenchLoss: this.scaleSupplyAmount(supplyBalance.tick.entrenchLoss, supplyScalar),
      strengthLossWhenEmpty: this.scaleSupplyAmount(supplyBalance.tick.stepLossWhenEmpty, supplyScalar)
    };
    units.forEach((state) => {
      const key = axialKey(state.hex);
      const unit = placements.get(key);
      if (!unit) {
        return;
      }

      const connectedToSupply = hasSupplyPath(state.hex, network);
      if (connectedToSupply) {
        // Draw upkeep from the depot first, falling back to the unit's onboard stores when the stockpile runs dry.
        const definition = this.getUnitDefinition(unit.type);
        const upkeep = resolveUpkeepForClass(definition.class);
        const scaledUpkeep = {
          ammo: this.scaleSupplyAmount(upkeep.ammo, supplyScalar),
          fuel: this.scaleSupplyAmount(upkeep.fuel, supplyScalar)
        };
        this.applyUpkeepForUnit(faction, supplyState, unit, state, scaledUpkeep);
      } else {
        const previous = { ammo: state.ammo, fuel: state.fuel, entrench: state.entrench, strength: state.strength };
        applyOutOfSupply(state, attritionProfile);
        unit.ammo = state.ammo;
        unit.fuel = state.fuel;
        unit.entrench = state.entrench;
        unit.strength = state.strength;
        const sufferedAttrition =
          state.ammo !== previous.ammo ||
          state.fuel !== previous.fuel ||
          state.entrench !== previous.entrench ||
          state.strength !== previous.strength;
        if (sufferedAttrition) {
          outOfSupply.push(structuredClone(unit));
        }
      }

      // Keep the placement mirrored with the supply state so UI snapshots expose accurate onboard values.
      unit.ammo = state.ammo;
      unit.fuel = state.fuel;
      unit.entrench = state.entrench;
      unit.strength = state.strength;
    });

    const demandEntries = this.resolveSupplyDemandEntries(faction);
    this.applyDirectDepotIssues(faction, supplyState, demandEntries);
    this.automateSupplyConvoys(faction, supplyState, demandEntries);

    enforceLedgerLimit(supplyState, supplyBalance.ledgerLimit);
    const snapshot = this.computeSupplySnapshot(faction);
    this.storeSupplySnapshot(faction, snapshot);
    return { faction, outOfSupply };
  }

  /** Adapter returning both terrain and LOS fields to the `losClear()` helper. */
  private createLosLister(): Lister {
    return {
      terrainAt: (hex: Axial) => this.terrainAt(hex)
    };
  }

  /** Construct the supply network for the specified faction using the base camp as the primary source. */
  private buildSupplyNetwork(faction: TurnFaction): SupplyNetwork {
    const sources: Axial[] = [];
    if (faction === "Player" && this._baseCamp) {
      sources.push(this._baseCamp.hex);
    }
    const side = faction === "Player" ? this.playerSide : faction === "Bot" ? this.botSide : this.allySide;
    if (side?.hq) {
      sources.push(side.hq);
    }
    return {
      sources,
      map: {
        terrainAt: (hex) => this.terrainAt(hex),
        isRoad: (hex) => this.isRoad(hex),
        isPassable: () => true
      }
    };
  }

  /** Simple heuristic: treat tiles flagged as road or containing bridges as roads for supply routing. */
  private isRoad(hex: Axial): boolean {
    const entry = this.lookupTileEntry(hex);
    if (!entry) {
      return false;
    }
    return entry.tile.toLowerCase().includes("road");
  }

  /** In-bounds check for axial coordinates. */
  private inBounds(hex: Axial): boolean {
    const rows = this.scenario.size.rows;
    const cols = this.scenario.size.cols;
    // Convert axial to offset for bounds checking since scenario.tiles uses offset coordinates
    const col = hex.q;
    const row = hex.r + Math.floor(hex.q / 2);
    return col >= 0 && row >= 0 && col < cols && row < rows;
  }

  /** True if any unit occupies the hex. */
  private isOccupied(hex: Axial): boolean {
    const key = axialKey(hex);
    return this.playerPlacements.has(key) || this.botPlacements.has(key) || this.allyPlacements.has(key);
  }

  /** Update cached player supply entry position after a move. */
  private updatePlayerSupplyPosition(from: Axial, to: Axial): void {
    const fromKey = axialKey(from);
    const idx = this.playerSupply.findIndex((s) => axialKey(s.hex) === fromKey);
    if (idx >= 0) {
      this.playerSupply[idx].hex = structuredClone(to);
    }
  }

  /** Sync attacker ammo to supply mirror. */
  private syncPlayerAmmo(attackerHex: Axial, ammo: number): void {
    const key = axialKey(attackerHex);
    const idx = this.playerSupply.findIndex((s) => axialKey(s.hex) === key);
    if (idx >= 0) {
      this.playerSupply[idx].ammo = ammo;
    }
  }

  /** Sync movement fuel to the player-side supply mirror. */
  private syncPlayerFuel(unitHex: Axial, fuel: number): void {
    const key = axialKey(unitHex);
    const idx = this.playerSupply.findIndex((entry) => axialKey(entry.hex) === key);
    if (idx >= 0) {
      this.playerSupply[idx].fuel = fuel;
    }
  }

  /** Mirror player strength after bot attacks to keep supply snapshots honest. */
  private syncPlayerStrength(targetHex: Axial, strength: number): void {
    const key = axialKey(targetHex);
    const idx = this.playerSupply.findIndex((entry) => axialKey(entry.hex) === key);
    if (idx >= 0) {
      this.playerSupply[idx].strength = strength;
    }
  }

  /** Mirror entrenchment changes so the next supply tick does not overwrite freshly dug positions. */
  private syncPlayerEntrench(unitHex: Axial, entrench: number): void {
    const key = axialKey(unitHex);
    const idx = this.playerSupply.findIndex((entry) => axialKey(entry.hex) === key);
    if (idx >= 0) {
      this.playerSupply[idx].entrench = entrench;
    }
  }

  /** Sync bot ammo usage back into the supply mirror. */
  private syncBotAmmo(attackerHex: Axial, ammo: number): void {
    const key = axialKey(attackerHex);
    const idx = this.botSupply.findIndex((entry) => axialKey(entry.hex) === key);
    if (idx >= 0) {
      this.botSupply[idx].ammo = ammo;
    }
  }

  /** Sync movement fuel to the bot-side supply mirror. */
  private syncBotFuel(unitHex: Axial, fuel: number): void {
    const key = axialKey(unitHex);
    const idx = this.botSupply.findIndex((entry) => axialKey(entry.hex) === key);
    if (idx >= 0) {
      this.botSupply[idx].fuel = fuel;
    }
  }

  private updateSupplyPositionForFaction(faction: TurnFaction, from: Axial, to: Axial): void {
    if (faction === "Player") {
      this.updatePlayerSupplyPosition(from, to);
      return;
    }
    if (faction === "Bot") {
      this.updateBotSupplyPosition(from, to);
      return;
    }
    const fromKey = axialKey(from);
    const idx = this.allySupply.findIndex((entry) => axialKey(entry.hex) === fromKey);
    if (idx >= 0) {
      this.allySupply[idx].hex = structuredClone(to);
    }
  }

  private syncFuelForFaction(faction: TurnFaction, hex: Axial, fuel: number): void {
    if (faction === "Player") {
      this.syncPlayerFuel(hex, fuel);
      return;
    }
    if (faction === "Bot") {
      this.syncBotFuel(hex, fuel);
      return;
    }
    const key = axialKey(hex);
    const idx = this.allySupply.findIndex((entry) => axialKey(entry.hex) === key);
    if (idx >= 0) {
      this.allySupply[idx].fuel = fuel;
    }
  }

  /** Build occupancy map for planner: key -> owner */
  private buildOccupancyMap(): ReadonlyMap<string, "bot" | "player"> {
    const map = new Map<string, "bot" | "player">();
    this.playerPlacements.forEach((_u, key) => map.set(key, "player"));
    this.botPlacements.forEach((_u, key) => map.set(key, "bot"));
    // Treat ally units as friendly to player for movement blocking purposes.
    this.allyPlacements.forEach((_u, key) => map.set(key, "player"));
    return map;
  }

  /** Build a unified occupancy set covering all factions for plan application. */
  private buildUnifiedOccupancySet(): Set<string> {
    const keys: string[] = [];
    this.playerPlacements.forEach((_u, key) => keys.push(key));
    this.botPlacements.forEach((_u, key) => keys.push(key));
    this.allyPlacements.forEach((_u, key) => keys.push(key));
    return new Set(keys);
  }

  private plannerMovementAllowance(snapshot: PlannerUnitSnapshot): number {
    const def = snapshot.definition;
    const baseMovement = def.movement ?? 1;
    // Give bots sufficient movement allowance for multi-hex planning
    // This allows pathfinding to explore far enough to find river crossings and strategic positions
    // Infantry (movement=1) get 5 hexes, faster units get proportionally more
    return Math.max(5, baseMovement * 5);
  }

  private plannerLOSAllows(attackerHex: Axial, targetHex: Axial, isAir: boolean): boolean {
    return losClear(attackerHex, targetHex, isAir, this.createLosLister());
  }

  private plannerAttackEstimate(
    attacker: PlannerUnitSnapshot,
    attackerHex: Axial,
    defender: PlannerUnitSnapshot,
    defenderHex: Axial
  ): AttackEstimate | null {
    const atkUnit = structuredClone(attacker.unit);
    atkUnit.hex = structuredClone(attackerHex);
    const defUnit = structuredClone(defender.unit);
    defUnit.hex = structuredClone(defenderHex);

    const attackDistance = hexDistance(attackerHex, defenderHex);
    const preferredStance = attackDistance <= 1
      && this.resolveCombatStanceForAttacker(atkUnit, attacker.definition, "assault") === "assault"
        ? "assault"
        : undefined;
    const req = this.buildAttackRequest(
      atkUnit,
      defUnit,
      "Bot",
      "Player",
      preferredStance ? { stance: preferredStance } : undefined
    );
    if (!req) {
      return null;
    }
    let result = resolveAttack(req);

    const atkDef = attacker.definition;
    const defDef = defender.definition;
    const atkIsBomber = this.isBomber(atkDef);
    const atkIsAir = atkDef.moveType === "air";
    const defIsAir = defDef.moveType === "air";

    if (atkIsBomber && !defIsAir) {
      result = { ...result, damagePerHit: result.damagePerHit * 10, expectedDamage: result.expectedDamage * 10, expectedSuppression: result.expectedSuppression * 10 };
    } else if (atkIsAir && !atkIsBomber && defIsAir) {
      result = { ...result, damagePerHit: result.damagePerHit * 4, expectedDamage: result.expectedDamage * 4, expectedSuppression: result.expectedSuppression * 4 };
    }

    const expectedDamage = Math.max(0, Math.round(result.expectedDamage));

    let expectedRetaliation = 0;
    if (!(atkIsAir && !defIsAir)) {
      const distance = hexDistance(defenderHex, attackerHex);
      const rMin = defDef.rangeMin ?? 1;
      const rMax = defDef.rangeMax ?? 1;
      if (distance >= rMin && distance <= rMax) {
        const revReq = this.buildAttackRequest(defUnit, atkUnit, "Player", "Bot", {
          allowBomberAirAttack: true,
          stance: preferredStance === "assault" ? "assault" : undefined
        });
        if (revReq) {
          let rev = resolveAttack(revReq);
          const defIsBomber = this.isBomber(defDef);
          const defIsAirUnit = defDef.moveType === "air";
          const atkIsAirUnit = atkDef.moveType === "air";
          if (defIsBomber && atkIsAirUnit) {
            rev = { ...rev, damagePerHit: rev.damagePerHit * 2, expectedDamage: rev.expectedDamage * 2, expectedSuppression: rev.expectedSuppression * 2 };
          } else if (defIsAirUnit && !defIsBomber && atkIsAirUnit) {
            rev = { ...rev, damagePerHit: rev.damagePerHit * 4, expectedDamage: rev.expectedDamage * 4, expectedSuppression: rev.expectedSuppression * 4 };
          }
          expectedRetaliation = Math.max(0, Math.round(rev.expectedDamage));
        }
      }
    }

    return { expectedDamage, expectedRetaliation };
  }

  private buildPlannerCounterIntelDecoys(faction: TurnFaction): PlannerUnitSnapshot[] {
    const operations = this.getActiveCounterIntelOperations(faction);
    if (operations.length === 0) {
      return [];
    }

    const sourcePlacements = faction === "Player"
      ? Array.from(this.playerPlacements.values())
      : Array.from(this.botPlacements.values());
    const decoyTemplates = sourcePlacements.filter((unit) => {
      const definition = this.getUnitDefinition(unit.type);
      return definition.moveType !== "air" && !this.isSupplyTruckType(unit.type);
    });
    if (decoyTemplates.length === 0) {
      return [];
    }

    return operations.map((operation, index) => {
      const template = structuredClone(decoyTemplates[index % decoyTemplates.length]);
      const definition = this.getUnitDefinition(template.type);
      template.hex = structuredClone(operation.targetHex);
      template.strength = Math.max(4, Math.min(template.strength, 6 + operation.strength));
      template.entrench = 0;
      return { unit: template, definition };
    });
  }

  private buildBotPerceivedTargets(): BotPerceivedTarget[] {
    const targets: BotPerceivedTarget[] = Array.from(this.playerPlacements.values()).map((unit) => ({
      hex: structuredClone(unit.hex),
      bias: 0,
      isDeception: false,
      id: unit.unitId ?? axialKey(unit.hex)
    }));

    this.getActiveCounterIntelOperations("Player").forEach((operation) => {
      targets.push({
        hex: structuredClone(operation.targetHex),
        bias: operation.strength,
        isDeception: true,
        id: operation.id
      });
    });

    return targets;
  }

  private selectBotPerceivedTarget(origin: Axial, targets: readonly BotPerceivedTarget[]): BotPerceivedTarget | null {
    let best: BotPerceivedTarget | null = null;
    let bestAdjustedDistance = Number.POSITIVE_INFINITY;
    let bestRawDistance = Number.POSITIVE_INFINITY;

    targets.forEach((candidate) => {
      const rawDistance = hexDistance(origin, candidate.hex);
      const adjustedDistance = Math.max(0, rawDistance - candidate.bias);
      if (
        adjustedDistance < bestAdjustedDistance ||
        (adjustedDistance === bestAdjustedDistance && rawDistance < bestRawDistance)
      ) {
        bestAdjustedDistance = adjustedDistance;
        bestRawDistance = rawDistance;
        best = {
          ...candidate,
          hex: structuredClone(candidate.hex)
        };
      }
    });

    return best;
  }

  private buildPlannerInputFor(
    acting: UnitPlacementMap,
    opposing: UnitPlacementMap,
    difficulty: BotDifficulty,
    opposingExtras: UnitPlacementMap[] = [],
    syntheticOpposingUnits: readonly PlannerUnitSnapshot[] = []
  ): BotPlannerInput {
    const actingUnits: PlannerUnitSnapshot[] = [];
    const opposingUnits: PlannerUnitSnapshot[] = [];
    acting.forEach((unit) => {
      const def = this.getUnitDefinition(unit.type);
      if (def.moveType === "air" || this.isSupplyTruckType(unit.type)) {
        return;
      }
      actingUnits.push({ unit: structuredClone(unit), definition: def });
    });
    const opposingMaps = [opposing, ...opposingExtras];
    opposingMaps.forEach((map) => {
      map.forEach((unit) => {
        const def = this.getUnitDefinition(unit.type);
        opposingUnits.push({ unit: structuredClone(unit), definition: def });
      });
    });
    syntheticOpposingUnits.forEach((entry) => {
      opposingUnits.push({
        unit: structuredClone(entry.unit),
        definition: entry.definition
      });
    });

    const occupancy = this.buildOccupancyMap();

    return {
      botUnits: actingUnits,
      playerUnits: opposingUnits,
      objectives: this.scenario.objectives ?? [],
      occupancy,
      map: {
        inBounds: (hex) => this.inBounds(hex),
        terrainAt: (hex) => this.terrainAt(hex),
        movementCost: (hex, moveType) => this.resolveMoveCost(moveType, this.terrainAt(hex), hex)
      },
      losAllows: (a, b, isAir) => this.plannerLOSAllows(a, b, isAir),
      movementAllowance: (snap) => this.plannerMovementAllowance(snap),
      attackEstimator: (a, ah, d, dh) => this.plannerAttackEstimate(a, ah, d, dh),
      difficulty
    } satisfies BotPlannerInput;
  }

  private executeHeuristicBotTurn(): BotTurnSummary {
    // Expanded air heuristic: attempt escort pairing for queued strikes, then strategic CAP over high-value areas.
    this.maybeScheduleHeuristicAirOps();
    const moves: BotMoveSummary[] = [];
    const attacks: BotAttackSummary[] = [];

    console.log(`[Bot AI] Heuristic bot turn starting. Bot units: ${this.botPlacements.size}, Player units: ${this.playerPlacements.size}`);

    if (this.playerPlacements.size === 0) {
      const supplyReport = this.applySupplyTickFor("Bot");
      return { moves, attacks, supplyReport };
    }

    const input = this.buildPlannerInputFor(
      this.botPlacements,
      this.playerPlacements,
      this.botDifficulty,
      this.allyPlacements.size > 0 ? [this.allyPlacements] : [],
      this.buildPlannerCounterIntelDecoys("Player")
    );
    const plans = planHeuristicBotTurn(input);
    console.log(`[Bot AI] Planner generated ${plans.length} plans`);

    const occupancy = this.buildUnifiedOccupancySet();

    for (const plan of plans) {
      const fromKey = axialKey(plan.origin);
      const toKey = axialKey(plan.destination);
      console.log(`[Bot AI] Plan for ${plan.unit.unit.type} at ${fromKey}: ${plan.rationale} (score: ${plan.score.toFixed(1)}, destination: ${toKey}, path length: ${plan.path.length})`);
      const unit = this.botPlacements.get(fromKey);
      if (!unit) {
        console.log(`[Bot AI] Unit not found at ${fromKey}, skipping plan`);
        continue;
      }
      if (toKey !== fromKey && occupancy.has(toKey)) {
        console.log(`[Bot AI] Destination ${toKey} is occupied, skipping plan`);
        continue;
      }

      let current = structuredClone(plan.origin);
      const visited: Axial[] = [structuredClone(plan.origin)];
      if (toKey !== fromKey) {
        console.log(`[Bot AI] Executing move for ${unit.type} from ${fromKey} to ${toKey}`);
        this.botPlacements.delete(fromKey);
        const moved = structuredClone(unit);

        // Get unit's actual movement points for this turn
        const unitDef = this.getUnitDefinition(unit.type);
        const maxMovement = unitDef.movement ?? 1;
        const availableFuel = this.resolveFuelBudget(unit, unitDef);
        let movementSpent = 0;
        let fuelSpent = 0;
        let hexesMoved = 0;

        for (let i = 1; i < plan.path.length; i += 1) {
          const step = plan.path[i];
          const stepKey = axialKey(step);
          if (occupancy.has(stepKey)) {
            console.log(`[Bot AI] Path blocked at ${stepKey}, stopping movement`);
            break;
          }

          // Calculate movement cost for this step
          const terrain = this.terrainAt(step);
          const stepCost = this.resolveMoveCost(unitDef.moveType, terrain, step);
          const stepFuel = this.resolveMovementFuelStep(unitDef.moveType, step);

          // Units can always move at least 1 hex per turn, even through difficult terrain
          // After the first hex, check if we have movement points remaining
          if (hexesMoved > 0 && movementSpent + stepCost > maxMovement) {
            console.log(`[Bot AI] Movement exhausted after ${hexesMoved} hex(es): spent ${movementSpent}, next step cost ${stepCost}, max ${maxMovement}`);
            break;
          }
          if (Number.isFinite(availableFuel) && fuelSpent + stepFuel > availableFuel + 1e-6) {
            console.log(`[Bot AI] Fuel exhausted after ${hexesMoved} hex(es): spent ${fuelSpent.toFixed(2)}, next step costs ${stepFuel.toFixed(2)}, available ${availableFuel.toFixed(2)}`);
            break;
          }

          moved.facing = this.resolveFacingToward(current, step, moved.facing);
          moved.hex = structuredClone(step);
          current = structuredClone(step);
          visited.push(structuredClone(step));
          movementSpent += stepCost;
          fuelSpent += stepFuel;
          hexesMoved += 1;
        }
        if (Number.isFinite(availableFuel) && fuelSpent > 0) {
          moved.fuel = Math.max(0, Number((moved.fuel - fuelSpent).toFixed(2)));
        }
        const finalKey = axialKey(current);
        console.log(`[Bot AI] ${unit.type} moved from ${fromKey} to ${finalKey} (${visited.length - 1} steps)`);
        this.botPlacements.set(finalKey, moved);
        this.syncBotFuel(current, moved.fuel);
        occupancy.delete(fromKey);
        occupancy.add(finalKey);
        this.updateBotSupplyPosition(plan.origin, current);
        const distance = visited.length - 1;
        moves.push({ unitType: moved.type, from: structuredClone(plan.origin), to: structuredClone(current), path: visited, distance, duration: Math.max(1, distance) });
      } else {
        console.log(`[Bot AI] ${unit.type} holding position at ${fromKey}`);
      }

      if (plan.attackTarget) {
        const botUnit = this.botPlacements.get(axialKey(current))!;
        const stance = this.chooseBotStance(botUnit, plan.attackTarget);
        const attack = this.resolveBotAttack(botUnit, current, plan.attackTarget, stance);
        if (attack) {
          attacks.push(attack);
          if (attack.defenderDestroyed) {
            const deadKey = axialKey(plan.attackTarget);
            occupancy.delete(deadKey);
          }
        }
      }
    }

    const supplyReport = this.applySupplyTickFor("Bot");
    console.log(`[Bot AI] Heuristic bot turn complete. Moves: ${moves.length}, Attacks: ${attacks.length}`);
    return { moves, attacks, supplyReport };
  }

  private executeHeuristicAllyTurn(): void {
    if (this.botPlacements.size === 0 || this.allyPlacements.size === 0) {
      return;
    }

    const input = this.buildPlannerInputFor(this.allyPlacements, this.botPlacements, this.botDifficulty);
    const plans = planHeuristicBotTurn(input);
    const occupancy = this.buildUnifiedOccupancySet();

    for (const plan of plans) {
      const fromKey = axialKey(plan.origin);
      const toKey = axialKey(plan.destination);
      const unit = this.allyPlacements.get(fromKey);
      if (!unit) {
        continue;
      }
      if (toKey !== fromKey && occupancy.has(toKey)) {
        continue;
      }

      let current = structuredClone(plan.origin);
      const visited: Axial[] = [structuredClone(plan.origin)];
      if (toKey !== fromKey) {
        this.allyPlacements.delete(fromKey);
        const moved = structuredClone(unit);
        for (let i = 1; i < plan.path.length; i += 1) {
          const step = plan.path[i];
          const stepKey = axialKey(step);
          if (occupancy.has(stepKey)) {
            break;
          }
          moved.facing = this.resolveFacingToward(current, step, moved.facing);
          moved.hex = structuredClone(step);
          current = structuredClone(step);
          visited.push(structuredClone(step));
        }
        this.allyPlacements.set(axialKey(current), moved);
        occupancy.delete(fromKey);
        occupancy.add(axialKey(current));
      }

      if (plan.attackTarget) {
        const attacker = this.allyPlacements.get(axialKey(current));
        const defender = this.botPlacements.get(axialKey(plan.attackTarget));
        if (attacker && defender) {
          attacker.facing = this.resolveFacingToward(current, plan.attackTarget, attacker.facing);
          const request = this.buildAttackRequest(attacker, defender, "Ally", "Bot");
          if (request) {
            const result = resolveAttack(request);
            const updatedDefender = structuredClone(defender);
            updatedDefender.facing = this.resolveFacingToward(plan.attackTarget, current, defender.facing);
            updatedDefender.strength = Math.max(0, defender.strength - Math.round(result.expectedDamage));
            this.allyPlacements.set(axialKey(current), structuredClone(attacker));
            if (updatedDefender.strength <= 0) {
              this.botPlacements.delete(axialKey(plan.attackTarget));
              occupancy.delete(axialKey(plan.attackTarget));
            } else {
              this.botPlacements.set(axialKey(plan.attackTarget), updatedDefender);
            }
          }
        }
      }
    }
  }

  /** Sync defender strength to bot supply mirror after combat. */
  /** Runs the bot's tactical loop once, returning a summary of actions taken. */
  private executeBotTurn(): BotTurnSummary {
    if (this.botStrategyMode === "Heuristic") {
      return this.executeHeuristicBotTurn();
    }
    // Fallback mode also attempts heuristic air ops (escort first, then CAP) if possible.
    this.maybeScheduleHeuristicAirOps();
    const moves: BotMoveSummary[] = [];
    const attacks: BotAttackSummary[] = [];

    const playerUnits = Array.from(this.playerPlacements.values());
    const perceivedTargets = this.buildBotPerceivedTargets();
    if (playerUnits.length === 0 || perceivedTargets.length === 0) {
      // With no player opposition the bot cannot act; still advance the supply tick.
      const supplyReport = this.applySupplyTickFor("Bot");
      return { moves, attacks, supplyReport };
    }

    // Track live player targets so successive bots react to casualties and deception decay.
    const liveTargets = perceivedTargets.map((target) => ({
      ...target,
      hex: structuredClone(target.hex)
    }));

    const botUnits = Array.from(this.botPlacements.entries());
    botUnits.forEach(([_key, unit]) => {
      const def = this.getUnitDefinition(unit.type);
      // Skip aircraft in the generic ground bot loop; they are handled via air mission heuristics.
      if (def.moveType === "air" || this.isSupplyTruckType(unit.type)) {
        return;
      }
      const origin = structuredClone(unit.hex);
      console.log(`[Bot AI] ${unit.type} at (${origin.q},${origin.r}) evaluating movement`);

      const nearestTarget = this.selectBotPerceivedTarget(origin, liveTargets);
      if (!nearestTarget) {
        console.log(`[Bot AI] ${unit.type}: No player targets found`);
        return;
      }
      const nearest = nearestTarget.hex;

      const distance = hexDistance(origin, nearest);
      console.log(`[Bot AI] ${unit.type}: Nearest player at (${nearest.q},${nearest.r}), distance: ${distance}`);

      const attemptAttack = (attackingUnit: ScenarioUnit, attackerHex: Axial, targetHex: Axial): void => {
        const stance = this.chooseBotStance(attackingUnit, targetHex);
        const attack = this.resolveBotAttack(attackingUnit, attackerHex, targetHex, stance);
        if (!attack) {
          return;
        }
        attacks.push(attack);
        if (attack.defenderDestroyed) {
          const destroyedKey = axialKey(targetHex);
          const index = liveTargets.findIndex((target) => !target.isDeception && axialKey(target.hex) === destroyedKey);
          if (index >= 0) {
            liveTargets.splice(index, 1);
          }
        }
      };

      const engagementDistance = nearestTarget.isDeception ? 0 : 1;

      // Real contacts can be attacked adjacent; deception screens instead pull the bot onto the false axis.
      if (hexDistance(origin, nearest) <= engagementDistance) {
        console.log(
          `[Bot AI] ${unit.type}: ${nearestTarget.isDeception ? "Reached deception focus" : "Already adjacent, attempting attack"}`
        );
        if (!nearestTarget.isDeception) {
          attemptAttack(unit, origin, nearest);
        }
        return;
      }

      const movementAllowance = this.calculateBotMovementAllowance(unit);
      console.log(`[Bot AI] ${unit.type}: Movement allowance: ${movementAllowance}`);

      const plannedPath = this.planBotPath(unit.hex, nearest, movementAllowance);
      if (!plannedPath) {
        console.log(`[Bot AI] ${unit.type}: No valid path found to target`);
        return;
      }

      console.log(`[Bot AI] ${unit.type}: Planned path with ${plannedPath.length - 1} steps`);

      // Execute each step in the planned path, animating them sequentially.
      let current = structuredClone(origin);
      const visited: Axial[] = [structuredClone(origin)];
      const moveBudget = plannedPath.length - 1;
      let lastMovedUnit: ScenarioUnit | null = null;
      const unitDefinition = this.getUnitDefinition(unit.type);
      const availableFuel = this.resolveFuelBudget(unit, unitDefinition);
      let fuelSpent = 0;

      for (let index = 1; index < plannedPath.length; index += 1) {
        const step = plannedPath[index];
        if (this.isOccupied(step)) {
          break;
        }
        const stepFuel = this.resolveMovementFuelStep(unitDefinition.moveType, step);
        if (Number.isFinite(availableFuel) && fuelSpent + stepFuel > availableFuel + 1e-6) {
          break;
        }

        this.botPlacements.delete(axialKey(current));
        const moved = structuredClone(unit);
        moved.facing = this.resolveFacingToward(current, step, moved.facing);
        moved.hex = structuredClone(step);
        current = structuredClone(step);
        fuelSpent += stepFuel;
        this.botPlacements.set(axialKey(step), moved);
        this.updateBotSupplyPosition(visited[visited.length - 1], step);
        visited.push(structuredClone(step));
        lastMovedUnit = moved;

        // If the unit becomes adjacent to its target after this step, resolve the attack and stop moving.
        if (hexDistance(step, nearest) <= engagementDistance) {
          if (!nearestTarget.isDeception) {
            attemptAttack(moved, step, nearest);
          }
          break;
        }
        // Limit to one full path per unit per turn to avoid infinite loops in degenerate cases.
        if (index >= moveBudget) {
          break;
        }
      }

      if (visited.length > 1 && lastMovedUnit) {
        if (Number.isFinite(availableFuel) && fuelSpent > 0) {
          lastMovedUnit.fuel = Math.max(0, Number((lastMovedUnit.fuel - fuelSpent).toFixed(2)));
          this.botPlacements.set(axialKey(lastMovedUnit.hex), structuredClone(lastMovedUnit));
        }
        this.syncBotFuel(lastMovedUnit.hex, lastMovedUnit.fuel);
        const distance = visited.length - 1;
        moves.push({
          unitType: lastMovedUnit.type,
          from: structuredClone(origin),
          to: structuredClone(lastMovedUnit.hex),
          path: visited,
          distance,
          duration: Math.max(distance, 1)
        });
      }
    });

    const supplyReport = this.applySupplyTickFor("Bot");
    return { moves, attacks, supplyReport };
  }

  /**
   * Determines how many tiles the bot unit may traverse this turn using the same movement allowances as player units.
   */
  private calculateBotMovementAllowance(unit: ScenarioUnit): number {
    const definition = this.getUnitDefinition(unit.type);
    const movePoints = definition.movement ?? 1;
    const availableFuel = this.resolveFuelBudget(unit, definition);
    if (Number.isFinite(availableFuel) && availableFuel <= 0) {
      return 0;
    }
    return Math.max(1, movePoints);
  }

  /**
   * Plans a simple straight-line path for bot movement toward the target using axial neighbors.
   * Stops when the movement allowance is exhausted or the path reaches the target.
   */
  private planBotPath(origin: Axial, target: Axial, allowance: number): Axial[] | null {
    if (allowance <= 0) {
      return null;
    }

    const path: Axial[] = [structuredClone(origin)];
    let current = structuredClone(origin);

    for (let stepCount = 0; stepCount < allowance; stepCount += 1) {
      if (hexDistance(current, target) <= 1) {
        break;
      }

      const next = this.selectBotStepToward(current, target);
      if (!next) {
        break;
      }

      path.push(structuredClone(next));
      current = next;

      if (hexDistance(current, target) <= 1) {
        break;
      }
    }

    if (path.length <= 1) {
      return null;
    }

    return path;
  }

  /** Locate the nearest player hex to the provided origin using axial distance. */
  private findNearestPlayerHex(origin: Axial, targets: readonly Axial[]): Axial | null {
    let best: Axial | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    targets.forEach((candidate) => {
      const distance = hexDistance(origin, candidate);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    });
    return best ? structuredClone(best) : null;
  }

  /** Choose the single-step axial move that most reduces distance to the target. */
  private selectBotStepToward(origin: Axial, target: Axial): Axial | null {
    const originUnit = this.lookupUnit(origin, "Bot");
    if (!originUnit) {
      return null;
    }
    const unitDef = this.getUnitDefinition(originUnit.type);
    const moveType = unitDef.moveType;

    let best: Axial | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    let impassableCount = 0;

    neighbors(origin).forEach((candidate) => {
      if (!this.inBounds(candidate)) {
        return;
      }

      // Check if the hex is occupied
      if (this.isOccupied(candidate)) {
        return;
      }

      // Check if the terrain is passable for this unit type
      const terrain = this.terrainAt(candidate);
      const moveCost = this.resolveMoveCost(moveType, terrain, candidate);
      if (moveCost >= 999) {
        impassableCount++;
        return; // Impassable terrain
      }

      const distance = hexDistance(candidate, target);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = structuredClone(candidate);
      }
    });

    if (impassableCount > 0) {
      console.log(`[Bot AI] selectBotStepToward: Skipped ${impassableCount} impassable neighbors`);
    }

    return best;
  }

  /**
   * Minimal bot air scheduling heuristic: attempts to launch a single CAP mission over a friendly hex
   * using the first available fighter with a CAP-capable air support profile. This is intentionally
   * conservative and runs once per bot turn before ground actions to seed interceptions for the player turn.
   */
  private maybeScheduleBasicBotAirCover(): void {
    if (this._phase !== "botTurn") {
      return;
    }
    for (const [unitKey, unit] of this.botPlacements.entries()) {
      const def = this.getUnitDefinition(unit.type);
      if (!this.isAircraft(def)) continue;
      const profile = def.airSupport;
      if (!profile || !profile.roles?.includes("cap")) continue;
      const squadronId = this.getSquadronId(unit);
      if (this.airMissionAssignmentsByUnit.has(squadronId)) continue;
      if (this.aircraftNeedsRearm("Bot", squadronId)) continue;
      const origin = this.parseAxialKey(unitKey);
      if (!origin) continue;
      void this.tryScheduleAirMission({ kind: "airCover", faction: "Bot", unitHex: origin, targetHex: origin });
      return;
    }
  }

  /**
   * Heuristic air operations: pair escorts with queued strike packages when available, then attempt a CAP over
   * a strategically valuable area (near player-held objectives). Falls back to a local CAP if none found.
   */
  private maybeScheduleHeuristicAirOps(): void {
    if (this._phase !== "botTurn") {
      return;
    }
    // 1) Attempt to launch a single bomber strike against a nearby player unit.
    this.maybeScheduleBotStrikeAgainstPlayer();
    // 2) Try pairing an escort with the earliest queued bot strike.
    if (this.maybeScheduleBotEscortForQueuedStrike()) {
      return;
    }
    // 3) Seed a CAP over a high-value zone.
    if (this.maybeScheduleStrategicBotAirCover()) {
      return;
    }
    // 4) Fallback to local CAP heuristic.
    this.maybeScheduleBasicBotAirCover();
  }

  /** Attempts to schedule a single bot strike mission against the nearest player ground unit. */
  private maybeScheduleBotStrikeAgainstPlayer(): boolean {
    if (this._phase !== "botTurn") {
      return false;
    }

    const playerUnits = Array.from(this.playerPlacements.values());
    if (playerUnits.length === 0) {
      return false;
    }

    // Pick a single bomber-capable squadron and aim at the nearest non-air player unit.
    for (const [_unitKey, unit] of this.botPlacements.entries()) {
      const def = this.getUnitDefinition(unit.type);
      const profile = def.airSupport;
      const isBomber = this.isAircraft(def) && !!profile && profile.roles?.includes("strike");
      if (!isBomber) {
        continue;
      }
      // Skip squadrons already assigned or needing refit.
      const squadronId = this.getSquadronId(unit);
      if (this.airMissionAssignmentsByUnit.has(squadronId)) {
        continue;
      }
      if (this.aircraftNeedsRearm("Bot", squadronId)) {
        continue;
      }

      // Find nearest player ground unit to target.
      let bestTarget: ScenarioUnit | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const candidate of playerUnits) {
        const candDef = this.getUnitDefinition(candidate.type);
        if (candDef.moveType === "air") {
          continue;
        }
        const d = hexDistance(unit.hex, candidate.hex);
        if (d < bestDistance) {
          bestDistance = d;
          bestTarget = candidate;
        }
      }
      if (!bestTarget) {
        continue;
      }

      const origin = structuredClone(unit.hex);
      const targetHex = structuredClone(bestTarget.hex);
      const result = this.tryScheduleAirMission({ kind: "strike", faction: "Bot", unitHex: origin, targetHex });
      if (result.ok) {
        return true;
      }
    }

    return false;
  }

  /** Attempts to schedule a single escort mission for the first queued bot strike package within range. */
  private maybeScheduleBotEscortForQueuedStrike(): boolean {
    // Find earliest queued strike mission
    const queuedBotStrike = Array.from(this.scheduledAirMissions.values()).find(
      (m) => m.faction === "Bot" && m.template.kind === "strike" && m.status === "queued"
    );
    if (!queuedBotStrike) {
      return false;
    }
    const bomberHex = this.parseAxialKey(queuedBotStrike.unitKey);
    if (!bomberHex) {
      return false;
    }
    // Select the first available escort-capable fighter within range
    for (const [unitKey, unit] of this.botPlacements.entries()) {
      const def = this.getUnitDefinition(unit.type);
      const profile = def.airSupport;
      if (!this.isAircraft(def) || !profile || !profile.roles?.includes("escort")) continue;
      const squadronId = this.getSquadronId(unit);
      if (this.airMissionAssignmentsByUnit.has(squadronId)) continue;
      if (this.aircraftNeedsRearm("Bot", squadronId)) continue;
      const origin = this.parseAxialKey(unitKey);
      if (!origin) continue;
      const result = this.tryScheduleAirMission({ kind: "escort", faction: "Bot", unitHex: origin, escortTargetHex: bomberHex });
      if (result.ok) {
        return true;
      }
    }
    return false;
  }

  /** Attempts to schedule CAP near the most relevant player-held objective by covering the nearest friendly unit. */
  private maybeScheduleStrategicBotAirCover(): boolean {
    // Identify a player-held objective; pick the one nearest to any bot unit.
    const objectives = (this.scenario.objectives ?? []).filter((o) => o.owner === "Player");
    if (objectives.length === 0) {
      return false;
    }
    let bestObjective: Axial | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const obj of objectives) {
      for (const unit of this.botPlacements.values()) {
        const d = hexDistance(unit.hex, obj.hex);
        if (d < bestDistance) {
          bestDistance = d;
          bestObjective = obj.hex;
        }
      }
    }
    if (!bestObjective) {
      return false;
    }
    // Choose a friendly unit nearest to that objective as the CAP center.
    let capCenter: Axial | null = null;
    let capCenterDistance = Number.POSITIVE_INFINITY;
    for (const u of this.botPlacements.values()) {
      const d = hexDistance(u.hex, bestObjective);
      if (d < capCenterDistance) {
        capCenterDistance = d;
        capCenter = u.hex;
      }
    }
    if (!capCenter) {
      return false;
    }
    // Find an available CAP-capable fighter to launch the mission.
    for (const [unitKey, unit] of this.botPlacements.entries()) {
      const def = this.getUnitDefinition(unit.type);
      const profile = def.airSupport;
      if (!this.isAircraft(def) || !profile || !profile.roles?.includes("cap")) continue;
      const squadronId = this.getSquadronId(unit);
      if (this.airMissionAssignmentsByUnit.has(squadronId)) continue;
      if (this.aircraftNeedsRearm("Bot", squadronId)) continue;
      const origin = this.parseAxialKey(unitKey);
      if (!origin) continue;
      const result = this.tryScheduleAirMission({ kind: "airCover", faction: "Bot", unitHex: origin, targetHex: capCenter });
      if (result.ok) {
        return true;
      }
    }
    return false;
  }

  /** Parses an axial key (q,r) into an Axial object. */
  private parseAxialKey(key: string): Axial | null {
    const parts = key.split(",");
    if (parts.length !== 2) return null;
    const q = Number(parts[0]);
    const r = Number(parts[1]);
    if (!Number.isFinite(q) || !Number.isFinite(r)) return null;
    return { q, r };
  }

  /**
   * Chooses the nearest hex-facing label for movement and combat presentation.
   */
  private resolveFacingToward(
    from: Axial,
    to: Axial,
    fallback: ScenarioUnit["facing"] = "N"
  ): ScenarioUnit["facing"] {
    const dq = to.q - from.q;
    const dr = to.r - from.r;
    if (dq === 0 && dr === 0) {
      return fallback;
    }

    const pixelVector = (q: number, r: number): { x: number; y: number } => ({
      x: Math.sqrt(3) * (q + r / 2),
      y: 1.5 * r
    });

    const moveVector = pixelVector(dq, dr);
    const facingVectors: Record<ScenarioUnit["facing"], { x: number; y: number }> = {
      N: pixelVector(0, -1),
      NE: pixelVector(1, -1),
      SE: pixelVector(1, 0),
      S: pixelVector(0, 1),
      SW: pixelVector(-1, 1),
      NW: pixelVector(-1, 0)
    };

    let bestFacing = fallback;
    let bestScore = -Infinity;
    (Object.entries(facingVectors) as Array<[ScenarioUnit["facing"], { x: number; y: number }]>).forEach(([facing, vector]) => {
      const score = moveVector.x * vector.x + moveVector.y * vector.y;
      if (score > bestScore) {
        bestScore = score;
        bestFacing = facing;
      }
    });

    return bestFacing;
  }

  /** Resolves a bot attack against the nearest player unit when adjacency allows it. */
  /**
   * Chooses the appropriate combat stance for a bot unit based on tactical situation.
   * - Assault: When attacking objectives (aggressive push)
   * - Suppress: When on objective (hold position)
   * - Default: Suppressive fire (safe standard behavior)
   */
  private chooseBotStance(botUnit: ScenarioUnit, targetHex: Axial): CombatStance {
    // Only infantry-type units can use tactical stances
    const botDef = this.getUnitDefinition(botUnit.type);
    const canUseStances = this.canUseCombatStances(botUnit, botDef);
    if (!canUseStances) {
      return "suppressive";
    }

    // Check if bot is on an objective
    const botKey = axialKey(botUnit.hex);
    const isOnObjective = this.scenario.objectives?.some(obj => axialKey(obj.hex) === botKey);

    if (isOnObjective) {
      // When on objective, use suppressive fire to hold position
      return "suppressive";
    }

    // Check if target is an objective
    const targetKey = axialKey(targetHex);
    const targetIsObjective = this.scenario.objectives?.some(obj => axialKey(obj.hex) === targetKey);

    if (targetIsObjective) {
      // Assault to take objectives aggressively
      return "assault";
    }

    if (
      hexDistance(botUnit.hex, targetHex) <= 1
      && this.resolveCombatStanceForAttacker(botUnit, botDef, "assault") === "assault"
    ) {
      return "assault";
    }

    // Default to suppressive fire
    return "suppressive";
  }

  private resolveBotAttack(attackingUnit: ScenarioUnit, attackerHex: Axial, targetHex: Axial, stance: CombatStance = "suppressive"): BotAttackSummary | null {
    const defenderFaction: TurnFaction = this.playerPlacements.has(axialKey(targetHex)) ? "Player" : "Ally";
    const defender = this.lookupUnit(targetHex, defenderFaction);
    if (!defender) {
      return null;
    }

    const attackerDef = this.getUnitDefinition(attackingUnit.type);
    const defenderDef = this.getUnitDefinition(defender.type);
    const effectiveStance = this.resolveCombatStanceForAttacker(attackingUnit, attackerDef, stance);
    const attackerIsAircraft = attackerDef.moveType === "air";
    const attackerIsBomber = this.isBomber(attackerDef);
    const defenderIsAircraft = defenderDef.moveType === "air";
    const groundAttackAmmoCost = attackerIsAircraft ? 0 : this.resolveGroundAttackAmmoCost(attackerDef);
    const isAssault = effectiveStance === "assault";

    const attackerIsFlak = attackingUnit.type.toLowerCase().includes("flak");
    if (defenderIsAircraft && !attackerIsAircraft && !attackerIsFlak) {
      return null;
    }
    if (!attackerIsAircraft && attackingUnit.ammo < groundAttackAmmoCost) {
      return null;
    }

    if (attackerIsAircraft) {
      const botFlags = this.botActionFlags.get(axialKey(attackerHex)) ?? {
        movementPointsUsed: 0,
        attacksUsed: 0,
        retaliationsUsed: 0,
        isRushing: false
      };
      const allowance = Math.max(1, attackerDef.movement ?? 1);
      const maneuverCost = defenderIsAircraft ? 2 : 1;
      const remaining = allowance - botFlags.movementPointsUsed;
      if (remaining < maneuverCost) {
        return null;
      }
      this.botActionFlags.set(axialKey(attackerHex), {
        ...botFlags,
        movementPointsUsed: botFlags.movementPointsUsed + maneuverCost,
        attacksUsed: botFlags.attacksUsed + 1
      });

      const botKey = axialKey(attackerHex);
      const ammoState = this.getAircraftAmmoState("Bot", botKey, attackerDef);
      if (this.aircraftNeedsRearm("Bot", botKey)) {
        return null;
      }
      if (defenderIsAircraft) {
        if (ammoState.air <= 0) {
          return null;
        }
      } else if (ammoState.ground <= 0) {
        return null;
      }
    }

    if (!losClear(attackerHex, targetHex, attackerDef.moveType === "air", this.createLosLister())) {
      return null;
    }

    const distance = hexDistance(attackerHex, targetHex);
    const minRange = attackerDef.rangeMin ?? 1;
    const maxRange = attackerDef.rangeMax ?? 1;
    if (distance < minRange || distance > maxRange) {
      return null;
    }

    if (attackerIsAircraft && !defenderIsAircraft) {
      const defHexKey = axialKey(targetHex);
      const capMissions = this.findAllActiveAirCoverForHex("Player", defHexKey).filter((m) => m.interceptions < 1);
      const botAttackerSquadronId = this.getSquadronId(attackingUnit);
      const escortMissions = this.findAllActiveEscortsForUnit("Bot", botAttackerSquadronId).filter((m) => m.interceptions < 1);
      const atkKey = axialKey(attackerHex);
      if (capMissions.length > 0) {
        const interceptorsForEvent: Array<{ faction: TurnFaction; unitKey: string; unitType: string }> = [];
        const escortsForEvent: Array<{ faction: TurnFaction; unitKey: string; unitType: string }> = [];
        for (const cap of capMissions) {
          const capLookup = this.lookupUnitBySquadronId(cap.unitKey, "Player");
          if (capLookup) {
            interceptorsForEvent.push({ faction: "Player", unitKey: cap.unitKey, unitType: capLookup.unit.type as string });
          }
        }
        for (const em of escortMissions) {
          const escortLookup = this.lookupUnitBySquadronId(em.unitKey, "Bot");
          if (escortLookup) {
            escortsForEvent.push({ faction: "Bot", unitKey: em.unitKey, unitType: escortLookup.unit.type as string });
          }
        }
        this.pendingAirEngagements.push({
          type: "airToAir",
          location: structuredClone(targetHex),
          bomber: { faction: "Bot", unitKey: atkKey, unitType: attackingUnit.type as string },
          interceptors: interceptorsForEvent,
          escorts: escortsForEvent
        });

        for (const cap of capMissions) {
          const capLookup = this.lookupUnitBySquadronId(cap.unitKey, "Player");
          if (!capLookup) continue;
          const { unit: capUnit, hexKey: capHexKey } = capLookup;
          const escort = escortMissions.find((entry) => entry.interceptions < 1);
          if (!escort) continue;
          const escortLookup = this.lookupUnitBySquadronId(escort.unitKey, "Bot");
          if (!escortLookup) continue;
          const { unit: escortUnit } = escortLookup;
          const escortReq = this.buildMissionAttackRequest("Bot", escortUnit, capUnit);
          if (!escortReq) continue;
          let escortRes = resolveAttack(escortReq);
          const escortDef = this.getUnitDefinition(escortUnit.type);
          const capDef = this.getUnitDefinition(capUnit.type);
          if (this.isAircraft(escortDef) && !this.isBomber(escortDef) && this.isAircraft(capDef)) {
            escortRes = {
              ...escortRes,
              damagePerHit: escortRes.damagePerHit * 4,
              expectedDamage: escortRes.expectedDamage * 4,
              expectedSuppression: escortRes.expectedSuppression * 4
            };
          }
          const inflicted = Math.max(0, Math.round(escortRes.expectedDamage));
          const updatedCap = structuredClone(capUnit);
          updatedCap.strength = Math.max(0, updatedCap.strength - inflicted);
          this.spendAircraftAmmo("Bot", escort.unitKey, true);
          escort.interceptions += 1;
          this.playerPlacements.set(capHexKey, updatedCap);
          this.syncPlayerStrength(updatedCap.hex, updatedCap.strength);
          if (updatedCap.strength <= 0) {
            this.playerPlacements.delete(capHexKey);
            this.removeSupplyEntryFor(capUnit.hex);
            cap.interceptions += 1;
          }
        }

        let currentAtk = this.botPlacements.get(atkKey) as ScenarioUnit;
        for (const cap of capMissions) {
          if (cap.interceptions >= 1) continue;
          const liveCapLookup = this.lookupUnitBySquadronId(cap.unitKey, "Player");
          if (!liveCapLookup || currentAtk.strength <= 0) continue;
          const { unit: liveCap } = liveCapLookup;
          const capReq = this.buildMissionAttackRequest("Player", liveCap, currentAtk);
          if (!capReq) continue;
          let capRes = resolveAttack(capReq);
          const capDef = this.getUnitDefinition(liveCap.type);
          if (this.isAircraft(capDef) && !this.isBomber(capDef) && this.isAircraft(attackerDef)) {
            capRes = {
              ...capRes,
              damagePerHit: capRes.damagePerHit * 4,
              expectedDamage: capRes.expectedDamage * 4,
              expectedSuppression: capRes.expectedSuppression * 4
            };
          }
          const suffered = Math.max(0, Math.round(capRes.expectedDamage));
          const updatedAtkBefore = structuredClone(currentAtk);
          updatedAtkBefore.strength = Math.max(0, updatedAtkBefore.strength - suffered);
          this.spendAircraftAmmo("Player", cap.unitKey, true);
          cap.interceptions += 1;
          this.botPlacements.set(atkKey, updatedAtkBefore);
          this.syncBotStrength(attackerHex, updatedAtkBefore.strength);
          currentAtk = updatedAtkBefore;
          if (updatedAtkBefore.strength <= 0) {
            this.botPlacements.delete(atkKey);
            this.removeBotSupplyEntryFor(attackerHex);
            this.invalidateRosterCache();
            return null;
          }
        }
      }
    }

    const defenderMod = this.getHexModification(defender.hex);
    const defenderFortified = defenderMod?.type === "fortifications";
    const req: AttackRequest = {
      attacker: {
        unit: attackerDef,
        strength: attackingUnit.strength,
        experience: attackingUnit.experience,
        general: this.botSide.general
      },
      defender: {
        unit: defenderDef,
        strength: defender.strength,
        experience: defender.experience,
        general: this.playerSide.general
      },
      attackerCtx: {
        hex: attackingUnit.hex,
        stance: effectiveStance
      },
      defenderCtx: {
        terrain: this.terrainAt(defender.hex) ?? this.defaultTerrain(),
        class: defenderDef.class,
        facing: defender.facing,
        hex: defender.hex,
        isRushing: isAssault,
        stance: isAssault ? "assault" : undefined,
        fortified: defenderFortified
      },
      targetFacing: defender.facing,
      isSoftTarget: defenderDef.class === "infantry" || defenderDef.class === "specialist"
    } satisfies AttackRequest;

    let attackResult = resolveAttack(req);
    const diffMods = getDifficultyModifiers(this.botDifficulty);
    const damageModifier = 1 + (diffMods.damageMod / 100);
    attackResult = {
      ...attackResult,
      expectedDamage: attackResult.expectedDamage * damageModifier,
      damagePerHit: attackResult.damagePerHit * damageModifier
    };

    if (attackerIsBomber && !defenderIsAircraft) {
      const boostedDamage = attackResult.expectedDamage * 10;
      attackResult = {
        ...attackResult,
        damagePerHit: attackResult.damagePerHit * 10,
        expectedDamage: boostedDamage,
        expectedSuppression: attackResult.expectedSuppression * 10
      };
    }

    if (attackerIsAircraft && !attackerIsBomber && defenderIsAircraft) {
      const acceleratedAirDamage = attackResult.expectedDamage * 4;
      attackResult = {
        ...attackResult,
        damagePerHit: attackResult.damagePerHit * 4,
        expectedDamage: acceleratedAirDamage,
        expectedSuppression: attackResult.expectedSuppression * 4
      };
    }

    const damage = Math.max(
      0,
      attackerIsBomber && !defenderIsAircraft
        ? Math.ceil(attackResult.expectedDamage)
        : Math.round(attackResult.expectedDamage)
    );

    const playerKey = axialKey(targetHex);
    const updatedPlayer = structuredClone(defender);
    updatedPlayer.facing = this.resolveFacingToward(targetHex, attackerHex, defender.facing);
    updatedPlayer.strength = Math.max(0, updatedPlayer.strength - damage);
    if (updatedPlayer.strength <= 0) {
      if (defenderFaction === "Player") {
        this.playerPlacements.delete(playerKey);
        this.removeSupplyEntryFor(targetHex);
      } else {
        this.allyPlacements.delete(playerKey);
      }
    } else {
      if (defenderFaction === "Player") {
        this.playerPlacements.set(playerKey, updatedPlayer);
        this.syncPlayerStrength(targetHex, updatedPlayer.strength);
        if (effectiveStance === "suppressive") {
          const attackerUnitId = attackingUnit.unitId ?? axialKey(attackerHex);
          if (!updatedPlayer.suppressedBy) {
            updatedPlayer.suppressedBy = [];
          }
          if (!updatedPlayer.suppressedBy.includes(attackerUnitId)) {
            updatedPlayer.suppressedBy.push(attackerUnitId);
            this.playerPlacements.set(playerKey, updatedPlayer);
          }
        }
      } else {
        this.allyPlacements.set(playerKey, updatedPlayer);
        if (effectiveStance === "suppressive") {
          const attackerUnitId = attackingUnit.unitId ?? axialKey(attackerHex);
          if (!updatedPlayer.suppressedBy) {
            updatedPlayer.suppressedBy = [];
          }
          if (!updatedPlayer.suppressedBy.includes(attackerUnitId)) {
            updatedPlayer.suppressedBy.push(attackerUnitId);
            this.allyPlacements.set(playerKey, updatedPlayer);
          }
        }
      }
    }

    const botKey = axialKey(attackerHex);
    const updatedBot = structuredClone(attackingUnit);
    updatedBot.facing = this.resolveFacingToward(attackerHex, targetHex, attackingUnit.facing);
    if (attackerIsAircraft) {
      this.spendAircraftAmmo("Bot", botKey, defenderIsAircraft);
      updatedBot.ammo = Math.max(0, updatedBot.ammo - 1);
    } else {
      updatedBot.ammo = Math.max(0, updatedBot.ammo - groundAttackAmmoCost);
    }

    let retaliationResult: AttackResult | undefined;
    let attackerStrengthAfter = updatedBot.strength;
    if (defenderFaction === "Player" && updatedPlayer.strength > 0 && !(attackerIsAircraft && !defenderIsAircraft)) {
      let retaliationAllowed = true;
      if (this.resolveUnitSuppressionState(updatedPlayer).state === "pinned") {
        retaliationAllowed = false;
      }

      if (retaliationAllowed) {
        const retaliationDistance = hexDistance(targetHex, attackerHex);
        const defenderRangeMin = defenderDef.rangeMin ?? 1;
        let defenderRangeMax = defenderDef.rangeMax ?? 1;
        if (this.isBomber(defenderDef) && attackerIsAircraft) {
          defenderRangeMax = Math.max(defenderRangeMax, 2);
        }
        if (retaliationDistance < defenderRangeMin || retaliationDistance > defenderRangeMax) {
          retaliationAllowed = false;
        }
      }

      if (retaliationAllowed) {
        const defenderFlags = this.playerActionFlags.get(playerKey) ?? this.createDefaultActionFlags();
        if (defenderFlags.retaliationsUsed >= 1) {
          retaliationAllowed = false;
        }
      }

      const defenderGroundAmmoCost = defenderIsAircraft ? 0 : this.resolveGroundAttackAmmoCost(defenderDef);
      if (retaliationAllowed) {
        if (defenderIsAircraft) {
          const defenderAmmoState = this.getAircraftAmmoState("Player", playerKey, defenderDef);
          if (this.aircraftNeedsRearm("Player", playerKey) || defenderAmmoState.air <= 0) {
            retaliationAllowed = false;
          }
        } else {
          const defenderAmmo = typeof updatedPlayer.ammo === "number" ? updatedPlayer.ammo : null;
          if (defenderAmmo !== null && defenderAmmo < defenderGroundAmmoCost) {
            retaliationAllowed = false;
          }
        }
      }

      const retaliationReq = retaliationAllowed
        ? this.buildAttackRequest(updatedPlayer, updatedBot, "Player", "Bot", {
            allowBomberAirAttack: true,
            stance: effectiveStance === "assault" ? "assault" : undefined
          })
        : null;
      if (retaliationReq) {
        const defenderIsBomber = this.isBomber(defenderDef);
        const baseRetaliation = resolveAttack(retaliationReq);
        let appliedRetaliation: AttackResult;
        let retaliationDamage: number;

        if (defenderIsBomber && attackerIsAircraft) {
          const doubledDamage = baseRetaliation.expectedDamage * 2;
          appliedRetaliation = {
            ...baseRetaliation,
            expectedDamage: doubledDamage,
            damagePerHit: baseRetaliation.damagePerHit * 2,
            expectedSuppression: baseRetaliation.expectedSuppression * 2
          };
          retaliationDamage = Math.max(0, Math.round(doubledDamage));
        } else if (defenderIsAircraft && !defenderIsBomber && attackerIsAircraft) {
          const acceleratedAirDamage = baseRetaliation.expectedDamage * 4;
          appliedRetaliation = {
            ...baseRetaliation,
            expectedDamage: acceleratedAirDamage,
            damagePerHit: baseRetaliation.damagePerHit * 4,
            expectedSuppression: baseRetaliation.expectedSuppression * 4
          };
          retaliationDamage = Math.max(0, Math.round(acceleratedAirDamage));
        } else {
          appliedRetaliation = baseRetaliation;
          retaliationDamage = Math.max(0, Math.round(baseRetaliation.expectedDamage));
        }

        retaliationResult = appliedRetaliation;
        updatedBot.strength = Math.max(0, updatedBot.strength - retaliationDamage);
        attackerStrengthAfter = updatedBot.strength;

        if (defenderIsAircraft) {
          this.spendAircraftAmmo("Player", playerKey, attackerIsAircraft);
          if (typeof updatedPlayer.ammo === "number") {
            updatedPlayer.ammo = Math.max(0, updatedPlayer.ammo - 1);
            this.playerPlacements.set(playerKey, updatedPlayer);
            this.syncPlayerAmmo(targetHex, updatedPlayer.ammo);
          }
        } else if (typeof updatedPlayer.ammo === "number") {
          updatedPlayer.ammo = Math.max(0, updatedPlayer.ammo - defenderGroundAmmoCost);
          this.playerPlacements.set(playerKey, updatedPlayer);
          this.syncPlayerAmmo(targetHex, updatedPlayer.ammo);
        }

        const defenderFlags = this.playerActionFlags.get(playerKey) ?? this.createDefaultActionFlags();
        this.playerActionFlags.set(playerKey, {
          ...defenderFlags,
          retaliationsUsed: defenderFlags.retaliationsUsed + 1
        });
      }
    }

    if (updatedBot.strength <= 0) {
      this.botPlacements.delete(botKey);
      this.botAttackAmmo.delete(botKey);
      this.removeBotSupplyEntryFor(attackerHex);
    } else {
      this.botPlacements.set(botKey, updatedBot);
      this.syncBotAmmo(attackerHex, updatedBot.ammo);
      this.syncBotStrength(attackerHex, updatedBot.strength);
    }

    this.invalidateRosterCache();

    return {
      attackerType: attackingUnit.type,
      defenderType: defender.type,
      from: structuredClone(attackerHex),
      target: structuredClone(targetHex),
      inflictedDamage: damage,
      defenderDestroyed: updatedPlayer.strength <= 0,
      retaliation: retaliationResult
        ? {
            damage: Math.max(0, Math.round(retaliationResult.expectedDamage)),
            terrainDefense: 0,
            accuracyMod: Math.round(retaliationResult.accuracy * 100),
            attackerStrengthAfter
          }
        : undefined
    };
  }

  /** Ensures bot supply mirror tracks unit relocation after movement. */
  private updateBotSupplyPosition(from: Axial, to: Axial): void {
    const fromKey = axialKey(from);
    const idx = this.botSupply.findIndex((entry) => axialKey(entry.hex) === fromKey);
    if (idx >= 0) {
      this.botSupply[idx].hex = structuredClone(to);
    }
  }

  /** Sync defender strength to bot supply mirror after combat. */
  private syncBotStrength(defenderHex: Axial, strength: number): void {
    const key = axialKey(defenderHex);
    const idx = this.botSupply.findIndex((s) => axialKey(s.hex) === key);
    if (idx >= 0) {
      this.botSupply[idx].strength = strength;
    }
  }

  /** Retrieve the fully-typed unit definition or throw if the key is unknown. */
  private getUnitDefinition(key: string): UnitTypeDefinition {
    const definition = this.unitTypes[key as keyof UnitTypeDictionary];
    if (!definition) {
      throw new Error(`Unit definition missing for key: ${key}`);
    }
    const unitClass = normalizeUnitClass((definition as { class?: string }).class, key);
    return {
      ...(definition as UnitTypeDefinition),
      class: unitClass
    };
  }

  /** Lookup helper returning the tile entry (palette reference) for a given hex. */
  private lookupTileEntry(hex: Axial): TileInstance | null {
    // Convert axial to offset coordinates for tile array lookup
    const col = hex.q;
    const row = hex.r + Math.floor(hex.q / 2);

    const tileRow = this.scenario.tiles[row];
    if (!tileRow) {
      return null;
    }
    const entry = tileRow[col];
    return entry ?? null;
  }

  /** Translate palette entry into the canonical terrain definition used by combat and supply logic. */
  private terrainAt(hex: Axial): TerrainDefinition | null {
    const entry = this.lookupTileEntry(hex);
    if (!entry) {
      return null;
    }
    const paletteEntry = this.scenario.tilePalette[entry.tile];
    if (!paletteEntry) {
      return null;
    }
    const terrainDefinition = this.terrain[paletteEntry.terrain as keyof TerrainDictionary];
    return (terrainDefinition ?? null) as TerrainDefinition | null;
  }

  /** Lightweight default terrain referenced when LOS requests fall outside the map bounds. */
  private defaultTerrain(): TerrainDefinition {
    return {
      moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
      defense: 0,
      accMod: 0,
      blocksLOS: false
    };
  }

  /** Remove any cached supply entry associated with the provided hex. */
  private removeSupplyEntryFor(hex: Axial): void {
    const key = axialKey(hex);
    const index = this.playerSupply.findIndex((entry) => axialKey(entry.hex) === key);
    if (index >= 0) {
      this.playerSupply.splice(index, 1);
    }
  }

  /** Remove bot supply entry associated with the provided hex. */
  private removeBotSupplyEntryFor(hex: Axial): void {
    const key = axialKey(hex);
    const index = this.botSupply.findIndex((entry) => axialKey(entry.hex) === key);
    if (index >= 0) {
      this.botSupply.splice(index, 1);
    }
  }

  private computeSupplySnapshot(faction: TurnFaction): SupplySnapshot {
    const history = this.supplyHistoryByFaction[faction];
    const frontlineUnits = faction === "Player"
      ? Array.from(this.playerPlacements.values())
      : Array.from(this.botPlacements.values());
    const reserveUnits = faction === "Player"
      ? this.reserves.map((reserve) => reserve.unit)
      : [] as ScenarioUnit[];
    const categories = this.buildSupplyCategories(faction, frontlineUnits, reserveUnits, history);
    const alerts = this.deriveSupplyAlerts(categories, faction);

    // Calculate total stockpile (depot reserves) from categories
    const depotTotals = getInventoryTotals(this.supplyStateByFaction[faction], ["ammo", "fuel", "rations", "parts"]);

    return {
      faction,
      turn: this._turnNumber,
      phase: this._phase,
      updatedAt: new Date().toISOString(),
      categories,
      alerts,
      stockpile: {
        ammo: depotTotals.ammo ?? 0,
        fuel: depotTotals.fuel ?? 0,
        rations: depotTotals.rations ?? 0,
        parts: depotTotals.parts ?? 0
      },
      ledger: this.supplyStateByFaction[faction].ledger.map((entry) => ({ ...entry }))
    } satisfies SupplySnapshot;
  }

  private recordSupplySnapshot(faction: TurnFaction): void {
    const snapshot = this.computeSupplySnapshot(faction);
    this.storeSupplySnapshot(faction, snapshot);
  }

  /**
   * Persists a defensive copy of the latest supply snapshot and enforces the history retention window.
   */
  private storeSupplySnapshot(faction: TurnFaction, snapshot: SupplySnapshot): void {
    const history = this.supplyHistoryByFaction[faction];
    history.push(structuredClone(snapshot));
    const overflow = history.length - GameEngine.SUPPLY_HISTORY_LIMIT;
    if (overflow > 0) {
      history.splice(0, overflow);
    }
  }

  private buildSupplyCategories(
    faction: TurnFaction,
    frontlineUnits: ScenarioUnit[],
    reserveUnits: ScenarioUnit[],
    history: SupplySnapshot[]
  ): SupplyCategorySnapshot[] {
    const totalUnits = frontlineUnits.length + reserveUnits.length;
    const stockpileTotals = this.getFactionStockpileTotals(faction);
    const ammoCategory = this.composeTrackedCategory(
      "ammo",
      "Ammunition",
      frontlineUnits,
      reserveUnits,
      history,
      totalUnits,
      stockpileTotals.ammo
    );
    const fuelCategory = this.composeTrackedCategory(
      "fuel",
      "Fuel",
      frontlineUnits,
      reserveUnits,
      history,
      totalUnits,
      stockpileTotals.fuel
    );

    const medicalCategory: SupplyCategorySnapshot = {
      resource: "medical",
      label: "Field Medical",
      total: 0,
      frontlineTotal: 0,
      reserveTotal: 0,
      // No depot stockpile tracked yet; explicit zero keeps UI cards consistent and satisfies typing.
      stockpileTotal: 0,
      averagePerUnit: 0,
      consumptionPerTurn: 0,
      estimatedDepletionTurns: null,
      trend: history
        .slice(-(GameEngine.SUPPLY_TREND_WINDOW - 1))
        .map((entry) => entry.categories.find((category) => category.resource === "medical")?.total ?? 0)
        .concat(0),
      status: "unknown",
      notes: faction === "Player"
        ? "Medical logistics tracking is pending implementation."
        : "Enemy medical reserves unavailable without recon confirmation."
    };

    const emergencyCategory: SupplyCategorySnapshot = {
      resource: "emergency",
      label: "Emergency Reserve",
      total: 0,
      frontlineTotal: 0,
      reserveTotal: 0,
      // Placeholder zero until logistics production populates emergency caches.
      stockpileTotal: 0,
      averagePerUnit: 0,
      consumptionPerTurn: 0,
      estimatedDepletionTurns: null,
      trend: history
        .slice(-(GameEngine.SUPPLY_TREND_WINDOW - 1))
        .map((entry) => entry.categories.find((category) => category.resource === "emergency")?.total ?? 0)
        .concat(0),
      status: "unknown",
      notes: faction === "Player"
        ? "Emergency caches are placeholders until logistics production is wired."
        : "Enemy emergency stores cannot be estimated with current intel."
    };

    return [ammoCategory, fuelCategory, medicalCategory, emergencyCategory];
  }

  private composeTrackedCategory(
    resource: Extract<SupplyResourceKey, "ammo" | "fuel">,
    label: string,
    frontlineUnits: ScenarioUnit[],
    reserveUnits: ScenarioUnit[],
    history: SupplySnapshot[],
    totalUnits: number,
    stockpileDepot: number
  ): SupplyCategorySnapshot {
    const frontlineTotal = frontlineUnits.reduce<number>((sum, unit) => sum + (unit[resource] ?? 0), 0);
    const reserveTotal = reserveUnits.reduce<number>((sum, unit) => sum + (unit[resource] ?? 0), 0);
    const total = frontlineTotal + reserveTotal;
    const previousSnapshot = history.length > 0 ? history[history.length - 1] : undefined;
    const previous = previousSnapshot?.categories.find((category) => category.resource === resource);
    const rawConsumption = previous ? previous.total - total : 0;
    const consumptionPerTurn = Number(rawConsumption.toFixed(2));
    const estimatedDepletionTurns = consumptionPerTurn > 0
      ? Number((total / consumptionPerTurn).toFixed(1))
      : null;
    const trendWindow = GameEngine.SUPPLY_TREND_WINDOW - 1;
    const trendHistory = trendWindow > 0 ? history.slice(-trendWindow) : [];
    const trend = trendHistory
      .map((entry) => entry.categories.find((category) => category.resource === resource)?.total ?? 0)
      .concat(total);
    const averagePerUnit = totalUnits === 0 ? 0 : Number((total / totalUnits).toFixed(2));

    let status: SupplyCategorySnapshot["status"] = "stable";
    if (totalUnits === 0) {
      status = "unknown";
    } else if (total <= totalUnits) {
      status = "critical";
    } else if (total <= totalUnits * 2) {
      status = "warning";
    }
    if (estimatedDepletionTurns !== null) {
      if (estimatedDepletionTurns <= 1) {
        status = "critical";
      } else if (estimatedDepletionTurns <= 3 && status !== "critical") {
        status = "warning";
      }
    }
    if (total > 0 && consumptionPerTurn <= 0) {
      status = "stable";
    }

    return {
      resource,
      label,
      total,
      frontlineTotal,
      reserveTotal,
      // Track depot reserves alongside unit-held stock so UI can reflect overall availability for this resource.
      stockpileTotal: stockpileDepot,
      averagePerUnit,
      consumptionPerTurn,
      estimatedDepletionTurns,
      trend,
      status
    } satisfies SupplyCategorySnapshot;
  }

  private deriveSupplyAlerts(categories: SupplyCategorySnapshot[], faction: TurnFaction): SupplyAlert[] {
    const alerts: SupplyAlert[] = [];
    categories.forEach((category: SupplyCategorySnapshot) => {
      if (category.resource === "medical" || category.resource === "emergency") {
        if (category.status === "unknown") {
          alerts.push({
            resource: category.resource,
            level: "info",
            message: category.notes
              ?? (faction === "Player"
                ? "Medical and emergency inventories are pending future integration."
                : "Enemy emergency reserves require higher intel confidence.")
          });
        }
        return;
      }

      if (category.status === "critical") {
        const turns = category.estimatedDepletionTurns ?? 0;
        alerts.push({
          resource: category.resource,
          level: "critical",
          message: `${category.label} projected to run dry in ${turns <= 0 ? "under one" : turns} turns.`
        });
      } else if (category.status === "warning") {
        alerts.push({
          resource: category.resource,
          level: "warning",
          message: `${category.label} reserves trending low; resupply within the next few turns.`
        });
      } else if (category.consumptionPerTurn <= 0 && category.total > 0) {
        alerts.push({
          resource: category.resource,
          level: "info",
          message: `${category.label} consumption stabilized after recent resupply.`
        });
      }
    });

    if (faction === "Bot") {
      alerts.push({
        resource: "ammo",
        level: "info",
        message: "Enemy supply estimates reflect known deployments; confidence varies with recon coverage."
      });
    }

    return alerts;
  }

  /**
   * Generates supply route summaries from a logistics source to every deployed player unit so the
   * dashboard can chart throughput, travel time, and emerging chokepoints.
   */
  private computePlayerLogisticsRoutes(
    source: Axial,
    catalog: SupplyTerrainCatalog,
    network: SupplyNetwork,
    placements: ScenarioUnit[]
  ): Map<string, SupplyRouteSummary> {
    if (placements.length === 0) {
      return new Map();
    }
    const targets = placements.map((unit) => ({ hex: unit.hex, unitKey: unit.type }));
    return computeSupplyRoutes(source, targets, network, catalog);
  }

  /**
   * Identifies the most expensive route so the UI can flag the single largest logistics bottleneck.
   */
  private selectHighestCostRoute(routes: SupplyRouteSummary[]): SupplyRouteSummary | null {
    if (routes.length === 0) {
      return null;
    }
    return routes.reduce((highest, current) => (current.totalCost > highest.totalCost ? current : highest));
  }

  /**
   * Converts a route summary into a human-readable bottleneck description by pointing at the costliest node.
   */
  private describeRouteBottleneck(summary: SupplyRouteSummary): string {
    if (summary.nodes.length === 0) {
      return "No route nodes recorded";
    }
    const worstNode = summary.nodes.reduce((highest, node) => (node.cost > highest.cost ? node : highest));
    return this.formatAxial(worstNode.hex);
  }

  /**
   * Rates convoy status using travel hours and cumulative cost so commanders see which routes are slipping schedule.
   */
  private resolveConvoyStatus(summary: SupplyRouteSummary): LogisticsConvoyStatusEntry["status"] {
    if (summary.estimatedHours > 24 || summary.totalCost > 40) {
      return "blocked";
    }
    if (summary.estimatedHours > 12 || summary.totalCost > 25) {
      return "returning";
    }
    return "delivering";
  }

  /** Formats an axial coordinate for quick display inside the logistics overlays. */
  private formatAxial(hex: Axial): string {
    return `${hex.q},${hex.r}`;
  }

  /**
   * Translates a route cost into a qualitative congestion risk so the UI can color-code hotspots.
   */
  private resolveDelayRisk(cost: number): LogisticsDelayNode["risk"] {
    if (cost > 40) {
      return "high";
    }
    if (cost > 20) {
      return "medium";
    }
    return "low";
  }

  /**
   * Summarizes the most pressing maintenance issue for a unit so the backlog list stays easy to parse.
   */
  private resolveMaintenanceIssue(unit: ScenarioUnit): string {
    const definition = this.getUnitDefinition(unit.type);
    if (unit.strength < 6) {
      return "Combat damage";
    }
    if (this.unitConsumesFuel(definition) && unit.fuel < 2) {
      return "Refuel required";
    }
    return "Rearm required";
  }

  /**
   * Provides a coarse estimate of how many turns each maintenance action will consume to prioritize repairs.
   */
  private estimateMaintenanceTurns(unit: ScenarioUnit): number {
    if (unit.strength < 4) {
      return 3;
    }
    if (unit.strength < 6) {
      return 2;
    }
    return 1;
  }

  /**
   * Rebuilds a categorized support snapshot capturing readiness groupings and aggregate metrics.
   */
  private buildSupportSnapshot(): SupportSnapshot {
    const ready: SupportAssetSnapshot[] = [];
    const queued: SupportAssetSnapshot[] = [];
    const cooldown: SupportAssetSnapshot[] = [];
    const maintenance: SupportAssetSnapshot[] = [];

    let totalCharges = 0;
    let queuedCount = 0;
    let cooldownSum = 0;
    let cooldownCount = 0;

    this.privateSupportAssets.forEach((asset) => {
      const snapshot: SupportAssetSnapshot = {
        id: asset.id,
        label: asset.label,
        type: asset.type,
        status: asset.status,
        charges: asset.charges,
        maxCharges: asset.maxCharges,
        cooldown: asset.cooldown,
        maxCooldown: asset.maxCooldown,
        assignedHex: asset.assignedHex,
        notes: asset.notes,
        queuedHex: asset.queuedHex
      } satisfies SupportAssetSnapshot;

      switch (asset.status) {
        case "ready":
          ready.push(snapshot);
          break;
        case "queued":
          queued.push(snapshot);
          queuedCount += 1;
          break;
        case "cooldown":
          cooldown.push(snapshot);
          cooldownSum += asset.cooldown;
          cooldownCount += 1;
          break;
        case "maintenance":
          maintenance.push(snapshot);
          break;
        default:
          ready.push(snapshot);
          break;
      }

      totalCharges += Math.max(0, asset.charges);
    });

    const metrics: SupportSnapshotMetrics = {
      totalAssets: this.privateSupportAssets.length,
      ready: ready.length,
      queued: queued.length,
      cooldown: cooldown.length,
      maintenance: maintenance.length,
      totalCharges,
      actionsQueued: queuedCount,
      averageCooldown: cooldownCount === 0 ? null : Number((cooldownSum / cooldownCount).toFixed(2))
    } satisfies SupportSnapshotMetrics;

    return {
      updatedAt: new Date().toISOString(),
      ready,
      queued,
      cooldown,
      maintenance,
      metrics
    } satisfies SupportSnapshot;
  }

  /**
   * Locates the mutable support asset record or throws when an unknown identifier is provided.
   */
  private getInternalSupportAsset(assetId: string): InternalSupportAsset {
    const asset = this.privateSupportAssets.find((entry) => entry.id === assetId);
    if (!asset) {
      throw new Error(`Support asset '${assetId}' was not found.`);
    }
    return asset;
  }

  /**
   * Refreshes player supply history immediately after new deployments land on the map.
   */
  private resetPlayerHistoryCheckpoint(): void {
    this.recordSupplySnapshot("Player");
  }

  private buildRosterSnapshot(): BattleRosterSnapshot {
    const deploymentState = ensureDeploymentState();
    const updatedAt = new Date().toISOString();

    const frontline: RosterUnitSummary[] = Array.from(this.playerPlacements.values()).map((unit) => {
      const definition = this.getUnitDefinition(unit.type);
      const unitKey = deploymentState.getUnitKeyForScenarioType(unit.type as string);
      const label = unitKey ? deploymentState.getLabelForUnitKey(unitKey) : unit.type;
      const sprite = unitKey ? deploymentState.getSpritePath(unitKey) : undefined;
      const combatPower = Math.max(0, Math.round(((definition.hardAttack + definition.softAttack) * unit.strength) / 10));

      const fuel = this.resolveRosterFuel(unit, definition);

      return {
        unitId: `${unit.type}_${axialKey(unit.hex)}`,
        unitKey,
        label,
        unitType: unit.type,
        unitClass: definition.class,
        strength: unit.strength,
        experience: unit.experience,
        ammo: unit.ammo,
        fuel,
        morale: null,
        location: axialKey(unit.hex),
        status: "frontline",
        orders: [],
        attachments: [],
        tags: [],
        combatPower,
        sprite
      } satisfies RosterUnitSummary;
    });

    const support: RosterUnitSummary[] = this.privateSupportAssets.map((asset) => {
      const combatPower = Math.max(0, asset.charges * 5);
      const orders = asset.queuedHex ? ["Queued"] : [];

      return {
        unitId: asset.id,
        unitKey: null,
        label: asset.label,
        unitType: asset.type,
        unitClass: "specialist",
        strength: asset.charges,
        experience: 0,
        ammo: 0,
        fuel: null,
        morale: null,
        location: asset.assignedHex,
        status: "support",
        orders,
        attachments: [],
        tags: [asset.status],
        combatPower,
        sprite: undefined
      } satisfies RosterUnitSummary;
    });

    const reserves: RosterUnitSummary[] = this.reserves.map((reserve, index) => {
      const definition = this.getUnitDefinition(reserve.unit.type);
      const unitKey = reserve.allocationKey
        ?? deploymentState.getUnitKeyForScenarioType(reserve.unit.type as string);
      const label = unitKey ? deploymentState.getLabelForUnitKey(unitKey) : reserve.unit.type;
      const sprite = reserve.sprite ?? (unitKey ? deploymentState.getSpritePath(unitKey) : undefined);
      const combatPower = Math.max(0, Math.round(((definition.hardAttack + definition.softAttack) * reserve.unit.strength) / 10));

      const fuel = this.resolveRosterFuel(reserve.unit, definition);

      return {
        unitId: `reserve_${index}`,
        unitKey,
        label,
        unitType: reserve.unit.type,
        unitClass: definition.class,
        strength: reserve.unit.strength,
        experience: reserve.unit.experience,
        ammo: reserve.unit.ammo,
        fuel,
        morale: null,
        location: null,
        status: "reserve",
        orders: [],
        attachments: [],
        tags: ["reserve"],
        combatPower,
        sprite
      } satisfies RosterUnitSummary;
    });

    const casualties: RosterUnitSummary[] = this.casualtyLog.map((casualty, index) => {
      const definition = this.getUnitDefinition(casualty.unit.type);

      const fuel = this.resolveRosterFuel(casualty.unit, definition);

      return {
        unitId: `casualty_${index}`,
        unitKey: casualty.unitKey,
        label: casualty.label,
        unitType: casualty.unit.type,
        unitClass: definition.class,
        strength: casualty.unit.strength,
        experience: casualty.unit.experience,
        ammo: casualty.unit.ammo,
        fuel,
        morale: null,
        location: axialKey(casualty.unit.hex),
        status: "casualty",
        orders: [],
        attachments: [],
        tags: ["destroyed"],
        combatPower: 0,
        sprite: undefined
      } satisfies RosterUnitSummary;
    });

    const frontlinePower = frontline.reduce((total, unit) => total + unit.combatPower, 0);
    const supportPower = support.reduce((total, unit) => total + unit.combatPower, 0);
    const reservePower = reserves.reduce((total, unit) => total + unit.combatPower, 0);

    const metrics: BattleRosterMetrics = {
      totalUnits: frontline.length + support.length + reserves.length + casualties.length,
      frontline: frontline.length,
      support: support.length,
      reserve: reserves.length,
      casualties: casualties.length,
      combatPowerTotal: frontlinePower + supportPower + reservePower,
      reserveDepth: reserves.length
    } satisfies BattleRosterMetrics;

    return {
      updatedAt,
      frontline,
      support,
      reserves,
      casualties,
      metrics
    } satisfies BattleRosterSnapshot;
  }

  /**
   * Normalizes fuel readouts for roster snapshots, returning null for formations that do not track fuel (e.g., infantry).
   */
  private resolveRosterFuel(unit: ScenarioUnit, definition: UnitTypeDefinition): number | null {
    const usesFuel = ["vehicle", "tank", "air", "recon"].includes(definition.class);
    if (!usesFuel) {
      return null;
    }
    return Math.max(0, Math.round(unit.fuel));
  }

  /**
   * Records a detailed combat engagement for post-battle analysis and reporting.
   */
  private recordCombatReport(engagement: {
    attacker: {
      unit: ScenarioUnit;
      hex: Axial;
      faction: TurnFaction;
      strengthBefore: number;
      strengthAfter: number;
    };
    defender: {
      unit: ScenarioUnit;
      hex: Axial;
      faction: TurnFaction;
      strengthBefore: number;
      strengthAfter: number;
      destroyed: boolean;
    };
    attackResult: AttackResult;
    retaliationResult?: AttackResult;
  }): void {
    this.combatReportIdCounter += 1;

    const report: CombatReportEntry = {
      id: `combat_${this._turnNumber}_${this.combatReportIdCounter}`,
      turn: this._turnNumber,
      timestamp: new Date().toISOString(),
      attacker: {
        faction: engagement.attacker.faction,
        unitType: engagement.attacker.unit.type,
        position: structuredClone(engagement.attacker.hex),
        strengthBefore: engagement.attacker.strengthBefore,
        strengthAfter: engagement.attacker.strengthAfter
      },
      defender: {
        faction: engagement.defender.faction,
        unitType: engagement.defender.unit.type,
        position: structuredClone(engagement.defender.hex),
        strengthBefore: engagement.defender.strengthBefore,
        strengthAfter: engagement.defender.strengthAfter,
        destroyed: engagement.defender.destroyed
      },
      attackResult: {
        damage: Math.max(0, Math.round(engagement.attackResult.expectedDamage)),
        terrainDefense: 0, // Calculated inside attack resolution, not exposed
        accuracyMod: Math.round(engagement.attackResult.accuracy * 100),
        range: 0, // Not exposed in AttackResult
        los: true // Assume true if attack was allowed
      },
      retaliation: engagement.retaliationResult
        ? {
            damage: Math.max(0, Math.round(engagement.retaliationResult.expectedDamage)),
            terrainDefense: 0,
            accuracyMod: Math.round(engagement.retaliationResult.accuracy * 100),
            attackerStrengthAfter: engagement.attacker.strengthAfter
          }
        : undefined
    };

    this.combatReports.push(report);

    // Keep only last 50 reports to prevent unlimited growth
    if (this.combatReports.length > 50) {
      this.combatReports.shift();
    }
  }

  /**
   * Records a concise air mission report capped to the most recent 50 sorties so planners can track trends
   * without bloating save files.
   */
  private recordAirMissionReport(
    mission: ScheduledAirMission,
    options: {
      outcome?: AirMissionOutcome;
      event?: "resolved" | "refitStarted" | "refitCompleted";
      kills?: { escorts?: number; cap?: number };
      bomberAttrition?: number;
      notes?: string[];
    } = {}
  ): void {
    const { outcome, event, kills, bomberAttrition, notes } = options;
    // Derive metrics from outcome meta if not explicitly provided
    const derivedKills = kills ?? (outcome?.meta ? { escorts: outcome.meta.escortsWins ?? 0, cap: outcome.meta.capKills ?? 0 } : undefined);
    const derivedAttrition = bomberAttrition ?? (outcome?.meta?.bomberAttrition ?? undefined);
    const entry: AirMissionReportEntry = {
      id: `airMission_${mission.id}_${this._turnNumber}`,
      missionId: mission.id,
      turnResolved: this._turnNumber,
      timestamp: new Date().toISOString(),
      faction: mission.faction,
      unitType: mission.unitType,
      unitKey: mission.unitKey,
      kind: mission.template.kind,
      outcome: outcome ? structuredClone(outcome) : undefined,
      targetHex: mission.targetHex ? structuredClone(mission.targetHex) : undefined,
      escortTargetUnitKey: mission.escortTargetUnitKey,
      interceptions: mission.interceptions,
      event: event ?? (outcome ? "resolved" : undefined),
      kills: derivedKills,
      bomberAttrition: derivedAttrition,
      notes
    };

    this.airMissionReports.push(entry);
    if (this.airMissionReports.length > 50) {
      this.airMissionReports.shift();
    }
  }

  /**
   * Classifies the unit's current suppression state for UI and rule queries.
   */
  private resolveUnitSuppressionState(unit: ScenarioUnit): { state: UnitSuppressionState; count: number } {
    const count = unit.suppressedBy?.length ?? 0;
    if (count >= 2) {
      return { state: "pinned", count };
    }
    if (count === 1) {
      return { state: "suppressed", count };
    }
    return { state: "clear", count: 0 };
  }

  private canUseCombatStances(unit: ScenarioUnit, definition: UnitTypeDefinition): boolean {
    if (definition.moveType === "leg" && ["infantry", "recon", "specialist"].includes(definition.class)) {
      return true;
    }
    return unit.type === "Recon_Bike";
  }

  private resolveCombatStanceForAttacker(
    unit: ScenarioUnit,
    definition: UnitTypeDefinition,
    requested?: CombatStance
  ): CombatStance | undefined {
    if (!requested || requested === "digIn") {
      return undefined;
    }
    if (!this.canUseCombatStances(unit, definition)) {
      return undefined;
    }
    if (requested === "assault") {
      return this.resolveUnitSuppressionState(unit).state === "clear" ? "assault" : undefined;
    }
    return "suppressive";
  }

  private buildAssaultUnavailableMessage(unit: ScenarioUnit, definition: UnitTypeDefinition): string {
    if (!this.canUseCombatStances(unit, definition)) {
      return "Only assault-capable infantry formations and recon bikes can initiate assault fire.";
    }
    const suppression = this.resolveUnitSuppressionState(unit).state;
    if (suppression === "pinned") {
      return "Pinned formations cannot move, retaliate, or initiate assault fire until the pin is broken.";
    }
    if (suppression === "suppressed") {
      return "Suppressed formations may still move and fire, but they cannot initiate assault fire this turn.";
    }
    return "This formation cannot initiate assault fire from its current posture.";
  }

  private isEngineerUnit(unit: ScenarioUnit, definition?: UnitTypeDefinition): boolean {
    const def = definition ?? this.getUnitDefinition(unit.type);
    const traits = (def.traits ?? []) as readonly string[];
    return unit.type.toLowerCase().includes("engineer") || traits.includes("engineer");
  }

  private describeHexModification(type: HexModificationType): string {
    switch (type) {
      case "tankTraps":
        return "tank traps";
      case "fortifications":
        return "fortifications";
      case "clearedPath":
        return "a cleared path";
      default:
        return "fieldworks";
    }
  }

  private resolveActionCommitmentReason(flags: ReturnType<GameEngine["createDefaultActionFlags"]>): string | null {
    if (flags.attacksUsed > 0 || flags.movementPointsUsed > 0) {
      return "Hold position and stay uncommitted this turn to use infantry field actions.";
    }
    return null;
  }

  private resolveDigInAvailability(
    hex: Axial,
    unit: ScenarioUnit,
    definition: UnitTypeDefinition,
    flags: ReturnType<GameEngine["createDefaultActionFlags"]>
  ): { available: boolean; reason: string | null } {
    if (this._phase !== "playerTurn") {
      return { available: false, reason: "Dig in commands are available only during the player turn." };
    }
    if (this.isAutomatedPlayerUnit(unit)) {
      return { available: false, reason: "Automated logistics convoys do not accept infantry action orders." };
    }
    if (!this.playerPlacements.has(axialKey(hex))) {
      return { available: false, reason: "No player formation occupies this hex." };
    }
    if (definition.moveType !== "leg" || !["infantry", "recon", "specialist"].includes(definition.class)) {
      return { available: false, reason: "Only foot infantry-style formations can dig in." };
    }
    if (unit.entrench >= 2) {
      return { available: false, reason: "Entrenchment is already at maximum depth." };
    }
    return {
      available: this.resolveActionCommitmentReason(flags) === null,
      reason: this.resolveActionCommitmentReason(flags)
    };
  }

  private resolveBuildModificationAvailability(
    hex: Axial,
    unit: ScenarioUnit,
    definition: UnitTypeDefinition,
    flags: ReturnType<GameEngine["createDefaultActionFlags"]>
  ): { available: boolean; reason: string | null } {
    if (this._phase !== "playerTurn") {
      return { available: false, reason: "Engineer fieldworks can be ordered only during the player turn." };
    }
    if (this.isAutomatedPlayerUnit(unit)) {
      return { available: false, reason: "Automated logistics convoys do not accept engineering orders." };
    }
    if (!this.playerPlacements.has(axialKey(hex))) {
      return { available: false, reason: "No player engineer occupies this hex." };
    }
    if (!this.isEngineerUnit(unit, definition)) {
      return { available: false, reason: "Only engineer battalions can build battlefield modifications." };
    }
    const commitmentReason = this.resolveActionCommitmentReason(flags);
    if (commitmentReason) {
      return { available: false, reason: commitmentReason };
    }
    const existingMod = this.hexModifications.get(axialKey(hex));
    if (existingMod) {
      return {
        available: false,
        reason: `This hex already contains ${this.describeHexModification(existingMod.type)}.`
      };
    }
    return { available: true, reason: null };
  }

  /**
   * Supplies a read-only action state for the selected unit so the command UI can stay in sync with engine rules.
   */
  getUnitCommandState(hex: Axial): UnitCommandState | null {
    const key = axialKey(hex);
    const unit = this.playerPlacements.get(key);
    if (!unit) {
      return null;
    }
    const definition = this.getUnitDefinition(unit.type);
    const flags = this.playerActionFlags.get(key) ?? this.createDefaultActionFlags();
    const suppression = this.resolveUnitSuppressionState(unit);
    const digIn = this.resolveDigInAvailability(hex, unit, definition, flags);
    const build = this.resolveBuildModificationAvailability(hex, unit, definition, flags);
    const existingHexModification = this.getHexModification(hex);

    return {
      unitId: unit.unitId ?? key,
      unitType: unit.type,
      isAutomated: this.isAutomatedPlayerUnit(unit),
      isEngineer: this.isEngineerUnit(unit, definition),
      entrenchment: unit.entrench,
      maxEntrenchment: 2,
      suppressionState: suppression.state,
      suppressorCount: suppression.count,
      existingHexModification: existingHexModification ? structuredClone(existingHexModification) : null,
      canDigIn: digIn.available,
      digInReason: digIn.reason,
      canBuildModification: build.available,
      buildReason: build.reason
    };
  }

  /**
   * Field actions consume the unit's operational tempo for the turn, so spend the
   * current movement allowance as well as the attack action.
   */
  private resolveCommittedFieldActionFlags(
    hex: Axial,
    flags: ReturnType<GameEngine["createDefaultActionFlags"]>
  ): ReturnType<GameEngine["createDefaultActionFlags"]> {
    const movementContext = this.resolveMovementContext(hex);
    const committedMovement = movementContext ? movementContext.max : flags.movementPointsUsed;
    return {
      ...flags,
      movementPointsUsed: Math.max(flags.movementPointsUsed, committedMovement),
      attacksUsed: Math.max(flags.attacksUsed, 1)
    };
  }

  /**
   * Dig in action for infantry units. Increases entrenchment level (max 2).
   * Unit cannot move or attack again this turn after digging in.
   */
  digInUnit(hex: Axial): boolean {
    const key = axialKey(hex);
    const unit = this.playerPlacements.get(key);
    if (!unit) {
      return false;
    }
    const def = this.getUnitDefinition(unit.type);
    const flags = this.playerActionFlags.get(key) ?? this.createDefaultActionFlags();
    const digIn = this.resolveDigInAvailability(hex, unit, def, flags);
    if (!digIn.available) {
      return false;
    }

    // Increase entrenchment (max 2)
    unit.entrench = Math.min(2, unit.entrench + 1);
    this.playerPlacements.set(key, unit);
    this.syncPlayerEntrench(hex, unit.entrench);

    // Digging in consumes the battalion's remaining operational time for the turn.
    this.playerActionFlags.set(key, this.resolveCommittedFieldActionFlags(hex, flags));
    this.updateIdleRegistryFor(key);
    this.invalidateRosterCache();

    return true;
  }

  /**
   * Build a hex modification (tank traps, fortifications, cleared path).
   * Only engineers can build modifications.
   */
  buildHexModification(hex: Axial, type: HexModificationType): boolean {
    const key = axialKey(hex);
    const unit = this.playerPlacements.get(key);
    if (!unit) {
      return false;
    }
    const def = this.getUnitDefinition(unit.type);
    const flags = this.playerActionFlags.get(key) ?? this.createDefaultActionFlags();
    const build = this.resolveBuildModificationAvailability(hex, unit, def, flags);
    if (!build.available) {
      return false;
    }

    // Build the modification
    const modification: HexModification = {
      type,
      hex: structuredClone(hex),
      faction: "Player",
      builtOnTurn: this._turnNumber
    };
    this.hexModifications.set(key, modification);

    // Engineering work also commits the unit for the rest of the turn.
    this.playerActionFlags.set(key, this.resolveCommittedFieldActionFlags(hex, flags));
    this.updateIdleRegistryFor(key);
    this.invalidateRosterCache();

    return true;
  }

  /**
   * Get hex modification at a specific hex, if any.
   */
  getHexModification(hex: Axial): HexModification | null {
    const key = axialKey(hex);
    return this.hexModifications.get(key) ?? null;
  }

  getHexModificationSnapshots(): HexModification[] {
    return Array.from(this.hexModifications.values()).map((entry) => structuredClone(entry));
  }
}
