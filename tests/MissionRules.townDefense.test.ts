import { registerTest } from "./harness.js";
import type { ScenarioData, ScenarioUnit } from "../src/core/types.js";
import type { TurnFaction } from "../src/game/GameEngine.js";
import { createMissionRulesController } from "../src/state/missionRules.js";

const townDefenseScenario: ScenarioData = {
  name: "Town Defense",
  size: { cols: 20, rows: 16 },
  tilePalette: {},
  tiles: [],
  objectives: [
    { hex: { q: 14, r: -5 }, owner: "Player", vp: 250 }
  ],
  turnLimit: 20,
  sides: {
    Player: {
      hq: { q: 14, r: -5 },
      general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
      units: []
    },
    Bot: {
      hq: { q: 2, r: 12 },
      general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
      units: [
        { type: "Panzer_IV", hex: { q: 2, r: 12 }, strength: 100, experience: 0, ammo: 6, fuel: 40, entrench: 0, facing: "N" },
        { type: "Panzer_IV", hex: { q: 3, r: 12 }, strength: 100, experience: 0, ammo: 6, fuel: 40, entrench: 0, facing: "N" },
        { type: "Infantry_42", hex: { q: 2, r: 11 }, strength: 100, experience: 0, ammo: 6, fuel: 0, entrench: 0, facing: "N" },
        { type: "Infantry_42", hex: { q: 3, r: 11 }, strength: 100, experience: 0, ammo: 6, fuel: 0, entrench: 0, facing: "N" }
      ]
    },
    Ally: {
      hq: { q: 15, r: -4 },
      general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
      units: [
        { type: "Infantry_42", hex: { q: 15, r: -4 }, strength: 100, experience: 0, ammo: 6, fuel: 0, entrench: 0, facing: "S" }
      ]
    }
  }
};

function makeUnit(type: ScenarioUnit["type"], q: number, r: number, strength = 100): ScenarioUnit {
  return {
    type,
    hex: { q, r },
    strength,
    experience: 0,
    ammo: 6,
    fuel: type === "Infantry_42" ? 0 : 40,
    entrench: 0,
    facing: "S"
  };
}

function makeOccupancy(entries: Array<[string, TurnFaction]>): Map<string, TurnFaction> {
  return new Map<string, TurnFaction>(entries);
}

registerTest("missionRules: town defense orders retreat when the attack collapses", async ({ When, Then }) => {
  const controller = createMissionRulesController("patrol", townDefenseScenario);
  let status = controller.onTurnAdvanced({
    turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 5 },
    scenario: townDefenseScenario,
    occupancy: makeOccupancy([["14,-5", "Player"]]),
    playerUnits: [
      makeUnit("Infantry_42", 14, -5, 100),
      makeUnit("AT_Gun_50mm", 13, -5, 90),
      makeUnit("Howitzer_105", 12, -4, 85)
    ],
    botUnits: [
      makeUnit("Infantry_42", 4, 8, 15)
    ],
    allyUnits: [
      makeUnit("Infantry_42", 15, -4, 80)
    ]
  });

  await When("the defenders still hold town while the enemy is reduced to a shattered remnant", async () => {
    // Assertions run in Then for clearer error messages.
  });

  await Then("the mission resolves as a player victory with a single town objective marker", async () => {
    if (status.outcome.state !== "playerVictory") {
      throw new Error(`Expected a town-defense victory after enemy collapse, received ${status.outcome.state}`);
    }
    if (!status.outcome.reason?.includes("retreating from the town")) {
      throw new Error(`Expected retreat language in the outcome reason, received ${status.outcome.reason}`);
    }
    if (status.objectives.length !== 1 || status.objectives[0]?.id !== "primary_repel_enemy") {
      throw new Error(`Expected one repel-enemy objective, received ${status.objectives.map((objective) => objective.id).join(", ")}`);
    }
    if (status.markers?.length !== 1 || status.markers[0]?.tooltip?.includes("Ford")) {
      throw new Error(`Expected one town marker without ford text, received ${JSON.stringify(status.markers)}`);
    }
  });
});

registerTest("missionRules: town defense does not retreat if the defenders are also spent", async ({ When, Then }) => {
  const controller = createMissionRulesController("patrol", townDefenseScenario);
  let status = controller.onTurnAdvanced({
    turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 5 },
    scenario: townDefenseScenario,
    occupancy: makeOccupancy([["14,-5", "Player"]]),
    playerUnits: [
      makeUnit("Infantry_42", 14, -5, 10)
    ],
    botUnits: [
      makeUnit("Infantry_42", 4, 8, 15)
    ],
    allyUnits: []
  });

  await When("the enemy is weak but the player barely has any combat power left", async () => {
    // Assertions run in Then for clearer error messages.
  });

  await Then("the mission stays in progress because the attackers still have a plausible chance", async () => {
    if (status.outcome.state !== "inProgress") {
      throw new Error(`Expected the mission to remain in progress, received ${status.outcome.state}`);
    }
    if (status.objectives[0]?.state !== "inProgress") {
      throw new Error(`Expected the repel-enemy objective to remain in progress, received ${status.objectives[0]?.state}`);
    }
  });
});
