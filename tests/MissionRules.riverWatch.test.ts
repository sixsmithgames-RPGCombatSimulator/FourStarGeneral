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

registerTest("missionRules: river watch defeat after 4 holds", async ({ Given, When, Then }) => {
  let controller = createMissionRulesController("patrol_river_watch", riverWatchScenario);
  let status = controller.onTurnAdvanced({
    turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 },
    scenario: riverWatchScenario,
    occupancy: new Map<string, TurnFaction>([["6,2", "Bot"]]),
    playerUnits: [],
    botUnits: []
  });

  await Given("Bot holds a ford for consecutive turns", async () => {
    for (let turn = 2; turn <= 4; turn += 1) {
      status = controller.onTurnAdvanced({
        turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: turn },
        scenario: riverWatchScenario,
        occupancy: new Map<string, TurnFaction>([["6,2", "Bot"]]),
        playerUnits: [],
        botUnits: []
      });
    }
  });

  await Then("Outcome is defeat once hold reaches 4 turns", async () => {
    if (status.outcome.state !== "playerDefeat") {
      throw new Error(`Expected defeat after 4 holds, got ${status.outcome.state}`);
    }
    const primary = status.objectives.find((o) => o.id === "primary_deny_fords");
    if (!primary || primary.state !== "failed") {
      throw new Error("Primary objective should be failed on defeat");
    }
  });
});

registerTest("missionRules: river watch victory on time when fords denied", async ({ Given, When, Then }) => {
  const controller = createMissionRulesController("patrol_river_watch", riverWatchScenario);
  let status = controller.onTurnAdvanced({
    turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 },
    scenario: riverWatchScenario,
    occupancy: new Map(),
    playerUnits: [],
    botUnits: []
  });

  await When("Player holds line through turn limit", async () => {
    status = controller.onTurnAdvanced({
      turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: riverWatchScenario.turnLimit ?? 12 },
      scenario: riverWatchScenario,
      occupancy: new Map(),
      playerUnits: [],
      botUnits: []
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
