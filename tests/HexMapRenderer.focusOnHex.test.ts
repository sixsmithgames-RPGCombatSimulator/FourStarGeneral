import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer";
import type { ScenarioData } from "../src/core/types";

registerTest("HEXMAP_FOCUS_ON_HEX", async ({ Given, When, Then }) => {
  const viewport = document.createElement("div");
  viewport.classList.add("map-viewport");
  viewport.style.width = "200px";
  viewport.style.height = "150px";
  viewport.style.overflow = "auto";
  Object.defineProperty(viewport, "clientWidth", { value: 200, configurable: true });
  Object.defineProperty(viewport, "clientHeight", { value: 150, configurable: true });

  const canvas = document.createElement("div");
  canvas.id = "battleMapCanvas";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "battleHexMap";

  canvas.appendChild(svg);
  viewport.appendChild(canvas);
  document.body.appendChild(viewport);

  const scenario: ScenarioData = {
    name: "Focus Harness",
    size: { cols: 1, rows: 1 },
    tilePalette: {
      PLAINS: {
        terrain: "plains",
        terrainType: "grass",
        density: "average",
        features: [],
        recon: "intel"
      }
    },
    tiles: [[{ tile: "PLAINS" }]],
    objectives: [],
    turnLimit: 1,
    sides: {
      Player: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] },
      Bot: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] }
    }
  };

  const renderer = new HexMapRenderer();

  await Given("a rendered single-hex map", async () => {
    renderer.render(svg, canvas as HTMLDivElement, scenario);
  });

  const scrollCalls: Array<{ left?: number; top?: number; behavior?: ScrollBehavior }> = [];
  viewport.scrollTo = (options) => {
    scrollCalls.push(options as { left?: number; top?: number; behavior?: ScrollBehavior });
  };

  const hexKey = "0,0";

  await When("focusOnHex is invoked for the origin hex", async () => {
    renderer.focusOnHex(hexKey, { behavior: "auto" });
  });

  await Then("the viewport scroll offsets center the requested hex", async () => {
    const cell = svg.querySelector<SVGGElement>(`[data-hex="${hexKey}"]`);
    if (!cell) {
      throw new Error("Expected rendered cell for hex 0,0");
    }

    const cx = Number(cell.dataset.cx ?? NaN);
    const cy = Number(cell.dataset.cy ?? NaN);
    if (Number.isNaN(cx) || Number.isNaN(cy)) {
      throw new Error("Cell coordinates missing from dataset");
    }

    const mapWidth = parseFloat(canvas.style.width);
    const mapHeight = parseFloat(canvas.style.height);

    const maxLeft = Math.max(0, mapWidth - viewport.clientWidth);
    const maxTop = Math.max(0, mapHeight - viewport.clientHeight);
    const expectedLeft = Math.min(Math.max(cx - viewport.clientWidth / 2, 0), maxLeft);
    const expectedTop = Math.min(Math.max(cy - viewport.clientHeight / 2, 0), maxTop);

    if (viewport.scrollLeft !== expectedLeft) {
      throw new Error(`scrollLeft ${viewport.scrollLeft} did not match expected ${expectedLeft}`);
    }
    if (viewport.scrollTop !== expectedTop) {
      throw new Error(`scrollTop ${viewport.scrollTop} did not match expected ${expectedTop}`);
    }
    if (scrollCalls.length === 0) {
      throw new Error("scrollTo should have been invoked for smooth compatibility");
    }

    viewport.remove();
  });
});
