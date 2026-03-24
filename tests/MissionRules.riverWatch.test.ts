import { registerTest } from "./harness.js";
import type { ScenarioData, ScenarioUnit } from "../src/core/types.js";
import type { TurnSummary, TurnFaction } from "../src/game/GameEngine.js";
import { createMissionRulesController } from "../src/state/missionRules.js";

const riverWatchScenario: ScenarioData = {
  name: "River Crossing Watch",
  size: { cols: 14, rows: 12 },
  tilePalette: {},
  tiles: [],
  objectives: [
    { hex: { q: 6, r: 2 }, owner: "Bot", vp: 50 },
    { hex: { q: 6, r: 4 }, owner: "Bot", vp: 50 },
    { hex: { q: 5, r: 9 }, owner: "Bot", vp: 50 }
  ],
  turnLimit: 12,
  sides: { Player: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] }, Bot: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] } }
};

function makeSnapshot(
  controllerKey: string,
  turnNumber: number,
  occupancyEntries: Array<[string, TurnFaction]>,
  playerUnits: ScenarioUnit[],
  botUnits: ScenarioUnit[]
) {
  const controller = createMissionRulesController(controllerKey, riverWatchScenario);
  const turnSummary: TurnSummary = { phase: "playerTurn", activeFaction: "Player", turnNumber };
  const occupancy = new Map<string, TurnFaction>(occupancyEntries);
  const status = controller.onTurnAdvanced({
    turnSummary,
    scenario: riverWatchScenario,
    occupancy,
    playerUnits,
    botUnits
  });
  return { controller, status };
}

const livePlayerUnit: ScenarioUnit = {
  type: "Infantry_42",
  hex: { q: 0, r: 0 },
  strength: 100,
  experience: 0,
  ammo: 6,
  fuel: 0,
  entrench: 0,
  facing: "NE"
};

const liveBotUnit: ScenarioUnit = {
  type: "Infantry_42",
  hex: { q: 10, r: 10 },
  strength: 100,
  experience: 0,
  ammo: 6,
  fuel: 0,
  entrench: 0,
  facing: "SW"
};

registerTest("missionRules: river watch defeat after 8 holds", async ({ Given, Then }) => {
  const controller = createMissionRulesController("patrol_river_watch", riverWatchScenario);
  let status = controller.onTurnAdvanced({
    turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 },
    scenario: riverWatchScenario,
    occupancy: new Map<string, TurnFaction>([["6,2", "Bot"]]),
    playerUnits: [livePlayerUnit],
    botUnits: [liveBotUnit]
  });

  await Given("Bot holds a ford for eight consecutive turns", async () => {
    for (let turn = 2; turn <= 8; turn += 1) {
      status = controller.onTurnAdvanced({
        turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: turn },
        scenario: riverWatchScenario,
        occupancy: new Map<string, TurnFaction>([["6,2", "Bot"]]),
        playerUnits: [livePlayerUnit],
        botUnits: [liveBotUnit]
      });
    }
  });

  await Then("Outcome is defeat once hold reaches 8 turns", async () => {
    if (status.outcome.state !== "playerDefeat") {
      throw new Error(`Expected defeat after 8 holds, got ${status.outcome.state}`);
    }
    const primary = status.objectives.find((o) => o.id === "primary_deny_fords");
    if (!primary || primary.state !== "failed") {
      throw new Error("Primary objective should be failed on defeat");
    }
  });
});

registerTest("missionRules: river watch victory on time when fords denied", async ({ When, Then }) => {
  const controller = createMissionRulesController("patrol_river_watch", riverWatchScenario);
  let status = controller.onTurnAdvanced({
    turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 },
    scenario: riverWatchScenario,
    occupancy: new Map(),
    playerUnits: [livePlayerUnit],
    botUnits: [liveBotUnit]
  });

  await When("Player holds line through turn limit", async () => {
    status = controller.onTurnAdvanced({
      turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: riverWatchScenario.turnLimit ?? 12 },
      scenario: riverWatchScenario,
      occupancy: new Map(),
      playerUnits: [livePlayerUnit],
      botUnits: [liveBotUnit]
    });
  });

  await Then("Outcome is victory and primary is completed", async () => {
    if (status.outcome.state !== "playerVictory") {
      throw new Error(`Expected victory at turn limit, got ${status.outcome.state}`);
    }
    const primary = status.objectives.find((o) => o.id === "primary_deny_fords");
    if (!primary || primary.state !== "completed") {
      throw new Error("Primary objective should be completed at victory");
    }
  });
});

registerTest("missionRules: secondary and tertiary flags", async ({ Then }) => {
  const playerRecon: ScenarioUnit = { type: "Recon_Bike", hex: { q: 0, r: 0 }, strength: 100, experience: 0, ammo: 0, fuel: 0, entrench: 0, facing: "NE" };

  const { status: withRecon } = makeSnapshot(
    "patrol_river_watch",
    1,
    [],
    [playerRecon],
    [
      { type: "Recon_Bike", hex: { q: 2, r: 2 }, strength: 90, experience: 0, ammo: 0, fuel: 0, entrench: 0, facing: "NW" },
      { type: "Infantry_42", hex: { q: 1, r: 1 }, strength: 90, experience: 0, ammo: 0, fuel: 0, entrench: 0, facing: "NW" }
    ]
  );
  const { status: noRecon } = makeSnapshot("patrol_river_watch", 2, [], [], []);

  await Then("Comms destroyed only when recon squad is gone and recon survival fails without recon", async () => {
    const secondary = withRecon.objectives.find((o) => o.id === "secondary_destroy_comms");
    if (!secondary || secondary.state !== "inProgress") {
      throw new Error("Secondary should be in progress while comms team alive");
    }
    const tertiary = withRecon.objectives.find((o) => o.id === "tertiary_keep_recon");
    if (!tertiary || tertiary.state !== "inProgress") {
      throw new Error("Tertiary should be in progress while recon alive");
    }

    const secondaryDone = noRecon.objectives.find((o) => o.id === "secondary_destroy_comms");
    if (!secondaryDone || secondaryDone.state !== "completed") {
      throw new Error("Secondary should complete when comms team destroyed");
    }
    const tertiaryFail = noRecon.objectives.find((o) => o.id === "tertiary_keep_recon");
    if (!tertiaryFail || tertiaryFail.state !== "failed") {
      throw new Error("Tertiary should fail when no recon remains");
    }
  });
});

registerTest("missionRules: river watch phases escalate on Normal", async ({ Given, When, Then }) => {
  const controller = createMissionRulesController("patrol_river_watch", riverWatchScenario, "Normal");
  let turnFourPhase = "";
  let turnSixPhase = "";

  await Given("River Watch is tracking authored pacing phases on Normal", async () => {
    controller.onTurnAdvanced({
      turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 },
      scenario: riverWatchScenario,
      occupancy: new Map(),
      playerUnits: [],
      botUnits: []
    });
  });

  await When("the battle reaches turn 4 and then holds all three fords for two turns", async () => {
    turnFourPhase = controller.onTurnAdvanced({
      turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 4 },
      scenario: riverWatchScenario,
      occupancy: new Map(),
      playerUnits: [],
      botUnits: []
    }).phase?.id ?? "";

    controller.onTurnAdvanced({
      turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 5 },
      scenario: riverWatchScenario,
      occupancy: new Map<string, TurnFaction>([["6,2", "Player"], ["6,4", "Player"], ["5,9", "Player"]]),
      playerUnits: [],
      botUnits: []
    });

    turnSixPhase = controller.onTurnAdvanced({
      turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 6 },
      scenario: riverWatchScenario,
      occupancy: new Map<string, TurnFaction>([["6,2", "Player"], ["6,4", "Player"], ["5,9", "Player"]]),
      playerUnits: [],
      botUnits: []
    }).phase?.id ?? "";
  });

  await Then("the controller moves from phase 2 commitment into phase 3 escalation", async () => {
    if (turnFourPhase !== "phase2_commitment") {
      throw new Error(`Expected turn 4 to enter phase2_commitment, received ${turnFourPhase}`);
    }
    if (turnSixPhase !== "phase3_escalation") {
      throw new Error(`Expected two blocked turns to enter phase3_escalation, received ${turnSixPhase}`);
    }
  });
});

registerTest("missionRules: river watch Easy suppresses phase 3 escalation", async ({ When, Then }) => {
  const controller = createMissionRulesController("patrol_river_watch", riverWatchScenario, "Easy");
  let phaseId = "";

  await When("all three fords stay blocked for two turns on Easy", async () => {
    controller.onTurnAdvanced({
      turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 5 },
      scenario: riverWatchScenario,
      occupancy: new Map<string, TurnFaction>([["6,2", "Player"], ["6,4", "Player"], ["5,9", "Player"]]),
      playerUnits: [],
      botUnits: []
    });

    phaseId = controller.onTurnAdvanced({
      turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 6 },
      scenario: riverWatchScenario,
      occupancy: new Map<string, TurnFaction>([["6,2", "Player"], ["6,4", "Player"], ["5,9", "Player"]]),
      playerUnits: [],
      botUnits: []
    }).phase?.id ?? "";
  });

  await Then("the mission remains in phase 2 instead of spawning reserve pressure", async () => {
    if (phaseId !== "phase2_commitment") {
      throw new Error(`Expected Easy difficulty to remain in phase2_commitment, received ${phaseId}`);
    }
  });
});
