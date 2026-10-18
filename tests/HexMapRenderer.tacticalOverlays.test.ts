import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer";
import type { ScenarioData } from "../src/core/types";

registerTest("HEXMAP_OUTLINES_STAY_ABOVE_TERRAIN_AND_FOLLOW_SELECTION_THROUGH_RENDER", async ({ Given, When, Then }) => {
  const canvas: HTMLDivElement = document.createElement("div");
  const svg: SVGSVGElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  document.body.appendChild(canvas);
  const scenario: ScenarioData = {
    name: "Tactical border continuity", size: { cols: 3, rows: 1 },
    tilePalette: { PLAINS: { terrain: "plains", terrainType: "grass", density: "average", features: [], recon: "intel" } },
    tiles: [[{ tile: "PLAINS" }, { tile: "PLAINS" }, { tile: "PLAINS" }]], objectives: [], turnLimit: 1,
    sides: {
      Player: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] },
      Bot: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] }
    }
  };
  const renderer: HexMapRenderer = new HexMapRenderer();
  const outline = (key: string): SVGGElement | null => svg.querySelector<SVGGElement>(`[data-outline-hex="${key}"]`);
  await Given("a battlefield with adjacent movement, attack and selected hexes", () => {
    renderer.render(svg, canvas, scenario);
    renderer.setTacticalHighlights(["0,0"], ["1,0"]);
    renderer.applyHexSelection("2,0");
  });
  await Then("one pointer-transparent outline layer follows every terrain cell and precedes effects", () => {
    const layer: SVGGElement | null = svg.querySelector(".hex-outline-layer");
    const root: SVGGElement | null = renderer.getViewportRoot();
    if (!layer || layer.parentNode !== root || layer.getAttribute("pointer-events") !== "none"
      || layer.getAttribute("aria-hidden") !== "true" || layer.children.length !== 3) throw new Error("Missing passive tactical outline layer.");
    const children: Element[] = Array.from(root?.children ?? []);
    if (children.indexOf(layer) <= children.map((child: Element): boolean => child.classList.contains("hex-cell")).lastIndexOf(true)
      || children.indexOf(layer) >= children.findIndex((child: Element): boolean => child.classList.contains("combat-effects-layer"))) {
      throw new Error("Tactical outlines must paint after terrain and before combat effects.");
    }
    for (const key of ["0,0", "1,0", "2,0"]) {
      const points: string | null = svg.querySelector(`[data-hex="${key}"] .hex-tile`)?.getAttribute("points") ?? null;
      if (outline(key)?.querySelector(".hex-outline-core")?.getAttribute("points") !== points) throw new Error("Outline must reuse canonical hex points.");
    }
    if (!outline("0,0")?.classList.contains("move-option-highlight") || !outline("1,0")?.classList.contains("attack-target-highlight")
      || !outline("2,0")?.classList.contains("is-selected")) throw new Error("Visible outlines did not receive existing target state.");
  });
  const rootBefore: SVGGElement | null = renderer.getViewportRoot();
  await When("the terrain rerenders while the commander retains the same targets", () => renderer.render(svg, canvas, scenario));
  await Then("the existing viewport and target borders survive without duplicate layers", () => {
    if (renderer.getViewportRoot() !== rootBefore || svg.querySelectorAll(".hex-outline-layer").length !== 1
      || !outline("0,0")?.classList.contains("move-option-highlight") || !outline("1,0")?.classList.contains("attack-target-highlight")
      || !outline("2,0")?.classList.contains("is-selected")) throw new Error("Rerender lost tactical border state or camera ownership.");
  });
  await When("the commander changes selection and clears legal targets", () => {
    renderer.applyHexSelection("0,0");
    renderer.clearTacticalHighlights();
    renderer.setZoneHighlights(["1,0"]);
    renderer.toggleIdleUnitHighlight("2,0", true);
    renderer.setInitiativeGroupHighlights(["2,0"]);
    renderer.render(svg, canvas, scenario);
  });
  await Then("old borders clear and all remaining highlight kinds mirror their real hex", () => {
    if (outline("2,0")?.classList.contains("is-selected") || outline("1,0")?.classList.contains("attack-target-highlight")
      || outline("0,0")?.classList.contains("move-option-highlight") || !outline("0,0")?.classList.contains("is-selected")
      || !outline("1,0")?.classList.contains("deployment-zone") || !outline("2,0")?.classList.contains("idle-unit-highlight")
      || !outline("2,0")?.classList.contains("initiative-group-highlight")) throw new Error("Stale or missing tactical outline state.");
    renderer.clearSelectionHighlight();
    renderer.clearIdleUnitHighlights();
    renderer.clearInitiativeGroupHighlights();
    renderer.setZoneHighlights([]);
    if (svg.querySelector(".hex-outline-cell.is-selected, .hex-outline-cell.deployment-zone, .hex-outline-cell.idle-unit-highlight, .hex-outline-cell.initiative-group-highlight")) {
      throw new Error("Cleared tactical borders must stop painting.");
    }
    canvas.remove();
  });
});

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
      facing: "SE",
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
      facing: "NW",
      suppressedBy: ["enemy-a", "enemy-b"]
    }, "Player");
  });

  await Then("the map displays the battlefield status badge, entrenchment pips, and hex modification overlay", async () => {
    const modification = svg.querySelector('[data-modification-type="fortifications"]');
    if (!modification) {
      throw new Error("Expected fortification overlay to render on the modified hex.");
    }
    if (modification.getAttribute("data-modification-facing") !== "SE") {
      throw new Error(`Expected fortification overlay to retain its edge facing, received '${modification.getAttribute("data-modification-facing")}'.`);
    }
    const fortificationPanels = svg.querySelectorAll('[data-modification-type="fortifications"] rect[fill="#050607"][fill-opacity="0.2"][stroke="#050607"]');
    if (fortificationPanels.length !== 3) {
      throw new Error(`Expected directional fortification overlay to render three outlined black panel segments, received ${fortificationPanels.length}.`);
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
      facing: "NW",
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

registerTest("HEXMAP_RENDERER_SHOWS_AND_CLEARS_TACTICAL_RECOVERY_SITES", async ({ Given, When, Then }) => {
  const viewport = document.createElement("div");
  Object.defineProperty(viewport, "clientWidth", { value: 320, configurable: true });
  Object.defineProperty(viewport, "clientHeight", { value: 220, configurable: true });
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  viewport.appendChild(canvas);
  document.body.appendChild(viewport);

  const scenario: ScenarioData = {
    name: "Recovery Marker",
    size: { cols: 1, rows: 1 },
    tilePalette: {
      PLAINS: { terrain: "plains", terrainType: "grass", density: "average", features: [], recon: "intel" }
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

  await Given("a rendered battlefield hex with casualties and equipment awaiting support", async () => {
    renderer.render(svg as SVGSVGElement, canvas as HTMLDivElement, scenario);
  });
  await When("the recovery-site overlay is rendered and later refreshed away", async () => {
    renderer.renderRecoverySiteMarker("0,0", {
      personnel: 12,
      equipment: 3,
      tooltip: "Recovery site awaiting medical and maintenance support"
    });
  });
  await Then("the hex carries an explicit counted marker that the renderer can clear", async () => {
    const marker = svg.querySelector<SVGGElement>('g.recovery-site-marker[data-recovery-site="0,0"]');
    if (!marker || marker.textContent?.includes("✚12 ⚙3") !== true
      || marker.querySelector("title")?.textContent !== "Recovery site awaiting medical and maintenance support") {
      throw new Error("Expected the recovery marker to show both casualty categories and its support-routing description.");
    }
    renderer.clearRecoverySiteMarkers();
    if (svg.querySelector("g.recovery-site-marker")) {
      throw new Error("Expected recovery marker refresh to remove stale site indicators.");
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
    // DOM structure: g.unit-stack > g.unit-stack-formation > g.unit-stack-facing
    const facingGroup = svg.querySelector<SVGGElement>("g.unit-stack > g.unit-stack-formation > g.unit-stack-facing");
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

registerTest("HEXMAP_RENDERER_SHOWS_TWO_STACKED_FORMATIONS_WITH_DISTINCT_SPRITE_LAYOUTS", async ({ Given, When, Then }) => {
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
    name: "Stacked Formations",
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

  await When("two full-strength formations share the same hex", async () => {
    renderer.renderUnitStack("0,0", [
      {
        unit: {
          type: "Infantry_42" as never,
          hex: { q: 0, r: 0 },
          strength: 100,
          experience: 0,
          ammo: 6,
          fuel: 0,
          entrench: 0,
          facing: "NE"
        },
        faction: "Player"
      },
      {
        unit: {
          type: "Engineer" as never,
          hex: { q: 0, r: 0 },
          strength: 100,
          experience: 0,
          ammo: 6,
          fuel: 0,
          entrench: 0,
          facing: "SW"
        },
        faction: "Ally"
      }
    ]);
  });

  await Then("the renderer draws two formation groups with scaled non-overlapping sprite positions", async () => {
    const stack = svg.querySelector<SVGGElement>("g.unit-stack[data-stack-count='2']");
    if (!stack) {
      throw new Error("Expected the hex to render as a two-formation stack.");
    }

    const formationGroups = Array.from(stack.querySelectorAll<SVGGElement>(":scope > g.unit-stack-formation"));
    if (formationGroups.length !== 2) {
      throw new Error(`Expected two formation groups, received ${formationGroups.length}.`);
    }

    const images = Array.from(stack.querySelectorAll<SVGImageElement>("image.unit-icon"));
    if (images.length !== 8) {
      throw new Error(`Expected eight scaled sprite images for two full-strength formations, received ${images.length}.`);
    }

    const distinctPositions = new Set(
      images.map((image) => `${image.getAttribute("x")},${image.getAttribute("y")}`)
    );
    if (distinctPositions.size < 8) {
      throw new Error(`Expected stacked sprites to occupy distinct positions, received ${distinctPositions.size} unique placements.`);
    }

    const scales = new Set(images.map((image) => image.getAttribute("width")));
    if (scales.has("26.4")) {
      throw new Error("Expected stacked formations to scale down below the normal four-sprite unit width.");
    }

    viewport.remove();
  });
});
