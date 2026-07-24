import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { getScenarioByMissionKey } from "../src/data/scenarioRegistry";
import { assertScenarioSourceValid, validateScenarioSource } from "../src/data/scenarioValidation";
import { getAllMissionKeys } from "../src/data/missions";
import { CoordinateSystem, type TileEntry } from "../src/rendering/CoordinateSystem";
import type { TilePalette } from "../src/core/types";

function cloneScenario<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mapSignature(scenario: ReturnType<typeof getScenarioByMissionKey>): string {
  return JSON.stringify({ size: scenario.size, tiles: scenario.tiles });
}

registerTest("SCENARIO_VALIDATION_ACCEPTS_REGISTERED_SCENARIOS", async ({ Given, When, Then }) => {
  const issuesByMission = new Map<string, readonly string[]>();

  await Given("the currently registered authored scenarios", async () => {
    document.body.innerHTML = "";
  });

  await When("each scenario is validated against its authoritative profile", async () => {
    getAllMissionKeys().forEach((missionKey) => {
      issuesByMission.set(missionKey, validateScenarioSource(getScenarioByMissionKey(missionKey), missionKey).issues);
    });
  });

  await Then("the shipped scenarios pass validation", async () => {
    const failures = Array.from(issuesByMission.entries()).filter(([, issues]) => issues.length > 0);
    if (failures.length > 0) {
      throw new Error(
        `Expected every registered scenario to validate cleanly, received: ${failures
          .map(([missionKey, issues]) => `${missionKey}: ${issues.join(" | ")}`)
          .join(" || ")}`
      );
    }
  });
});

registerTest("SCENARIO_REGISTRY_USES_UNIQUE_AUTHORED_MAPS", async ({ Given, When, Then }) => {
  let duplicateGroups: string[][] = [];

  await Given("the currently registered authored battle scenarios", async () => {
    document.body.innerHTML = "";
  });

  await When("each non-campaign mission map is fingerprinted", async () => {
    const signatures = new Map<string, string[]>();
    getAllMissionKeys()
      .filter((missionKey) => missionKey !== "campaign")
      .forEach((missionKey) => {
        const signature = mapSignature(getScenarioByMissionKey(missionKey));
        const missionKeys = signatures.get(signature) ?? [];
        signatures.set(signature, [...missionKeys, missionKey]);
      });
    duplicateGroups = Array.from(signatures.values()).filter((missionKeys) => missionKeys.length > 1);
  });

  await Then("no shipped battle scenario shares the same tile map", async () => {
    if (duplicateGroups.length > 0) {
      throw new Error(
        `Expected authored scenarios to use unique maps, received duplicate groups: ${duplicateGroups
          .map((missionKeys) => missionKeys.join(", "))
          .join(" | ")}`
      );
    }
  });
});

registerTest("SCENARIO_REGISTRY_TILE_ENTRIES_RESOLVE_FOR_RENDERING", async ({ Given, When, Then }) => {
  const unresolvedTiles: string[] = [];

  await Given("the currently registered authored battle scenarios", async () => {
    document.body.innerHTML = "";
  });

  await When("each non-campaign mission tile is resolved through the renderer coordinate system", async () => {
    getAllMissionKeys()
      .filter((missionKey) => missionKey !== "campaign")
      .forEach((missionKey) => {
        const scenario = getScenarioByMissionKey(missionKey);
        for (let rowIndex = 0; rowIndex < scenario.size.rows; rowIndex += 1) {
          const row = scenario.tiles[rowIndex];
          if (!row) {
            unresolvedTiles.push(`${missionKey}[${rowIndex}]: missing row`);
            continue;
          }
          for (let colIndex = 0; colIndex < scenario.size.cols; colIndex += 1) {
            if (!Object.prototype.hasOwnProperty.call(row, colIndex)) {
              unresolvedTiles.push(`${missionKey}[${rowIndex},${colIndex}]: missing entry`);
              continue;
            }
            const entry = row[colIndex];
            const tile = CoordinateSystem.resolveTile(entry as TileEntry, scenario.tilePalette as TilePalette);
            if (!tile) {
              unresolvedTiles.push(`${missionKey}[${rowIndex},${colIndex}]`);
            }
          }
        }
      });
  });

  await Then("every shipped battle scenario tile can render", async () => {
    if (unresolvedTiles.length > 0) {
      throw new Error(`Expected every scenario tile to resolve for rendering, received: ${unresolvedTiles.join(", ")}`);
    }
  });
});

registerTest("SCENARIO_VALIDATION_REJECTS_MISSING_TILE_COORDINATES", async ({ Given, When, Then }) => {
  let resultIssues: readonly string[] = [];

  await Given("a scenario whose declared footprint contains an empty tile coordinate", async () => {
    document.body.innerHTML = "";
  });

  await When("the validator inspects the incomplete matrix", async () => {
    const invalidScenario = cloneScenario(getScenarioByMissionKey("assault_el_alamein"));
    invalidScenario.tiles[6]![9] = null as never;
    resultIssues = validateScenarioSource(invalidScenario, "assault_el_alamein").issues;
  });

  await Then("validation identifies the exact missing tile", async () => {
    if (!resultIssues.some((issue) => issue.includes("tile [6][9] is empty or malformed"))) {
      throw new Error(`Expected exact missing-tile validation failure, received: ${resultIssues.join(" | ")}`);
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

registerTest("SCENARIO_VALIDATION_REJECTS_BELOW_PROFILE_MINIMUM_MAPS", async ({ Given, When, Then }) => {
  let thrown: Error | null = null;

  await Given("a scenario clone whose map depth was reduced below the profile minimum", async () => {
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

  await Then("validation fails with an actionable profile minimum message", async () => {
    if (!thrown) {
      throw new Error("Expected shallow long-range scenario validation to throw");
    }
    if (!thrown.message.includes("depth 13 is below the profile minimum 15")) {
      throw new Error(`Expected profile minimum failure, received: ${thrown.message}`);
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
    if (!resultIssues.some((issue) => issue.includes("declares capacity 21 but only") && issue.includes("usable hexes"))) {
      throw new Error(`Expected deployment-capacity validation failure, received: ${resultIssues.join(" | ")}`);
    }
  });
});

registerTest("SCENARIO_VALIDATION_REQUIRES_BATTLE_REQUISITION_POLICY", async ({ Given, When, Then }) => {
  let resultIssues: readonly string[] = [];

  await Given("a scenario clone missing in-battle requisition policy fields", async () => {
    document.body.innerHTML = "";
  });

  await When("the validator inspects the modified scenario", async () => {
    const invalidScenario = cloneScenario(getScenarioByMissionKey("training")) as Record<string, unknown>;
    delete invalidScenario["mainSupplyDistanceTurns"];
    invalidScenario.allowedBattleRequisitions = ["tank"];
    resultIssues = validateScenarioSource(invalidScenario, "training").issues;
  });

  await Then("validation reports the missing supply distance and disallowed battle requisition", async () => {
    if (!resultIssues.some((issue) => issue.includes("mainSupplyDistanceTurns"))) {
      throw new Error(`Expected missing mainSupplyDistanceTurns validation failure, received: ${resultIssues.join(" | ")}`);
    }
    if (!resultIssues.some((issue) => issue.includes("not marked inBattleAllowed"))) {
      throw new Error(`Expected in-battle requisition eligibility failure, received: ${resultIssues.join(" | ")}`);
    }
  });
});
