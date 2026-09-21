import assert from "node:assert/strict";
import { registerTest } from "./harness.js";
import type { ScenarioUnit } from "../src/core/types";
import type { AirMissionReportEntry, SupplySnapshot } from "../src/game/GameEngine";
import {
  buildBattleMissionRecord,
  resolveMissionEndResolution
} from "../src/game/battle/reporting/BattleMissionReport";
import { BattleState } from "../src/state/BattleState";
import type { MissionStatus } from "../src/state/missionRules";

function unit(type: ScenarioUnit["type"], unitId: string): ScenarioUnit {
  return {
    type,
    unitId,
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 10,
    fuel: 10,
    entrench: 0,
    facing: "SE"
  };
}

function supply(turn: number, ammo: number): SupplySnapshot {
  return {
    faction: "Player",
    turn,
    phase: "playerTurn",
    updatedAt: `2026-09-17T0${turn}:00:00.000Z`,
    categories: [{
      resource: "ammo",
      label: "Ammunition",
      total: ammo,
      frontlineTotal: ammo,
      reserveTotal: 0,
      stockpileTotal: 0,
      averagePerUnit: ammo,
      consumptionPerTurn: 0,
      estimatedDepletionTurns: null,
      trend: [ammo],
      status: "stable"
    }],
    alerts: [],
    stockpile: { ammo: 0, fuel: 0, rations: 0, parts: 0 },
    ledger: []
  };
}

function missionStatus(): MissionStatus {
  return {
    turn: 5,
    objectives: [
      { id: "primary", label: "Hold", tier: "primary", state: "completed" },
      { id: "secondary", label: "Preserve", tier: "secondary", state: "failed" },
      { id: "tertiary", label: "Scout", tier: "tertiary", state: "pending" }
    ],
    outcome: { state: "playerVictory", reason: "The line held." }
  };
}

function airReports(): AirMissionReportEntry[] {
  return [
    {
      id: "strike-report",
      missionId: "strike",
      turnResolved: 5,
      timestamp: "2026-09-17T05:00:00.000Z",
      faction: "Player",
      unitType: "Bomber",
      unitKey: "bomber-lost",
      kind: "strike",
      bomberAttrition: 20,
      interceptorAttrition: 30,
      escortAttrition: 5,
      kills: { cap: 1 }
    },
    {
      id: "refit-report",
      missionId: "refit",
      turnResolved: 5,
      timestamp: "2026-09-17T05:01:00.000Z",
      faction: "Player",
      unitType: "Bomber",
      unitKey: "bomber-live",
      kind: "strike",
      event: "refitStarted"
    }
  ];
}

registerTest("BATTLE_MISSION_REPORT_ASSEMBLER_PRESERVES_DEBRIEF_FACTS", async ({ Given, When, Then }) => {
  const initialPlayerUnits = [
    unit("Infantry_42", "infantry-1"),
    unit("Infantry_42", "infantry-2"),
    unit("Bomber", "bomber-lost"),
    unit("Howitzer_105", "artillery-1")
  ];
  let record!: ReturnType<typeof buildBattleMissionRecord>;

  await Given("immutable battle facts with losses, supply use, objectives, and one lost sortie", async () => {});

  await When("the game-layer report assembler builds the service-history record", async () => {
    record = buildBattleMissionRecord({
      missionKey: "town_defense",
      missionTitle: "Town Defense",
      completedAt: "2026-09-17T06:00:00.000Z",
      missionStatus: missionStatus(),
      initialPlayerUnits,
      currentPlayerUnits: [initialPlayerUnits[0]!, initialPlayerUnits[3]!],
      initialBotUnits: [unit("Infantry_42", "enemy-1"), unit("Panzer_IV", "enemy-2")],
      currentBotUnits: [unit("Panzer_IV", "enemy-2")],
      playerSupplyHistory: [supply(1, 100), supply(5, 60)],
      airMissionReports: airReports(),
      livePlayerUnitIds: ["infantry-1", "artillery-1", "bomber-live"]
    });
  });

  await Then("unit, ammunition, objective, and air-operation totals remain exact", async () => {
    assert.deepEqual(record.unitsDeployed, [
      { type: "Infantry_42", count: 2 },
      { type: "Bomber", count: 1 },
      { type: "Howitzer_105", count: 1 }
    ]);
    assert.deepEqual(record.casualties, [
      { type: "Infantry_42", count: 1 },
      { type: "Bomber", count: 1 }
    ]);
    assert.deepEqual(record.enemiesDestroyed, [{ type: "Infantry_42", count: 1 }]);
    assert.deepEqual(record.ammunition, {
      bombsDropped: 6,
      artilleryShellsFired: 12,
      rocketsFired: 0,
      smallArmsRounds: 14
    });
    assert.deepEqual(record.objectives, {
      primaryCompleted: 1,
      primaryTotal: 1,
      secondaryCompleted: 0,
      secondaryTotal: 1,
      tertiaryCompleted: 0,
      tertiaryTotal: 1
    });
    assert.deepEqual(record.airOperations, {
      sortiesFlown: 1,
      strikeSorties: 1,
      escortSorties: 0,
      patrolSorties: 0,
      transportSorties: 0,
      airCombatDamageInflicted: 35,
      airCombatDamageTaken: 20,
      hostileFlightsDestroyed: 1,
      playerFlightsLost: 1
    });
  });
});

registerTest("BATTLE_MISSION_END_RESOLUTION_IS_PRESENTATION_INDEPENDENT", async ({ When, Then }) => {
  let resolution!: ReturnType<typeof resolveMissionEndResolution>;

  await When("a terminal objective board is resolved outside BattleScreen", async () => {
    resolution = resolveMissionEndResolution(missionStatus(), 2);
  });

  await Then("the headquarters handoff retains the established result and recovery copy", async () => {
    assert.equal(resolution.success, true);
    assert.equal(resolution.objectivesCompleted, 1);
    assert.equal(resolution.objectivesFailed, 1);
    assert.equal(resolution.objectivesContested, 1);
    assert.equal(resolution.casualties, 2);
    assert.equal(resolution.reason, "The line held. Objective board: 1 completed, 1 failed, 1 contested.");
  });
});

registerTest("BATTLE_STATE_MISSION_REPORTING_SNAPSHOT_IS_DETACHED", async ({ Given, When, Then }) => {
  const enginePlayer = unit("Infantry_42", "player-1");
  const fakeEngine = {
    playerUnits: [enginePlayer],
    botUnits: [unit("Infantry_42", "enemy-1")],
    reserveUnits: [{ unit: unit("Bomber", "reserve-bomber") }],
    getSupplyHistory: () => [supply(1, 100)],
    getAirMissionReports: () => airReports()
  };
  const state = new BattleState();
  let snapshot!: NonNullable<ReturnType<BattleState["getMissionReportingSnapshot"]>>;

  await Given("a live engine behind the BattleState reporting boundary", async () => {
    Object.defineProperty(state, "gameEngine", { value: fakeEngine, writable: true });
  });

  await When("the UI-facing reporting snapshot is read and its copy is changed", async () => {
    snapshot = state.getMissionReportingSnapshot()!;
    snapshot.currentPlayerUnits[0]!.strength = 1;
  });

  await Then("engine units remain unchanged and deployed plus reserve identities are represented", async () => {
    assert.equal(enginePlayer.strength, 100);
    assert.deepEqual(snapshot.currentPlayerUnits.map((entry) => entry.unitId), ["player-1", "reserve-bomber"]);
    assert.deepEqual(snapshot.livePlayerUnitIds, ["player-1", "reserve-bomber"]);
    assert.equal(snapshot.airMissionReports.length, 2);
  });
});

registerTest("BATTLE_MISSION_REPORT_COUNTS_UNDEPLOYED_RESERVES_AS_SURVIVORS", async ({ Given, When, Then }) => {
  const deployed = unit("Infantry_42", "player-deployed");
  const reserve = unit("Bomber", "player-reserve");
  const state = new BattleState();
  let record!: ReturnType<typeof buildBattleMissionRecord>;

  await Given("one deployed formation and one surviving reserve behind the canonical reporting boundary", () => {
    Object.defineProperty(state, "gameEngine", {
      value: {
        playerUnits: [deployed],
        botUnits: [],
        reserveUnits: [{ unit: reserve }],
        getSupplyHistory: () => [supply(1, 100)],
        getAirMissionReports: () => []
      },
      writable: true
    });
  });

  await When("the service-history report consumes the detached survivor projection", () => {
    const snapshot = state.getMissionReportingSnapshot();
    if (!snapshot) throw new Error("Expected a mission reporting snapshot.");
    record = buildBattleMissionRecord({
      ...snapshot,
      missionKey: "reserve-survival",
      missionTitle: "Reserve Survival",
      completedAt: "2026-09-21T09:00:00.000Z",
      missionStatus: missionStatus(),
      initialPlayerUnits: [deployed, reserve],
      initialBotUnits: []
    });
  });

  await Then("the undeployed reserve is not reported as a casualty", () => {
    assert.deepEqual(record.casualties, []);
    assert.deepEqual(record.unitsDeployed, [
      { type: "Infantry_42", count: 1 },
      { type: "Bomber", count: 1 }
    ]);
  });
});
