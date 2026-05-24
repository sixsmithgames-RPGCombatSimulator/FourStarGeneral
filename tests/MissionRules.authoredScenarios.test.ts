import { registerTest } from "./harness.js";
import type { ScenarioData, ScenarioUnit } from "../src/core/types.js";
import type { TurnFaction, TurnSummary } from "../src/game/GameEngine.js";
import { createMissionRulesController } from "../src/state/missionRules.js";

function makeSide(units: ScenarioUnit[] = []) {
  return {
    hq: { q: 0, r: 0 },
    general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
    units
  };
}

function makeUnit(type: ScenarioUnit["type"], q: number, r: number): ScenarioUnit {
  return {
    type,
    hex: { q, r },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "NE"
  };
}

function turn(turnNumber: number): TurnSummary {
  return { phase: "playerTurn", activeFaction: "Player", turnNumber };
}

const playerAssaultUnits = [
  makeUnit("Infantry_42", 0, 0),
  makeUnit("Engineer", 1, 0),
  makeUnit("Recon_Bike", 2, 0)
];

const liveBotUnit = makeUnit("Infantry_42", 10, 0);

const pointeDuHocScenario: ScenarioData = {
  name: "Pointe du Hoc",
  size: { cols: 16, rows: 14 },
  tilePalette: {},
  tiles: [],
  objectives: [
    { hex: { q: 2, r: 1 }, owner: "Bot", vp: 80 },
    { hex: { q: 5, r: 1 }, owner: "Bot", vp: 100 },
    { hex: { q: 9, r: 1 }, owner: "Bot", vp: 80 }
  ],
  turnLimit: 20,
  sides: {
    Player: makeSide(),
    Bot: makeSide([liveBotUnit])
  }
};

const citadelRidgeScenario: ScenarioData = {
  name: "Citadel Ridge",
  size: { cols: 24, rows: 18 },
  tilePalette: {},
  tiles: [],
  objectives: [
    { hex: { q: 16, r: -4 }, owner: "Bot", vp: 120 },
    { hex: { q: 16, r: 0 }, owner: "Bot", vp: 180 },
    { hex: { q: 16, r: 4 }, owner: "Bot", vp: 120 },
    { hex: { q: 20, r: -2 }, owner: "Bot", vp: 220 }
  ],
  turnLimit: 17,
  sides: {
    Player: makeSide(),
    Bot: makeSide([liveBotUnit])
  }
};

registerTest("missionRules: pointe du hoc completes six-turn battery hold", async ({ Given, When, Then }) => {
  const controller = createMissionRulesController("patrol_pointe_du_hoc", pointeDuHocScenario);
  let status = controller.getStatus();

  await Given("all three gun positions are in friendly hands", async () => {
    const occupancy = new Map<string, TurnFaction>([
      ["2,1", "Player"],
      ["5,1", "Player"],
      ["9,1", "Player"]
    ]);

    await When("the Rangers hold the battery for six consecutive turns", async () => {
      for (let turnNumber = 1; turnNumber <= 6; turnNumber += 1) {
        status = controller.onTurnAdvanced({
          turnSummary: turn(turnNumber),
          scenario: pointeDuHocScenario,
          occupancy,
          playerUnits: playerAssaultUnits,
          botUnits: [liveBotUnit]
        });
      }
    });
  });

  await Then("Pointe du Hoc resolves as a held battery victory", async () => {
    if (status.outcome.state !== "playerVictory") {
      throw new Error(`Expected Pointe du Hoc victory after six held turns, received ${status.outcome.state}`);
    }
    const primary = status.objectives.find((objective) => objective.id === "primary_hold_battery");
    if (!primary || primary.state !== "completed") {
      throw new Error("Expected Pointe du Hoc primary objective to complete.");
    }
    if ((status.markers ?? []).some((marker) => marker.status !== "player")) {
      throw new Error("Expected every Pointe du Hoc objective marker to be secured by friendly forces.");
    }
  });
});

registerTest("missionRules: citadel ridge requires command ridge in the capture set", async ({ When, Then }) => {
  const controller = createMissionRulesController("assault_citadel_ridge", citadelRidgeScenario);
  let status = controller.getStatus();

  await When("three strongpoints are held but the command ridge remains outside friendly control", async () => {
    status = controller.onTurnAdvanced({
      turnSummary: turn(6),
      scenario: citadelRidgeScenario,
      occupancy: new Map<string, TurnFaction>([
        ["16,-4", "Player"],
        ["16,0", "Player"],
        ["16,4", "Player"]
      ]),
      playerUnits: [playerAssaultUnits[0]],
      botUnits: [liveBotUnit]
    });
  });

  await Then("the assault remains unresolved with command ridge called out", async () => {
    if (status.outcome.state !== "inProgress") {
      throw new Error(`Expected Citadel Ridge to remain in progress without command ridge, received ${status.outcome.state}`);
    }
    const primary = status.objectives.find((objective) => objective.id === "primary_break_ridge");
    if (!primary?.detail?.includes("Command Ridge required")) {
      throw new Error(`Expected command-ridge requirement in primary detail, received ${primary?.detail ?? "<empty>"}`);
    }
  });
});

registerTest("missionRules: citadel ridge victory returns phase and objective markers", async ({ When, Then }) => {
  const controller = createMissionRulesController("assault_citadel_ridge", citadelRidgeScenario);
  let status = controller.getStatus();

  await When("the command ridge and two additional strongpoints are captured", async () => {
    status = controller.onTurnAdvanced({
      turnSummary: turn(7),
      scenario: citadelRidgeScenario,
      occupancy: new Map<string, TurnFaction>([
        ["16,-4", "Player"],
        ["16,0", "Player"],
        ["20,-2", "Player"]
      ]),
      playerUnits: [playerAssaultUnits[0]],
      botUnits: [liveBotUnit]
    });
  });

  await Then("the ridge assault resolves with battle-map marker data", async () => {
    if (status.outcome.state !== "playerVictory") {
      throw new Error(`Expected Citadel Ridge victory, received ${status.outcome.state}`);
    }
    const primary = status.objectives.find((objective) => objective.id === "primary_break_ridge");
    if (!primary || primary.state !== "completed") {
      throw new Error("Expected Citadel Ridge primary objective to complete.");
    }
    if (status.phase?.id !== "phase3_escalation") {
      throw new Error(`Expected Citadel Ridge to enter final counterattack phase, received ${status.phase?.id ?? "<none>"}`);
    }
    if ((status.markers ?? []).length !== 4) {
      throw new Error(`Expected four Citadel Ridge objective markers, received ${(status.markers ?? []).length}`);
    }
    const commandMarker = status.markers?.find((marker) => marker.hex.q === 20 && marker.hex.r === -2);
    if (commandMarker?.status !== "player") {
      throw new Error("Expected command ridge marker to be secured.");
    }
  });
});
