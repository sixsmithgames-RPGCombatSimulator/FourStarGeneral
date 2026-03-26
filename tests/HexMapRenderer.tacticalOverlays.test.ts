import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer";
import type { ScenarioData } from "../src/core/types";

registerTest("HEXMAP_RENDERER_SHOWS_TACTICAL_OVERLAYS_FOR_SUPPRESSION_AND_FIELDWORKS", async ({ Given, When, Then }) => {
  const viewport = document.createElement("div");
  viewport.style.width = "320px";
  viewport.style.height = "220px";
  Object.defineProperty(viewport, "clientWidth", { value: 320, configurable: true });
  Object.defineProperty(viewport, "clientHeight", { value: 220, configurable: true });

  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  viewport.appendChild(canvas);
  document.body.appendChild(viewport);

  const scenario: ScenarioData = {
    name: "Tactical Overlays",
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

  await Given("a rendered battlefield hex", async () => {
    renderer.render(svg as SVGSVGElement, canvas as HTMLDivElement, scenario);
  });

  await When("a dug-in pinned unit and engineer fortifications are drawn on the same hex", async () => {
    renderer.renderHexModification("0,0", {
      type: "fortifications",
      hex: { q: 0, r: 0 },
      faction: "Player",
      builtOnTurn: 2
    });
    renderer.renderUnit("0,0", {
      type: "Infantry_42" as never,
      hex: { q: 0, r: 0 },
      strength: 100,
      experience: 0,
      ammo: 6,
      fuel: 0,
      entrench: 2,
      facing: "N",
      suppressedBy: ["enemy-a", "enemy-b"]
    }, "Player");
  });

  await Then("the map displays the battlefield status badge, entrenchment pips, and hex modification overlay", async () => {
    const modification = svg.querySelector('[data-modification-type="fortifications"]');
    if (!modification) {
      throw new Error("Expected fortification overlay to render on the modified hex.");
    }

    const unitStack = svg.querySelector<SVGGElement>('g.unit-stack[data-suppression-state="pinned"]');
    if (!unitStack) {
      throw new Error("Expected unit stack to record pinned suppression state.");
    }

    const badge = svg.querySelector('[data-status="pinned"]');
    if (!badge) {
      throw new Error("Expected pinned status badge to render above the unit.");
    }

    const entrenchment = svg.querySelector('[data-entrenchment="2"]');
    if (!entrenchment) {
      throw new Error("Expected entrenchment pips to render for dug-in units.");
    }

    viewport.remove();
  });
});

registerTest("HEXMAP_RENDERER_SHOWS_SENTRY_STATUS_PIP", async ({ Given, When, Then }) => {
  const viewport = document.createElement("div");
  viewport.style.width = "320px";
  viewport.style.height = "220px";
  Object.defineProperty(viewport, "clientWidth", { value: 320, configurable: true });
  Object.defineProperty(viewport, "clientHeight", { value: 220, configurable: true });

  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  viewport.appendChild(canvas);
  document.body.appendChild(viewport);

  const scenario: ScenarioData = {
    name: "Sentry Pip",
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

  await Given("a rendered battlefield hex", async () => {
    renderer.render(svg as SVGSVGElement, canvas as HTMLDivElement, scenario);
  });

  await When("a sentry unit is drawn", async () => {
    renderer.renderUnit("0,0", {
      type: "Infantry_42" as never,
      hex: { q: 0, r: 0 },
      strength: 100,
      experience: 0,
      ammo: 6,
      fuel: 0,
      entrench: 0,
      facing: "N",
      onSentry: true
    }, "Player");
  });

  await Then("the map displays the sentry pip above the unit", async () => {
    const unitStack = svg.querySelector<SVGGElement>('g.unit-stack[data-sentry-state="on"]');
    if (!unitStack) {
      throw new Error("Expected unit stack to record sentry state.");
    }

    const pip = svg.querySelector('[data-status="sentry"]');
    if (!pip) {
      throw new Error("Expected sentry status pip to render above the unit.");
    }

    viewport.remove();
  });
});

registerTest("HEXMAP_RENDERER_KEEPS_SPOTTED_CONTACT_MARKERS_READABLE_WHEN_FACING_LEFT", async ({ Given, When, Then }) => {
  const viewport = document.createElement("div");
  viewport.style.width = "320px";
  viewport.style.height = "220px";
  Object.defineProperty(viewport, "clientWidth", { value: 320, configurable: true });
  Object.defineProperty(viewport, "clientHeight", { value: 220, configurable: true });

  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  viewport.appendChild(canvas);
  document.body.appendChild(viewport);

  const scenario: ScenarioData = {
    name: "Recon Marker Facing",
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

  await Given("a rendered battlefield hex", async () => {
    renderer.render(svg as SVGSVGElement, canvas as HTMLDivElement, scenario);
  });

  await When("a spotted contact is rendered with a left-facing orientation", async () => {
    renderer.renderUnit("0,0", {
      type: "Recon_Bike" as never,
      hex: { q: 0, r: 0 },
      strength: 100,
      experience: 0,
      ammo: 5,
      fuel: 30,
      entrench: 0,
      facing: "SW"
    }, "Bot", "spotted");
  });

  await Then("the generic contact marker stays unmirrored", async () => {
    const facingGroup = svg.querySelector<SVGGElement>("g.unit-stack > g.unit-stack-facing");
    if (!facingGroup) {
      throw new Error("Expected the renderer to create a facing group for the spotted contact.");
    }
    const transform = facingGroup.getAttribute("transform") ?? "";
    if (!transform.includes("scale(1 1)")) {
      throw new Error(`Expected spotted contact marker to avoid horizontal mirroring, received '${transform}'.`);
    }

    viewport.remove();
  });
});
