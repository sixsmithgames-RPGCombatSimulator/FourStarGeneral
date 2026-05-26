import { createEmptyWarRoomData } from "../../data/warRoomTypes";
import { CoordinateSystem } from "../../rendering/CoordinateSystem";
/**
 * Generates War Room overlay snapshots from live battle state.
 * Computes lightweight summaries on demand so the overlay always reflects the current turn.
 */
export class BattleWarRoomDataProvider {
    constructor(battleState) {
        this.listeners = new Set();
        this.battleState = battleState;
        // Mirror any meaningful battle-state changes directly into the overlay so commanders see fresh data without reopening.
        this.unsubscribeBattleUpdates = this.battleState.subscribeToBattleUpdates(() => this.publishUpdate());
    }
    formatDisplayHex(hex) {
        const { col, row } = CoordinateSystem.axialToOffset(hex.q, hex.r);
        return `${col},${row}`;
    }
    formatTurnNarrative(turn) {
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
        }
        else if (isEnemyPhase) {
            const narratives = [
                "Enemy forces repositioning. All units maintain heightened alert status.",
                "Hostile activity detected. Intelligence officers monitoring enemy movements.",
                "Enemy conducting tactical maneuvers. Forward observers tracking hostile positions."
            ];
            return narratives[turn.turnNumber % narratives.length] ?? narratives[0];
        }
        else if (isAllyPhase) {
            return "Allied forces coordinating movements. Maintaining communication with allied command.";
        }
        else if (turn.phase === "completed") {
            return "Operations concluded. Battle assessment in progress. Casualty reports being compiled.";
        }
        else {
            return "Operations transition in progress. Units preparing for next phase.";
        }
    }
    /**
     * Returns the latest situational picture. Falls back to the empty template when the engine is not ready yet.
     */
    getSnapshot() {
        const snapshot = createEmptyWarRoomData();
        if (!this.battleState.hasEngine()) {
            return snapshot;
        }
        const engine = this.battleState.ensureGameEngine();
        const turn = engine.getTurnSummary();
        const roster = engine.getRosterSnapshot();
        const reserves = engine.getReserveSnapshot();
        const mission = this.battleState.getPrecombatMissionInfo();
        const logisticsSnapshot = engine.getLogisticsSnapshot();
        const supplySnapshot = engine.getSupplySnapshot("Player");
        const forceDamage = this.summarizeForceDamage(roster);
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
        const totalForces = Math.max(1, roster.metrics.totalUnits);
        const reserveRatio = reserves.length / totalForces;
        const logisticsBoard = this.composeLiveLogisticsBoard(logisticsSnapshot, supplySnapshot);
        snapshot.supplyStatus = logisticsBoard.supplyStatus;
        snapshot.requisitions = this.composeRequisitions(reserves, reserveRatio, logisticsSnapshot);
        // Translate detailed status pools into the casualty and equipment ledger used by HQ.
        snapshot.casualtyLedger = {
            kia: forceDamage.killed,
            wia: forceDamage.injured + forceDamage.wounded + forceDamage.severelyWounded,
            mia: 0,
            injured: forceDamage.injured,
            wounded: forceDamage.wounded,
            severelyWounded: forceDamage.severelyWounded,
            personnelCasualties: forceDamage.personnelCasualties,
            nonEffectivePersonnel: forceDamage.nonEffectivePersonnel,
            equipmentDamaged: forceDamage.equipmentDamaged,
            equipmentDisabled: forceDamage.equipmentDisabled,
            equipmentDestroyed: forceDamage.equipmentDestroyed,
            equipmentLosses: forceDamage.equipmentLosses,
            affectedUnits: forceDamage.affectedUnits,
            criticalUnits: forceDamage.criticalUnits,
            destroyedUnits: forceDamage.destroyedUnits,
            updatedAt: new Date().toISOString()
        };
        snapshot.engagementLog = this.composeEngagementLog(engine, mission, forceDamage.personnelCasualties);
        snapshot.logisticsSummary = logisticsBoard.logisticsSummary;
        snapshot.commandOrders = this.composeFieldReports(engine, mission, roster, logisticsSnapshot);
        const readinessPercentage = forceDamage.averageReadiness;
        const readinessLevel = readinessPercentage >= 90
            ? "combat ready"
            : readinessPercentage >= 70
                ? "ready"
                : readinessPercentage >= 50
                    ? "preparing"
                    : "not ready";
        snapshot.readinessState = {
            level: readinessLevel,
            comment: this.composeReadinessComment(forceDamage),
            percentage: readinessPercentage,
            averageStrength: forceDamage.averageStrength,
            personnelReadiness: forceDamage.personnelReadiness,
            equipmentReadiness: forceDamage.equipmentReadiness ?? undefined,
            affectedUnits: forceDamage.affectedUnits,
            degradedUnits: forceDamage.degradedUnits,
            criticalUnits: forceDamage.criticalUnits,
            suppressedUnits: forceDamage.suppressedUnits,
            destroyedUnits: forceDamage.destroyedUnits
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
    getRosterUnits(roster) {
        return [
            ...roster.frontline,
            ...roster.support,
            ...roster.reserves,
            ...roster.casualties
        ];
    }
    getActiveRosterUnits(roster) {
        return [
            ...roster.frontline,
            ...roster.support,
            ...roster.reserves
        ];
    }
    summarizeForceDamage(roster) {
        const allUnits = this.getRosterUnits(roster);
        const activeUnits = this.getActiveRosterUnits(roster).filter((unit) => unit.statusSummary);
        const unitsWithStatus = allUnits.filter((unit) => unit.statusSummary);
        const totals = unitsWithStatus.reduce((acc, unit) => {
            const summary = unit.statusSummary;
            const personnel = summary.personnel;
            const equipment = summary.equipment;
            const unitAffected = personnel.casualties > 0 ||
                equipment.damaged > 0 ||
                equipment.disabled > 0 ||
                equipment.destroyed > 0 ||
                summary.suppression > 0 ||
                summary.readiness < 99.95 ||
                unit.status === "casualty";
            acc.injured += personnel.injured;
            acc.wounded += personnel.wounded;
            acc.severelyWounded += personnel.severelyWounded;
            acc.killed += personnel.killed;
            acc.personnelCasualties += personnel.casualties;
            acc.nonEffectivePersonnel += personnel.nonEffective;
            acc.equipmentDamaged += equipment.damaged;
            acc.equipmentDisabled += equipment.disabled;
            acc.equipmentDestroyed += equipment.destroyed;
            acc.equipmentLosses += equipment.losses;
            acc.affectedUnits += unitAffected ? 1 : 0;
            acc.criticalUnits += summary.readiness < 50 || unit.strength < 50 || unit.status === "casualty" ? 1 : 0;
            acc.degradedUnits += summary.readiness < 90 || unit.strength < 90 ? 1 : 0;
            acc.suppressedUnits += summary.suppression > 0 ? 1 : 0;
            acc.destroyedUnits += unit.status === "casualty" || unit.strength <= 0 ? 1 : 0;
            return acc;
        }, {
            injured: 0,
            wounded: 0,
            severelyWounded: 0,
            killed: 0,
            personnelCasualties: 0,
            nonEffectivePersonnel: 0,
            equipmentDamaged: 0,
            equipmentDisabled: 0,
            equipmentDestroyed: 0,
            equipmentLosses: 0,
            affectedUnits: 0,
            criticalUnits: 0,
            degradedUnits: 0,
            suppressedUnits: 0,
            destroyedUnits: 0
        });
        const activeStatusUnits = activeUnits.length > 0 ? activeUnits : unitsWithStatus;
        const averageReadiness = this.average(activeStatusUnits.map((unit) => unit.statusSummary?.readiness ?? unit.strength), 0);
        const averageStrength = this.average(activeStatusUnits.map((unit) => unit.strength), 0);
        const personnelReadiness = this.weightedAverage(activeStatusUnits.map((unit) => ({
            value: unit.statusSummary?.personnel.readiness ?? unit.strength,
            weight: unit.statusSummary?.personnel.total ?? 1
        })), averageReadiness);
        const equipmentWeighted = activeStatusUnits
            .filter((unit) => (unit.statusSummary?.equipment.total ?? 0) > 0)
            .map((unit) => ({
            value: unit.statusSummary.equipment.readiness,
            weight: unit.statusSummary.equipment.total
        }));
        return {
            ...totals,
            averageReadiness,
            averageStrength,
            personnelReadiness,
            equipmentReadiness: equipmentWeighted.length > 0 ? this.weightedAverage(equipmentWeighted, averageReadiness) : null
        };
    }
    average(values, fallback) {
        const finite = values.filter((value) => Number.isFinite(value));
        if (finite.length === 0) {
            return fallback;
        }
        return Math.max(0, Math.min(100, Math.round(finite.reduce((sum, value) => sum + value, 0) / finite.length)));
    }
    weightedAverage(values, fallback) {
        const finite = values.filter((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.weight) && entry.weight > 0);
        const weight = finite.reduce((sum, entry) => sum + entry.weight, 0);
        if (weight <= 0) {
            return fallback;
        }
        const value = finite.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / weight;
        return Math.max(0, Math.min(100, Math.round(value)));
    }
    composeReadinessComment(forceDamage) {
        const equipment = forceDamage.equipmentReadiness === null
            ? "no tracked equipment pools"
            : `${forceDamage.equipmentReadiness}% equipment readiness`;
        const damagePhrase = forceDamage.affectedUnits > 0
            ? `${forceDamage.affectedUnits} affected unit${forceDamage.affectedUnits === 1 ? "" : "s"}, ${forceDamage.criticalUnits} critical.`
            : "No status-pool damage recorded.";
        return `Average readiness ${forceDamage.averageReadiness}% with ${forceDamage.personnelReadiness}% personnel readiness and ${equipment}. ${damagePhrase} Personnel: ${forceDamage.killed} KIA, ${forceDamage.injured + forceDamage.wounded + forceDamage.severelyWounded} WIA. Equipment: ${forceDamage.equipmentDamaged} damaged, ${forceDamage.equipmentDisabled} disabled, ${forceDamage.equipmentDestroyed} destroyed.`;
    }
    composeRequisitions(reserves, reserveRatio, logisticsSnapshot) {
        const updatedAt = new Date().toISOString();
        const reserveRequests = reserves.slice(0, 5).map((reserve) => ({
            item: reserve.allocationKey ?? reserve.unit.type,
            quantity: 1,
            status: reserveRatio > 0.25 ? "approved" : "pending",
            requestedBy: "Reserve Pool",
            updatedAt
        }));
        const careRequests = (logisticsSnapshot?.careTargets ?? []).slice(0, 5).map((entry) => ({
            item: `${entry.type === "medical" ? "Medical treatment" : "Equipment repair"} - ${entry.unitLabel}`,
            quantity: Math.max(1, Math.round(entry.need)),
            status: entry.assignedAssets > 0 ? "approved" : "pending",
            requestedBy: `${entry.hex} priority ${entry.priority}`,
            updatedAt
        }));
        const supplyRequests = (logisticsSnapshot?.priorityTargets ?? [])
            .filter((entry) => entry.status !== "resupplied")
            .slice(0, 4)
            .map((entry) => ({
            item: `Resupply - ${entry.unitLabel}`,
            quantity: Math.max(1, Math.round(entry.ammoNeed + entry.fuelNeed)),
            status: entry.status === "direct" || entry.status === "delivering" ? "approved" : "pending",
            requestedBy: `${entry.hex} priority ${entry.priority}`,
            updatedAt
        }));
        return [...careRequests, ...supplyRequests, ...reserveRequests].slice(0, 10);
    }
    composeLiveLogisticsBoard(logisticsSnapshot, supplySnapshot) {
        if (!logisticsSnapshot || !supplySnapshot) {
            return {
                supplyStatus: {
                    status: "adequate",
                    note: "Logistics board is waiting for the battle engine."
                },
                logisticsSummary: {
                    throughput: "Convoy telemetry is not available yet."
                }
            };
        }
        const ammoCategory = this.findSupplyCategory(supplySnapshot, "ammo");
        const fuelCategory = this.findSupplyCategory(supplySnapshot, "fuel");
        const unitAmmo = ammoCategory?.total ?? 0;
        const unitFuel = fuelCategory?.total ?? 0;
        const ammoTotal = unitAmmo + logisticsSnapshot.convoyCargo.ammo + logisticsSnapshot.depotStock.ammo;
        const fuelTotal = unitFuel + logisticsSnapshot.convoyCargo.fuel + logisticsSnapshot.depotStock.fuel;
        const status = this.resolveSupplySummaryStatus(ammoCategory, fuelCategory, logisticsSnapshot);
        const stockLevel = Math.max(0, Math.min(100, Math.round(((ammoCategory?.averagePerUnit ?? 0) +
            (fuelCategory?.averagePerUnit ?? 0) +
            Math.min(8, logisticsSnapshot.depotStock.ammo + logisticsSnapshot.depotStock.fuel)) * 6)));
        const burnRate = Math.max(0, (ammoCategory?.consumptionPerTurn ?? 0) + (fuelCategory?.consumptionPerTurn ?? 0));
        const efficiency = logisticsSnapshot.deployedUnits <= 0
            ? 100
            : Math.max(0, Math.min(100, Math.round((logisticsSnapshot.connectedUnits / logisticsSnapshot.deployedUnits) * 100)));
        const bottleneck = logisticsSnapshot.alerts.find((alert) => alert.level === "critical")?.message
            ?? logisticsSnapshot.alerts.find((alert) => alert.level === "warning")?.message
            ?? undefined;
        return {
            supplyStatus: {
                status,
                note: `Ammo ${this.formatCompactNumber(ammoTotal)} total, fuel ${this.formatCompactNumber(fuelTotal)} total. ${logisticsSnapshot.convoyUnits} convoy${logisticsSnapshot.convoyUnits === 1 ? "" : "s"} on the map.`,
                stockLevel,
                consumptionRate: burnRate,
                ammoTotal,
                fuelTotal,
                depotAmmo: logisticsSnapshot.depotStock.ammo,
                depotFuel: logisticsSnapshot.depotStock.fuel,
                convoyAmmo: logisticsSnapshot.convoyCargo.ammo,
                convoyFuel: logisticsSnapshot.convoyCargo.fuel
            },
            logisticsSummary: {
                throughput: `${logisticsSnapshot.loadedConvoys}/${logisticsSnapshot.convoyUnits} convoys loaded, ${logisticsSnapshot.priorityTargets.length} resupply requests, ${logisticsSnapshot.supportTeamStatuses.length} support teams, ${logisticsSnapshot.careTargets.length} recovery requests.`,
                bottleneck,
                efficiency,
                convoyCount: logisticsSnapshot.convoyUnits,
                loadedConvoys: logisticsSnapshot.loadedConvoys,
                queueCount: logisticsSnapshot.priorityTargets.length,
                isolatedUnits: logisticsSnapshot.isolatedUnits,
                supportTeamCount: logisticsSnapshot.supportTeamStatuses.length,
                careRequestCount: logisticsSnapshot.careTargets.length,
                medicalRequestCount: logisticsSnapshot.careTargets.filter((entry) => entry.type === "medical").length,
                repairRequestCount: logisticsSnapshot.careTargets.filter((entry) => entry.type === "repair").length
            }
        };
    }
    findSupplyCategory(snapshot, resource) {
        return snapshot.categories.find((category) => category.resource === resource);
    }
    resolveSupplySummaryStatus(ammoCategory, fuelCategory, logisticsSnapshot) {
        const statuses = [ammoCategory?.status, fuelCategory?.status];
        if (statuses.includes("critical") || logisticsSnapshot.depotStock.ammo <= 0 || logisticsSnapshot.depotStock.fuel <= 0) {
            return "critical";
        }
        if (statuses.includes("warning") || logisticsSnapshot.isolatedUnits > 0 || logisticsSnapshot.priorityTargets.length > logisticsSnapshot.convoyUnits) {
            return "low";
        }
        if (logisticsSnapshot.depotStock.ammo > 80 && logisticsSnapshot.depotStock.fuel > 120 && logisticsSnapshot.priorityTargets.length === 0) {
            return "surplus";
        }
        return "adequate";
    }
    formatCompactNumber(value) {
        if (!Number.isFinite(value)) {
            return "0";
        }
        return Number(value.toFixed(1)).toString();
    }
    composeReconReports(engine) {
        const reports = [];
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
                }
                else if (contact.unitType) {
                    finding = `Enemy ${contact.unitType} spotted at sector ${sector}.`;
                    confidence = "High";
                }
                else {
                    finding = `Enemy unit detected at sector ${sector}.`;
                    confidence = "Medium";
                }
            }
            else {
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
    countPersonnelCasualties(personnel) {
        if (!personnel) {
            return 0;
        }
        return Math.max(0, (personnel.injured ?? 0) +
            (personnel.wounded ?? 0) +
            (personnel.severelyWounded ?? 0) +
            (personnel.killed ?? 0));
    }
    countEquipmentEffects(equipment) {
        if (!equipment) {
            return 0;
        }
        return Math.max(0, (equipment.damaged ?? 0) +
            (equipment.disabled ?? 0) +
            (equipment.destroyed ?? 0));
    }
    composeEngagementLog(engine, mission, casualtyCount) {
        const engagements = [];
        // Get ground combat reports
        const combatReports = engine.getCombatReports();
        const recentCombat = combatReports.slice(-5); // Last 5 ground engagements
        for (const combat of recentCombat) {
            const sector = `Sector ${this.formatDisplayHex(combat.defender.position)}`;
            const isPlayerOrAllyAttack = combat.attacker.faction === "Player" || combat.attacker.faction === "Ally";
            const isPlayerOrAllyDefender = combat.defender.faction === "Player" || combat.defender.faction === "Ally";
            let result = "ongoing";
            let note = "";
            if (combat.defender.destroyed) {
                result = isPlayerOrAllyAttack ? "victory" : "defeat";
                const damage = Math.round(combat.attackResult.damage);
                if (isPlayerOrAllyAttack) {
                    const effect = combat.attackResult.statusSummary ?? `${damage} readiness damage`;
                    note = `Our ${combat.attacker.unitType} destroyed hostile ${combat.defender.unitType} in sector ${this.formatDisplayHex(combat.defender.position)}. Enemy strength eliminated. Effects: ${effect}.`;
                }
                else {
                    note = `Enemy ${combat.attacker.unitType} destroyed our ${combat.defender.unitType} in sector ${this.formatDisplayHex(combat.defender.position)}. Unit lost. Replacement requested from reserves.`;
                }
            }
            else {
                // Unit survived
                const damage = Math.round(combat.attackResult.damage);
                const strengthLoss = combat.defender.strengthBefore - combat.defender.strengthAfter;
                if (isPlayerOrAllyAttack) {
                    const effect = combat.attackResult.statusSummary ?? `${damage} readiness damage`;
                    note = `Our ${combat.attacker.unitType} engaged hostile ${combat.defender.unitType}. Effects: ${effect}. Enemy strength reduced ${Math.round(strengthLoss)}%.`;
                }
                else if (isPlayerOrAllyDefender) {
                    const retaliation = combat.retaliation;
                    const effect = combat.attackResult.statusSummary ?? `${damage} readiness damage`;
                    const returnEffect = retaliation?.statusSummary ?? (retaliation ? `${Math.round(retaliation.damage)} readiness damage` : "");
                    note = `Enemy ${combat.attacker.unitType} attacked our ${combat.defender.unitType}. We sustained ${effect}${retaliation ? `, returned ${returnEffect}` : ''}.`;
                }
                else {
                    const effect = combat.attackResult.statusSummary ?? `${damage} readiness damage`;
                    note = `Hostile engagement observed: ${combat.attacker.unitType} vs ${combat.defender.unitType}. Effects: ${effect}.`;
                }
            }
            engagements.push({
                theater: `Ground Combat - ${sector}`,
                result,
                note,
                casualties: this.countPersonnelCasualties(combat.attackResult.personnel) || (combat.defender.destroyed ? 1 : undefined),
                personnelCasualties: this.countPersonnelCasualties(combat.attackResult.personnel),
                equipmentLosses: this.countEquipmentEffects(combat.attackResult.equipment),
                damageSummary: combat.attackResult.statusSummary,
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
    composeUnitDamageLine(unit) {
        const summary = unit.statusSummary;
        const location = unit.location ? ` at ${unit.location}` : "";
        if (!summary) {
            return `${unit.label}${location}: ${Math.round(unit.strength)}% strength. Detailed status pools are not available.`;
        }
        const personnel = summary.personnel;
        const equipment = summary.equipment;
        const personnelLine = personnel.total > 0
            ? `Personnel ${personnel.fit}/${personnel.total} fit, ${personnel.injured} injured, ${personnel.wounded} wounded, ${personnel.severelyWounded} severe, ${personnel.killed} KIA (${personnel.readiness}% ready)`
            : "Personnel pool not tracked";
        const equipmentLine = equipment.total > 0
            ? `Equipment ${equipment.operational}/${equipment.total} operational, ${equipment.damaged} damaged, ${equipment.disabled} disabled, ${equipment.destroyed} destroyed (${equipment.readiness}% ready)`
            : "Equipment pool not tracked";
        const suppressionLine = summary.suppression > 0 ? ` Suppression ${summary.suppression}.` : "";
        return `${unit.label}${location}: ${Math.round(summary.readiness)}% readiness, ${Math.round(unit.strength)}% strength. ${personnelLine}. ${equipmentLine}.${suppressionLine}`;
    }
    composeFieldReports(engine, mission, roster, logisticsSnapshot) {
        const reports = [];
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
                : `Sector ${sector}: ${combat.attacker.unitType} engaged ${combat.defender.unitType}. ${combat.attackResult.statusSummary ?? `${Math.round(combat.attackResult.damage)} readiness damage`}.`;
            reports.push({
                title: "Offensive Action Report",
                objective,
                priority: priority
            });
        }
        // Report enemy offensive actions
        for (const combat of enemyAttacks) {
            const sector = this.formatDisplayHex(combat.attacker.position);
            const priority = combat.defender.destroyed ? "critical" : "high";
            const objective = combat.defender.destroyed
                ? `Sector ${sector}: Enemy ${combat.attacker.unitType} destroyed our ${combat.defender.unitType}. Immediate response required.`
                : `Sector ${sector}: Enemy ${combat.attacker.unitType} attacked our ${combat.defender.unitType}. ${combat.attackResult.statusSummary ?? `${Math.round(combat.attackResult.damage)} readiness damage`} sustained.`;
            reports.push({
                title: "Enemy Attack Report",
                objective,
                priority: priority
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
                    priority: priority
                });
            }
        }
        const damagedUnits = this.getActiveRosterUnits(roster)
            .filter((unit) => unit.statusSummary && (unit.statusSummary.readiness < 90 ||
            unit.statusSummary.personnel.casualties > 0 ||
            unit.statusSummary.equipment.damaged > 0 ||
            unit.statusSummary.equipment.disabled > 0 ||
            unit.statusSummary.equipment.destroyed > 0 ||
            unit.statusSummary.suppression > 0))
            .sort((left, right) => (left.statusSummary?.readiness ?? 100) - (right.statusSummary?.readiness ?? 100))
            .slice(0, 4);
        for (const unit of damagedUnits) {
            const readiness = Math.round(unit.statusSummary?.readiness ?? unit.strength);
            reports.push({
                title: `Damage Assessment - ${unit.label}`,
                objective: this.composeUnitDamageLine(unit),
                priority: readiness < 50 ? "critical" : readiness < 75 ? "high" : "medium"
            });
        }
        for (const request of (logisticsSnapshot?.careTargets ?? []).slice(0, 3)) {
            reports.push({
                title: `${request.type === "medical" ? "Medical" : "Repair"} Recovery Request`,
                objective: `${request.unitLabel} at ${request.hex}: ${request.need} ${request.type === "medical" ? "treatment" : "repair"} points pending; ${request.assignedAssets} support team${request.assignedAssets === 1 ? "" : "s"} assigned.`,
                priority: request.assignedAssets > 0 ? "medium" : "high"
            });
        }
        const recentCasualties = roster.casualties.slice(-2);
        for (const casualty of recentCasualties) {
            reports.push({
                title: `Casualty Report - ${casualty.label}`,
                objective: `${casualty.label} destroyed at ${casualty.location ?? "unknown sector"}. ${this.composeUnitDamageLine(casualty)}`,
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
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    /**
     * Notifies subscribers (e.g., the overlay) that battle data changed.
     */
    publishUpdate() {
        this.listeners.forEach((listener) => listener());
    }
    /**
     * Clears subscriptions so long-lived overlays do not leak listeners during route transitions.
     */
    dispose() {
        this.listeners.clear();
        this.unsubscribeBattleUpdates();
    }
}
