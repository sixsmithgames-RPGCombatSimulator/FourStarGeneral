/** Live-shaped stacked roster/current-supply regressions; no tactical rules are replaced by fixtures. */
import "./domEnvironment.js";
import assert from "node:assert/strict";
import { registerTest as registerHarnessTest, type TestFn } from "./harness.js";
import type { Axial, ScenarioData, ScenarioSide, ScenarioUnit } from "../src/core/types";
import unitTypes from "../src/data/unitSystem/derivedUnitTypes";
import terrain from "../src/data/terrain.json";
import { GameEngine, type GameEngineConfig, type SupplySnapshot, type TurnFaction } from "../src/game/GameEngine";
import { GameEngineInitiativeMethods } from "../src/game/GameEngineInitiativeIntegration";
import { createScenarioUnitFromTemplate, findTemplateForUnitKey } from "../src/game/adapters";
import { createOffMapSupportAsset } from "../src/game/support/SupportAssetFactory";
import { ensureDeploymentState, resetDeploymentState } from "../src/state/DeploymentState";

/** Own deployment singleton setup and teardown for every case, including fixture or assertion failures. */
function registerTest(id: string, spec: TestFn): void {
  registerHarnessTest(id, async (context) => {
    resetDeploymentState();
    try {
      await spec(context);
    } finally {
      resetDeploymentState();
    }
  });
}

const HEXES: readonly Axial[] = [{ q: 1, r: 1 }, { q: 0, r: 1 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 2, r: 1 }, { q: 1, r: 2 }];
const FACTIONS: readonly TurnFaction[] = ["Player", "Bot", "Ally"];
const MEMBERS: ReadonlyArray<readonly [string, string, number]> = [
  ["supplyConvoy", "convoy", 0],
  ["infantry", "16th-1", 1], ["infantry", "16th-2", 1],
  ["infantry", "18th-1", 2], ["infantry", "18th-2", 2],
  ["infantry", "18th-3", 3], ["infantry", "18th-4", 3],
  ["infantry", "116th-1", 4], ["engineer", "5th-engineer", 4],
  ["engineer", "6th-engineer", 5], ["infantry", "116th-2", 5]
];

function unit(key: string, id: string, hex: Axial, faction: TurnFaction = "Player", ammo?: number): ScenarioUnit {
  const template = findTemplateForUnitKey(key);
  assert.ok(template, `Missing authored formation template: ${key}`);
  const created = createScenarioUnitFromTemplate(template, hex);
  return {
    ...created,
    unitId: id,
    preDeployed: true,
    controlledBy: faction === "Player" ? "Player" : "AI",
    ...(ammo === undefined ? {} : { ammo }),
    campaignProvenance: {
      campaignId: "stacked-reporting", formationId: `campaign-${id}`, engagementId: "omaha-supported-attack",
      sourceRevision: 1, sourceSegment: 1, faction, ownership: "core", formationName: id, campaignUnitType: created.type
    }
  };
}

function side(units: ScenarioUnit[], hq: Axial = HEXES[0]): ScenarioSide {
  return { hq, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units };
}

/** Uses real template units and public deployment boundaries to reproduce eleven formations on six hexes. */
function fixture(otherFactions = false, isolatedSupply = false): { engine: GameEngine; config: GameEngineConfig } {
  ensureDeploymentState().initialize([
    { key: "infantry", label: "Infantry Battalion", remaining: 8 },
    { key: "engineer", label: "Engineering Corps", remaining: 2 },
    { key: "supplyConvoy", label: "Supply Convoy", remaining: 1 }
  ]);
  // The consumption variant puts the ten combat formations beyond supply range, without a delivery convoy.
  const players = MEMBERS.filter(([key]) => !isolatedSupply || key !== "supplyConvoy")
    .map(([key, id, hex]) => unit(key, id, HEXES[hex]));
  const playerBase = isolatedSupply ? { q: 18, r: 0 } : HEXES[0];
  const size = isolatedSupply ? { cols: 20, rows: 12 } : { cols: 7, rows: 5 };
  const botHex = { q: 5, r: 0 };
  const allyHex = { q: 5, r: 1 };
  const botBase = { q: 6, r: 0 };
  const allyBase = { q: 6, r: 1 };
  const scenario: ScenarioData = {
    name: "Omaha supported attack stacked reporting",
    size,
    tilePalette: { plain: { terrain: "plains", terrainType: "rural", density: "average", features: [], recon: "intel" } },
    tiles: Array.from({ length: size.rows }, () => Array.from({ length: size.cols }, () => ({ tile: "plain" }))),
    objectives: [], turnLimit: 0,
    sides: {
      Player: side(players, playerBase),
      Bot: side(otherFactions ? [unit("infantry", "bot-1", botHex, "Bot", 1), unit("infantry", "bot-2", botHex, "Bot", 2), unit("supplyConvoy", "bot-convoy", botBase, "Bot")] : [], botBase),
      Ally: side(otherFactions ? [unit("infantry", "ally-1", allyHex, "Ally", 4), unit("infantry", "ally-2", allyHex, "Ally", 5), unit("supplyConvoy", "ally-convoy", allyBase, "Ally")] : [], allyBase)
    }
  };
  const support = createOffMapSupportAsset("shoreFireControlParty", "western-naval", "Western Naval Force naval gunfire");
  assert.ok(support);
  const config: GameEngineConfig = {
    scenario, unitTypes, terrain,
    playerSide: scenario.sides.Player, botSide: scenario.sides.Bot, allySide: scenario.sides.Ally,
    initialSupportAssets: [support], botStrategyMode: "Heuristic", botDifficulty: "Normal"
  };
  const engine = new GameEngine(config);
  engine.populateReservesFromPlayerUnits();
  engine.setBaseCamp(playerBase);
  engine.finalizeDeployment();
  return { engine, config };
}

function ammo(snapshot: SupplySnapshot): number {
  const category = snapshot.categories.find((entry) => entry.resource === "ammo");
  assert.ok(category);
  return category.total;
}

function sortedUnits(units: readonly ScenarioUnit[]): ScenarioUnit[] {
  return [...units].sort((left, right) => (left.unitId ?? "").localeCompare(right.unitId ?? ""));
}

function assertExactRoster(engine: GameEngine): void {
  const roster = engine.getRosterSnapshot();
  const units = engine.getPlayerPlacementsSnapshot();
  assert.equal(roster.frontline.length, 11, "Roster must count formations, not the six occupied hexes.");
  assert.equal(new Set(roster.frontline.map((entry) => entry.unitId)).size, 11, "Same-type stack members need distinct IDs.");
  assert.deepEqual(roster.frontline.map((entry) => entry.unitId).sort(), units.map((entry) => entry.unitId).sort());
  for (const entry of roster.frontline) {
    const actual = units.find((candidate) => candidate.unitId === entry.unitId);
    assert.ok(actual);
    assert.equal(entry.campaignFormationId, actual.campaignProvenance?.formationId);
    assert.equal(entry.ammo, actual.ammo);
  }
  assert.equal(roster.metrics.frontline, 11);
  assert.equal(roster.metrics.totalUnits, 12);
  assert.equal(roster.reserves.length, 0);
  assert.equal(roster.casualties.length, 0);
  assert.deepEqual(roster.support.map((entry) => [entry.unitId, entry.label, entry.strength]), [["western-naval", "Western Naval Force naval gunfire", 2]]);
}

registerTest("FSG_CAM_070_TACTICAL_STACKED_ROSTER_COUNTS_FORMATIONS_AND_PRESERVES_EXACT_IDS", async ({ Given, When, Then }) => {
  const { engine } = fixture();
  await Given("eight infantry, two engineers and one convoy occupy six hexes, with one naval support asset", () => {
    const units = engine.getPlayerPlacementsSnapshot();
    assert.equal(units.length, 11);
    assert.equal(new Set(units.map((entry) => `${entry.hex.q},${entry.hex.r}`)).size, 6);
    assert.equal(units.reduce((sum, entry) => sum + entry.ammo, 0), 60);
    assert.equal(engine.getHexStackMembers(HEXES[4], "Player").some((entry) => entry.unitId === "5th-engineer"), true);
  });
  await When("the deployed roster is read", () => assertExactRoster(engine));
  await Then("every original identity remains present in tactical serialization", () => {
    assert.deepEqual(engine.serialize().playerPlacements.map((entry) => entry.unitId).sort(), MEMBERS.map((entry) => entry[1]).sort());
  });
});

for (const [ticks, total, depletion, status] of [
  [1, 50, 5, "stable"], [3, 30, 3, "warning"], [5, 10, 1, "critical"]
] as const) {
  registerTest(`FSG_CAM_070_TACTICAL_STACKED_RECORDED_CONSUMPTION_${status.toUpperCase()}_SURVIVES_READS_AND_LOAD`, async ({ Given, When, Then }) => {
    const { engine, config } = fixture(false, true);
    engine.startPlayerTurnPhase();
    await Given("ten real combat formations carry sixty ammo beyond depot range with no convoy to resupply them", () => {
      assert.equal(engine.playerUnits.length, 10);
      assert.equal(engine.playerUnits.reduce((sum, entry) => sum + entry.ammo, 0), 60);
      assert.deepEqual(engine.serialize().baseCamp?.hex, { q: 18, r: 0 });
    });
    await When(`${ticks} real end-turn supply ticks consume one ammo per formation and record each boundary`, () => {
      for (let tick = 0; tick < ticks; tick += 1) {
        const historyLength = engine.getSupplyHistory().length;
        const report = engine.endTurn();
        assert.equal(report?.outOfSupply.length, 10);
        assert.equal(engine.getSupplyHistory().length, historyLength + 1);
        assert.equal(engine.playerUnits.reduce((sum, entry) => sum + entry.ammo, 0), 60 - 10 * (tick + 1));
      }
    });
    await Then("live and restored reads retain recorded burn, depletion, alerts and trend while refreshing phase and leaving history untouched", () => {
      const saved = engine.serialize();
      const history = engine.getSupplyHistory();
      const recorded = history[history.length - 1];
      const recordedAmmo = recorded.categories.find((entry) => entry.resource === "ammo");
      assert.ok(recordedAmmo);
      assert.equal(recordedAmmo.total, total);
      assert.equal(recordedAmmo.consumptionPerTurn, 10);
      assert.equal(recordedAmmo.estimatedDepletionTurns, depletion);
      assert.equal(recordedAmmo.status, status);
      const expectedTrend = history.slice(-4).map(ammo);
      assert.deepEqual(recordedAmmo.trend, expectedTrend);
      const expectedAlerts = status === "stable" ? [] : [{
        resource: "ammo", level: status,
        message: status === "warning"
          ? "Ammunition reserves trending low; resupply within the next few turns."
          : "Ammunition projected to run dry in 1 turns."
      }];
      assert.deepEqual(recorded.alerts.filter((entry) => entry.resource === "ammo"), expectedAlerts);
      const restored = GameEngine.fromSerialized(config, JSON.parse(JSON.stringify(saved)));
      for (const subject of [engine, restored]) {
        const beforeReads = subject.serialize();
        for (let read = 0; read < 3; read += 1) {
          const current = subject.getSupplySnapshot();
          const currentAmmo = current.categories.find((entry) => entry.resource === "ammo");
          assert.ok(currentAmmo);
          assert.equal(current.turn, ticks + 1, "Phase metadata must reflect the live turn after the recorded tick.");
          assert.equal(current.phase, "playerTurn");
          assert.equal(currentAmmo.total, total);
          assert.equal(currentAmmo.consumptionPerTurn, 10, "Reading a recorded boundary must not reset its burn to zero.");
          assert.equal(currentAmmo.estimatedDepletionTurns, depletion);
          assert.equal(currentAmmo.status, status);
          assert.deepEqual(currentAmmo.trend, expectedTrend, "A read must not append a duplicate current observation.");
          assert.deepEqual(current.categories, recorded.categories);
          assert.deepEqual(current.alerts.filter((entry) => entry.resource === "ammo"), expectedAlerts);
          assert.deepEqual(current.alerts, recorded.alerts);
          current.categories[0].trend.push(-999);
          current.alerts.length = 0;
          current.stockpile.ammo = -999;
        }
        assert.deepEqual(subject.getSupplyHistory(), history);
        assert.deepEqual(subject.serialize(), beforeReads, "Reads cannot change units, action flags, stock, ledgers or recorded history.");
      }
      assert.deepEqual(restored.serialize().supplyHistory, saved.supplyHistory);
      assert.deepEqual(restored.serialize().supplyStates, saved.supplyStates);
      assert.deepEqual(sortedUnits(restored.serialize().playerPlacements), sortedUnits(saved.playerPlacements));
    });
  });
}

registerTest("FSG_CAM_070_TACTICAL_STACKED_MOVEMENT_AND_SERIALIZED_RESUME_CONSERVE_IDENTITIES", async ({ Given, When, Then }) => {
  const { engine, config } = fixture();
  engine.startPlayerTurnPhase();
  const before = engine.serialize();
  const beforeRoster = engine.getRosterSnapshot();
  const destination = { q: 0, r: 2 };
  await Given("two infantry share an origin and the second has a legal movement destination", () => {
    assert.deepEqual(engine.getHexStackMembers(HEXES[1], "Player").map((entry) => entry.unitId), ["16th-1", "16th-2"]);
    assert.ok(engine.getReachableHexes(HEXES[1], "16th-2").some((hex) => hex.q === destination.q && hex.r === destination.r));
  });
  await When("the exact second member moves through the real movement API", () => {
    engine.moveUnit(HEXES[1], destination, "16th-2");
  });
  await Then("only that member changes location and all IDs, carried stock, and naval charges survive fresh-engine hydration", () => {
    const moved = engine.serialize();
    assert.equal(moved.playerPlacements.length, 11);
    assert.deepEqual(moved.playerPlacements.find((entry) => entry.unitId === "16th-2")?.hex, destination);
    assert.deepEqual(sortedUnits(moved.playerPlacements.filter((entry) => entry.unitId !== "16th-2")), sortedUnits(before.playerPlacements.filter((entry) => entry.unitId !== "16th-2")));
    assert.deepEqual(sortedUnits(moved.playerPlacements).map((entry) => [entry.unitId, entry.ammo, entry.fuel]), sortedUnits(before.playerPlacements).map((entry) => [entry.unitId, entry.ammo, entry.fuel]));
    assert.deepEqual(moved.supplyStates, before.supplyStates);
    assertExactRoster(engine);
    assert.deepEqual(engine.getRosterSnapshot().frontline.map((entry) => entry.unitId).sort(), beforeRoster.frontline.map((entry) => entry.unitId).sort(), "Movement cannot rename a roster entry.");
    const restored = GameEngine.fromSerialized(config, JSON.parse(JSON.stringify(moved)));
    assert.deepEqual(sortedUnits(restored.serialize().playerPlacements), sortedUnits(moved.playerPlacements));
    assert.deepEqual(restored.serialize().actionFlags, moved.actionFlags);
    assert.deepEqual(restored.serialize().supplyStates, moved.supplyStates);
    assert.deepEqual(restored.serialize().supplyHistory, moved.supplyHistory);
    assert.deepEqual(restored.getMovementBudget(destination, "16th-2"), engine.getMovementBudget(destination, "16th-2"));
    assertExactRoster(restored);
    assert.equal(ammo(restored.getSupplySnapshot()), 60);
  });
});

for (const path of ["CONVENTIONAL", "INITIATIVE"] as const) {
  registerTest(`FSG_CAM_070_TACTICAL_STACKED_CURRENT_SUPPLY_${path}_START_PRESERVES_HISTORY`, async ({ Given, When, Then }) => {
    const { engine } = fixture();
    const deploymentHistory = engine.getSupplyHistory();
    await Given("the last recorded supply sample belongs to deployment", () => {
      assert.equal(deploymentHistory[deploymentHistory.length - 1].phase, "deployment");
    });
    await When("the real turn-start path enters player turn one", () => {
      if (path === "INITIATIVE") new GameEngineInitiativeMethods(engine).startInitiativeTurnPhase(true);
      else engine.startPlayerTurnPhase();
    });
    await Then("current phase and sixty carried ammo are fresh while repeated reads leave all persistent state unchanged", () => {
      const before = engine.serialize();
      for (let read = 0; read < 3; read += 1) {
        const snapshot = engine.getSupplySnapshot();
        assert.equal(snapshot.phase, "playerTurn");
        assert.equal(snapshot.turn, 1);
        assert.equal(ammo(snapshot), 60);
        snapshot.stockpile.ammo = -999;
        snapshot.categories[0].total = -999;
      }
      assert.deepEqual(engine.serialize(), before, "Current reads cannot change units, stock, ledgers, history, or action flags.");
      assert.deepEqual(engine.getSupplyHistory(), deploymentHistory);
      const logistics = engine.getLogisticsSnapshot();
      assert.equal(logistics.connectedUnits, 10);
      assert.equal(logistics.convoyUnits, 1);
    });
  });
}

registerTest("FSG_CAM_070_TACTICAL_STACKED_CURRENT_SUPPLY_ISOLATES_EVERY_FACTION", async ({ Given, When, Then }) => {
  const { engine } = fixture(true);
  engine.startPlayerTurnPhase();
  const before = engine.serialize();
  const expected: Record<TurnFaction, number> = { Player: 60, Bot: 3, Ally: 9 };
  await Given("each faction has distinct ammunition totals and stacked formations", () => {
    assert.equal(engine.playerUnits.reduce((sum, entry) => sum + entry.ammo, 0), expected.Player);
    assert.equal(engine.botUnits.reduce((sum, entry) => sum + entry.ammo, 0), expected.Bot);
    assert.equal(engine.allyUnits.reduce((sum, entry) => sum + entry.ammo, 0), expected.Ally);
  });
  await When("interleaved reads request Player, Bot, and Ally projections", () => {
    for (const faction of [...FACTIONS, ...FACTIONS].reverse()) {
      const current = engine.getSupplySnapshot(faction);
      assert.equal(current.faction, faction);
      assert.equal(ammo(current), expected[faction], `${faction} must include its own overflow members only.`);
      assert.equal(current.phase, "playerTurn");
    }
  });
  await Then("no faction's units, action flags, depot ledger or history were changed by reading", () => {
    assert.deepEqual(engine.serialize(), before);
  });
});

registerTest("FSG_CAM_070_TACTICAL_STACKED_OLD_CHECKPOINT_REFRESHES_CURRENT_SUPPLY_WITHOUT_REWRITING_HISTORY", async ({ Given, When, Then }) => {
  const { engine, config } = fixture();
  engine.startPlayerTurnPhase();
  const saved = engine.serialize();
  assert.ok(saved.supplyHistory);
  const history = saved.supplyHistory.Player;
  const oldSample = history[history.length - 1];
  assert.ok(oldSample);
  // Reproduce the audited old checkpoint: complete units, but a cached primary-only deployment sample.
  oldSample.phase = "deployment";
  const oldAmmo = oldSample.categories.find((entry) => entry.resource === "ammo");
  assert.ok(oldAmmo);
  oldAmmo.total = 30;
  let restored: GameEngine;
  await Given("a serialized turn-one checkpoint retains the old thirty-ammo deployment sample", () => {
    assert.equal(saved.playerPlacements.length, 11);
    assert.equal(saved.phase, "playerTurn");
  });
  await When("a fresh engine loads that unchanged historical sample", () => {
    restored = GameEngine.fromSerialized(config, JSON.parse(JSON.stringify(saved)));
  });
  await Then("current reporting repairs itself immediately while historical samples and authoritative resources remain identical", () => {
    const beforeRead = restored.serialize();
    const current = restored.getSupplySnapshot();
    assert.equal(ammo(current), 60);
    assert.equal(current.phase, "playerTurn");
    assertExactRoster(restored);
    assert.deepEqual(restored.getSupplyHistory(), history);
    assert.equal(ammo(restored.getSupplyHistory()[history.length - 1]), 30);
    assert.deepEqual(restored.serialize(), beforeRead);
    assert.deepEqual(sortedUnits(beforeRead.playerPlacements), sortedUnits(saved.playerPlacements));
    assert.deepEqual(beforeRead.supplyStates, saved.supplyStates);
    assert.deepEqual(beforeRead.actionFlags, saved.actionFlags);
  });
});
