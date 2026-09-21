import "./domEnvironment.js";
import type { ScenarioData, TileDefinition } from "../src/core/types";
import { axialDirections } from "../src/core/Hex";
import { CoordinateSystem } from "../src/rendering/CoordinateSystem";
import {
  buildFringeHexMarkup,
  buildHexTileMarkup,
  type HexMapMarkupServices,
  type RenderableHex
} from "../src/rendering/HexMapMarkupBuilder";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer";
import { registerTest } from "./harness.js";

const plainTile: TileDefinition = {
  terrain: "plains",
  terrainType: "grass",
  density: "average",
  features: [],
  recon: "intel"
};

const presentationServices: HexMapMarkupServices = {
  terrainRenderer: {
    getTerrainFill: (terrain) => terrain === "beach" ? "#beach" : "#plain",
    generateHexTooltip: (tile) => `Tooltip:${tile.terrain}`,
    getTerrainSprite: (tile) => `${tile.terrain}.png`,
    getBeachWaterSprite: () => "beach-water.png"
  },
  roadRenderer: {
    drawRoadOverlay: () => '<path data-test-road="true" />'
  },
  riverRenderer: {
    drawRiverOverlay: () => '<path data-test-river="true" />'
  }
};

function buildScenario(
  tiles: ScenarioData["tiles"],
  tilePalette: ScenarioData["tilePalette"]
): ScenarioData {
  return {
    name: "Map markup extraction fixture",
    size: { cols: tiles[0]?.length ?? 0, rows: tiles.length },
    tilePalette,
    tiles,
    objectives: [],
    turnLimit: 1,
    sides: {
      Player: {
        hq: { q: 0, r: 0 },
        general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
        units: []
      },
      Bot: {
        hq: { q: 0, r: 0 },
        general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
        units: []
      }
    }
  };
}

registerTest("HEX_MAP_MARKUP_BUILDER_PRESERVES_TILE_METADATA_AND_FEATURE_OVERLAYS", async ({ Given, When, Then }) => {
  const featureTile: TileDefinition = {
    ...plainTile,
    features: ["shallow", "ford", "bridge", "rubble"]
  };
  const scenario = buildScenario([[{ tile: "FEATURE" }]], { FEATURE: featureTile });
  const hex: RenderableHex = { tile: featureTile, x: 75, y: 60, col: 0, row: 0 };
  let markup = "";

  await Given("a resolved tile containing every bespoke terrain feature overlay", async () => {});

  await When("its deterministic presentation markup is built", async () => {
    markup = buildHexTileMarkup(hex, 0, 0, 20, scenario, presentationServices);
  });

  await Then("the tile retains renderer metadata, service overlays, clipping, and feature layers", async () => {
    const requiredFragments = [
      'class="hex-cell"',
      'data-terrain="plains"',
      'data-features="shallow|ford|bridge|rubble"',
      'data-hex="0,0"',
      'data-defense="0"',
      'data-acc-mod="0"',
      'data-blocks-los="false"',
      'id="clip-0-0"',
      'data-test-road="true"',
      'data-test-river="true"',
      'terrain-feature-overlay--shallow',
      'terrain-feature-overlay--ford',
      'terrain-feature-overlay--rubble-bridge',
      "<title>Tooltip:plains</title>"
    ];
    const missing = requiredFragments.filter((fragment) => !markup.includes(fragment));
    if (missing.length > 0) {
      throw new Error(`Extracted tile markup dropped required presentation fragments: ${missing.join(", ")}`);
    }

    const roadIndex = markup.indexOf('data-test-road="true"');
    const riverIndex = markup.indexOf('data-test-river="true"');
    const featureIndex = markup.indexOf("terrain-feature-overlay--shallow");
    if (!(roadIndex < riverIndex && riverIndex < featureIndex)) {
      throw new Error("Expected road, river, and feature overlays to preserve their original SVG stacking order.");
    }
  });
});

registerTest("HEX_MAP_MARKUP_BUILDER_ORIENTS_BEACH_WATER_FOR_ALL_AXIAL_NEIGHBORS", async ({ Given, When, Then }) => {
  const beachTile: TileDefinition = {
    terrain: "beach",
    terrainType: "coastal",
    density: "sparse",
    features: [],
    recon: "intel"
  };
  const seaTile: TileDefinition = {
    terrain: "sea",
    terrainType: "water",
    density: "sparse",
    features: [],
    recon: "intel"
  };
  const expectedRotations = [120, 60, 0, 300, 240, 180] as const;
  const rotations: number[] = [];

  await Given("a beach tile with the sea placed independently on each of its six sides", async () => {});

  await When("each beach-water tile presentation is built", async () => {
    for (let directionIndex = 0; directionIndex < axialDirections.length; directionIndex += 1) {
      const tiles: ScenarioData["tiles"] = Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => ({ tile: "PLAIN" }))
      );
      const beachCol = 2;
      const beachRow = 2;
      const beachAxial = CoordinateSystem.offsetToAxial(beachCol, beachRow);
      const direction = axialDirections[directionIndex]!;
      const seaOffset = CoordinateSystem.axialToOffset(beachAxial.q + direction.q, beachAxial.r + direction.r);
      tiles[beachRow]![beachCol] = { tile: "BEACH" };
      tiles[seaOffset.row]![seaOffset.col] = { tile: "SEA" };
      const scenario = buildScenario(tiles, { PLAIN: plainTile, BEACH: beachTile, SEA: seaTile });
      const point = CoordinateSystem.axialToPixel(beachAxial.q, beachAxial.r);
      const markup = buildHexTileMarkup(
        { tile: beachTile, x: point.x, y: point.y, col: beachCol, row: beachRow },
        0,
        0,
        0,
        scenario,
        presentationServices
      );
      if (!markup.includes('href="beach-water.png"')) {
        throw new Error(`Direction ${directionIndex} did not select the beach-water sprite.`);
      }
      const match = markup.match(/transform="rotate\((\d+),/);
      rotations.push(Number(match?.[1] ?? Number.NaN));
    }
  });

  await Then("the extracted presenter preserves the established clockwise rotation table", async () => {
    if (rotations.length !== expectedRotations.length || rotations.some((rotation, index) => rotation !== expectedRotations[index])) {
      throw new Error(`Expected rotations ${expectedRotations.join(",")}, received ${rotations.join(",")}.`);
    }
  });
});

registerTest("HEX_MAP_MARKUP_BUILDER_FRINGE_IS_DETERMINISTIC_AND_NONINTERACTIVE", async ({ Given, When, Then }) => {
  const point = CoordinateSystem.axialToPixel(0, 0);
  const hexes: RenderableHex[] = [{ tile: plainTile, x: point.x, y: point.y, col: 0, row: 0 }];
  const realKeys = new Set(["0,0"]);
  let first = "";
  let second = "";

  await Given("a single real hex and stable terrain-fill service", async () => {});

  await When("the five-ring fringe is built twice", async () => {
    first = buildFringeHexMarkup(realKeys, hexes, 0, 0, 40, presentationServices);
    second = buildFringeHexMarkup(realKeys, hexes, 0, 0, 40, presentationServices);
  });

  await Then("both outputs are identical, inert, and retain every fade opacity", async () => {
    if (first !== second) {
      throw new Error("Expected fringe markup generation to be deterministic for identical inputs.");
    }
    if (!first.includes('id="fringeLayer"') || !first.includes('aria-hidden="true"')) {
      throw new Error("Expected the extracted fringe layer to remain hidden from interaction and accessibility.");
    }
    if (first.includes("data-hex=")) {
      throw new Error("Fringe polygons must not acquire gameplay hex metadata.");
    }
    for (const opacity of ["0.55", "0.38", "0.22", "0.1", "0.04"]) {
      if (!first.includes(`fill-opacity="${opacity}"`)) {
        throw new Error(`Expected fringe output to preserve the ${opacity} ring opacity.`);
      }
    }
    const polygonCount = first.match(/<polygon /g)?.length ?? 0;
    if (polygonCount === 0) {
      throw new Error("Expected the fringe presenter to emit inert SVG polygons.");
    }
  });
});

registerTest("HEX_MAP_MARKUP_EXTRACTION_PRESERVES_RENDERER_DOM_BOUNDARY", async ({ Given, When, Then }) => {
  const renderer = new HexMapRenderer();
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const scenario = buildScenario([[{ tile: "PLAIN" }, { tile: "PLAIN" }]], { PLAIN: plainTile });
  let firstViewportRoot: SVGGElement | null = null;
  let firstEffectsLayer: SVGGElement | null = null;

  await Given("a renderer whose deterministic markup feeds the existing DOM lifecycle", async () => {
    canvas.appendChild(svg);
    renderer.render(svg, canvas, scenario);
    firstViewportRoot = svg.querySelector<SVGGElement>("#viewportRoot");
    firstEffectsLayer = svg.querySelector<SVGGElement>(".combat-effects-layer");
  });

  await When("the same map is rendered again", async () => {
    renderer.render(svg, canvas, scenario);
  });

  await Then("the renderer reuses stateful DOM owners and rebuilds cached playable hexes", async () => {
    if (!firstViewportRoot || svg.querySelector("#viewportRoot") !== firstViewportRoot) {
      throw new Error("Expected map presentation extraction to preserve the viewportRoot node across renders.");
    }
    if (!firstEffectsLayer || svg.querySelector(".combat-effects-layer") !== firstEffectsLayer) {
      throw new Error("Expected map presentation extraction to preserve the combat effects layer across renders.");
    }
    if (!renderer.getHexElement("0,0") || !renderer.getHexElement("1,0")) {
      throw new Error("Expected HexMapRenderer to rebuild its cached hex references from extracted markup.");
    }
  });
});
