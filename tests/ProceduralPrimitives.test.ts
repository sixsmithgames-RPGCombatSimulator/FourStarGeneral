import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import {
  renderFlashCore,
  renderShockRing,
  renderSparks,
  renderDebris,
  renderDustPuff,
  renderSmokePuff,
  renderEmbers,
  renderScorch,
  SeededRandom,
  type PrimitiveRenderContext,
  type PrimitiveConfig
} from "../src/rendering/ProceduralPrimitives";

const ANCHOR_X = 128;
const ANCHOR_Y = 220;

function createTestContext(overrides?: Partial<PrimitiveRenderContext>): PrimitiveRenderContext {
  const parent = document.createElementNS("http://www.w3.org/2000/svg", "g");
  document.body.appendChild(parent);

  return {
    parent,
    phaseProgress: 0.5,
    overallProgress: 0.5,
    elapsedMs: 500,
    seed: 12345,
    anchorX: ANCHOR_X,
    anchorY: ANCHOR_Y,
    zoomTier: 'mid',
    ...overrides
  };
}

registerTest("SEEDED_RANDOM_PRODUCES_DETERMINISTIC_SEQUENCE", async ({ Given, When, Then }) => {
  let rng1: SeededRandom;
  let rng2: SeededRandom;
  let sequence1: number[] = [];
  let sequence2: number[] = [];

  await Given("two SeededRandom instances with the same seed", async () => {
    rng1 = new SeededRandom(42);
    rng2 = new SeededRandom(42);
  });

  await When("both generate the same number of random values", async () => {
    for (let i = 0; i < 10; i++) {
      sequence1.push(rng1.next());
      sequence2.push(rng2.next());
    }
  });

  await Then("both sequences are identical", async () => {
    if (sequence1.length !== sequence2.length) {
      throw new Error(`Sequence lengths differ: ${sequence1.length} vs ${sequence2.length}`);
    }

    for (let i = 0; i < sequence1.length; i++) {
      if (sequence1[i] !== sequence2[i]) {
        throw new Error(`Sequences differ at index ${i}: ${sequence1[i]} vs ${sequence2[i]}`);
      }
    }
  });
});

registerTest("FLASH_CORE_RENDERS_RADIAL_GRADIENT_CIRCLE", async ({ Given, When, Then }) => {
  let ctx: PrimitiveRenderContext;
  let elements: SVGElement[];

  await Given("a render context at mid-phase progress", async () => {
    ctx = createTestContext({ phaseProgress: 0.5 });
  });

  await When("flash_core primitive is rendered", async () => {
    const config: PrimitiveConfig = {
      startMs: 0,
      endMs: 200,
      params: {
        maxRadius: 40,
        peakProgress: 0.3,
        fadeProgress: 0.7
      }
    };

    elements = renderFlashCore(ctx, config);
  });

  await Then("it produces a defs element and a circle with radial gradient", async () => {
    if (elements.length !== 2) {
      throw new Error(`Expected 2 elements (defs + circle), got ${elements.length}`);
    }

    const [defs, circle] = elements;

    if (defs?.tagName !== "defs") {
      throw new Error(`Expected first element to be defs, got ${defs?.tagName}`);
    }

    if (circle?.tagName !== "circle") {
      throw new Error(`Expected second element to be circle, got ${circle?.tagName}`);
    }

    const cx = circle.getAttribute("cx");
    const cy = circle.getAttribute("cy");

    if (cx !== ANCHOR_X.toString() || cy !== ANCHOR_Y.toString()) {
      throw new Error(`Circle not positioned at anchor (${ANCHOR_X}, ${ANCHOR_Y}), got (${cx}, ${cy})`);
    }

    const fill = circle.getAttribute("fill");
    if (!fill?.startsWith("url(#flash-core-")) {
      throw new Error(`Circle should use gradient fill, got ${fill}`);
    }
  });
});

registerTest("SHOCK_RING_RESPECTS_NODE_COUNT_BUDGET", async ({ Given, When, Then }) => {
  let ctx: PrimitiveRenderContext;
  let farElements: SVGElement[];
  let midElements: SVGElement[];
  let nearElements: SVGElement[];

  await Given("render contexts at different zoom tiers", async () => {
    // Contexts will be created in When step
  });

  await When("shock_ring is rendered at each zoom tier", async () => {
    const config: PrimitiveConfig = {
      startMs: 0,
      endMs: 150,
      params: {
        minRadius: 10,
        maxRadius: 50,
        strokeWidth: 2,
        ringCount: 4
      }
    };

    farElements = renderShockRing(createTestContext({ zoomTier: 'far' }), config);
    midElements = renderShockRing(createTestContext({ zoomTier: 'mid' }), config);
    nearElements = renderShockRing(createTestContext({ zoomTier: 'near' }), config);
  });

  await Then("far zoom produces fewer elements than near zoom", async () => {
    if (farElements.length >= midElements.length) {
      throw new Error(`Far zoom should have fewer rings than mid: ${farElements.length} vs ${midElements.length}`);
    }

    if (midElements.length > nearElements.length) {
      throw new Error(`Mid zoom should not exceed near zoom rings: ${midElements.length} vs ${nearElements.length}`);
    }

    // All should be circles
    for (const element of [...farElements, ...midElements, ...nearElements]) {
      if (element.tagName !== "circle") {
        throw new Error(`Expected all elements to be circles, got ${element.tagName}`);
      }
    }
  });
});

registerTest("SPARKS_USES_ANCHOR_AS_ORIGIN", async ({ Given, When, Then }) => {
  let ctx: PrimitiveRenderContext;
  let elements: SVGElement[];

  await Given("a render context with standard anchor", async () => {
    ctx = createTestContext();
  });

  await When("sparks primitive is rendered", async () => {
    const config: PrimitiveConfig = {
      startMs: 80,
      endMs: 250,
      params: {
        sparkCount: 12,
        minLength: 10,
        maxLength: 30,
        strokeWidth: 1.5
      }
    };

    elements = renderSparks(ctx, config);
  });

  await Then("all spark lines originate from the anchor point", async () => {
    if (elements.length === 0) {
      throw new Error("Expected at least one spark line");
    }

    for (const element of elements) {
      if (element.tagName !== "line") {
        throw new Error(`Expected line elements, got ${element.tagName}`);
      }

      const x1 = element.getAttribute("x1");
      const y1 = element.getAttribute("y1");

      if (x1 !== ANCHOR_X.toString() || y1 !== ANCHOR_Y.toString()) {
        throw new Error(`Spark line should start at anchor (${ANCHOR_X}, ${ANCHOR_Y}), got (${x1}, ${y1})`);
      }
    }
  });
});

registerTest("DEBRIS_APPLIES_BALLISTIC_TRAJECTORY", async ({ Given, When, Then }) => {
  let ctx: PrimitiveRenderContext;
  let elements: SVGElement[];

  await Given("a render context at late-phase progress", async () => {
    ctx = createTestContext({ phaseProgress: 0.8 });
  });

  await When("debris primitive is rendered", async () => {
    const config: PrimitiveConfig = {
      startMs: 100,
      endMs: 500,
      params: {
        particleCount: 15,
        minVelocity: 30,
        maxVelocity: 60,
        particleSize: 2
      }
    };

    elements = renderDebris(ctx, config);
  });

  await Then("particles are displaced from anchor with gravity effect", async () => {
    if (elements.length === 0) {
      throw new Error("Expected at least one debris particle");
    }

    let allParticlesDisplaced = true;

    for (const element of elements) {
      if (element.tagName !== "circle") {
        throw new Error(`Expected circle elements, got ${element.tagName}`);
      }

      const cx = parseFloat(element.getAttribute("cx") ?? "0");
      const cy = parseFloat(element.getAttribute("cy") ?? "0");

      // Particles should be displaced from anchor
      if (Math.abs(cx - ANCHOR_X) < 1 && Math.abs(cy - ANCHOR_Y) < 1) {
        allParticlesDisplaced = false;
      }
    }

    if (!allParticlesDisplaced) {
      throw new Error("Some debris particles are not displaced from anchor point");
    }
  });
});

registerTest("DUST_PUFF_APPLIES_TERRAIN_TINT", async ({ Given, When, Then }) => {
  let ctx: PrimitiveRenderContext;
  let elements: SVGElement[];

  await Given("a render context with terrain tint color", async () => {
    ctx = createTestContext({ terrainTint: "#3a8c2f" });
  });

  await When("dust_puff primitive is rendered", async () => {
    const config: PrimitiveConfig = {
      startMs: 120,
      endMs: 400,
      params: {
        maxRadiusX: 45,
        maxRadiusY: 30
      }
    };

    elements = renderDustPuff(ctx, config);
  });

  await Then("the cloud uses multiple layered ellipses and keeps the terrain tint in the palette", async () => {
    if (elements.length < 5) {
      throw new Error(`Expected a layered dust cloud with at least 5 ellipses, got ${elements.length}`);
    }

    for (const element of elements) {
      if (element.tagName !== "ellipse") {
        throw new Error(`Expected only ellipse elements, got ${element.tagName}`);
      }
    }

    const fills = elements.map((element) => element.getAttribute("fill"));
    if (!fills.includes("#3a8c2f")) {
      throw new Error(`Expected terrain tint color #3a8c2f to remain present in the cloud palette, got ${fills.join(", ")}`);
    }
  });
});

registerTest("SMOKE_PUFF_RISES_FROM_ANCHOR", async ({ Given, When, Then }) => {
  let earlyCtx: PrimitiveRenderContext;
  let lateCtx: PrimitiveRenderContext;
  let earlyElements: SVGElement[];
  let lateElements: SVGElement[];

  await Given("render contexts at early and late progress", async () => {
    earlyCtx = createTestContext({ phaseProgress: 0.1 });
    lateCtx = createTestContext({ phaseProgress: 0.9 });
  });

  await When("smoke_puff is rendered at both stages", async () => {
    const config: PrimitiveConfig = {
      startMs: 220,
      endMs: 800,
      params: {
        maxRadius: 40,
        riseDistance: 30
      }
    };

    earlyElements = renderSmokePuff(earlyCtx, config);
    lateElements = renderSmokePuff(lateCtx, config);
  });

  await Then("late-stage smoke is positioned higher than early-stage and renders as a layered plume", async () => {
    if (earlyElements.length < 4 || lateElements.length < 4) {
      throw new Error(`Expected layered smoke plume output, got ${earlyElements.length} and ${lateElements.length} elements`);
    }

    const averageCy = (elementsToMeasure: SVGElement[]): number => {
      const total = elementsToMeasure.reduce((sum, element) => {
        return sum + parseFloat(element.getAttribute("cy") ?? "0");
      }, 0);
      return total / elementsToMeasure.length;
    };

    const earlyY = averageCy(earlyElements);
    const lateY = averageCy(lateElements);

    if (lateY >= earlyY) {
      throw new Error(`Late smoke should rise (lower Y) compared to early: ${lateY} vs ${earlyY}`);
    }
  });
});

registerTest("EMBERS_FLICKER_WITH_TIME", async ({ Given, When, Then }) => {
  let ctx1: PrimitiveRenderContext;
  let ctx2: PrimitiveRenderContext;
  let elements1: SVGElement[];
  let elements2: SVGElement[];

  await Given("two render contexts with different elapsed times but same seed", async () => {
    ctx1 = createTestContext({ elapsedMs: 100, seed: 999 });
    ctx2 = createTestContext({ elapsedMs: 600, seed: 999 });
  });

  await When("embers are rendered at both times", async () => {
    const config: PrimitiveConfig = {
      startMs: 250,
      endMs: 700,
      params: {
        emberCount: 10,
        minRadius: 1.5,
        maxRadius: 3,
        spreadDistance: 30
      }
    };

    elements1 = renderEmbers(ctx1, config);
    elements2 = renderEmbers(ctx2, config);
  });

  await Then("embers have same positions but potentially different opacities due to flicker", async () => {
    if (elements1.length !== elements2.length) {
      throw new Error(`Ember count should match for same seed: ${elements1.length} vs ${elements2.length}`);
    }

    // Positions should match (same seed)
    for (let i = 0; i < elements1.length; i++) {
      const cx1 = elements1[i]!.getAttribute("cx");
      const cy1 = elements1[i]!.getAttribute("cy");
      const cx2 = elements2[i]!.getAttribute("cx");
      const cy2 = elements2[i]!.getAttribute("cy");

      if (cx1 !== cx2 || cy1 !== cy2) {
        throw new Error(`Ember ${i} position mismatch with same seed: (${cx1},${cy1}) vs (${cx2},${cy2})`);
      }
    }
  });
});

registerTest("SCORCH_FADES_IN_GRADUALLY", async ({ Given, When, Then }) => {
  let earlyCtx: PrimitiveRenderContext;
  let lateCtx: PrimitiveRenderContext;
  let earlyElements: SVGElement[];
  let lateElements: SVGElement[];

  await Given("render contexts at early and late progress", async () => {
    earlyCtx = createTestContext({ phaseProgress: 0.05 });
    lateCtx = createTestContext({ phaseProgress: 0.8 });
  });

  await When("scorch is rendered at both stages", async () => {
    const config: PrimitiveConfig = {
      startMs: 600,
      endMs: 1800,
      params: {
        radiusX: 35,
        radiusY: 25,
        fadeInProgress: 0.2
      }
    };

    earlyElements = renderScorch(earlyCtx, config);
    lateElements = renderScorch(lateCtx, config);
  });

  await Then("early scorch has lower opacity than late scorch", async () => {
    // Each should have defs + ellipse
    if (earlyElements.length !== 2 || lateElements.length !== 2) {
      throw new Error("Expected defs + ellipse for each render");
    }

    const earlyEllipse = earlyElements[1];
    const lateEllipse = lateElements[1];

    const earlyOpacity = parseFloat(earlyEllipse!.getAttribute("opacity") ?? "1");
    const lateOpacity = parseFloat(lateEllipse!.getAttribute("opacity") ?? "1");

    if (earlyOpacity >= lateOpacity) {
      throw new Error(`Early scorch should have lower opacity: ${earlyOpacity} vs ${lateOpacity}`);
    }
  });
});
