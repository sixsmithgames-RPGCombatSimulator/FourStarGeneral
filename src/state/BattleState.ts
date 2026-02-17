import {
  GameEngine,
  type GameEngineConfig,
  type PendingReserveRequest,
  type TurnSummary,
  type BattleRosterSnapshot,
  type LogisticsSnapshot,
  type SupplySnapshot,
  type TurnFaction,
  type BotTurnSummary,
  type CampaignBridgeState,
  type AirMissionArrival,
  type AirEngagementEvent
} from "../game/GameEngine";
import { findGeneralById, type GeneralRosterEntry } from "../utils/rosterStorage";
import type { AllocationCategory } from "../data/unitAllocation";
import { ensureDeploymentState, type DeploymentPoolEntry } from "./DeploymentState";
import type { MissionKey } from "./UIState";

/**
 * Snapshot captured when the commander commits their precombat allocations.
 * Downstream battle UI surfaces this metadata without re-deriving totals from mutable state.
 */
export interface PrecombatAllocationSummary {
  readonly totalSpend: number;
  readonly remainingFunds: number;
  readonly committedAt: string;
  readonly allocations: ReadonlyArray<{
    readonly key: string;
    readonly label: string;
    readonly quantity: number;
    readonly costPerUnit: number;
    readonly category: AllocationCategory;
  }>;
}

/**
 * Snapshot of the mission intel confirmed at the end of precombat.
 * Battle HUD layers read this data to render briefing copy without re-querying mission tables.
 */
export interface PrecombatMissionInfo {
  readonly missionKey: MissionKey;
  readonly title: string;
  readonly briefing: string;
  readonly objectives: readonly string[];
  readonly doctrine: string;
  readonly turnLimit: number | null;
  readonly baselineSupplies: ReadonlyArray<{ readonly label: string; readonly amount: string }>;
}

/**
 * Reasons emitted when battle state mutates in a way that downstream overlays (e.g., War Room) should refresh.
 * Using a narrow string union keeps logging and debugging readable while avoiding magic strings throughout the UI.
 */
export type BattleUpdateReason =
  | "engineInitialized"
  | "turnAdvanced"
  | "deploymentUpdated"
  | "missionUpdated"
  | "allocationsUpdated"
  | "reset"
  | "manual";

type BattleUpdateListener = (reason: BattleUpdateReason) => void;

/**
 * Manages the game engine instance and battle-related state.
 * Acts as a facade for GameEngine operations.
 */
export class BattleState {
  private gameEngine: GameEngine | null = null;
  private engineConfig: GameEngineConfig | null = null;
  private precombatAllocationSummary: PrecombatAllocationSummary | null = null;
  private precombatMissionInfo: PrecombatMissionInfo | null = null;
  /** Cached snapshot mirroring the latest roster breakdown. Updated whenever engine signals a change. */
  private rosterSnapshot: BattleRosterSnapshot | null = null;
  /** Cached logistics snapshots split by faction so UI bridges can render summaries without recomputing each frame. */
  private logisticsSnapshot: LogisticsSnapshot | null = null;
  private supplySnapshotByFaction: Record<TurnFaction, SupplySnapshot | null> = {
    Player: null,
    Bot: null
  };
  /** Cached supply snapshot accessible to UI helpers without a live engine reference. */
  private readonly supplySnapshotCache: Record<TurnFaction, SupplySnapshot | null> = {
    Player: null,
    Bot: null
  };
  /** Commander assigned for the upcoming battle. Persisted once precombat locks in. */
  private assignedCommanderId: string | null = null;
  /** Optional campaign bridge snapshot supplied when transitioning from the strategic layer. */
  private campaignBridgeState: CampaignBridgeState | null = null;
  /** Subscribers interested in changes that should trigger UI refreshes (e.g., the War Room overlay). */
  private readonly battleUpdateListeners = new Set<BattleUpdateListener>();

  /**
   * Registers a listener invoked whenever noteworthy battle updates occur.
   * Returns an unsubscribe handle so callers can detach when disposing UI components.
   */
  subscribeToBattleUpdates(listener: BattleUpdateListener): () => void {
    this.battleUpdateListeners.add(listener);
    return () => this.battleUpdateListeners.delete(listener);
  }

  /** Stores the latest campaign bridge snapshot for downstream UI consumption. */
  setCampaignBridgeState(state: CampaignBridgeState): void {
    this.campaignBridgeState = structuredClone(state);
  }

  /** Returns the currently stored campaign bridge snapshot, if any. */
  getCampaignBridgeState(): CampaignBridgeState | null {
    return this.campaignBridgeState ? structuredClone(this.campaignBridgeState) : null;
  }

  /**
   * Allows callers to manually emit a battle update reason, primarily used by orchestration layers.
   */
  emitBattleUpdate(reason: BattleUpdateReason = "manual"): void {
    this.notifyBattleUpdate(reason);
  }

  /**
   * Dispatches battle update notifications to registered listeners with defensive error handling.
   */
  private notifyBattleUpdate(reason: BattleUpdateReason): void {
    this.battleUpdateListeners.forEach((listener) => {
      try {
        listener(reason);
      } catch (error) {
        console.error("BattleState subscriber threw during notifyBattleUpdate", { reason, error });
      }
    });
  }

  /**
   * Initializes the game engine with the provided configuration.
   * @param config - GameEngine configuration including scenario, unit types, terrain
   */
  initializeEngine(config: GameEngineConfig): void {
    this.engineConfig = config;
    this.gameEngine = new GameEngine(config);
    this.rosterSnapshot = this.gameEngine.getRosterSnapshot();
    // Seed supply cache immediately so UI panels can render depot totals before the first turn advance.
    this.refreshSupplySnapshot("Player");
    this.refreshSupplySnapshot("Bot");
    this.refreshLogisticsSnapshots();
    this.notifyBattleUpdate("engineInitialized");
  }

  /**
   * Returns the active game engine instance.
   * Throws an error if the engine has not been initialized.
   */
  ensureGameEngine(): GameEngine {
    if (!this.gameEngine) {
      throw new Error("GameEngine has not been initialized. Call initializeEngine() first.");
    }
    return this.gameEngine;
  }

  /**
   * Returns the latest cached roster snapshot, fetching a fresh copy from the engine when available.
   * The defensive clone shields UI layers from mutating engine state and matches PLAN_battle_Army expectations.
   */
  getRosterSnapshot(): BattleRosterSnapshot | null {
    if (!this.gameEngine) {
      return this.rosterSnapshot ? structuredClone(this.rosterSnapshot) : null;
    }
    this.rosterSnapshot = this.gameEngine.getRosterSnapshot();
    return structuredClone(this.rosterSnapshot);
  }

  /**
   * Returns the most recent logistics snapshot covering supply lines, convoys, and alerts.
   * Falls back to cached copies when the engine is unavailable (e.g., prior to initialization).
   */
  getLogisticsSnapshot(): LogisticsSnapshot | null {
    if (!this.gameEngine) {
      return this.logisticsSnapshot ? structuredClone(this.logisticsSnapshot) : null;
    }
    this.refreshLogisticsSnapshots();
    return this.logisticsSnapshot ? structuredClone(this.logisticsSnapshot) : null;
  }

  /**
   * Supplies the most recent faction-specific supply ledger.
   * Defaults to the player faction when no explicit parameter is provided.
   */
  getSupplySnapshot(faction: TurnFaction = "Player"): SupplySnapshot | null {
    if (!this.gameEngine) {
      return this.supplySnapshotCache[faction] ? structuredClone(this.supplySnapshotCache[faction]) : null;
    }
    this.refreshSupplySnapshot(faction);
    const snapshot = this.supplySnapshotCache[faction];
    return snapshot ? structuredClone(snapshot) : null;
  }

  /**
   * Mirrors the engine supply timeline so UI components can render trend charts without recomputing history.
   */
  getSupplyHistory(faction: TurnFaction = "Player"): SupplySnapshot[] {
    if (!this.gameEngine) {
      return this.supplySnapshotCache[faction] ? [structuredClone(this.supplySnapshotCache[faction]!)] : [];
    }
    const history = this.gameEngine.getSupplyHistory(faction);
    return history.map((entry) => structuredClone(entry));
  }

  /**
   * Returns axial keys for player formations that have not yet moved or attacked during the current turn.
   * Battle UI layers use this to render idle-unit highlights and prompt reminders before ending the turn.
   */
  getIdlePlayerUnitKeys(): string[] {
    if (!this.gameEngine) {
      return [];
    }
    return this.gameEngine.getIdlePlayerUnitKeys();
  }

  /**
   * Clears the cached roster data so the next consumer fetches an up-to-date snapshot.
   * Call this after mutations such as deployment changes or combat resolution.
   */
  invalidateRosterSnapshot(): void {
    this.rosterSnapshot = null;
    // Deployment shifts change frontline/reserve composition, so refresh supply cache before notifying listeners.
    this.refreshSupplySnapshot("Player");
    this.refreshSupplySnapshot("Bot");
    this.notifyBattleUpdate("deploymentUpdated");
  }

  /**
   * Checks if the game engine has been initialized.
   */
  hasEngine(): boolean {
    return this.gameEngine !== null;
  }

  /**
   * Returns the current turn summary from the game engine.
   */
  getCurrentTurnSummary(): TurnSummary {
    return this.ensureGameEngine().getTurnSummary();
  }

  /**
   * Ends the player's turn and advances to the bot's turn.
   * Returns a supply tick report if applicable.
   */
  endPlayerTurn(): ReturnType<GameEngine["endTurn"]> {
    const engine = this.ensureGameEngine();
    const supplyReport = engine.endTurn();

    // Keep snapshot mirrors current so downstream panels read fresh ledgers before notifications fire.
    this.refreshLogisticsSnapshots();
    this.refreshSupplySnapshot("Player");
    this.refreshSupplySnapshot("Bot");
    // DeploymentState mirrors roster/reserve distributions during deployment. Once the turn rolls, ensure
    // we rebuild those mirrors so UI panels (like the roster popup) continue to report the correct totals.
    ensureDeploymentState().mirrorEngineState(engine);
    this.invalidateRosterSnapshot();

    this.notifyBattleUpdate("turnAdvanced");

    return supplyReport;
  }

  /**
   * Consumes the bot turn summary from the game engine.
   * Returns null if no bot turn has been executed since the last consumption.
   */
  consumeBotTurnSummary(): ReturnType<GameEngine["consumeBotTurnSummary"]> {
    return this.ensureGameEngine().consumeBotTurnSummary();
  }

  /** Returns and clears any air mission arrivals that transitioned to in-flight since the last read. */
  consumeAirMissionArrivals(): AirMissionArrival[] {
    return this.ensureGameEngine().consumeAirMissionArrivals();
  }

  /** Returns and clears any recorded air-to-air engagements since the last read. */
  consumeAirEngagements(): AirEngagementEvent[] {
    return this.ensureGameEngine().consumeAirEngagements();
  }

  /**
   * Resets the battle state by clearing the game engine.
   */
  reset(): void {
    this.gameEngine = null;
    this.engineConfig = null;
    this.precombatAllocationSummary = null;
    this.precombatMissionInfo = null;
    this.rosterSnapshot = null;
    this.logisticsSnapshot = null;
    this.supplySnapshotByFaction.Player = null;
    this.supplySnapshotByFaction.Bot = null;
    this.supplySnapshotCache.Player = null;
    this.supplySnapshotCache.Bot = null;
    this.assignedCommanderId = null;
    this.notifyBattleUpdate("reset");
  }

  /**
   * Returns a serialized snapshot of the current battle state.
   * Useful for save/load functionality.
   */
  serialize(): unknown {
    if (!this.gameEngine) {
      return null;
    }
    return this.gameEngine.serialize();
  }

  /**
   * Records the allocation summary committed during the precombat phase so the battle UI can surface it.
   */
  setPrecombatAllocationSummary(summary: PrecombatAllocationSummary): void {
    this.precombatAllocationSummary = summary;
    this.notifyBattleUpdate("allocationsUpdated");
  }

  /**
   * Retrieves the most recent precombat allocation summary, if one has been recorded.
   */
  getPrecombatAllocationSummary(): PrecombatAllocationSummary | null {
    return this.precombatAllocationSummary;
  }

  /**
   * Records the pool of requisitioned units so the engine can rebuild its reserve list when deployment begins.
   * Call this from precombat immediately before transitioning to the battle screen.
   */
  setPendingDeployment(entries: readonly DeploymentPoolEntry[]): void {
    console.log("[BattleState] setPendingDeployment invoked", {
      entryCount: entries.length,
      keys: entries.map((entry) => entry.key)
    });
    // Mirror the precombat allocation snapshot into DeploymentState so battle initialization can hydrate without rereading UI state.
    ensureDeploymentState().recordCommittedEntries(entries);
    console.log("[BattleState] setPendingDeployment delegated to DeploymentState", {
      committedEntryCount: ensureDeploymentState().getCommittedEntryKeys().length
    });
    // New allocations alter reserve stock; update supply cache so UI mirrors fresh totals on next render.
    this.refreshSupplySnapshot("Player");
    this.refreshSupplySnapshot("Bot");
    this.notifyBattleUpdate("deploymentUpdated");
  }

  /**
   * Stores the commander assigned during precombat so battle overlays stay in sync with briefing context.
   */
  setAssignedCommanderId(commanderId: string | null): void {
    this.assignedCommanderId = commanderId;
  }

  /**
   * Returns the cached commander identifier chosen during precombat, if available.
   */
  getAssignedCommanderId(): string | null {
    return this.assignedCommanderId;
  }

  /**
   * Records the curated mission briefing so the battle screen can surface HUD copy on entry.
   */
  setPrecombatMissionInfo(info: PrecombatMissionInfo): void {
    this.precombatMissionInfo = info;
    this.notifyBattleUpdate("missionUpdated");
  }

  /**
   * Returns the mission briefing captured during precombat, if available.
   */
  getPrecombatMissionInfo(): PrecombatMissionInfo | null {
    return this.precombatMissionInfo;
  }

  /**
   * Helper refreshing all logistics-facing caches to keep UI snapshots aligned with the engine.
   */
  private refreshLogisticsSnapshots(): void {
    if (!this.gameEngine) {
      return;
    }
    this.logisticsSnapshot = this.gameEngine.getLogisticsSnapshot();
    this.refreshSupplySnapshot("Player");
    this.refreshSupplySnapshot("Bot");
  }

  /**
   * Refreshes the cached supply snapshot for a single faction.
   */
  private refreshSupplySnapshot(faction: TurnFaction): void {
    if (!this.gameEngine) {
      return;
    }
    const snapshot = this.gameEngine.getSupplySnapshot(faction);
    this.supplySnapshotByFaction[faction] = snapshot;
    this.supplySnapshotCache[faction] = snapshot ? structuredClone(snapshot) : null;
  }

  /**
   * Resolves the full roster profile for the assigned commander so battle overlays can render identity, traits, and history.
   */
  getAssignedCommanderProfile(): GeneralRosterEntry | null {
    if (!this.assignedCommanderId) {
      return null;
    }
    const entry = findGeneralById(this.assignedCommanderId);
    return entry ? { ...entry } : null;
  }
}

/**
 * Singleton instance accessor for battle state.
 * TODO: Consider dependency injection instead of singleton pattern.
 */
let battleStateInstance: BattleState | null = null;

export function ensureBattleState(): BattleState {
  if (!battleStateInstance) {
    battleStateInstance = new BattleState();
  }
  return battleStateInstance;
}

export function resetBattleSupportState(): void {
  if (battleStateInstance) {
    battleStateInstance.reset();
  }
}
