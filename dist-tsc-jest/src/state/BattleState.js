import { GameEngine } from "../game/GameEngine";
import { findGeneralById } from "../utils/rosterStorage";
import { ensureDeploymentState } from "./DeploymentState";
/**
 * Manages the game engine instance and battle-related state.
 * Acts as a facade for GameEngine operations.
 */
export class BattleState {
    constructor() {
        this.gameEngine = null;
        this.engineConfig = null;
        this.precombatAllocationSummary = null;
        this.precombatMissionInfo = null;
        /** Cached snapshot mirroring the latest roster breakdown. Updated whenever engine signals a change. */
        this.rosterSnapshot = null;
        /** Cached logistics snapshots split by faction so UI bridges can render summaries without recomputing each frame. */
        this.logisticsSnapshot = null;
        this.supplySnapshotByFaction = {
            Player: null,
            Bot: null,
            Ally: null
        };
        /** Cached supply snapshot accessible to UI helpers without a live engine reference. */
        this.supplySnapshotCache = {
            Player: null,
            Bot: null,
            Ally: null
        };
        /** Commander assigned for the upcoming battle. Persisted once precombat locks in. */
        this.assignedCommanderId = null;
        /** Optional campaign bridge snapshot supplied when transitioning from the strategic layer. */
        this.campaignBridgeState = null;
        /** Subscribers interested in changes that should trigger UI refreshes (e.g., the War Room overlay). */
        this.battleUpdateListeners = new Set();
    }
    /**
     * Registers a listener invoked whenever noteworthy battle updates occur.
     * Returns an unsubscribe handle so callers can detach when disposing UI components.
     */
    subscribeToBattleUpdates(listener) {
        this.battleUpdateListeners.add(listener);
        return () => this.battleUpdateListeners.delete(listener);
    }
    /** Stores the latest campaign bridge snapshot for downstream UI consumption. */
    setCampaignBridgeState(state) {
        this.campaignBridgeState = structuredClone(state);
    }
    /** Returns the currently stored campaign bridge snapshot, if any. */
    getCampaignBridgeState() {
        return this.campaignBridgeState ? structuredClone(this.campaignBridgeState) : null;
    }
    /**
     * Allows callers to manually emit a battle update reason, primarily used by orchestration layers.
     */
    emitBattleUpdate(reason = "manual") {
        this.notifyBattleUpdate(reason);
    }
    /**
     * Dispatches battle update notifications to registered listeners with defensive error handling.
     */
    notifyBattleUpdate(reason) {
        this.battleUpdateListeners.forEach((listener) => {
            try {
                listener(reason);
            }
            catch (error) {
                console.error("BattleState subscriber threw during notifyBattleUpdate", { reason, error });
            }
        });
    }
    /**
     * Initializes the game engine with the provided configuration.
     * @param config - GameEngine configuration including scenario, unit types, terrain
     */
    initializeEngine(config) {
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
    ensureGameEngine() {
        if (!this.gameEngine) {
            throw new Error("GameEngine has not been initialized. Call initializeEngine() first.");
        }
        return this.gameEngine;
    }
    /**
     * Returns the active game engine instance when one has been initialized.
     * UI call sites can use this for optional turn/phase checks without throwing.
     */
    tryGetGameEngine() {
        return this.gameEngine;
    }
    /**
     * Returns the latest cached roster snapshot, fetching a fresh copy from the engine when available.
     * The defensive clone shields UI layers from mutating engine state and matches PLAN_battle_Army expectations.
     */
    getRosterSnapshot() {
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
    getLogisticsSnapshot() {
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
    getSupplySnapshot(faction = "Player") {
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
    getSupplyHistory(faction = "Player") {
        if (!this.gameEngine) {
            return this.supplySnapshotCache[faction] ? [structuredClone(this.supplySnapshotCache[faction])] : [];
        }
        const history = this.gameEngine.getSupplyHistory(faction);
        return history.map((entry) => structuredClone(entry));
    }
    /**
     * Returns axial keys for player formations that have not yet moved or attacked during the current turn.
     * Battle UI layers use this to render idle-unit highlights and prompt reminders before ending the turn.
     */
    getIdlePlayerUnitKeys() {
        if (!this.gameEngine) {
            return [];
        }
        return this.gameEngine.getIdlePlayerUnitKeys();
    }
    /**
     * Clears the cached roster data so the next consumer fetches an up-to-date snapshot.
     * Call this after mutations such as deployment changes or combat resolution.
     */
    invalidateRosterSnapshot() {
        this.rosterSnapshot = null;
        // Deployment shifts change frontline/reserve composition, so refresh supply cache before notifying listeners.
        this.refreshSupplySnapshot("Player");
        this.refreshSupplySnapshot("Bot");
        this.notifyBattleUpdate("deploymentUpdated");
    }
    /**
     * Checks if the game engine has been initialized.
     */
    hasEngine() {
        return this.gameEngine !== null;
    }
    /**
     * Returns the current turn summary from the game engine.
     */
    getCurrentTurnSummary() {
        return this.ensureGameEngine().getTurnSummary();
    }
    /**
     * Ends the player's turn and advances to the bot's turn.
     * Returns a supply tick report if applicable.
     */
    endPlayerTurn() {
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
    consumeBotTurnSummary() {
        return this.ensureGameEngine().consumeBotTurnSummary();
    }
    /** Returns and clears any air mission arrivals that transitioned to in-flight since the last read. */
    consumeAirMissionArrivals() {
        return this.ensureGameEngine().consumeAirMissionArrivals();
    }
    /** Returns and clears any recorded air-to-air engagements since the last read. */
    consumeAirEngagements() {
        return this.ensureGameEngine().consumeAirEngagements();
    }
    /**
     * Resets the battle state by clearing the game engine.
     */
    reset() {
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
    resetEngineState() {
        this.gameEngine = null;
        this.engineConfig = null;
        this.rosterSnapshot = null;
        this.logisticsSnapshot = null;
        this.supplySnapshotByFaction.Player = null;
        this.supplySnapshotByFaction.Bot = null;
        this.supplySnapshotByFaction.Ally = null;
        this.supplySnapshotCache.Player = null;
        this.supplySnapshotCache.Bot = null;
        this.supplySnapshotCache.Ally = null;
        this.notifyBattleUpdate("reset");
    }
    /**
     * Returns a serialized snapshot of the current battle state.
     * Useful for save/load functionality.
     */
    serialize() {
        if (!this.gameEngine) {
            return null;
        }
        return this.gameEngine.serialize();
    }
    /**
     * Records the allocation summary committed during the precombat phase so the battle UI can surface it.
     */
    setPrecombatAllocationSummary(summary) {
        this.precombatAllocationSummary = summary;
        this.notifyBattleUpdate("allocationsUpdated");
    }
    /**
     * Retrieves the most recent precombat allocation summary, if one has been recorded.
     */
    getPrecombatAllocationSummary() {
        return this.precombatAllocationSummary;
    }
    /**
     * Records the pool of requisitioned units so the engine can rebuild its reserve list when deployment begins.
     * Call this from precombat immediately before transitioning to the battle screen.
     */
    setPendingDeployment(entries) {
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
    setAssignedCommanderId(commanderId) {
        this.assignedCommanderId = commanderId;
    }
    /**
     * Returns the cached commander identifier chosen during precombat, if available.
     */
    getAssignedCommanderId() {
        return this.assignedCommanderId;
    }
    /**
     * Records the curated mission briefing so the battle screen can surface HUD copy on entry.
     */
    setPrecombatMissionInfo(info) {
        this.precombatMissionInfo = info;
        this.notifyBattleUpdate("missionUpdated");
    }
    /**
     * Returns the mission briefing captured during precombat, if available.
     */
    getPrecombatMissionInfo() {
        return this.precombatMissionInfo;
    }
    /**
     * Helper refreshing all logistics-facing caches to keep UI snapshots aligned with the engine.
     */
    refreshLogisticsSnapshots() {
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
    refreshSupplySnapshot(faction) {
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
    getAssignedCommanderProfile() {
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
let battleStateInstance = null;
export function ensureBattleState() {
    if (!battleStateInstance) {
        battleStateInstance = new BattleState();
    }
    return battleStateInstance;
}
export function resetBattleSupportState() {
    if (battleStateInstance) {
        battleStateInstance.reset();
    }
}
