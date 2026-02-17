import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer";
import type { ScenarioData } from "../src/core/types";

type RafCallback = (timestamp: number) => void;

registerTest("HEXMAP_ANIMATE_UNIT_MOVE", async ({ Given, When, Then }) => {
  const viewport = document.createElement("div");
  viewport.style.width = "300px";
  viewport.style.height = "200px";
  viewport.style.overflow = "hidden";
  Object.defineProperty(viewport, "clientWidth", { value: 300, configurable: true });
  Object.defineProperty(viewport, "clientHeight", { value: 200, configurable: true });

  const canvas = document.createElement("div");
  canvas.id = "battleMapCanvas";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "battleHexMap";

  canvas.appendChild(svg);
  viewport.appendChild(canvas);
  document.body.appendChild(viewport);

  const scenario: ScenarioData = {
    name: "Animation Harness",
    size: { cols: 2, rows: 1 },
    tilePalette: {
      PLAINS: {
        terrain: "plains",
        terrainType: "grass",
        density: "average",
        features: [],
        recon: "intel"
      }
    },
    tiles: [[{ tile: "PLAINS" }, { tile: "PLAINS" }]],
    objectives: [],
    turnLimit: 1,
    sides: {
      Player: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] },
      Bot: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] }
    }
  };

  const renderer = new HexMapRenderer();

  await Given("a rendered map and unit icon", async () => {
    renderer.render(svg as SVGSVGElement, canvas as HTMLDivElement, scenario);
    renderer.renderUnit("0,0", {
      type: "Infantry" as never,
      hex: { q: 0, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 6,
      fuel: 0,
      entrench: 0,
      facing: "N"
    }, "Player");
    renderer.renderUnit("1,0", {
      type: "Infantry" as never,
      hex: { q: 1, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 6,
      fuel: 0,
      entrench: 0,
      facing: "N"
    }, "Player");
  });

  const rafCallbacks: RafCallback[] = [];
  const originalRaf = window.requestAnimationFrame;

  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  };

  await When("animateUnitMove runs from the first hex to the second", async () => {
    const animation = renderer.animateUnitMove("0,0", "1,0", 200);

    // Flush queued frames: simulate steady progression to completion.
    let timestamp = performance.now();
    while (rafCallbacks.length > 0) {
      const cb = rafCallbacks.shift();
      if (!cb) break;
      timestamp += 50;
      cb(timestamp);
    }

    await animation;
  });

  window.requestAnimationFrame = originalRaf;

  await Then("the ghost is removed and original icon opacity restored", async () => {
    const ghostCount = svg.querySelectorAll(".unit-move-ghost").length;
    if (ghostCount !== 0) {
      throw new Error(`Expected zero ghost sprites, found ${ghostCount}`);
    }

    const movingGroup = svg.querySelector<SVGGElement>("[data-hex='0,0'] g.unit-stack");
    if (!movingGroup) {
      throw new Error("Original unit icon missing after animation");
    }

    if (movingGroup.style.opacity && movingGroup.style.opacity !== "") {
      throw new Error(`Expected original icon opacity reset, got ${movingGroup.style.opacity}`);
    }
  });

  await When("animateUnitMove runs with zero duration", async () => {
    // Zero-duration transitions should bypass RAF scheduling; throw if a frame is unexpectedly requested.
    window.requestAnimationFrame = () => {
      throw new Error("Zero-duration animation should not schedule requestAnimationFrame");
    };

    await renderer.animateUnitMove("0,0", "1,0", 0);
  });

  window.requestAnimationFrame = originalRaf;

  await Then("the zero-duration path snap-cleans the ghost and restores opacity", async () => {
    const ghostCount = svg.querySelectorAll(".unit-move-ghost").length;
    if (ghostCount !== 0) {
      throw new Error(`Expected zero ghost sprites after zero-duration run, found ${ghostCount}`);
    }

    const movingGroup = svg.querySelector<SVGGElement>("[data-hex='0,0'] g.unit-stack");
    if (!movingGroup) {
      throw new Error("Original unit icon missing after zero-duration animation");
    }

    if (movingGroup.style.opacity && movingGroup.style.opacity !== "") {
      throw new Error(`Expected original icon opacity reset after zero-duration run, got ${movingGroup.style.opacity}`);
    }

    viewport.remove();
  });
});
