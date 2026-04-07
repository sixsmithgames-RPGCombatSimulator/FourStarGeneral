import { createEmptyWarRoomData, type WarRoomData } from "../../data/warRoomTypes";
import { CoordinateSystem } from "../../rendering/CoordinateSystem";
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

  private formatDisplayHex(hex: { q: number; r: number }): string {
    const { col, row } = CoordinateSystem.axialToOffset(hex.q, hex.r);
    return `${col},${row}`;
  }

  private formatTurnNarrative(turn: { phase: string; activeFaction: string }): string {
    const isPlayerPhase = turn.phase === "playerTurn" || turn.phase === "deployment";
    const isEnemyPhase = turn.phase === "botTurn";

    if (isPlayerPhase) {
      return "Our forces assessing positions and coordinating next moves.";
    } else if (isEnemyPhase) {
      return "Enemy forces maneuvering. Reconnaissance reports incoming.";
    } else if (turn.phase === "completed") {
      return "Operations concluded. Battle assessment in progress.";
    } else {
      return "Operations transition in progress.";
    }
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
      title: `Turn ${turn.turnNumber} Situation Report`,
      summary: this.formatTurnNarrative(turn),
      source: "Operations Desk",
      timestamp: new Date().toISOString()
    });

    // Generate reconnaissance reports from recon and air units
    snapshot.reconReports = this.composeReconReports(engine);

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

    snapshot.engagementLog = this.composeEngagementLog(engine, mission, casualtyCount);

    snapshot.logisticsSummary = {
      throughput: `${Math.round(reserveRatio * 100)}% reserve depth relative to committed forces`,
      // `LogisticsDigest.bottleneck` expects `string | undefined`; use `undefined` when we have nothing urgent to report
      // so panels remain type-safe and omit the field cleanly.
      bottleneck: reserveRatio < 0.25 ? "Reinforce reserves to sustain momentum" : undefined,
      efficiency: Math.min(100, Math.round((reserveRatio + 0.3) * 100))
    };

    snapshot.commandOrders = this.composeFieldReports(engine, mission);

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

    // Campaign timeline only relevant for campaign mode, not standalone missions
    const isCampaignMode = false; // TODO: Wire up actual campaign mode detection
    snapshot.campaignClock = isCampaignMode
      ? {
          day: Math.max(1, turn.turnNumber),
          time: `${6 + turn.turnNumber % 12}00`,
          note: `Campaign Day ${Math.max(1, turn.turnNumber)}`,
          phase: "Offensive"
        }
      : {
          day: turn.turnNumber,
          time: "",
          note: mission?.turnLimit
            ? `Mission Turn ${turn.turnNumber} of ${mission.turnLimit}`
            : `Mission Turn ${turn.turnNumber}`,
          phase: undefined
        };

    return snapshot;
  }

  private composeReconReports(engine: ReturnType<typeof this.battleState.ensureGameEngine>): Array<{
    sector: string;
    finding: string;
    confidence?: string;
    reportedBy?: string;
    timestamp?: string;
  }> {
    const reports: Array<{
      sector: string;
      finding: string;
      confidence?: string;
      reportedBy?: string;
      timestamp?: string;
    }> = [];

    const playerUnits = engine.playerUnits;

    // Find recon and air units
    const reconUnits = playerUnits.filter((u) => {
      const unitType = u.type.toLowerCase();
      return unitType.includes("recon") || unitType.includes("scout") ||
             unitType.includes("fighter") || unitType.includes("interceptor");
    });

    // Generate reports from recon units
    for (const recon of reconUnits.slice(0, 3)) {
      const sector = this.formatDisplayHex(recon.hex);
      const isAir = recon.type.toLowerCase().includes("fighter") ||
                    recon.type.toLowerCase().includes("interceptor");
      const confidence = recon.strength > 75 ? "High" : recon.strength > 50 ? "Medium" : "Low";

      reports.push({
        sector: `Sector ${sector}`,
        finding: isAir
          ? `Aerial reconnaissance sweep conducted. Area under observation from altitude.`
          : `Ground reconnaissance patrol active. Monitoring enemy movement patterns.`,
        confidence,
        reportedBy: recon.type,
        timestamp: new Date().toISOString()
      });
    }

    // If no recon units, provide generic situational awareness
    if (reports.length === 0) {
      const frontlineUnits = playerUnits.slice(0, 2);
      for (const unit of frontlineUnits) {
        reports.push({
          sector: `Sector ${this.formatDisplayHex(unit.hex)}`,
          finding: `Forward observers maintaining watch. No enemy contact reported.`,
          confidence: "Medium",
          reportedBy: "Forward Observer",
          timestamp: new Date().toISOString()
        });
      }
    }

    return reports;
  }

  private composeEngagementLog(
    engine: ReturnType<typeof this.battleState.ensureGameEngine>,
    mission: { title: string } | null,
    casualtyCount: number
  ): Array<{
    theater: string;
    result: "victory" | "defeat" | "stalemate" | "ongoing";
    note: string;
    casualties?: number;
    timestamp?: string;
  }> {
    const engagements: Array<{
      theater: string;
      result: "victory" | "defeat" | "stalemate" | "ongoing";
      note: string;
      casualties?: number;
      timestamp?: string;
    }> = [];

    // Get air mission reports
    const airReports = engine.getAirMissionReports();
    const recentAirMissions = airReports.slice(-3); // Last 3 missions

    for (const airMission of recentAirMissions) {
      if (airMission.event === "resolved" && airMission.outcome) {
        const sector = airMission.targetHex
          ? `Sector ${this.formatDisplayHex(airMission.targetHex)}`
          : "Designated target area";

        const result = airMission.outcome.result === "success"
          ? "victory"
          : airMission.outcome.result === "aborted"
          ? "stalemate"
          : "defeat";

        engagements.push({
          theater: `Air Operations - ${sector}`,
          result,
          note: airMission.outcome.details,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Add current turn summary if no specific engagements
    if (engagements.length === 0) {
      const turn = engine.getTurnSummary();
      engagements.push({
        theater: mission?.title ?? "Current Operations",
        result: "ongoing",
        note: casualtyCount > 0
          ? `Turn ${turn.turnNumber} operations in progress. ${casualtyCount} casualties sustained.`
          : `Turn ${turn.turnNumber} operations proceeding. All units operational.`,
        casualties: casualtyCount,
        timestamp: new Date().toISOString()
      });
    }

    return engagements;
  }

  private composeFieldReports(
    engine: ReturnType<typeof this.battleState.ensureGameEngine>,
    mission: { objectives: readonly string[] } | null
  ): Array<{
    title: string;
    objective: string;
    priority?: "low" | "medium" | "high" | "critical";
    deadline?: string;
  }> {
    const reports: Array<{
      title: string;
      objective: string;
      priority?: "low" | "medium" | "high" | "critical";
      deadline?: string;
    }> = [];

    // Get air mission reports for recent activity
    const airReports = engine.getAirMissionReports();
    const recentAir = airReports.slice(-4); // Last 4 missions

    for (const airMission of recentAir) {
      if (airMission.event === "resolved") {
        const priority = airMission.outcome?.result === "success"
          ? "medium"
          : airMission.outcome?.result === "destroyed"
          ? "critical"
          : "high";

        reports.push({
          title: `Air Squadron Report - ${airMission.unitType}`,
          objective: airMission.outcome?.details ?? "Mission completed and returning to base.",
          priority: priority as "low" | "medium" | "high" | "critical"
        });
      }
    }

    // Get casualty reports
    const roster = engine.getRosterSnapshot();
    const recentCasualties = roster.casualties.slice(-2);

    for (const casualty of recentCasualties) {
      reports.push({
        title: `Casualty Report - ${casualty.unitType}`,
        objective: `Unit destroyed in combat. Replacement assets requested from reserve pool.`,
        priority: "high"
      });
    }

    // Add mission objectives as ongoing directives
    if (mission && mission.objectives.length > 0) {
      for (const [index, objective] of mission.objectives.entries()) {
        reports.push({
          title: `Mission Objective ${index + 1}`,
          objective,
          priority: "high"
        });
      }
    }

    // If no recent activity, provide status reports
    if (reports.length === 0) {
      const turn = engine.getTurnSummary();
      reports.push({
        title: "Sector Status Report",
        objective: `Turn ${turn.turnNumber}: All units maintaining positions. No significant enemy contact.`,
        priority: "low"
      });
    }

    return reports.slice(0, 6); // Max 6 reports
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
