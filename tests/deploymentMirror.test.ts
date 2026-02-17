/**
 * Validates that `DeploymentState.mirrorEngineState()` stays in sync with the engine snapshots.
 * The test exercises placements and reserves to ensure UI mirrors never drift from engine truth.
 */
import { registerTest } from "./harness.js";
import { DeploymentState, type DeploymentPoolEntry } from "../src/state/DeploymentState";
import type { GameEngineAPI, ReserveUnit } from "../src/game/GameEngine";
import type { ScenarioUnit } from "../src/core/types";

type MutableScenarioUnit = ScenarioUnit & { hex: NonNullable<ScenarioUnit["hex"]> };

type MirrorInputs = {
  placements: ScenarioUnit[];
  reserves: ReserveUnit[];
};

/**
 * Builds a minimal `ScenarioUnit` payload for test scenarios.
 */
function buildScenarioUnit(type: ScenarioUnit["type"], hex: { q: number; r: number }): MutableScenarioUnit {
  return {
    type,
    hex: { ...hex },
    strength: 10,
    experience: 1,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "N"
  } as MutableScenarioUnit;
}

/**
 * Creates a `ReserveUnit` structure from a scenario unit for mirror validation.
 */
function buildReserveUnit(unit: ScenarioUnit): ReserveUnit {
  return {
    unit,
    definition: {
      key: unit.type,
      name: unit.type,
      description: "",
      class: "infantry",
      moveType: "foot",
      movePoints: 4,
      fuel: unit.fuel ?? 0,
      ammo: unit.ammo ?? 0,
      traits: [],
      cost: 0
    } as unknown as ReserveUnit["definition"]
  };
}

registerTest("DEPLOYMENT_MIRROR_SYNCHRONIZES_COUNTS", async ({ Given, When, Then }) => {
  const deploymentState = new DeploymentState();
  const pool: DeploymentPoolEntry[] = [
    { key: "infantryBattalion", label: "Infantry Battalion", remaining: 3 },
    { key: "artilleryBattery", label: "Artillery Battery", remaining: 2 }
  ];

  const inputs: MirrorInputs = {
    placements: [],
    reserves: []
  };

  await Given("a deployment pool with registered scenario aliases", async () => {
    deploymentState.initialize(pool);
    deploymentState.registerScenarioAlias("infantryBattalion", "Infantry_42");
    deploymentState.registerScenarioAlias("artilleryBattery", "Howitzer_105");

    inputs.placements = [
      buildScenarioUnit("Infantry_42", { q: 1, r: 1 })
    ];

    inputs.reserves = [
      buildReserveUnit(buildScenarioUnit("Infantry_42", { q: 3, r: 0 })),
      buildReserveUnit(buildScenarioUnit("Infantry_42", { q: 4, r: 0 })),
      buildReserveUnit(buildScenarioUnit("Howitzer_105", { q: 2, r: 2 }))
    ];
  });

  await When("mirroring the engine snapshot", async () => {
    const engine = {
      baseCamp: { key: "5,2", hex: { q: 5, r: 2 } },
      getPlayerPlacementsSnapshot: () => inputs.placements,
      getReserveSnapshot: () => inputs.reserves
    } as unknown as GameEngineAPI;

    deploymentState.mirrorEngineState(engine);
  });

  await Then("the deployment pool, placements, and reserves reflect engine truth", async () => {
    const infantryEntry = deploymentState.pool.find((entry) => entry.key === "infantryBattalion");
    const artilleryEntry = deploymentState.pool.find((entry) => entry.key === "artilleryBattery");

    if (!infantryEntry || infantryEntry.remaining !== 2) {
      throw new Error("Expected infantry pool to report 2 remaining after mirroring.");
    }

    if (!artilleryEntry || artilleryEntry.remaining !== 1) {
      throw new Error("Expected artillery pool to report 1 remaining after mirroring.");
    }

    const placement = deploymentState.placements.get("1,1");
    if (!placement || placement.unitKey !== "infantryBattalion") {
      throw new Error("Placement mirror did not capture infantry deployment at 1,1.");
    }

    const reserves = deploymentState.getReserves();
    const reserveByKey = new Map(reserves.map((entry) => [entry.unitKey, entry]));
    const infantryReserve = reserveByKey.get("infantryBattalion");
    const artilleryReserve = reserveByKey.get("artilleryBattery");

    if (!infantryReserve || infantryReserve.remaining !== 2) {
      throw new Error("Expected infantry reserve mirror to report 2 units remaining.");
    }

    if (!artilleryReserve || artilleryReserve.remaining !== 1) {
      throw new Error("Expected artillery reserve mirror to report 1 unit remaining.");
    }
  });
});
