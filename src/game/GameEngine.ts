import {
  COMBAT_ROLE_VALUES,
  COMBAT_SIGNATURE_VALUES,
  COMBAT_WEIGHT_VALUES,
  normalizeFacingDirection,
  UNIT_CLASS_VALUES
} from "../core/types";
import type {
  ScenarioData,
  ScenarioSide,
  ScenarioUnit,
  UnitTypeDictionary,
  UnitTypeDefinition,
  TerrainDictionary,
  TerrainDefinition,
  TileDefinition,
  UnitClass,
  TileInstance,
  AirMissionKind,
  AirMissionTemplate,
  AirSupportRole,
  AirSupportProfile,
  CombatClassification,
  CombatStance,
  HexEdgeFacing,
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
import { TOWED_ARTILLERY_UNITS } from "../data/transportModes";
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
  targetRich?: boolean;
  targetRichDefenders?: readonly CombatPreviewTargetRichEntry[];
  totalExpectedDamage?: number;
  totalExpectedRetaliation?: number;
}

export interface CombatPreviewTargetRichEntry {
  readonly unitId: string;
  readonly unit: ScenarioUnit;
  readonly expectedDamage: number;
  readonly expectedRetaliation: number;
  readonly retaliationPossible: boolean;
  readonly retaliationNote?: string;
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
  readonly queuedByHex: string | null;
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
  queuedByHex: string | null;
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
 * Per-turn reservation state tracking how much demand has been allocated to trucks.
 * Prevents duplicate assignments and enables workload splitting.
 */
interface ConvoyReservation {
  unitId: string;
  ammoReserved: number;
  fuelReserved: number;
  assignedTrucks: string[]; // Track which trucks are servicing this unit
}

interface ConvoyAllocationResult {
  targetUnit: SupplyDemandEntry | null;
  ammoToReserve: number;
  fuelToReserve: number;
}

interface ConvoyReachableTarget {
  entry: SupplyDemandEntry;
  need: { ammoNeed: number; fuelNeed: number };
  plan: MovementPathPlan;
  cargoMismatchPenalty: number;
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
  readonly targetRich?: boolean;
  readonly targetRichDefenders?: readonly TargetRichResolutionEntry[];
  readonly totalDefenderDamage?: number;
  readonly totalRetaliationDamage?: number;
}

export interface TargetRichResolutionEntry {
  readonly unitId: string;
  readonly unitType: ScenarioUnit["type"];
  readonly remainingStrength: number;
  readonly destroyed: boolean;
  readonly expectedDamage: number;
  readonly retaliationDamage: number;
  readonly retaliationOccurred: boolean;
}

export interface HexUnitStackMember {
  readonly unitId: string;
  readonly unit: ScenarioUnit;
  readonly faction: TurnFaction;
  readonly isAutomated: boolean;
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
  /** Total percentage strength lost by hostile interceptors during escort / air-combat exchanges. */
  readonly interceptorAttrition?: number;
  /** Total percentage strength lost by escort flights during air-combat exchanges. */
  readonly escortAttrition?: number;
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
type AirMissionResult = "success" | "partial" | "aborted" | "destroyed";

/** Shared outcome fields that every mission report surfaces to the UI layer. */
interface AirMissionOutcomeBase {
  readonly type: AirMissionKind;
  readonly result: AirMissionResult;
  readonly details: string;
  readonly refitRequired: boolean;
  /** Optional engagement metrics used by sortie logs and HUD summaries. */
  readonly meta?: {
    readonly flakAttrition?: number;
    readonly capIntercepts?: number;
    readonly capKills?: number;
    readonly escortsEngaged?: number;
    readonly escortsWins?: number;
    readonly bomberAttrition?: number;
    readonly interceptorAttrition?: number;
    readonly interceptorKills?: number;
    readonly escortAttrition?: number;
    readonly escortKills?: number;
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
  readonly airCombatDamageInflicted?: number;
  readonly airCombatDamageTaken?: number;
  readonly airCombatKills?: number;
  readonly outcome?: AirMissionOutcome;
}

/** Lightweight mission arrival used by UI to visualize sorties beginning their patrol/strike. */
export interface AirMissionArrival {
  readonly missionId: string;
  readonly faction: TurnFaction;
  readonly unitKey: string;
  readonly originHexKey?: string;
  readonly unitType: string;
  readonly unitStrength?: number;
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
  readonly type: "airToAir" | "flak";
  readonly location: Axial;
  readonly missionId?: string;
  readonly bomber: { readonly faction: TurnFaction; readonly unitKey: string; readonly unitType: string; readonly strength?: number };
  readonly interceptors: ReadonlyArray<{ readonly faction: TurnFaction; readonly unitKey: string; readonly unitType: string; readonly strength?: number; readonly hex?: Axial }>;
  readonly escorts: ReadonlyArray<{ readonly faction: TurnFaction; readonly unitKey: string; readonly unitType: string; readonly strength?: number }>;
  readonly flakDamage?: number;
  readonly bomberStrengthBefore?: number;
  readonly bomberStrengthAfter?: number;
  readonly bomberDestroyed?: boolean;
  readonly interceptorAttrition?: number;
  readonly interceptorKills?: number;
  readonly escortAttrition?: number;
  readonly escortKills?: number;
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
  readonly unitId?: string;
  readonly targetHex?: Axial;
  readonly escortTargetHex?: Axial;
  readonly escortTargetUnitId?: string;
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
  airCombatDamageInflicted: number;
  airCombatDamageTaken: number;
  airCombatKills: number;
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
  aaEngagements?: Array<{ unitKey: string; count: number }>;
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
export type UnitTowState = "deployed" | "towed";

export interface UnitCommandState {
  readonly unitId: string;
  readonly unitType: ScenarioUnit["type"];
  readonly isAutomated: boolean;
  readonly isEngineer: boolean;
  readonly entrenchment: number;
  readonly maxEntrenchment: number;
  readonly suppressionState: UnitSuppressionState;
  readonly suppressorCount: number;
  readonly isOnSentry: boolean;
  readonly towState: UnitTowState | null;
  readonly existingHexModification: HexModification | null;
  readonly existingHexModifications: readonly HexModification[];
  readonly canMoveOut: boolean;
  readonly moveOutReason: string | null;
  readonly canDeployTow: boolean;
  readonly deployTowReason: string | null;
  readonly canEnterSentry: boolean;
  readonly sentryReason: string | null;
  readonly canDigIn: boolean;
  readonly digInReason: string | null;
  readonly canBuildModification: boolean;
  readonly buildReason: string | null;
  readonly buildModificationAvailability: Readonly<Record<HexModificationType, { available: boolean; reason: string | null }>>;
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
  /** Optional depot stock granted before turn one, typically from precombat supply purchases. */
  initialPlayerDepotStock?: {
    ammo: number;
    fuel: number;
    rations: number;
    parts: number;
  };
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
  previewAttack(attackerHex: Axial, defenderHex: Axial, stance?: CombatStance, attackerUnitId?: string, defenderUnitId?: string): CombatPreview | null;
  moveUnit(from: Axial, to: Axial, unitId?: string): MoveResolution;
  attackUnit(attackerHex: Axial, defenderHex: Axial, stance?: CombatStance, attackerUnitId?: string, defenderUnitId?: string): AttackResolution | null;
  toggleRushMode(hex: Axial): boolean;
  getReachableHexes(origin: Axial, unitId?: string): Axial[];
  getMovementBudget(origin: Axial, unitId?: string): MovementBudget | null;
  getAttackableTargets(attackerHex: Axial, unitId?: string): Axial[];
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
  getAircraftCombatRadiusHex(origin: Axial, unitId?: string | null): number | null;
  /** Returns refit turns for the aircraft at the given hex (active faction), or null if not an aircraft. */
  getAircraftRefitTurns(origin: Axial, unitId?: string | null): number | null;
  /** Cancels a queued air mission for the active faction. Returns true if a mission was canceled. */
  cancelQueuedAirMission(missionId: string): boolean;
  consumeSupportImpactEvents(): SupportImpactEvent[];
  serialize(): SerializedBattleState;
  initializeFromAllocations(units: ScenarioUnit[]): void;
  hydrateFromSerialized(state: SerializedBattleState): void;
  getPlayerPlacementsSnapshot(): ScenarioUnit[];
  getHexStackMembers(hex: Axial, faction: TurnFaction): HexUnitStackMember[];
  combinePlayerUnits(primaryUnitId: string, secondaryUnitId: string): ScenarioUnit | null;
  getReserveSnapshot(): ReserveUnit[];
  getTurnSummary(): TurnSummary;
  getLogisticsSnapshot(): LogisticsSnapshot;
  setSupplyPriority(unitId: string, priority: SupplyPriority): boolean;
  getCombatReports(): readonly CombatReportEntry[];
  queueSupportAction(assetId: string, targetHex: Axial): void;
  queueSupportActionFromUnit(callerHex: Axial, assetId: string, targetHex: Axial): boolean;
  cancelQueuedSupport(assetId: string): boolean;
  consumeBotTurnSummary(): BotTurnSummary | null;
  transferAllyControl(hex: Axial): boolean;
  enterSentry(hex: Axial, unitId?: string): boolean;
  exitSentry(hex: Axial, unitId?: string): boolean;
  moveOutTowableUnit(hex: Axial, unitId?: string): boolean;
  deployTowableUnit(hex: Axial, unitId?: string): boolean;
  digInUnit(hex: Axial, unitId?: string): boolean;
  buildHexModification(hex: Axial, type: HexModificationType, facing?: HexEdgeFacing | null, unitId?: string): boolean;
  getHexModification(hex: Axial): HexModification | null;
  getHexModifications(hex: Axial): HexModification[];
  getHexModificationSnapshots(): HexModification[];
  getUnitCommandState(hex: Axial, unitId?: string): UnitCommandState | null;
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

function normalizeUnitClass(value: string | undefined, key: string): UnitClass {
  if (!value) {
    throw new Error(`Unit '${key}' is missing a class designation.`);
  }
  if (UNIT_CLASS_VALUES.includes(value as UnitClass)) {
    return value as UnitClass;
  }
  throw new Error(`Unit '${key}' declares unsupported class '${value}'.`);
}

function normalizeCombatClassification(value: CombatClassification | undefined, key: string): CombatClassification {
  if (!value) {
    throw new Error(`Unit '${key}' is missing combat classification metadata.`);
  }

  if (!UNIT_CLASS_VALUES.includes(value.category)) {
    throw new Error(`Unit '${key}' declares unsupported combat.category '${String(value.category)}'.`);
  }
  if (!COMBAT_WEIGHT_VALUES.includes(value.weight)) {
    throw new Error(`Unit '${key}' declares unsupported combat.weight '${String(value.weight)}'.`);
  }
  if (!COMBAT_ROLE_VALUES.includes(value.role)) {
    throw new Error(`Unit '${key}' declares unsupported combat.role '${String(value.role)}'.`);
  }
  if (!COMBAT_SIGNATURE_VALUES.includes(value.signature)) {
    throw new Error(`Unit '${key}' declares unsupported combat.signature '${String(value.signature)}'.`);
  }

  return {
    category: value.category,
    weight: value.weight,
    role: value.role,
    signature: value.signature
  };
}

/**
 * Core engine class managing mutable battle state. It exposes a narrow API tailored to the existing UI
 * scaffolding so migration can proceed incrementally.
 */
export class GameEngine implements GameEngineAPI {
  /** Conversion factor mapping a single hex (250m) into kilometers for range validation. */
  private static readonly KILOMETERS_PER_HEX = 0.25;
  private static readonly TOWABLE_UNIT_TYPES = new Set<string>(TOWED_ARTILLERY_UNITS);
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
  private readonly hexModifications: Map<string, HexModification[]> = new Map();

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
    const initialDepotStock = faction === "Player"
      ? this.initialPlayerDepotStock
      : { ammo: 0, fuel: 0, rations: 0, parts: 0 };
    // Defensive guard: malformed supply mirrors can leave totals undefined; treat as zero stock to keep engine alive.
    const baselineAmmo = Math.max(0, Math.round(ammoTotal * supplyBalance.stockpileMultiplier.ammo) + initialDepotStock.ammo);
    const baselineFuel = Math.max(0, Math.round(fuelTotal * supplyBalance.stockpileMultiplier.fuel) + initialDepotStock.fuel);
    return createSupplyState({
      baseline: {
        ammo: baselineAmmo,
        fuel: baselineFuel,
        rations: initialDepotStock.rations,
        parts: initialDepotStock.parts
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
      airCombatDamageInflicted: mission.airCombatDamageInflicted,
      airCombatDamageTaken: mission.airCombatDamageTaken,
      airCombatKills: mission.airCombatKills,
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
      airCombatDamageInflicted: entry.airCombatDamageInflicted ?? 0,
      airCombatDamageTaken: entry.airCombatDamageTaken ?? 0,
      airCombatKills: entry.airCombatKills ?? 0,
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
          unitStrength: this.lookupUnitBySquadronId(mission.unitKey, mission.faction)?.unit.strength,
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

    const opponentFaction: TurnFaction = mission.faction === "Player" ? "Bot" : "Player";

    // === FLAK ENGAGEMENT: Ground AA intercepts before CAP ===
    const flakUnits = this.findAllActiveFlakUnitsForHex(opponentFaction, mission.targetHex);
    let flakAttrition = 0;

    if (flakUnits.length > 0) {
      const flakInterceptorsForEvent: Array<{
        faction: TurnFaction;
        unitKey: string;
        unitType: string;
        hex: Axial;
      }> = [];

      // Build event list for visual playback
      for (const flakEntry of flakUnits) {
        flakInterceptorsForEvent.push({
          faction: opponentFaction,
          unitKey: this.getSquadronId(flakEntry.unit),
          unitType: flakEntry.unit.type as string,
          hex: structuredClone(flakEntry.unit.hex)
        });
      }

      // Track bomber state as it takes sequential flak damage
      const bomberStrengthBeforeFlak = attackerBefore.strength;
      let currentBomber = attackerPlacements.get(attackerHexKey) ?? attacker;
      let bomberDestroyedByFlak = false;

      for (const flakEntry of flakUnits) {
        if (currentBomber.strength <= 0) break;  // Already destroyed

        const flakReq = this.buildMissionAttackRequest(
          opponentFaction,
          flakEntry.unit,
          currentBomber
        );
        if (!flakReq) continue;

        // Ground-based AA has severe accuracy penalty against fast-moving, distant aircraft
        let flakResult = resolveAttack(flakReq);
        const flakDef = this.getUnitDefinition(flakEntry.unit.type);
        if (this.hasAntiAirCapability(flakDef) && this.isAircraft(attackerDefinition)) {
          // Apply 75% accuracy reduction for ground AA vs aircraft (small, fast, distant targets)
          flakResult = {
            ...flakResult,
            accuracy: flakResult.accuracy * 0.25,
            expectedHits: flakResult.expectedHits * 0.25,
            expectedDamage: flakResult.expectedDamage * 0.25,
            expectedSuppression: flakResult.expectedSuppression * 0.25
          };
        }

        const suffered = Math.max(0, Math.round(flakResult.expectedDamage));
        const updatedBomber = structuredClone(currentBomber);
        updatedBomber.strength = Math.max(0, updatedBomber.strength - suffered);

        // Record engagement and consume ammo
        this.recordFlakEngagement(opponentFaction, flakEntry.unit, flakEntry.hexKey);

        attackerPlacements.set(attackerHexKey, updatedBomber);
        if (mission.faction === "Player") {
          this.syncPlayerStrength(updatedBomber.hex, updatedBomber.strength);
        } else {
          this.syncBotStrength(updatedBomber.hex, updatedBomber.strength);
        }

        currentBomber = updatedBomber;
        flakAttrition += suffered;

        if (updatedBomber.strength <= 0) {
          attackerPlacements.delete(attackerHexKey);
          if (mission.faction === "Player") {
            this.removeSupplyEntryFor(attacker.hex);
          } else {
            this.removeBotSupplyEntryFor(attacker.hex);
          }
          this.invalidateRosterCache();
          bomberDestroyedByFlak = true;
          break;
        }
      }

      this.pendingAirEngagements.push({
        type: "flak",
        missionId: mission.id,
        location: structuredClone(mission.targetHex!),
        bomber: {
          faction: mission.faction,
          unitKey: mission.unitKey,
          unitType: mission.unitType as string,
          strength: bomberStrengthBeforeFlak
        },
        interceptors: flakInterceptorsForEvent,
        escorts: [],
        flakDamage: flakAttrition,
        bomberStrengthBefore: bomberStrengthBeforeFlak,
        bomberStrengthAfter: Math.max(0, currentBomber.strength),
        bomberDestroyed: bomberDestroyedByFlak
      });

      if (bomberDestroyedByFlak) {
        return {
          type: "strike",
          result: "destroyed",
          details: "Strike package was destroyed by ground-based anti-aircraft fire before reaching the target.",
          refitRequired: true,
          meta: {
            flakAttrition: attackerBefore.strength,
            capIntercepts: 0,
            escortsEngaged: 0,
            escortsWins: 0,
            bomberAttrition: 0
          }
        };
      }
    }

    // Interception: hostile air cover over the objective may engage the strike package before ordnance release.
    // Collect all eligible CAP flights covering the target hex (limit: 1 interception per CAP per resolution).
    const capMissions = this.findAllActiveAirCoverForHex(opponentFaction, defenderKey).filter((m) => m.interceptions < 1);
    // Collect all eligible friendly escorts protecting this bomber (limit: 1 engagement per escort per resolution).
    const escortMissions = this.findAllActiveEscortsForUnit(mission.faction, mission.unitKey).filter((m) => m.interceptions < 1);

    // Engagement metrics for reporting
    let escortsEngaged = 0;
    let escortsWins = 0;
    let capIntercepts = 0;
    let bomberAttrition = 0;
    let interceptorAttrition = 0;
    let escortAttrition = 0;
    let interceptorKills = 0;

    if (capMissions.length > 0) {
      const interceptorsForEvent: Array<{ faction: TurnFaction; unitKey: string; unitType: string; strength?: number }> = [];
      const escortsForEvent: Array<{ faction: TurnFaction; unitKey: string; unitType: string; strength?: number }> = [];

      // Build event lists using current unit types (omit missing units gracefully)
      for (const cap of capMissions) {
        const capLookup = this.lookupUnitBySquadronId(cap.unitKey, opponentFaction);
        if (capLookup) {
          interceptorsForEvent.push({
            faction: opponentFaction,
            unitKey: cap.unitKey,
            unitType: capLookup.unit.type as string,
            strength: capLookup.unit.strength
          });
        }
      }
      for (const em of escortMissions) {
        const escortLookup = this.lookupUnitBySquadronId(em.unitKey, mission.faction);
        if (escortLookup) {
          escortsForEvent.push({
            faction: mission.faction,
            unitKey: em.unitKey,
            unitType: escortLookup.unit.type as string,
            strength: escortLookup.unit.strength
          });
        }
      }

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
        interceptorAttrition += inflicted;
        this.addMissionAirCombatInflicted(escort, inflicted);
        this.addMissionAirCombatTaken(cap, inflicted);
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
          interceptorKills += 1;
          this.addMissionAirCombatInflicted(escort, 0, 1);
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
      const bomberStrengthBeforeCap = attackerPlacements.get(attackerHexKey)?.strength ?? attackerBefore.strength;
      let currentBomber = attackerPlacements.get(attackerHexKey) ?? attacker;
      let bomberDestroyedByCap = false;
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
        bomberAttrition += suffered;
        this.addMissionAirCombatInflicted(cap, suffered, 0);
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
          this.addMissionAirCombatInflicted(cap, 0, 1);
          attackerPlacements.delete(attackerHexKey);
          if (mission.faction === "Player") {
            this.removeSupplyEntryFor(attacker.hex);
          } else {
            this.removeBotSupplyEntryFor(attacker.hex);
          }
          this.invalidateRosterCache();
          bomberDestroyedByCap = true;
          break;
        }
      }
      // Reconcile with the post-engagement snapshot so aggregate reporting stays exact.
      bomberAttrition = Math.max(0, attackerBefore.strength - (attackerPlacements.get(attackerHexKey)?.strength ?? attackerBefore.strength));

      this.pendingAirEngagements.push({
        type: "airToAir",
        missionId: mission.id,
        location: structuredClone(mission.targetHex!),
        bomber: {
          faction: mission.faction,
          unitKey: mission.unitKey,
          unitType: mission.unitType as string,
          strength: bomberStrengthBeforeCap
        },
        interceptors: interceptorsForEvent,
        escorts: escortsForEvent,
        bomberStrengthBefore: bomberStrengthBeforeCap,
        bomberStrengthAfter: attackerPlacements.get(attackerHexKey)?.strength ?? 0,
        bomberDestroyed: bomberDestroyedByCap,
        interceptorAttrition,
        interceptorKills,
        escortAttrition
      });

      if (bomberDestroyedByCap) {
        return {
          type: "strike",
          result: "destroyed",
          details: "Strike package was intercepted and destroyed before reaching the target.",
          refitRequired: true,
          meta: {
            capIntercepts,
            capKills: 1,
            escortsEngaged,
            escortsWins,
            bomberAttrition: attackerBefore.strength,
            interceptorAttrition,
            interceptorKills,
            escortAttrition
          }
        };
      }
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
      meta: {
        flakAttrition,
        capIntercepts,
        escortsEngaged,
        escortsWins,
        bomberAttrition,
        interceptorAttrition,
        interceptorKills,
        escortAttrition
      },
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
      if ((mission.interceptions ?? 0) > 0) {
        return {
          type: "escort",
          result: "success",
          details: "Escort engaged hostile interceptors while covering the linked strike package.",
          refitRequired: true,
          interceptions: mission.interceptions,
          protectedUnitKey: mission.escortTargetUnitKey,
          meta: {
            interceptorAttrition: mission.airCombatDamageInflicted,
            interceptorKills: mission.airCombatKills,
            escortAttrition: mission.airCombatDamageTaken
          }
        };
      }
      return {
        type: "escort",
        result: "aborted",
        details: "Assigned strike package was no longer present, so the escort returned to base.",
        refitRequired: false
      };
    }

    const interceptions = mission.interceptions ?? 0;
    return {
      type: "escort",
      result: "success",
      details:
        interceptions > 0
          ? `Escort engaged ${interceptions} hostile interception${interceptions === 1 ? "" : "s"} while protecting ${protectedLookup.unit.type}.`
          : `Escort maintained air cover for ${protectedLookup.unit.type}; no enemy interceptors challenged the route.`,
      refitRequired: true,
      interceptions,
      protectedUnitKey: mission.escortTargetUnitKey,
      meta: {
        interceptorAttrition: mission.airCombatDamageInflicted,
        interceptorKills: mission.airCombatKills,
        escortAttrition: mission.airCombatDamageTaken
      }
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
      details: `Combat air patrol completed over ${this.formatAxial(patrolHex)}; no hostile bombers entered the area.`,
      refitRequired: true,
      interceptions: mission.interceptions,
      protectedHex: structuredClone(patrolHex),
      meta: {
        bomberAttrition: mission.airCombatDamageInflicted,
        capKills: mission.airCombatKills,
        interceptorAttrition: mission.airCombatDamageTaken
      }
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

  /**
   * Returns all sentry ground-based AA units within range of the target hex.
   * Only includes units with "intercept" trait that haven't exceeded engagement limits.
   */
  private findAllActiveFlakUnitsForHex(
    faction: TurnFaction,
    targetHex: Axial
  ): Array<{ unit: ScenarioUnit; hexKey: string }> {
    const results: Array<{ unit: ScenarioUnit; hexKey: string }> = [];
    const allUnits = this.getAllUnitsForFaction(faction);

    for (const unit of allUnits) {
      // Must be on sentry
      if (!unit.onSentry) continue;

      // Must have intercept trait
      const definition = this.getUnitDefinition(unit.type);
      if (!definition?.traits?.includes("intercept")) continue;

      // Must not be aircraft (ground-based AA only)
      if (this.isAircraft(definition)) continue;

      // Must have ammo
      if (unit.ammo <= 0) continue;

      // Must not have exceeded per-turn engagement limit
      const unitId = this.getSquadronId(unit);
      const engagements = this.aaEngagementsByUnitId.get(unitId) ?? 0;
      if (engagements >= 1) continue;  // One engagement per turn

      // Must be within range
      const distance = hexDistance(unit.hex, targetHex);
      if (distance > definition.rangeMax) continue;
      if (distance < definition.rangeMin) continue;

      results.push({ unit, hexKey: axialKey(unit.hex) });
    }

    return results;
  }

  /**
   * Checks if a unit definition has anti-air capability (intercept trait, not aircraft).
   */
  private hasAntiAirCapability(definition: UnitTypeDefinition | null): boolean {
    return definition?.traits?.includes("intercept") === true &&
           this.isAircraft(definition) === false;
  }

  /** Resets AA engagement counters at turn start */
  private clearFlakEngagementsFor(faction: TurnFaction): void {
    this.getAllUnitsForFaction(faction).forEach((unit) => {
      const unitId = this.getSquadronId(unit);
      this.aaEngagementsByUnitId.delete(unitId);
    });
  }

  /** Increments engagement counter and breaks sentry for AA unit */
  private recordFlakEngagement(faction: TurnFaction, unit: ScenarioUnit, hexKey: string): void {
    const unitId = this.getSquadronId(unit);
    const current = this.aaEngagementsByUnitId.get(unitId) ?? 0;
    this.aaEngagementsByUnitId.set(unitId, current + 1);

    // Break sentry immediately and consume ammo
    const updatedUnit = structuredClone(unit);
    updatedUnit.onSentry = false;
    updatedUnit.ammo = Math.max(0, updatedUnit.ammo - 1);

    if (faction === "Player") {
      this.playerPlacements.set(hexKey, updatedUnit);
      this.syncPlayerAmmo(updatedUnit.hex, updatedUnit.ammo);
    } else if (faction === "Bot") {
      this.botPlacements.set(hexKey, updatedUnit);
      this.syncBotAmmo(updatedUnit.hex, updatedUnit.ammo);
    }

    this.invalidateRosterCache();
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
   * Applies production gains and delivers any pending shipments slated for the active turn before
   * any depot issues or convoy loading are evaluated.
   */
  private advanceFactionSupplyState(faction: TurnFaction): void {
    const state = this.supplyStateByFaction[faction];
    const arrivals = advanceShipments(state, this._turnNumber);
    arrivals.forEach((shipment) => applyShipment(state, shipment, this._turnNumber));
    const production = accumulateProduction(state, state.lastUpdatedTurn, this._turnNumber);
    production.forEach((shipment) => applyShipment(state, shipment, this._turnNumber));
    state.lastUpdatedTurn = this._turnNumber;
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

  private getHostileFactionsFor(faction: TurnFaction): readonly TurnFaction[] {
    return faction === "Bot" ? ["Player", "Ally"] : ["Bot"];
  }

  private forEachOccupiedHexKeyForFaction(faction: TurnFaction, visitor: (key: string) => void): void {
    this.getPlacementMapForFaction(faction).forEach((_unit, key) => visitor(key));
    this.getPlacementOverflowMapForFaction(faction).forEach((_units, key) => visitor(key));
  }

  private buildConvoyBlockingOccupancySet(faction: TurnFaction): Set<string> {
    const blocked = new Set<string>();
    this.getHostileFactionsFor(faction).forEach((hostileFaction) => {
      this.forEachOccupiedHexKeyForFaction(hostileFaction, (key) => blocked.add(key));
    });
    return blocked;
  }

  private isHexBlockedForConvoy(hex: Axial, faction: TurnFaction): boolean {
    return this.getHostileFactionsFor(faction)
      .some((hostileFaction) => this.getUnitsAtHexForFaction(hex, hostileFaction).length > 0);
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

  private getSupplyStateForHex(faction: TurnFaction, hex: Axial, unitId?: string | null): SupplyUnitState | null {
    const mirror = this.getSupplyMirrorForFaction(faction);
    if (unitId) {
      const byUnitId = mirror.find((entry) => entry.unitId === unitId);
      if (byUnitId) {
        return byUnitId;
      }
    }
    const key = axialKey(hex);
    return mirror.find((entry) => axialKey(entry.hex) === key) ?? null;
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

  private getSupplyDemandPriorityRank(entry: SupplyDemandEntry): number {
    switch (entry.priority) {
      case "critical":
        return 4;
      case "high":
        return 3;
      case "normal":
        return 2;
      case "low":
      default:
        return 1;
    }
  }

  private getConvoyServiceHistoryMap(faction: TurnFaction): Map<string, number> {
    return this.convoyServiceHistoryByFaction[faction];
  }

  private getConvoyServiceSequence(faction: TurnFaction, unitId: string | null | undefined): number {
    const normalized = this.normalizeUnitId(unitId);
    if (!normalized) {
      return 0;
    }
    return this.getConvoyServiceHistoryMap(faction).get(normalized) ?? 0;
  }

  private recordConvoyService(faction: TurnFaction, unitId: string | null | undefined): void {
    const normalized = this.normalizeUnitId(unitId);
    if (!normalized) {
      return;
    }
    const nextSequence = (this.convoyServiceSequenceByFaction[faction] ?? 0) + 1;
    this.convoyServiceSequenceByFaction[faction] = nextSequence;
    this.getConvoyServiceHistoryMap(faction).set(normalized, nextSequence);
  }

  private reserveConvoyAssignment(
    truckState: SupplyTruckState,
    target: SupplyDemandEntry,
    reservations: Map<string, ConvoyReservation>,
    ammoToReserve: number,
    fuelToReserve: number
  ): boolean {
    const unitId = this.normalizeUnitId(target.unit.unitId);
    if (!unitId) {
      return false;
    }

    let reservation = reservations.get(unitId);
    if (!reservation) {
      reservation = {
        unitId,
        ammoReserved: 0,
        fuelReserved: 0,
        assignedTrucks: []
      };
      reservations.set(unitId, reservation);
    }

    reservation.ammoReserved += ammoToReserve;
    reservation.fuelReserved += fuelToReserve;
    if (!reservation.assignedTrucks.includes(truckState.unitId)) {
      reservation.assignedTrucks.push(truckState.unitId);
    }

    truckState.assignedUnitId = unitId;
    target.assignmentCount += 1;
    truckState.status = "delivering";
    return true;
  }

  private compareConvoyReachableTargets(
    faction: TurnFaction,
    left: ConvoyReachableTarget,
    right: ConvoyReachableTarget
  ): number {
    const priorityDiff = this.getSupplyDemandPriorityRank(right.entry) - this.getSupplyDemandPriorityRank(left.entry);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    const mismatchDiff = left.cargoMismatchPenalty - right.cargoMismatchPenalty;
    if (mismatchDiff !== 0) {
      return mismatchDiff;
    }

    const assignmentDiff = left.entry.assignmentCount - right.entry.assignmentCount;
    if (assignmentDiff !== 0) {
      return assignmentDiff;
    }

    const leftServiceSequence = this.getConvoyServiceSequence(faction, left.entry.unit.unitId);
    const rightServiceSequence = this.getConvoyServiceSequence(faction, right.entry.unit.unitId);
    if (leftServiceSequence !== rightServiceSequence) {
      return leftServiceSequence - rightServiceSequence;
    }

    const leftNeed = left.need.ammoNeed + left.need.fuelNeed;
    const rightNeed = right.need.ammoNeed + right.need.fuelNeed;
    if (leftNeed !== rightNeed) {
      return rightNeed - leftNeed;
    }

    const costDiff = left.plan.summary.cost - right.plan.summary.cost;
    if (costDiff !== 0) {
      return costDiff;
    }

    const leftUnitId = this.normalizeUnitId(left.entry.unit.unitId) ?? `${left.entry.unit.type}@${axialKey(left.entry.unit.hex)}`;
    const rightUnitId = this.normalizeUnitId(right.entry.unit.unitId) ?? `${right.entry.unit.type}@${axialKey(right.entry.unit.hex)}`;
    return leftUnitId.localeCompare(rightUnitId);
  }

  private shouldRotateConvoyAssignment(
    faction: TurnFaction,
    currentEntry: SupplyDemandEntry | null,
    bestEntry: SupplyDemandEntry | null
  ): boolean {
    if (!currentEntry || !bestEntry) {
      return false;
    }

    const currentUnitId = this.normalizeUnitId(currentEntry.unit.unitId);
    const bestUnitId = this.normalizeUnitId(bestEntry.unit.unitId);
    if (!currentUnitId || !bestUnitId || currentUnitId === bestUnitId) {
      return false;
    }

    const currentPriority = this.getSupplyDemandPriorityRank(currentEntry);
    const bestPriority = this.getSupplyDemandPriorityRank(bestEntry);
    if (bestPriority > currentPriority) {
      return true;
    }
    if (bestPriority < currentPriority) {
      return false;
    }

    return this.getConvoyServiceSequence(faction, currentUnitId) > 0;
  }

  private ensureSupplyTruckStatesForFaction(faction: TurnFaction): void {
    const allUnits = this.getAllUnitsForFaction(faction);
    const stateMap = this.getSupplyTruckStateMap(faction);
    const liveIds = new Set<string>();

    allUnits.forEach((unit) => {
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
    const placements = this.getAllUnitsForFaction(faction);
    const entries: SupplyDemandEntry[] = [];
    const liveDemandUnitIds = new Set<string>();

    placements
      .filter((unit) => !this.isSupplyTruckType(unit.type))
      .forEach((unit) => {
        const unitId = this.normalizeUnitId(this.ensureUnitId(unit));
        if (unitId) {
          liveDemandUnitIds.add(unitId);
        }
        const definition = this.getUnitDefinition(unit.type);
        const state = this.getSupplyStateForHex(faction, unit.hex, unitId);
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

    const serviceHistory = this.getConvoyServiceHistoryMap(faction);
    Array.from(serviceHistory.keys()).forEach((unitId) => {
      if (!liveDemandUnitIds.has(unitId)) {
        serviceHistory.delete(unitId);
      }
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
      const state = this.getSupplyStateForHex(faction, entry.unit.hex, entry.unit.unitId);
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

    const occupied = this.buildConvoyBlockingOccupancySet(faction);
    occupied.delete(axialKey(truck.hex));

    const reachable: ConvoyReachableTarget[] = [];
    for (const entry of availableDemand) {
      const serviceHexes = this.collectServiceHexes(entry.unit.hex, truck.hex, faction);
      const plan = this.findCheapestPathToAny(truck.hex, serviceHexes, this.getUnitDefinition(truck.type).moveType, occupied);
      if (!plan) {
        continue;
      }
      reachable.push({
        entry,
        need: { ammoNeed: entry.ammoNeed, fuelNeed: entry.fuelNeed },
        plan,
        cargoMismatchPenalty:
          (entry.ammoNeed > 0 && truckState.ammoCargo <= 0 ? 45 : 0) +
          (entry.fuelNeed > 0 && truckState.fuelCargo <= 0 ? 45 : 0)
      });
    }

    if (reachable.length === 0) {
      return null;
    }

    reachable.sort((left, right) => this.compareConvoyReachableTargets(faction, left, right));
    return reachable[0]?.entry ?? null;
  }

  private collectServiceHexes(targetHex: Axial, origin: Axial, faction: TurnFaction): Axial[] {
    const candidates: Axial[] = [];
    if (!this.isHexBlockedForConvoy(targetHex, faction) || (targetHex.q === origin.q && targetHex.r === origin.r)) {
      candidates.push(structuredClone(targetHex));
    }
    neighbors(targetHex).forEach((neighbor) => {
      if (!this.inBounds(neighbor)) {
        return;
      }
      const key = axialKey(neighbor);
      if (this.isHexBlockedForConvoy(neighbor, faction) && key !== axialKey(origin)) {
        return;
      }
      candidates.push(structuredClone(neighbor));
    });
    return candidates;
  }

  private collectSourceApproachHexes(faction: TurnFaction, origin: Axial): Axial[] {
    const candidates: Axial[] = [];
    this.getSupplySourceHexes(faction).forEach((source) => {
      if (!this.isHexBlockedForConvoy(source, faction) || axialKey(source) === axialKey(origin)) {
        candidates.push(structuredClone(source));
      }
      neighbors(source).forEach((neighbor) => {
        if (!this.inBounds(neighbor)) {
          return;
        }
        const key = axialKey(neighbor);
        if (this.isHexBlockedForConvoy(neighbor, faction) && key !== axialKey(origin)) {
          return;
        }
        candidates.push(structuredClone(neighbor));
      });
    });
    return candidates;
  }

  /**
   * Normalizes and validates unit IDs. Rejects empty or missing IDs to prevent
   * poisoning assignment state with invalid keys.
   */
  private normalizeUnitId(unitId: string | null | undefined): string | null {
    if (!unitId || unitId.trim() === '') {
      return null;
    }
    return unitId.trim();
  }

  /**
   * Refreshes demand state for a unit, accounting for reservations already made
   * by other trucks. Returns unreserved remaining need.
   */
  private refreshDemandWithReservations(
    faction: TurnFaction,
    entry: SupplyDemandEntry,
    reservations: Map<string, ConvoyReservation>
  ): { ammoNeed: number; fuelNeed: number } | null {
    if (entry.status === "direct") {
      return null;
    }

    const unitState = this.getSupplyStateForHex(faction, entry.unit.hex, entry.unit.unitId);
    if (!unitState) {
      return null;
    }

    const totalAmmoNeed = Math.max(0, (entry.definition.ammo ?? 0) - unitState.ammo);
    const totalFuelNeed = this.unitConsumesFuel(entry.definition)
      ? Math.max(0, (entry.definition.fuel ?? 0) - unitState.fuel)
      : 0;

    const unitId = this.normalizeUnitId(entry.unit.unitId);
    const reservation = unitId ? reservations.get(unitId) : null;
    const ammoReserved = reservation?.ammoReserved ?? 0;
    const fuelReserved = reservation?.fuelReserved ?? 0;

    const ammoNeed = Math.max(0, totalAmmoNeed - ammoReserved);
    const fuelNeed = Math.max(0, totalFuelNeed - fuelReserved);

    return ammoNeed > 0 || fuelNeed > 0 ? { ammoNeed, fuelNeed } : null;
  }

  /**
   * Selects the best reachable target for a truck, considering:
   * 1. Reachability (must have valid path)
   * 2. Player priority (among reachable targets only)
   * 3. Travel cost
   * 4. Remaining unreserved need
   */
  private selectConvoyTarget(
    faction: TurnFaction,
    truck: ScenarioUnit,
    truckState: SupplyTruckState,
    truckDefinition: UnitTypeDefinition,
    demands: SupplyDemandEntry[],
    reservations: Map<string, ConvoyReservation>,
    occupied: Set<string>,
    availableFuel: number,
    excludedUnitIds: Set<string> = new Set()
  ): ConvoyAllocationResult {
    const nullResult: ConvoyAllocationResult = {
      targetUnit: null,
      ammoToReserve: 0,
      fuelToReserve: 0
    };

    const buildPlanForEntry = (entry: SupplyDemandEntry) => {
      const destinationOptions = this.collectServiceHexes(entry.unit.hex, truck.hex, faction);
      if (destinationOptions.length === 0) {
        return null;
      }

      return this.findCheapestPathToAny(
        truck.hex,
        destinationOptions,
        truckDefinition.moveType,
        occupied,
        Number.isFinite(availableFuel) ? availableFuel : undefined
      );
    };

    const reachable: ConvoyReachableTarget[] = [];

    for (const demand of demands) {
      const unitId = this.normalizeUnitId(demand.unit.unitId);
      if (!unitId || excludedUnitIds.has(unitId)) {
        continue;
      }

      const need = this.refreshDemandWithReservations(faction, demand, reservations);
      if (!need) {
        continue;
      }

      const plan = buildPlanForEntry(demand);
      const alreadyWithinServiceRadius = hexDistance(truck.hex, demand.unit.hex) <= supplyBalance.convoy.serviceRadius;
      if (!plan || (!alreadyWithinServiceRadius && plan.path.length <= 1)) {
        continue;
      }

      reachable.push({
        entry: demand,
        need,
        plan,
        cargoMismatchPenalty:
          (need.ammoNeed > 0 && truckState.ammoCargo <= 0 ? 45 : 0) +
          (need.fuelNeed > 0 && truckState.fuelCargo <= 0 ? 45 : 0)
      });
    }

    if (reachable.length === 0) {
      return nullResult;
    }

    reachable.sort((left, right) => this.compareConvoyReachableTargets(faction, left, right));
    const chosen = reachable[0]!;

    // Reserve what this truck can deliver
    const ammoToReserve = Math.min(chosen.need.ammoNeed, truckState.ammoCargo);
    const fuelToReserve = Math.min(chosen.need.fuelNeed, truckState.fuelCargo);

    return {
      targetUnit: chosen.entry,
      ammoToReserve,
      fuelToReserve
    };
  }

  /**
   * Continuously retargets a truck after delivery, seeking new units while cargo remains
   * and reachable demand exists.
   */
  private retargetConvoyAfterDelivery(
    faction: TurnFaction,
    truck: ScenarioUnit,
    truckState: SupplyTruckState,
    truckDefinition: UnitTypeDefinition,
    demands: SupplyDemandEntry[],
    reservations: Map<string, ConvoyReservation>,
    occupied: Set<string>,
    availableFuel: number
  ): void {
    const hasCargo = () => truckState.ammoCargo > 0 || truckState.fuelCargo > 0;

    let iterations = 0;
    const MAX_RETARGET_ITERATIONS = 10; // Safety limit

    while (hasCargo() && iterations < MAX_RETARGET_ITERATIONS) {
      iterations++;

      // Check if current assigned target is in range for delivery
      if (truckState.assignedUnitId) {
        const currentDemand = demands.find(
          (entry) => this.normalizeUnitId(entry.unit.unitId) === truckState.assignedUnitId
        );

        if (currentDemand) {
          const need = this.refreshDemandWithReservations(faction, currentDemand, reservations);
          if (need && hexDistance(truck.hex, currentDemand.unit.hex) <= supplyBalance.convoy.serviceRadius) {
            const unitState = this.getSupplyStateForHex(faction, currentDemand.unit.hex, currentDemand.unit.unitId);
            if (unitState) {
              const delivered = this.deliverConvoyCargoToUnit(
                faction,
                truckState,
                currentDemand.unit,
                unitState,
                currentDemand.definition
              );

              if (delivered) {
                // Update reservation after delivery
                const unitId = this.normalizeUnitId(currentDemand.unit.unitId);
                if (unitId) {
                  const newNeed = this.refreshDemandWithReservations(faction, currentDemand, reservations);
                  if (!newNeed) {
                    truckState.assignedUnitId = null;
                    reservations.delete(unitId);
                  }
                }

                if (!hasCargo()) {
                  break;
                }
                // Continue to find next target
              }
            }
          }
        }
      }

      // Select next target
      const excludedIds = new Set<string>();
      const allocation = this.selectConvoyTarget(
        faction,
        truck,
        truckState,
        truckDefinition,
        demands,
        reservations,
        occupied,
        availableFuel,
        excludedIds
      );

      if (!allocation.targetUnit) {
        // No more reachable targets
        break;
      }

      // Make reservation
      const unitId = this.normalizeUnitId(allocation.targetUnit.unit.unitId);
      if (!unitId) {
        break;
      }

      let reservation = reservations.get(unitId);
      if (!reservation) {
        reservation = {
          unitId,
          ammoReserved: 0,
          fuelReserved: 0,
          assignedTrucks: []
        };
        reservations.set(unitId, reservation);
      }

      reservation.ammoReserved += allocation.ammoToReserve;
      reservation.fuelReserved += allocation.fuelToReserve;
      if (!reservation.assignedTrucks.includes(truckState.unitId)) {
        reservation.assignedTrucks.push(truckState.unitId);
      }

      truckState.assignedUnitId = unitId;
      allocation.targetUnit.assignmentCount += 1;

      // If in range, deliver immediately and loop
      if (hexDistance(truck.hex, allocation.targetUnit.unit.hex) <= supplyBalance.convoy.serviceRadius) {
        const unitState = this.getSupplyStateForHex(
          faction,
          allocation.targetUnit.unit.hex,
          allocation.targetUnit.unit.unitId
        );
        if (unitState) {
          this.deliverConvoyCargoToUnit(
            faction,
            truckState,
            allocation.targetUnit.unit,
            unitState,
            allocation.targetUnit.definition
          );

          const newNeed = this.refreshDemandWithReservations(faction, allocation.targetUnit, reservations);
          if (!newNeed) {
            truckState.assignedUnitId = null;
            reservations.delete(unitId);
          }
        }
      } else {
        // Not in range, need to move towards target
        break;
      }
    }
  }

/**
 * THREE-PHASE CONVOY AUTOMATION
 *
 * Phase 1: Refresh demand state - Update all demand entries based on current unit state
 * Phase 2: Allocate convoy work - Assign trucks to targets with reservation-based workload splitting
 * Phase 3: Execute movement and delivery - Move trucks towards targets and deliver cargo
 *
 * Key improvements:
 * - Continuous retargeting: Trucks seek new targets while cargo remains
 * - Reservation system: Prevents duplicate assignments, enables workload splitting
 * - Priority-aware: Reachable targets only, then player priority, then cost
 * - Opportunistic delivery: Service nearby units en-route
 */
private automateSupplyConvoys(
  faction: TurnFaction,
  supplyState: SupplyState,
  demands: SupplyDemandEntry[]
): void {
  this.ensureSupplyTruckStatesForFaction(faction);
  const placements = this.getPlacementMapForFaction(faction);
  const mirror = this.getSupplyMirrorForFaction(faction);
  const stateMap = this.getSupplyTruckStateMap(faction);

  // Per-turn reservation state - rebuilt fresh each automation pass
  const reservations = new Map<string, ConvoyReservation>();

  // ======================
  // PHASE 1: REFRESH DEMAND STATE
  // ======================
  // Update all demand entries based on current unit state (no reservations yet)
  for (const demand of demands) {
    if (demand.status === "direct") {
      continue;
    }

    const unitState = this.getSupplyStateForHex(faction, demand.unit.hex, demand.unit.unitId);
    if (!unitState) {
      continue;
    }

    demand.ammoNeed = Math.max(0, (demand.definition.ammo ?? 0) - unitState.ammo);
    demand.fuelNeed = this.unitConsumesFuel(demand.definition)
      ? Math.max(0, (demand.definition.fuel ?? 0) - unitState.fuel)
      : 0;
  }

  // ======================
  // PHASE 2: ALLOCATE CONVOY WORK
  // ======================
  // Assign trucks to targets with reservation-based workload splitting
  const trucks = this.getAllUnitsForFaction(faction).filter((unit) => this.isSupplyTruckType(unit.type));

  for (const truck of trucks) {
    const truckId = this.normalizeUnitId(this.ensureUnitId(truck));
    if (!truckId) {
      console.warn(`[ConvoyAutomation] Skipping truck with invalid unitId`, truck);
      continue;
    }

    const truckState = stateMap.get(truckId);
    if (!truckState) {
      continue;
    }

    const truckDefinition = this.getUnitDefinition(truck.type);
    const truckSupplyState = this.getSupplyStateForHex(faction, truck.hex, truckId);

    if (!truckSupplyState) {
      continue;
    }

    // Load at source
    const atSource = this.isHexWithinSupplySourceRadius(truck.hex, faction);
    if (atSource) {
      this.loadSupplyTruckFromDepot(faction, supplyState, truck, truckSupplyState, truckState);
    }

    const hasCargo = truckState.ammoCargo > 0 || truckState.fuelCargo > 0;
    if (!hasCargo) {
      truckState.assignedUnitId = null;
      truckState.status = atSource ? "idle" : "returning";
      continue;
    }

    const occupied = this.buildConvoyBlockingOccupancySet(faction);
    occupied.delete(axialKey(truck.hex));
    const availableFuel = this.resolveFuelBudget(truck, truckDefinition);

    // Check if current assignment is still valid.
    let currentDemand: SupplyDemandEntry | null = null;
    let currentNeed: { ammoNeed: number; fuelNeed: number } | null = null;
    let currentAssignmentValid = false;
    if (truckState.assignedUnitId) {
      currentDemand =
        demands.find((entry) => this.normalizeUnitId(entry.unit.unitId) === truckState.assignedUnitId) ?? null;

      if (currentDemand) {
        currentNeed = this.refreshDemandWithReservations(faction, currentDemand, reservations);
        if (currentNeed) {
          const destinationOptions = this.collectServiceHexes(currentDemand.unit.hex, truck.hex, faction);
          const plan = destinationOptions.length > 0
            ? this.findCheapestPathToAny(
                truck.hex,
                destinationOptions,
                truckDefinition.moveType,
                occupied,
                Number.isFinite(availableFuel) ? availableFuel : undefined
              )
            : null;

          const alreadyWithinServiceRadius =
            hexDistance(truck.hex, currentDemand.unit.hex) <= supplyBalance.convoy.serviceRadius;
          currentAssignmentValid = plan !== null && (alreadyWithinServiceRadius || plan.path.length > 1);
        }
      }

      if (!currentAssignmentValid) {
        truckState.assignedUnitId = null;
        currentDemand = null;
        currentNeed = null;
      }
    }

    const allocation = this.selectConvoyTarget(
      faction,
      truck,
      truckState,
      truckDefinition,
      demands,
      reservations,
      occupied,
      availableFuel
    );

    const keepCurrentAssignment =
      currentAssignmentValid &&
      currentDemand !== null &&
      currentNeed !== null &&
      (!allocation.targetUnit || !this.shouldRotateConvoyAssignment(faction, currentDemand, allocation.targetUnit));

    if (keepCurrentAssignment) {
      this.reserveConvoyAssignment(
        truckState,
        currentDemand!,
        reservations,
        Math.min(currentNeed!.ammoNeed, truckState.ammoCargo),
        Math.min(currentNeed!.fuelNeed, truckState.fuelCargo)
      );
    } else if (allocation.targetUnit) {
      this.reserveConvoyAssignment(
        truckState,
        allocation.targetUnit,
        reservations,
        allocation.ammoToReserve,
        allocation.fuelToReserve
      );
    } else {
      // No reachable targets with cargo - return to depot.
      truckState.assignedUnitId = null;
      truckState.status = atSource ? "idle" : "returning";
    }
  }

  // ======================
  // PHASE 3: EXECUTE MOVEMENT AND DELIVERY
  // ======================
  // Move trucks towards targets and deliver cargo

  for (const truck of trucks) {
    const truckId = this.normalizeUnitId(this.ensureUnitId(truck));
    if (!truckId) {
      continue;
    }

    const truckState = stateMap.get(truckId);
    if (!truckState) {
      continue;
    }

    const truckDefinition = this.getUnitDefinition(truck.type);
    const truckSupplyState = this.getSupplyStateForHex(faction, truck.hex, truckId);

    if (!truckSupplyState) {
      continue;
    }

    const atSource = this.isHexWithinSupplySourceRadius(truck.hex, faction);
    const hasCargo = (): boolean => truckState.ammoCargo > 0 || truckState.fuelCargo > 0;
    const occupied = this.buildConvoyBlockingOccupancySet(faction);
    occupied.delete(axialKey(truck.hex));
    const availableFuel = this.resolveFuelBudget(truck, truckDefinition);

      const refreshDemand = (
        entry: SupplyDemandEntry | null
      ): SupplyDemandEntry | null => {
        if (!entry || entry.status === "direct") {
          return null;
        }

        const unitState = this.getSupplyStateForHex(faction, entry.unit.hex, entry.unit.unitId);
        if (!unitState) {
          return null;
        }

        entry.ammoNeed = Math.max(
          0,
          (entry.definition.ammo ?? 0) - unitState.ammo
        );
        entry.fuelNeed = this.unitConsumesFuel(entry.definition)
          ? Math.max(0, (entry.definition.fuel ?? 0) - unitState.fuel)
          : 0;

        return entry.ammoNeed > 0 || entry.fuelNeed > 0 ? entry : null;
      };

      const buildPlanForEntry = (entry: SupplyDemandEntry | null) => {
        if (!entry || !hasCargo()) {
          return null;
        }

        const destinationOptions = this.collectServiceHexes(
          entry.unit.hex,
          truck.hex,
          faction
        );
        if (destinationOptions.length === 0) {
          return null;
        }

        const plan = this.findCheapestPathToAny(
          truck.hex,
          destinationOptions,
          truckDefinition.moveType,
          occupied,
          Number.isFinite(availableFuel) ? availableFuel : undefined
        );

        const alreadyWithinServiceRadius = hexDistance(truck.hex, entry.unit.hex) <= supplyBalance.convoy.serviceRadius;
        if (!plan || (!alreadyWithinServiceRadius && plan.path.length <= 1)) {
          return null;
        }

        return plan;
      };

      const selectReachableTarget = (
        excludedUnitIds: Set<string> = new Set()
      ) => {
        const reachable: Array<{
          entry: SupplyDemandEntry;
          plan: MovementPathPlan;
        }> = [];

        for (const demand of demands) {
          const entry = refreshDemand(demand);
          if (!entry || excludedUnitIds.has(entry.unit.unitId ?? '')) {
            continue;
          }

          const plan = buildPlanForEntry(entry);
          if (!plan) {
            continue;
          }

          reachable.push({ entry, plan });
        }

        if (reachable.length === 0) {
          return {
            entry: null as SupplyDemandEntry | null,
            plan: null as MovementPathPlan | null
          };
        }

        const highestPriority = Math.max(
          ...reachable.map(({ entry }) => this.getSupplyDemandPriorityRank(entry))
        );

        const topPriority = reachable.filter(
          ({ entry }) => this.getSupplyDemandPriorityRank(entry) === highestPriority
        );

        const chosenEntry =
          this.chooseBestSupplyTarget(
            faction,
            truck,
            truckState,
            topPriority.map(({ entry }) => entry)
          ) ?? topPriority[0].entry;

        const chosen =
          topPriority.find(
            ({ entry }) => entry.unit.unitId === chosenEntry.unit.unitId
          ) ?? topPriority[0];

        return {
          entry: chosen.entry,
          plan: chosen.plan
        };
      };

      const deliverToAssignedIfInRange = (
        entry: SupplyDemandEntry | null
      ): boolean => {
        if (!entry) {
          return false;
        }

        if (
          hexDistance(truck.hex, entry.unit.hex) >
          supplyBalance.convoy.serviceRadius
        ) {
          return false;
        }

        const assignedState = this.getSupplyStateForHex(faction, entry.unit.hex, entry.unit.unitId);
        if (!assignedState) {
          return false;
        }

        const delivered = this.deliverConvoyCargoToUnit(
          faction,
          truckState,
          entry.unit,
          assignedState,
          entry.definition
        );

        if (delivered) {
          this.recordConvoyService(faction, entry.unit.unitId);
        }

        entry.ammoNeed = Math.max(
          0,
          (entry.definition.ammo ?? 0) - assignedState.ammo
        );
        entry.fuelNeed = this.unitConsumesFuel(entry.definition)
          ? Math.max(0, (entry.definition.fuel ?? 0) - assignedState.fuel)
          : 0;

        entry.status = delivered
          ? entry.ammoNeed <= 0 && entry.fuelNeed <= 0
            ? "resupplied"
            : "delivering"
          : entry.status;

        if (entry.ammoNeed <= 0 && entry.fuelNeed <= 0) {
          truckState.assignedUnitId = null;
        }

        return delivered;
      };

      const advanceAlongPlan = (
        plan: MovementPathPlan
      ) => {
        let remainingMove = Math.max(1, truckDefinition.movement ?? 1);
        let fuelSpent = 0;
        let current = structuredClone(truck.hex);
        const traveled: Axial[] = [structuredClone(truck.hex)];

        for (let index = 1; index < plan.path.length; index += 1) {
          const step = plan.path[index];
          const stepCost = this.resolveMoveCost(
            truckDefinition.moveType,
            this.terrainAt(step),
            step,
            current
          );
          const stepFuel = this.resolveMovementFuelStep(
            truckDefinition.moveType,
            step
          );

          if (stepCost > remainingMove) {
            break;
          }
          if (
            Number.isFinite(availableFuel) &&
            fuelSpent + stepFuel > availableFuel + 1e-6
          ) {
            break;
          }
          if (this.isHexBlockedForConvoy(step, faction)) {
            break;
          }

          current = structuredClone(step);
          remainingMove -= stepCost;
          fuelSpent += stepFuel;
          traveled.push(structuredClone(step));
        }

        return { current, traveled, fuelSpent };
      };

      let assignedEntry = refreshDemand(
        demands.find((entry) => entry.unit.unitId === truckState.assignedUnitId) ??
          null
      );

      if (!assignedEntry) {
        truckState.assignedUnitId = null;
      }

      let assignedPlan = buildPlanForEntry(assignedEntry);

      // Blocked first: if the current assignment is not reachable, drop it now.
      if (assignedEntry && !assignedPlan) {
        assignedEntry = null;
        truckState.assignedUnitId = null;
      }

      // Then priority: among reachable targets, prefer the highest priority.
      if (hasCargo()) {
        const bestReachable = selectReachableTarget();

        if (!assignedEntry) {
          assignedEntry = bestReachable.entry;
          assignedPlan = bestReachable.plan;
          truckState.assignedUnitId = assignedEntry?.unit.unitId ?? null;
        } else if (
          bestReachable.entry &&
          this.shouldRotateConvoyAssignment(faction, assignedEntry, bestReachable.entry)
        ) {
          assignedEntry = bestReachable.entry;
          assignedPlan = bestReachable.plan;
          truckState.assignedUnitId = assignedEntry.unit.unitId ?? null;
        }
      }

      if (assignedEntry) {
        assignedEntry.assignmentCount += 1;
      }

      if (assignedEntry && deliverToAssignedIfInRange(assignedEntry)) {
        return;
      }

      let destinationOptions: Axial[] = [];
      let plan: MovementPathPlan | null = null;

      if (assignedEntry && hasCargo()) {
        destinationOptions = this.collectServiceHexes(
          assignedEntry.unit.hex,
          truck.hex,
          faction
        );
        truckState.status = "delivering";
        plan = assignedPlan;
      } else {
        destinationOptions = this.collectSourceApproachHexes(faction, truck.hex);
        truckState.assignedUnitId = null;
        truckState.status = atSource ? "idle" : "returning";
        plan = this.findCheapestPathToAny(
          truck.hex,
          destinationOptions,
          truckDefinition.moveType,
          occupied,
          Number.isFinite(availableFuel) ? availableFuel : undefined
        );
      }

      if ((!plan || plan.path.length <= 1) && assignedEntry && hasCargo()) {
        const fallback = selectReachableTarget(
          assignedEntry.unit.unitId ? new Set([assignedEntry.unit.unitId]) : new Set()
        );

        if (fallback.entry && fallback.plan) {
          assignedEntry = fallback.entry;
          plan = fallback.plan;
          truckState.assignedUnitId = assignedEntry.unit.unitId ?? null;
          truckState.status = "delivering";
        }
      }

      if (!plan || plan.path.length <= 1) {
        if (!atSource && destinationOptions.length > 0) {
          truckState.status = "blocked";
        }
        return;
      }

      let movement = advanceAlongPlan(
        plan as MovementPathPlan
      );

      // If the live board state blocks execution, immediately try another target.
      if (movement.traveled.length <= 1 && assignedEntry && hasCargo()) {
        const fallback = selectReachableTarget(
          assignedEntry.unit.unitId ? new Set([assignedEntry.unit.unitId]) : new Set()
        );

        if (fallback.entry && fallback.plan) {
          assignedEntry = fallback.entry;
          truckState.assignedUnitId = assignedEntry.unit.unitId ?? null;
          truckState.status = "delivering";
          movement = advanceAlongPlan(fallback.plan);
        }
      }

      if (movement.traveled.length <= 1) {
        if (assignedEntry) {
          truckState.assignedUnitId = null;
        }
        if (!atSource) {
          truckState.status = "blocked";
        }
        return;
      }

      const fromHex = structuredClone(truck.hex);
      const movedTruck = structuredClone(truck);
      movedTruck.facing = this.resolveFacingToward(
        truck.hex,
        movement.current,
        truck.facing
      );
      movedTruck.hex = structuredClone(movement.current);

      if (Number.isFinite(availableFuel) && movement.fuelSpent > 0) {
        movedTruck.fuel = Math.max(
          0,
          Number((movedTruck.fuel - movement.fuelSpent).toFixed(2))
        );
      }

      movedTruck.entrench = 0;
      this.removeUnitFromFactionHex(faction, fromHex, truckId);
      this.addUnitToFactionHex(faction, movedTruck);
      truck.facing = movedTruck.facing;
      truck.hex = structuredClone(movedTruck.hex);
      truck.fuel = movedTruck.fuel;
      truck.entrench = movedTruck.entrench;
      this.updateSupplyPositionForFaction(
        faction,
        fromHex,
        movement.current,
        truckId
      );
      this.syncFuelForFaction(faction, movement.current, truck.fuel, truckId);
      this.syncEntrenchForFaction(faction, movement.current, truck.entrench, truckId);

      if (this.isHexWithinSupplySourceRadius(truck.hex, faction)) {
        this.loadSupplyTruckFromDepot(
          faction,
          supplyState,
          truck,
          truckSupplyState,
          truckState
        );
      }

      if (assignedEntry) {
        deliverToAssignedIfInRange(assignedEntry);
      }
    }
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
  private readonly initialPlayerDepotStock: { ammo: number; fuel: number; rations: number; parts: number };
  /** Convoy cargo and assignment state tracked independently from the truck unit's onboard fuel. */
  private readonly supplyTruckStateByFaction: Record<TurnFaction, Map<string, SupplyTruckState>> = {
    Player: new Map(),
    Bot: new Map(),
    Ally: new Map()
  };
  /** Tracks convoy-service recency so equal-priority units can rotate fairly across turns. */
  private readonly convoyServiceHistoryByFaction: Record<TurnFaction, Map<string, number>> = {
    Player: new Map(),
    Bot: new Map(),
    Ally: new Map()
  };
  private convoyServiceSequenceByFaction: Record<TurnFaction, number> = {
    Player: 0,
    Bot: 0,
    Ally: 0
  };
  /** Optional player-configured resupply priorities keyed by the stable unit id. */
  private readonly supplyPriorityByUnitId = new Map<string, SupplyPriority>();
  /** Player-facing contact picture for enemy formations. Contacts persist briefly after LOS is lost. */
  private readonly playerEnemyContactStates = new Map<string, InternalEnemyContactState>();

  /** Overflow stacks beyond the primary placement map entry, keyed by hex. */
  private readonly playerPlacementOverflow = new Map<string, ScenarioUnit[]>();
  private readonly botPlacementOverflow = new Map<string, ScenarioUnit[]>();
  private readonly allyPlacementOverflow = new Map<string, ScenarioUnit[]>();
  /** Per-turn action flags keyed by stable unit id so stacked formations track actions independently. */
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

  /** Tracks which AA units have engaged aircraft this turn for rate limiting (one engagement per turn per unit). */
  private readonly aaEngagementsByUnitId = new Map<string, number>();

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

  private isTowableUnit(unitOrType: ScenarioUnit | UnitTypeDefinition | string): boolean {
    if (typeof unitOrType === "string") {
      return GameEngine.TOWABLE_UNIT_TYPES.has(unitOrType);
    }
    if ("type" in unitOrType) {
      return GameEngine.TOWABLE_UNIT_TYPES.has(unitOrType.type);
    }
    return false;
  }

  private resolveTowState(unit: ScenarioUnit): UnitTowState | null {
    if (!this.isTowableUnit(unit)) {
      return null;
    }
    return unit.towState === "towed" ? "towed" : "deployed";
  }

  private isRetaliationBlockedByTowState(unit: ScenarioUnit): boolean {
    return this.resolveTowState(unit) === "towed";
  }

  private buildTowStateRetaliationUnavailableNote(subject: string): string {
    return `${subject} is limbered and cannot return fire until deployed.`;
  }

  private resolveBaseMovementAllowance(
    definition: UnitTypeDefinition,
    flags: ReturnType<GameEngine["createDefaultActionFlags"]>
  ): number {
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

    return Math.max(0, adjustedMax);
  }

  private resolveTowHookupCost(
    definition: UnitTypeDefinition,
    flags: ReturnType<GameEngine["createDefaultActionFlags"]>
  ): number {
    return Math.max(1, Math.ceil(this.resolveBaseMovementAllowance(definition, flags) / 2));
  }

  private getPlacementOverflowMapForFaction(faction: TurnFaction): Map<string, ScenarioUnit[]> {
    if (faction === "Player") {
      return this.playerPlacementOverflow;
    }
    if (faction === "Bot") {
      return this.botPlacementOverflow;
    }
    return this.allyPlacementOverflow;
  }

  private getUnitsAtHexForFaction(hex: Axial, faction: TurnFaction): ScenarioUnit[] {
    const key = axialKey(hex);
    const placements = this.getPlacementMapForFaction(faction);
    const overflow = this.getPlacementOverflowMapForFaction(faction).get(key) ?? [];
    const primary = placements.get(key);
    return primary ? [primary, ...overflow] : [...overflow];
  }

  private setUnitsAtHexForFaction(hex: Axial, faction: TurnFaction, units: readonly ScenarioUnit[]): void {
    const key = axialKey(hex);
    const placements = this.getPlacementMapForFaction(faction);
    const overflowMap = this.getPlacementOverflowMapForFaction(faction);
    placements.delete(key);
    overflowMap.delete(key);
    if (units.length <= 0) {
      return;
    }
    placements.set(key, units[0]!);
    if (units.length > 1) {
      overflowMap.set(key, units.slice(1).map((unit) => structuredClone(unit)));
    }
  }

  private addUnitToFactionHex(faction: TurnFaction, unit: ScenarioUnit): void {
    const units = this.getUnitsAtHexForFaction(unit.hex, faction);
    units.push(unit);
    this.setUnitsAtHexForFaction(unit.hex, faction, units);
  }

  private getAllUnitsForFaction(faction: TurnFaction): ScenarioUnit[] {
    const placements = this.getPlacementMapForFaction(faction);
    const overflowMap = this.getPlacementOverflowMapForFaction(faction);
    const all: ScenarioUnit[] = [];
    placements.forEach((unit, key) => {
      all.push(unit);
      const overflow = overflowMap.get(key) ?? [];
      overflow.forEach((entry) => all.push(entry));
    });
    overflowMap.forEach((units, key) => {
      if (!placements.has(key)) {
        units.forEach((unit) => all.push(unit));
      }
    });
    return all;
  }

  private getActionFlagKey(unit: ScenarioUnit): string {
    return this.getSquadronId(unit);
  }

  private getUnitActionFlags(faction: TurnFaction, unit: ScenarioUnit): ReturnType<GameEngine["createDefaultActionFlags"]> {
    const key = this.getActionFlagKey(unit);
    if (faction === "Bot") {
      return this.botActionFlags.get(key) ?? this.createDefaultActionFlags();
    }
    if (faction === "Player") {
      return this.playerActionFlags.get(key) ?? this.createDefaultActionFlags();
    }
    return this.createDefaultActionFlags();
  }

  private setUnitActionFlags(
    faction: TurnFaction,
    unit: ScenarioUnit,
    flags: ReturnType<GameEngine["createDefaultActionFlags"]>
  ): void {
    const key = this.getActionFlagKey(unit);
    if (faction === "Bot") {
      this.botActionFlags.set(key, flags);
      return;
    }
    if (faction === "Player") {
      this.playerActionFlags.set(key, flags);
    }
  }

  private deleteUnitActionFlags(faction: TurnFaction, unit: ScenarioUnit): void {
    const key = this.getActionFlagKey(unit);
    if (faction === "Bot") {
      this.botActionFlags.delete(key);
      return;
    }
    if (faction === "Player") {
      this.playerActionFlags.delete(key);
    }
  }

  private buildCoalitionHexMembers(hex: Axial, faction: TurnFaction): HexUnitStackMember[] {
    const members: HexUnitStackMember[] = [];
    const pushFaction = (candidateFaction: TurnFaction): void => {
      this.getUnitsAtHexForFaction(hex, candidateFaction).forEach((unit) => {
        members.push({
          unitId: this.ensureUnitId(unit),
          unit,
          faction: candidateFaction,
          isAutomated: candidateFaction === "Player" && this.isAutomatedPlayerUnit(unit)
        });
      });
    };

    if (faction === "Player" || faction === "Ally") {
      pushFaction("Player");
      pushFaction("Ally");
      return members;
    }

    pushFaction("Bot");
    return members;
  }

  private getHostileUnitsAtHex(hex: Axial, attackerFaction: TurnFaction): HexUnitStackMember[] {
    if (attackerFaction === "Bot") {
      return [
        ...this.getUnitsAtHexForFaction(hex, "Player").map((unit) => ({
          unitId: this.ensureUnitId(unit),
          unit,
          faction: "Player" as TurnFaction,
          isAutomated: false
        })),
        ...this.getUnitsAtHexForFaction(hex, "Ally").map((unit) => ({
          unitId: this.ensureUnitId(unit),
          unit,
          faction: "Ally" as TurnFaction,
          isAutomated: false
        }))
      ];
    }

    return this.getUnitsAtHexForFaction(hex, "Bot").map((unit) => ({
      unitId: this.ensureUnitId(unit),
      unit,
      faction: "Bot" as TurnFaction,
      isAutomated: false
    }));
  }

  private isStackCountedUnit(unit: ScenarioUnit): boolean {
    return !this.isSupplyTruckType(unit.type);
  }

  private countStackedCombatUnitsAtHex(hex: Axial, faction: TurnFaction): number {
    return this.buildCoalitionHexMembers(hex, faction).filter((entry) => this.isStackCountedUnit(entry.unit)).length;
  }

  private canFactionEnterHex(unit: ScenarioUnit, faction: TurnFaction, hex: Axial): boolean {
    const hostile = this.getHostileUnitsAtHex(hex, faction);
    if (hostile.length > 0) {
      return false;
    }
    if (!this.isStackCountedUnit(unit)) {
      return true;
    }
    return this.countStackedCombatUnitsAtHex(hex, faction) < 2;
  }

  private findUnitInFactionAtHex(hex: Axial, faction: TurnFaction, unitId?: string | null): ScenarioUnit | null {
    const units = this.getUnitsAtHexForFaction(hex, faction);
    if (units.length === 0) {
      return null;
    }
    if (unitId) {
      return units.find((candidate) => this.getSquadronId(candidate) === unitId) ?? null;
    }
    return units[0] ?? null;
  }

  private replaceUnitInFactionHex(faction: TurnFaction, unit: ScenarioUnit): boolean {
    const unitId = this.getSquadronId(unit);
    const units = this.getUnitsAtHexForFaction(unit.hex, faction);
    const index = units.findIndex((candidate) => this.getSquadronId(candidate) === unitId);
    if (index < 0) {
      return false;
    }
    units[index] = structuredClone(unit);
    this.setUnitsAtHexForFaction(unit.hex, faction, units);
    return true;
  }

  private removeUnitFromFactionHex(faction: TurnFaction, hex: Axial, unitId?: string | null): ScenarioUnit | null {
    const units = this.getUnitsAtHexForFaction(hex, faction);
    if (units.length === 0) {
      return null;
    }
    const removalIndex = unitId
      ? units.findIndex((candidate) => this.getSquadronId(candidate) === unitId)
      : 0;
    if (removalIndex < 0) {
      return null;
    }
    const [removed] = units.splice(removalIndex, 1);
    this.setUnitsAtHexForFaction(hex, faction, units);
    return removed ? structuredClone(removed) : null;
  }

  private updateIdleRegistryFor(hexKey: string): void {
    const hex = this.parseAxialKey(hexKey);
    if (!hex) {
      this.playerIdleUnitKeys.delete(hexKey);
      return;
    }
    const units = this.getUnitsAtHexForFaction(hex, "Player").filter((unit) => this.shouldTrackAsPlayerIdle(unit));
    if (units.some((unit) => {
      const flags = this.getUnitActionFlags("Player", unit);
      return flags.movementPointsUsed === 0 && flags.attacksUsed === 0 && !unit.onSentry;
    })) {
      this.playerIdleUnitKeys.add(hexKey);
    } else {
      this.playerIdleUnitKeys.delete(hexKey);
    }
  }

  private rebuildPlayerIdleUnitSet(): void {
    this.playerIdleUnitKeys.clear();
    const visited = new Set<string>();
    this.getAllUnitsForFaction("Player").forEach((unit) => {
      const key = axialKey(unit.hex);
      if (visited.has(key)) {
        return;
      }
      visited.add(key);
      if (!this.shouldTrackAsPlayerIdle(unit)) {
        this.updateIdleRegistryFor(key);
        return;
      }
      this.updateIdleRegistryFor(key);
    });
  }

  /** Clear suppression status for units of the given faction at the start of their turn. */
  private clearSuppressionFor(faction: TurnFaction): void {
    let clearedCount = 0;

    this.getAllUnitsForFaction(faction).forEach((unit) => {
      if (unit.suppressedBy && unit.suppressedBy.length > 0) {
        console.log(`[GameEngine] Clearing suppression for ${faction} unit ${unit.type} at ${axialKey(unit.hex)}, was suppressed by:`, unit.suppressedBy);
        unit.suppressedBy = [];
        this.replaceUnitInFactionHex(faction, unit);
        clearedCount++;
      }
    });

    if (clearedCount > 0) {
      console.log(`[GameEngine] *** CLEARED SUPPRESSION *** for ${clearedCount} ${faction} units`);
    }
  }

  /** Clear sentry stance for units of the given faction at the start of their next activation. */
  private clearSentryFor(faction: TurnFaction): void {
    this.getAllUnitsForFaction(faction).forEach((unit) => {
      if (unit.onSentry) {
        unit.onSentry = false;
        this.replaceUnitInFactionHex(faction, unit);
      }
    });
  }

  private reconcilePlayerIdleUnitSet(): void {
    for (const key of Array.from(this.playerIdleUnitKeys)) {
      const hex = this.parseAxialKey(key);
      if (!hex || this.getUnitsAtHexForFaction(hex, "Player").length === 0) {
        this.playerIdleUnitKeys.delete(key);
        continue;
      }
      const activeUnits = this.getUnitsAtHexForFaction(hex, "Player").filter((unit) => this.shouldTrackAsPlayerIdle(unit));
      if (!activeUnits.some((unit) => {
        const flags = this.getUnitActionFlags("Player", unit);
        return flags.movementPointsUsed === 0 && flags.attacksUsed === 0 && !unit.onSentry;
      })) {
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
    this.initialPlayerDepotStock = {
      ammo: Math.max(0, Math.round(config.initialPlayerDepotStock?.ammo ?? 0)),
      fuel: Math.max(0, Math.round(config.initialPlayerDepotStock?.fuel ?? 0)),
      rations: Math.max(0, Math.round(config.initialPlayerDepotStock?.rations ?? 0)),
      parts: Math.max(0, Math.round(config.initialPlayerDepotStock?.parts ?? 0))
    };
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
    (this.playerSide.units ?? []).forEach((unit) => this.ensureUnitId(unit));
    (this.botSide.units ?? []).forEach((unit) => this.ensureUnitId(unit));
    (this.allySide?.units ?? []).forEach((unit) => this.ensureUnitId(unit));
    this.playerSupply = createSupplyUnits(this.playerSide.units ?? []);
    this.botSupply = createSupplyUnits(this.botSide.units ?? []);
    this.allySupply = createSupplyUnits(this.allySide?.units ?? []);
    this.rebuildSupplyStates();
    (this.botSide.units ?? []).forEach((unit) => {
      const clone = structuredClone(unit);
      // Assign a stable unique ID to each bot unit so air squadrons can be distinguished.
      this.ensureUnitId(clone);
      this.addUnitToFactionHex("Bot", clone);
    });
    // Seed ally placements if ally side is present. Ally units are always predeployed.
    if (this.allySide) {
      (this.allySide.units ?? []).forEach((unit) => {
        const clone = structuredClone(unit);
        this.ensureUnitId(clone);
        this.addUnitToFactionHex("Ally", clone);
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
        queuedHex: null,
        queuedByHex: null
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
        queuedHex: null,
        queuedByHex: null
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
        queuedHex: null,
        queuedByHex: null
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

    // Try to find a matching reserve
    const index = this.reserves.findIndex((reserve) => {
      // First, try exact allocationKey match
      if (reserve.allocationKey === unitKey) {
        return true;
      }
      // Then try scenario type lookup
      if (scenarioType && reserve.unit.type === scenarioType) {
        return true;
      }
      // Finally, try reverse lookup - if the reserve's scenario type maps back to this unitKey
      const reserveUnitKey = deploymentState.getUnitKeyForScenarioType(reserve.unit.type);
      if (reserveUnitKey === unitKey) {
        return true;
      }
      return false;
    });

    // If not found, log details for debugging
    if (index < 0) {
      console.warn("[GameEngine] findReserveIndexByUnitKey failed", {
        unitKey,
        scenarioType,
        availableReserves: this.reserves.map((r, i) => ({
          index: i,
          allocationKey: r.allocationKey,
          scenarioType: r.unit.type,
          mappedKey: deploymentState.getUnitKeyForScenarioType(r.unit.type)
        }))
      });
    }

    return index;
  }

  /**
   * Shared deployment write-path used by deployUnit() and deployUnitByKey() once the reserve entry has been resolved.
   */
  private commitDeployment(hex: Axial, entry: ReserveUnit): void {
    const key = axialKey(hex);
    const clone = structuredClone(entry.unit);
    clone.hex = structuredClone(hex);
    this.ensureUnitId(clone);
    if (!this.canFactionEnterHex(clone, "Player", hex)) {
      throw new Error(`Hex ${this.formatAxial(hex)} cannot accept another deployed unit.`);
    }
    const deploymentState = ensureDeploymentState();
    const allocationKey = entry.allocationKey ?? deploymentState.getUnitKeyForScenarioType(clone.type as string);
    if (allocationKey) {
      const sprite = entry.sprite ?? deploymentState.getSpritePath(allocationKey);
      if (sprite) {
        deploymentState.registerSprite(allocationKey, sprite);
      }
    }
    this.addUnitToFactionHex("Player", clone);
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
        facing: normalizeFacingDirection(allocation.facing)
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
    return this.getAllUnitsForFaction("Player").map((unit) => structuredClone(unit));
  }

  /**
   * Surfaces bot deployments with defensive copies for dashboards and debugging tools that render AI assets.
   */
  get botUnits(): ScenarioUnit[] {
    return this.getAllUnitsForFaction("Bot").map((unit) => structuredClone(unit));
  }

  /**
   * Surfaces ally deployments with defensive copies. Ally units are AI-controlled but can be transferred to player control.
   */
  get allyUnits(): ScenarioUnit[] {
    return this.getAllUnitsForFaction("Ally").map((unit) => structuredClone(unit));
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

    const contactHex = currentlyObserved && liveLookup ? liveLookup.unit.hex : entry.lastKnownHex;
    const contactHexKey = axialKey(contactHex);
    // Friendly occupation always outranks stale contact memory. If our troops now hold the hex, do not
    // surface a phantom enemy marker there or the UI will paint the contact over the player unit.
    if (this.playerPlacements.has(contactHexKey) || this.allyPlacements.has(contactHexKey)) {
      return null;
    }

    const state: EnemyContactState = currentlyObserved ? entry.state : "spotted";
    const strengthSource = currentlyObserved ? liveLookup?.unit.strength ?? entry.lastKnownStrength : entry.lastKnownStrength;
    const strengthEstimate = this.resolveEnemyContactStrengthEstimate(state, strengthSource);

    return {
      unitId: entry.unitId,
      hex: structuredClone(contactHex),
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
        lister,
        purpose: "spotting"
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
        facing: "NW"
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
      queuedHex: asset.queuedHex,
      queuedByHex: asset.queuedByHex
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
    asset.queuedByHex = null;
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
    const halfMovement = Math.floor(callerDefinition.movement / 2);
    if (flags.attacksUsed > 0 || flags.movementPointsUsed > halfMovement) {
      return false;
    }
    const asset = this.getInternalSupportAsset(assetId);
    if (asset.status !== "ready" || asset.charges <= 0) {
      return false;
    }
    asset.queuedHex = axialKey(targetHex);
    asset.queuedByHex = callerKey;
    asset.status = "queued";
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
  getAircraftCombatRadiusHex(origin: Axial, unitId?: string | null): number | null {
    const unit = unitId
      ? this.lookupUnitBySquadronId(unitId, this._activeFaction)?.unit ?? this.lookupUnit(origin, this._activeFaction, true, unitId)
      : this.lookupUnit(origin, this._activeFaction, true, unitId);
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
  getAircraftRefitTurns(origin: Axial, unitId?: string | null): number | null {
    const unit = unitId
      ? this.lookupUnitBySquadronId(unitId, this._activeFaction)?.unit ?? this.lookupUnit(origin, this._activeFaction, true, unitId)
      : this.lookupUnit(origin, this._activeFaction, true, unitId);
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
    const requestedUnitId = request.unitId?.trim() ? request.unitId.trim() : null;
    let launchHex = structuredClone(request.unitHex);
    const originCandidates = requestedUnitId
      ? (() => {
          const lookup = this.lookupUnitBySquadronId(requestedUnitId, request.faction);
          if (!lookup) {
            return [] as ScenarioUnit[];
          }
          launchHex = structuredClone(lookup.unit.hex);
          return [lookup.unit];
        })()
      : this.getUnitsAtHexForFaction(request.unitHex, request.faction);
    const originKey = axialKey(launchHex);
    let unit: ScenarioUnit | null = null;

    // Collect candidate units at this origin: deployed first, then (for the player) matching reserves.
    const candidates: ScenarioUnit[] = [...originCandidates];
    if (request.faction === "Player" && !requestedUnitId) {
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
    const originHexKey = axialKey(launchHex);

    if (template.requiresTarget && !request.targetHex) {
      return { ok: false, code: "TARGET_REQUIRED", reason: "This mission requires selecting a target hex." };
    }
    if (template.requiresFriendlyEscortTarget && !request.escortTargetHex && !request.escortTargetUnitId) {
      return { ok: false, code: "ESCORT_TARGET_REQUIRED", reason: "Escort missions require pairing with a friendly unit." };
    }
    if (request.targetHex && unitDefinition.airSupport) {
      try {
        this.assertAirMissionRange(unitDefinition.airSupport, launchHex, request.targetHex);
      } catch (e) {
        return { ok: false, code: "OUT_OF_RANGE", reason: (e as Error).message };
      }
    }

    // Escort guardrails: target must exist and not already be in-flight.
    let escortTargetUnitKey: string | undefined;
    if (request.escortTargetHex || request.escortTargetUnitId) {
      const escortTargetUnit = request.escortTargetUnitId
        ? this.lookupUnitBySquadronId(request.escortTargetUnitId, request.faction)?.unit ?? null
        : this.lookupUnit(request.escortTargetHex!, request.faction, true);
      if (!escortTargetUnit) {
        return { ok: false, code: "ESCORT_TARGET_MISSING", reason: "Escort target unit was not found at the selected hex." };
      }
      try {
        this.assertEscortDistance(unitDefinition.airSupport, launchHex, escortTargetUnit.hex);
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
      interceptions: 0,
      airCombatDamageInflicted: 0,
      airCombatDamageTaken: 0,
      airCombatKills: 0
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
  cancelQueuedSupport(assetId: string): boolean {
    const asset = this.getInternalSupportAsset(assetId);
    if (asset.status !== "queued") {
      return false;
    }
    asset.queuedHex = null;
    asset.queuedByHex = null;
    if (asset.cooldown > 0) {
      asset.status = "cooldown";
    } else if (asset.charges > 0) {
      asset.status = "ready";
    } else {
      asset.status = "maintenance";
    }
    this.invalidateSupportSnapshot();
    this.invalidateRosterCache();
    return true;
  }

  private resolveQueuedSupportActions(): void {
    const queuedAssets = Array.from(this.privateSupportAssets.values()).filter(
      (a) => a.status === "queued" && a.queuedHex
    );
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
      asset.queuedByHex = null;
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
        message: `Counter-intelligence screen active near ${this.formatAxial(focus.targetHex)}. Enemy maneuver estimates are being pulled off-axis.`,
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
      label: `Deception Screen ${this.formatAxial(operation.targetHex)}`,
      targetHex: this.formatAxial(operation.targetHex),
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
    this.playerPlacementOverflow.clear();
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
          this.addUnitToFactionHex("Player", unit);
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
        this.addUnitToFactionHex("Player", clone);
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

    this.playerPlacementOverflow.clear();
    this.botPlacementOverflow.clear();
    this.allyPlacementOverflow.clear();

    state.playerPlacements.forEach((unit) => {
      const clone = structuredClone(unit);
      // Preserve existing unitId from saved state or assign a new one if missing (legacy saves).
      this.ensureUnitId(clone);
      this.addUnitToFactionHex("Player", clone);
    });
    state.botPlacements.forEach((unit) => {
      const clone = structuredClone(unit);
      // Preserve existing unitId from saved state or assign a new one if missing (legacy saves).
      this.ensureUnitId(clone);
      this.addUnitToFactionHex("Bot", clone);
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
        const key = axialKey(clone.hex);
        const bucket = this.hexModifications.get(key) ?? [];
        bucket.push(clone);
        this.hexModifications.set(key, bucket);
      });
    }

    this._phase = state.phase;
    this._activeFaction = state.activeFaction;
    this._turnNumber = state.turnNumber;
    this._baseCamp = state.baseCamp
      ? { hex: structuredClone(state.baseCamp.hex), key: state.baseCamp.key }
      : null;

    this.playerSupply = createSupplyUnits(this.getAllUnitsForFaction("Player"));
    this.botSupply = createSupplyUnits(this.getAllUnitsForFaction("Bot"));
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
    // Restore AA engagement counters
    if (Array.isArray(state.aaEngagements)) {
      state.aaEngagements.forEach((entry) => {
        this.aaEngagementsByUnitId.set(entry.unitKey, entry.count);
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
    this.playerSupply = createSupplyUnits(this.getAllUnitsForFaction("Player"));
    this.botSupply = createSupplyUnits(this.getAllUnitsForFaction("Bot"));
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
    this.clearFlakEngagementsFor("Player");
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
    const placement = structuredClone(entry.unit);
    placement.hex = structuredClone(hex);
    this.ensureUnitId(placement);
    if (!this.canFactionEnterHex(placement, "Player", hex)) {
      throw new Error("Target hex cannot accept another reserve unit.");
    }
    this.addUnitToFactionHex("Player", placement);
    this.updateIdleRegistryFor(key);
    this.playerSupply.push({
      hex: structuredClone(hex),
      unitId: placement.unitId,
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
      // Player logistics resolve before the ally/bot acts so ledgers and alerts update immediately.
      const playerSupplyReport = this.applySupplyTickFor("Player");
      this.resolveQueuedSupportActions();

      // If allies are present, run their turn next.
      if (this.allySide && this.allyPlacements.size > 0) {
        this._phase = "allyTurn";
        this._activeFaction = "Ally";
        this.clearSuppressionFor("Ally");
        this.clearSentryFor("Ally");
        this.stepAirMissionsForFaction("Ally");
        this.advanceAirMissionRefits("Ally");
        this.applySupplyTickFor("Ally");
        this.executeHeuristicAllyTurn();
      }

      // Ally (if any) complete → Bot turn. Execute bot logic immediately before UI refresh.
      this._phase = "botTurn";
      this._activeFaction = "Bot";
      this.botActionFlags.clear();
      this.clearFlakEngagementsFor("Bot");
      this.clearSuppressionFor("Bot");
      this.clearSentryFor("Bot");
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
      this.clearFlakEngagementsFor("Player");
      this.clearSuppressionFor("Player");
      this.clearSentryFor("Player");
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
      this.clearSentryFor("Player");
      this.rebuildPlayerIdleUnitSet();
      this.refreshAircraftAmmoForFaction("Player");
      return this.applySupplyTickFor("Player");
    }

    return this.applySupplyTickFor(this._activeFaction);
  }

  /** Prepare combat preview by building the standardized request object and invoking `resolveAttack()`. */
  previewAttack(attackerHex: Axial, defenderHex: Axial, stance?: CombatStance, attackerUnitId?: string, defenderUnitId?: string): CombatPreview | null {
    const attacker = this.lookupUnit(attackerHex, "Player", false, attackerUnitId);
    const defenders = this.getHostileUnitsAtHex(defenderHex, "Player");
    const primaryDefenderMember = defenderUnitId
      ? defenders.find((entry) => entry.unitId === defenderUnitId) ?? defenders[0]
      : defenders[0];
    const defender = primaryDefenderMember?.unit ?? null;
    if (!attacker || !defender || !this.getPlayerEnemyContactStateAtHex(defenderHex)) {
      return null;
    }
    const attackerDef = this.getUnitDefinition(attacker.type);
    const effectiveStance = this.resolveCombatStanceForAttacker(attacker, attackerDef, stance);

    const defenderEntries = defenders.length > 0 ? defenders : [{ unitId: this.getSquadronId(defender), unit: defender, faction: "Bot" as TurnFaction, isAutomated: false }];
    const targetRichEntries: CombatPreviewTargetRichEntry[] = [];
    let aggregateAttackResult: AttackResult | null = null;
    let primaryRetaliationPreview: { expectedDamage: number; possible: boolean; note?: string } | null = null;
    let totalExpectedDamage = 0;
    let totalExpectedSuppression = 0;
    let totalExpectedRetaliation = 0;

    for (const entry of defenderEntries) {
      const request = this.buildAttackRequest(attacker, entry.unit, "Player", entry.faction, { stance: effectiveStance });
      if (!request) {
        continue;
      }
      const attackResult = resolveAttack(request);
      const entryDef = this.getUnitDefinition(entry.unit.type);
      const attackerIsAircraft = this.isAircraft(attackerDef);
      const attackerIsBomber = this.isBomber(attackerDef);
      const defenderIsAircraft = this.isAircraft(entryDef);

      let damageMultiplier = 1;
      let suppressionMultiplier = 1;
      if (attackerIsBomber && !defenderIsAircraft) {
        damageMultiplier = 10;
        suppressionMultiplier = 10;
      } else if (attackerIsAircraft && !attackerIsBomber && defenderIsAircraft) {
        damageMultiplier = 4;
        suppressionMultiplier = 4;
      }

      const finalExpectedDamage = attackResult.expectedDamage * damageMultiplier;
      const finalExpectedSuppression = attackResult.expectedSuppression * suppressionMultiplier;
      totalExpectedDamage += finalExpectedDamage;
      totalExpectedSuppression += finalExpectedSuppression;

      const projectedDefenderLoss = Math.max(
        0,
        attackerIsBomber && !defenderIsAircraft
          ? Math.ceil(finalExpectedDamage)
          : Math.round(finalExpectedDamage)
      );
      const projectedDefender = structuredClone(entry.unit);
      projectedDefender.strength = Math.max(0, projectedDefender.strength - projectedDefenderLoss);
      const retaliationPreview = this.previewRetaliationForPlayerAttack(
        attacker,
        attackerHex,
        attackerDef,
        entry.unit,
        projectedDefender,
        defenderHex,
        entryDef,
        effectiveStance,
        entry.faction
      );
      totalExpectedRetaliation += retaliationPreview.expectedDamage;
      targetRichEntries.push({
        unitId: entry.unitId,
        unit: structuredClone(entry.unit),
        expectedDamage: finalExpectedDamage,
        expectedRetaliation: retaliationPreview.expectedDamage,
        retaliationPossible: retaliationPreview.possible,
        retaliationNote: retaliationPreview.note
      });

      if (entry.unitId === primaryDefenderMember.unitId) {
        aggregateAttackResult = {
          ...attackResult,
          expectedDamage: finalExpectedDamage,
          expectedSuppression: finalExpectedSuppression,
          damagePerHit: attackResult.damagePerHit * damageMultiplier
        };
        primaryRetaliationPreview = retaliationPreview;
      }
    }

    if (!aggregateAttackResult || !primaryRetaliationPreview) {
      return null;
    }

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

    const finalDamagePerHit = aggregateAttackResult.damagePerHit * damageMultiplier;
    // Clamp expected damage to defender's remaining strength so preview shows realistic values
    const rawExpectedDamage = aggregateAttackResult.expectedDamage;
    const finalExpectedDamage = Math.min(rawExpectedDamage, defender.strength);
    const finalExpectedSuppression = totalExpectedSuppression;
    const projectedDefenderLoss = Math.max(
      0,
      attackerIsBomber && !defenderIsAircraft
        ? Math.ceil(finalExpectedDamage)
        : Math.round(finalExpectedDamage)
    );

    console.log("[GameEngine] *** PREVIEW CALCULATION DEBUG ***", {
      attackerType: attacker.type,
      attackerStrength: attacker.strength,
      defenderType: defender.type,
      defenderStrength: defender.strength,
      attackResultExpectedDamage: aggregateAttackResult.expectedDamage,
      attackResultShots: aggregateAttackResult.shots,
      attackResultDamagePerHit: aggregateAttackResult.damagePerHit,
      attackResultExpectedHits: aggregateAttackResult.expectedHits,
      attackResultAccuracy: aggregateAttackResult.accuracy,
      damageMultiplier,
      finalExpectedDamage,
      projectedDefenderLoss,
      isBomber: attackerIsBomber,
      isAircraft: attackerIsAircraft
    });

    return {
      attacker: structuredClone(attacker),
      defender: structuredClone(defender),
      result: aggregateAttackResult,
      commander: this.getCommanderBenefits(),
      damageMultiplier,
      suppressionMultiplier,
      finalDamagePerHit,
      finalExpectedDamage,
      finalExpectedSuppression,
      expectedRetaliation: primaryRetaliationPreview.expectedDamage,
      retaliationPossible: primaryRetaliationPreview.possible,
      retaliationNote: primaryRetaliationPreview.note,
      targetRich: targetRichEntries.length > 1,
      targetRichDefenders: targetRichEntries,
      totalExpectedDamage,
      totalExpectedRetaliation
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
    originalDefender: ScenarioUnit,
    projectedDefender: ScenarioUnit,
    defenderHex: Axial,
    defenderDef: UnitTypeDefinition,
    effectiveStance: CombatStance | undefined,
    defenderFaction: TurnFaction = "Bot"
  ): { expectedDamage: number; possible: boolean; note?: string } {
    const simultaneousFire = originalDefender.onSentry === true;
    const noteFor = (message: string): string =>
      simultaneousFire
        ? `Target is on sentry, but ${message.charAt(0).toLowerCase()}${message.slice(1)}`
        : message;
    const attackerIsAircraft = this.isAircraft(attackerDef);
    const defenderIsAircraft = this.isAircraft(defenderDef);
    const defenderIsBomber = this.isBomber(defenderDef);
    const defenderKey = axialKey(defenderHex);
    const defenderGroundAmmoCost = defenderIsAircraft ? 0 : this.resolveGroundAttackAmmoCost(defenderDef);
    const retaliationDefender = structuredClone(simultaneousFire ? originalDefender : projectedDefender);
    retaliationDefender.onSentry = false;

    if (retaliationDefender.strength <= 0) {
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
        note: noteFor("Ground units cannot retaliate against fast-moving aircraft.")
      };
    }

    if (this.resolveUnitSuppressionState(retaliationDefender).state === "pinned") {
      return {
        expectedDamage: 0,
        possible: false,
        note: noteFor("Target is pinned and cannot return fire.")
      };
    }

    if (this.isRetaliationBlockedByTowState(retaliationDefender)) {
      return {
        expectedDamage: 0,
        possible: false,
        note: noteFor(this.buildTowStateRetaliationUnavailableNote("Target"))
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
        note: noteFor("Target is out of return-fire range.")
      };
    }

    const defenderFlags = defenderFaction === "Bot"
      ? this.getUnitActionFlags("Bot", retaliationDefender)
      : this.getUnitActionFlags("Player", retaliationDefender);
    if (defenderFlags.retaliationsUsed >= combatBalance.counterfire.maxRetaliationsPerTurn) {
      return {
        expectedDamage: 0,
        possible: false,
        note: noteFor("Target has already used all available retaliations this turn.")
      };
    }

    if (defenderIsAircraft) {
      const defenderAmmoState = this.getAircraftAmmoState(defenderFaction, this.getSquadronId(retaliationDefender), defenderDef);
      if (this.aircraftNeedsRearm(defenderFaction, this.getSquadronId(retaliationDefender))) {
        return {
          expectedDamage: 0,
          possible: false,
          note: noteFor("Enemy aircraft must rearm before it can retaliate.")
        };
      }
      if (defenderAmmoState.air <= 0) {
        return {
          expectedDamage: 0,
          possible: false,
          note: noteFor("Enemy aircraft has no interception ammo remaining.")
        };
      }
    } else {
      const defenderAmmo = typeof retaliationDefender.ammo === "number" ? retaliationDefender.ammo : null;
      if (defenderAmmo !== null && defenderAmmo < defenderGroundAmmoCost) {
        return {
          expectedDamage: 0,
          possible: false,
          note: noteFor(defenderGroundAmmoCost > 1
            ? `Enemy unit lacks the ${defenderGroundAmmoCost.toFixed(0)} ammo needed to return indirect fire.`
            : "Enemy unit has no ammunition remaining to retaliate.")
        };
      }
    }

    const retaliationReq = this.buildAttackRequest(retaliationDefender, attacker, defenderFaction, "Player", {
      allowBomberAirAttack: true,
      stance: effectiveStance === "assault" ? "assault" : undefined
    });
    if (!retaliationReq) {
      return {
        expectedDamage: 0,
        possible: false,
        note: noteFor("Target lacks line of fire for retaliation.")
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
      possible: true,
      note: simultaneousFire ? "Target is on sentry and will return fire simultaneously." : undefined
    };
  }

  /**
   * Normalizes terrain move costs so the rest of the engine can treat air movement as a flat cost per hex.
   * Airframes ignore ground terrain entirely, while ground units fall back to terrain-specific tables.
   * Ford features override river impassability for ground units.
   * Road surfaces and engineer works then reshape the final price paid to cross that hex.
   */
  private resolveMoveCost(moveType: string, terrain: TerrainDefinition | null, hex?: Axial, fromHex?: Axial): number {
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
          return 2; // Infantry can cross fords at normal speed
        } else if (moveType === "track") {
          return 3;
        } else if (moveType === "wheel") {
          return 3; // Wheeled vehicles can use prepared fords
        }
      }
      if (features.includes("shallow")) {
        if (moveType === "leg") {
          return 2; // Infantry can cross shallow water at normal speed
        } else if (moveType === "track") {
          return 3;
        } else if (moveType === "wheel") {
          return 999; // Wheeled vehicles can't ford unprepared shallow crossings
        }
      }
    }

    if (hex) {
      const roadCost = this.resolveRoadMoveCost(moveType);
      if (roadCost !== null && this.isRoad(hex)) {
        cost = Math.min(cost, roadCost);
      }

      cost = this.resolveClearedPathMoveCost(moveType, cost, hex);

      // Tank traps completely block tracked and wheeled vehicles (must be cleared by engineers).
      if ((moveType === "track" || moveType === "wheel") && fromHex && this.hasTankTrapAcrossEdge(fromHex, hex)) {
        cost = 999;
      }
    }

    return cost;
  }

  private resolveRoadMoveCost(moveType: string): number | null {
    if (moveType === "air") {
      return 1;
    }
    const roadDefinition = (this.terrain.road ?? null) as TerrainDefinition | null;
    if (!roadDefinition) {
      return null;
    }
    const roadCost = roadDefinition.moveCost[moveType as keyof TerrainDefinition["moveCost"]];
    return typeof roadCost === "number" ? roadCost : null;
  }

  private resolveClearedPathMoveCost(moveType: string, baseCost: number, hex: Axial): number {
    const clearPathLevel = this.getHexModificationLevel(hex, "clearedPath");
    if (clearPathLevel <= 0) {
      return baseCost;
    }
    const roadCost = this.resolveRoadMoveCost(moveType);
    if (roadCost === null) {
      return baseCost;
    }

    const normalizedBase = baseCost >= 999
      ? Math.max(roadCost + 4.5, 5)
      : baseCost;
    const stepShare = Math.max(0, Math.min(3, clearPathLevel)) / 3;
    const blended = normalizedBase + (roadCost - normalizedBase) * stepShare;
    return Math.max(roadCost, Number(blended.toFixed(2)));
  }

  private getHexModificationLevel(hex: Axial, type: HexModificationType): number {
    return this.getHexModifications(hex).reduce((highest, modification) => {
      if (modification.type !== type) {
        return highest;
      }
      return Math.max(highest, modification.level ?? 1);
    }, 0);
  }

  private resolveCrossedHexEdge(from: Axial, to: Axial): HexEdgeFacing {
    return normalizeFacingDirection(this.resolveFacingToward(to, from), "NW");
  }

  private hasEdgeModification(hex: Axial, type: HexModificationType, facing: HexEdgeFacing): boolean {
    return this.getHexModifications(hex).some((modification) => (
      modification.type === type &&
      this.normalizeHexEdgeFacing(modification.facing) === facing
    ));
  }

  private hasTankTrapAcrossEdge(fromHex: Axial, toHex: Axial): boolean {
    const enteringFacing = this.resolveCrossedHexEdge(fromHex, toHex);
    const exitingFacing = this.resolveCrossedHexEdge(toHex, fromHex);

    // Check if tank trap exists on either side of the edge
    const hasTrapAtTo = this.hasEdgeModification(toHex, "tankTraps", enteringFacing);
    const hasTrapAtFrom = this.hasEdgeModification(fromHex, "tankTraps", exitingFacing);

    // If no trap, no blockage
    if (!hasTrapAtTo && !hasTrapAtFrom) {
      return false;
    }

    // Check if engineers have cleared a path through the trap
    const hasClearedPathAtTo = this.hasEdgeModification(toHex, "clearedPath", enteringFacing);
    const hasClearedPathAtFrom = this.hasEdgeModification(fromHex, "clearedPath", exitingFacing);

    // Tank trap blocks unless cleared on the same edge
    return (hasTrapAtTo && !hasClearedPathAtTo) || (hasTrapAtFrom && !hasClearedPathAtFrom);
  }

  /**
   * Returns the features array for the tile at the given hex.
   */
  private getTileFeaturesAt(hex: Axial): readonly string[] {
    return this.lookupTileDetails(hex)?.features ?? [];
  }

  /**
   * Derives the effective movement budget for the unit stationed at the given origin.
   * The summary respects commander bonuses, rush mode, and attack penalties so UI layers
   * can show remaining steps without reimplementing engine math.
   */
  private resolveMovementContext(origin: Axial, unitId?: string): {
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

    const unit = this.lookupUnit(origin, "Player", false, unitId);
    if (!unit) {
      return null;
    }
    if (this.isAutomatedPlayerUnit(unit)) {
      return null;
    }
    const definition = this.getUnitDefinition(unit.type);
    const moveType = definition.moveType ?? "track";
    const flags = this.getUnitActionFlags("Player", unit);

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
  getMovementBudget(origin: Axial, unitId?: string): MovementBudget | null {
    const context = this.resolveMovementContext(origin, unitId);
    if (!context) {
      return null;
    }
    return { max: context.max, remaining: context.remaining };
  }

  /** Returns true when the unit's movement profile burns fuel while traversing the map. */
  private unitConsumesFuel(definition: UnitTypeDefinition): boolean {
    const moveType = definition.moveType as keyof typeof FUEL_COST;
    return (FUEL_COST[moveType] ?? 0) > 0 && (definition.fuel ?? 0) > 0;
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
        const moveCost = this.resolveMoveCost(moveType, terrain, neighbor, current.hex);
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
        const moveCost = this.resolveMoveCost(moveType, terrain, neighbor, current.hex);
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
  getReachableHexes(origin: Axial, unitId?: string): Axial[] {
    const context = this.resolveMovementContext(origin, unitId);
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
        const canEnterOccupiedHex = occupied && moveType !== "air" && this.canFactionEnterHex(unit, "Player", neighbor);
        if (occupied && moveType !== "air" && !canEnterOccupiedHex) {
          continue;
        }

        const terrain = this.terrainAt(neighbor);
      const moveCost = this.resolveMoveCost(moveType, terrain, neighbor, current.hex);
        if (moveCost >= 999) {
          continue;
        }
        const newCost = current.cost + moveCost;
        const newFuelCost = current.fuelCost + this.resolveMovementFuelStep(moveType, neighbor);

        if (newCost <= remaining && (!Number.isFinite(availableFuel) || newFuelCost <= availableFuel + 1e-6)) {
          queue.push({ hex: neighbor, cost: newCost, fuelCost: newFuelCost });
          if (nKey !== originKey && !reachableKeys.has(nKey) && (!occupied || canEnterOccupiedHex)) {
            reachableKeys.add(nKey);
            reachable.push(structuredClone(neighbor));
          }
          if (occupied && canEnterOccupiedHex) {
            continue;
          }
        }
      }
    }

    return reachable;
  }

  /** Attackable enemy hexes within unit range where LOS is clear. */
  getAttackableTargets(attackerHex: Axial, unitId?: string): Axial[] {
    const unit = this.lookupUnit(attackerHex, "Player", false, unitId);
    if (!unit) {
      return [];
    }
    if (this.isAutomatedPlayerUnit(unit)) {
      return [];
    }
    const flags = this.getUnitActionFlags("Player", unit);

    const def = this.getUnitDefinition(unit.type);
    if (this.isTowableUnit(unit) && this.resolveTowState(unit) === "towed") {
      return [];
    }
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
        const defenderEntry = this.getHostileUnitsAtHex(hex, "Player")[0];
        if (defenderEntry && this.getPlayerEnemyContactStateAtHex(hex)) {
          const req = this.buildAttackRequest(unit, defenderEntry.unit, "Player", defenderEntry.faction);
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
    const flags = this.getUnitActionFlags("Player", unit);

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
  moveUnit(from: Axial, to: Axial, unitId?: string): MoveResolution {
    if (this._phase !== "playerTurn") {
      throw new Error("Movement is allowed only during the player turn.");
    }
    const fromKey = axialKey(from);
    const toKey = axialKey(to);
    const originUnit = this.lookupUnit(from, "Player", false, unitId);
    if (originUnit && this.isAutomatedPlayerUnit(originUnit)) {
      throw new Error("This logistics convoy is AI-controlled and will move automatically during the supply phase.");
    }
    const context = this.resolveMovementContext(from, unitId);
    if (!context) {
      throw new Error("No player unit at the origin hex.");
    }
    const { unit, definition, flags, moveType, max, remaining } = context;
    const availableFuel = this.resolveFuelBudget(unit, definition);
    if (this.resolveUnitSuppressionState(unit).state === "pinned") {
      throw new Error("Pinned formations cannot move until the pin is broken.");
    }
    if (this.isTowableUnit(unit) && this.resolveTowState(unit) !== "towed") {
      throw new Error("This battery must choose Move Out before it can be towed.");
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
    if (!this.canFactionEnterHex(unit, "Player", to)) {
      throw new Error("Destination hex is occupied.");
    }

    const movingUnitId = this.getSquadronId(unit);
    // Verify destination is reachable within movement budget
    const reachable = this.getReachableHexes(from, movingUnitId);
    const canReach = reachable.some((hex) => hex.q === to.q && hex.r === to.r);
    if (!canReach && (from.q !== to.q || from.r !== to.r)) {
      throw new Error("Destination is not reachable with available movement points.");
    }

    const originUnits = this.getUnitsAtHexForFaction(from, "Player");
    const originRemaining = originUnits.filter((candidate) => this.getSquadronId(candidate) !== movingUnitId);
    this.setUnitsAtHexForFaction(from, "Player", originRemaining);
    this.playerIdleUnitKeys.delete(fromKey);
    const moved = structuredClone(unit);
    moved.facing = this.resolveFacingToward(from, to, unit.facing);
    moved.hex = structuredClone(to);
    moved.onSentry = false;
    if (Number.isFinite(availableFuel) && moveSummary.fuelCost > 0) {
      moved.fuel = Math.max(0, Number((moved.fuel - moveSummary.fuelCost).toFixed(2)));
    }
    moved.entrench = 0;
    const destinationUnits = this.getUnitsAtHexForFaction(to, "Player");
    destinationUnits.push(moved);
    this.setUnitsAtHexForFaction(to, "Player", destinationUnits);
    this.transferAircraftAmmoState(this.playerAttackAmmo, fromKey, toKey);
    this.updatePlayerSupplyPosition(from, to, movingUnitId);
    this.syncPlayerFuel(to, moved.fuel, moved.unitId);
    this.syncPlayerEntrench(to, moved.entrench, moved.unitId);
    this.syncPlayerAmmo(to, moved.ammo, moved.unitId);

    // Update action flags
    this.deleteUnitActionFlags("Player", unit);
    this.setUnitActionFlags("Player", moved, {
      movementPointsUsed: newTotalMovement,
      attacksUsed: flags.attacksUsed,
      retaliationsUsed: flags.retaliationsUsed,
      isRushing: flags.isRushing
    });

    this.playerIdleUnitKeys.delete(fromKey);
    this.updateIdleRegistryFor(fromKey);
    this.updateIdleRegistryFor(toKey);

    this.invalidateRosterCache();

    return { unit: structuredClone(moved), from: structuredClone(from), to: structuredClone(to) };
  }

  private resolvePlayerAttack(
    attackerHex: Axial,
    defenderHex: Axial,
    stance?: CombatStance,
    attackerUnitId?: string,
    defenderUnitId?: string
  ): AttackResolution | null {
    if (this._phase !== "playerTurn") {
      throw new Error("Attacks are allowed only during the player turn.");
    }

    const attacker = this.lookupUnit(attackerHex, "Player", false, attackerUnitId);
    const defenderEntries = this.getHostileUnitsAtHex(defenderHex, "Player");
    const primaryDefenderMember = defenderUnitId
      ? defenderEntries.find((entry) => entry.unitId === defenderUnitId) ?? defenderEntries[0]
      : defenderEntries[0];
    const primaryDefender = primaryDefenderMember?.unit ?? null;
    if (!attacker || !primaryDefender || !this.getPlayerEnemyContactStateAtHex(defenderHex)) {
      return null;
    }
    if (this.isAutomatedPlayerUnit(attacker)) {
      throw new Error("This logistics convoy is AI-controlled. Set resupply priorities from the Logistics panel instead of issuing manual orders.");
    }

    const attackerOriginKey = axialKey(attackerHex);
    const attackerKey = this.getSquadronId(attacker);
    const flags = this.getUnitActionFlags("Player", attacker);
    const unitDef = this.getUnitDefinition(attacker.type);
    if (this.isTowableUnit(attacker) && this.resolveTowState(attacker) === "towed") {
      throw new Error("This battery must deploy before it can fire.");
    }
    const primaryDefenderDef = this.getUnitDefinition(primaryDefender.type);
    const effectiveStance = this.resolveCombatStanceForAttacker(attacker, unitDef, stance);
    if (stance === "assault" && effectiveStance !== "assault") {
      throw new Error(this.buildAssaultUnavailableMessage(attacker, unitDef));
    }

    const attackerIsAircraft = this.isAircraft(unitDef);
    const attackerIsBomber = this.isBomber(unitDef);
    const primaryDefenderIsAircraft = this.isAircraft(primaryDefenderDef);
    const groundAttackAmmoCost = attackerIsAircraft ? 0 : this.resolveGroundAttackAmmoCost(unitDef);
    let attackManeuverCost = 0;
    const moveScalar = this.commanderMoveScalar();
    const boostedMovement = Math.max(1, Math.ceil((unitDef.movement ?? 1) * moveScalar));
    const halfMovement = Math.floor(boostedMovement / 2);
    const maxAttacks = 1;

    const movedTooFar = flags.movementPointsUsed > halfMovement;
    if (!attackerIsAircraft && movedTooFar) {
      if (unitDef.class === "artillery") {
        throw new Error("Artillery cannot attack after moving.");
      }
      throw new Error("Unit moved too far to attack this turn.");
    }
    if (unitDef.class === "artillery" && flags.movementPointsUsed > 0) {
      throw new Error("Artillery cannot attack after moving.");
    }
    if (flags.attacksUsed >= maxAttacks) {
      throw new Error(`This unit can only attack ${maxAttacks} time(s) this turn.`);
    }
    if (!attackerIsAircraft && attacker.ammo < groundAttackAmmoCost) {
      throw new Error(this.buildGroundAmmoShortageMessage(unitDef, attacker.ammo, groundAttackAmmoCost));
    }

    const resolveAircraftRegistryKey = (faction: TurnFaction, unit: ScenarioUnit): string => {
      const registry = faction === "Player" ? this.playerAttackAmmo : this.botAttackAmmo;
      const unitKey = this.getSquadronId(unit);
      if (registry.has(unitKey)) {
        return unitKey;
      }
      const hexKey = axialKey(unit.hex);
      if (registry.has(hexKey)) {
        return hexKey;
      }
      return unitKey;
    };
    const clearAircraftRegistryFor = (faction: TurnFaction, unit: ScenarioUnit): void => {
      const registry = faction === "Player" ? this.playerAttackAmmo : this.botAttackAmmo;
      registry.delete(this.getSquadronId(unit));
      registry.delete(axialKey(unit.hex));
    };
    const scaleAttackResult = (
      result: AttackResult,
      attackingDefinition: UnitTypeDefinition,
      defendingDefinition: UnitTypeDefinition
    ): AttackResult => {
      if (this.isBomber(attackingDefinition) && !this.isAircraft(defendingDefinition)) {
        return {
          ...result,
          damagePerHit: result.damagePerHit * 10,
          expectedDamage: result.expectedDamage * 10,
          expectedSuppression: result.expectedSuppression * 10
        };
      }
      if (this.isAircraft(attackingDefinition) && !this.isBomber(attackingDefinition) && this.isAircraft(defendingDefinition)) {
        return {
          ...result,
          damagePerHit: result.damagePerHit * 4,
          expectedDamage: result.expectedDamage * 4,
          expectedSuppression: result.expectedSuppression * 4
        };
      }
      return result;
    };
    const roundAppliedDamage = (
      expectedDamage: number,
      attackingDefinition: UnitTypeDefinition,
      defendingDefinition: UnitTypeDefinition
    ): number => Math.max(
      0,
      this.isBomber(attackingDefinition) && !this.isAircraft(defendingDefinition)
        ? Math.ceil(expectedDamage)
        : Math.round(expectedDamage)
    );
    const resolveRetaliationNote = (wasOnSentry: boolean, message: string): string =>
      wasOnSentry
        ? `Enemy unit was on sentry, but ${message.charAt(0).toLowerCase()}${message.slice(1)}`
        : message;

    if (attackerIsAircraft) {
      attackManeuverCost = primaryDefenderIsAircraft ? 2 : 1;
      const remainingAirMovement = boostedMovement - flags.movementPointsUsed;
      if (remainingAirMovement + 1e-6 < attackManeuverCost) {
        throw new Error(
          primaryDefenderIsAircraft
            ? "This squadron expended its flight time and cannot execute another aerial dogfight this turn."
            : "This squadron lacks the flight time to line up another ground strike this turn."
        );
      }
      const aircraftAmmoKey = resolveAircraftRegistryKey("Player", attacker);
      const ammoState = this.getAircraftAmmoState("Player", aircraftAmmoKey, unitDef);
      if (this.aircraftNeedsRearm("Player", aircraftAmmoKey)) {
        throw new Error("This squadron must return to base to rearm before flying another sortie.");
      }
      if (primaryDefenderIsAircraft) {
        if (ammoState.air <= 0) {
          throw new Error("The fighter wing has exhausted its interception ammo and needs to rearm at base.");
        }
      } else if (ammoState.ground <= 0) {
        throw new Error("The squadron has expended its bomb load and must rearm at the base camp before attacking ground targets again.");
      }
    }

    let attackingSnapshot = structuredClone(attacker);

    // Aircraft attacking ground targets may be intercepted before ordnance release.
    if (attackerIsAircraft && !primaryDefenderIsAircraft) {
      const opponentFaction: TurnFaction = "Bot";
      const defenderHexKey = axialKey(defenderHex);

      // === FLAK ENGAGEMENT: Ground AA intercepts before CAP ===
      const flakUnits = this.findAllActiveFlakUnitsForHex(opponentFaction, defenderHex);

      if (flakUnits.length > 0) {
        const flakInterceptorsForEvent: Array<{
          faction: TurnFaction;
          unitKey: string;
          unitType: string;
          hex: Axial;
        }> = [];

        for (const flakEntry of flakUnits) {
          flakInterceptorsForEvent.push({
            faction: opponentFaction,
            unitKey: this.getSquadronId(flakEntry.unit),
            unitType: flakEntry.unit.type as string,
            hex: structuredClone(flakEntry.unit.hex)
          });
        }

        // Process sequential flak damage
        const bomberStrengthBeforeFlak = attackingSnapshot.strength;
        let flakDamage = 0;
        let bomberDestroyedByFlak = false;
        for (const flakEntry of flakUnits) {
          if (attackingSnapshot.strength <= 0) break;

          const flakReq = this.buildMissionAttackRequest(
            opponentFaction,
            flakEntry.unit,
            attackingSnapshot
          );
          if (!flakReq) continue;

          // Ground-based AA has severe accuracy penalty against fast-moving, distant aircraft
          let flakResult = resolveAttack(flakReq);
          const flakDef = this.getUnitDefinition(flakEntry.unit.type);
          if (this.hasAntiAirCapability(flakDef) && this.isAircraft(unitDef)) {
            // Apply 75% accuracy reduction for ground AA vs aircraft (small, fast, distant targets)
            flakResult = {
              ...flakResult,
              accuracy: flakResult.accuracy * 0.25,
              expectedHits: flakResult.expectedHits * 0.25,
              expectedDamage: flakResult.expectedDamage * 0.25,
              expectedSuppression: flakResult.expectedSuppression * 0.25
            };
          }

          const suffered = roundAppliedDamage(flakResult.expectedDamage, flakDef, unitDef);
          attackingSnapshot = structuredClone(attackingSnapshot);
          attackingSnapshot.strength = Math.max(0, attackingSnapshot.strength - suffered);
          flakDamage += suffered;

          this.recordFlakEngagement(opponentFaction, flakEntry.unit, flakEntry.hexKey);

          if (attackingSnapshot.strength <= 0) {
            this.removeUnitFromFactionHex("Player", attackerHex, attackerKey);
            this.deleteUnitActionFlags("Player", attacker);
            this.playerIdleUnitKeys.delete(attackerOriginKey);
            this.removeSupplyEntryForFaction("Player", attackerHex, attackerKey);
            clearAircraftRegistryFor("Player", attacker);
            this.updateIdleRegistryFor(attackerOriginKey);
            this.invalidateRosterCache();
            bomberDestroyedByFlak = true;
            break;
          }
        }

        this.pendingAirEngagements.push({
          type: "flak",
          location: structuredClone(defenderHex),
          bomber: {
            faction: "Player",
            unitKey: attackerKey,
            unitType: attacker.type as string,
            strength: bomberStrengthBeforeFlak
          },
          interceptors: flakInterceptorsForEvent,
          escorts: [],
          flakDamage,
          bomberStrengthBefore: bomberStrengthBeforeFlak,
          bomberStrengthAfter: attackingSnapshot.strength,
          bomberDestroyed: bomberDestroyedByFlak
        });

        if (bomberDestroyedByFlak) {
          return null;  // Aircraft destroyed by flak before reaching target
        }
      }

      const capMissions = this.findAllActiveAirCoverForHex(opponentFaction, defenderHexKey).filter((mission) => mission.interceptions < 1);
      const escortMissions = this.findAllActiveEscortsForUnit("Player", attackerKey).filter((mission) => mission.interceptions < 1);

      if (capMissions.length > 0) {
        const bomberStrengthBeforeCap = attackingSnapshot.strength;
        let bomberDestroyedByCap = false;
        let interceptorAttrition = 0;
        let escortAttrition = 0;
        let interceptorKills = 0;
        const interceptorsForEvent: Array<{ faction: TurnFaction; unitKey: string; unitType: string; strength?: number }> = [];
        const escortsForEvent: Array<{ faction: TurnFaction; unitKey: string; unitType: string; strength?: number }> = [];
        for (const cap of capMissions) {
          const capLookup = this.lookupUnitBySquadronId(cap.unitKey, opponentFaction);
          if (capLookup) {
            interceptorsForEvent.push({
              faction: opponentFaction,
              unitKey: cap.unitKey,
              unitType: capLookup.unit.type as string,
              strength: capLookup.unit.strength
            });
          }
        }
        for (const escort of escortMissions) {
          const escortLookup = this.lookupUnitBySquadronId(escort.unitKey, "Player");
          if (escortLookup) {
            escortsForEvent.push({
              faction: "Player",
              unitKey: escort.unitKey,
              unitType: escortLookup.unit.type as string,
              strength: escortLookup.unit.strength
            });
          }
        }

        for (const cap of capMissions) {
          const capLookup = this.lookupUnitBySquadronId(cap.unitKey, opponentFaction);
          if (!capLookup) {
            continue;
          }
          const escort = escortMissions.find((mission) => mission.interceptions < 1);
          if (!escort) {
            continue;
          }
          const escortLookup = this.lookupUnitBySquadronId(escort.unitKey, "Player");
          if (!escortLookup) {
            continue;
          }
          const capUnit = capLookup.unit;
          const escortUnit = escortLookup.unit;
          const escortReq = this.buildMissionAttackRequest("Player", escortUnit, capUnit);
          if (!escortReq) {
            continue;
          }

          const capDef = this.getUnitDefinition(capUnit.type);
          const escortDef = this.getUnitDefinition(escortUnit.type);
          const escortResult = scaleAttackResult(resolveAttack(escortReq), escortDef, capDef);
          const inflicted = roundAppliedDamage(escortResult.expectedDamage, escortDef, capDef);
          interceptorAttrition += inflicted;
          const updatedCap = structuredClone(capUnit);
          updatedCap.strength = Math.max(0, updatedCap.strength - inflicted);
          this.spendAircraftAmmo("Player", resolveAircraftRegistryKey("Player", escortUnit), true);
          escort.interceptions += 1;

          if (updatedCap.strength <= 0) {
            interceptorKills += 1;
            this.removeUnitFromFactionHex("Bot", updatedCap.hex, cap.unitKey);
            this.deleteUnitActionFlags("Bot", capUnit);
            this.removeSupplyEntryForFaction("Bot", updatedCap.hex, cap.unitKey);
            clearAircraftRegistryFor("Bot", capUnit);
            cap.interceptions += 1;
          } else {
            this.replaceUnitInFactionHex("Bot", updatedCap);
            this.syncStrengthForFaction("Bot", updatedCap.hex, updatedCap.strength, cap.unitKey);
          }
        }

        for (const cap of capMissions) {
          if (cap.interceptions >= 1 || attackingSnapshot.strength <= 0) {
            continue;
          }
          const liveCapLookup = this.lookupUnitBySquadronId(cap.unitKey, opponentFaction);
          if (!liveCapLookup) {
            continue;
          }
          const liveCap = liveCapLookup.unit;
          const capReq = this.buildMissionAttackRequest("Bot", liveCap, attackingSnapshot);
          if (!capReq) {
            continue;
          }

          const capDef = this.getUnitDefinition(liveCap.type);
          const capResult = scaleAttackResult(resolveAttack(capReq), capDef, unitDef);
          const suffered = roundAppliedDamage(capResult.expectedDamage, capDef, unitDef);
          attackingSnapshot = structuredClone(attackingSnapshot);
          attackingSnapshot.strength = Math.max(0, attackingSnapshot.strength - suffered);
          this.spendAircraftAmmo("Bot", resolveAircraftRegistryKey("Bot", liveCap), true);
          cap.interceptions += 1;

          if (attackingSnapshot.strength <= 0) {
            this.removeUnitFromFactionHex("Player", attackerHex, attackerKey);
            this.deleteUnitActionFlags("Player", attacker);
            this.playerIdleUnitKeys.delete(attackerOriginKey);
            this.removeSupplyEntryForFaction("Player", attackerHex, attackerKey);
            clearAircraftRegistryFor("Player", attacker);
            this.updateIdleRegistryFor(attackerOriginKey);
            this.invalidateRosterCache();
            bomberDestroyedByCap = true;
            break;
          }

          this.replaceUnitInFactionHex("Player", attackingSnapshot);
          this.syncStrengthForFaction("Player", attackingSnapshot.hex, attackingSnapshot.strength, attackerKey);
        }

        this.pendingAirEngagements.push({
          type: "airToAir",
          location: structuredClone(defenderHex),
          bomber: {
            faction: "Player",
            unitKey: attackerKey,
            unitType: attacker.type as string,
            strength: bomberStrengthBeforeCap
          },
          interceptors: interceptorsForEvent,
          escorts: escortsForEvent,
          bomberStrengthBefore: bomberStrengthBeforeCap,
          bomberStrengthAfter: attackingSnapshot.strength,
          bomberDestroyed: bomberDestroyedByCap,
          interceptorAttrition,
          interceptorKills,
          escortAttrition
        });

        if (bomberDestroyedByCap) {
          return null;
        }
      }
    }

    const attackRequestSource = structuredClone(attackingSnapshot);
    attackRequestSource.facing = this.resolveFacingToward(attackerHex, defenderHex, attackingSnapshot.facing);
    attackRequestSource.onSentry = false;

    const updatedAttacker = structuredClone(attackRequestSource);
    updatedAttacker.ammo = attackerIsAircraft
      ? Math.max(0, updatedAttacker.ammo - 1)
      : Math.max(0, updatedAttacker.ammo - groundAttackAmmoCost);

    if (attackerIsAircraft) {
      this.spendAircraftAmmo("Player", resolveAircraftRegistryKey("Player", attacker), primaryDefenderIsAircraft);
    }

    let primaryAttackResult: AttackResult | null = null;
    let primaryDefenderRemainingStrength = primaryDefender.strength;
    let primaryDefenderDestroyed = false;
    let primaryRetaliationResult: AttackResult | undefined;
    let primaryRetaliationNote: string | undefined;
    let primaryRetaliationOccurred = false;
    let totalDefenderDamage = 0;
    let totalRetaliationDamage = 0;
    let anyRetaliationOccurred = false;
    const targetRichDefenders: TargetRichResolutionEntry[] = [];

    for (const entry of defenderEntries) {
      const liveDefender = this.findUnitInFactionAtHex(defenderHex, entry.faction, entry.unitId) ?? structuredClone(entry.unit);
      const defenderBefore = structuredClone(liveDefender);
      const defenderDef = this.getUnitDefinition(defenderBefore.type);
      const request = this.buildAttackRequest(attackRequestSource, defenderBefore, "Player", entry.faction, { stance: effectiveStance });
      if (!request) {
        continue;
      }

      const scaledAttackResult = scaleAttackResult(resolveAttack(request), unitDef, defenderDef);
      const inflictedDamage = roundAppliedDamage(scaledAttackResult.expectedDamage, unitDef, defenderDef);
      totalDefenderDamage += inflictedDamage;

      const defenderWasOnSentry = defenderBefore.onSentry === true;
      const updatedDefender = structuredClone(defenderBefore);
      updatedDefender.facing = this.resolveFacingToward(defenderHex, attackerHex, defenderBefore.facing);
      updatedDefender.onSentry = false;
      updatedDefender.strength = Math.max(0, updatedDefender.strength - inflictedDamage);

      if (effectiveStance === "suppressive" && updatedDefender.strength > 0) {
        const suppressors = Array.isArray(updatedDefender.suppressedBy) ? [...updatedDefender.suppressedBy] : [];
        if (!suppressors.includes(attackerKey)) {
          suppressors.push(attackerKey);
        }
        updatedDefender.suppressedBy = suppressors;
      }

      if (updatedDefender.strength <= 0) {
        this.removeUnitFromFactionHex(entry.faction, defenderHex, entry.unitId);
        this.deleteUnitActionFlags(entry.faction, defenderBefore);
        this.removeSupplyEntryForFaction(entry.faction, defenderHex, entry.unitId);
        if (this.isAircraft(defenderDef)) {
          clearAircraftRegistryFor(entry.faction, defenderBefore);
        }
      } else {
        this.replaceUnitInFactionHex(entry.faction, updatedDefender);
        this.syncStrengthForFaction(entry.faction, defenderHex, updatedDefender.strength, entry.unitId);
      }

      let retaliationResultForEntry: AttackResult | undefined;
      let retaliationDamage = 0;
      let retaliationOccurredForEntry = false;
      let retaliationNoteForEntry: string | undefined;

      let retaliationAllowed = (defenderWasOnSentry || updatedDefender.strength > 0) && updatedAttacker.strength > 0;
      if (retaliationAllowed && attackerIsAircraft && !this.isAircraft(defenderDef)) {
        retaliationAllowed = false;
        retaliationNoteForEntry = resolveRetaliationNote(defenderWasOnSentry, "Enemy unit cannot retaliate against fast-moving aircraft.");
      }

      const retaliationDefender = structuredClone(defenderWasOnSentry ? defenderBefore : updatedDefender);
      retaliationDefender.facing = this.resolveFacingToward(defenderHex, attackerHex, retaliationDefender.facing);
      retaliationDefender.onSentry = false;

      if (retaliationAllowed && this.isRetaliationBlockedByTowState(retaliationDefender)) {
        retaliationAllowed = false;
        retaliationNoteForEntry = resolveRetaliationNote(
          defenderWasOnSentry,
          this.buildTowStateRetaliationUnavailableNote("Enemy unit")
        );
      }

      if (retaliationAllowed && this.resolveUnitSuppressionState(retaliationDefender).state === "pinned") {
        retaliationAllowed = false;
        retaliationNoteForEntry = resolveRetaliationNote(defenderWasOnSentry, "Enemy unit is pinned and cannot return fire.");
      }

      if (retaliationAllowed) {
        const retaliationDistance = hexDistance(defenderHex, attackerHex);
        const defenderRangeMin = defenderDef.rangeMin ?? 1;
        let defenderRangeMax = defenderDef.rangeMax ?? 1;
        if (this.isBomber(defenderDef) && attackerIsAircraft) {
          defenderRangeMax = Math.max(defenderRangeMax, 2);
        }
        if (retaliationDistance < defenderRangeMin || retaliationDistance > defenderRangeMax) {
          retaliationAllowed = false;
          retaliationNoteForEntry = resolveRetaliationNote(defenderWasOnSentry, "Enemy unit is out of return-fire range.");
        }
      }

      if (retaliationAllowed) {
        const defenderFlags = this.getUnitActionFlags(entry.faction, retaliationDefender);
        if (defenderFlags.retaliationsUsed >= combatBalance.counterfire.maxRetaliationsPerTurn) {
          retaliationAllowed = false;
          retaliationNoteForEntry = resolveRetaliationNote(defenderWasOnSentry, "Enemy unit has already used all available retaliations this turn.");
        }
      }

      const defenderGroundAmmoCost = this.isAircraft(defenderDef) ? 0 : this.resolveGroundAttackAmmoCost(defenderDef);
      if (retaliationAllowed) {
        if (this.isAircraft(defenderDef)) {
          const defenderAmmoKey = resolveAircraftRegistryKey(entry.faction, retaliationDefender);
          const defenderAmmoState = this.getAircraftAmmoState(entry.faction, defenderAmmoKey, defenderDef);
          if (this.aircraftNeedsRearm(entry.faction, defenderAmmoKey)) {
            retaliationAllowed = false;
            retaliationNoteForEntry = resolveRetaliationNote(defenderWasOnSentry, "Enemy aircraft must rearm before it can retaliate.");
          } else if (defenderAmmoState.air <= 0) {
            retaliationAllowed = false;
            retaliationNoteForEntry = resolveRetaliationNote(defenderWasOnSentry, "Enemy aircraft has no interception ammo remaining.");
          }
        } else {
          const defenderAmmo = typeof retaliationDefender.ammo === "number" ? retaliationDefender.ammo : null;
          if (defenderAmmo !== null && defenderAmmo < defenderGroundAmmoCost) {
            retaliationAllowed = false;
            retaliationNoteForEntry = resolveRetaliationNote(
              defenderWasOnSentry,
              defenderGroundAmmoCost > 1
                ? `Enemy unit lacks the ${defenderGroundAmmoCost.toFixed(0)} ammo needed to return indirect fire.`
                : "Enemy unit has no ammunition remaining to retaliate."
            );
          }
        }
      }

      const retaliationReq = retaliationAllowed
        ? this.buildAttackRequest(retaliationDefender, updatedAttacker, entry.faction, "Player", {
            allowBomberAirAttack: true,
            stance: effectiveStance === "assault" ? "assault" : undefined
          })
        : null;

      if (retaliationReq) {
        retaliationResultForEntry = scaleAttackResult(resolveAttack(retaliationReq), defenderDef, unitDef);
        retaliationDamage = roundAppliedDamage(retaliationResultForEntry.expectedDamage, defenderDef, unitDef);
        retaliationOccurredForEntry = true;
        anyRetaliationOccurred = true;
        totalRetaliationDamage += retaliationDamage;
        updatedAttacker.strength = Math.max(0, updatedAttacker.strength - retaliationDamage);
        if (defenderWasOnSentry) {
          retaliationNoteForEntry = "Enemy unit was on sentry and returned fire simultaneously.";
        }

        if (this.isAircraft(defenderDef)) {
          this.spendAircraftAmmo(entry.faction, resolveAircraftRegistryKey(entry.faction, retaliationDefender), attackerIsAircraft);
          if (typeof updatedDefender.ammo === "number") {
            updatedDefender.ammo = Math.max(0, updatedDefender.ammo - 1);
          }
        } else if (typeof updatedDefender.ammo === "number") {
          updatedDefender.ammo = Math.max(0, updatedDefender.ammo - defenderGroundAmmoCost);
        }

        if (updatedDefender.strength > 0) {
          this.replaceUnitInFactionHex(entry.faction, updatedDefender);
          if (typeof updatedDefender.ammo === "number") {
            this.syncAmmoForFaction(entry.faction, defenderHex, updatedDefender.ammo, entry.unitId);
          }
          const defenderFlags = this.getUnitActionFlags(entry.faction, updatedDefender);
          this.setUnitActionFlags(entry.faction, updatedDefender, {
            ...defenderFlags,
            retaliationsUsed: defenderFlags.retaliationsUsed + 1
          });
        }
      } else if (!retaliationNoteForEntry && retaliationAllowed) {
        retaliationNoteForEntry = resolveRetaliationNote(defenderWasOnSentry, "Enemy unit lacked line of fire for retaliation.");
      }

      targetRichDefenders.push({
        unitId: entry.unitId,
        unitType: defenderBefore.type,
        remainingStrength: updatedDefender.strength,
        destroyed: updatedDefender.strength <= 0,
        expectedDamage: inflictedDamage,
        retaliationDamage,
        retaliationOccurred: retaliationOccurredForEntry
      });

      if (entry.unitId === primaryDefenderMember.unitId) {
        primaryAttackResult = scaledAttackResult;
        primaryDefenderRemainingStrength = updatedDefender.strength;
        primaryDefenderDestroyed = updatedDefender.strength <= 0;
        primaryRetaliationResult = retaliationResultForEntry;
        primaryRetaliationNote = retaliationNoteForEntry;
        primaryRetaliationOccurred = retaliationOccurredForEntry;
      }
    }

    if (!primaryAttackResult) {
      return null;
    }

    let attackerRemainingStrength = updatedAttacker.strength;
    const allDefendersDestroyed = defenderEntries.every((entry) => !this.findUnitInFactionAtHex(defenderHex, entry.faction, entry.unitId));
    const canAssaultAdvance = effectiveStance === "assault" && allDefendersDestroyed && !attackerIsAircraft && !primaryDefenderIsAircraft;
    let attackerFinalHex = structuredClone(attackerHex);

    if (updatedAttacker.strength <= 0) {
      this.removeUnitFromFactionHex("Player", attackerHex, attackerKey);
      this.deleteUnitActionFlags("Player", attacker);
      this.playerIdleUnitKeys.delete(attackerOriginKey);
      this.removeSupplyEntryForFaction("Player", attackerHex, attackerKey);
      if (attackerIsAircraft) {
        clearAircraftRegistryFor("Player", attacker);
      }
    } else if (canAssaultAdvance) {
      const originRemainder = this.getUnitsAtHexForFaction(attackerHex, "Player").filter((candidate) => this.getSquadronId(candidate) !== attackerKey);
      this.setUnitsAtHexForFaction(attackerHex, "Player", originRemainder);
      attackerFinalHex = structuredClone(defenderHex);
      updatedAttacker.hex = structuredClone(defenderHex);
      updatedAttacker.entrench = 0;
      this.addUnitToFactionHex("Player", updatedAttacker);
      this.updatePlayerSupplyPosition(attackerHex, defenderHex, attackerKey);
      this.syncPlayerEntrench(defenderHex, updatedAttacker.entrench, attackerKey);
    } else {
      this.replaceUnitInFactionHex("Player", updatedAttacker);
    }

    if (updatedAttacker.strength > 0) {
      attackerRemainingStrength = updatedAttacker.strength;
      this.syncPlayerAmmo(attackerFinalHex, updatedAttacker.ammo, attackerKey);
      this.syncPlayerStrength(attackerFinalHex, updatedAttacker.strength, attackerKey);
      this.setUnitActionFlags("Player", updatedAttacker, {
        movementPointsUsed: flags.movementPointsUsed + attackManeuverCost,
        attacksUsed: flags.attacksUsed + 1,
        retaliationsUsed: flags.retaliationsUsed,
        isRushing: flags.isRushing
      });
    }

    this.updateIdleRegistryFor(attackerOriginKey);
    if (axialKey(attackerFinalHex) !== attackerOriginKey) {
      this.updateIdleRegistryFor(axialKey(attackerFinalHex));
    }

    this.recordCombatReport({
      attacker: {
        unit: attackRequestSource,
        hex: attackerHex,
        faction: "Player",
        strengthBefore: attackRequestSource.strength,
        strengthAfter: attackerRemainingStrength
      },
      defender: {
        unit: primaryDefender,
        hex: defenderHex,
        faction: primaryDefenderMember.faction,
        strengthBefore: primaryDefender.strength,
        strengthAfter: primaryDefenderRemainingStrength,
        destroyed: primaryDefenderDestroyed
      },
      attackResult: primaryAttackResult,
      retaliationResult: primaryRetaliationOccurred ? primaryRetaliationResult : undefined
    });

    this.invalidateRosterCache();

    return {
      result: primaryAttackResult,
      defenderRemainingStrength: primaryDefenderRemainingStrength,
      defenderDestroyed: primaryDefenderDestroyed,
      retaliationResult: primaryRetaliationResult,
      attackerRemainingStrength,
      retaliationOccurred: anyRetaliationOccurred,
      retaliationNote: primaryRetaliationNote,
      targetRich: targetRichDefenders.length > 1,
      targetRichDefenders,
      totalDefenderDamage,
      totalRetaliationDamage
    };
  }

  /** Resolve a basic attack and update units in place. */
  attackUnit(
    attackerHex: Axial,
    defenderHex: Axial,
    stance?: CombatStance,
    attackerUnitId?: string,
    defenderUnitId?: string
  ): AttackResolution | null {
    return this.resolvePlayerAttack(attackerHex, defenderHex, stance, attackerUnitId, defenderUnitId);
  }

  /** Serialize core battle state, excluding transient caches, for persistence or debugging output. */
  serialize(): SerializedBattleState {
    return {
      phase: this._phase,
      activeFaction: this._activeFaction,
      turnNumber: this._turnNumber,
      baseCamp: this._baseCamp ? { hex: structuredClone(this._baseCamp.hex), key: this._baseCamp.key } : null,
      playerPlacements: this.getAllUnitsForFaction("Player").map((unit) => structuredClone(unit)),
      botPlacements: this.getAllUnitsForFaction("Bot").map((unit) => structuredClone(unit)),
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
      aaEngagements: Array.from(this.aaEngagementsByUnitId.entries()).map(([unitKey, count]) => ({
        unitKey,
        count
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
      hexModifications: Array.from(this.hexModifications.values()).flatMap((entries) => entries.map((entry) => structuredClone(entry)))
    };
  }

  /**
   * Supplies a read-only snapshot of current player placements so UI layers can mirror the battlefield.
   * The payload is cloned to prevent accidental mutation of engine-managed unit state.
   */
  getPlayerPlacementsSnapshot(): ScenarioUnit[] {
    return this.getAllUnitsForFaction("Player").map((unit) => structuredClone(unit));
  }

  getHexStackMembers(hex: Axial, faction: TurnFaction): HexUnitStackMember[] {
    return this.buildCoalitionHexMembers(hex, faction).map((entry) => ({
      ...entry,
      unit: structuredClone(entry.unit)
    }));
  }

  combinePlayerUnits(primaryUnitId: string, secondaryUnitId: string): ScenarioUnit | null {
    if (this._phase !== "playerTurn") {
      return null;
    }

    const allPlayerUnits = this.getAllUnitsForFaction("Player");
    const primary = allPlayerUnits.find((unit) => this.getSquadronId(unit) === primaryUnitId) ?? null;
    const secondary = allPlayerUnits.find((unit) => this.getSquadronId(unit) === secondaryUnitId) ?? null;
    if (!primary || !secondary || primary === secondary) {
      return null;
    }
    if (axialKey(primary.hex) !== axialKey(secondary.hex)) {
      return null;
    }
    if (primary.type !== secondary.type) {
      return null;
    }
    if ((primary.strength + secondary.strength) > 100) {
      return null;
    }

    const primaryHexUnits = this.getUnitsAtHexForFaction(primary.hex, "Player");
    const secondaryIndex = primaryHexUnits.findIndex((unit) => this.getSquadronId(unit) === secondaryUnitId);
    const primaryIndex = primaryHexUnits.findIndex((unit) => this.getSquadronId(unit) === primaryUnitId);
    if (primaryIndex < 0 || secondaryIndex < 0) {
      return null;
    }

    const strongerIndex = primaryHexUnits[primaryIndex]!.strength >= primaryHexUnits[secondaryIndex]!.strength ? primaryIndex : secondaryIndex;
    const weakerIndex = strongerIndex === primaryIndex ? secondaryIndex : primaryIndex;
    const stronger = structuredClone(primaryHexUnits[strongerIndex]!);
    const weaker = structuredClone(primaryHexUnits[weakerIndex]!);

    stronger.strength = Math.min(100, stronger.strength + weaker.strength);
    stronger.ammo = Math.max(0, (stronger.ammo ?? 0) + (weaker.ammo ?? 0));
    stronger.fuel = Math.max(0, (stronger.fuel ?? 0) + (weaker.fuel ?? 0));
    stronger.entrench = Math.max(stronger.entrench ?? 0, weaker.entrench ?? 0);

    const mergedUnits = primaryHexUnits.filter((unit) => this.getSquadronId(unit) !== this.getSquadronId(weaker));
    mergedUnits[mergedUnits.findIndex((unit) => this.getSquadronId(unit) === this.getSquadronId(stronger))] = stronger;
    this.setUnitsAtHexForFaction(primary.hex, "Player", mergedUnits);
    this.deleteUnitActionFlags("Player", weaker);
    this.setUnitActionFlags("Player", stronger, this.createDefaultActionFlags());
    this.removeSupplyEntryFor(primary.hex, this.getSquadronId(weaker));
    this.syncPlayerAmmo(primary.hex, stronger.ammo, this.getSquadronId(stronger));
    this.syncPlayerFuel(primary.hex, stronger.fuel, this.getSquadronId(stronger));
    this.syncPlayerEntrench(primary.hex, stronger.entrench, this.getSquadronId(stronger));
    this.syncPlayerStrength(primary.hex, stronger.strength, this.getSquadronId(stronger));
    this.updateIdleRegistryFor(axialKey(primary.hex));
    this.invalidateRosterCache();

    return structuredClone(stronger);
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
    const allyUnit = this.lookupUnit(hex, "Ally");
    if (!allyUnit) {
      return false;
    }
    const key = axialKey(hex);
    const unitId = this.getSquadronId(allyUnit);

    // Remove from ally placements and supply mirror.
    this.removeUnitFromFactionHex("Ally", hex, unitId);
    this.allySupply = this.allySupply.filter((s) => !(axialKey(s.hex) === key && s.unitId === unitId));

    // Transfer to player placements and supply mirror.
    const clone = structuredClone(allyUnit);
    this.ensureUnitId(clone);
    this.addUnitToFactionHex("Player", clone);
    const [supplyEntry] = createSupplyUnits([clone]);
    if (supplyEntry) {
      this.playerSupply.push(supplyEntry);
    }

    // Reset action flags/idle state for the new player unit.
    this.setUnitActionFlags("Player", clone, this.createDefaultActionFlags());
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

    const unit = this.getAllUnitsForFaction("Player").find((candidate) => candidate.unitId === unitId) ?? null;
    if (!unit || this.isSupplyTruckType(unit.type)) {
      return false;
    }

    this.supplyPriorityByUnitId.set(unitId, priority);
    this.recordSupplySnapshot("Player");
    return true;
  }

  getLogisticsSnapshot(): LogisticsSnapshot {
    this.ensureSupplyTruckStatesForFaction("Player");
    const allPlacements = this.getAllUnitsForFaction("Player");
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

    const convoyStatuses: LogisticsConvoyStatusEntry[] = convoyUnits
      .map((unit) => {
        const convoyId = unit.unitId ?? this.ensureUnitId(unit);
        const convoyState = convoyStateMap.get(convoyId);

        // Skip units without a valid convoy state
        if (!convoyState) {
          return null;
        }

        const assignedUnit = placements.find((candidate) => candidate.unitId === convoyState.assignedUnitId) ?? null;
        const occupancy = this.buildConvoyBlockingOccupancySet("Player");
        occupancy.delete(axialKey(unit.hex));
        const routePlan = assignedUnit
          ? this.findCheapestPathToAny(
            unit.hex,
            this.collectServiceHexes(assignedUnit.hex, unit.hex, "Player"),
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
          routePlan.path.slice(1).forEach((hex, index) => {
            const previous = routePlan.path[index] ?? routePlan.path[0]!;
            cumulativeCost += this.resolveMoveCost("wheel", this.terrainAt(hex), hex, previous);
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
      })
      .filter((entry): entry is LogisticsConvoyStatusEntry => entry !== null);

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
  private lookupUnit(hex: Axial, faction: TurnFaction, includeReserves = false, unitId?: string | null): ScenarioUnit | null {
    const deployed = this.findUnitInFactionAtHex(hex, faction, unitId);
    if (deployed) {
      return deployed;
    }
    // Optionally check reserves for player faction (air units may fly missions without being deployed)
    if (includeReserves && faction === "Player") {
      const key = axialKey(hex);
      const reserveEntry = this.reserves.find((r) =>
        axialKey(r.unit.hex) === key && (!unitId || this.getSquadronId(r.unit) === unitId)
      );
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
    const placements = this.getAllUnitsForFaction(faction);

    // Search deployed units first
    for (const unit of placements) {
      if (this.getSquadronId(unit) === squadronId) {
        return { unit, hexKey: axialKey(unit.hex) };
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
      lister,
      purpose: "direct-fire"
    });

    const canAttackWithoutDirectLOS = this.canAttackWithoutDirectLOS(attackerType);
    let isSpottedOnly = false;
    if (!hasDirectLOS) {
      if (!canAttackWithoutDirectLOS) {
        return null;
      }
      const hasSpotting = this.checkTargetSpotted(defender.hex, attackerFaction);
      if (!hasSpotting) {
        return null;
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

    // Check if defender is rushing (loses terrain cover) using the unit's stable action state.
    const isDefenderRushing = this.getUnitActionFlags(defenderFaction, defender).isRushing;

    // Check for fortifications on defender's hex
    const defenderMods = this.getHexModifications(defender.hex);
    const defenderFortificationFacings = defenderMods
      .filter((entry) => entry.type === "fortifications")
      .map((entry) => entry.facing)
      .filter((edge): edge is HexEdgeFacing => edge !== null && edge !== undefined);
    const defenderFortified = defenderFortificationFacings.length > 0;

    const defenderCtx: DefenderContext = {
      terrain: this.terrainAt(defender.hex) ?? this.defaultTerrain(),
      class: defenderType.class,
      facing: defender.facing,
      hex: defender.hex,
      isRushing: isDefenderRushing || isAssault, // Attacker loses cover when assaulting
      isSpottedOnly,
      stance: isAssault ? "assault" : undefined, // Defender also at close range if assaulted
      fortified: defenderFortified,
      fortificationFacings: defenderFortificationFacings
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
        lister,
        purpose: "spotting"
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
    const supplyState = this.supplyStateByFaction[faction];
    // Credit baseline production and deliver any shipments slated for this turn before depot issue and convoy loading.
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
      const unit = this.findUnitInFactionAtHex(state.hex, faction, state.unitId);
      if (!unit) {
        return;
      }

      const connectedToSupply = hasSupplyPath(state.hex, network);
      if (!connectedToSupply) {
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

  private canAttackWithoutDirectLOS(definition: UnitTypeDefinition): boolean {
    return definition.moveType === "air" || definition.class === "artillery" || definition.traits.includes("indirect");
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

  private tileCanHostRoad(tile: TileDefinition | null): boolean {
    if (!tile) {
      return false;
    }
    return tile.terrain !== "sea" && tile.terrain !== "river" && tile.terrainType !== "water";
  }

  private tileHasRoadSurface(tile: TileDefinition | null): boolean {
    if (!tile || !this.tileCanHostRoad(tile)) {
      return false;
    }
    const terrain = tile.terrain.toLowerCase();
    const terrainType = tile.terrainType.toLowerCase();
    const features = tile.features.map((feature) => feature.toLowerCase());
    const isHamlet = terrain === "city" && terrainType === "urban" && tile.density.toLowerCase() === "sparse" && features.includes("buildings");
    return terrain === "road" || terrainType === "road" || features.includes("road") || isHamlet;
  }

  /** Treat any explicit road surface or authored road feature as part of the road network. */
  private isRoad(hex: Axial): boolean {
    return this.tileHasRoadSurface(this.lookupTileDetails(hex));
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

  private findSupplyEntryIndex(entries: SupplyUnitState[], hex: Axial, unitId?: string | null): number {
    if (unitId) {
      const byUnitId = entries.findIndex((entry) => entry.unitId === unitId);
      if (byUnitId >= 0) {
        return byUnitId;
      }
    }
    const key = axialKey(hex);
    return entries.findIndex((entry) => axialKey(entry.hex) === key);
  }

  /** Update cached player supply entry position after a move. */
  private updatePlayerSupplyPosition(from: Axial, to: Axial, unitId?: string | null): void {
    const idx = this.findSupplyEntryIndex(this.playerSupply, from, unitId);
    if (idx >= 0) {
      this.playerSupply[idx].hex = structuredClone(to);
    }
  }

  /** Sync attacker ammo to supply mirror. */
  private syncPlayerAmmo(attackerHex: Axial, ammo: number, unitId?: string | null): void {
    const idx = this.findSupplyEntryIndex(this.playerSupply, attackerHex, unitId);
    if (idx >= 0) {
      this.playerSupply[idx].ammo = ammo;
    }
  }

  /** Sync movement fuel to the player-side supply mirror. */
  private syncPlayerFuel(unitHex: Axial, fuel: number, unitId?: string | null): void {
    const idx = this.findSupplyEntryIndex(this.playerSupply, unitHex, unitId);
    if (idx >= 0) {
      this.playerSupply[idx].fuel = fuel;
    }
  }

  /** Mirror player strength after bot attacks to keep supply snapshots honest. */
  private syncPlayerStrength(targetHex: Axial, strength: number, unitId?: string | null): void {
    const idx = this.findSupplyEntryIndex(this.playerSupply, targetHex, unitId);
    if (idx >= 0) {
      this.playerSupply[idx].strength = strength;
    }
  }

  /** Mirror entrenchment changes so the next supply tick does not overwrite freshly dug positions. */
  private syncPlayerEntrench(unitHex: Axial, entrench: number, unitId?: string | null): void {
    const idx = this.findSupplyEntryIndex(this.playerSupply, unitHex, unitId);
    if (idx >= 0) {
      this.playerSupply[idx].entrench = entrench;
    }
  }

  private syncBotEntrench(unitHex: Axial, entrench: number, unitId?: string | null): void {
    const idx = this.findSupplyEntryIndex(this.botSupply, unitHex, unitId);
    if (idx >= 0) {
      this.botSupply[idx].entrench = entrench;
    }
  }

  private syncEntrenchForFaction(faction: TurnFaction, hex: Axial, entrench: number, unitId?: string | null): void {
    if (faction === "Player") {
      this.syncPlayerEntrench(hex, entrench, unitId);
      return;
    }
    if (faction === "Bot") {
      this.syncBotEntrench(hex, entrench, unitId);
      return;
    }
    const idx = this.findSupplyEntryIndex(this.allySupply, hex, unitId);
    if (idx >= 0) {
      this.allySupply[idx].entrench = entrench;
    }
  }

  /** Sync bot ammo usage back into the supply mirror. */
  private syncBotAmmo(attackerHex: Axial, ammo: number, unitId?: string | null): void {
    const idx = this.findSupplyEntryIndex(this.botSupply, attackerHex, unitId);
    if (idx >= 0) {
      this.botSupply[idx].ammo = ammo;
    }
  }

  /** Sync movement fuel to the bot-side supply mirror. */
  private syncBotFuel(unitHex: Axial, fuel: number, unitId?: string | null): void {
    const idx = this.findSupplyEntryIndex(this.botSupply, unitHex, unitId);
    if (idx >= 0) {
      this.botSupply[idx].fuel = fuel;
    }
  }

  private syncStrengthForFaction(faction: TurnFaction, hex: Axial, strength: number, unitId?: string | null): void {
    if (faction === "Player") {
      this.syncPlayerStrength(hex, strength, unitId);
      return;
    }
    if (faction === "Bot") {
      this.syncBotStrength(hex, strength, unitId);
      return;
    }
    const idx = this.findSupplyEntryIndex(this.allySupply, hex, unitId);
    if (idx >= 0) {
      this.allySupply[idx].strength = strength;
    }
  }

  private syncAmmoForFaction(faction: TurnFaction, hex: Axial, ammo: number, unitId?: string | null): void {
    if (faction === "Player") {
      this.syncPlayerAmmo(hex, ammo, unitId);
      return;
    }
    if (faction === "Bot") {
      this.syncBotAmmo(hex, ammo, unitId);
      return;
    }
    const idx = this.findSupplyEntryIndex(this.allySupply, hex, unitId);
    if (idx >= 0) {
      this.allySupply[idx].ammo = ammo;
    }
  }

  private updateSupplyPositionForFaction(faction: TurnFaction, from: Axial, to: Axial, unitId?: string | null): void {
    if (faction === "Player") {
      this.updatePlayerSupplyPosition(from, to, unitId);
      return;
    }
    if (faction === "Bot") {
      this.updateBotSupplyPosition(from, to, unitId);
      return;
    }
    const idx = this.findSupplyEntryIndex(this.allySupply, from, unitId);
    if (idx >= 0) {
      this.allySupply[idx].hex = structuredClone(to);
    }
  }

  private syncFuelForFaction(faction: TurnFaction, hex: Axial, fuel: number, unitId?: string | null): void {
    if (faction === "Player") {
      this.syncPlayerFuel(hex, fuel, unitId);
      return;
    }
    if (faction === "Bot") {
      this.syncBotFuel(hex, fuel, unitId);
      return;
    }
    const idx = this.findSupplyEntryIndex(this.allySupply, hex, unitId);
    if (idx >= 0) {
      this.allySupply[idx].fuel = fuel;
    }
  }

  private removeSupplyEntryForFaction(faction: TurnFaction, hex: Axial, unitId?: string | null): void {
    if (faction === "Player") {
      this.removeSupplyEntryFor(hex, unitId);
      return;
    }
    if (faction === "Bot") {
      this.removeBotSupplyEntryFor(hex, unitId);
      return;
    }
    const index = this.findSupplyEntryIndex(this.allySupply, hex, unitId);
    if (index >= 0) {
      this.allySupply.splice(index, 1);
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
    const keys = new Set<string>();
    this.forEachOccupiedHexKeyForFaction("Player", (key) => keys.add(key));
    this.forEachOccupiedHexKeyForFaction("Bot", (key) => keys.add(key));
    this.forEachOccupiedHexKeyForFaction("Ally", (key) => keys.add(key));
    return keys;
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
    if (!(atkIsAir && !defIsAir) && !this.isRetaliationBlockedByTowState(defUnit)) {
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
          const stepCost = this.resolveMoveCost(unitDef.moveType, terrain, step, current);
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
        if (hexesMoved > 0) {
          if (Number.isFinite(availableFuel) && fuelSpent > 0) {
            moved.fuel = Math.max(0, Number((moved.fuel - fuelSpent).toFixed(2)));
          }
          moved.entrench = 0;
          const finalKey = axialKey(current);
          console.log(`[Bot AI] ${unit.type} moved from ${fromKey} to ${finalKey} (${visited.length - 1} steps)`);
          this.botPlacements.delete(fromKey);
          this.botPlacements.set(finalKey, moved);
          this.syncBotFuel(current, moved.fuel);
          this.syncBotEntrench(current, moved.entrench);
          occupancy.delete(fromKey);
          occupancy.add(finalKey);
          moves.push({
            unitType: moved.type,
            from: structuredClone(unit.hex),
            to: structuredClone(current),
            path: visited,
            distance: visited.length - 1,
            duration: Math.max(visited.length - 1, 1)
          });
        } else {
          console.log(`[Bot AI] ${unit.type} could not progress along planned path from ${fromKey}; holding position`);
        }
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
        moved.entrench = 0;
        this.allyPlacements.set(axialKey(current), moved);
        this.syncEntrenchForFaction("Ally", current, moved.entrench);
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
        moved.entrench = 0;
        current = structuredClone(step);
        fuelSpent += stepFuel;
        this.botPlacements.set(axialKey(step), moved);
        this.updateBotSupplyPosition(visited[visited.length - 1], step);
        this.syncBotEntrench(step, moved.entrench);
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
      const moveCost = this.resolveMoveCost(moveType, terrain, candidate, origin);
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

  /** Collects aircraft candidates for air-role checks, including player reserves when relevant. */
  private collectAirRoleCandidateUnits(
    faction: TurnFaction,
    includeReserves = faction === "Player"
  ): ScenarioUnit[] {
    const units = Array.from(this.getPlacementMapForFaction(faction).values());
    if (includeReserves && faction === "Player") {
      this.reserves.forEach((entry) => units.push(entry.unit));
    }
    return units;
  }

  /** Reports whether a faction currently fields aircraft that can perform the requested role. */
  private hasFactionAirRoleCapability(
    faction: TurnFaction,
    role: AirSupportRole,
    options: {
      requireAvailable?: boolean;
      includeAssigned?: boolean;
      includeReserves?: boolean;
    } = {}
  ): boolean {
    const {
      requireAvailable = false,
      includeAssigned = false,
      includeReserves = faction === "Player"
    } = options;

    for (const unit of this.collectAirRoleCandidateUnits(faction, includeReserves)) {
      const definition = this.getUnitDefinition(unit.type);
      const roles = definition.airSupport?.roles ?? [];
      if (!this.isAircraft(definition) || !roles.includes(role)) {
        continue;
      }

      if (!requireAvailable) {
        return true;
      }

      const squadronId = this.getSquadronId(unit);
      if (!includeAssigned && this.airMissionAssignmentsByUnit.has(squadronId)) {
        continue;
      }
      if (this.aircraftNeedsRearm(faction, squadronId)) {
        continue;
      }
      return true;
    }

    return false;
  }

  /** CAP is only worthwhile if the player still has available strike aircraft to threaten bot positions. */
  private playerHasAvailableStrikeAircraft(): boolean {
    return this.hasFactionAirRoleCapability("Player", "strike", {
      requireAvailable: true,
      includeAssigned: false,
      includeReserves: true
    });
  }

  /** Escorts matter whenever the player has active or available interception-capable fighters. */
  private playerHasInterceptorPresence(): boolean {
    if (
      Array.from(this.scheduledAirMissions.values()).some(
        (mission) =>
          mission.faction === "Player"
          && mission.template.kind === "airCover"
          && (mission.status === "queued" || mission.status === "inFlight" || mission.status === "resolving")
      )
    ) {
      return true;
    }

    return this.hasFactionAirRoleCapability("Player", "cap", {
      requireAvailable: true,
      includeAssigned: false,
      includeReserves: true
    });
  }

  /**
   * Minimal bot air scheduling heuristic: launch a single CAP mission only when the player still has
   * available strike aircraft that could threaten bot positions next turn.
   */
  private maybeScheduleBasicBotAirCover(): void {
    if (this._phase !== "botTurn") {
      return;
    }
    if (!this.playerHasAvailableStrikeAircraft()) {
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
   * Heuristic air operations: queue every available strike package, pair escorts with queued strikes when
   * the player can intercept them, then attempt a CAP over a strategically valuable area only if the
   * player still fields available strike aircraft. Falls back to a local CAP if no better patrol zone is found.
   */
  private maybeScheduleHeuristicAirOps(): void {
    if (this._phase !== "botTurn") {
      return;
    }
    // 1) Queue every available strike package against the best reachable player assets.
    this.maybeScheduleBotStrikesAgainstPlayer();
    // 2) Pair any free escorts with queued strike packages.
    this.maybeScheduleBotEscortsForQueuedStrikes();
    // 3) Seed a CAP over a high-value zone if a fighter is still free.
    if (!this.maybeScheduleStrategicBotAirCover()) {
      // 4) Fallback to local CAP heuristic.
      this.maybeScheduleBasicBotAirCover();
    }
  }

  /**
   * Strike aircraft should hunt battlefield assets that matter most: armored formations and artillery first,
   * then fall back to softer ground targets if nothing better is available.
   */
  private isPriorityBotStrikeTarget(definition: UnitTypeDefinition): boolean {
    if (definition.moveType === "air") {
      return false;
    }
    if (definition.class === "artillery") {
      return true;
    }
    if (definition.class === "tank" || definition.class === "vehicle") {
      return true;
    }
    const heaviestArmor = Math.max(definition.armor.front, definition.armor.side, definition.armor.top);
    return heaviestArmor >= 6 && definition.combat.weight !== "light";
  }

  /**
   * Captures how dangerous the target is to the bot's ground advance so sorties bias toward decisive battlefield threats.
   */
  private calculateBotStrikeThreatValue(definition: UnitTypeDefinition): number {
    let value = 0;
    value += definition.softAttack * 0.18;
    value += definition.hardAttack * 0.4;
    value += definition.ap * 0.32;
    value += (definition.rangeMax ?? 1) * 1.5;

    if (definition.class === "artillery") {
      value += 14;
    }
    if (definition.class === "tank" || definition.class === "vehicle") {
      value += 10;
    }
    if (definition.combat.role === "antiTank") {
      value += 8;
    }

    const heaviestArmor = Math.max(definition.armor.front, definition.armor.side, definition.armor.top);
    if (heaviestArmor >= 6 && definition.combat.weight !== "light") {
      value += 6;
    }

    return value;
  }

  /**
   * Different strike aircraft should value different target classes even before raw damage is considered.
   */
  private calculateBotStrikeRoleBonus(
    attackerDef: UnitTypeDefinition,
    targetDef: UnitTypeDefinition
  ): number {
    const priorityTarget = this.isPriorityBotStrikeTarget(targetDef);

    if (attackerDef.combat.role === "antiVehicle") {
      if (targetDef.class === "artillery") {
        return 10;
      }
      return priorityTarget ? 12 : -12;
    }

    if (attackerDef.combat.role === "antiInfantry") {
      if (targetDef.class === "artillery") {
        return 10;
      }
      if (targetDef.class === "infantry" || targetDef.class === "specialist") {
        return 0;
      }
      return priorityTarget ? 6 : -2;
    }

    return priorityTarget ? 4 : 0;
  }

  /**
   * Raw expected damage is discounted when the sortie is hitting a low-value target for its aircraft role.
   */
  private scoreBotStrikeEffectValue(
    attackerDef: UnitTypeDefinition,
    targetDef: UnitTypeDefinition,
    strikeDamage: number
  ): number {
    if (strikeDamage <= 0) {
      return 0;
    }

    const priorityTarget = this.isPriorityBotStrikeTarget(targetDef);
    let multiplier = 0.4;

    if (attackerDef.combat.role === "antiVehicle") {
      multiplier = priorityTarget ? 0.7 : 0.25;
    } else if (attackerDef.combat.role === "antiInfantry") {
      if (targetDef.class === "artillery") {
        multiplier = 0.65;
      } else if (targetDef.class === "infantry" || targetDef.class === "specialist") {
        multiplier = 0.4;
      } else if (priorityTarget) {
        multiplier = 0.35;
      }
    } else if (priorityTarget) {
      multiplier = 0.55;
    }

    let value = strikeDamage * multiplier;
    if (targetDef.class === "artillery") {
      value += 6;
    } else if (priorityTarget) {
      value += 4;
    }
    return value;
  }

  /**
   * Rates bot strike targets so both bomber classes prefer armor and artillery over convenience shots.
   */
  private scoreBotStrikeTarget(attackerDef: UnitTypeDefinition, origin: Axial, target: ScenarioUnit): number {
    const targetDef = this.getUnitDefinition(target.type);
    if (targetDef.moveType === "air") {
      return Number.NEGATIVE_INFINITY;
    }

    const distance = hexDistance(origin, target.hex);
    let score = Math.max(0, 18 - distance * 2);

    if (this.isPriorityBotStrikeTarget(targetDef)) {
      score += 34;
    } else {
      score -= 10;
    }

    score += this.calculateBotStrikeThreatValue(targetDef) * 0.45;
    score += this.calculateBotStrikeRoleBonus(attackerDef, targetDef);

    if (targetDef.combat.role === "antiTank") {
      score += 4;
    }

    score += Math.max(0, (target.strength ?? 100) * 0.05);
    return score;
  }

  /** Collects unassigned, mission-ready bot aircraft for a specific sortie role. */
  private collectAvailableBotAircraftForRole(role: "strike" | "escort" | "cap"): ScenarioUnit[] {
    return Array.from(this.botPlacements.values()).filter((unit) => {
      const def = this.getUnitDefinition(unit.type);
      const profile = def.airSupport;
      if (!this.isAircraft(def) || !profile || !profile.roles?.includes(role)) {
        return false;
      }
      const squadronId = this.getSquadronId(unit);
      if (this.airMissionAssignmentsByUnit.has(squadronId)) {
        return false;
      }
      if (this.aircraftNeedsRearm("Bot", squadronId)) {
        return false;
      }
      return true;
    });
  }

  /** Mirrors the strike-resolution damage scaling so scheduling decisions reflect the real attack profile. */
  private scaleAirMissionAttackResult(
    result: ReturnType<typeof resolveAttack>,
    attackingDefinition: UnitTypeDefinition,
    defendingDefinition: UnitTypeDefinition
  ): ReturnType<typeof resolveAttack> {
    if (this.isBomber(attackingDefinition) && !this.isAircraft(defendingDefinition)) {
      return {
        ...result,
        damagePerHit: result.damagePerHit * 10,
        expectedDamage: result.expectedDamage * 10,
        expectedSuppression: result.expectedSuppression * 10
      };
    }

    if (this.isAircraft(attackingDefinition) && !this.isBomber(attackingDefinition) && this.isAircraft(defendingDefinition)) {
      return {
        ...result,
        damagePerHit: result.damagePerHit * 4,
        expectedDamage: result.expectedDamage * 4,
        expectedSuppression: result.expectedSuppression * 4
      };
    }

    return result;
  }

  /** Estimates how much damage a strike aircraft should inflict if it reaches the target. */
  private estimateBotStrikeDamageAgainstTarget(attacker: ScenarioUnit, target: ScenarioUnit): number {
    const req = this.buildMissionAttackRequest("Bot", attacker, target);
    if (!req) {
      return 0;
    }
    const attackerDef = this.getUnitDefinition(attacker.type);
    const targetDef = this.getUnitDefinition(target.type);
    const scaled = this.scaleAirMissionAttackResult(resolveAttack(req), attackerDef, targetDef);
    return Math.max(0, Math.round(scaled.expectedDamage));
  }

  /**
   * Estimates expected bomber attrition from player flak/CAP for a prospective strike, while respecting any
   * defensive shots already likely to be consumed by earlier queued raids in the same turn.
   */
  private estimateBotStrikeAttrition(
    attacker: ScenarioUnit,
    targetHex: Axial,
    escort: ScenarioUnit | null,
    reservedFlakIds: ReadonlySet<string>,
    reservedCapMissionIds: ReadonlySet<string>
  ): {
    expectedAttrition: number;
    bomberStrengthAfter: number;
    bomberDestroyed: boolean;
    engagedFlakIds: string[];
    engagedCapMissionIds: string[];
  } {
    const attackerDef = this.getUnitDefinition(attacker.type);
    let currentBomber = structuredClone(attacker);
    let expectedAttrition = 0;
    const engagedFlakIds: string[] = [];
    const engagedCapMissionIds: string[] = [];

    const flakUnits = this.findAllActiveFlakUnitsForHex("Player", targetHex).filter((entry) => {
      const flakId = this.getSquadronId(entry.unit);
      return !reservedFlakIds.has(flakId);
    });

    for (const flakEntry of flakUnits) {
      if (currentBomber.strength <= 0) {
        break;
      }

      const flakReq = this.buildMissionAttackRequest("Player", flakEntry.unit, currentBomber);
      if (!flakReq) {
        continue;
      }

      let flakResult = resolveAttack(flakReq);
      const flakDef = this.getUnitDefinition(flakEntry.unit.type);
      if (this.hasAntiAirCapability(flakDef) && this.isAircraft(attackerDef)) {
        flakResult = {
          ...flakResult,
          accuracy: flakResult.accuracy * 0.25,
          expectedHits: flakResult.expectedHits * 0.25,
          expectedDamage: flakResult.expectedDamage * 0.25,
          expectedSuppression: flakResult.expectedSuppression * 0.25
        };
      }

      const suffered = Math.max(0, Math.round(flakResult.expectedDamage));
      engagedFlakIds.push(this.getSquadronId(flakEntry.unit));
      expectedAttrition += suffered;
      currentBomber = {
        ...currentBomber,
        strength: Math.max(0, currentBomber.strength - suffered)
      };
    }

    if (currentBomber.strength <= 0) {
      return {
        expectedAttrition,
        bomberStrengthAfter: 0,
        bomberDestroyed: true,
        engagedFlakIds,
        engagedCapMissionIds
      };
    }

    const capOverrides = new Map<string, ScenarioUnit>();
    const availableCapMissions = this.findAllActiveAirCoverForHex("Player", axialKey(targetHex)).filter(
      (mission) => mission.interceptions < 1 && !reservedCapMissionIds.has(mission.id)
    );

    if (escort && availableCapMissions.length > 0) {
      const escortedCap = availableCapMissions[0];
      const capLookup = this.lookupUnitBySquadronId(escortedCap.unitKey, "Player");
      if (capLookup) {
        const capUnit = structuredClone(capLookup.unit);
        const escortReq = this.buildMissionAttackRequest("Bot", escort, capUnit);
        if (escortReq) {
          const escortDef = this.getUnitDefinition(escort.type);
          const capDef = this.getUnitDefinition(capUnit.type);
          const escortResult = this.scaleAirMissionAttackResult(resolveAttack(escortReq), escortDef, capDef);
          const inflicted = Math.max(0, Math.round(escortResult.expectedDamage));
          capUnit.strength = Math.max(0, capUnit.strength - inflicted);
          if (capUnit.strength <= 0) {
            engagedCapMissionIds.push(escortedCap.id);
          } else {
            capOverrides.set(escortedCap.id, capUnit);
          }
        }
      }
    }

    for (const capMission of availableCapMissions) {
      if (currentBomber.strength <= 0 || engagedCapMissionIds.includes(capMission.id)) {
        continue;
      }

      const capLookup = this.lookupUnitBySquadronId(capMission.unitKey, "Player");
      const capUnit = capOverrides.get(capMission.id) ?? capLookup?.unit;
      if (!capUnit) {
        continue;
      }

      const capReq = this.buildMissionAttackRequest("Player", capUnit, currentBomber);
      if (!capReq) {
        continue;
      }

      const capDef = this.getUnitDefinition(capUnit.type);
      const capResult = this.scaleAirMissionAttackResult(resolveAttack(capReq), capDef, attackerDef);
      const suffered = Math.max(0, Math.round(capResult.expectedDamage));
      engagedCapMissionIds.push(capMission.id);
      expectedAttrition += suffered;
      currentBomber = {
        ...currentBomber,
        strength: Math.max(0, currentBomber.strength - suffered)
      };
    }

    return {
      expectedAttrition,
      bomberStrengthAfter: currentBomber.strength,
      bomberDestroyed: currentBomber.strength <= 0,
      engagedFlakIds,
      engagedCapMissionIds
    };
  }

  /** Tracks strike saturation so multiple bombers spread across valuable targets before doubling up. */
  private getBotStrikeTargetAssignmentKey(target: ScenarioUnit): string {
    this.ensureUnitId(target);
    return target.unitId ?? axialKey(target.hex);
  }

  /** Attempts to schedule every available bot strike mission against high-value player ground units in range. */
  private maybeScheduleBotStrikesAgainstPlayer(): number {
    if (this._phase !== "botTurn") {
      return 0;
    }

    const playerUnits = Array.from(this.playerPlacements.values()).filter(
      (candidate) => this.getUnitDefinition(candidate.type).moveType !== "air"
    );
    if (playerUnits.length === 0) {
      return 0;
    }

    const strikeAircraft = this.collectAvailableBotAircraftForRole("strike").sort(
      (left, right) => (right.strength ?? 100) - (left.strength ?? 100)
    );
    if (strikeAircraft.length === 0) {
      return 0;
    }

    const escortPool = this.playerHasInterceptorPresence()
      ? this.collectAvailableBotAircraftForRole("escort").sort((left, right) => (right.strength ?? 100) - (left.strength ?? 100))
      : [];

    const queuedStrikeLoadByTarget = new Map<string, number>();
    for (const mission of this.scheduledAirMissions.values()) {
      if (mission.faction !== "Bot" || mission.template.kind !== "strike" || mission.status !== "queued") {
        continue;
      }
      const targetKey = mission.targetUnitKey ?? (mission.targetHex ? axialKey(mission.targetHex) : null);
      if (!targetKey) {
        continue;
      }
      queuedStrikeLoadByTarget.set(targetKey, (queuedStrikeLoadByTarget.get(targetKey) ?? 0) + 1);
    }

    const reservedFlakIds = new Set<string>();
    const reservedCapMissionIds = new Set<string>();
    let scheduled = 0;
    let reservedEscortCount = 0;
    for (const unit of strikeAircraft) {
      const def = this.getUnitDefinition(unit.type);
      const escortCandidate = reservedEscortCount < escortPool.length ? escortPool[reservedEscortCount] : null;
      const remainingRaidMass = Math.max(1, strikeAircraft.length - scheduled);
      const waveSupportFactor = 1 + Math.max(0, remainingRaidMass - 1) * 0.35;
      const rankedTargets = playerUnits
        .map((candidate) => {
          const candidateDef = this.getUnitDefinition(candidate.type);
          const strikeDamage = this.estimateBotStrikeDamageAgainstTarget(unit, candidate);
          const damageValue = this.scoreBotStrikeEffectValue(def, candidateDef, strikeDamage);
          const attrition = this.estimateBotStrikeAttrition(
            unit,
            candidate.hex,
            escortCandidate,
            reservedFlakIds,
            reservedCapMissionIds
          );
          const targetLoadPenalty = (queuedStrikeLoadByTarget.get(this.getBotStrikeTargetAssignmentKey(candidate)) ?? 0)
            * (this.isPriorityBotStrikeTarget(candidateDef) ? 28 : 18);
          const destructionPenalty = attrition.bomberDestroyed ? 90 : 0;
          const crippledPenalty = attrition.bomberStrengthAfter <= 35 ? 32 : attrition.bomberStrengthAfter <= 55 ? 14 : 0;
          const riskPenalty = (attrition.expectedAttrition * 1.25 + destructionPenalty + crippledPenalty) / waveSupportFactor;
          let score =
            this.scoreBotStrikeTarget(def, unit.hex, candidate)
            + damageValue
            - riskPenalty
            - targetLoadPenalty;

          if (escortCandidate) {
            score += 8;
          }
          if (attrition.bomberDestroyed && !escortCandidate && remainingRaidMass <= 1) {
            score -= 36;
          }
          if (attrition.bomberStrengthAfter <= 40 && !escortCandidate && remainingRaidMass <= 1) {
            score -= 18;
          }
          if (attrition.expectedAttrition >= Math.max(18, damageValue) && !this.isPriorityBotStrikeTarget(candidateDef)) {
            score -= 18;
          }

          return {
            target: candidate,
            score,
            attrition,
            shouldReserveEscort: escortCandidate !== null
          };
        })
        .sort((a, b) => b.score - a.score);

      if (rankedTargets.length === 0) {
        continue;
      }

      const origin = structuredClone(unit.hex);
      for (const rankedTarget of rankedTargets) {
        const { target, score, attrition, shouldReserveEscort } = rankedTarget;
        if (score < 14) {
          continue;
        }
        const targetHex = structuredClone(target.hex);
        const result = this.tryScheduleAirMission({ kind: "strike", faction: "Bot", unitHex: origin, targetHex });
        if (result.ok) {
          const targetKey = this.getBotStrikeTargetAssignmentKey(target);
          queuedStrikeLoadByTarget.set(targetKey, (queuedStrikeLoadByTarget.get(targetKey) ?? 0) + 1);
          attrition.engagedFlakIds.forEach((flakId) => reservedFlakIds.add(flakId));
          attrition.engagedCapMissionIds.forEach((missionId) => reservedCapMissionIds.add(missionId));
          if (shouldReserveEscort) {
            reservedEscortCount += 1;
          }
          scheduled += 1;
          break;
        }
      }
    }

    return scheduled;
  }

  /** Attempts to schedule escorts for queued bot strike packages while fighters remain available. */
  private maybeScheduleBotEscortsForQueuedStrikes(): number {
    if (!this.playerHasInterceptorPresence()) {
      return 0;
    }

    const queuedBotStrikes = Array.from(this.scheduledAirMissions.values()).filter(
      (m) => m.faction === "Bot" && m.template.kind === "strike" && m.status === "queued"
    );
    if (queuedBotStrikes.length === 0) {
      return 0;
    }

    let scheduled = 0;
    for (const queuedBotStrike of queuedBotStrikes) {
      const alreadyEscorted = Array.from(this.scheduledAirMissions.values()).some(
        (mission) =>
          mission.faction === "Bot"
          && mission.template.kind === "escort"
          && mission.status === "queued"
          && mission.escortTargetUnitKey === queuedBotStrike.unitKey
      );
      if (alreadyEscorted) {
        continue;
      }

      const protectedLookup = this.lookupUnitBySquadronId(queuedBotStrike.unitKey, "Bot");
      const bomberHex =
        protectedLookup?.unit.hex
        ?? (queuedBotStrike.originHexKey ? GameEngine.parseAxialKey(queuedBotStrike.originHexKey) : null);
      if (!bomberHex) {
        continue;
      }

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
          scheduled += 1;
          break;
        }
      }
    }

    return scheduled;
  }

  /** Attempts to schedule CAP near the most relevant player-held objective by covering the nearest friendly unit. */
  private maybeScheduleStrategicBotAirCover(): boolean {
    if (!this.playerHasAvailableStrikeAircraft()) {
      return false;
    }

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
    fallback: ScenarioUnit["facing"] = "NW"
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
      E: pixelVector(1, 0),
      NE: pixelVector(1, -1),
      NW: pixelVector(0, -1),
      W: pixelVector(-1, 0),
      SW: pixelVector(-1, 1),
      SE: pixelVector(0, 1)
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

  private normalizeHexEdgeFacing(facing: HexEdgeFacing | string | null | undefined): HexEdgeFacing | null {
    if (facing === null || facing === undefined) {
      return null;
    }
    return normalizeFacingDirection(facing, "NW");
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

    const lister = this.createLosLister();
    const hasDirectLOS = losClearAdvanced({
      attackerClass: attackerDef.class,
      attackerHex,
      targetHex,
      isAttackerAir: attackerDef.moveType === "air",
      lister,
      purpose: "direct-fire"
    });
    let isSpottedOnly = false;
    if (!hasDirectLOS) {
      if (!this.canAttackWithoutDirectLOS(attackerDef) || !this.checkTargetSpotted(targetHex, "Bot")) {
        return null;
      }
      isSpottedOnly = true;
    }

    const distance = hexDistance(attackerHex, targetHex);
    const minRange = attackerDef.rangeMin ?? 1;
    const maxRange = attackerDef.rangeMax ?? 1;
    if (distance < minRange || distance > maxRange) {
      return null;
    }

    if (attackerIsAircraft && !defenderIsAircraft) {
      const defHexKey = axialKey(targetHex);

      // === FLAK ENGAGEMENT: Player AA intercepts bot aircraft before CAP ===
      const flakUnits = this.findAllActiveFlakUnitsForHex("Player", targetHex);
      const atkKey = axialKey(attackerHex);

      if (flakUnits.length > 0) {
        const flakInterceptorsForEvent: Array<{
          faction: TurnFaction;
          unitKey: string;
          unitType: string;
          hex: Axial;
        }> = [];

        for (const flakEntry of flakUnits) {
          flakInterceptorsForEvent.push({
            faction: "Player",
            unitKey: this.getSquadronId(flakEntry.unit),
            unitType: flakEntry.unit.type as string,
            hex: structuredClone(flakEntry.unit.hex)
          });
        }

        // Track bot bomber as variable since it may be destroyed
        const bomberStrengthBeforeFlak = attackingUnit.strength;
        let currentAtk = attackingUnit;
        let flakDamage = 0;
        let bomberDestroyedByFlak = false;

        for (const flakEntry of flakUnits) {
          if (currentAtk.strength <= 0) break;

          const flakReq = this.buildMissionAttackRequest("Player", flakEntry.unit, currentAtk);
          if (!flakReq) continue;

          // Ground-based AA has severe accuracy penalty against fast-moving, distant aircraft
          let flakResult = resolveAttack(flakReq);
          const flakDef = this.getUnitDefinition(flakEntry.unit.type);
          if (this.hasAntiAirCapability(flakDef) && this.isAircraft(attackerDef)) {
            // Apply 75% accuracy reduction for ground AA vs aircraft (small, fast, distant targets)
            flakResult = {
              ...flakResult,
              accuracy: flakResult.accuracy * 0.25,
              expectedHits: flakResult.expectedHits * 0.25,
              expectedDamage: flakResult.expectedDamage * 0.25,
              expectedSuppression: flakResult.expectedSuppression * 0.25
            };
          }

          const suffered = Math.max(0, Math.round(flakResult.expectedDamage));
          const updatedAtk = structuredClone(currentAtk);
          updatedAtk.strength = Math.max(0, updatedAtk.strength - suffered);
          flakDamage += suffered;

          this.recordFlakEngagement("Player", flakEntry.unit, flakEntry.hexKey);

          if (updatedAtk.strength <= 0) {
            this.botPlacements.delete(atkKey);
            this.removeBotSupplyEntryFor(attackerHex);
            this.invalidateRosterCache();
            currentAtk = updatedAtk;
            attackingUnit = updatedAtk;
            bomberDestroyedByFlak = true;
            break;
          }

          currentAtk = updatedAtk;
          attackingUnit = updatedAtk;  // Update for subsequent CAP checks
        }

        this.pendingAirEngagements.push({
          type: "flak",
          location: structuredClone(targetHex),
          bomber: {
            faction: "Bot",
            unitKey: atkKey,
            unitType: attackingUnit.type as string,
            strength: bomberStrengthBeforeFlak
          },
          interceptors: flakInterceptorsForEvent,
          escorts: [],
          flakDamage,
          bomberStrengthBefore: bomberStrengthBeforeFlak,
          bomberStrengthAfter: currentAtk.strength,
          bomberDestroyed: bomberDestroyedByFlak
        });

        if (bomberDestroyedByFlak) {
          return null;  // Bot attack aborted, aircraft destroyed
        }
      }

      const capMissions = this.findAllActiveAirCoverForHex("Player", defHexKey).filter((m) => m.interceptions < 1);
      const botAttackerSquadronId = this.getSquadronId(attackingUnit);
      const escortMissions = this.findAllActiveEscortsForUnit("Bot", botAttackerSquadronId).filter((m) => m.interceptions < 1);
      if (capMissions.length > 0) {
        const bomberStrengthBeforeCap = attackingUnit.strength;
        let bomberDestroyedByCap = false;
        let interceptorAttrition = 0;
        let escortAttrition = 0;
        let interceptorKills = 0;
        const interceptorsForEvent: Array<{ faction: TurnFaction; unitKey: string; unitType: string; strength?: number }> = [];
        const escortsForEvent: Array<{ faction: TurnFaction; unitKey: string; unitType: string; strength?: number }> = [];
        for (const cap of capMissions) {
          const capLookup = this.lookupUnitBySquadronId(cap.unitKey, "Player");
          if (capLookup) {
            interceptorsForEvent.push({
              faction: "Player",
              unitKey: cap.unitKey,
              unitType: capLookup.unit.type as string,
              strength: capLookup.unit.strength
            });
          }
        }
        for (const em of escortMissions) {
          const escortLookup = this.lookupUnitBySquadronId(em.unitKey, "Bot");
          if (escortLookup) {
            escortsForEvent.push({
              faction: "Bot",
              unitKey: em.unitKey,
              unitType: escortLookup.unit.type as string,
              strength: escortLookup.unit.strength
            });
          }
        }

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
          interceptorAttrition += inflicted;
          const updatedCap = structuredClone(capUnit);
          updatedCap.strength = Math.max(0, updatedCap.strength - inflicted);
          this.spendAircraftAmmo("Bot", escort.unitKey, true);
          escort.interceptions += 1;
          this.playerPlacements.set(capHexKey, updatedCap);
          this.syncPlayerStrength(updatedCap.hex, updatedCap.strength);
          if (updatedCap.strength <= 0) {
            interceptorKills += 1;
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
          attackingUnit = updatedAtkBefore;
          if (updatedAtkBefore.strength <= 0) {
            this.botPlacements.delete(atkKey);
            this.removeBotSupplyEntryFor(attackerHex);
            this.invalidateRosterCache();
            bomberDestroyedByCap = true;
            break;
          }
        }

        this.pendingAirEngagements.push({
          type: "airToAir",
          location: structuredClone(targetHex),
          bomber: {
            faction: "Bot",
            unitKey: atkKey,
            unitType: attackingUnit.type as string,
            strength: bomberStrengthBeforeCap
          },
          interceptors: interceptorsForEvent,
          escorts: escortsForEvent,
          bomberStrengthBefore: bomberStrengthBeforeCap,
          bomberStrengthAfter: currentAtk.strength,
          bomberDestroyed: bomberDestroyedByCap,
          interceptorAttrition,
          interceptorKills,
          escortAttrition
        });

        if (bomberDestroyedByCap) {
          return null;
        }
      }
    }

    const defenderMods = this.getHexModifications(defender.hex);
    const defenderFortificationFacings = defenderMods
      .filter((entry) => entry.type === "fortifications")
      .map((entry) => entry.facing)
      .filter((edge): edge is HexEdgeFacing => edge !== null && edge !== undefined);
    const defenderFortified = defenderFortificationFacings.length > 0;
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
        isSpottedOnly,
        stance: isAssault ? "assault" : undefined,
        fortified: defenderFortified,
        fortificationFacings: defenderFortificationFacings
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
    const defenderWasOnSentry = defender.onSentry === true;
    const updatedPlayer = structuredClone(defender);
    updatedPlayer.facing = this.resolveFacingToward(targetHex, attackerHex, defender.facing);
    updatedPlayer.onSentry = false;
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
        // Apply suppression ONLY if using suppressive fire (not assault)
        if (effectiveStance === "suppressive") {
          const attackerUnitId = attackingUnit.unitId ?? axialKey(attackerHex);
          if (!updatedPlayer.suppressedBy) {
            updatedPlayer.suppressedBy = [];
          }
          if (!updatedPlayer.suppressedBy.includes(attackerUnitId)) {
            updatedPlayer.suppressedBy.push(attackerUnitId);
            this.playerPlacements.set(playerKey, updatedPlayer);
            console.log(`[GameEngine] *** SUPPRESSION APPLIED *** Player unit ${updatedPlayer.type} at ${playerKey} suppressed by ${attackerUnitId}, suppressedBy array:`, updatedPlayer.suppressedBy);
          }
        }
      } else {
        this.allyPlacements.set(playerKey, updatedPlayer);
        // Apply suppression ONLY if using suppressive fire (not assault)
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
    updatedBot.onSentry = false;
    if (attackerIsAircraft) {
      this.spendAircraftAmmo("Bot", botKey, defenderIsAircraft);
      updatedBot.ammo = Math.max(0, updatedBot.ammo - 1);
    } else {
      updatedBot.ammo = Math.max(0, updatedBot.ammo - groundAttackAmmoCost);
    }

    // If assault attack destroyed the defender and attacker is ground unit, move attacker to defender's hex
    const defenderDestroyed = updatedPlayer.strength <= 0;
    const isAssaultKill = effectiveStance === "assault" && defenderDestroyed && !attackerIsAircraft && !defenderIsAircraft;
    let attackerMovedToDefenderHex = false;

    if (isAssaultKill) {
      console.log(`[GameEngine] Bot assault kill: moving ${attackingUnit.type} from ${botKey} to ${playerKey}`);
      // Remove from old position
      this.botPlacements.delete(botKey);
      this.botActionFlags.delete(botKey);

      // Update hex position
      updatedBot.hex = targetHex;

      // Place at new position
      this.botPlacements.set(playerKey, updatedBot);
      attackerMovedToDefenderHex = true;
    } else {
      this.botPlacements.set(botKey, updatedBot);
    }

    let retaliationResult: AttackResult | undefined;
    let attackerStrengthAfter = updatedBot.strength;
    if (defenderFaction === "Player" && (defenderWasOnSentry || updatedPlayer.strength > 0) && !(attackerIsAircraft && !defenderIsAircraft)) {
      let retaliationAllowed = true;
      const retaliationDefender = structuredClone(defenderWasOnSentry ? defender : updatedPlayer);
      retaliationDefender.facing = this.resolveFacingToward(targetHex, attackerHex, retaliationDefender.facing);
      retaliationDefender.onSentry = false;
      if (this.isRetaliationBlockedByTowState(retaliationDefender)) {
        retaliationAllowed = false;
      }
      if (this.resolveUnitSuppressionState(retaliationDefender).state === "pinned") {
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
        if (defenderFlags.retaliationsUsed >= combatBalance.counterfire.maxRetaliationsPerTurn) {
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
          const defenderAmmo = typeof retaliationDefender.ammo === "number" ? retaliationDefender.ammo : null;
          if (defenderAmmo !== null && defenderAmmo < defenderGroundAmmoCost) {
            retaliationAllowed = false;
          }
        }
      }

      const retaliationReq = retaliationAllowed
        ? this.buildAttackRequest(retaliationDefender, updatedBot, "Player", "Bot", {
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
            if (updatedPlayer.strength > 0) {
              this.playerPlacements.set(playerKey, updatedPlayer);
              this.syncPlayerAmmo(targetHex, updatedPlayer.ammo);
            }
          }
        } else if (typeof updatedPlayer.ammo === "number") {
          updatedPlayer.ammo = Math.max(0, updatedPlayer.ammo - defenderGroundAmmoCost);
          if (updatedPlayer.strength > 0) {
            this.playerPlacements.set(playerKey, updatedPlayer);
            this.syncPlayerAmmo(targetHex, updatedPlayer.ammo);
          }
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
  private updateBotSupplyPosition(from: Axial, to: Axial, unitId?: string | null): void {
    const idx = this.findSupplyEntryIndex(this.botSupply, from, unitId);
    if (idx >= 0) {
      this.botSupply[idx].hex = structuredClone(to);
    }
  }

  /** Sync defender strength to bot supply mirror after combat. */
  private syncBotStrength(defenderHex: Axial, strength: number, unitId?: string | null): void {
    const idx = this.findSupplyEntryIndex(this.botSupply, defenderHex, unitId);
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
    const combat = normalizeCombatClassification((definition as { combat?: CombatClassification }).combat, key);
    return {
      ...(definition as UnitTypeDefinition),
      class: unitClass,
      combat
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

  private lookupTileDetails(hex: Axial): TileDefinition | null {
    const entry = this.lookupTileEntry(hex);
    if (!entry) {
      return null;
    }
    const paletteEntry = this.scenario.tilePalette[entry.tile];
    if (!paletteEntry) {
      return null;
    }
    const mergedFeatures = (entry.features ?? paletteEntry.features)
      ? [...(entry.features ?? paletteEntry.features)]
      : [];
    return {
      ...paletteEntry,
      density: entry.density ?? paletteEntry.density,
      features: mergedFeatures as TileDefinition["features"],
      recon: entry.recon ?? paletteEntry.recon
    };
  }

  /** Translate palette entry into the canonical terrain definition used by combat and supply logic. */
  private terrainAt(hex: Axial): TerrainDefinition | null {
    const tile = this.lookupTileDetails(hex);
    if (!tile) {
      return null;
    }
    const terrainDefinition = this.terrain[tile.terrain as keyof TerrainDictionary];
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
  private removeSupplyEntryFor(hex: Axial, unitId?: string | null): void {
    const index = this.findSupplyEntryIndex(this.playerSupply, hex, unitId);
    if (index >= 0) {
      this.playerSupply.splice(index, 1);
    }
  }

  /** Remove bot supply entry associated with the provided hex. */
  private removeBotSupplyEntryFor(hex: Axial, unitId?: string | null): void {
    const index = this.findSupplyEntryIndex(this.botSupply, hex, unitId);
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

  /** Formats a battle hex into the offset coordinate display used by the UI. */
  private formatAxial(hex: Axial): string {
    return this.toOffsetKey(hex);
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
        queuedHex: asset.queuedHex,
        queuedByHex: asset.queuedByHex
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
        location: this.formatAxial(unit.hex),
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
        location: this.formatAxial(casualty.unit.hex),
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
      interceptorAttrition?: number;
      escortAttrition?: number;
      notes?: string[];
    } = {}
  ): void {
    const { outcome, event, kills, bomberAttrition, interceptorAttrition, escortAttrition, notes } = options;
    // Derive metrics from outcome meta if not explicitly provided
    const derivedKills = kills ?? (
      outcome?.meta
        ? {
            escorts: outcome.meta.escortKills ?? outcome.meta.escortsWins ?? 0,
            cap: outcome.meta.interceptorKills ?? outcome.meta.capKills ?? 0
          }
        : undefined
    );
    const derivedAttrition = bomberAttrition ?? (outcome?.meta?.bomberAttrition ?? undefined);
    const derivedInterceptorAttrition = interceptorAttrition ?? (outcome?.meta?.interceptorAttrition ?? undefined);
    const derivedEscortAttrition = escortAttrition ?? (outcome?.meta?.escortAttrition ?? undefined);
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
      interceptorAttrition: derivedInterceptorAttrition,
      escortAttrition: derivedEscortAttrition,
      notes
    };

    this.airMissionReports.push(entry);
    if (this.airMissionReports.length > 50) {
      this.airMissionReports.shift();
    }
  }

  private addMissionAirCombatInflicted(mission: ScheduledAirMission | undefined, damage: number, kills = 0): void {
    if (!mission) {
      return;
    }
    mission.airCombatDamageInflicted += Math.max(0, Math.round(damage));
    mission.airCombatKills += Math.max(0, Math.round(kills));
  }

  private addMissionAirCombatTaken(mission: ScheduledAirMission | undefined, damage: number): void {
    if (!mission) {
      return;
    }
    mission.airCombatDamageTaken += Math.max(0, Math.round(damage));
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
      return "Hold position and stay uncommitted this turn to use field actions.";
    }
    return null;
  }

  private resolveSentryAvailability(
    hex: Axial,
    unit: ScenarioUnit,
    flags: ReturnType<GameEngine["createDefaultActionFlags"]>
  ): { available: boolean; reason: string | null } {
    if (this._phase !== "playerTurn") {
      return { available: false, reason: "Sentry orders are available only during the player turn." };
    }
    if (this.isAutomatedPlayerUnit(unit)) {
      return { available: false, reason: "Automated logistics convoys do not accept sentry orders." };
    }
    if (!this.playerPlacements.has(axialKey(hex))) {
      return { available: false, reason: "No player formation occupies this hex." };
    }
    if (unit.onSentry) {
      return { available: false, reason: "This formation is already on sentry." };
    }
    if (this.resolveTowState(unit) === "towed") {
      return { available: false, reason: "Deploy the battery before placing it on sentry." };
    }
    if (this.resolveUnitSuppressionState(unit).state === "pinned") {
      return { available: false, reason: "Pinned formations cannot be placed on sentry." };
    }
    if (flags.attacksUsed > 0 || flags.movementPointsUsed > 0) {
      return { available: false, reason: "Hold position and stay uncommitted this turn to set sentry." };
    }
    return { available: true, reason: null };
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
    if (definition.class !== "infantry") {
      return { available: false, reason: "Only infantry formations can dig in." };
    }
    if (this.isTowableUnit(unit)) {
      return { available: false, reason: "Towable artillery cannot entrench." };
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
  ): {
    available: boolean;
    reason: string | null;
    byType: Record<HexModificationType, { available: boolean; reason: string | null }>;
  } {
    const byType: Record<HexModificationType, { available: boolean; reason: string | null }> = {
      fortifications: this.resolveBuildModificationAvailabilityForType(hex, unit, definition, flags, "fortifications"),
      tankTraps: this.resolveBuildModificationAvailabilityForType(hex, unit, definition, flags, "tankTraps"),
      clearedPath: this.resolveBuildModificationAvailabilityForType(hex, unit, definition, flags, "clearedPath")
    };
    const available = Object.values(byType).some((entry) => entry.available);
    return {
      available,
      reason: available
        ? null
        : byType.fortifications.reason ?? byType.tankTraps.reason ?? byType.clearedPath.reason ?? null,
      byType
    };
  }

  private resolveBuildModificationAvailabilityForType(
    hex: Axial,
    unit: ScenarioUnit,
    definition: UnitTypeDefinition,
    flags: ReturnType<GameEngine["createDefaultActionFlags"]>,
    type: HexModificationType
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
    const existingMods = this.hexModifications.get(axialKey(hex)) ?? [];
    if (type === "fortifications" || type === "tankTraps") {
      const occupiedEdges = new Set(
        existingMods
          .filter((entry) => entry.type === type)
          .map((entry) => entry.facing)
          .filter((edge): edge is HexEdgeFacing => edge !== null && edge !== undefined)
      );
      if (occupiedEdges.size >= 6) {
        return {
          available: false,
          reason: `All six hex edges already contain ${type === "fortifications" ? "fortifications" : "tank traps"}.`
        };
      }
      return { available: true, reason: null };
    }

    const tile = this.lookupTileDetails(hex);
    if (!this.tileCanHostRoad(tile)) {
      return {
        available: false,
        reason: "Cleared paths can be cut only across land hexes."
      };
    }
    if (this.tileHasRoadSurface(tile)) {
      return {
        available: false,
        reason: "This hex already has a road surface."
      };
    }
    const currentLevel = this.getHexModificationLevel(hex, "clearedPath");
    if (currentLevel >= 3) {
      return {
        available: false,
        reason: "This hex already has a fully developed cleared path."
      };
    }
    return { available: true, reason: null };
  }

  private resolveMoveOutAvailability(
    hex: Axial,
    unit: ScenarioUnit,
    definition: UnitTypeDefinition,
    flags: ReturnType<GameEngine["createDefaultActionFlags"]>
  ): { available: boolean; reason: string | null } {
    if (this._phase !== "playerTurn") {
      return { available: false, reason: "Move-out orders are available only during the player turn." };
    }
    if (!this.isTowableUnit(unit)) {
      return { available: false, reason: "This formation does not require towing drills." };
    }
    if (this.isAutomatedPlayerUnit(unit)) {
      return { available: false, reason: "Automated logistics convoys do not accept towing orders." };
    }
    if (!this.playerPlacements.has(axialKey(hex))) {
      return { available: false, reason: "No player formation occupies this hex." };
    }
    if (this.resolveTowState(unit) === "towed") {
      return { available: false, reason: "This formation is already limbered and ready to tow." };
    }
    if (unit.onSentry) {
      return { available: false, reason: "Cancel sentry before limbering the guns." };
    }
    if (this.resolveUnitSuppressionState(unit).state === "pinned") {
      return { available: false, reason: "Pinned formations cannot hook up for towing." };
    }
    if (flags.attacksUsed > 0 || flags.movementPointsUsed > 0) {
      return { available: false, reason: "Hook-up drills require the battery to start the turn uncommitted." };
    }
    return { available: true, reason: null };
  }

  private resolveTowDeployAvailability(
    hex: Axial,
    unit: ScenarioUnit,
    definition: UnitTypeDefinition,
    flags: ReturnType<GameEngine["createDefaultActionFlags"]>
  ): { available: boolean; reason: string | null } {
    if (this._phase !== "playerTurn") {
      return { available: false, reason: "Deployment drills are available only during the player turn." };
    }
    if (!this.isTowableUnit(unit)) {
      return { available: false, reason: "This formation does not use tow deployment drills." };
    }
    if (this.isAutomatedPlayerUnit(unit)) {
      return { available: false, reason: "Automated logistics convoys do not accept tow deployment orders." };
    }
    if (!this.playerPlacements.has(axialKey(hex))) {
      return { available: false, reason: "No player formation occupies this hex." };
    }
    if (this.resolveTowState(unit) !== "towed") {
      return { available: false, reason: "This formation is already deployed for fire." };
    }
    if (unit.onSentry) {
      return { available: false, reason: "Cancel sentry before deploying the guns." };
    }
    if (this.resolveUnitSuppressionState(unit).state === "pinned") {
      return { available: false, reason: "Pinned formations cannot deploy their guns." };
    }
    if (flags.attacksUsed > 0) {
      return { available: false, reason: "This formation has already attacked this turn." };
    }
    return { available: true, reason: null };
  }

  /**
   * Supplies a read-only action state for the selected unit so the command UI can stay in sync with engine rules.
   */
  getUnitCommandState(hex: Axial, unitId?: string): UnitCommandState | null {
    const unit = this.lookupUnit(hex, "Player", false, unitId);
    if (!unit) {
      return null;
    }
    const definition = this.getUnitDefinition(unit.type);
    const flags = this.getUnitActionFlags("Player", unit);
    const suppression = this.resolveUnitSuppressionState(unit);
    const towState = this.resolveTowState(unit);
    const moveOut = this.resolveMoveOutAvailability(hex, unit, definition, flags);
    const towDeploy = this.resolveTowDeployAvailability(hex, unit, definition, flags);
    const sentry = this.resolveSentryAvailability(hex, unit, flags);
    const digIn = this.resolveDigInAvailability(hex, unit, definition, flags);
    const build = this.resolveBuildModificationAvailability(hex, unit, definition, flags);
    const existingHexModifications = this.getHexModifications(hex);
    const existingHexModification = existingHexModifications[0] ?? null;

    return {
      unitId: this.getSquadronId(unit),
      unitType: unit.type,
      isAutomated: this.isAutomatedPlayerUnit(unit),
      isEngineer: this.isEngineerUnit(unit, definition),
      entrenchment: unit.entrench,
      maxEntrenchment: 2,
      suppressionState: suppression.state,
      suppressorCount: suppression.count,
      isOnSentry: unit.onSentry === true,
      towState,
      existingHexModification: existingHexModification ? structuredClone(existingHexModification) : null,
      existingHexModifications: existingHexModifications.map((entry) => structuredClone(entry)),
      canMoveOut: moveOut.available,
      moveOutReason: moveOut.reason,
      canDeployTow: towDeploy.available,
      deployTowReason: towDeploy.reason,
      canEnterSentry: sentry.available,
      sentryReason: sentry.reason,
      canDigIn: digIn.available,
      digInReason: digIn.reason,
      canBuildModification: build.available,
      buildReason: build.reason,
      buildModificationAvailability: structuredClone(build.byType)
    };
  }

  /**
   * Field actions consume the unit's operational tempo for the turn, so spend the
   * current movement allowance as well as the attack action.
   */
  private resolveCommittedFieldActionFlags(
    hex: Axial,
    flags: ReturnType<GameEngine["createDefaultActionFlags"]>,
    unitId?: string
  ): ReturnType<GameEngine["createDefaultActionFlags"]> {
    const movementContext = this.resolveMovementContext(hex, unitId);
    const committedMovement = movementContext ? movementContext.max : flags.movementPointsUsed;
    return {
      ...flags,
      movementPointsUsed: Math.max(flags.movementPointsUsed, committedMovement),
      attacksUsed: Math.max(flags.attacksUsed, 1)
    };
  }

  /**
   * Puts a unit on sentry duty. Unit will return simultaneous fire if attacked.
   * Unit cannot move or attack again this turn after entering sentry.
   */
  enterSentry(hex: Axial, unitId?: string): boolean {
    const key = axialKey(hex);
    const unit = this.lookupUnit(hex, "Player", false, unitId);
    if (!unit) {
      return false;
    }
    const flags = this.getUnitActionFlags("Player", unit);
    const sentry = this.resolveSentryAvailability(hex, unit, flags);
    if (!sentry.available) {
      return false;
    }

    unit.onSentry = true;
    this.replaceUnitInFactionHex("Player", unit);
    this.setUnitActionFlags("Player", unit, this.resolveCommittedFieldActionFlags(hex, flags, this.getSquadronId(unit)));
    this.updateIdleRegistryFor(key);
    this.invalidateRosterCache();

    return true;
  }

  /**
   * Removes a unit from sentry mode, restoring it to idle status if it hasn't acted.
   * Allows commanders to undo sentry before ending their turn.
   */
  exitSentry(hex: Axial, unitId?: string): boolean {
    const key = axialKey(hex);
    const unit = this.lookupUnit(hex, "Player", false, unitId);
    if (!unit || !unit.onSentry) {
      return false;
    }

    // Remove sentry flag
    unit.onSentry = false;
    this.replaceUnitInFactionHex("Player", unit);

    // Update idle registry - unit becomes idle again if it hasn't acted
    this.updateIdleRegistryFor(key);
    this.invalidateRosterCache();

    return true;
  }

  moveOutTowableUnit(hex: Axial, unitId?: string): boolean {
    const key = axialKey(hex);
    const unit = this.lookupUnit(hex, "Player", false, unitId);
    if (!unit) {
      return false;
    }
    const definition = this.getUnitDefinition(unit.type);
    const flags = this.getUnitActionFlags("Player", unit);
    const availability = this.resolveMoveOutAvailability(hex, unit, definition, flags);
    if (!availability.available) {
      return false;
    }

    unit.towState = "towed";
    unit.onSentry = false;
    unit.entrench = 0;
    this.replaceUnitInFactionHex("Player", unit);
    this.syncPlayerEntrench(hex, unit.entrench, this.getSquadronId(unit));
    this.setUnitActionFlags("Player", unit, {
      ...flags,
      movementPointsUsed: flags.movementPointsUsed + this.resolveTowHookupCost(definition, flags),
      isRushing: false
    });
    this.updateIdleRegistryFor(key);
    this.invalidateRosterCache();

    return true;
  }

  deployTowableUnit(hex: Axial, unitId?: string): boolean {
    const key = axialKey(hex);
    const unit = this.lookupUnit(hex, "Player", false, unitId);
    if (!unit) {
      return false;
    }
    const definition = this.getUnitDefinition(unit.type);
    const flags = this.getUnitActionFlags("Player", unit);
    const availability = this.resolveTowDeployAvailability(hex, unit, definition, flags);
    if (!availability.available) {
      return false;
    }

    unit.towState = "deployed";
    unit.onSentry = false;
    this.replaceUnitInFactionHex("Player", unit);

    if (flags.movementPointsUsed > 0) {
      this.setUnitActionFlags("Player", unit, this.resolveCommittedFieldActionFlags(hex, flags, this.getSquadronId(unit)));
    }
    this.updateIdleRegistryFor(key);
    this.invalidateRosterCache();

    return true;
  }

  /**
   * Dig in action for infantry units. Increases entrenchment level (max 2).
   * Unit cannot move or attack again this turn after digging in.
   */
  digInUnit(hex: Axial, unitId?: string): boolean {
    const key = axialKey(hex);
    const unit = this.lookupUnit(hex, "Player", false, unitId);
    if (!unit) {
      return false;
    }
    const def = this.getUnitDefinition(unit.type);
    const flags = this.getUnitActionFlags("Player", unit);
    const digIn = this.resolveDigInAvailability(hex, unit, def, flags);
    if (!digIn.available) {
      return false;
    }

    // Increase entrenchment (max 2)
    unit.entrench = Math.min(2, unit.entrench + 1);
    this.replaceUnitInFactionHex("Player", unit);
    this.syncPlayerEntrench(hex, unit.entrench, this.getSquadronId(unit));

    // Digging in consumes the battalion's remaining operational time for the turn.
    this.setUnitActionFlags("Player", unit, this.resolveCommittedFieldActionFlags(hex, flags, this.getSquadronId(unit)));
    this.updateIdleRegistryFor(key);
    this.invalidateRosterCache();

    return true;
  }

  /**
   * Build a hex modification (tank traps, fortifications, cleared path).
   * Only engineers can build modifications.
   */
  buildHexModification(hex: Axial, type: HexModificationType, facing?: HexEdgeFacing | null, unitId?: string): boolean {
    const key = axialKey(hex);
    const unit = this.lookupUnit(hex, "Player", false, unitId);
    if (!unit) {
      return false;
    }
    const def = this.getUnitDefinition(unit.type);
    const flags = this.getUnitActionFlags("Player", unit);
    const build = this.resolveBuildModificationAvailabilityForType(hex, unit, def, flags, type);
    if (!build.available) {
      return false;
    }
    const usesFacing = type === "fortifications" || type === "tankTraps";
    const normalizedFacing = usesFacing
      ? this.normalizeHexEdgeFacing(facing)
      : null;
    if (usesFacing && !normalizedFacing) {
      return false;
    }
    const existingMods = this.hexModifications.get(key) ?? [];
    if (
      usesFacing &&
      existingMods.some((entry) => entry.type === type && this.normalizeHexEdgeFacing(entry.facing) === normalizedFacing)
    ) {
      return false;
    }

    if (type === "clearedPath") {
      const existingPath = existingMods.find((entry) => entry.type === "clearedPath") ?? null;
      if (existingPath) {
        existingPath.level = Math.min(3, (existingPath.level ?? 1) + 1);
        existingPath.builtOnTurn = this._turnNumber;
      } else {
        existingMods.push({
          type,
          hex: structuredClone(hex),
          faction: "Player",
          level: 1,
          builtOnTurn: this._turnNumber
        });
      }
      this.hexModifications.set(key, existingMods);
    } else {
      existingMods.push({
        type,
        hex: structuredClone(hex),
        faction: "Player",
        facing: normalizedFacing ?? undefined,
        builtOnTurn: this._turnNumber
      });
      this.hexModifications.set(key, existingMods);
    }

    // These engineer actions abstract a short five-minute slice of work across a roughly 250m hex,
    // so even edge works and path clearing consume the battalion's remaining operational tempo.
    this.setUnitActionFlags("Player", unit, this.resolveCommittedFieldActionFlags(hex, flags, this.getSquadronId(unit)));
    this.updateIdleRegistryFor(key);
    this.invalidateRosterCache();

    return true;
  }

  /**
   * Get hex modification at a specific hex, if any.
   */
  getHexModification(hex: Axial): HexModification | null {
    const key = axialKey(hex);
    return this.hexModifications.get(key)?.[0] ?? null;
  }

  getHexModifications(hex: Axial): HexModification[] {
    const key = axialKey(hex);
    return (this.hexModifications.get(key) ?? []).map((entry) => structuredClone(entry));
  }

  getHexModificationSnapshots(): HexModification[] {
    return Array.from(this.hexModifications.values()).flatMap((entries) => entries.map((entry) => structuredClone(entry)));
  }
}
