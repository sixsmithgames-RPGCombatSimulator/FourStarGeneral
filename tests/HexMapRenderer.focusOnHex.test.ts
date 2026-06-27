import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer";
import type { ScenarioData } from "../src/core/types";

type RafCallback = (timestamp: number) => void;

function installRendererDataFetchMock(): () => void {
  const originalFetch = globalThis.fetch;
  const mockJsonResponse = (payload: unknown): Response =>
    ({
      ok: true,
      status: 200,
      json: async () => payload
    } as Response);

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("data/effectSpecs.json")) {
      return mockJsonResponse([]);
    }
    if (url.endsWith("data/terrainTints.json")) {
      return mockJsonResponse([]);
    }
    if (url.endsWith("data/soundCatalog.json")) {
      return mockJsonResponse({ version: 1, assets: {} });
    }
    return originalFetch(input as RequestInfo, init);
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

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
  let restoreFetch: (() => void) | null = null;

  await Given("a rendered single-hex map", async () => {
    restoreFetch = installRendererDataFetchMock();
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
    try {
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
    } finally {
      restoreFetch?.();
      viewport.remove();
    }
  });
});

registerTest("HEXMAP_AIRCRAFT_HEADINGS_ASSUME_NOSE_UP_SPRITES", async ({ When, Then }) => {
  const renderer = new HexMapRenderer();
  let northHeading = 0;
  let eastHeading = 0;

  await When("aircraft headings are resolved for nose-up aircraft sprites", async () => {
    northHeading = (renderer as any).resolveAircraftHeadingDegrees(0, -1);
    eastHeading = (renderer as any).resolveAircraftHeadingDegrees(1, 0);
  });

  await Then("northbound movement should remain upright while eastbound movement rotates clockwise", async () => {
    if (northHeading !== 0) {
      throw new Error(`Expected northbound aircraft heading to remain 0 degrees, received ${northHeading}.`);
    }
    if (eastHeading !== 90) {
      throw new Error(`Expected eastbound aircraft heading to rotate to 90 degrees, received ${eastHeading}.`);
    }
  });
});

registerTest("HEXMAP_AIRCRAFT_SORTIE_RETAINS_GHOST_DURING_TARGET_PASS_FX", async ({ Given, When, Then }) => {
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
    name: "Aircraft Sortie Harness",
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
      Bot: { hq: { q: 1, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] }
    }
  };

  const renderer = new HexMapRenderer();
  const rafCallbacks: RafCallback[] = [];
  const originalRaf = window.requestAnimationFrame;
  let restoreFetch: (() => void) | null = null;
  let timestamp = performance.now();
  let targetPassStarted = false;
  let resolveHeldImpact: (() => void) | null = null;
  let animation: Promise<void> | null = null;

  const flushNextFrame = (deltaMs = 25): void => {
    const callback = rafCallbacks.shift();
    if (!callback) {
      throw new Error("Expected a queued aircraft animation frame.");
    }
    timestamp += deltaMs;
    callback(timestamp);
  };

  await Given("a rendered route for a bomber sortie", async () => {
    restoreFetch = installRendererDataFetchMock();
    renderer.render(svg as SVGSVGElement, canvas as HTMLDivElement, scenario);
  });

  await When("the sortie reaches the target while impact effects are still pending", async () => {
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    };

    animation = renderer.animateAircraftSortie("0,0", "1,0", "0,0", "Bomber", {
      ingressDurationMs: 50,
      egressDurationMs: 50,
      strength: 0,
      faction: "Player",
      role: "bomber",
      onTargetPass: async () => {
        targetPassStarted = true;
        await new Promise<void>((resolve) => {
          resolveHeldImpact = resolve;
        });
      }
    });

    for (let index = 0; index < 8 && (!targetPassStarted || rafCallbacks.length > 0); index += 1) {
      flushNextFrame();
    }
  });

  await Then("the aircraft formation should stay mounted until target effects finish", async () => {
    try {
      if (!targetPassStarted || !resolveHeldImpact || !animation) {
        throw new Error("Expected the sortie target pass to be active.");
      }

      const mountedGhost = svg.querySelector(".aircraft-formation, .unit-move-ghost");
      if (!mountedGhost) {
        throw new Error("Expected bomber ghost to remain mounted while impact effects are unresolved.");
      }

      resolveHeldImpact();
      await animation;

      const remainingGhost = svg.querySelector(".aircraft-formation, .unit-move-ghost");
      if (remainingGhost) {
        throw new Error("Expected bomber ghost to be removed after the sortie and impact effects complete.");
      }
    } finally {
      window.requestAnimationFrame = originalRaf;
      restoreFetch?.();
      viewport.remove();
    }
  });
});
