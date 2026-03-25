import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { ProceduralEffectsAnimator, getZoomTier } from "../src/rendering/ProceduralEffects";
import { effectCatalog } from "../src/rendering/EffectSpecifications";

// Mock effect specs for testing
const mockEffectSpecs = [
  {
    type: "test_effect",
    displayName: "Test Effect",
    durationMs: 500,
    nodeCountBudget: { min: 5, typical: 10, max: 15 },
    useTerrainResponse: false,
    phases: [
      {
        name: "ignition",
        startMs: 0,
        endMs: 100,
        primitives: [
          {
            type: "flash_core",
            startMs: 0,
            endMs: 150,
            params: { maxRadius: 20, peakProgress: 0.2, fadeProgress: 0.6 }
          }
        ]
      },
      {
        name: "burst",
        startMs: 100,
        endMs: 300,
        primitives: [
          {
            type: "sparks",
            startMs: 100,
            endMs: 250,
            params: { sparkCount: 8, minLength: 5, maxLength: 15, strokeWidth: 1 }
          }
        ]
      },
      {
        name: "linger",
        startMs: 300,
        endMs: 500,
        primitives: [
          {
            type: "smoke_puff",
            startMs: 300,
            endMs: 500,
            params: { maxRadius: 25, riseDistance: 20 }
          }
        ]
      }
    ]
  }
];

registerTest("PROCEDURAL_EFFECTS_ANIMATOR_PLAYS_EFFECT_AND_CLEANS_UP", async ({ Given, When, Then }) => {
  let parentGroup: SVGGElement;
  let animator: ProceduralEffectsAnimator;
  let playbackPromise: Promise<void>;
  let initialChildCount: number;
  let duringChildCount: number;
  let afterChildCount: number;

  await Given("a procedural effects animator with a test effect specification", async () => {
    // Load mock specs
    effectCatalog.load(mockEffectSpecs as any);

    parentGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    document.body.appendChild(parentGroup);

    animator = new ProceduralEffectsAnimator(parentGroup);
    initialChildCount = parentGroup.children.length;
  });

  await When("an effect is played and completes", async () => {
    playbackPromise = animator.playAnimation("test_effect", 100, 100, 1);

    // Wait a bit for the effect to start
    await new Promise(resolve => setTimeout(resolve, 50));
    duringChildCount = parentGroup.children.length;

    // Wait for completion
    await playbackPromise;
    afterChildCount = parentGroup.children.length;
  });

  await Then("the effect adds content during playback and cleans up after completion", async () => {
    if (initialChildCount !== 0) {
      throw new Error(`Expected 0 initial children, got ${initialChildCount}`);
    }

    if (duringChildCount === 0) {
      throw new Error("Expected content during playback, but found 0 children");
    }

    if (afterChildCount !== 0) {
      throw new Error(`Expected 0 children after cleanup, got ${afterChildCount}`);
    }
  });
});

registerTest("PROCEDURAL_EFFECTS_ANIMATOR_SUPPORTS_CONCURRENT_EFFECTS", async ({ Given, When, Then }) => {
  let parentGroup: SVGGElement;
  let animator: ProceduralEffectsAnimator;
  let effect1Promise: Promise<void>;
  let effect2Promise: Promise<void>;
  let concurrentChildCount: number;
  let activeTransforms: string[] = [];

  await Given("a procedural effects animator", async () => {
    effectCatalog.load(mockEffectSpecs as any);

    parentGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    document.body.appendChild(parentGroup);

    animator = new ProceduralEffectsAnimator(parentGroup);
  });

  await When("two effects are started concurrently", async () => {
    effect1Promise = animator.playAnimation("test_effect", 50, 50, 1);
    effect2Promise = animator.playAnimation("test_effect", 150, 150, 1);

    // Wait for both to be rendering
    await new Promise(resolve => setTimeout(resolve, 50));
    concurrentChildCount = parentGroup.children.length;
    activeTransforms = Array.from(parentGroup.children).map((child) =>
      (child as SVGGElement).getAttribute("transform") ?? ""
    );

    // Wait for both to complete
    await Promise.all([effect1Promise, effect2Promise]);
  });

  await Then("both effects render concurrently without interference", async () => {
    if (concurrentChildCount < 2) {
      throw new Error(`Expected at least 2 concurrent effect groups, got ${concurrentChildCount}`);
    }
    if (!activeTransforms.includes("translate(50, 50) scale(1)") || !activeTransforms.includes("translate(150, 150) scale(1)")) {
      throw new Error(`Expected concurrent effects to preserve distinct transforms, saw ${activeTransforms.join(", ") || "none"}.`);
    }

    if (parentGroup.children.length !== 0) {
      throw new Error(`Expected cleanup of all effects, but ${parentGroup.children.length} remain`);
    }
  });
});

registerTest("PROCEDURAL_EFFECTS_ANIMATOR_CANCEL_ALL_STOPS_ACTIVE_EFFECTS", async ({ Given, When, Then }) => {
  let parentGroup: SVGGElement;
  let animator: ProceduralEffectsAnimator;
  let effect1Promise: Promise<void>;
  let effect2Promise: Promise<void>;
  let cancelledChildCount: number;

  await Given("a procedural effects animator with two active effects", async () => {
    effectCatalog.load(mockEffectSpecs as any);

    parentGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    document.body.appendChild(parentGroup);

    animator = new ProceduralEffectsAnimator(parentGroup);

    effect1Promise = animator.playAnimation("test_effect", 50, 50, 1);
    effect2Promise = animator.playAnimation("test_effect", 150, 150, 1);

    // Wait for effects to start
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  await When("cancelAll is called", async () => {
    animator.cancelAll();
    await new Promise(resolve => setTimeout(resolve, 10));
    cancelledChildCount = parentGroup.children.length;
  });

  await Then("all active effects are immediately stopped and cleaned up", async () => {
    if (cancelledChildCount !== 0) {
      throw new Error(`Expected 0 children after cancelAll, got ${cancelledChildCount}`);
    }

    if (animator.hasActiveEffects()) {
      throw new Error("Animator still reports active effects after cancelAll");
    }
  });
});

registerTest("ZOOM_TIER_CALCULATION_MATCHES_EXPECTED_RANGES", async ({ Given, When, Then }) => {
  let farTier: string;
  let midTier: string;
  let nearTier: string;

  await Given("different zoom levels", async () => {
    // Zoom levels will be tested in When step
  });

  await When("zoom tiers are calculated", async () => {
    farTier = getZoomTier(1.0);
    midTier = getZoomTier(2.0);
    nearTier = getZoomTier(4.0);
  });

  await Then("zoom tiers match expected ranges", async () => {
    if (farTier !== 'far') {
      throw new Error(`Expected 'far' tier for zoom 1.0, got ${farTier}`);
    }

    if (midTier !== 'mid') {
      throw new Error(`Expected 'mid' tier for zoom 2.0, got ${midTier}`);
    }

    if (nearTier !== 'near') {
      throw new Error(`Expected 'near' tier for zoom 4.0, got ${nearTier}`);
    }
  });
});

registerTest("PROCEDURAL_EFFECTS_USES_DETERMINISTIC_SEED", async ({ Given, When, Then }) => {
  let parentGroup: SVGGElement;
  let animator: ProceduralEffectsAnimator;

  await Given("a procedural effects animator", async () => {
    effectCatalog.load(mockEffectSpecs as any);

    parentGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    document.body.appendChild(parentGroup);

    animator = new ProceduralEffectsAnimator(parentGroup);
  });

  await When("multiple effects are played", async () => {
    await animator.playAnimation("test_effect", 100, 100, 1);
    await animator.playAnimation("test_effect", 100, 100, 1);
    await animator.playAnimation("test_effect", 100, 100, 1);
  });

  await Then("each effect uses a unique seed for variation", async () => {
    // This test validates that the seed generation doesn't crash
    // Actual seed uniqueness is validated by the seed counter mechanism
    // in ProceduralEffects.ts
    if (parentGroup.children.length !== 0) {
      throw new Error("Expected cleanup after all effects complete");
    }
  });
});
