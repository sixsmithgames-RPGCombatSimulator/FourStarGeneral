import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { getScenarioByMissionKey } from "../src/data/scenarioRegistry";
import { finalizeDeploymentZone } from "../src/ui/utils/deploymentZonePlanner";
import type { ScenarioData } from "../src/core/types";

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function loadRiverWatchScenario(): ScenarioData {
  return cloneValue(getScenarioByMissionKey("patrol_river_watch")) as unknown as ScenarioData;
}

registerTest("DEPLOYMENT_ZONE_PLANNER_PRESERVES_AUTHORED_FRONTAGE_WHEN_SUFFICIENT", async ({ Given, When, Then }) => {
  let finalizedHexes: readonly string[] = [];
  let authoredHexes: readonly string[] = [];

  await Given("the authored River Crossing Watch player deployment zone", async () => {
    document.body.innerHTML = "";
  });

  await When("the shared zone finalizer resolves the authored frontage", async () => {
    const scenario = loadRiverWatchScenario();
    const zone = scenario.deploymentZones?.[0];
    if (!zone) {
      throw new Error("River Crossing Watch is missing the player deployment zone required by this test.");
    }
    authoredHexes = zone.hexes.map(([col, row]) => `${col},${row}`).sort((a, b) => a.localeCompare(b));
    finalizedHexes = finalizeDeploymentZone(zone, scenario, "patrol_river_watch").hexKeys;
  });

  await Then("the finalizer keeps the authored west-bank frontage intact", async () => {
    if (finalizedHexes.length !== 20) {
      throw new Error(`Expected widened frontage to expose 20 finalized hexes, received ${finalizedHexes.length}`);
    }
    if (finalizedHexes.join("|") !== authoredHexes.join("|")) {
      throw new Error(`Expected finalized zone to preserve authored frontage. Finalized: ${finalizedHexes.join(", ")}`);
    }
    if (!finalizedHexes.includes("4,1") || !finalizedHexes.includes("4,4")) {
      throw new Error(`Expected widened frontage to reach the eastern screening edge, received: ${finalizedHexes.join(", ")}`);
    }
  });
});

registerTest("DEPLOYMENT_ZONE_PLANNER_DERIVES_RIVER_WATCH_CAPACITY_FROM_DOCTRINE", async ({ Given, When, Then }) => {
  let finalizedCapacity = 0;
  let finalizedHexes: readonly string[] = [];

  await Given("a River Crossing Watch player zone whose authored capacity regressed below mission doctrine", async () => {
    document.body.innerHTML = "";
  });

  await When("the shared zone finalizer resolves the player frontage with mission context", async () => {
    const scenario = loadRiverWatchScenario();
    const zone = cloneValue(scenario.deploymentZones?.[0]);
    if (!zone) {
      throw new Error("River Crossing Watch is missing the player deployment zone required by this test.");
    }
    zone.capacity = 12;
    zone.hexes = [[0,1],[1,1],[2,1],[0,2],[1,2],[2,2],[0,3],[1,3],[2,3],[0,4],[1,4],[2,4]] as [number, number][];
    const finalizedZone = finalizeDeploymentZone(zone, scenario, "patrol_river_watch");
    finalizedCapacity = finalizedZone.capacity;
    finalizedHexes = finalizedZone.hexKeys;
  });

  await Then("the doctrine expands the zone to the mission minimum capacity instead of preserving the undersized authored cap", async () => {
    if (finalizedCapacity !== 20) {
      throw new Error(`Expected River Watch doctrine to expand capacity to 20, received ${finalizedCapacity}`);
    }
    if (finalizedHexes.length !== 20) {
      throw new Error(`Expected River Watch doctrine expansion to produce 20 deployment hexes, received ${finalizedHexes.length}`);
    }
    if (!finalizedHexes.includes("4,1") || !finalizedHexes.includes("4,4")) {
      throw new Error(`Expected doctrine-expanded frontage to extend to the eastern screening edge, received: ${finalizedHexes.join(", ")}`);
    }
  });
});

registerTest("DEPLOYMENT_ZONE_PLANNER_AUGMENTS_AUTHORED_ZONE_WHEN_CAPACITY_EXCEEDS_PATCH", async ({ Given, When, Then }) => {
  let finalizedHexes: readonly string[] = [];

  await Given("a River Crossing Watch zone regressed to the old narrow authored patch but keeping the widened capacity", async () => {
    document.body.innerHTML = "";
  });

  await When("the shared zone finalizer augments the authored patch", async () => {
    const scenario = loadRiverWatchScenario();
    const zone = cloneValue(scenario.deploymentZones?.[0]);
    if (!zone) {
      throw new Error("River Crossing Watch is missing the player deployment zone required by this test.");
    }
    zone.hexes = [[0,1],[1,1],[2,1],[0,2],[1,2],[2,2],[0,3],[1,3],[2,3],[0,4],[1,4],[2,4]] as [number, number][];
    zone.capacity = 20;
    finalizedHexes = finalizeDeploymentZone(zone, scenario, "patrol_river_watch").hexKeys;
  });

  await Then("the finalizer preserves the old authored patch and adds enough additional frontage to meet capacity", async () => {
    if (finalizedHexes.length !== 20) {
      throw new Error(`Expected augmented frontage to expose 20 finalized hexes, received ${finalizedHexes.length}`);
    }
    for (const seededHex of ["0,1", "2,4", "1,3"]) {
      if (!finalizedHexes.includes(seededHex)) {
        throw new Error(`Expected augmented zone to preserve authored seed hex ${seededHex}.`);
      }
    }
  });
});
