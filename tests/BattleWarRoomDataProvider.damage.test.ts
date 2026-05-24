import { registerTest } from "./harness.js";
import { BattleWarRoomDataProvider } from "../src/ui/components/BattleWarRoomDataProvider";
import type { BattleState } from "../src/state/BattleState";
import type {
  BattleRosterSnapshot,
  LogisticsSnapshot,
  RosterUnitSummary,
  SupplySnapshot
} from "../src/game/GameEngine";

const DAMAGED_STATUS: NonNullable<RosterUnitSummary["statusSummary"]> = {
  personnel: {
    fit: 105,
    injured: 10,
    wounded: 4,
    severelyWounded: 1,
    killed: 3,
    total: 123,
    casualties: 18,
    nonEffective: 8,
    effective: 110,
    readiness: 89
  },
  equipment: {
    operational: 16,
    damaged: 2,
    disabled: 1,
    destroyed: 1,
    total: 20,
    losses: 4,
    nonOperational: 2,
    effective: 17,
    readiness: 85
  },
  suppression: 2,
  readiness: 63,
  readinessBreakdown: {
    basis: "combined",
    personnelWeight: 0.65,
    equipmentWeight: 0.35,
    personnel: {
      total: 123,
      effective: 110,
      readiness: 89,
      loss: 11
    },
    equipment: {
      total: 20,
      effective: 17,
      readiness: 85,
      loss: 15
    }
  }
};

function createRosterUnit(): RosterUnitSummary {
  return {
    unitId: "u-damaged-armor",
    unitKey: "armor-company",
    label: "1st Armored Company",
    unitType: "Medium Tank",
    unitClass: "armor" as RosterUnitSummary["unitClass"],
    strength: 87.5,
    experience: 2,
    ammo: 6,
    fuel: 8,
    morale: 77,
    location: "2,0",
    status: "frontline",
    orders: [],
    attachments: [],
    tags: [],
    combatPower: 42,
    statusSummary: DAMAGED_STATUS
  };
}

function createRosterSnapshot(): BattleRosterSnapshot {
  const damagedUnit = createRosterUnit();
  return {
    updatedAt: "2026-05-13T12:00:00.000Z",
    frontline: [damagedUnit],
    support: [],
    reserves: [],
    casualties: [],
    metrics: {
      totalUnits: 1,
      frontline: 1,
      support: 0,
      reserve: 0,
      casualties: 0,
      combatPowerTotal: damagedUnit.combatPower,
      reserveDepth: 0
    }
  };
}

function createLogisticsSnapshot(): LogisticsSnapshot {
  return {
    turn: 3,
    deployedUnits: 3,
    connectedUnits: 3,
    isolatedUnits: 0,
    convoyUnits: 1,
    loadedConvoys: 1,
    convoyCargo: { ammo: 10, fuel: 12 },
    depotStock: { ammo: 40, fuel: 50, parts: 8 },
    supplySources: [],
    stockpiles: [],
    convoyStatuses: [],
    supportTeamStatuses: [
      {
        unitId: "u-medical",
        teamLabel: "Aid Section",
        type: "medical",
        route: "2,0",
        status: "treating",
        etaHours: 1,
        assignedUnitLabel: "1st Armored Company",
        assignedHex: "2,0",
        need: 15,
        lastTurnEffect: "stabilized 2 wounded",
        incident: null
      },
      {
        unitId: "u-maintenance",
        teamLabel: "Maintenance Section",
        type: "repair",
        route: "2,0",
        status: "repairing",
        etaHours: 2,
        assignedUnitLabel: "1st Armored Company",
        assignedHex: "2,0",
        need: 4,
        lastTurnEffect: "recovered 1 damaged vehicle",
        incident: null
      }
    ],
    priorityTargets: [
      {
        unitId: "u-damaged-armor",
        unitLabel: "1st Armored Company",
        hex: "2,0",
        priority: "high",
        ammoNeed: 3,
        fuelNeed: 4,
        assignedConvoys: 1,
        status: "delivering"
      }
    ],
    careTargets: [
      {
        unitId: "u-damaged-armor",
        unitLabel: "1st Armored Company",
        hex: "2,0",
        priority: "critical",
        type: "medical",
        need: 15,
        assignedAssets: 1,
        lastTurnEffect: "stabilized 2 wounded"
      },
      {
        unitId: "u-damaged-armor",
        unitLabel: "1st Armored Company",
        hex: "2,0",
        priority: "high",
        type: "repair",
        need: 4,
        assignedAssets: 1,
        lastTurnEffect: "recovered 1 damaged vehicle"
      }
    ],
    delayNodes: [],
    maintenanceBacklog: [],
    alerts: []
  };
}

function createSupplySnapshot(): SupplySnapshot {
  return {
    faction: "Player",
    turn: 3,
    phase: "playerTurn",
    updatedAt: "2026-05-13T12:00:00.000Z",
    categories: [
      {
        resource: "ammo",
        label: "Ammunition",
        total: 16,
        frontlineTotal: 16,
        reserveTotal: 0,
        stockpileTotal: 40,
        averagePerUnit: 5.3,
        consumptionPerTurn: 2,
        estimatedDepletionTurns: 8,
        trend: [18, 17, 16],
        status: "stable"
      },
      {
        resource: "fuel",
        label: "Fuel",
        total: 20,
        frontlineTotal: 20,
        reserveTotal: 0,
        stockpileTotal: 50,
        averagePerUnit: 6.7,
        consumptionPerTurn: 3,
        estimatedDepletionTurns: 7,
        trend: [24, 22, 20],
        status: "stable"
      }
    ],
    alerts: [],
    stockpile: {
      ammo: 40,
      fuel: 50,
      rations: 0,
      parts: 8
    },
    ledger: []
  };
}

registerTest("WAR_ROOM_PROVIDER_USES_DETAILED_DAMAGE_STATUS_FOR_HQ_CHANNELS", async ({ Given, Then }) => {
  let provider!: BattleWarRoomDataProvider;

  await Given("an HQ data provider backed by roster status pools and logistics recovery queues", async () => {
    const fakeEngine = {
      playerUnits: [],
      getTurnSummary: () => ({ phase: "playerTurn", activeFaction: "Player", turnNumber: 3 }),
      getRosterSnapshot: createRosterSnapshot,
      getReserveSnapshot: () => [],
      getLogisticsSnapshot: createLogisticsSnapshot,
      getSupplySnapshot: () => createSupplySnapshot(),
      getEnemyContactSnapshot: () => [],
      getCombatReports: () => [],
      getAirMissionReports: () => []
    };
    const fakeBattleState = {
      hasEngine: () => true,
      ensureGameEngine: () => fakeEngine,
      getPrecombatMissionInfo: () => ({
        title: "Damage Verification",
        briefing: "HQ should report detailed losses.",
        objectives: ["Hold the line."],
        turnLimit: 12
      }),
      subscribeToBattleUpdates: () => () => undefined
    };
    provider = new BattleWarRoomDataProvider(fakeBattleState as unknown as BattleState);
  });

  await Then("the HQ snapshot exposes personnel, equipment, logistics, readiness, and field-report damage details", async () => {
    const snapshot = provider.getSnapshot();

    if (snapshot.casualtyLedger.kia !== 3 || snapshot.casualtyLedger.wia !== 15) {
      throw new Error(`Expected detailed personnel ledger KIA 3 / WIA 15, saw ${JSON.stringify(snapshot.casualtyLedger)}.`);
    }
    if (snapshot.casualtyLedger.injured !== 10 || snapshot.casualtyLedger.wounded !== 4 || snapshot.casualtyLedger.severelyWounded !== 1) {
      throw new Error(`Expected separated injury severities, saw ${JSON.stringify(snapshot.casualtyLedger)}.`);
    }
    if (snapshot.casualtyLedger.equipmentDamaged !== 2 || snapshot.casualtyLedger.equipmentDisabled !== 1 || snapshot.casualtyLedger.equipmentDestroyed !== 1) {
      throw new Error(`Expected detailed equipment ledger, saw ${JSON.stringify(snapshot.casualtyLedger)}.`);
    }
    if (snapshot.readinessState.percentage !== 63 || snapshot.readinessState.personnelReadiness !== 89 || snapshot.readinessState.equipmentReadiness !== 85) {
      throw new Error(`Expected readiness to come from detailed status pools, saw ${JSON.stringify(snapshot.readinessState)}.`);
    }
    if (!snapshot.requisitions.some((entry) => entry.item.includes("Medical treatment")) || !snapshot.requisitions.some((entry) => entry.item.includes("Equipment repair"))) {
      throw new Error(`Expected medical and repair requisitions, saw ${JSON.stringify(snapshot.requisitions)}.`);
    }
    if (snapshot.logisticsSummary.supportTeamCount !== 2 || snapshot.logisticsSummary.careRequestCount !== 2) {
      throw new Error(`Expected HQ logistics summary to include support teams and care queue, saw ${JSON.stringify(snapshot.logisticsSummary)}.`);
    }
    if (!snapshot.commandOrders.some((entry) => entry.title.includes("Damage Assessment") && entry.objective.includes("2 damaged, 1 disabled, 1 destroyed"))) {
      throw new Error(`Expected damage assessment field report with equipment detail, saw ${JSON.stringify(snapshot.commandOrders)}.`);
    }

    provider.dispose();
  });
});
