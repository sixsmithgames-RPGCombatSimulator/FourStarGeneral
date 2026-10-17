import "./domEnvironment.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer";
import { CoordinateSystem } from "../src/rendering/CoordinateSystem";
import type { ScenarioData, ScenarioUnit } from "../src/core/types";
import type { Axial } from "../src/core/Hex";
import { GameEngine, type GameEngineConfig, type TurnSummary } from "../src/game/GameEngine";
import unitTypes from "../src/data/unitSystem/derivedUnitTypes";
import terrain from "../src/data/terrain.json";
import { createScenarioUnitFromTemplate, findTemplateForUnitKey } from "../src/game/adapters";
import { generateCampaignBattleScenario } from "../src/game/campaign/CampaignBattleGenerator";
import { normalizeScenarioSource, type RawScenarioInput } from "../src/data/scenarioNormalizer";
import { createMissionRulesController, type MissionPhaseStatus, type MissionRulesController, type MissionStatus } from "../src/state/missionRules";
import { resetDeploymentState } from "../src/state/DeploymentState";
import type { MissionKey } from "../src/state/UIState";

registerTest("HEXMAP_OBJECTIVE_MARKERS_DO_NOT_BLOCK_HEX_ORDERS", async ({ Given, When, Then }) => {
  const renderer = new HexMapRenderer();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const viewportRoot = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const cell = document.createElementNS("http://www.w3.org/2000/svg", "g");

  await Given("a rendered tactical hex that also carries an objective marker", () => {
    cell.dataset.cx = "120";
    cell.dataset.cy = "96";
    viewportRoot.appendChild(cell);
    svg.appendChild(viewportRoot);
    (renderer as any).svgElement = svg;
    (renderer as any).viewportRoot = viewportRoot;
    (renderer as any).hexElementMap = new Map([["4,5", cell]]);
  });

  await When("the objective marker is mounted above the hex", () => {
    renderer.renderObjectiveMarker("4,5", { status: "unoccupied" });
  });

  await Then("the marker is pointer-transparent so the underlying hex still receives orders", () => {
    const marker = svg.querySelector<SVGGElement>(".objective-marker");
    if (!marker) {
      throw new Error("Expected the tactical objective marker to render.");
    }
    if (marker.getAttribute("pointer-events") !== "none") {
      throw new Error("Objective marker can intercept the underlying hex click.");
    }
  });
});

registerTest("BATTLESCREEN_CAMPAIGN_TACTICAL_ACTION_REFRESHES_OBJECTIVE_CONTROL", async ({ Given, When, Then }) => {
  const screen = Object.create(BattleScreen.prototype) as BattleScreen;
  let evaluationCount = 0;

  await Given("a campaign battle whose unit has just completed a tactical action", () => {
    (screen as any).uiState = { selectedMission: "campaign" };
    (screen as any).evaluateMissionRules = () => {
      evaluationCount += 1;
    };
  });

  await When("the post-action mission presentation is refreshed", () => {
    (screen as any).refreshCampaignMissionStatusAfterTacticalAction();
  });

  await Then("objective control is recalculated immediately", () => {
    if (evaluationCount !== 1) {
      throw new Error(`Expected one immediate campaign mission evaluation, received ${evaluationCount}.`);
    }
  });
});

registerTest("BATTLESCREEN_PATROL_OBJECTIVE_MARKERS_USE_TOWN_STATUS", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let clearCalls = 0;
  const renderedMarkers: Array<{ hexKey: string; tooltip?: string; status?: string }> = [];

  await Given("a patrol mission status with explicit town marker metadata", async () => {
    document.body.innerHTML = "<div id=\"battleScreen\"></div>";

    const fakeRenderer = {
      clearObjectiveMarkers() {
        clearCalls += 1;
      },
      renderObjectiveMarker(hexKey: string, options?: { tooltip?: string; status?: "unoccupied" | "player" | "enemy" }) {
        renderedMarkers.push({
          hexKey,
          tooltip: options?.tooltip,
          status: options?.status
        });
      }
    } as any;

    screen = new BattleScreen(
      {} as any,
      {} as any,
      {} as any,
      fakeRenderer,
      null,
      null,
      null,
      null,
      null,
      null,
      { selectedMission: "patrol" } as any
    );

    (screen as any).scenario = {
      objectives: [{ hex: { q: 14, r: -5 }, owner: "Player", vp: 250 }]
    } as any;
    (screen as any).missionStatus = {
      turn: 3,
      objectives: [
        {
          id: "primary_repel_enemy",
          label: "Repel the enemy assault and keep the town in friendly hands",
          tier: "primary",
          state: "inProgress",
          detail: "Friendly forces are holding the town center."
        }
      ],
      outcome: { state: "inProgress" },
      markers: [
        {
          hex: { q: 14, r: -5 },
          status: "player",
          tooltip: "Town center - Defenders holding."
        }
      ]
    };
  });

  await When("objective markers are refreshed", async () => {
    (screen as any).updateObjectiveMarkers();
  });

  await Then("the renderer uses the town marker metadata instead of ford parsing", async () => {
    if (clearCalls !== 1) {
      throw new Error(`Expected objective markers to clear once, received ${clearCalls}`);
    }
    if (renderedMarkers.length !== 1) {
      throw new Error(`Expected one town objective marker, received ${renderedMarkers.length}`);
    }
    if (renderedMarkers[0]?.hexKey !== "14,2") {
      throw new Error(`Expected town objective marker at offset 14,2, received ${renderedMarkers[0]?.hexKey}`);
    }
    if (!renderedMarkers[0]?.tooltip?.includes("Town")) {
      throw new Error(`Expected town marker tooltip, received ${renderedMarkers[0]?.tooltip ?? "<empty>"}`);
    }
    if (renderedMarkers[0]?.tooltip?.includes("Ford")) {
      throw new Error(`Expected town marker tooltip to avoid ford text, received ${renderedMarkers[0]?.tooltip}`);
    }
  });
});

/** Read-only engine surface consumed by the real mission presentation path. */
type MissionPresentationEngine = Pick<GameEngine, "getTurnSummary" | "playerUnits" | "botUnits" | "allyUnits">;

/** Exposes only the real Screen evaluation/render seam; no mission result or engine action is stubbed. */
interface ObjectiveScreenProbe {
  element: HTMLElement;
  uiState?: { selectedMission: MissionKey };
  scenario: ScenarioData;
  currentObjectiveIndex: number;
  missionRulesController: MissionRulesController;
  missionStatus: MissionStatus | null;
  lastMissionPhaseId: MissionPhaseStatus["id"] | null;
  missionEndPrompted: boolean;
  hexMapRenderer: HexMapRenderer;
  battleState: {
    hasEngine(): boolean;
    ensureGameEngine(): MissionPresentationEngine;
    getPrecombatMissionInfo(): null;
    emitBattleUpdate(reason: string): void;
  };
  cacheElements(): void;
  calculateMissionStatusFromEngine(): MissionStatus | null;
  evaluateMissionRules(): void;
  refreshCampaignMissionStatusAfterTacticalAction(): void;
  announceBattleUpdate(message: string): void;
  renderMissionStatus(): void;
  updateObjectiveMarkers(): void;
  disposeMissionEndModal(): void;
}

function objectiveUnit(id: string, hex: Axial): ScenarioUnit {
  const template = findTemplateForUnitKey("infantry");
  assert.ok(template);
  return { ...createScenarioUnitFromTemplate(template, hex), unitId: id, preDeployed: true };
}

/** Keep the generated map, objectives and role; place a small deterministic detachment beside its four points. */
function objectiveFixture(recapture = false): { scenario: ScenarioData; config: GameEngineConfig; engine: GameEngine; starts: Axial[] } {
  const generated = generateCampaignBattleScenario({
    engagementId: "eng_objective_progress", battleHexKey: "31,22", attacker: "Bot", defender: "Player",
    missionType: "depotRaid", amphibious: false, coastal: false,
    availableForces: [{ hexKey: "31,22", unitType: "Infantry_42", count: 4 }], allocationCaps: {},
    enemyForces: [{ hexKey: "31,22", unitType: "Infantry_42", count: 1 }],
    airSorties: 0, rpReserve: 0, playerForceValue: 400, enemyForceValue: 100, forceRatio: 4,
    templateKey: "depot_bastogne", frontKey: null, objectiveKey: null
  });
  const scenario = normalizeScenarioSource(generated as unknown as RawScenarioInput, { turnLimit: 0 });
  assert.equal(scenario.objectives.length, 4);
  assert.ok(scenario.objectives.every((entry) => entry.owner === "Player"));
  const starts = scenario.objectives.map(({ hex }) => ({ q: hex.q + 1, r: hex.r }));
  const first = scenario.objectives[0].hex;
  const botOrigin = recapture ? { q: first.q - 1, r: first.r } : { q: 0, r: 0 };
  if (recapture) {
    // This tests recapture presentation, not a hidden-target pursuit. The generated
    // city blocks infantry spotting across the point; provide one real clear lane.
    const originOffset = CoordinateSystem.axialToOffset(botOrigin.q, botOrigin.r);
    const pointOffset = CoordinateSystem.axialToOffset(first.q, first.r);
    scenario.tiles[pointOffset.row][pointOffset.col] = structuredClone(scenario.tiles[originOffset.row][originOffset.col]);
  }
  scenario.sides.Player.units = starts.map((hex, index) => objectiveUnit(`defender-${index}`, hex));
  scenario.sides.Bot.units = [objectiveUnit("attacker-0", botOrigin)];
  delete scenario.sides.Ally;
  const config: GameEngineConfig = {
    scenario, unitTypes, terrain, playerSide: scenario.sides.Player, botSide: scenario.sides.Bot,
    initialSupportAssets: [], botStrategyMode: "Simple"
  };
  const engine = new GameEngine(config);
  engine.populateReservesFromPlayerUnits();
  engine.setBaseCamp(scenario.sides.Player.hq);
  engine.finalizeDeployment();
  engine.startPlayerTurnPhase();
  return { scenario, config, engine, starts };
}

/** Mount shipped markup inertly, including the actual progress node, without loading page scripts/assets. */
function mountObjectiveScreen(scenario: ScenarioData, readEngine: () => MissionPresentationEngine, controller = createMissionRulesController("campaign", scenario)): {
  screen: ObjectiveScreenProbe; card: HTMLButtonElement; progress: HTMLElement; svg: SVGSVGElement;
} {
  const markup = document.createElement("template");
  markup.innerHTML = readFileSync("index.html", "utf8");
  const card = markup.content.querySelector<HTMLButtonElement>("#battleCycleObjective");
  assert.ok(card, "The shipped objective card must exist.");
  const progress = card.querySelector<HTMLElement>("#battleObjectiveProgress");
  assert.ok(progress, "The real shipped card must expose progress, not a test-only mission panel.");
  assert.ok(progress.classList.contains("hidden"), "Progress must start hidden before controller metadata arrives.");
  const root = document.createElement("div");
  root.appendChild(card);
  const announcement = markup.content.querySelector<HTMLElement>("#battleAnnouncements");
  assert.ok(announcement, "The shipped battle live region must exist.");
  root.appendChild(announcement);
  document.body.replaceChildren(root);
  assert.equal(root.querySelector("#battleMissionObjectives"), null);

  const renderer = new HexMapRenderer();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const viewport = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.appendChild(viewport);
  root.appendChild(svg);
  const cells = new Map<string, SVGGElement>();
  scenario.objectives.forEach(({ hex }, index) => {
    const offset = CoordinateSystem.axialToOffset(hex.q, hex.r);
    const cell = document.createElementNS("http://www.w3.org/2000/svg", "g");
    cell.dataset.cx = String(60 + index * 90);
    cell.dataset.cy = "60";
    viewport.appendChild(cell);
    cells.set(CoordinateSystem.makeHexKey(offset.col, offset.row), cell);
  });
  // The renderer retains its real SVG marker/tooltip implementation; only layout geometry is supplied.
  Object.assign(renderer, { svgElement: svg, viewportRoot: viewport, hexElementMap: cells });
  const screen = Object.create(BattleScreen.prototype) as ObjectiveScreenProbe;
  Object.assign(screen, {
    element: root, scenario, currentObjectiveIndex: 0, missionRulesController: controller,
    missionStatus: null, lastMissionPhaseId: null, missionEndPrompted: false, hexMapRenderer: renderer,
    battleState: {
      hasEngine: () => true, ensureGameEngine: readEngine, getPrecombatMissionInfo: () => null,
      emitBattleUpdate: (reason: string) => assert.equal(reason, "missionUpdated")
    }
  });
  screen.cacheElements();
  return { screen, card, progress, svg };
}

function assertObjectiveProgress(view: ReturnType<typeof mountObjectiveScreen>, secured: number, controlled: number, state: string): void {
  const summary = `Secured ${secured}/4 · Friendly control ${controlled}/4. Move a friendly formation onto each point and retain control.`;
  assert.equal(view.card.querySelector("#battleObjectiveStatus")?.textContent, state);
  assert.equal(view.progress.classList.contains("hidden"), false, "Progress must render before the absent legacy objective-list guard.");
  assert.equal(view.progress.textContent, summary);
  assert.ok(view.card.getAttribute("aria-label")?.includes(state));
  assert.ok(view.card.getAttribute("aria-label")?.includes(summary));
  assert.ok(view.card.title.includes(summary));
}

registerTest("FSG_CAM_099_DEFENDER_OBJECTIVE_HEADER_USES_REAL_VISITS_AND_SURVIVES_SAVE", async ({ Given, When, Then }) => {
  resetDeploymentState();
  try {
    const fixture = objectiveFixture();
    let engine = fixture.engine;
    const view = mountObjectiveScreen(fixture.scenario, () => engine);
    const evaluate = (): void => view.screen.evaluateMissionRules();
    await Given("the shipped card and four authored friendly points that no actual formation has visited", () => {
      evaluate();
      assert.equal(view.screen.missionStatus?.outcome.state, "inProgress");
      assertObjectiveProgress(view, 0, 4, "Friendly-held; needs securing");
      const tooltips = [...view.svg.querySelectorAll(".objective-marker title")].map((entry) => entry.textContent);
      assert.equal(tooltips.length, 4);
      assert.ok(tooltips.every((entry) => entry?.includes("friendly-held; needs securing")));
    });
    await When("two ordinary end-turns pass without visiting any point", () => {
      engine.endTurn(); evaluate();
      engine.endTurn(); evaluate();
      assert.equal(engine.getTurnSummary().turnNumber, 3);
      assertObjectiveProgress(view, 0, 4, "Friendly-held; needs securing");
      assert.equal(view.screen.missionStatus?.outcome.state, "inProgress");
    });
    await When("an exact formation physically visits the first point then leaves it after the next turn", () => {
      engine.moveUnit(fixture.starts[0], fixture.scenario.objectives[0].hex, "defender-0"); evaluate();
      assertObjectiveProgress(view, 1, 4, "Secured");
      assert.match(view.svg.querySelector(".objective-marker title")?.textContent ?? "", /friendly-held; secured/);
      engine.endTurn(); evaluate();
      engine.moveUnit(fixture.scenario.objectives[0].hex, fixture.starts[0], "defender-0"); evaluate();
      assertObjectiveProgress(view, 1, 4, "Secured");
      assert.ok(engine.playerUnits.every((unit) => JSON.stringify(unit.hex) !== JSON.stringify(fixture.scenario.objectives[0].hex)));
    });
    await When("engine and controller are JSON-restored from the same real boundary", () => {
      const engineSave = JSON.parse(JSON.stringify(engine.serialize()));
      const ruleSave = JSON.parse(JSON.stringify(view.screen.missionRulesController.serializeState()));
      engine = GameEngine.fromSerialized(fixture.config, engineSave);
      const restored = createMissionRulesController("campaign", fixture.scenario);
      restored.hydrateState(ruleSave);
      view.screen.missionRulesController = restored;
      evaluate();
      assertObjectiveProgress(view, 1, 4, "Secured");
      const before = engine.serialize();
      const rulesBefore = restored.serializeState();
      view.screen.renderMissionStatus(); view.screen.updateObjectiveMarkers();
      view.screen.renderMissionStatus(); view.screen.updateObjectiveMarkers();
      assert.deepEqual(engine.serialize(), before, "Presentation must not mutate the restored engine.");
      assert.deepEqual(restored.serializeState(), rulesBefore, "Presentation must not write visit/control history.");
    });
    await Then("the remaining physical visits resolve the primary naturally while enemy combat formations remain", () => {
      for (let index = 1; index < 4; index += 1) {
        view.screen.currentObjectiveIndex = index;
        engine.moveUnit(fixture.starts[index], fixture.scenario.objectives[index].hex, `defender-${index}`); evaluate();
        assertObjectiveProgress(view, index + 1, 4, "Secured");
        assert.equal(view.screen.missionStatus?.outcome.state, index === 3 ? "playerVictory" : "inProgress");
      }
      assert.equal(view.screen.missionStatus?.objectives[0].state, "completed");
      assert.equal(view.screen.missionStatus?.objectives[1].state, "inProgress");
      assert.ok(engine.botUnits.some((unit) => unit.unitId === "attacker-0" && unit.strength > 0));
      assert.equal(view.screen.element.querySelectorAll(".mission-end-modal").length, 1);
      assert.match(view.screen.element.querySelector(".mission-end-modal")?.textContent ?? "", /Mission Complete/);
      view.screen.disposeMissionEndModal();
    });
  } finally {
    resetDeploymentState();
    document.body.replaceChildren();
  }
});

registerTest("FSG_CAM_099_DEFENDER_OBJECTIVE_RECAPTURE_RETAINS_VISIT_BUT_REQUIRES_CONTROL", async ({ Given, When, Then }) => {
  resetDeploymentState();
  try {
    const { scenario, engine, starts } = objectiveFixture(true);
    const view = mountObjectiveScreen(scenario, () => engine);
    await Given("a defender visits then vacates the point ahead of an opposing infantry formation", () => {
      engine.moveUnit(starts[0], scenario.objectives[0].hex, "defender-0");
      view.screen.evaluateMissionRules();
      assertObjectiveProgress(view, 1, 4, "Secured");
      engine.moveUnit(scenario.objectives[0].hex, starts[0], "defender-0");
      view.screen.evaluateMissionRules();
    });
    await When("the real enemy turn moves onto the vacated objective", () => {
      assert.equal(engine["checkTargetSpotted"](starts[0], "Bot"), true,
        "The recapture fixture must expose a real visible target, not rely on hidden knowledge.");
      engine.endTurn();
      assert.ok(engine.botUnits.some((unit) => unit.hex.q === scenario.objectives[0].hex.q && unit.hex.r === scenario.objectives[0].hex.r), "The real bot must occupy the objective, not a fabricated occupancy map.");
      view.screen.evaluateMissionRules();
    });
    await Then("the card and SVG retain the secured visit but report enemy control and the required recapture", () => {
      assertObjectiveProgress(view, 1, 3, "Enemy-held; recapture required");
      assert.equal(view.screen.missionStatus?.outcome.state, "inProgress");
      assert.match(view.svg.querySelector(".objective-marker title")?.textContent ?? "", /opposing-held; recapture required/);
      assert.deepEqual(view.screen.missionRulesController.serializeState().data["securedFriendlyObjectives"], [`${scenario.objectives[0].hex.q},${scenario.objectives[0].hex.r}`]);
      for (let index = 1; index < 4; index += 1) {
        engine.moveUnit(starts[index], scenario.objectives[index].hex, `defender-${index}`);
        view.screen.evaluateMissionRules();
      }
      assertObjectiveProgress(view, 4, 3, "Enemy-held; recapture required");
      assert.equal(view.screen.missionStatus?.outcome.state, "inProgress", "All visits cannot win while the enemy retains a point.");
      const restored = createMissionRulesController("campaign", scenario);
      restored.hydrateState(JSON.parse(JSON.stringify(view.screen.missionRulesController.serializeState())));
      view.screen.missionRulesController = restored;
      view.screen.evaluateMissionRules();
      assertObjectiveProgress(view, 4, 3, "Enemy-held; recapture required");
      assert.equal(view.screen.missionStatus?.outcome.state, "inProgress");
    });
  } finally {
    resetDeploymentState();
    document.body.replaceChildren();
  }
});

registerTest("FSG_CAM_099_DEFENDER_PROGRESS_DOES_NOT_LEAK_INTO_ATTACKER_OR_STANDALONE", () => {
  resetDeploymentState();
  try {
    const { scenario, engine } = objectiveFixture();
    const view = mountObjectiveScreen(scenario, () => engine);
    view.screen.evaluateMissionRules();
    assertObjectiveProgress(view, 0, 4, "Friendly-held; needs securing");
    const attacker: ScenarioData = { ...scenario, campaignPlayerRole: "attacker" };
    for (const [missionKey, source] of [["campaign", attacker], ["unknown_standalone", scenario]] as const) {
      const controller = createMissionRulesController(missionKey, source);
      const status = controller.getStatus();
      assert.ok((status.markers ?? []).every((marker) => !("secured" in marker)));
      view.screen.missionRulesController = controller;
      view.screen.missionStatus = status;
      view.screen.renderMissionStatus();
      assert.equal(view.progress.classList.contains("hidden"), true);
      assert.equal(view.progress.textContent, "");
      assert.ok(!view.card.getAttribute("aria-label")?.includes("Move a friendly formation"));
      if (missionKey === "campaign") assert.equal(view.card.querySelector("#battleObjectiveStatus")?.textContent, "Secured");
    }
  } finally {
    resetDeploymentState();
    document.body.replaceChildren();
  }
});

/** Supplies observed unit/turn snapshots, not game orders; the controller and Screen consumers remain real. */
function citadelPresentationFixture(): {
  scenario: ScenarioData;
  engine: MissionPresentationEngine;
  setSnapshot(turn: number, playerPoints: number[], enemyPoints: number[], allyPoints?: number[]): void;
} {
  const scenario = normalizeScenarioSource(
    JSON.parse(readFileSync("src/data/scenario_citadel_ridge.json", "utf8")) as RawScenarioInput,
    { turnLimit: 17 }
  );
  assert.deepEqual(scenario.objectives.map(({ hex }) => CoordinateSystem.axialToOffset(hex.q, hex.r)), [
    { col: 16, row: 4 }, { col: 16, row: 8 }, { col: 16, row: 12 }, { col: 20, row: 8 }
  ], "Use the authored Citadel strongpoints, including their negative axial rows.");
  let summary: TurnSummary = { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 };
  let playerUnits: ScenarioUnit[] = [];
  let botUnits: ScenarioUnit[] = [];
  let allyUnits: ScenarioUnit[] = [];
  const engine: MissionPresentationEngine = {
    getTurnSummary: () => summary,
    get playerUnits() { return playerUnits; },
    get botUnits() { return botUnits; },
    get allyUnits() { return allyUnits; }
  };
  return {
    scenario,
    engine,
    setSnapshot(turnNumber, playerPoints, enemyPoints, allyPoints = []) {
      summary = { phase: "playerTurn", activeFaction: "Player", turnNumber };
      playerUnits = [objectiveUnit("citadel-player-reserve", { q: 0, r: 0 }),
        ...playerPoints.map((index) => objectiveUnit(`citadel-player-${index}`, scenario.objectives[index].hex))];
      botUnits = [objectiveUnit("citadel-enemy-reserve", { q: 23, r: 5 }),
        ...enemyPoints.map((index) => objectiveUnit(`citadel-enemy-${index}`, scenario.objectives[index].hex))];
      allyUnits = allyPoints.map((index) => objectiveUnit(`citadel-ally-${index}`, scenario.objectives[index].hex));
    }
  };
}

/** Assert the real card and SVG consume one canonical marker state, without a second occupancy model. */
function assertCitadelPresentation(
  view: ReturnType<typeof mountObjectiveScreen>,
  expected: ReadonlyArray<{ status: "player" | "enemy" | "unoccupied"; tooltip: string }>
): void {
  const markers = [...view.svg.querySelectorAll<SVGGElement>(".objective-marker")];
  assert.equal(markers.length, 4, "All four markers must map from axial keys to their actual offset cells.");
  assert.equal(view.progress.classList.contains("hidden"), true, "Campaign defender visit history must not leak into Citadel.");
  expected.forEach(({ status, tooltip }, index) => {
    const marker = markers[index];
    const ring = marker.querySelector<SVGCircleElement>('circle[r="8"]');
    assert.ok(ring);
    assert.equal(ring.getAttribute("cx"), String(60 + index * 90), "Marker must stay on its canonical objective cell.");
    assert.equal(ring.getAttribute("cy"), "54");
    assert.equal(marker.getAttribute("pointer-events"), "none", "Objective graphics must not consume map orders.");
    assert.equal(marker.querySelector("title")?.textContent, tooltip);
    assert.equal(ring.getAttribute("stroke"), status === "player" ? "#22c55e" : status === "enemy" ? "#ef4444" : "#f5c46d");
    assert.equal(marker.classList.contains(status === "player"
      ? "objective-marker--secured" : status === "enemy" ? "objective-marker--enemy" : "objective-marker--neutral"), true);
    view.screen.currentObjectiveIndex = index;
    view.screen.renderMissionStatus();
    const cardStatus = status === "player" ? "Secured" : status === "enemy" ? "Enemy Held" : "In Progress";
    assert.equal(view.card.querySelector("#battleObjectiveStatus")?.textContent, cardStatus);
    assert.equal(view.card.querySelector("#battleObjectiveStatus")?.getAttribute("data-state"), status === "player" ? "completed" : "inProgress");
    assert.equal(view.card.querySelector("#battleObjectiveIndex")?.textContent, `Tactical Objective ${index + 1} of 4`);
    assert.ok(view.card.getAttribute("aria-label")?.includes(`Status: ${cardStatus}.`));
    assert.ok(view.card.title.includes(`Status: ${cardStatus}.`));
  });
}

registerTest("BATTLESCREEN_CITADEL_CARD_AND_REAL_SVG_SHARE_CANONICAL_OCCUPANCY", async ({ Given, When, Then }) => {
  try {
    const fixture = citadelPresentationFixture();
    fixture.setSnapshot(3, [0], [1], [2]);
    const controller = createMissionRulesController("assault_citadel_ridge", fixture.scenario);
    const view = mountObjectiveScreen(fixture.scenario, () => fixture.engine, controller);
    await Given("authored Citadel coordinates with Player, Bot, Ally and vacant points", () => {
      view.screen.evaluateMissionRules();
      assert.equal(view.screen.missionStatus?.outcome.state, "inProgress");
    });
    await Then("the shipped compact card and actual renderer agree for all four objective states", () => {
      assertCitadelPresentation(view, [
        { status: "player", tooltip: "North Battery - Friendly-held." },
        { status: "enemy", tooltip: "Central Citadel - Enemy-held." },
        { status: "player", tooltip: "South Battery - Friendly-held." },
        { status: "unoccupied", tooltip: "Command Ridge - Unoccupied." }
      ]);
    });
    await When("the north point is recaptured and the southern ally vacates before the next evaluation", () => {
      fixture.setSnapshot(4, [], [0, 1]);
      view.screen.evaluateMissionRules();
    });
    await Then("both consumers replace stale ownership without accumulating duplicate markers or campaign history", () => {
      assertCitadelPresentation(view, [
        { status: "enemy", tooltip: "North Battery - Enemy-held." },
        { status: "enemy", tooltip: "Central Citadel - Enemy-held." },
        { status: "unoccupied", tooltip: "South Battery - Unoccupied." },
        { status: "unoccupied", tooltip: "Command Ridge - Unoccupied." }
      ]);
      const before = structuredClone(view.screen.missionStatus);
      const serialized = controller.serializeState();
      view.screen.evaluateMissionRules();
      view.screen.renderMissionStatus();
      view.screen.updateObjectiveMarkers();
      assert.deepEqual(view.screen.missionStatus, before);
      assert.deepEqual(controller.serializeState(), serialized, "Rendering must not create a marker/phase authority.");
      assert.equal(view.svg.querySelectorAll(".objective-marker").length, 4);
    });
  } finally {
    document.body.replaceChildren();
  }
});

registerTest("BATTLESCREEN_POINTE_PHASE_CHANGE_ANNOUNCES_ADVICE_NOT_AN_INVENTED_ARRIVAL", async ({ Given, When, Then }) => {
  try {
    const scenario = normalizeScenarioSource(
      JSON.parse(readFileSync("src/data/scenario_pointe_du_hoc.json", "utf8")) as RawScenarioInput,
      { turnLimit: 20 }
    );
    let turnNumber = 2;
    const playerUnits = [objectiveUnit("pointe-assault-fixture", { q: 0, r: 0 })];
    const botUnits = structuredClone(scenario.sides.Bot.units);
    const before = JSON.stringify(botUnits);
    const engine: MissionPresentationEngine = {
      getTurnSummary: () => ({ phase: "playerTurn", activeFaction: "Player", turnNumber }),
      playerUnits, botUnits, allyUnits: []
    };
    const controller = createMissionRulesController("patrol_pointe_du_hoc", scenario);
    const view = mountObjectiveScreen(scenario, () => engine, controller);
    const announcements: string[] = [];
    const announce = view.screen.announceBattleUpdate.bind(view.screen);
    view.screen.announceBattleUpdate = message => { announcements.push(message); announce(message); };
    await Given("a real Pointe controller with its entire authored enemy force still at opening positions", () => {
      view.screen.missionStatus = controller.getStatus();
      view.screen.lastMissionPhaseId = view.screen.missionStatus.phase?.id ?? null;
      view.screen.evaluateMissionRules();
      assert.equal(view.screen.missionStatus?.phase?.id, "phase1_probe");
      assert.deepEqual(announcements, []);
    });
    await When("the ordinary status consumer sees turn three without any enemy movement", () => {
      turnNumber = 3;
      view.screen.evaluateMissionRules();
      assert.equal(view.screen.missionStatus?.phase?.id, "phase2_commitment");
      assert.equal(view.screen.missionStatus?.phase?.label, "Phase 2: Counterattack Window");
      assert.deepEqual(announcements, [view.screen.missionStatus?.phase?.announcement]);
      assert.doesNotMatch(announcements[0], /has emerged|is pressing|reinforcements arrive/i);
      assert.equal(view.screen.element.querySelector("#battleAnnouncements")?.textContent, announcements[0]);
      assert.equal(view.screen.element.querySelector("#battleAnnouncements")?.getAttribute("aria-live"), "polite");
    });
    await Then("repeated evaluation leaves the advisory, enemy units and announcement count unchanged", () => {
      const status = structuredClone(view.screen.missionStatus);
      const saved = controller.serializeState();
      view.screen.evaluateMissionRules();
      view.screen.evaluateMissionRules();
      assert.deepEqual(view.screen.missionStatus, status);
      assert.deepEqual(controller.serializeState(), saved);
      assert.equal(announcements.length, 1);
      assert.equal(JSON.stringify(botUnits), before);
      assert.equal(view.svg.querySelectorAll(".objective-marker").length, scenario.objectives.length);
    });
  } finally {
    document.body.replaceChildren();
  }
});

registerTest("BATTLESCREEN_CITADEL_PHASE_ANNOUNCEMENTS_DEDUPE_AND_RESUME_FROM_CANONICAL_STATUS", async ({ Given, When, Then }) => {
  try {
    const fixture = citadelPresentationFixture();
    fixture.setSnapshot(1, [], []);
    const controller = createMissionRulesController("assault_citadel_ridge", fixture.scenario);
    const view = mountObjectiveScreen(fixture.scenario, () => fixture.engine, controller);
    const announcements: string[] = [];
    const announce = view.screen.announceBattleUpdate.bind(view.screen);
    view.screen.announceBattleUpdate = (message) => { announcements.push(message); announce(message); };
    await Given("a normally initialized Citadel controller and the shipped polite live region", () => {
      view.screen.missionStatus = controller.getStatus();
      view.screen.lastMissionPhaseId = view.screen.missionStatus.phase?.id ?? null;
      view.screen.evaluateMissionRules();
      assert.equal(view.screen.missionStatus?.phase?.id, "phase1_probe");
      assert.deepEqual(announcements, [], "An unchanged opening phase is not a new transition.");
    });
    await When("turn five begins and one then two strongpoints are observed friendly-held", () => {
      fixture.setSnapshot(5, [], []);
      view.screen.evaluateMissionRules();
      const secondPhase = view.screen.missionStatus?.phase;
      assert.equal(secondPhase?.id, "phase2_commitment");
      assert.deepEqual(announcements, [secondPhase?.announcement]);
      view.screen.evaluateMissionRules();
      fixture.setSnapshot(5, [0], []);
      view.screen.evaluateMissionRules();
      assert.equal(announcements.length, 1, "Repeated reads and changed detail within a phase must not reannounce it.");
      fixture.setSnapshot(5, [0, 1], []);
      view.screen.evaluateMissionRules();
      const thirdPhase = view.screen.missionStatus?.phase;
      assert.equal(thirdPhase?.id, "phase3_escalation");
      assert.deepEqual(announcements, [secondPhase?.announcement, thirdPhase?.announcement]);
      assert.equal(view.screen.element.querySelector("#battleAnnouncements")?.textContent, thirdPhase?.announcement);
      assert.equal(view.screen.element.querySelector("#battleAnnouncements")?.getAttribute("aria-live"), "polite");
      view.screen.evaluateMissionRules();
      assert.equal(announcements.length, 2);
    });
    await Then("the existing resume ordering derives phase from the restored snapshot without replaying a transition", () => {
      const before = structuredClone(view.screen.missionStatus);
      const saved = JSON.parse(JSON.stringify(controller.serializeState()));
      const restored = createMissionRulesController("assault_citadel_ridge", fixture.scenario);
      restored.hydrateState(saved);
      const resumed = mountObjectiveScreen(fixture.scenario, () => fixture.engine, restored);
      // Mirror the production resume ordering: hydrate, recompute from engine, adopt phase ID, then render.
      resumed.screen.missionStatus = resumed.screen.calculateMissionStatusFromEngine();
      resumed.screen.lastMissionPhaseId = resumed.screen.missionStatus?.phase?.id ?? null;
      assert.deepEqual(resumed.screen.missionStatus, before);
      const resumedAnnouncements: string[] = [];
      const resumedAnnounce = resumed.screen.announceBattleUpdate.bind(resumed.screen);
      resumed.screen.announceBattleUpdate = (message) => { resumedAnnouncements.push(message); resumedAnnounce(message); };
      resumed.screen.renderMissionStatus();
      resumed.screen.updateObjectiveMarkers();
      resumed.screen.evaluateMissionRules();
      assert.deepEqual(resumedAnnouncements, []);
      assert.deepEqual(restored.serializeState(), saved);
      assert.deepEqual(resumed.screen.missionStatus, before);
      assertCitadelPresentation(resumed, [
        { status: "player", tooltip: "North Battery - Friendly-held." },
        { status: "player", tooltip: "Central Citadel - Friendly-held." },
        { status: "unoccupied", tooltip: "South Battery - Unoccupied." },
        { status: "unoccupied", tooltip: "Command Ridge - Unoccupied." }
      ]);
    });
  } finally {
    document.body.replaceChildren();
  }
});

registerTest("BATTLESCREEN_CITADEL_ACCEPTED_ACTION_HOOK_REFRESHES_REAL_MISSION_PRESENTATION", async ({ Given, When, Then }) => {
  try {
    const fixture = citadelPresentationFixture();
    fixture.setSnapshot(2, [], [1]);
    const controller = createMissionRulesController("assault_citadel_ridge", fixture.scenario);
    const view = mountObjectiveScreen(fixture.scenario, () => fixture.engine, controller);
    view.screen.uiState = { selectedMission: "assault_citadel_ridge" };
    await Given("Citadel is initialized before an accepted action with no friendly strongpoint held", () => {
      view.screen.evaluateMissionRules();
      assert.equal(view.screen.missionStatus?.phase?.id, "phase1_probe");
      assert.equal(view.screen.missionStatus?.markers?.[0].status, "unoccupied");
    });
    await When("the existing post-action hook observes a player capture during the same turn", () => {
      fixture.setSnapshot(2, [0], [1]);
      view.screen.refreshCampaignMissionStatusAfterTacticalAction();
    });
    await Then("the real controller, compact card and renderer refresh immediately without a turn-boundary event", () => {
      assert.equal(view.screen.missionStatus?.turn, 2);
      assert.equal(view.screen.missionStatus?.phase?.id, "phase2_commitment");
      assert.match(view.screen.missionStatus?.objectives[0].detail ?? "", /Captured: 1\/4/);
      assertCitadelPresentation(view, [
        { status: "player", tooltip: "North Battery - Friendly-held." },
        { status: "enemy", tooltip: "Central Citadel - Enemy-held." },
        { status: "unoccupied", tooltip: "South Battery - Unoccupied." },
        { status: "unoccupied", tooltip: "Command Ridge - Unoccupied." }
      ]);
    });
    await When("another completed action reports enemy recapture and then a vacancy, still in turn two", () => {
      fixture.setSnapshot(2, [], [0, 1]);
      view.screen.refreshCampaignMissionStatusAfterTacticalAction();
      assert.equal(view.screen.missionStatus?.phase?.id, "phase1_probe");
      assertCitadelPresentation(view, [
        { status: "enemy", tooltip: "North Battery - Enemy-held." },
        { status: "enemy", tooltip: "Central Citadel - Enemy-held." },
        { status: "unoccupied", tooltip: "South Battery - Unoccupied." },
        { status: "unoccupied", tooltip: "Command Ridge - Unoccupied." }
      ]);
      fixture.setSnapshot(2, [], [1]);
      view.screen.refreshCampaignMissionStatusAfterTacticalAction();
    });
    await Then("vacant control replaces the old capture and repeated hooks do not create progression or duplicate markers", () => {
      assertCitadelPresentation(view, [
        { status: "unoccupied", tooltip: "North Battery - Unoccupied." },
        { status: "enemy", tooltip: "Central Citadel - Enemy-held." },
        { status: "unoccupied", tooltip: "South Battery - Unoccupied." },
        { status: "unoccupied", tooltip: "Command Ridge - Unoccupied." }
      ]);
      const before = structuredClone(view.screen.missionStatus);
      const saved = controller.serializeState();
      view.screen.refreshCampaignMissionStatusAfterTacticalAction();
      assert.deepEqual(view.screen.missionStatus, before);
      assert.deepEqual(controller.serializeState(), saved);
      assert.equal(view.screen.missionStatus?.turn, 2);
      assert.equal(view.screen.missionStatus?.outcome.state, "inProgress");
      assert.equal(view.svg.querySelectorAll(".objective-marker").length, 4);
    });
  } finally {
    document.body.replaceChildren();
  }
});

for (const missionKey of ["training", "patrol_river_watch", "patrol_pointe_du_hoc"] as const) {
  registerTest(`BATTLESCREEN_CITADEL_POST_ACTION_SCOPE_PRESERVES_${missionKey.toUpperCase()}`, () => {
    const screen = Object.create(BattleScreen.prototype) as ObjectiveScreenProbe;
    let evaluations = 0;
    Object.assign(screen, {
      uiState: { selectedMission: missionKey },
      evaluateMissionRules: () => { evaluations += 1; }
    });
    screen.refreshCampaignMissionStatusAfterTacticalAction();
    assert.equal(evaluations, 0, "The Citadel repair must not broaden action evaluation into tutorial or hold-clock missions.");
  });
}
