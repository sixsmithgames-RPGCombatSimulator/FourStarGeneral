import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer";
import type { ScenarioData } from "../src/core/types";

registerTest("HEXMAP_RENDERER_SHOWS_EDGE_TANK_TRAPS_AND_LEVELED_CLEAR_PATHS", async ({ Given, When, Then }) => {
  const viewport = document.createElement("div");
  viewport.style.width = "420px";
  viewport.style.height = "220px";
  Object.defineProperty(viewport, "clientWidth", { value: 420, configurable: true });
  Object.defineProperty(viewport, "clientHeight", { value: 220, configurable: true });

  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  viewport.appendChild(canvas);
  document.body.appendChild(viewport);

  const scenario: ScenarioData = {
    name: "Engineer Overlay Details",
    size: { cols: 2, rows: 1 },
    tilePalette: {
      PLAINS: {
        terrain: "plains",
        terrainType: "grass",
        density: "average",
        features: [],
        recon: "intel"
      },
      ROAD: {
        terrain: "road",
        terrainType: "rural",
        density: "sparse",
        features: [],
        recon: "intel"
      }
    },
    tiles: [[{ tile: "PLAINS" }, { tile: "ROAD" }]],
    objectives: [],
    turnLimit: 1,
    sides: {
      Player: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] },
      Bot: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] }
    }
  };

  const renderer = new HexMapRenderer();

  await Given("a rendered battlefield hex adjacent to a road", async () => {
    renderer.render(svg as SVGSVGElement, canvas as HTMLDivElement, scenario);
  });

  await When("edge tank traps, fortifications, and a level-2 clear path are drawn together", async () => {
    renderer.renderHexModifications("0,0", [
      {
        type: "fortifications",
        hex: { q: 0, r: 0 },
        faction: "Player",
        facing: "E",
        builtOnTurn: 2
      },
      {
        type: "tankTraps",
        hex: { q: 0, r: 0 },
        faction: "Player",
        facing: "E",
        builtOnTurn: 2
      },
      {
        type: "clearedPath",
        hex: { q: 0, r: 0 },
        faction: "Player",
        level: 2,
        builtOnTurn: 2
      }
    ]);
  });

  await Then("the map shows black edge tank traps and a road-like level-2 clear path", async () => {
    const tankTrapLines = svg.querySelectorAll('[data-modification-type="tankTraps"][data-modification-facing="E"] line[stroke="#050607"]');
    if (tankTrapLines.length !== 9) {
      throw new Error(`Expected three black tank-trap hedgehogs on the edge, received ${tankTrapLines.length} lines.`);
    }

    const clearPathGroup = svg.querySelector('[data-modification-type="clearedPath"][data-cleared-path-level="2"]');
    if (!clearPathGroup) {
      throw new Error("Expected the clear-path overlay to preserve its level metadata.");
    }

    const clearPathSegment = clearPathGroup.querySelector('[data-road-segment="true"]');
    if (!clearPathSegment) {
      throw new Error("Expected the level-2 clear path to reuse the road overlay segment toward the adjacent road.");
    }
    if (clearPathSegment.getAttribute("stroke-width") !== "2.1") {
      throw new Error(`Expected level-2 clear path to use an intermediate road width, received '${clearPathSegment.getAttribute("stroke-width")}'.`);
    }

    viewport.remove();
  });
});
