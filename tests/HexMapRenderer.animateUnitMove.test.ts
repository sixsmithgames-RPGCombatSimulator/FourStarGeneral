import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer";
import { SpriteSheetAnimator } from "../src/rendering/SpriteSheetAnimator";
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
      facing: "NW"
    }, "Player");
    renderer.renderUnit("1,0", {
      type: "Infantry" as never,
      hex: { q: 1, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 6,
      fuel: 0,
      entrench: 0,
      facing: "NW"
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

registerTest("HEXMAP_PRIME_UNIT_MOVE_INTO_OCCUPIED_HEX_GHOSTS_SOURCE_UNIT", async ({ Given, When, Then }) => {
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
    name: "Occupied Move Animation Harness",
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
  let moveHandle: { dispose(): void } | null = null;

  await Given("a source unit and a different unit already parked on the destination hex", async () => {
    renderer.render(svg as SVGSVGElement, canvas as HTMLDivElement, scenario);
    renderer.renderUnit("0,0", {
      unitId: "moving-unit",
      type: "Infantry" as never,
      hex: { q: 0, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 6,
      fuel: 0,
      entrench: 0,
      facing: "NW"
    }, "Player");
    renderer.renderUnit("1,0", {
      unitId: "parked-unit",
      type: "Infantry" as never,
      hex: { q: 1, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 6,
      fuel: 0,
      entrench: 0,
      facing: "NW"
    }, "Player");
  });

  await When("the move animation is primed into the occupied destination", async () => {
    moveHandle = renderer.primeUnitMove("0,0", "1,0");
  });

  await Then("the ghost uses the source unit while the parked destination unit remains visible", async () => {
    if (!moveHandle) {
      throw new Error("Expected move animation to be primed.");
    }

    const ghost = svg.querySelector<SVGGElement>("g.unit-move-ghost");
    if (!ghost) {
      throw new Error("Expected a movement ghost to be created.");
    }

    const ghostUnitIds = [
      ghost.dataset.unitId,
      ...Array.from(ghost.querySelectorAll<SVGGElement>("[data-unit-id]")).map((node) => node.dataset.unitId)
    ].filter((unitId): unitId is string => Boolean(unitId));
    if (!ghostUnitIds.includes("moving-unit")) {
      throw new Error(`Expected ghost to clone the source unit, received ids: ${ghostUnitIds.join(",") || "<none>"}.`);
    }
    if (ghostUnitIds.includes("parked-unit")) {
      throw new Error("Expected parked destination unit not to be cloned as the movement ghost.");
    }

    const movingStack = svg.querySelector<SVGGElement>("[data-hex='0,0'] g.unit-stack");
    const movingFormation = svg.querySelector<SVGGElement>("[data-hex='0,0'] [data-unit-id='moving-unit']");
    const movingHidden = movingStack?.style.opacity === "0" || movingFormation?.style.opacity === "0";
    if (!movingHidden) {
      throw new Error("Expected the source unit to be hidden while its ghost is moving.");
    }

    const parkedStack = svg.querySelector<SVGGElement>("[data-hex='1,0'] g.unit-stack");
    const parkedFormation = svg.querySelector<SVGGElement>("[data-hex='1,0'] [data-unit-id='parked-unit']");
    if (!parkedStack || !parkedFormation) {
      throw new Error("Expected the parked destination unit to remain on the destination hex.");
    }
    if (parkedStack.style.opacity === "0" || parkedFormation.style.opacity === "0") {
      throw new Error("Expected the parked destination unit to stay visible during the move animation.");
    }

    moveHandle.dispose();

    const ghostCount = svg.querySelectorAll(".unit-move-ghost").length;
    if (ghostCount !== 0) {
      throw new Error(`Expected zero ghost sprites after disposing primed move, found ${ghostCount}.`);
    }
    if (movingStack?.style.opacity === "0" || movingFormation?.style.opacity === "0") {
      throw new Error("Expected source unit opacity to be restored after disposing primed move.");
    }

    viewport.remove();
  });
});

registerTest("HEXMAP_ANIMATE_UNIT_MOVE_TO_EMPTY_HEX_COMMITS_DESTINATION_STACK", async ({ Given, When, Then }) => {
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
    name: "Empty Destination Move Harness",
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
  const rafCallbacks: RafCallback[] = [];
  const originalRaf = window.requestAnimationFrame;

  await Given("a rendered map where the destination hex is empty", async () => {
    renderer.render(svg as SVGSVGElement, canvas as HTMLDivElement, scenario);
    renderer.renderUnit("0,0", {
      unitId: "moving-unit",
      type: "Infantry" as never,
      hex: { q: 0, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 6,
      fuel: 0,
      entrench: 0,
      facing: "NW"
    }, "Player");
  });

  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  };

  await When("animateUnitMove completes into the empty destination hex", async () => {
    const animation = renderer.animateUnitMove("0,0", "1,0", 200);
    let timestamp = performance.now();
    while (rafCallbacks.length > 0) {
      const cb = rafCallbacks.shift();
      if (!cb) {
        break;
      }
      timestamp += 50;
      cb(timestamp);
    }
    await animation;
    window.requestAnimationFrame = originalRaf;
  });

  await Then("the unit remains committed on the destination instead of snapping back to origin", async () => {
    const ghostCount = svg.querySelectorAll(".unit-move-ghost").length;
    if (ghostCount !== 0) {
      throw new Error(`Expected zero ghost sprites after movement, found ${ghostCount}.`);
    }

    const originStack = svg.querySelector<SVGGElement>("[data-hex='0,0'] g.unit-stack");
    if (originStack) {
      throw new Error("Expected origin stack to be removed after committing the move to an empty destination.");
    }

    const destinationStack = svg.querySelector<SVGGElement>("[data-hex='1,0'] g.unit-stack");
    if (!destinationStack) {
      throw new Error("Expected destination stack to exist after movement.");
    }
    if (destinationStack.style.opacity === "0") {
      throw new Error("Expected destination stack to be visible after movement completes.");
    }

    viewport.remove();
  });
});

registerTest("HEXMAP_PRIME_UNIT_MOVE_MOVES_SELECTED_STACK_MEMBER_TO_EMPTY_HEX", async ({ Given, When, Then }) => {
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
    name: "Stack Member Move Harness",
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
  let moveHandle: { play(durationMs: number): Promise<void>; dispose(): void } | null = null;

  await Given("a stacked source hex and an empty destination", async () => {
    renderer.render(svg as SVGSVGElement, canvas as HTMLDivElement, scenario);
    renderer.renderUnitStack("0,0", [
      {
        unit: {
          unitId: "moving-unit",
          type: "Infantry" as never,
          hex: { q: 0, r: 0 },
          strength: 12,
          experience: 0,
          ammo: 6,
          fuel: 0,
          entrench: 0,
          facing: "NW"
        },
        faction: "Player"
      },
      {
        unit: {
          unitId: "parked-unit",
          type: "Infantry" as never,
          hex: { q: 0, r: 0 },
          strength: 8,
          experience: 0,
          ammo: 6,
          fuel: 0,
          entrench: 0,
          facing: "NW"
        },
        faction: "Player"
      }
    ]);
  });

  await When("the selected stack member is animated into an empty destination", async () => {
    moveHandle = renderer.primeUnitMove("0,0", "1,0", { unitId: "moving-unit" });
    if (!moveHandle) {
      throw new Error("Expected stack-member move animation to be primed.");
    }
    await moveHandle.play(0);
    moveHandle.dispose();
  });

  await Then("the destination keeps the moving member while the origin keeps the parked member", async () => {
    const ghostCount = svg.querySelectorAll(".unit-move-ghost").length;
    if (ghostCount !== 0) {
      throw new Error(`Expected zero ghost sprites after stack-member move, found ${ghostCount}.`);
    }

    const destinationMoving = svg.querySelector<SVGGElement>("[data-hex='1,0'] [data-unit-id='moving-unit']");
    if (!destinationMoving) {
      throw new Error("Expected selected moving unit to appear at destination.");
    }
    if (destinationMoving.style.opacity === "0") {
      throw new Error("Expected selected moving unit to be visible at destination.");
    }

    const destinationParked = svg.querySelector<SVGGElement>("[data-hex='1,0'] [data-unit-id='parked-unit']");
    if (destinationParked) {
      throw new Error("Expected parked source unit not to be cloned into destination.");
    }

    const originParked = svg.querySelector<SVGGElement>("[data-hex='0,0'] [data-unit-id='parked-unit']");
    if (!originParked || originParked.style.opacity === "0") {
      throw new Error("Expected parked source unit to remain visible at origin.");
    }

    const originMoving = svg.querySelector<SVGGElement>("[data-hex='0,0'] [data-unit-id='moving-unit']");
    if (originMoving && originMoving.style.opacity !== "0") {
      throw new Error("Expected moved stack member not to remain visibly parked at origin.");
    }

    viewport.remove();
  });
});

registerTest("HEXMAP_ANIMATE_UNIT_MOVE_FOLLOWS_PROVIDED_HEX_PATH", async ({ Given, When, Then }) => {
  const viewport = document.createElement("div");
  viewport.style.width = "360px";
  viewport.style.height = "260px";
  viewport.style.overflow = "hidden";
  Object.defineProperty(viewport, "clientWidth", { value: 360, configurable: true });
  Object.defineProperty(viewport, "clientHeight", { value: 260, configurable: true });

  const canvas = document.createElement("div");
  canvas.id = "battleMapCanvas";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "battleHexMap";

  canvas.appendChild(svg);
  viewport.appendChild(canvas);
  document.body.appendChild(viewport);

  const scenario: ScenarioData = {
    name: "Path Animation Harness",
    size: { cols: 2, rows: 2 },
    tilePalette: {
      PLAINS: {
        terrain: "plains",
        terrainType: "grass",
        density: "average",
        features: [],
        recon: "intel"
      }
    },
    tiles: [
      [{ tile: "PLAINS" }, { tile: "PLAINS" }],
      [{ tile: "PLAINS" }, { tile: "PLAINS" }]
    ],
    objectives: [],
    turnLimit: 1,
    sides: {
      Player: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] },
      Bot: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] }
    }
  };

  const renderer = new HexMapRenderer();
  const rafCallbacks: RafCallback[] = [];
  const originalRaf = window.requestAnimationFrame;
  let sampledGhostCenter: { x: number; y: number } | null = null;
  let viaCenter: { x: number; y: number } | null = null;
  let directMidpoint: { x: number; y: number } | null = null;

  await Given("a rendered map with a dogleg movement route", async () => {
    renderer.render(svg as SVGSVGElement, canvas as HTMLDivElement, scenario);
    renderer.renderUnit("0,0", {
      type: "Infantry" as never,
      hex: { q: 0, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 6,
      fuel: 0,
      entrench: 0,
      facing: "NW"
    }, "Player");
    renderer.renderUnit("1,1", {
      type: "Infantry" as never,
      hex: { q: 1, r: 1 },
      strength: 10,
      experience: 0,
      ammo: 6,
      fuel: 0,
      entrench: 0,
      facing: "NW"
    }, "Player");

    const startCell = svg.querySelector<SVGGElement>("[data-hex='0,0']");
    const viaCell = svg.querySelector<SVGGElement>("[data-hex='0,1']");
    const endCell = svg.querySelector<SVGGElement>("[data-hex='1,1']");
    if (!startCell || !viaCell || !endCell) {
      throw new Error("Expected all path hexes to render.");
    }

    const readCenter = (cell: SVGGElement): { x: number; y: number } => ({
      x: Number(cell.dataset.cx),
      y: Number(cell.dataset.cy)
    });
    const startCenter = readCenter(startCell);
    viaCenter = readCenter(viaCell);
    const endCenter = readCenter(endCell);
    directMidpoint = {
      x: (startCenter.x + endCenter.x) / 2,
      y: (startCenter.y + endCenter.y) / 2
    };
  });

  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  };

  await When("the move animation reaches the midpoint of the supplied dogleg path", async () => {
    const animation = renderer.animateUnitMove("0,0", "1,1", 1000, {
      path: ["0,0", "0,1", "1,1"]
    });

    const firstFrame = rafCallbacks.shift();
    if (!firstFrame) {
      throw new Error("Expected movement animation to schedule a frame.");
    }
    firstFrame(performance.now() + 500);

    const ghostGroup = svg.querySelector<SVGGElement>("g.unit-move-ghost");
    const ghostImage = ghostGroup?.querySelector<SVGImageElement>("image.unit-icon") ?? null;
    if (!ghostGroup || !ghostImage) {
      throw new Error("Expected a movement ghost to be present during animation.");
    }
    const translateMatch = ghostGroup.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
    const translateX = translateMatch ? Number(translateMatch[1]) : 0;
    const translateY = translateMatch ? Number(translateMatch[2]) : 0;
    sampledGhostCenter = {
      x: Number(ghostImage.getAttribute("x")) + Number(ghostImage.getAttribute("width")) / 2 + translateX,
      y: Number(ghostImage.getAttribute("y")) + Number(ghostImage.getAttribute("height")) / 2 + translateY
    };

    while (rafCallbacks.length > 0) {
      const cb = rafCallbacks.shift();
      if (!cb) break;
      cb(performance.now() + 1200);
    }

    await animation;
    window.requestAnimationFrame = originalRaf;
  });

  await Then("the ghost samples the intermediate hex instead of the direct midpoint", async () => {
    if (!sampledGhostCenter || !viaCenter || !directMidpoint) {
      throw new Error("Missing midpoint sampling data.");
    }

    const distanceToVia = Math.hypot(sampledGhostCenter.x - viaCenter.x, sampledGhostCenter.y - viaCenter.y);
    const distanceToDirect = Math.hypot(sampledGhostCenter.x - directMidpoint.x, sampledGhostCenter.y - directMidpoint.y);
    if (distanceToVia > 35) {
      throw new Error(`Expected ghost to be near route midpoint, distance was ${distanceToVia.toFixed(2)}.`);
    }
    if (distanceToDirect < 35) {
      throw new Error(`Expected ghost to avoid the direct midpoint, distance was ${distanceToDirect.toFixed(2)}.`);
    }

    const ghostCount = svg.querySelectorAll(".unit-move-ghost").length;
    if (ghostCount !== 0) {
      throw new Error(`Expected zero ghost sprites after path animation, found ${ghostCount}`);
    }

    viewport.remove();
  });
});

registerTest("HEXMAP_RENDER_REUSES_COMBAT_ANIMATOR_WHEN_EFFECTS_LAYER_IS_PRESERVED", async ({ Given, When, Then }) => {
  const viewport = document.createElement("div");
  viewport.style.width = "320px";
  viewport.style.height = "220px";
  viewport.style.overflow = "hidden";
  Object.defineProperty(viewport, "clientWidth", { value: 320, configurable: true });
  Object.defineProperty(viewport, "clientHeight", { value: 220, configurable: true });

  const canvas = document.createElement("div");
  canvas.id = "battleMapCanvas";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "battleHexMap";

  canvas.appendChild(svg);
  viewport.appendChild(canvas);
  document.body.appendChild(viewport);

  const scenario: ScenarioData = {
    name: "Combat Animator Reuse Harness",
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
  let initialAnimator: unknown = null;
  let initialEffectsLayer: SVGGElement | null = null;
  let rerenderedAnimator: unknown = null;
  let rerenderedEffectsLayer: SVGGElement | null = null;

  await Given("a rendered map with an initialized combat effects layer", async () => {
    renderer.render(svg as SVGSVGElement, canvas as HTMLDivElement, scenario);
    initialAnimator = (renderer as unknown as { combatAnimator: unknown }).combatAnimator;
    initialEffectsLayer = (renderer as unknown as { combatEffectsLayer: SVGGElement | null }).combatEffectsLayer;
  });

  await When("the map re-renders while preserving the same effects layer node", async () => {
    renderer.render(svg as SVGSVGElement, canvas as HTMLDivElement, scenario);
    rerenderedAnimator = (renderer as unknown as { combatAnimator: unknown }).combatAnimator;
    rerenderedEffectsLayer = (renderer as unknown as { combatEffectsLayer: SVGGElement | null }).combatEffectsLayer;
  });

  await Then("the renderer reuses the same combat animator instance instead of resetting it", async () => {
    if (!initialEffectsLayer || !rerenderedEffectsLayer) {
      throw new Error("Expected combat effects layer to exist before and after re-render.");
    }
    if (initialEffectsLayer !== rerenderedEffectsLayer) {
      throw new Error("Expected HexMapRenderer to preserve the same combat effects layer DOM node across re-render.");
    }
    if (!initialAnimator || !rerenderedAnimator) {
      throw new Error("Expected combat animator to exist before and after re-render.");
    }
    if (initialAnimator !== rerenderedAnimator) {
      throw new Error("Expected HexMapRenderer to reuse the existing combat animator when the effects layer is preserved.");
    }

    viewport.remove();
  });
});

registerTest("HEXMAP_RENDERUNIT_REJECTS_MALFORMED_FACING_WITHOUT_CRASHING", async ({ Given, When, Then }) => {
  const viewport = document.createElement("div");
  viewport.style.width = "300px";
  viewport.style.height = "200px";
  Object.defineProperty(viewport, "clientWidth", { value: 300, configurable: true });
  Object.defineProperty(viewport, "clientHeight", { value: 200, configurable: true });

  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  viewport.appendChild(canvas);
  document.body.appendChild(viewport);

  const scenario: ScenarioData = {
    name: "Facing Guard Harness",
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

  await Given("a rendered map", async () => {
    renderer.render(svg as SVGSVGElement, canvas as HTMLDivElement, scenario);
  });

  let thrown: unknown = null;
  await When("a unit render request carries a malformed facing value", async () => {
    try {
      renderer.renderUnit("0,0", {
        type: "Infantry" as never,
        hex: { q: 0, r: 0 },
        strength: 10,
        experience: 0,
        ammo: 6,
        fuel: 0,
        entrench: 0,
        facing: "BROKEN" as unknown as "NW"
      }, "Player");
    } catch (error) {
      thrown = error;
    }
  });

  await Then("the renderer keeps drawing the unit instead of throwing", async () => {
    if (thrown) {
      throw new Error(`Expected malformed facing to be tolerated, received ${String(thrown)}`);
    }
    const unit = svg.querySelector("g.unit-stack");
    if (!unit) {
      throw new Error("Expected the unit stack to render despite malformed facing input.");
    }
    viewport.remove();
  });
});

registerTest("HEXMAP_DIRECT_FIRE_ATTACK_SPAWNS_ONE_CENTERED_IMPACT_HIT", async ({ Given, When, Then }) => {
  const renderer = new HexMapRenderer() as unknown as {
    playAttackSequence(attackerHexKey: string, defenderHexKey: string, targetIsHardTarget: boolean): Promise<void>;
    hexElementMap: Map<string, unknown>;
    extractHexCenter: (element: unknown) => { cx: number; cy: number } | null;
    setHexFacingAngle: (hexKey: string, cx: number, cy: number, angle: number) => void;
    getUnitClassAt: (hexKey: string) => string | undefined;
    getUnitScenarioTypeAt: (hexKey: string) => string | undefined;
    isSmallArmsAttack: (hexKey: string) => boolean;
    isArcingArtilleryAttack: (hexKey: string) => boolean;
    isAirStrafingAttack: (hexKey: string) => boolean;
    isAirBombingAttack: (hexKey: string) => boolean;
    playFlashOverlay: () => Promise<void>;
    playMuzzleFlash: () => Promise<void>;
    playTargetMarker: () => Promise<void>;
    playRecoilNudge: () => Promise<void>;
    playHitShake: () => Promise<void>;
    playSparkBurst: () => Promise<void>;
    playDustCloudLinger: () => Promise<void>;
    playProjectileTracer: () => Promise<void>;
  } & {
    playCombatAnimation: (animationType: string, hexKey: string, offsetX?: number, offsetY?: number, scale?: number) => Promise<void>;
  };

  const combatCalls: Array<{ animationType: string; hexKey: string; offsetX: number; offsetY: number; scale: number }> = [];

  await Given("a direct-fire renderer path with all non-impact visuals stubbed", async () => {
    renderer.hexElementMap.set("0,0", {});
    renderer.hexElementMap.set("1,0", {});
    renderer.extractHexCenter = () => ({ cx: 100, cy: 100 });
    renderer.setHexFacingAngle = () => {};
    renderer.getUnitClassAt = (hexKey) => (hexKey === "0,0" ? "vehicle" : "infantry");
    renderer.getUnitScenarioTypeAt = () => "Recon_ArmoredCar";
    renderer.isSmallArmsAttack = () => false;
    renderer.isArcingArtilleryAttack = () => false;
    renderer.isAirStrafingAttack = () => false;
    renderer.isAirBombingAttack = () => false;
    renderer.playFlashOverlay = async () => {};
    renderer.playMuzzleFlash = async () => {};
    renderer.playTargetMarker = async () => {};
    renderer.playRecoilNudge = async () => {};
    renderer.playHitShake = async () => {};
    renderer.playSparkBurst = async () => {};
    renderer.playDustCloudLinger = async () => {};
    renderer.playProjectileTracer = async () => {};
    renderer.playCombatAnimation = async (animationType, hexKey, offsetX = 0, offsetY = 0, scale = 1) => {
      combatCalls.push({ animationType, hexKey, offsetX, offsetY, scale });
    };
  });

  await When("the attack sequence reaches its direct-fire impact branch", async () => {
    await renderer.playAttackSequence("0,0", "1,0", false);
  });

  await Then("it schedules direct-fire combat animations targeting defender", async () => {
    // Direct-fire attacks use weapon-specific animations (mg, cannon, small_arms), not impactHits
    // impactHits is reserved for armor spark burst effects on hard targets
    const directFireCalls = combatCalls.filter((call) =>
      ["mg", "cannon", "small_arms"].includes(call.animationType)
    );
    if (directFireCalls.length === 0) {
      throw new Error(`Expected at least one direct-fire combat animation (mg/cannon/small_arms), found none. Available calls: ${combatCalls.map(c => c.animationType).join(", ")}`);
    }

    // Verify animations target the defender hex
    const defenderCalls = directFireCalls.filter((call) => call.hexKey === "1,0");
    if (defenderCalls.length === 0) {
      throw new Error(`Expected direct-fire animations to target defender hex 1,0, none found.`);
    }
  });
});

registerTest("HEXMAP_INFANTRY_ATTACK_USES_MIXED_WEAPON_VISUAL_LAYERS", async ({ Given, When, Then }) => {
  const renderer = new HexMapRenderer() as unknown as {
    playAttackSequence(attackerHexKey: string, defenderHexKey: string, targetIsHardTarget: boolean): Promise<void>;
    hexElementMap: Map<string, unknown>;
    extractHexCenter: (element: unknown) => { cx: number; cy: number } | null;
    setHexFacingAngle: (hexKey: string, cx: number, cy: number, angle: number) => void;
    getUnitClassAt: (hexKey: string) => string | undefined;
    getUnitScenarioTypeAt: (hexKey: string) => string | undefined;
    isSmallArmsAttack: (hexKey: string) => boolean;
    isArcingArtilleryAttack: (hexKey: string) => boolean;
    isAirStrafingAttack: (hexKey: string) => boolean;
    isAirBombingAttack: (hexKey: string) => boolean;
    playFlashOverlay: () => Promise<void>;
    playMuzzleFlash: () => Promise<void>;
    playTargetMarker: () => Promise<void>;
    playRecoilNudge: () => Promise<void>;
    playHitShake: () => Promise<void>;
    playSparkBurst: () => Promise<void>;
    playDustCloudLinger: () => Promise<void>;
    playProjectileTracer: (
      attackerHexKey: string,
      defenderHexKey: string,
      durationMs?: number,
      options?: { style?: { color: string; width: number }; jitterPx?: number; segLenScalar?: number }
    ) => Promise<void>;
    playArcedProjectile: (
      attackerHexKey: string,
      defenderHexKey: string,
      durationMs?: number,
      options?: { targetOffsetX?: number; targetOffsetY?: number }
    ) => Promise<void>;
  } & {
    playCombatAnimation: (animationType: string, hexKey: string, offsetX?: number, offsetY?: number, scale?: number) => Promise<void>;
  };

  const tracerCalls: Array<{ width: number; color: string; durationMs: number; jitterPx: number; segLenScalar: number }> = [];
  const combatCalls: Array<{ animationType: string; hexKey: string; offsetX: number; offsetY: number; scale: number }> = [];
  const arcedCalls: Array<{ durationMs: number; offsetX: number; offsetY: number }> = [];
  const originalSetTimeout = window.setTimeout;

  await Given("an infantry battalion attacking armor with mixed weapon-model visuals enabled", async () => {
    window.setTimeout = ((handler: TimerHandler, _timeout?: number, ...args: unknown[]) => {
      if (typeof handler === "function") {
        handler(...args);
      }
      return 0 as unknown as number;
    }) as typeof window.setTimeout;
    renderer.hexElementMap.set("0,0", {});
    renderer.hexElementMap.set("1,0", {});
    renderer.extractHexCenter = () => ({ cx: 100, cy: 100 });
    renderer.setHexFacingAngle = () => {};
    renderer.getUnitClassAt = (hexKey) => (hexKey === "0,0" ? "infantry" : "tank");
    renderer.getUnitScenarioTypeAt = (hexKey) => (hexKey === "0,0" ? "Infantry_42" : "Medium_Tank");
    renderer.isSmallArmsAttack = () => true;
    renderer.isArcingArtilleryAttack = () => false;
    renderer.isAirStrafingAttack = () => false;
    renderer.isAirBombingAttack = () => false;
    renderer.playFlashOverlay = async () => {};
    renderer.playMuzzleFlash = async () => {};
    renderer.playTargetMarker = async () => {};
    renderer.playRecoilNudge = async () => {};
    renderer.playHitShake = async () => {};
    renderer.playSparkBurst = async () => {};
    renderer.playDustCloudLinger = async () => {};
    renderer.playProjectileTracer = async (_attackerHexKey, _defenderHexKey, durationMs = 0, options = {}) => {
      tracerCalls.push({
        width: options.style?.width ?? 0,
        color: options.style?.color ?? "",
        durationMs,
        jitterPx: options.jitterPx ?? 0,
        segLenScalar: options.segLenScalar ?? 0
      });
    };
    renderer.playArcedProjectile = async (_attackerHexKey, _defenderHexKey, durationMs = 0, options = {}) => {
      arcedCalls.push({
        durationMs,
        offsetX: options.targetOffsetX ?? 0,
        offsetY: options.targetOffsetY ?? 0
      });
    };
    renderer.playCombatAnimation = async (animationType, hexKey, offsetX = 0, offsetY = 0, scale = 1) => {
      combatCalls.push({ animationType, hexKey, offsetX, offsetY, scale });
    };
  });

  await When("the infantry attack sequence plays", async () => {
    await renderer.playAttackSequence("0,0", "1,0", true);
  });

  window.setTimeout = originalSetTimeout;

  await Then("it layers thin rifle fire, MG bursts, and small support-weapon impacts", async () => {
    if (tracerCalls.length < 7) {
      throw new Error(`Expected layered infantry tracer fire, found ${tracerCalls.length} tracer calls.`);
    }

    const tracerWidths = new Set(tracerCalls.map((call) => call.width));
    if (tracerWidths.size < 3) {
      throw new Error(`Expected at least three tracer widths for rifle/MG/launcher fire, found ${tracerWidths.size}.`);
    }
    if (Math.max(...tracerCalls.map((call) => call.width)) > 1.1) {
      throw new Error(`Expected infantry tracers to stay thin, received widths ${tracerCalls.map((call) => call.width).join(", ")}.`);
    }
    if (!tracerCalls.some((call) => call.width <= 0.55) || !tracerCalls.some((call) => call.width >= 1.0)) {
      throw new Error("Expected both rifle-thin tracers and a distinct launcher trace.");
    }

    const supportExplosions = combatCalls.filter((call) => call.animationType === "explosionSmall");
    if (supportExplosions.length < 1) {
      throw new Error(`Expected small mortar/grenade support impacts, saw ${combatCalls.map((call) => call.animationType).join(", ")}.`);
    }
    if (supportExplosions.some((call) => call.scale > 0.55)) {
      throw new Error(`Expected infantry support explosions to stay small, received scales ${supportExplosions.map((call) => call.scale).join(", ")}.`);
    }

    if (combatCalls.some((call) => call.animationType === "explosionLarge")) {
      throw new Error("Expected infantry mixed fire to avoid large explosion effects.");
    }
    if (arcedCalls.length < 1) {
      throw new Error("Expected at least one arced support-weapon projectile for infantry mortars/grenades.");
    }
    if (!supportExplosions.every((call) => call.hexKey === "1,0")) {
      throw new Error("Expected infantry support impacts to target the defender hex.");
    }
  });
});

registerTest("HEXMAP_FLAK_88_USES_DIRECT_FIRE_CANNON_VISUALS", async ({ Given, When, Then }) => {
  const renderer = new HexMapRenderer() as unknown as {
    playAttackSequence(attackerHexKey: string, defenderHexKey: string, targetIsHardTarget: boolean): Promise<void>;
    hexElementMap: Map<string, unknown>;
    extractHexCenter: (element: unknown) => { cx: number; cy: number } | null;
    setHexFacingAngle: (hexKey: string, cx: number, cy: number, angle: number) => void;
    getUnitClassAt: (hexKey: string) => string | undefined;
    getUnitScenarioTypeAt: (hexKey: string) => string | undefined;
    playFlashOverlay: () => Promise<void>;
    playMuzzleFlash: () => Promise<void>;
    playTargetMarker: () => Promise<void>;
    playRecoilNudge: () => Promise<void>;
    playHitShake: () => Promise<void>;
    playSparkBurst: () => Promise<void>;
    playDustCloudLinger: () => Promise<void>;
    playProjectileTracer: () => Promise<void>;
    playArcedProjectile: () => Promise<void>;
  } & {
    playCombatAnimation: (animationType: string, hexKey: string, offsetX?: number, offsetY?: number, scale?: number) => Promise<void>;
  };

  const combatCalls: Array<{ animationType: string; hexKey: string; offsetX: number; offsetY: number; scale: number }> = [];
  let arcedProjectileCalls = 0;
  const originalSetTimeout = window.setTimeout;

  await Given("a Flak 88 attack path with animation hooks stubbed", async () => {
    window.setTimeout = ((handler: TimerHandler, _timeout?: number, ...args: unknown[]) => {
      if (typeof handler === "function") {
        handler(...args);
      }
      return 0 as unknown as number;
    }) as typeof window.setTimeout;
    renderer.hexElementMap.set("0,0", {});
    renderer.hexElementMap.set("1,0", {});
    renderer.extractHexCenter = () => ({ cx: 100, cy: 100 });
    renderer.setHexFacingAngle = () => {};
    renderer.getUnitClassAt = (hexKey) => (hexKey === "0,0" ? "specialist" : "tank");
    renderer.getUnitScenarioTypeAt = (hexKey) => (hexKey === "0,0" ? "Flak_88" : "Medium_Tank");
    renderer.playFlashOverlay = async () => {};
    renderer.playMuzzleFlash = async () => {};
    renderer.playTargetMarker = async () => {};
    renderer.playRecoilNudge = async () => {};
    renderer.playHitShake = async () => {};
    renderer.playSparkBurst = async () => {};
    renderer.playDustCloudLinger = async () => {};
    renderer.playProjectileTracer = async () => {};
    renderer.playArcedProjectile = async () => {
      arcedProjectileCalls += 1;
    };
    renderer.playCombatAnimation = async (animationType, hexKey, offsetX = 0, offsetY = 0, scale = 1) => {
      combatCalls.push({ animationType, hexKey, offsetX, offsetY, scale });
    };
  });

  await When("the Flak 88 attack sequence plays", async () => {
    await renderer.playAttackSequence("0,0", "1,0", true);
  });

  window.setTimeout = originalSetTimeout;

  await Then("it stays on direct-fire cannon visuals and never uses the artillery arc branch", async () => {
    if (arcedProjectileCalls !== 0) {
      throw new Error(`Expected Flak 88 to avoid artillery arcs, found ${arcedProjectileCalls} arc calls.`);
    }

    // Flak 88 uses cannon animation type for direct-fire attacks, not impactHits
    const cannonCalls = combatCalls.filter((call) => call.animationType === "cannon");
    if (cannonCalls.length === 0) {
      throw new Error(`Expected at least one cannon animation for Flak 88, found none. Available calls: ${combatCalls.map(c => c.animationType).join(", ")}`);
    }

    const [cannonCall] = cannonCalls;
    if (!cannonCall || cannonCall.hexKey !== "1,0") {
      throw new Error(`Expected Flak 88 cannon animation to target defender hex 1,0, received ${JSON.stringify(cannonCall)}.`);
    }
  });
});

registerTest("HEXMAP_ARCING_ARTILLERY_ATTACK_SPAWNS_STAGGERED_SMALL_BURSTS", async ({ Given, When, Then }) => {
  const renderer = new HexMapRenderer() as unknown as {
    playAttackSequence(attackerHexKey: string, defenderHexKey: string, targetIsHardTarget: boolean): Promise<void>;
    hexElementMap: Map<string, unknown>;
    extractHexCenter: (element: unknown) => { cx: number; cy: number } | null;
    setHexFacingAngle: (hexKey: string, cx: number, cy: number, angle: number) => void;
    getUnitClassAt: (hexKey: string) => string | undefined;
    getUnitScenarioTypeAt: (hexKey: string) => string | undefined;
    isSmallArmsAttack: (hexKey: string) => boolean;
    isArcingArtilleryAttack: (hexKey: string) => boolean;
    isAirStrafingAttack: (hexKey: string) => boolean;
    isAirBombingAttack: (hexKey: string) => boolean;
    playFlashOverlay: () => Promise<void>;
    playMuzzleFlash: () => Promise<void>;
    playTargetMarker: () => Promise<void>;
    playRecoilNudge: () => Promise<void>;
    playHitShake: () => Promise<void>;
    playSparkBurst: () => Promise<void>;
    playDustCloudLinger: () => Promise<void>;
    playProjectileTracer: () => Promise<void>;
    playArcedProjectile: () => Promise<void>;
  } & {
    playCombatAnimation: (animationType: string, hexKey: string, offsetX?: number, offsetY?: number, scale?: number) => Promise<void>;
  };

  const combatCalls: Array<{ animationType: string; hexKey: string; offsetX: number; offsetY: number; scale: number }> = [];
  const originalSetTimeout = window.setTimeout;

  await Given("an arcing-artillery renderer path with all non-impact visuals stubbed", async () => {
    window.setTimeout = ((handler: TimerHandler, _timeout?: number, ...args: unknown[]) => {
      if (typeof handler === "function") {
        handler(...args);
      }
      return 0 as unknown as number;
    }) as typeof window.setTimeout;
    renderer.hexElementMap.set("0,0", {});
    renderer.hexElementMap.set("1,0", {});
    renderer.extractHexCenter = () => ({ cx: 100, cy: 100 });
    renderer.setHexFacingAngle = () => {};
    renderer.getUnitClassAt = (hexKey) => (hexKey === "0,0" ? "artillery" : "tank");
    renderer.getUnitScenarioTypeAt = (hexKey) => (hexKey === "0,0" ? "Howitzer_105" : "Medium_Tank");
    renderer.isSmallArmsAttack = () => false;
    renderer.isArcingArtilleryAttack = () => true;
    renderer.isAirStrafingAttack = () => false;
    renderer.isAirBombingAttack = () => false;
    renderer.playFlashOverlay = async () => {};
    renderer.playMuzzleFlash = async () => {};
    renderer.playTargetMarker = async () => {};
    renderer.playRecoilNudge = async () => {};
    renderer.playHitShake = async () => {};
    renderer.playSparkBurst = async () => {};
    renderer.playDustCloudLinger = async () => {};
    renderer.playProjectileTracer = async () => {};
    renderer.playArcedProjectile = async () => {};
    renderer.playCombatAnimation = async (animationType, hexKey, offsetX = 0, offsetY = 0, scale = 1) => {
      combatCalls.push({ animationType, hexKey, offsetX, offsetY, scale });
    };
  });

  await When("the attack sequence reaches its arcing-artillery impact branch", async () => {
    await renderer.playAttackSequence("0,0", "1,0", true);
  });

  window.setTimeout = originalSetTimeout;

  await Then("it schedules several smaller explosion bursts on the defender hex", async () => {
    const impactCalls = combatCalls.filter((call) => call.animationType === "explosionLarge" || call.animationType === "explosionSmall");
    if (impactCalls.length !== 4) {
      throw new Error(`Expected exactly four artillery explosion animations, found ${impactCalls.length}.`);
    }

    for (const impactCall of impactCalls) {
      if (impactCall.animationType !== "explosionSmall") {
        throw new Error(`Expected artillery burst to use explosionSmall, received ${impactCall.animationType}.`);
      }
      if (impactCall.hexKey !== "1,0") {
        throw new Error(`Expected artillery burst to target defender hex 1,0, received ${impactCall.hexKey}.`);
      }
    }

    const offsetImpacts = impactCalls.filter((call) => call.offsetX !== 0 || call.offsetY !== 0);
    if (offsetImpacts.length !== 4) {
      throw new Error(`Expected all artillery bursts to land off-center, found ${offsetImpacts.length} offset bursts.`);
    }

    const uniqueOffsets = new Set(offsetImpacts.map((call) => `${call.offsetX},${call.offsetY}`));
    if (uniqueOffsets.size !== 4) {
      throw new Error(`Expected four distinct artillery burst offsets, found ${uniqueOffsets.size}.`);
    }

    const spreadXs = offsetImpacts.map((call) => Math.abs(call.offsetX));
    const spreadYs = offsetImpacts.map((call) => Math.abs(call.offsetY));
    if (Math.max(...spreadXs) < 8 || Math.max(...spreadYs) < 8) {
      throw new Error("Expected artillery bursts to spread visibly away from the center of the hex.");
    }
  });
});

registerTest("HEXMAP_AIR_BOMBING_ATTACK_DROPS_STAGGERED_SMALL_BOMB_STICK", async ({ Given, When, Then }) => {
  const renderer = new HexMapRenderer() as unknown as {
    playAttackSequence(attackerHexKey: string, defenderHexKey: string, targetIsHardTarget: boolean): Promise<void>;
    hexElementMap: Map<string, unknown>;
    extractHexCenter: (element: unknown) => { cx: number; cy: number } | null;
    setHexFacingAngle: (hexKey: string, cx: number, cy: number, angle: number) => void;
    getUnitClassAt: (hexKey: string) => string | undefined;
    getUnitScenarioTypeAt: (hexKey: string) => string | undefined;
    isSmallArmsAttack: (hexKey: string) => boolean;
    isArcingArtilleryAttack: (hexKey: string) => boolean;
    isAirStrafingAttack: (hexKey: string) => boolean;
    isAirBombingAttack: (hexKey: string) => boolean;
    playFlashOverlay: () => Promise<void>;
    playMuzzleFlash: () => Promise<void>;
    playTargetMarker: () => Promise<void>;
    playRecoilNudge: () => Promise<void>;
    playHitShake: () => Promise<void>;
    playSparkBurst: () => Promise<void>;
    playDustCloudLinger: () => Promise<void>;
    playProjectileTracer: () => Promise<void>;
    playArcedProjectile: () => Promise<void>;
  } & {
    playCombatAnimation: (animationType: string, hexKey: string, offsetX?: number, offsetY?: number, scale?: number) => Promise<void>;
  };

  const combatCalls: Array<{ animationType: string; hexKey: string; offsetX: number; offsetY: number; scale: number }> = [];
  const originalSetTimeout = window.setTimeout;

  await Given("an air-bombing renderer path with all non-impact visuals stubbed", async () => {
    window.setTimeout = ((handler: TimerHandler, _timeout?: number, ...args: unknown[]) => {
      if (typeof handler === "function") {
        handler(...args);
      }
      return 0 as unknown as number;
    }) as typeof window.setTimeout;
    renderer.hexElementMap.set("0,0", {});
    renderer.hexElementMap.set("1,0", {});
    renderer.extractHexCenter = () => ({ cx: 100, cy: 100 });
    renderer.setHexFacingAngle = () => {};
    renderer.getUnitClassAt = (hexKey) => (hexKey === "0,0" ? "air" : "tank");
    renderer.getUnitScenarioTypeAt = (hexKey) => (hexKey === "0,0" ? "Bomber" : "Medium_Tank");
    renderer.isSmallArmsAttack = () => false;
    renderer.isArcingArtilleryAttack = () => false;
    renderer.isAirStrafingAttack = () => false;
    renderer.isAirBombingAttack = () => true;
    renderer.playFlashOverlay = async () => {};
    renderer.playMuzzleFlash = async () => {};
    renderer.playTargetMarker = async () => {};
    renderer.playRecoilNudge = async () => {};
    renderer.playHitShake = async () => {};
    renderer.playSparkBurst = async () => {};
    renderer.playDustCloudLinger = async () => {};
    renderer.playProjectileTracer = async () => {};
    renderer.playArcedProjectile = async () => {};
    renderer.playCombatAnimation = async (animationType, hexKey, offsetX = 0, offsetY = 0, scale = 1) => {
      combatCalls.push({ animationType, hexKey, offsetX, offsetY, scale });
    };
  });

  await When("the attack sequence reaches its air-bombing impact branch", async () => {
    await renderer.playAttackSequence("0,0", "1,0", true);
  });

  window.setTimeout = originalSetTimeout;

  await Then("it schedules a staggered string of smaller bombing impacts", async () => {
    const impactCalls = combatCalls.filter((call) => call.animationType === "explosionLarge" || call.animationType === "explosionSmall");
    if (impactCalls.length !== 5) {
      throw new Error(`Expected five small bombing impact animations, found ${impactCalls.length}.`);
    }

    const largeExplosion = impactCalls.find((call) => call.animationType === "explosionLarge");
    if (largeExplosion) {
      throw new Error("Expected bomber impacts to avoid the oversized explosionLarge animation.");
    }

    const offCenterImpacts = impactCalls.filter((call) => call.offsetX !== 0 || call.offsetY !== 0);
    if (offCenterImpacts.length !== impactCalls.length) {
      throw new Error("Expected every bombing impact to land off-center within the target hex.");
    }

    const maxScale = Math.max(...impactCalls.map((call) => call.scale));
    if (maxScale > 1.05) {
      throw new Error(`Expected smaller bomb impacts at scale <= 1.05, received max scale ${maxScale}.`);
    }

    const distinctOffsets = new Set(impactCalls.map((call) => `${call.offsetX},${call.offsetY}`));
    if (distinctOffsets.size < 4) {
      throw new Error(`Expected bombing impacts to use a visible stick pattern, received ${distinctOffsets.size} distinct offsets.`);
    }

    const maxSpread = Math.max(...impactCalls.map((call) => Math.abs(call.offsetX)));
    if (maxSpread < 28) {
      throw new Error(`Expected bomb stick impacts to spread across the hex, received max x spread ${maxSpread}.`);
    }

    const wrongTarget = impactCalls.find((call) => call.hexKey !== "1,0");
    if (wrongTarget) {
      throw new Error(`Expected bombing impacts to target defender hex 1,0, received ${wrongTarget.hexKey}.`);
    }
  });
});

registerTest("HEXMAP_LARGE_BOMB_EXPLOSION_USES_SMALL_BOMB_STICK_IMPACTS", async ({ Given, When, Then }) => {
  const renderer = new HexMapRenderer() as unknown as {
    playExplosion(defenderHexKey: string, isLargeExplosion?: boolean): Promise<void>;
    getUnitClassAt: (hexKey: string) => string | undefined;
    playCombatAnimation: (animationType: string, hexKey: string, offsetX?: number, offsetY?: number, scale?: number) => Promise<void>;
  };

  const combatCalls: Array<{ animationType: string; hexKey: string; offsetX: number; offsetY: number; scale: number }> = [];
  const originalSetTimeout = window.setTimeout;

  await Given("a large bombing explosion request", async () => {
    window.setTimeout = ((handler: TimerHandler, _timeout?: number, ...args: unknown[]) => {
      if (typeof handler === "function") {
        handler(...args);
      }
      return 0 as unknown as number;
    }) as typeof window.setTimeout;
    renderer.getUnitClassAt = () => "tank";
    renderer.playCombatAnimation = async (animationType, hexKey, offsetX = 0, offsetY = 0, scale = 1) => {
      combatCalls.push({ animationType, hexKey, offsetX, offsetY, scale });
    };
  });

  await When("the large explosion helper plays the impact", async () => {
    await renderer.playExplosion("2,2", true);
  });

  window.setTimeout = originalSetTimeout;

  await Then("it uses multiple small offset impacts instead of one huge blast", async () => {
    const largeExplosion = combatCalls.find((call) => call.animationType === "explosionLarge");
    if (largeExplosion) {
      throw new Error("Expected playExplosion(true) to avoid explosionLarge for bomb impacts.");
    }

    const smallImpacts = combatCalls.filter((call) => call.animationType === "explosionSmall");
    if (smallImpacts.length !== 5) {
      throw new Error(`Expected five small bomb stick impacts, found ${smallImpacts.length}.`);
    }

    const centeredImpact = smallImpacts.find((call) => call.offsetX === 0 && call.offsetY === 0);
    if (centeredImpact) {
      throw new Error("Expected bomb stick impacts to avoid a single centered blast.");
    }

    const maxScale = Math.max(...smallImpacts.map((call) => call.scale));
    if (maxScale > 1.05) {
      throw new Error(`Expected playExplosion(true) bomb impacts to stay at small scale, received ${maxScale}.`);
    }
  });
});

registerTest("HEXMAP_ROCKET_ARTILLERY_ATTACK_SPAWNS_TRIPLE_BARRAGE_SALVOS", async ({ Given, When, Then }) => {
  const renderer = new HexMapRenderer() as unknown as {
    playAttackSequence(attackerHexKey: string, defenderHexKey: string, targetIsHardTarget: boolean): Promise<void>;
    hexElementMap: Map<string, unknown>;
    extractHexCenter: (element: unknown) => { cx: number; cy: number } | null;
    setHexFacingAngle: (hexKey: string, cx: number, cy: number, angle: number) => void;
    getUnitClassAt: (hexKey: string) => string | undefined;
    getUnitScenarioTypeAt: (hexKey: string) => string | undefined;
    isSmallArmsAttack: (hexKey: string) => boolean;
    isArcingArtilleryAttack: (hexKey: string) => boolean;
    isAirStrafingAttack: (hexKey: string) => boolean;
    isAirBombingAttack: (hexKey: string) => boolean;
    playFlashOverlay: () => Promise<void>;
    playMuzzleFlash: () => Promise<void>;
    playTargetMarker: () => Promise<void>;
    playRecoilNudge: () => Promise<void>;
    playHitShake: () => Promise<void>;
    playSparkBurst: () => Promise<void>;
    playDustCloudLinger: () => Promise<void>;
    playProjectileTracer: () => Promise<void>;
    playArcedProjectile: () => Promise<void>;
  } & {
    playCombatAnimation: (animationType: string, hexKey: string, offsetX?: number, offsetY?: number, scale?: number) => Promise<void>;
  };

  const combatCalls: Array<{ animationType: string; hexKey: string; offsetX: number; offsetY: number; scale: number }> = [];
  let arcedProjectileCalls = 0;
  const originalSetTimeout = window.setTimeout;

  await Given("a rocket-artillery renderer path with non-impact visuals stubbed", async () => {
    window.setTimeout = ((handler: TimerHandler, _timeout?: number, ...args: unknown[]) => {
      if (typeof handler === "function") {
        handler(...args);
      }
      return 0 as unknown as number;
    }) as typeof window.setTimeout;
    renderer.hexElementMap.set("0,0", {});
    renderer.hexElementMap.set("1,0", {});
    renderer.extractHexCenter = () => ({ cx: 100, cy: 100 });
    renderer.setHexFacingAngle = () => {};
    renderer.getUnitClassAt = (hexKey) => (hexKey === "0,0" ? "artillery" : "tank");
    renderer.getUnitScenarioTypeAt = (hexKey) => (hexKey === "0,0" ? "Rocket_Artillery" : "Medium_Tank");
    renderer.isSmallArmsAttack = () => false;
    renderer.isArcingArtilleryAttack = () => true;
    renderer.isAirStrafingAttack = () => false;
    renderer.isAirBombingAttack = () => false;
    renderer.playFlashOverlay = async () => {};
    renderer.playMuzzleFlash = async () => {};
    renderer.playTargetMarker = async () => {};
    renderer.playRecoilNudge = async () => {};
    renderer.playHitShake = async () => {};
    renderer.playSparkBurst = async () => {};
    renderer.playDustCloudLinger = async () => {};
    renderer.playProjectileTracer = async () => {};
    renderer.playArcedProjectile = async () => {
      arcedProjectileCalls += 1;
    };
    renderer.playCombatAnimation = async (animationType, hexKey, offsetX = 0, offsetY = 0, scale = 1) => {
      combatCalls.push({ animationType, hexKey, offsetX, offsetY, scale });
    };
  });

  await When("the rocket artillery attack sequence resolves", async () => {
    await renderer.playAttackSequence("0,0", "1,0", true);
  });

  window.setTimeout = originalSetTimeout;

  await Then("it plays three artillery-style salvos with spread-out small explosions", async () => {
    if (arcedProjectileCalls !== 3) {
      throw new Error(`Expected three rocket-tracer lob animations, received ${arcedProjectileCalls}.`);
    }

    const impactCalls = combatCalls.filter((call) => call.animationType === "explosionSmall");
    if (impactCalls.length !== 12) {
      throw new Error(`Expected twelve small rocket-artillery explosions, found ${impactCalls.length}.`);
    }

    const uniqueOffsets = new Set(impactCalls.map((call) => `${call.offsetX},${call.offsetY}`));
    if (uniqueOffsets.size < 10) {
      throw new Error(`Expected rocket-artillery salvos to spread across many distinct impact points, found ${uniqueOffsets.size}.`);
    }
  });
});

registerTest("HEXMAP_RENDERUNIT_DOES_NOT_ADD_WATER_TRANSPORT_OVERLAY", async ({ Given, When, Then }) => {
  const viewport = document.createElement("div");
  viewport.style.width = "300px";
  viewport.style.height = "200px";
  Object.defineProperty(viewport, "clientWidth", { value: 300, configurable: true });
  Object.defineProperty(viewport, "clientHeight", { value: 200, configurable: true });

  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  viewport.appendChild(canvas);
  document.body.appendChild(viewport);

  const scenario: ScenarioData = {
    name: "Water Tile Harness",
    size: { cols: 1, rows: 1 },
    tilePalette: {
      OPEN_WATER: {
        terrain: "sea",
        terrainType: "water",
        density: "average",
        features: [],
        recon: "intel"
      }
    },
    tiles: [[{ tile: "OPEN_WATER" }]],
    objectives: [],
    turnLimit: 1,
    sides: {
      Player: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] },
      Bot: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] }
    }
  };

  const renderer = new HexMapRenderer();

  await Given("a rendered water hex", async () => {
    renderer.render(svg as SVGSVGElement, canvas as HTMLDivElement, scenario);
  });

  await When("a unit is rendered on the water tile", async () => {
    renderer.renderUnit("0,0", {
      type: "Infantry" as never,
      hex: { q: 0, r: 0 },
      strength: 10,
      experience: 0,
      ammo: 6,
      fuel: 0,
      entrench: 0,
      facing: "NW"
    }, "Player");
  });

  await Then("the renderer keeps only the unit sprite and does not add a transport ship overlay", async () => {
    const overlay = svg.querySelector(".unit-boat-overlay");
    if (overlay) {
      throw new Error("Expected no transport ship overlay to render on water tiles.");
    }

    const unitIcons = svg.querySelectorAll("image.unit-icon");
    if (unitIcons.length !== 1) {
      throw new Error(`Expected only one unit icon image on the water tile, found ${unitIcons.length}.`);
    }

    viewport.remove();
  });
});

registerTest("HEXMAP_IMPACT_HITS_USE_THE_REGISTERED_SPRITE_EFFECT", async ({ Given, When, Then }) => {
  const renderer = new HexMapRenderer();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const effectsLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.appendChild(effectsLayer);
  document.body.appendChild(svg);
  const originalPlayAnimation = SpriteSheetAnimator.prototype.playAnimation;
  const originalWarn = console.warn;
  let played = "";
  const warnings: string[] = [];

  await Given("the battle requests the authored sparks-and-hits effect during real combat", () => {
    (renderer as any).combatEffectsLayer = effectsLayer;
    SpriteSheetAnimator.prototype.playAnimation = async function (animationType: string): Promise<void> {
      played = animationType;
    } as typeof SpriteSheetAnimator.prototype.playAnimation;
    console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")); };
  });

  await When("the impact effect is played without a weapon-sound request", async () => {
    try {
      await renderer.playCombatAnimationAt("impactHits", 120, 80, 1, false);
    } finally {
      SpriteSheetAnimator.prototype.playAnimation = originalPlayAnimation;
      console.warn = originalWarn;
      svg.remove();
    }
  });

  await Then("the registered sprite animator owns the effect without an unknown-specification warning", () => {
    if (played !== "impactHits" || warnings.some((warning) => /No specification found.*impactHits/i.test(warning))) {
      throw new Error(`impactHits was not routed through its registered sprite effect: ${JSON.stringify({ played, warnings })}`);
    }
  });
});
