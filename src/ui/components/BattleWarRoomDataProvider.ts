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

  private formatTurnNarrative(turn: { phase: string; activeFaction: string; turnNumber: number }): string {
    const isPlayerPhase = turn.phase === "playerTurn" || turn.phase === "deployment";
    const isEnemyPhase = turn.phase === "botTurn";
    const isAllyPhase = turn.phase === "allyTurn";

    if (isPlayerPhase) {
      const narratives = [
        "Our forces consolidating positions and planning next phase of operations.",
        "Command assessing tactical situation. All units standing by for orders.",
        "Frontline units reporting readiness. Awaiting movement and engagement directives."
      ];
      return narratives[turn.turnNumber % narratives.length] ?? narratives[0];
    } else if (isEnemyPhase) {
      const narratives = [
        "Enemy forces repositioning. All units maintain heightened alert status.",
        "Hostile activity detected. Intelligence officers monitoring enemy movements.",
        "Enemy conducting tactical maneuvers. Forward observers tracking hostile positions."
      ];
      return narratives[turn.turnNumber % narratives.length] ?? narratives[0];
    } else if (isAllyPhase) {
      return "Allied forces coordinating movements. Maintaining communication with allied command.";
    } else if (turn.phase === "completed") {
      return "Operations concluded. Battle assessment in progress. Casualty reports being compiled.";
    } else {
      return "Operations transition in progress. Units preparing for next phase.";
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

    // During battle, show reserve units available for call-up as requisitions
    snapshot.requisitions = reserves.slice(0, 8).map((reserve) => ({
      item: reserve.unit.type,
      quantity: 1,
      status: reserveRatio > 0.25 ? "approved" : "pending",
      requestedBy: "Reserve Pool",
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

    // Get enemy contact reports from recon system
    const enemyContacts = engine.getEnemyContactSnapshot();
    const recentContacts = enemyContacts.slice(0, 5);

    for (const contact of recentContacts) {
      const sector = this.formatDisplayHex(contact.hex);
      const currentTurn = engine.getTurnSummary().turnNumber;
      const turnsAgo = currentTurn - contact.lastSeenTurn;
      const isFresh = turnsAgo === 0;

      let finding = "";
      let confidence = "Medium";

      if (contact.state === "visible" || contact.state === "identified") {
        if (contact.unitType && contact.strengthEstimate !== undefined) {
          finding = `Enemy ${contact.unitType} identified at sector ${sector}. Estimated strength: ${Math.round(contact.strengthEstimate)}%.`;
          confidence = "High";
        } else if (contact.unitType) {
          finding = `Enemy ${contact.unitType} spotted at sector ${sector}.`;
          confidence = "High";
        } else {
          finding = `Enemy unit detected at sector ${sector}.`;
          confidence = "Medium";
        }
      } else {
        // spotted but not identified
        finding = `Unidentified enemy contact at sector ${sector}. Requires closer reconnaissance.`;
        confidence = "Low";
      }

      if (!isFresh && turnsAgo <= 2) {
        finding += ` Last observed ${turnsAgo} turn${turnsAgo > 1 ? 's' : ''} ago.`;
      }

      reports.push({
        sector: `Sector ${sector}`,
        finding,
        confidence,
        reportedBy: contact.source,
        timestamp: new Date().toISOString()
      });
    }

    // If no enemy contacts, show recon unit patrol status
    if (reports.length === 0) {
      const playerUnits = engine.playerUnits;
      const reconUnits = playerUnits.filter((u) => {
        const unitType = u.type.toLowerCase();
        return unitType.includes("recon") || unitType.includes("scout") ||
               unitType.includes("fighter") || unitType.includes("interceptor");
      });

      for (const recon of reconUnits.slice(0, 3)) {
        const sector = this.formatDisplayHex(recon.hex);
        const isAir = recon.type.toLowerCase().includes("fighter") ||
                      recon.type.toLowerCase().includes("interceptor");

        reports.push({
          sector: `Sector ${sector}`,
          finding: isAir
            ? `Aerial reconnaissance patrol active. No enemy contacts in this sector.`
            : `Ground reconnaissance patrol maintaining observation. Area clear of enemy forces.`,
          confidence: "Medium",
          reportedBy: recon.type,
          timestamp: new Date().toISOString()
        });
      }

      // Final fallback if no recon units at all
      if (reports.length === 0) {
        reports.push({
          sector: "All Sectors",
          finding: "No dedicated reconnaissance assets deployed. Relying on frontline unit observations.",
          confidence: "Low",
          reportedBy: "Frontline Command",
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

    // Get ground combat reports
    const combatReports = engine.getCombatReports();
    const recentCombat = combatReports.slice(-5); // Last 5 ground engagements

    for (const combat of recentCombat) {
      const sector = `Sector ${this.formatDisplayHex(combat.defender.position)}`;
      const isPlayerOrAllyAttack = combat.attacker.faction === "Player" || combat.attacker.faction === "Ally";
      const isPlayerOrAllyDefender = combat.defender.faction === "Player" || combat.defender.faction === "Ally";

      let result: "victory" | "defeat" | "stalemate" | "ongoing" = "ongoing";
      let note = "";

      if (combat.defender.destroyed) {
        result = isPlayerOrAllyAttack ? "victory" : "defeat";
        const damage = Math.round(combat.attackResult.damage);

        if (isPlayerOrAllyAttack) {
          note = `Our ${combat.attacker.unitType} destroyed hostile ${combat.defender.unitType} in sector ${this.formatDisplayHex(combat.defender.position)}. Enemy strength eliminated with ${damage} damage dealt.`;
        } else {
          note = `Enemy ${combat.attacker.unitType} destroyed our ${combat.defender.unitType} in sector ${this.formatDisplayHex(combat.defender.position)}. Unit lost. Replacement requested from reserves.`;
        }
      } else {
        // Unit survived
        const damage = Math.round(combat.attackResult.damage);
        const strengthLoss = combat.defender.strengthBefore - combat.defender.strengthAfter;

        if (isPlayerOrAllyAttack) {
          note = `Our ${combat.attacker.unitType} engaged hostile ${combat.defender.unitType}. ${damage} damage inflicted, enemy strength reduced ${Math.round(strengthLoss)}%.`;
        } else if (isPlayerOrAllyDefender) {
          const retaliation = combat.retaliation;
          note = `Enemy ${combat.attacker.unitType} attacked our ${combat.defender.unitType}. We sustained ${damage} damage${retaliation ? `, returned ${Math.round(retaliation.damage)} damage` : ''}.`;
        } else {
          note = `Hostile engagement observed: ${combat.attacker.unitType} vs ${combat.defender.unitType}. ${damage} damage recorded.`;
        }
      }

      engagements.push({
        theater: `Ground Combat - ${sector}`,
        result,
        note,
        casualties: combat.defender.destroyed ? 1 : undefined,
        timestamp: combat.timestamp
      });
    }

    // Get air mission reports - event defaults to "resolved" when undefined
    const airReports = engine.getAirMissionReports();
    const recentAirMissions = airReports.slice(-3); // Last 3 missions

    for (const airMission of recentAirMissions) {
      // Skip refit events, include all resolved missions (undefined event defaults to resolved)
      if (airMission.event !== "refitStarted" && airMission.event !== "refitCompleted" && airMission.outcome) {
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
          timestamp: airMission.timestamp
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

    // Sort by timestamp descending (most recent first) and limit to 8 engagements
    return engagements
      .sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      })
      .slice(0, 8);
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

    // Get ground combat activity reports - separate player attacks from enemy attacks
    const combatReports = engine.getCombatReports();
    const playerAttacks = combatReports.filter(c => c.attacker.faction === "Player").slice(-2);
    const enemyAttacks = combatReports.filter(c => c.attacker.faction === "Bot").slice(-2);

    // Report player offensive actions
    for (const combat of playerAttacks) {
      const sector = this.formatDisplayHex(combat.defender.position);
      const priority = combat.defender.destroyed ? "medium" : "low";

      const objective = combat.defender.destroyed
        ? `Sector ${sector}: ${combat.attacker.unitType} destroyed hostile ${combat.defender.unitType}.`
        : `Sector ${sector}: ${combat.attacker.unitType} engaged ${combat.defender.unitType}, ${Math.round(combat.attackResult.damage)} damage inflicted.`;

      reports.push({
        title: "Offensive Action Report",
        objective,
        priority: priority as "low" | "medium" | "high" | "critical"
      });
    }

    // Report enemy offensive actions
    for (const combat of enemyAttacks) {
      const sector = this.formatDisplayHex(combat.attacker.position);
      const priority = combat.defender.destroyed ? "critical" : "high";

      const objective = combat.defender.destroyed
        ? `Sector ${sector}: Enemy ${combat.attacker.unitType} destroyed our ${combat.defender.unitType}. Immediate response required.`
        : `Sector ${sector}: Enemy ${combat.attacker.unitType} attacked our ${combat.defender.unitType}, ${Math.round(combat.attackResult.damage)} damage sustained.`;

      reports.push({
        title: "Enemy Attack Report",
        objective,
        priority: priority as "low" | "medium" | "high" | "critical"
      });
    }

    // Get air mission reports for recent activity - event defaults to "resolved" when undefined
    const airReports = engine.getAirMissionReports();
    const recentAir = airReports.slice(-3); // Last 3 missions

    for (const airMission of recentAir) {
      // Skip refit events, include resolved missions
      if (airMission.event !== "refitStarted" && airMission.event !== "refitCompleted") {
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

    return reports.slice(0, 12); // Max 12 reports - prioritize mission objectives + recent activity
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
