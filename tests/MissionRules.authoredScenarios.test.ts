import assert from "node:assert/strict";
import { registerTest } from "./harness.js";
import type { ScenarioData, ScenarioUnit } from "../src/core/types.js";
import type { TurnFaction, TurnSummary } from "../src/game/GameEngine.js";
import { normalizeScenarioSource } from "../src/data/scenarioNormalizer.js";
import { getScenarioByMissionKey } from "../src/data/scenarioRegistry.js";
import {
  createMissionRulesController,
  type MissionPhaseStatus,
  type MissionSnapshot,
  type SerializedMissionRulesState
} from "../src/state/missionRules.js";

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

const citadelMarkerPoints = [
  { hex: { q: 16, r: -4 }, label: "North Battery" },
  { hex: { q: 16, r: 0 }, label: "Central Citadel" },
  { hex: { q: 16, r: 4 }, label: "South Battery" },
  { hex: { q: 20, r: -2 }, label: "Command Ridge" }
] as const;

function citadelSnapshot(
  turnNumber: number,
  occupancy: ReadonlyArray<readonly [string, TurnFaction]> = [],
  overrides: Partial<MissionSnapshot> = {}
): MissionSnapshot {
  return {
    turnSummary: turn(turnNumber),
    scenario: citadelRidgeScenario,
    occupancy: new Map(occupancy),
    playerUnits: [playerAssaultUnits[0]],
    botUnits: [liveBotUnit],
    ...overrides
  };
}

registerTest("CITADEL_INITIAL_STATUS_AND_AUTHORED_COORDINATES", async ({ Then }) => {
  const controller = createMissionRulesController("assault_citadel_ridge", citadelRidgeScenario);
  const status = controller.getStatus();
  const authored = normalizeScenarioSource(structuredClone(getScenarioByMissionKey("assault_citadel_ridge")), {
    turnLimit: 17
  });

  await Then("initial status projects approach and the four real authored points without inventing occupation", async () => {
    assert.equal(status.turn, 0);
    assert.equal(status.outcome.state, "inProgress");
    assert.equal(status.phase?.id, "phase1_probe");
    assert.equal(status.phase?.label, "Phase 1: Approach");
    assert.deepEqual(authored.objectives.map((objective) => objective.hex), citadelMarkerPoints.map((point) => point.hex));
    assert.deepEqual(status.markers, citadelMarkerPoints.map(({ hex, label }) => ({
      hex,
      status: "unoccupied",
      tooltip: `${label} - Unoccupied.`
    })));
    assert.deepEqual(controller.serializeState(), {
      version: 1,
      kind: "citadelRidge",
      data: { outcome: { state: "inProgress" } }
    });
  });
});

const citadelPhaseCases: ReadonlyArray<{
  readonly name: string;
  readonly turnNumber: number;
  readonly occupancy: ReadonlyArray<readonly [string, TurnFaction]>;
  readonly phase: MissionPhaseStatus["id"];
  readonly label: string;
}> = [
  { name: "OPENING", turnNumber: 1, occupancy: [], phase: "phase1_probe", label: "Phase 1: Approach" },
  { name: "BEFORE_BREACH_TURN", turnNumber: 4, occupancy: [], phase: "phase1_probe", label: "Phase 1: Approach" },
  { name: "BREACH_TURN", turnNumber: 5, occupancy: [], phase: "phase2_commitment", label: "Phase 2: Breach" },
  { name: "BEFORE_COUNTERATTACK_TURN", turnNumber: 8, occupancy: [], phase: "phase2_commitment", label: "Phase 2: Breach" },
  { name: "COUNTERATTACK_TURN", turnNumber: 9, occupancy: [], phase: "phase3_escalation", label: "Phase 3: Counterattack Window" },
  { name: "ONE_PLAYER_POINT", turnNumber: 1, occupancy: [["16,-4", "Player"]], phase: "phase2_commitment", label: "Phase 2: Breach" },
  { name: "ONE_ALLY_POINT", turnNumber: 1, occupancy: [["16,4", "Ally"]], phase: "phase2_commitment", label: "Phase 2: Breach" },
  { name: "COMMAND_ALONE", turnNumber: 1, occupancy: [["20,-2", "Player"]], phase: "phase2_commitment", label: "Phase 2: Breach" },
  { name: "TWO_PLAYER_POINTS", turnNumber: 1, occupancy: [["16,-4", "Player"], ["16,0", "Player"]], phase: "phase3_escalation", label: "Phase 3: Counterattack Window" },
  { name: "MIXED_FRIENDLY_POINTS", turnNumber: 1, occupancy: [["16,-4", "Player"], ["16,0", "Ally"]], phase: "phase3_escalation", label: "Phase 3: Counterattack Window" },
  { name: "TWO_ALLY_POINTS", turnNumber: 1, occupancy: [["16,4", "Ally"], ["20,-2", "Ally"]], phase: "phase3_escalation", label: "Phase 3: Counterattack Window" },
  { name: "ENEMY_DOES_NOT_ADVANCE", turnNumber: 1, occupancy: [["16,-4", "Bot"], ["16,0", "Bot"], ["20,-2", "Bot"]], phase: "phase1_probe", label: "Phase 1: Approach" },
  { name: "NON_OBJECTIVE_DOES_NOT_ADVANCE", turnNumber: 1, occupancy: [["0,0", "Player"], ["1,0", "Ally"]], phase: "phase1_probe", label: "Phase 1: Approach" },
  { name: "COUNTERATTACK_PRECEDENCE_OVER_BREACH", turnNumber: 9, occupancy: [["16,-4", "Player"]], phase: "phase3_escalation", label: "Phase 3: Counterattack Window" }
];

for (const phaseCase of citadelPhaseCases) {
  registerTest(`CITADEL_PHASE_BOUNDARY_${phaseCase.name}`, async ({ Then }) => {
    const controller = createMissionRulesController("assault_citadel_ridge", citadelRidgeScenario);
    const snapshot = citadelSnapshot(phaseCase.turnNumber, phaseCase.occupancy);
    const before = structuredClone(snapshot);
    const status = controller.onTurnAdvanced(snapshot);

    await Then("turn and current friendly occupation determine one advisory phase without altering gameplay state", async () => {
      assert.equal(status.phase?.id, phaseCase.phase);
      assert.equal(status.phase?.label, phaseCase.label);
      assert.ok(status.phase?.detail.trim());
      assert.ok(status.phase?.announcement.trim());
      assert.doesNotMatch(`${status.phase?.detail} ${status.phase?.announcement}`,
        /reinforcements? (?:have |has )?(?:arrived|spawned)|counterattack (?:has |is )(?:begun|underway)|defenders (?:have )?launch(?:ed)?/i);
      assert.equal(status.outcome.state, "inProgress");
      assert.deepEqual(snapshot, before);
      assert.deepEqual(controller.onTurnAdvanced(snapshot), status);
      assert.deepEqual(controller.serializeState(), {
        version: 1,
        kind: "citadelRidge",
        data: { outcome: { state: "inProgress" } }
      });
    });
  });
}

for (const faction of ["Player", "Ally", "Bot"] as const) {
  registerTest(`CITADEL_ALL_MARKERS_${faction.toUpperCase()}`, async ({ Then }) => {
    const controller = createMissionRulesController("assault_citadel_ridge", citadelRidgeScenario);
    const occupancy = citadelMarkerPoints.map(({ hex }) => [`${hex.q},${hex.r}`, faction] as const);
    const status = controller.onTurnAdvanced(citadelSnapshot(2, occupancy));

    await Then("all four markers preserve authored order, axial coordinates and the canonical faction meaning", async () => {
      assert.deepEqual(status.markers, citadelMarkerPoints.map(({ hex, label }) => ({
        hex,
        status: faction === "Bot" ? "enemy" : "player",
        tooltip: `${label} - ${faction === "Bot" ? "Enemy-held" : "Friendly-held"}.`
      })));
      assert.equal(status.outcome.state, faction === "Bot" ? "inProgress" : "playerVictory");
      assert.equal(status.objectives[0].state, faction === "Bot" ? "inProgress" : "completed");
      assert.match(status.objectives[0].detail ?? "", faction === "Bot" ? /Captured: 0\/4/ : /Captured: 4\/4/);
    });
  });
}

registerTest("CITADEL_MIXED_OCCUPANCY_MARKERS_AND_OBJECTIVE_AGREE", async ({ Then }) => {
  const controller = createMissionRulesController("assault_citadel_ridge", citadelRidgeScenario);
  const status = controller.onTurnAdvanced(citadelSnapshot(2, [
    ["16,-4", "Player"], ["16,0", "Ally"], ["16,4", "Bot"]
  ]));

  await Then("mixed Player, Ally, Bot and vacant facts appear consistently without claiming command-ridge control", async () => {
    assert.deepEqual(status.markers, [
      { hex: { q: 16, r: -4 }, status: "player", tooltip: "North Battery - Friendly-held." },
      { hex: { q: 16, r: 0 }, status: "player", tooltip: "Central Citadel - Friendly-held." },
      { hex: { q: 16, r: 4 }, status: "enemy", tooltip: "South Battery - Enemy-held." },
      { hex: { q: 20, r: -2 }, status: "unoccupied", tooltip: "Command Ridge - Unoccupied." }
    ]);
    assert.equal(status.phase?.id, "phase3_escalation");
    assert.equal(status.outcome.state, "inProgress");
    assert.match(status.objectives[0].detail ?? "", /Captured: 2\/4 strongpoints \(Command Ridge required\)/);
  });
});

registerTest("CITADEL_VACATING_AND_RECAPTURE_RECOMPUTE_CURRENT_SNAPSHOT", async ({ Then }) => {
  const controller = createMissionRulesController("assault_citadel_ridge", citadelRidgeScenario);
  const both = controller.onTurnAdvanced(citadelSnapshot(2, [["16,-4", "Player"], ["16,0", "Ally"]]));
  const one = controller.onTurnAdvanced(citadelSnapshot(2, [["16,0", "Ally"]]));
  const vacant = controller.onTurnAdvanced(citadelSnapshot(2));
  const enemy = controller.onTurnAdvanced(citadelSnapshot(2, [["16,-4", "Bot"]]));
  const recaptured = controller.onTurnAdvanced(citadelSnapshot(2, [["16,-4", "Ally"]]));
  const laterVacant = controller.onTurnAdvanced(citadelSnapshot(9));

  await Then("advisory phases and markers follow current occupation, with elapsed-turn thresholds still authoritative", async () => {
    assert.deepEqual([both, one, vacant, enemy, recaptured, laterVacant].map((status) => status.phase?.id), [
      "phase3_escalation", "phase2_commitment", "phase1_probe", "phase1_probe", "phase2_commitment", "phase3_escalation"
    ]);
    assert.deepEqual(one.markers?.map((marker) => marker.status), ["unoccupied", "player", "unoccupied", "unoccupied"]);
    assert.deepEqual(vacant.markers?.map((marker) => marker.status), ["unoccupied", "unoccupied", "unoccupied", "unoccupied"]);
    assert.deepEqual(enemy.markers?.map((marker) => marker.status), ["enemy", "unoccupied", "unoccupied", "unoccupied"]);
    assert.deepEqual(recaptured.markers?.map((marker) => marker.status), ["player", "unoccupied", "unoccupied", "unoccupied"]);
    for (const status of [both, one, vacant, enemy, recaptured, laterVacant]) {
      assert.equal(status.outcome.state, "inProgress");
      assert.equal(status.objectives[0].state, "inProgress");
    }
    assert.match(vacant.objectives[0].detail ?? "", /Captured: 0\/4/);
    assert.match(recaptured.objectives[0].detail ?? "", /Captured: 1\/4/);
  });
});

registerTest("CITADEL_ELIMINATION_DOES_NOT_INVENT_CAPTURE_OR_ESCALATION", async ({ Then }) => {
  const controller = createMissionRulesController("assault_citadel_ridge", citadelRidgeScenario);
  const status = controller.onTurnAdvanced(citadelSnapshot(1, [], { botUnits: [] }));

  await Then("enemy elimination completes the mission while vacant points and the early advisory phase stay factual", async () => {
    assert.equal(status.outcome.state, "playerVictory");
    assert.equal(status.objectives[0].state, "completed");
    assert.equal(status.phase?.id, "phase1_probe");
    assert.match(status.objectives[0].detail ?? "", /Captured: 0\/4/);
    assert.deepEqual(status.markers, citadelMarkerPoints.map(({ hex, label }) => ({
      hex,
      status: "unoccupied",
      tooltip: `${label} - Unoccupied.`
    })));
  });
});

registerTest("CITADEL_DEADLINE_AND_FINAL_TURN_CAPTURE_KEEP_EXISTING_OUTCOMES", async ({ Then }) => {
  const losingController = createMissionRulesController("assault_citadel_ridge", citadelRidgeScenario);
  const winningController = createMissionRulesController("assault_citadel_ridge", citadelRidgeScenario);
  const loss = losingController.onTurnAdvanced(citadelSnapshot(17, [["20,-2", "Ally"], ["16,-4", "Player"]]));
  const win = winningController.onTurnAdvanced(citadelSnapshot(17, [
    ["20,-2", "Ally"], ["16,-4", "Player"], ["16,0", "Ally"]
  ]));

  await Then("two total positions fail at the deadline, but command ridge plus two additional positions still win", async () => {
    assert.equal(loss.outcome.state, "playerDefeat");
    assert.equal(loss.objectives[0].state, "failed");
    assert.equal(loss.phase?.id, "phase3_escalation");
    assert.deepEqual(loss.markers?.map((marker) => marker.status), ["player", "unoccupied", "unoccupied", "player"]);
    assert.equal(win.outcome.state, "playerVictory");
    assert.equal(win.objectives[0].state, "completed");
    assert.equal(win.phase?.id, "phase3_escalation");
    assert.deepEqual(win.markers?.map((marker) => marker.status), ["player", "player", "unoccupied", "player"]);
  });
});

registerTest("CITADEL_TERMINAL_OUTCOME_IS_NOT_REOPENED_BY_PHASE_OR_OCCUPANCY", async ({ Then }) => {
  const winningController = createMissionRulesController("assault_citadel_ridge", citadelRidgeScenario);
  const winning = winningController.onTurnAdvanced(citadelSnapshot(1, [], { botUnits: [] }));
  const afterWin = winningController.onTurnAdvanced(citadelSnapshot(17, [["20,-2", "Bot"]], { playerUnits: [] }));
  const losingController = createMissionRulesController("assault_citadel_ridge", citadelRidgeScenario);
  const losing = losingController.onTurnAdvanced(citadelSnapshot(1, [], { playerUnits: [] }));
  const afterLoss = losingController.onTurnAdvanced(citadelSnapshot(2, [
    ["16,-4", "Player"], ["16,0", "Player"], ["20,-2", "Player"]
  ], { botUnits: [] }));

  await Then("terminal state remains canonical while later projections do not fabricate control or revive the mission", async () => {
    assert.deepEqual(afterWin.outcome, winning.outcome);
    assert.equal(afterWin.objectives[0].state, "completed");
    assert.equal(afterWin.markers?.[3].status, "enemy");
    assert.deepEqual(afterLoss.outcome, losing.outcome);
    assert.equal(afterLoss.objectives[0].state, "failed");
    assert.equal(afterLoss.markers?.[3].status, "player");
    assert.equal(winning.phase?.id, "phase1_probe");
    assert.equal(losing.phase?.id, "phase1_probe");
    assert.equal(afterWin.phase?.id, "phase3_escalation");
    assert.equal(afterLoss.phase?.id, "phase3_escalation");
  });
});

for (const restoreCase of [
  { name: "APPROACH", snapshot: citadelSnapshot(2) },
  { name: "TIMED_BREACH", snapshot: citadelSnapshot(5) },
  { name: "EARLY_COUNTERATTACK_WINDOW", snapshot: citadelSnapshot(2, [["16,-4", "Player"], ["16,0", "Ally"]]) },
  { name: "CAPTURE_VICTORY", snapshot: citadelSnapshot(7, [["16,-4", "Player"], ["16,0", "Ally"], ["20,-2", "Player"]]) },
  { name: "ELIMINATION_VICTORY", snapshot: citadelSnapshot(2, [], { botUnits: [] }) },
  { name: "DEADLINE_DEFEAT", snapshot: citadelSnapshot(17) }
]) {
  registerTest(`CITADEL_OUTCOME_ONLY_SAVE_ROUNDTRIP_${restoreCase.name}`, async ({ Then }) => {
    const controller = createMissionRulesController("assault_citadel_ridge", citadelRidgeScenario);
    const status = controller.onTurnAdvanced(restoreCase.snapshot);
    const serialized = controller.serializeState();
    // Parse the serialization produced by this typed controller, just as a persisted JSON save does.
    const roundTrip: SerializedMissionRulesState = JSON.parse(JSON.stringify(serialized));
    const restored = createMissionRulesController("assault_citadel_ridge", citadelRidgeScenario);
    restored.hydrateState(roundTrip);
    const resumed = restored.onTurnAdvanced(restoreCase.snapshot);

    await Then("legacy outcome-only data reconstructs the exact phase and marker projection from the restored engine snapshot", async () => {
      assert.deepEqual(serialized, { version: 1, kind: "citadelRidge", data: { outcome: status.outcome } });
      assert.deepEqual(resumed, status);
      assert.deepEqual(restored.onTurnAdvanced(restoreCase.snapshot), status);
      assert.deepEqual(restored.serializeState(), serialized);
      assert.deepEqual(controller.onTurnAdvanced(restoreCase.snapshot), status);
      assert.deepEqual(controller.serializeState(), serialized);
    });
  });
}

registerTest("CITADEL_LEGACY_TERMINAL_SAVE_WITHOUT_REASON_REDERIVES_PRESENTATION", async ({ Then }) => {
  const controller = createMissionRulesController("assault_citadel_ridge", citadelRidgeScenario);
  const legacy: SerializedMissionRulesState = {
    version: 1,
    kind: "citadelRidge",
    data: { outcome: { state: "playerVictory" } }
  };
  controller.hydrateState(legacy);
  const status = controller.onTurnAdvanced(citadelSnapshot(5, [["16,4", "Ally"]]));

  await Then("older terminal saves remain compatible without saved phase or marker fields", async () => {
    assert.deepEqual(status.outcome, { state: "playerVictory" });
    assert.equal(status.objectives[0].detail, "Captured: 1/4 strongpoints.");
    assert.equal(status.phase?.id, "phase2_commitment");
    assert.deepEqual(status.markers?.map((marker) => marker.status), ["unoccupied", "unoccupied", "player", "unoccupied"]);
    assert.deepEqual(controller.serializeState(), legacy);
  });
});

const pointeAdvisoryPhases: Readonly<Record<"phase1_probe" | "phase2_commitment", MissionPhaseStatus>> = {
  phase1_probe: {
    id: "phase1_probe",
    label: "Phase 1: Assault",
    detail: "The battery line is the assault objective. All three gun positions must be friendly-held to start the six-turn hold clock.",
    announcement: "Pointe du Hoc: assault window open. The hold clock requires all three gun positions."
  },
  phase2_commitment: {
    id: "phase2_commitment",
    label: "Phase 2: Counterattack Window",
    detail: "The counterattack window is open; surviving defenders may contest the battery. All three gun positions must remain friendly-held to keep the six-turn hold clock running.",
    announcement: "Pointe du Hoc: counterattack window reached. Objective control and the hold clock remain decisive."
  }
};

function pointeSnapshot(turnNumber: number, overrides: Partial<MissionSnapshot> = {}): MissionSnapshot {
  const scenario = normalizeScenarioSource(structuredClone(getScenarioByMissionKey("patrol_pointe_du_hoc")), { turnLimit: 20 });
  return {
    scenario,
    turnSummary: turn(turnNumber),
    occupancy: new Map(scenario.sides.Bot.units.map((unit) => [`${unit.hex.q},${unit.hex.r}`, "Bot" as const])),
    playerUnits: structuredClone(playerAssaultUnits),
    botUnits: scenario.sides.Bot.units,
    ...overrides
  };
}

for (const turnNumber of [0, 2, 3, 4]) {
  registerTest(`POINTE_PHASE_TRUTH_STATIONARY_AUTHORED_FORCE_TURN_${turnNumber}`, async ({ Then }) => {
    const snapshot = pointeSnapshot(turnNumber);
    const before = structuredClone(snapshot);
    const controller = createMissionRulesController("patrol_pointe_du_hoc", snapshot.scenario);
    const status = turnNumber === 0 ? controller.getStatus() : controller.onTurnAdvanced(snapshot);

    await Then("the existing turn boundary selects an advisory window without inventing reserve movement or reinforcements", () => {
      assert.deepEqual(status.phase, pointeAdvisoryPhases[turnNumber < 3 ? "phase1_probe" : "phase2_commitment"]);
      assert.equal(status.outcome.state, "inProgress");
      assert.deepEqual(snapshot, before);
      assert.equal(snapshot.botUnits.length, 15);
      assert.equal(controller.serializeState().data.holdStreak, 0);
    });
  });
}

registerTest("POINTE_PHASE_TRUTH_DESTROYED_RESERVE_DOES_NOT_REAPPEAR", async ({ Then }) => {
  const snapshot = pointeSnapshot(3);
  // Only the predeployed battery guns survive; no forest force remains to arrive.
  const guns = snapshot.botUnits.filter((unit) => unit.type === "Howitzer_105" || unit.type === "Flak_88");
  const controller = createMissionRulesController("patrol_pointe_du_hoc", snapshot.scenario);
  const occupancy = new Map(guns.map((unit) => [`${unit.hex.q},${unit.hex.r}`, "Bot" as const]));
  const status = controller.onTurnAdvanced({ ...snapshot, botUnits: guns, occupancy });

  await Then("a clock-based window never reports that destroyed troops emerged or are pressing an attack", () => {
    assert.equal(guns.length, 3);
    assert.equal(status.outcome.state, "inProgress");
    assert.deepEqual(status.phase, pointeAdvisoryPhases.phase2_commitment);
    assert.equal(status.objectives.find((objective) => objective.tier === "secondary")?.state, "inProgress");
    assert.deepEqual(status.markers?.map((marker) => marker.status), ["enemy", "enemy", "enemy"]);
  });
});

registerTest("POINTE_PHASE_TRUTH_ELIMINATION_VICTORY_NEVER_ANNOUNCES_ENEMY_ARRIVAL", async ({ Then }) => {
  const snapshot = pointeSnapshot(3, { botUnits: [], occupancy: new Map() });
  const controller = createMissionRulesController("patrol_pointe_du_hoc", snapshot.scenario);
  const status = controller.onTurnAdvanced(snapshot);
  const serialized = controller.serializeState();
  const later = controller.onTurnAdvanced({ ...snapshot, turnSummary: turn(20) });

  await Then("terminal truth, the frozen hold clock and actual vacant positions remain unchanged", () => {
    assert.deepEqual(status.outcome, { state: "playerVictory", reason: "All German forces eliminated." });
    assert.equal(status.objectives[0].state, "completed");
    assert.deepEqual(status.phase, pointeAdvisoryPhases.phase2_commitment);
    assert.deepEqual(status.markers?.map((marker) => marker.status), ["unoccupied", "unoccupied", "unoccupied"]);
    assert.equal(serialized.data.holdStreak, 0);
    assert.deepEqual(later.outcome, status.outcome);
    assert.deepEqual(later.phase, status.phase);
    assert.deepEqual(controller.serializeState(), serialized);
  });
});

registerTest("POINTE_PHASE_TRUTH_REPEAT_AND_RESTORE_KEEP_ONE_HOLD_CLOCK", async ({ Then }) => {
  const snapshot = pointeSnapshot(1);
  const occupancy = new Map(snapshot.scenario.objectives.map((objective) => [`${objective.hex.q},${objective.hex.r}`, "Player" as const]));
  const controller = createMissionRulesController("patrol_pointe_du_hoc", snapshot.scenario);
  for (const turnNumber of [1, 2]) controller.onTurnAdvanced({ ...snapshot, occupancy, turnSummary: turn(turnNumber) });
  const third = { ...snapshot, occupancy, turnSummary: turn(3) };
  const status = controller.onTurnAdvanced(third);
  const saved = controller.serializeState();
  // The production save is JSON, not an in-memory shared object.
  const roundTrip: SerializedMissionRulesState = JSON.parse(JSON.stringify(saved));
  const restored = createMissionRulesController("patrol_pointe_du_hoc", snapshot.scenario);
  restored.hydrateState(roundTrip);

  await Then("repeat projections and hydration preserve presentation and the existing version-one ledger without another hold tick", () => {
    assert.deepEqual(status.phase, pointeAdvisoryPhases.phase2_commitment);
    assert.deepEqual(controller.onTurnAdvanced(third), status);
    assert.deepEqual(restored.onTurnAdvanced(third), status);
    assert.deepEqual(saved, {
      version: 1,
      kind: "pointeDuHoc",
      data: {
        holdStreak: 3,
        lastCountedTurn: 3,
        outcome: { state: "inProgress" },
        phase: pointeAdvisoryPhases.phase2_commitment,
        counterattackAnnounced: true
      }
    });
    assert.deepEqual(controller.serializeState(), saved);
    assert.deepEqual(restored.serializeState(), saved);
  });
});

for (const phaseId of ["phase1_probe", "phase2_commitment"] as const) {
  registerTest(`POINTE_PHASE_TRUTH_LEGACY_TERMINAL_SAVE_${phaseId.toUpperCase()}`, async ({ Then }) => {
    const snapshot = pointeSnapshot(6, { botUnits: [], occupancy: new Map() });
    const legacyPhase: MissionPhaseStatus = {
      id: phaseId,
      label: phaseId === "phase1_probe" ? "Phase 1: Assault" : "Phase 2: Counterattack",
      detail: "German infantry are pushing from the inland forest toward the battery.",
      announcement: phaseId === "phase1_probe"
        ? "Seize the battery line before reinforcements arrive."
        : "Pointe du Hoc: German counterattack force has emerged from the forest."
    };
    const saved: SerializedMissionRulesState = {
      version: 1,
      kind: "pointeDuHoc",
      data: {
        holdStreak: 2,
        lastCountedTurn: 2,
        outcome: { state: "playerVictory", reason: "All German forces eliminated." },
        phase: legacyPhase,
        counterattackAnnounced: phaseId === "phase2_commitment"
      }
    };
    const original = structuredClone(saved);
    const controller = createMissionRulesController("patrol_pointe_du_hoc", snapshot.scenario);
    controller.hydrateState(saved);
    const status = controller.onTurnAdvanced(snapshot);

    await Then("old terminal saves receive canonical copy without changing their phase identity, outcome or hold ledger", () => {
      assert.deepEqual(controller.getStatus().phase, pointeAdvisoryPhases[phaseId]);
      assert.deepEqual(status.phase, pointeAdvisoryPhases[phaseId]);
      assert.deepEqual(controller.serializeState(), { ...saved, data: { ...saved.data, phase: pointeAdvisoryPhases[phaseId] } });
      assert.deepEqual(saved, original);
      assert.equal(status.outcome.state, "playerVictory");
    });
  });
}

registerTest("POINTE_PHASE_TRUTH_UNKNOWN_SAVED_PHASE_IS_NOT_REINTERPRETED", async ({ Then }) => {
  const snapshot = pointeSnapshot(6);
  const phase: MissionPhaseStatus = {
    id: "phase3_escalation",
    label: "Unrecognized legacy phase",
    detail: "Unrecognized presentation retained for diagnosis.",
    announcement: "Unrecognized presentation retained for diagnosis."
  };
  const saved: SerializedMissionRulesState = {
    version: 1,
    kind: "pointeDuHoc",
    data: { holdStreak: 2, lastCountedTurn: 2, outcome: { state: "playerDefeat" }, phase, counterattackAnnounced: true }
  };
  const controller = createMissionRulesController("patrol_pointe_du_hoc", snapshot.scenario);
  controller.hydrateState(saved);

  await Then("the recognized-copy migration does not silently assign another tactical phase to unknown saved presentation", () => {
    assert.deepEqual(controller.getStatus().phase, phase);
    assert.deepEqual(controller.onTurnAdvanced(snapshot).phase, phase);
    assert.deepEqual(controller.serializeState(), saved);
  });
});
