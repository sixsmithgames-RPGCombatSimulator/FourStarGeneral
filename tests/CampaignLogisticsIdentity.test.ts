/** FSG-CAM-022: mixed logistics allocations retain exact roles through real deployment and resume. */
import "./domEnvironment.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerTest as registerHarnessTest, type TestFn } from "./harness.js";
import { GameEngine, type GameEngineConfig, type ReserveUnit } from "../src/game/GameEngine";
import type { ScenarioData, ScenarioUnit } from "../src/core/types";
import { ensureDeploymentState, resetDeploymentState } from "../src/state/DeploymentState";
import { getAllocationOption } from "../src/data/unitAllocation";
import unitTypes from "../src/data/unitSystem/derivedUnitTypes";
import terrain from "../src/data/terrain.json";
import { createScenarioUnitFromTemplate, findTemplateForUnitKey } from "../src/game/adapters";
import { createOffMapSupportAsset } from "../src/game/support/SupportAssetFactory";
import { computeCampaignContentHash } from "../src/game/campaign/runtime/CampaignCanonical";
import { DeploymentPanel } from "../src/ui/components/DeploymentPanel";
import { BattleScreen } from "../src/ui/screens/BattleScreen";

function registerTest(id: string, test: TestFn): void {
  registerHarnessTest(id, async (context) => {
    resetDeploymentState();
    try { await test(context); } finally {
      resetDeploymentState();
      document.body.replaceChildren();
    }
  });
}

const KEYS = ["supplyConvoy", "medic", "maintenance"] as const;

function fixture(): { engine: GameEngine; config: GameEngineConfig; panel: DeploymentPanel } {
  const state = ensureDeploymentState();
  state.initialize(KEYS.map((key) => ({ key, label: getAllocationOption(key)!.label, remaining: key === "medic" ? 2 : 1 })));
  const blueprints = state.toReserveBlueprints();
  assert.deepEqual(blueprints.map((entry) => [entry.unitKey, entry.unit.formationKey]), [
    ["supplyConvoy", "supplyConvoy"], ["medic", "medic"], ["medic", "medic"], ["maintenance", "maintenance"]
  ]);
  state.registerZones([{ zoneKey: "rear", capacity: 20, hexKeys: ["0,0", "1,0", "2,1", "3,1", "4,2", "5,2"], faction: "Player" }]);
  const general = { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 };
  const scenario: ScenarioData = {
    name: "Mixed campaign logistics deployment", size: { cols: 8, rows: 6 },
    tilePalette: { p: { terrain: "plains", terrainType: "rural", density: "average", features: [], recon: "intel" } },
    tiles: Array.from({ length: 6 }, () => Array.from({ length: 8 }, () => ({ tile: "p" }))),
    objectives: [], turnLimit: 0,
    sides: { Player: { hq: { q: 0, r: 0 }, general, units: [] }, Bot: { hq: { q: 7, r: 2 }, general, units: [] } }
  };
  const naval = createOffMapSupportAsset("shoreFireControlParty", "identity-ngfs", "Naval Gunfire Support");
  assert.ok(naval);
  const config: GameEngineConfig = { scenario, unitTypes, terrain, playerSide: scenario.sides.Player, botSide: scenario.sides.Bot, initialSupportAssets: [naval] };
  const engine = new GameEngine(config);
  engine.beginDeployment();
  engine.setBaseCamp({ q: 0, r: 0 });
  const markup = document.createElement("template");
  markup.innerHTML = readFileSync("index.html", "utf8");
  const root = markup.content.querySelector<HTMLElement>("#deploymentPanel");
  assert.ok(root, "Use the actual shipped deployment panel.");
  document.body.replaceChildren(root);
  const panel = new DeploymentPanel();
  panel.initialize();
  panel.markBaseCampAssigned("rear");
  return { engine, config, panel };
}

function mirror(engine: GameEngine, panel: DeploymentPanel): void {
  ensureDeploymentState().mirrorEngineState(engine);
  panel.update();
}

function assertCounts(engine: GameEngine, panel: DeploymentPanel, reserves: readonly number[]): void {
  mirror(engine, panel);
  const state = ensureDeploymentState();
  KEYS.forEach((key, index) => {
    const total = key === "medic" ? 2 : 1;
    assert.equal(state.getUnitCount(key), total, `${key} allocation total must not borrow another truck role.`);
    assert.equal(state.getReserveCount(key), reserves[index], `${key} reserve count`);
    assert.equal(state.getDeployedCount(key), total - reserves[index], `${key} deployed count`);
    const row = panel.getElement().querySelector<HTMLElement>(`#deploymentUnitList [data-unit-key='${key}']`);
    assert.ok(row, `${key} must remain a distinct real panel row.`);
    assert.equal(row.querySelector(".deployment-unit-label")?.textContent, getAllocationOption(key)!.label);
    assert.match(row.textContent ?? "", new RegExp(`${reserves[index]} remaining of ${total} total`));
  });
  const roster = engine.getRosterSnapshot();
  for (const entry of [...roster.frontline, ...roster.reserves]) {
    assert.equal(entry.label, getAllocationOption(entry.unitKey!)!.label);
    assert.equal(entry.logisticsRole, entry.unitKey === "medic" ? "medical" : entry.unitKey === "maintenance" ? "repair" : "supply");
  }
  assert.deepEqual(roster.support.map((entry) => [entry.unitId, entry.strength]), [["identity-ngfs", 2]]);
}

function identities(engine: GameEngine): Array<readonly [string | undefined, string | undefined]> {
  return [...engine.getPlayerPlacementsSnapshot(), ...engine.getReserveSnapshot().map((entry) => entry.unit)]
    .map((unit) => [unit.unitId, unit.formationKey] as const).sort(([a], [b]) => (a ?? "").localeCompare(b ?? ""));
}

interface LogisticsScreenProbe {
  countLiveReservesForUnitKey(engine: GameEngine, key: string): number;
  summarizeLiveReserveQueue(engine: GameEngine): string;
  resolveUnitLabelForUnit(unit: ScenarioUnit): string;
}

registerTest("FSG_CAM_100_LOGISTICS_MANUAL_DEPLOYMENT_SCANS_EXACT_IDENTITY_BEFORE_SHARED_TYPE", () => {
  const { engine } = fixture();
  const before = engine.getReserveSnapshot();
  assert.equal(before[0].allocationKey, "supplyConvoy");
  assert.equal(before[1].allocationKey, "medic");
  const medicId = before[1].unit.unitId;
  engine.deployUnitByKey({ q: 1, r: 0 }, "medic");
  assert.equal(engine.playerUnits[0].unitId, medicId, "An earlier same-type convoy must never consume the medic request.");
  assert.equal(engine.playerUnits[0].formationKey, "medic");
  assert.equal(engine.getReserveSnapshot()[0].unit.unitId, before[0].unit.unitId);
});

registerTest("FSG_CAM_100_LOGISTICS_PANEL_RECALL_AND_SERIALIZED_ROSTER_RETAIN_ROLES", async ({ Given, When, Then }) => {
  const { engine: initial, config, panel } = fixture();
  let engine = initial;
  const originalIdentities = identities(engine);
  const sourceUnits = new Map(engine.getReserveSnapshot().map((entry) => [entry.unit.unitId, entry.unit]));
  const screen = Object.create(BattleScreen.prototype) as LogisticsScreenProbe;
  await Given("one convoy, two medical detachments and one repair section occupy independent panel rows", () => {
    assertCounts(engine, panel, [1, 2, 1]);
    assert.deepEqual(KEYS.map((key) => screen.countLiveReservesForUnitKey(engine, key)), [1, 2, 1]);
  });
  await When("both medics deploy before the convoy and the medical pool is exhausted", () => {
    engine.deployUnitByKey({ q: 1, r: 0 }, "medic");
    assertCounts(engine, panel, [1, 1, 1]);
    // Serialized reserves omit transient allocationKey; formationKey remains the exact role authority.
    const partialSave = JSON.parse(JSON.stringify(engine.serialize()));
    engine = GameEngine.fromSerialized(config, partialSave);
    assert.ok(engine.getReserveSnapshot().every((entry) => entry.allocationKey === undefined));
    assertCounts(engine, panel, [1, 1, 1]);
    engine.deployUnitByKey({ q: 2, r: 0 }, "medic");
    assertCounts(engine, panel, [1, 0, 1]);
    assert.equal(screen.countLiveReservesForUnitKey(engine, "medic"), 0);
    const before = engine.serialize();
    assert.throws(() => engine.deployUnitByKey({ q: 3, r: 0 }, "medic"), /No reserve unit found/);
    assert.deepEqual(engine.serialize(), before, "Exhausted medical requests cannot consume supply or repair units.");
    assert.match(screen.summarizeLiveReserveQueue(engine), /Supply Convoy x1/);
    assert.ok(!screen.summarizeLiveReserveQueue(engine).includes("Medical"));
  });
  await When("the convoy deploys, recalls, and redeploys with the original identity and loadout", () => {
    engine.deployUnitByKey({ q: 3, r: 0 }, "supplyConvoy");
    assertCounts(engine, panel, [0, 0, 1]);
    const convoy = engine.playerUnits.find((unit) => unit.formationKey === "supplyConvoy")!;
    assert.equal(screen.resolveUnitLabelForUnit(convoy), "Supply Convoy");
    engine.recallUnit({ q: 3, r: 0 });
    assertCounts(engine, panel, [1, 0, 1]);
    const reserve = engine.getReserveSnapshot().find((entry) => entry.unit.unitId === convoy.unitId)!;
    assert.equal(reserve.allocationKey, "supplyConvoy");
    engine.deployUnitByKey({ q: 4, r: 0 }, "supplyConvoy");
    engine.deployUnitByKey({ q: 5, r: 0 }, "maintenance");
    assertCounts(engine, panel, [0, 0, 0]);
    assert.deepEqual(identities(engine), originalIdentities);
    engine.playerUnits.forEach((unit) => {
      const source = sourceUnits.get(unit.unitId)!;
      assert.deepEqual([unit.status, unit.ammo, unit.fuel, unit.strength], [source.status, source.ammo, source.fuel, source.strength]);
    });
  });
  await Then("a checksum-preserving JSON roundtrip and fresh engine/state retain every unit role and panel count", () => {
    const saved = engine.serialize();
    const loaded = JSON.parse(JSON.stringify(saved));
    assert.equal(computeCampaignContentHash(loaded), computeCampaignContentHash(saved));
    engine = GameEngine.fromSerialized(config, loaded);
    // Rebuild the mirror with no alias or pool history from the old deployment singleton.
    resetDeploymentState();
    assertCounts(engine, panel, [0, 0, 0]);
    assert.deepEqual(identities(engine), originalIdentities);
    assert.deepEqual(engine.getPlayerPlacementsSnapshot(), saved.playerPlacements);
    const beforeReads = engine.serialize();
    assertCounts(engine, panel, [0, 0, 0]);
    assert.deepEqual(engine.serialize(), beforeReads);
  });
});

registerTest("FSG_CAM_100_LOGISTICS_SCENARIO_RESERVES_IGNORE_MUTABLE_SHARED_TYPE_ALIAS", () => {
  const { config } = fixture();
  const supplyTemplate = findTemplateForUnitKey("supplyConvoy")!;
  const medicTemplate = findTemplateForUnitKey("medic")!;
  const legacy = createScenarioUnitFromTemplate(supplyTemplate, { q: 0, r: 0 });
  delete legacy.formationKey;
  const medical = createScenarioUnitFromTemplate(medicTemplate, { q: 0, r: 0 });
  const scenarioConfig = { ...config, playerSide: { ...config.playerSide, units: [legacy, medical] } };
  ensureDeploymentState().registerScenarioAlias("medic", "Supply_Truck");
  const engine = new GameEngine(scenarioConfig);
  engine.populateReservesFromPlayerUnits();
  assert.deepEqual(engine.getReserveSnapshot().map((entry) => [entry.allocationKey, entry.unit.formationKey]), [
    ["supplyConvoy", "supplyConvoy"], ["medic", "medic"]
  ]);
});

registerTest("FSG_CAM_100_LOGISTICS_CONFLICTING_EXPLICIT_IDENTITY_FAILS_BEFORE_MUTATION", () => {
  const { engine, config, panel } = fixture();
  const restored = GameEngine.fromSerialized(config, engine.serialize());
  // Deliberately corrupt transient reserve metadata to exercise rejection, not successful gameplay.
  (restored as unknown as { reserves: ReserveUnit[] }).reserves[0].allocationKey = "medic";
  const before = restored.serialize();
  assert.throws(() => restored.deployUnitByKey({ q: 1, r: 0 }, "medic"), /allocation identity/i);
  assert.deepEqual(restored.serialize(), before);
  (restored as unknown as { reserves: ReserveUnit[] }).reserves[0].allocationKey = "unknown-logistics-role";
  assert.throws(() => restored.deployUnitByKey({ q: 1, r: 0 }, "supplyConvoy"), /allocation identity/i);
  assert.deepEqual(restored.serialize(), before);
  (restored as unknown as { reserves: ReserveUnit[] }).reserves[0].allocationKey = "medic";
  const state = ensureDeploymentState();
  mirror(engine, panel);
  const previousMirror = JSON.stringify({ pool: state.pool, placements: state.getPlacements(), reserves: state.getReserves() });
  assert.throws(() => state.mirrorEngineState(restored), /allocation identity/i);
  assert.equal(JSON.stringify({ pool: state.pool, placements: state.getPlacements(), reserves: state.getReserves() }), previousMirror);
  engine.deployUnitByKey({ q: 1, r: 0 }, "supplyConvoy");
  const badPlaced = engine.serialize();
  badPlaced.playerPlacements[0].formationKey = "infantry";
  const badRecall = GameEngine.fromSerialized(config, badPlaced);
  const beforeRecall = badRecall.serialize();
  assert.throws(() => badRecall.recallUnit({ q: 1, r: 0 }), /allocation identity/i);
  assert.deepEqual(badRecall.serialize(), beforeRecall);
});

registerTest("FSG_CAM_100_LOGISTICS_INITIALIZATION_REJECTS_BAD_BLUEPRINT_BEFORE_CLEARING", () => {
  const { engine, panel } = fixture();
  engine.deployUnitByKey({ q: 1, r: 0 }, "supplyConvoy");
  mirror(engine, panel);
  const state = ensureDeploymentState();
  const source = engine.getPlayerPlacementsSnapshot()[0];
  const before = engine.serialize();
  for (const formationKey of ["supplyConvoy", "unknown-logistics-role"]) {
    state.recordCommittedEntries([{ key: "medic", label: "Medical Detachment", remaining: 1,
      campaignUnits: [{ ...structuredClone(source), formationKey }] }]);
    const beforeMirror = JSON.stringify({ pool: state.pool, placements: state.getPlacements(), reserves: state.getReserves() });
    assert.throws(() => engine.beginDeployment(), /allocation identity/i);
    assert.deepEqual(engine.serialize(), before, "Bad blueprint must not clear the old engine, placements, reserves or supply history.");
    assert.equal(JSON.stringify({ pool: state.pool, placements: state.getPlacements(), reserves: state.getReserves() }), beforeMirror);
  }

  state.recordCommittedEntries([{ key: "supplyConvoy", label: "Supply Convoy", remaining: 1,
    campaignUnits: [{ ...structuredClone(source), formationKey: "supplyConvoy" }] }]);
  const originalScenarioRoster = structuredClone((engine as unknown as { playerSide: { units?: ScenarioUnit[] } }).playerSide.units);
  const malformedAllocation = { ...structuredClone(source), formationKey: "infantry" };
  assert.throws(() => engine.initializeFromAllocations([malformedAllocation]), /allocation identity/i);
  assert.deepEqual(
    (engine as unknown as { playerSide: { units?: ScenarioUnit[] } }).playerSide.units,
    originalScenarioRoster,
    "A rejected allocation must leave the scenario roster unchanged."
  );
  assert.deepEqual(engine.serialize(), before, "A rejected allocation must leave serialized battle state unchanged.");
});
