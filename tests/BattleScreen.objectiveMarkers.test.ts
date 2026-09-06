import "./domEnvironment.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer";
import { CoordinateSystem } from "../src/rendering/CoordinateSystem";
import type { ScenarioData, ScenarioUnit } from "../src/core/types";
import type { Axial } from "../src/core/Hex";
import { GameEngine, type GameEngineConfig } from "../src/game/GameEngine";
import unitTypes from "../src/data/unitSystem/derivedUnitTypes";
import terrain from "../src/data/terrain.json";
import { createScenarioUnitFromTemplate, findTemplateForUnitKey } from "../src/game/adapters";
import { generateCampaignBattleScenario } from "../src/game/campaign/CampaignBattleGenerator";
import { normalizeScenarioSource, type RawScenarioInput } from "../src/data/scenarioNormalizer";
import { createMissionRulesController, type MissionRulesController, type MissionStatus } from "../src/state/missionRules";
import { resetDeploymentState } from "../src/state/DeploymentState";

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

/** Exposes only the real Screen evaluation/render seam; no mission result or engine action is stubbed. */
interface ObjectiveScreenProbe {
  element: HTMLElement;
  scenario: ScenarioData;
  currentObjectiveIndex: number;
  missionRulesController: MissionRulesController;
  missionStatus: MissionStatus | null;
  missionEndPrompted: boolean;
  hexMapRenderer: HexMapRenderer;
  battleState: {
    hasEngine(): boolean;
    ensureGameEngine(): GameEngine;
    getPrecombatMissionInfo(): null;
    emitBattleUpdate(reason: string): void;
  };
  cacheElements(): void;
  evaluateMissionRules(): void;
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
function mountObjectiveScreen(scenario: ScenarioData, readEngine: () => GameEngine, controller = createMissionRulesController("campaign", scenario)): {
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
    missionStatus: null, missionEndPrompted: false, hexMapRenderer: renderer,
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
