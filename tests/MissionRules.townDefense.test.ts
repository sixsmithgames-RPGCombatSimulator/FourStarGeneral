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
        { type: "Panzer_IV", hex: { q: 2, r: 12 }, strength: 100, experience: 0, ammo: 6, fuel: 40, entrench: 0, facing: "NW" },
        { type: "Panzer_IV", hex: { q: 3, r: 12 }, strength: 100, experience: 0, ammo: 6, fuel: 40, entrench: 0, facing: "NW" },
        { type: "Infantry_42", hex: { q: 2, r: 11 }, strength: 100, experience: 0, ammo: 6, fuel: 0, entrench: 0, facing: "NW" },
        { type: "Infantry_42", hex: { q: 3, r: 11 }, strength: 100, experience: 0, ammo: 6, fuel: 0, entrench: 0, facing: "NW" }
      ]
    },
    Ally: {
      hq: { q: 15, r: -4 },
      general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
      units: [
        { type: "Infantry_42", hex: { q: 15, r: -4 }, strength: 100, experience: 0, ammo: 6, fuel: 0, entrench: 0, facing: "SE" }
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
    facing: "SE"
  };
}

function makeOccupancy(entries: Array<[string, TurnFaction]>): Map<string, TurnFaction> {
  return new Map<string, TurnFaction>(entries);
}

registerTest("missionRules: town defense orders retreat when the attack collapses", async ({ When, Then }) => {
  const controller = createMissionRulesController("patrol", townDefenseScenario);
  const status = controller.onTurnAdvanced({
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
  const status = controller.onTurnAdvanced({
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

const twoBridgesPlayerUnits = [
  makeUnit("Infantry_42", 8, -1),
  makeUnit("Engineer", 9, 5),
  makeUnit("Light_Tank", 15, -2)
];

const twoBridgesBotUnits = [
  makeUnit("Infantry_42", 15, -1),
  makeUnit("Howitzer_105", 14, -2),
  makeUnit("Flak_88", 15, -3)
];

const twoBridgesScenario = {
  name: "Two Bridges",
  size: { cols: 20, rows: 16 },
  tilePalette: {},
  tiles: [],
  objectives: [
    { hex: [8, 3], owner: "Bot", vp: 120 },
    { hex: [9, 9], owner: "Bot", vp: 120 },
    { hex: [15, 5], owner: "Bot", vp: 150 },
    { hex: [2, 13], owner: "Player", vp: 60 }
  ],
  turnLimit: 20,
  sides: {
    Player: {
      hq: { q: 2, r: 12 },
      general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
      units: twoBridgesPlayerUnits
    },
    Bot: {
      hq: { q: 16, r: -4 },
      general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
      units: twoBridgesBotUnits
    }
  }
} as unknown as ScenarioData;

registerTest("missionRules: two bridges wins when both bridges and bastion are occupied", async ({ When, Then }) => {
  const controller = createMissionRulesController("assault", twoBridgesScenario);
  let status = controller.getStatus();

  await When("friendly forces occupy the two bridges and bastion city", async () => {
    status = controller.onTurnAdvanced({
      turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 8 },
      scenario: twoBridgesScenario,
      occupancy: makeOccupancy([
        ["8,-1", "Player"],
        ["9,5", "Player"],
        ["15,-2", "Player"],
        ["2,12", "Player"]
      ]),
      playerUnits: twoBridgesPlayerUnits,
      botUnits: twoBridgesBotUnits
    });
  });

  await Then("the assault resolves as a player victory with four objective markers", async () => {
    if (status.outcome.state !== "playerVictory") {
      throw new Error(`Expected Two Bridges victory, received ${status.outcome.state}`);
    }
    const primary = status.objectives.find((objective) => objective.id === "primary_secure_crossings");
    if (!primary || primary.state !== "completed") {
      throw new Error("Expected Two Bridges primary objective to complete.");
    }
    if (status.phase?.id !== "phase3_escalation") {
      throw new Error(`Expected bastion-push phase, received ${status.phase?.id ?? "<none>"}`);
    }
    if ((status.markers ?? []).length !== 4) {
      throw new Error(`Expected four Two Bridges objective markers, received ${(status.markers ?? []).length}`);
    }
  });
});

registerTest("missionRules: two bridges fails on timer without all crossings secured", async ({ When, Then }) => {
  const controller = createMissionRulesController("assault", twoBridgesScenario);
  let status = controller.getStatus();

  await When("the assault window closes with one bridge still in enemy hands", async () => {
    status = controller.onTurnAdvanced({
      turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 20 },
      scenario: twoBridgesScenario,
      occupancy: makeOccupancy([
        ["8,-1", "Player"],
        ["9,5", "Bot"],
        ["15,-2", "Player"],
        ["2,12", "Player"]
      ]),
      playerUnits: twoBridgesPlayerUnits,
      botUnits: twoBridgesBotUnits
    });
  });

  await Then("the primary objective fails even though the supply base remains held", async () => {
    if (status.outcome.state !== "playerDefeat") {
      throw new Error(`Expected Two Bridges timer defeat, received ${status.outcome.state}`);
    }
    const primary = status.objectives.find((objective) => objective.id === "primary_secure_crossings");
    if (!primary || primary.state !== "failed") {
      throw new Error("Expected Two Bridges primary objective to fail on timer.");
    }
    const secondary = status.objectives.find((objective) => objective.id === "secondary_hold_supply_base");
    if (!secondary || secondary.state !== "completed") {
      throw new Error("Expected supply-base secondary objective to remain completed at resolution.");
    }
  });
});

registerTest("missionRules: two bridges tracks fire-support neutralization", async ({ When, Then }) => {
  const controller = createMissionRulesController("assault", twoBridgesScenario);
  let status = controller.getStatus();

  await When("enemy artillery and flak have been eliminated but infantry remains", async () => {
    status = controller.onTurnAdvanced({
      turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 6 },
      scenario: twoBridgesScenario,
      occupancy: makeOccupancy([
        ["8,-1", "Player"],
        ["2,12", "Player"]
      ]),
      playerUnits: twoBridgesPlayerUnits,
      botUnits: [makeUnit("Infantry_42", 15, -1)]
    });
  });

  await Then("the tertiary objective is completed while the bridge assault continues", async () => {
    if (status.outcome.state !== "inProgress") {
      throw new Error(`Expected Two Bridges to remain in progress, received ${status.outcome.state}`);
    }
    const tertiary = status.objectives.find((objective) => objective.id === "tertiary_silence_fire_support");
    if (!tertiary || tertiary.state !== "completed") {
      throw new Error("Expected fire-support tertiary objective to complete.");
    }
  });
});

function offsetObjectiveKey(col: number, row: number): string {
  return `${col},${row - Math.floor(col / 2)}`;
}

function makeHistoricalScenario(name: string, objectives: Array<[number, number]>, turnLimit: number): ScenarioData {
  return {
    name,
    size: { cols: 30, rows: 22 },
    tilePalette: {},
    tiles: [],
    objectives: objectives.map((hex, index) => ({
      hex,
      owner: index === 0 && name !== "Omaha Beach" && name !== "Remagen" ? "Player" : "Bot",
      vp: 100
    })),
    turnLimit,
    sides: {
      Player: {
        hq: { q: 0, r: 0 },
        general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
        units: []
      },
      Bot: {
        hq: { q: 20, r: 0 },
        general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
        units: []
      }
    }
  } as unknown as ScenarioData;
}

registerTest("missionRules: historical capture missions complete required objectives", async ({ When, Then }) => {
  const omahaScenario = makeHistoricalScenario("Omaha Beach", [[8, 8], [14, 7], [21, 6], [25, 4]], 20);
  const controller = createMissionRulesController("assault_omaha_beach", omahaScenario);
  let status = controller.getStatus();

  await When("all Omaha exits and ridge controls are friendly-held", async () => {
    status = controller.onTurnAdvanced({
      turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 12 },
      scenario: omahaScenario,
      occupancy: makeOccupancy([
        [offsetObjectiveKey(8, 8), "Player"],
        [offsetObjectiveKey(14, 7), "Player"],
        [offsetObjectiveKey(21, 6), "Player"],
        [offsetObjectiveKey(25, 4), "Player"]
      ]),
      playerUnits: [
        makeUnit("Infantry_42", 1, 0),
        makeUnit("Engineer", 2, 0),
        makeUnit("Light_Tank", 3, 0),
        makeUnit("AT_Gun_50mm", 4, 0)
      ],
      botUnits: [makeUnit("Infantry_42", 20, 0)]
    });
  });

  await Then("the beach assault resolves as a historical capture victory", async () => {
    if (status.outcome.state !== "playerVictory") {
      throw new Error(`Expected Omaha victory, received ${status.outcome.state}`);
    }
    const primary = status.objectives.find((objective) => objective.id === "primary_open_omaha_exits");
    if (primary?.state !== "completed") {
      throw new Error(`Expected Omaha primary objective to complete, received ${primary?.state ?? "<missing>"}`);
    }
    if ((status.markers ?? []).length !== 4) {
      throw new Error(`Expected four Omaha markers, received ${(status.markers ?? []).length}`);
    }
  });
});

registerTest("missionRules: historical hold missions resolve relief and hub loss", async ({ When, Then }) => {
  const bastogneScenario = makeHistoricalScenario("Bastogne", [[13, 10], [18, 13], [12, 5], [10, 17]], 18);
  const kasserineScenario = makeHistoricalScenario("Kasserine Pass", [[2, 9], [9, 6], [10, 13], [22, 9]], 16);
  const bastogneController = createMissionRulesController("assault_bastogne", bastogneScenario);
  const kasserineController = createMissionRulesController("assault_kasserine_pass", kasserineScenario);
  let bastogneStatus = bastogneController.getStatus();
  let kasserineStatus = kasserineController.getStatus();

  await When("Bastogne center falls before relief while Kasserine holds its required pass line", async () => {
    bastogneStatus = bastogneController.onTurnAdvanced({
      turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 7 },
      scenario: bastogneScenario,
      occupancy: makeOccupancy([
        [offsetObjectiveKey(13, 10), "Bot"],
        [offsetObjectiveKey(18, 13), "Player"],
        [offsetObjectiveKey(12, 5), "Player"]
      ]),
      playerUnits: [makeUnit("Infantry_42", 10, 0)],
      botUnits: [makeUnit("Panzer_IV", 20, 0)]
    });

    kasserineStatus = kasserineController.onTurnAdvanced({
      turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 16 },
      scenario: kasserineScenario,
      occupancy: makeOccupancy([
        [offsetObjectiveKey(2, 9), "Player"],
        [offsetObjectiveKey(9, 6), "Player"],
        [offsetObjectiveKey(10, 13), "Bot"]
      ]),
      playerUnits: [
        makeUnit("Infantry_42", 0, 0),
        makeUnit("Engineer", 1, 0),
        makeUnit("AT_Gun_50mm", 2, 0),
        makeUnit("Tank_Destroyer", 3, 0),
        makeUnit("Howitzer_105", 4, 0)
      ],
      botUnits: [makeUnit("Panzer_IV", 20, 0)]
    });
  });

  await Then("the historical hold controller distinguishes center loss from a successful final hold", async () => {
    if (bastogneStatus.outcome.state !== "playerDefeat") {
      throw new Error(`Expected Bastogne center loss defeat, received ${bastogneStatus.outcome.state}`);
    }
    if (kasserineStatus.outcome.state !== "playerVictory") {
      throw new Error(`Expected Kasserine final hold victory, received ${kasserineStatus.outcome.state}`);
    }
  });
});

registerTest("missionRules: second historical batch capture and hold profiles resolve", async ({ When, Then }) => {
  const elAlameinScenario = makeHistoricalScenario("El Alamein", [[10, 9], [15, 12], [21, 5], [24, 13]], 20);
  const anzioScenario = makeHistoricalScenario("Anzio Beachhead", [[7, 15], [12, 12], [21, 6], [16, 9]], 18);
  const elAlameinController = createMissionRulesController("assault_el_alamein", elAlameinScenario);
  const anzioController = createMissionRulesController("assault_anzio_beachhead", anzioScenario);
  let elAlameinStatus = elAlameinController.getStatus();
  let anzioStatus = anzioController.getStatus();

  await When("El Alamein objectives are captured and Anzio holds its port line to the final turn", async () => {
    elAlameinStatus = elAlameinController.onTurnAdvanced({
      turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 12 },
      scenario: elAlameinScenario,
      occupancy: makeOccupancy([
        [offsetObjectiveKey(10, 9), "Player"],
        [offsetObjectiveKey(15, 12), "Player"],
        [offsetObjectiveKey(21, 5), "Player"],
        [offsetObjectiveKey(24, 13), "Player"]
      ]),
      playerUnits: [
        makeUnit("Infantry_42", 0, 0),
        makeUnit("Engineer", 1, 0),
        makeUnit("Light_Tank", 2, 0)
      ],
      botUnits: [makeUnit("Panzer_IV", 20, 0)]
    });

    anzioStatus = anzioController.onTurnAdvanced({
      turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 18 },
      scenario: anzioScenario,
      occupancy: makeOccupancy([
        [offsetObjectiveKey(7, 15), "Player"],
        [offsetObjectiveKey(12, 12), "Player"],
        [offsetObjectiveKey(21, 6), "Bot"],
        [offsetObjectiveKey(16, 9), "Player"]
      ]),
      playerUnits: [
        makeUnit("Infantry_42", 0, 0),
        makeUnit("Engineer", 1, 0),
        makeUnit("AT_Gun_50mm", 2, 0),
        makeUnit("Tank_Destroyer", 3, 0),
        makeUnit("Light_Tank", 4, 0),
        makeUnit("Howitzer_105", 5, 0),
        makeUnit("Recon_Bike", 6, 0)
      ],
      botUnits: [makeUnit("Panzer_IV", 20, 0)]
    });
  });

  await Then("the new capture and hold rules both produce victory", async () => {
    if (elAlameinStatus.outcome.state !== "playerVictory") {
      throw new Error(`Expected El Alamein capture victory, received ${elAlameinStatus.outcome.state}`);
    }
    if (anzioStatus.outcome.state !== "playerVictory") {
      throw new Error(`Expected Anzio final hold victory, received ${anzioStatus.outcome.state}`);
    }
  });
});

registerTest("missionRules: Arnhem bridge loss immediately fails the airborne operation", async ({ When, Then }) => {
  const arnhemScenario = makeHistoricalScenario("Arnhem Bridge", [[15, 9], [7, 7], [6, 3], [21, 13]], 18);
  const controller = createMissionRulesController("assault_arnhem_bridge", arnhemScenario);
  let status = controller.getStatus();

  await When("enemy forces retake Arnhem Bridge before relief arrives", async () => {
    status = controller.onTurnAdvanced({
      turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 6 },
      scenario: arnhemScenario,
      occupancy: makeOccupancy([
        [offsetObjectiveKey(15, 9), "Bot"],
        [offsetObjectiveKey(7, 7), "Player"],
        [offsetObjectiveKey(6, 3), "Player"]
      ]),
      playerUnits: [makeUnit("Paratrooper", 7, 7), makeUnit("Engineer", 8, 7)],
      botUnits: [makeUnit("Panzer_IV", 21, 13)]
    });
  });

  await Then("the bridge hold rule treats bridge loss as mission failure", async () => {
    if (status.outcome.state !== "playerDefeat") {
      throw new Error(`Expected Arnhem bridge-loss defeat, received ${status.outcome.state}`);
    }
  });
});
