import { readFileSync } from "node:fs";
import "./domEnvironment.js";
import type { ScenarioData, TileDefinition } from "../src/core/types";
import { buildHexMapLayout } from "../src/rendering/HexMapLayout";
import {
  buildPrecombatMiniMapPresentation,
  renderPrecombatMiniMap
} from "../src/rendering/PrecombatMiniMapRenderer";
import { resolveTerrainFill } from "../src/rendering/TerrainFillPalette";
import { registerTest } from "./harness.js";

const plainTile: TileDefinition = {
  terrain: "plains",
  terrainType: "grass",
  density: "average",
  features: [],
  recon: "intel"
};

function buildScenario(rows: number, cols: number): ScenarioData {
  return {
    name: "Minimap regression theater",
    size: { cols, rows },
    tilePalette: { PLAIN: plainTile },
    tiles: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: "PLAIN" }))),
    objectives: [],
    turnLimit: 1,
    sides: {
      Player: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] },
      Bot: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] }
    }
  };
}

registerTest("PRECOMBAT_MINIMAP_USES_CANONICAL_LAYOUT_FOR_ALL_TRAINING_HEXES", async ({ Given, When, Then }) => {
  const scenario = buildScenario(16, 20);
  let first = buildPrecombatMiniMapPresentation(scenario);
  let second = first;

  await Given("a normalized 20 by 16 training theater", async () => {});

  await When("the inert briefing presentation is built twice", async () => {
    first = buildPrecombatMiniMapPresentation(scenario);
    second = buildPrecombatMiniMapPresentation(scenario);
  });

  await Then("all 320 cells use the shared finite bounds and deterministic markup", async () => {
    const layout = buildHexMapLayout(scenario);
    const polygonCount = first.markup.match(/class="hex-tile"/g)?.length ?? 0;
    if (first.tileCount !== 320 || polygonCount !== 320) {
      throw new Error(`Expected 320 inert minimap cells, received ${first.tileCount} cells and ${polygonCount} polygons.`);
    }
    if (first.viewBox !== `0 0 ${layout.width} ${layout.height}` || first.markup !== second.markup) {
      throw new Error("Minimap presentation drifted from canonical layout bounds or deterministic output.");
    }
    if (![first.width, first.height].every((value) => Number.isFinite(value) && value > 0)) {
      throw new Error(`Expected finite positive minimap bounds, received ${first.width} by ${first.height}.`);
    }
  });
});

registerTest("PRECOMBAT_MINIMAP_IS_INERT_AND_PRESERVES_GEOGRAPHY_METADATA", async ({ Given, When, Then }) => {
  const featureTile: TileDefinition = {
    terrain: "plains",
    terrainType: "grass",
    density: "average",
    features: ["road", "small rivers", "shallow", "ford", "bridge", "rubble"],
    recon: "intel"
  };
  const scenario = buildScenario(1, 2);
  scenario.tilePalette.FEATURE = featureTile;
  scenario.tiles[0]![0] = { tile: "FEATURE" };
  scenario.tiles[0]![1] = { tile: "FEATURE" };
  let markup = "";

  await Given("a theater tile with connected road, river, and crossing geography", async () => {});

  await When("the briefing-only minimap markup is projected", async () => {
    markup = buildPrecombatMiniMapPresentation(scenario).markup;
  });

  await Then("geography remains inspectable without battle effects, sprites, or interaction owners", async () => {
    for (const fragment of [
      'data-terrain="plains"',
      'data-features="road|small rivers|shallow|ford|bridge|rubble"',
      'data-road-segment="true"',
      'data-river-segment="true"',
      "terrain-feature-overlay--shallow",
      "terrain-feature-overlay--ford",
      "terrain-feature-overlay--rubble-bridge"
    ]) {
      if (!markup.includes(fragment)) throw new Error(`Minimap dropped required geography fragment: ${fragment}.`);
    }
    for (const forbidden of ["<image", "viewportRoot", "combat-effects", "terrain-sprite", "data-defense="]) {
      if (markup.includes(forbidden)) throw new Error(`Minimap imported battle-only presentation: ${forbidden}.`);
    }
  });
});

registerTest("PRECOMBAT_MINIMAP_DOM_ADAPTER_REPLACES_STALE_CONTENT_AND_LABELS_THE_OVERVIEW", async ({ Given, When, Then }) => {
  const scenario = buildScenario(2, 3);
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.innerHTML = '<g id="stale"></g>';
  canvas.appendChild(svg);

  await Given("a precombat SVG containing stale presentation state", async () => {});

  await When("the current scenario is rendered through the minimap DOM boundary", async () => {
    renderPrecombatMiniMap(svg, canvas, scenario);
  });

  await Then("stale nodes are replaced and the theater overview is accessible", async () => {
    if (svg.querySelector("#stale") || svg.querySelectorAll(".hex-cell").length !== 6) {
      throw new Error("Expected minimap render to replace stale content with exactly six scenario cells.");
    }
    if (svg.getAttribute("role") !== "img" || !svg.getAttribute("aria-label")?.includes("6 hexes")) {
      throw new Error("Expected the minimap SVG to expose one concise theater overview label.");
    }
  });
});

registerTest("PRECOMBAT_MINIMAP_EMPTY_SCENARIO_KEEPS_A_VALID_SVG_VIEWBOX", async ({ Given, When, Then }) => {
  const scenario = buildScenario(0, 0);
  let presentation = buildPrecombatMiniMapPresentation(scenario);

  await Given("a malformed or future scenario with no resolvable tiles", async () => {});

  await When("the briefing presentation degrades safely", async () => {
    presentation = buildPrecombatMiniMapPresentation(scenario);
  });

  await Then("it emits no cells while retaining a valid nonzero SVG viewport", async () => {
    if (presentation.tileCount !== 0 || presentation.markup !== "" || presentation.viewBox !== "0 0 1 1") {
      throw new Error(`Expected a safe empty minimap, received ${JSON.stringify(presentation)}.`);
    }
  });
});

registerTest("PRECOMBAT_MINIMAP_HAS_SINGLE_LAYOUT_AND_TERRAIN_FILL_AUTHORITIES", async ({ Given, When, Then }) => {
  await Given("the battle and briefing maps share geometry and terrain semantics", async () => {});

  await When("architecture boundaries are inspected", async () => {});

  await Then("PrecombatScreen contains no full renderer or duplicate palette implementation", async () => {
    const precombatSource = readFileSync("src/ui/screens/PrecombatScreen.ts", "utf8");
    const rendererSource = readFileSync("src/rendering/HexMapRenderer.ts", "utf8");
    if (/HexMapRenderer|miniMapRenderer|getMiniMapTerrainFill|requestMiniMapRender/.test(precombatSource)) {
      throw new Error("PrecombatScreen must remain a thin adapter over the dedicated inert minimap renderer.");
    }
    if (!rendererSource.includes("buildHexMapLayout(data)")) {
      throw new Error("Battle rendering must continue to use the canonical shared hex layout owner.");
    }
    if (resolveTerrainFill("river", "water", "briefing") !== "#5f7580"
      || resolveTerrainFill("river", "water", "battle") !== "#1c4d6e") {
      throw new Error("Expected the single terrain-fill authority to preserve explicit briefing and battle themes.");
    }
  });
});
