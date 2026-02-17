import { createEmptyWarRoomData, type WarRoomData } from "../../data/warRoomTypes";
import type { BattleState } from "../../state/BattleState";
import { ensureDeploymentState } from "../../state/DeploymentState";
import type { WarRoomDataProvider } from "./WarRoomDataProvider";

/**
 * Generates War Room overlay snapshots from live battle state.
 * Computes lightweight summaries on demand so the overlay always reflects the current turn.
 */
export class BattleWarRoomDataProvider implements WarRoomDataProvider {
  private readonly battleState: BattleState;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribeBattleUpdates: () => void;

  constructor(battleState: BattleState) {
    this.battleState = battleState;
    // Mirror any meaningful battle-state changes directly into the overlay so commanders see fresh data without reopening.
    this.unsubscribeBattleUpdates = this.battleState.subscribeToBattleUpdates(() => this.publishUpdate());
  }

  /**
   * Returns the latest situational picture. Falls back to the empty template when the engine is not ready yet.
   */
  getSnapshot(): WarRoomData {
    const snapshot = createEmptyWarRoomData();

    if (!this.battleState.hasEngine()) {
      return snapshot;
    }

    const engine = this.battleState.ensureGameEngine();
    const turn = engine.getTurnSummary();
    const roster = engine.getRosterSnapshot();
    const reserves = engine.getReserveSnapshot();
    const mission = this.battleState.getPrecombatMissionInfo();
    const deploymentState = ensureDeploymentState();

    // Compose high-level intel briefs combining precombat mission intel with the evolving turn context.
    snapshot.intelBriefs = [];
    if (mission) {
      snapshot.intelBriefs.push({
        title: mission.title,
        summary: mission.briefing,
        classification: "MISSION",
        source: "Precombat Dossier",
        timestamp: mission.turnLimit ? `Turn limit: ${mission.turnLimit}` : undefined
      });
    }
    snapshot.intelBriefs.push({
      title: `Turn ${turn.turnNumber} Overview`,
      summary: `Phase: ${turn.phase}. Active faction: ${turn.activeFaction}.`,
      source: "Operations Desk",
      timestamp: new Date().toISOString()
    });

    // Promote deployed player units as proxy recon reports until a dedicated recon module is wired in.
    const playerUnits = engine.playerUnits;
    snapshot.reconReports = playerUnits.slice(0, 4).map((unit, index) => ({
      sector: `Hex ${unit.hex.q},${unit.hex.r}`,
      finding: `${unit.type} holding position with strength ${unit.strength}.`,
      confidence: index === 0 ? "High" : "Medium",
      reportedBy: "Forward Observer",
      timestamp: new Date().toISOString()
    }));

    // Derive a coarse supply status from reserve depth relative to fighting strength.
    const totalForces = Math.max(1, roster.metrics.totalUnits);
    const reserveRatio = reserves.length / totalForces;
    let supplyStatus: WarRoomData["supplyStatus"]["status"] = "adequate";
    if (reserveRatio < 0.1) {
      supplyStatus = "critical";
    } else if (reserveRatio < 0.25) {
      supplyStatus = "low";
    } else if (reserveRatio > 0.4) {
      supplyStatus = "surplus";
    }
    snapshot.supplyStatus = {
      status: supplyStatus,
      note: `Frontline units: ${roster.metrics.frontline}. Reserves available: ${reserves.length}.`,
      stockLevel: Math.round(reserveRatio * 100),
      consumptionRate: Math.max(1, roster.metrics.frontline)
    };

    // Mirror remaining deployment pool entries as requisitions awaiting fulfillment.
    snapshot.requisitions = deploymentState.pool
      .filter((entry) => entry.remaining > 0)
      .map((entry) => ({
        item: entry.label,
        quantity: entry.remaining,
        status: reserveRatio > 0.25 ? "approved" : "pending",
        requestedBy: "Theater Logistics",
        updatedAt: new Date().toISOString()
      }));

    // Translate roster casualty summaries into ledger figures.
    const casualtyCount = roster.casualties.length;
    snapshot.casualtyLedger = {
      kia: casualtyCount,
      wia: 0,
      mia: 0,
      updatedAt: new Date().toISOString()
    };

    snapshot.engagementLog = [
      {
        theater: mission?.title ?? "Current Theater",
        result: turn.phase === "playerTurn" ? "ongoing" : "stalemate",
        note: `Turn ${turn.turnNumber} operations continue with ${casualtyCount} recorded losses to date.`,
        casualties: casualtyCount,
        timestamp: new Date().toISOString()
      }
    ];

    snapshot.logisticsSummary = {
      throughput: `${Math.round(reserveRatio * 100)}% reserve depth relative to committed forces`,
      // `LogisticsDigest.bottleneck` expects `string | undefined`; use `undefined` when we have nothing urgent to report
      // so panels remain type-safe and omit the field cleanly.
      bottleneck: reserveRatio < 0.25 ? "Reinforce reserves to sustain momentum" : undefined,
      efficiency: Math.min(100, Math.round((reserveRatio + 0.3) * 100))
    };

    snapshot.commandOrders = mission
      ? mission.objectives.map((objective, index) => ({
          title: `Objective ${index + 1}`,
          objective,
          priority: "high"
        }))
      : [
          {
            title: "Hold Positions",
            objective: "Maintain current lines until fresh directives arrive.",
            priority: "medium"
          }
        ];

    const readinessNumerator = roster.metrics.frontline + roster.metrics.support;
    const readinessPercentage = Math.min(100, Math.round((readinessNumerator / totalForces) * 100));
    const readinessLevel = readinessPercentage >= 90
      ? "combat ready"
      : readinessPercentage >= 70
      ? "ready"
      : readinessPercentage >= 50
      ? "preparing"
      : "not ready";
    snapshot.readinessState = {
      level: readinessLevel,
      comment: `Readiness holding at ${readinessPercentage}% of committed strength.`,
      percentage: readinessPercentage
    };

    snapshot.campaignClock = {
      day: Math.max(1, turn.turnNumber),
      time: `${6 + turn.turnNumber % 12}00`,
      note: `Phase: ${turn.phase}`,
      phase: turn.phase
    };

    return snapshot;
  }

  /**
   * Registers a listener so UI can repaint when new data becomes available.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notifies subscribers (e.g., the overlay) that battle data changed.
   */
  publishUpdate(): void {
    this.listeners.forEach((listener) => listener());
  }

  /**
   * Clears subscriptions so long-lived overlays do not leak listeners during route transitions.
   */
  dispose(): void {
    this.listeners.clear();
    this.unsubscribeBattleUpdates();
  }
}
