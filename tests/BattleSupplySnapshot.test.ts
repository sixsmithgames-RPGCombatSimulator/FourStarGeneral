import assert from "node:assert/strict";
import { registerTest } from "./harness.js";
import type { ScenarioUnit } from "../src/core/types";
import { createSupplyState, type SupplyState } from "../src/core/SupplyState";
import type { SupplySnapshot as GameEngineSupplySnapshot } from "../src/game/GameEngine";
import {
  buildBattleSupplySnapshot,
  type BattleSupplySnapshotInput,
  type SupplyCategorySnapshot,
  type SupplySnapshot
} from "../src/game/logistics/BattleSupplySnapshot";

function unit(unitId: string, ammo: number, fuel: number): ScenarioUnit {
  return {
    type: "Infantry_42",
    unitId,
    hex: { q: 0, r: 0 },
    strength: 10,
    experience: 0,
    ammo,
    fuel,
    entrench: 0,
    facing: "SE"
  };
}

function category(resource: SupplyCategorySnapshot["resource"], total: number): SupplyCategorySnapshot {
  return {
    resource,
    label: resource,
    total,
    frontlineTotal: total,
    reserveTotal: 0,
    stockpileTotal: 0,
    averagePerUnit: total,
    consumptionPerTurn: 0,
    estimatedDepletionTurns: null,
    trend: [total],
    status: resource === "medical" || resource === "emergency" ? "unknown" : "stable"
  };
}

function historySnapshot(turn: number, ammo: number, fuel: number): SupplySnapshot {
  return {
    faction: "Player",
    turn,
    phase: "playerTurn",
    updatedAt: `recorded-${turn}`,
    categories: [
      category("ammo", ammo),
      category("fuel", fuel),
      category("medical", 0),
      category("emergency", 0)
    ],
    alerts: [],
    stockpile: { ammo: 0, fuel: 0, rations: 0, parts: 0 },
    ledger: []
  };
}

function supplyState(): SupplyState {
  const state = createSupplyState({
    baseline: { ammo: 0, fuel: 0, rations: 0, parts: 0 }
  });
  state.inventory.ammo.current = 9.6;
  state.inventory.fuel.current = 4.4;
  state.inventory.rations.current = 3.25;
  state.inventory.parts.current = 2.75;
  state.ledger.push({
    id: "ammo-consumption-2",
    turn: 2,
    type: "ammo",
    delta: -5,
    reason: "Characterization",
    timestamp: "2000-01-01T00:33:20.000Z"
  });
  return state;
}

function input(overrides: Partial<BattleSupplySnapshotInput> = {}): BattleSupplySnapshotInput {
  return {
    faction: "Player",
    turn: 2,
    phase: "playerTurn",
    frontlineUnits: [unit("frontline", 3, 4)],
    reserveUnits: [unit("reserve", 2, 1)],
    history: [
      historySnapshot(0, 20, 14),
      historySnapshot(1, 15, 11),
      historySnapshot(2, 10, 8)
    ],
    supplyState: supplyState(),
    ...overrides
  };
}

registerTest("BATTLE_SUPPLY_SNAPSHOT_PRESERVES_DETERMINISTIC_PROJECTION_RULES", ({ Given, When, Then }) => {
  const source = input();
  const sourceBefore = structuredClone(source);
  let snapshot: SupplySnapshot;

  Given("frontline and reserve stocks, recorded trends, fractional depot totals, and a ledger entry", () => {
    assert.equal(source.frontlineUnits.length, 1);
    assert.equal(source.reserveUnits.length, 1);
    assert.equal(source.history.length, 3);
  });
  When("the pure supply read model is projected", () => {
    snapshot = buildBattleSupplySnapshot(source);
  });
  Then("the established totals, ordering, burn rate, timestamp, alerts, and stockpile semantics remain exact", () => {
    assert.deepEqual(snapshot.categories.map((entry) => entry.resource), ["ammo", "fuel", "medical", "emergency"]);
    assert.deepEqual(snapshot.categories[0], {
      resource: "ammo",
      label: "Ammunition",
      total: 5,
      frontlineTotal: 3,
      reserveTotal: 2,
      stockpileTotal: 10,
      averagePerUnit: 2.5,
      consumptionPerTurn: 5,
      estimatedDepletionTurns: 1,
      trend: [20, 15, 10, 5],
      status: "critical"
    });
    assert.deepEqual(snapshot.categories[1], {
      resource: "fuel",
      label: "Fuel",
      total: 5,
      frontlineTotal: 4,
      reserveTotal: 1,
      stockpileTotal: 4,
      averagePerUnit: 2.5,
      consumptionPerTurn: 3,
      estimatedDepletionTurns: 1.7,
      trend: [14, 11, 8, 5],
      status: "warning"
    });
    assert.equal(snapshot.updatedAt, "2000-01-01T00:33:20.000Z");
    assert.deepEqual(snapshot.stockpile, { ammo: 9.6, fuel: 4.4, rations: 3.25, parts: 2.75 });
    assert.deepEqual(snapshot.alerts.map((entry) => [entry.resource, entry.level]), [
      ["ammo", "critical"],
      ["fuel", "warning"],
      ["medical", "info"],
      ["emergency", "info"]
    ]);
    assert.notEqual(snapshot.ledger[0], source.supplyState.ledger[0]);
    assert.deepEqual(source, sourceBefore, "Projection cannot mutate units, history, inventory, or ledger state.");

    snapshot.categories[0].total = -999;
    snapshot.stockpile.ammo = -999;
    assert.deepEqual(source, sourceBefore, "Mutating the returned read model cannot alter its inputs.");
  });
});

registerTest("BATTLE_SUPPLY_SNAPSHOT_PRESERVES_LOW_STOCK_NO_BURN_PRECEDENCE", ({ When, Then }) => {
  let snapshot: SupplySnapshot;
  When("one unit holds one round and the prior observation reports the same total", () => {
    snapshot = buildBattleSupplySnapshot(input({
      frontlineUnits: [unit("low-stock", 1, 1)],
      reserveUnits: [],
      history: [historySnapshot(1, 1, 1)]
    }));
  });
  Then("the legacy no-consumption rule keeps the category stable and emits stabilization copy", () => {
    const ammo = snapshot.categories.find((entry) => entry.resource === "ammo");
    assert.ok(ammo);
    assert.equal(ammo.status, "stable");
    assert.equal(ammo.consumptionPerTurn, 0);
    assert.equal(ammo.estimatedDepletionTurns, null);
    assert.deepEqual(snapshot.alerts.find((entry) => entry.resource === "ammo"), {
      resource: "ammo",
      level: "info",
      message: "Ammunition consumption stabilized after recent resupply."
    });
  });
});

registerTest("BATTLE_SUPPLY_SNAPSHOT_PRESERVES_ENEMY_INTEL_AND_PLACEHOLDER_COPY", ({ When, Then }) => {
  let snapshot: GameEngineSupplySnapshot;
  When("an empty Bot posture is projected through the extracted contract", () => {
    snapshot = buildBattleSupplySnapshot(input({
      faction: "Bot",
      frontlineUnits: [],
      reserveUnits: [],
      history: []
    }));
  });
  Then("unknown categories and enemy-specific informational alerts remain source-compatible", () => {
    assert.equal(snapshot.categories[2]?.notes, "Enemy medical reserves unavailable without recon confirmation.");
    assert.equal(snapshot.categories[3]?.notes, "Enemy emergency stores cannot be estimated with current intel.");
    assert.deepEqual(snapshot.alerts, [
      {
        resource: "medical",
        level: "info",
        message: "Enemy medical reserves unavailable without recon confirmation."
      },
      {
        resource: "emergency",
        level: "info",
        message: "Enemy emergency stores cannot be estimated with current intel."
      },
      {
        resource: "ammo",
        level: "info",
        message: "Enemy supply estimates reflect known deployments; confidence varies with recon coverage."
      }
    ]);
  });
});
