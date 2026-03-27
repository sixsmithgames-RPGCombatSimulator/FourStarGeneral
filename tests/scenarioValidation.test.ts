import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { getScenarioByMissionKey } from "../src/data/scenarioRegistry";
import { assertScenarioSourceValid, validateScenarioSource } from "../src/data/scenarioValidation";

function cloneScenario<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

registerTest("SCENARIO_VALIDATION_ACCEPTS_REGISTERED_SCENARIOS", async ({ Given, When, Then }) => {
  let patrolIssues: readonly string[] = [];
  let trainingIssues: readonly string[] = [];
  let riverIssues: readonly string[] = [];

  await Given("the currently registered authored scenarios", async () => {
    document.body.innerHTML = "";
  });

  await When("each scenario is validated against its authoritative profile", async () => {
    patrolIssues = validateScenarioSource(getScenarioByMissionKey("patrol"), "patrol").issues;
    trainingIssues = validateScenarioSource(getScenarioByMissionKey("training"), "training").issues;
    riverIssues = validateScenarioSource(getScenarioByMissionKey("patrol_river_watch"), "patrol_river_watch").issues;
  });

  await Then("the shipped scenarios pass validation", async () => {
    if (patrolIssues.length > 0) {
      throw new Error(`Expected patrol scenario to validate cleanly, received: ${patrolIssues.join(" | ")}`);
    }
    if (trainingIssues.length > 0) {
      throw new Error(`Expected training scenario to validate cleanly, received: ${trainingIssues.join(" | ")}`);
    }
    if (riverIssues.length > 0) {
      throw new Error(`Expected river-watch scenario to validate cleanly, received: ${riverIssues.join(" | ")}`);
    }
  });
});

registerTest("SCENARIO_VALIDATION_ACCEPTS_RECOVERABLE_RIVER_WATCH_SEED_PATCH", async ({ Given, When, Then }) => {
  let resultIssues: readonly string[] = [];

  await Given("a River Crossing Watch clone regressed to its old narrow deployment footprint", async () => {
    document.body.innerHTML = "";
  });

  await When("the validator inspects the regressed player frontage", async () => {
    const invalidScenario = cloneScenario(getScenarioByMissionKey("patrol_river_watch"));
    invalidScenario.deploymentZones[0].capacity = 12;
    invalidScenario.deploymentZones[0].hexes = [[0,1],[1,1],[2,1],[0,2],[1,2],[2,2],[0,3],[1,3],[2,3],[0,4],[1,4],[2,4]];
    resultIssues = validateScenarioSource(invalidScenario, "patrol_river_watch").issues;
  });

  await Then("validation accepts the authored seed patch because doctrine can expand it to the mission minimum", async () => {
    if (resultIssues.length > 0) {
      throw new Error(`Expected doctrine-driven validation to accept the recoverable River Watch seed patch, received: ${resultIssues.join(" | ")}`);
    }
  });
});

registerTest("SCENARIO_VALIDATION_REJECTS_SHALLOW_LONG_RANGE_MAPS", async ({ Given, When, Then }) => {
  let thrown: Error | null = null;

  await Given("a long-range scenario clone whose map depth was reduced below the allowed envelope", async () => {
    document.body.innerHTML = "";
  });

  await When("the validator checks the modified scenario", async () => {
    const invalidScenario = cloneScenario(getScenarioByMissionKey("training"));
    invalidScenario.size.rows = 13;
    invalidScenario.tiles = invalidScenario.tiles.slice(0, 13);

    try {
      assertScenarioSourceValid(invalidScenario, "training");
    } catch (error) {
      thrown = error as Error;
    }
  });

  await Then("validation fails with an actionable range-to-map-size message", async () => {
    if (!thrown) {
      throw new Error("Expected shallow long-range scenario validation to throw");
    }
    if (!thrown.message.includes("too shallow for longest non-air range 8")) {
      throw new Error(`Expected range envelope failure, received: ${thrown.message}`);
    }
  });
});

registerTest("SCENARIO_VALIDATION_REJECTS_OVERCAPACITY_DEPLOYMENT_ZONES", async ({ Given, When, Then }) => {
  let resultIssues: readonly string[] = [];

  await Given("a scenario clone whose player deployment zone declares more capacity than usable hexes", async () => {
    document.body.innerHTML = "";
  });

  await When("the validator inspects the modified deployment geometry", async () => {
    const invalidScenario = cloneScenario(getScenarioByMissionKey("patrol_river_watch"));
    invalidScenario.deploymentZones[0].capacity = 21;
    resultIssues = validateScenarioSource(invalidScenario, "patrol_river_watch").issues;
  });

  await Then("validation reports the capacity mismatch instead of silently accepting it", async () => {
    if (!resultIssues.some((issue) => issue.includes("declares capacity 21 but only 20 usable hexes"))) {
      throw new Error(`Expected deployment-capacity validation failure, received: ${resultIssues.join(" | ")}`);
    }
  });
});
