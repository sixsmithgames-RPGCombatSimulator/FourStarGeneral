import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { FrameSequenceAnimator } from "../src/rendering/FrameSequenceAnimator";
import { COMBAT_ANIMATIONS, resolveSpriteSheetSpec } from "../src/rendering/SpriteSheetAnimator";

type RafCallback = (timestamp: number) => void;

function createFrameCanvases(frameSources: readonly string[], frameWidth: number, frameHeight: number): HTMLCanvasElement[] {
  return frameSources.map((frameSource) => {
    const canvas = document.createElement("canvas");
    canvas.width = frameWidth;
    canvas.height = frameHeight;
    canvas.dataset.frameSource = frameSource;
    return canvas;
  });
}

registerTest("FRAME_SEQUENCE_ANIMATOR_REUSES_ONE_NODE_AND_RESOLVES_AFTER_CLEANUP", async ({ Given, When, Then }) => {
  const overlay = document.createElement("div");
  overlay.style.position = "relative";
  document.body.appendChild(overlay);

  const frameSources = ["frame-0", "frame-1", "frame-2", "frame-3"] as const;
  const resolvedSpec = resolveSpriteSheetSpec(COMBAT_ANIMATIONS.dustCloud, {
    width: 256,
    height: 64
  });
  const frames = {
    frameWidth: 64,
    frameHeight: 64,
    frameCanvases: createFrameCanvases(frameSources, 64, 64),
    frameDataUrls: frameSources
  } as const;

  const animator = new FrameSequenceAnimator(overlay, {
    resolveSpec: async () => resolvedSpec,
    resolveFrames: async () => frames
  });

  const rafCallbacks: RafCallback[] = [];
  const originalRaf = window.requestAnimationFrame;
  const originalCancelRaf = window.cancelAnimationFrame;

  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  };
  window.cancelAnimationFrame = () => {};
  globalThis.requestAnimationFrame = window.requestAnimationFrame;
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame;

  let animationPromise: Promise<void> | null = null;
  let resolved = false;
  let initialX = "";
  let initialY = "";
  let initialWidth = "";
  let initialHeight = "";

  await Given("a frame-sequence animator with injected cached dust-cloud frames", async () => {
  });

  await When("the animation plays through successive frame ticks", async () => {
    animationPromise = animator.playAnimation("dustCloud", 100, 120, 1.5);
    void animationPromise.then(() => {
      resolved = true;
    });
    // Wait for the animation to configure and add the image element
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    const initialSurface = overlay.querySelector<HTMLDivElement>("div[data-frame-sequence-surface='true']");
    const initialCanvas = overlay.querySelector<HTMLCanvasElement>("canvas");
    if (!initialSurface || !initialCanvas) {
      throw new Error("Expected one active frame canvas immediately after playback starts.");
    }

    initialX = initialSurface.style.left;
    initialY = initialSurface.style.top;
    initialWidth = initialSurface.style.width;
    initialHeight = initialSurface.style.height;
    if ((initialCanvas.dataset.frameSource ?? "") !== "frame-0") {
      throw new Error(`Expected initial canvas frame source frame-0, received ${initialCanvas.dataset.frameSource ?? "<missing>"}.`);
    }

    const baseTimestamp = performance.now();
    const timestamps = [
      baseTimestamp + 110,
      baseTimestamp + 220,
      baseTimestamp + 330,
      baseTimestamp + 440
    ];
    const expectedFrames = ["frame-1", "frame-2", "frame-3"];

    for (let index = 0; index < expectedFrames.length; index += 1) {
      const cb = rafCallbacks.shift();
      if (!cb) {
        throw new Error(`Expected queued animation frame callback ${index + 1}.`);
      }
      cb(timestamps[index]!);

      const activeCanvases = overlay.querySelectorAll("canvas");
      if (activeCanvases.length !== 1) {
        throw new Error(`Expected exactly one visible canvas node during playback, found ${activeCanvases.length}.`);
      }

      const canvas = activeCanvases[0] as HTMLCanvasElement;
      if ((canvas.dataset.frameSource ?? "") !== expectedFrames[index]) {
        throw new Error(`Expected frame source ${expectedFrames[index]}, received ${canvas.dataset.frameSource ?? "<missing>"}.`);
      }
      const surface = overlay.querySelector<HTMLDivElement>("div[data-frame-sequence-surface='true']");
      if (!surface) {
        throw new Error("Expected active HTML frame surface during playback.");
      }
      if (surface.style.left !== initialX || surface.style.top !== initialY) {
        throw new Error("Frame-sequence playback mutated surface position after configure().");
      }
      if (surface.style.width !== initialWidth || surface.style.height !== initialHeight) {
        throw new Error("Frame-sequence playback mutated surface size after configure().");
      }
      if (resolved) {
        throw new Error("Animation resolved before the visual sequence and cleanup completed.");
      }
    }

    const finalCallback = rafCallbacks.shift();
    if (!finalCallback) {
      throw new Error("Expected final callback to finish the frame sequence.");
    }
    finalCallback(timestamps[3]!);
    await animationPromise;
  });

  window.requestAnimationFrame = originalRaf;
  window.cancelAnimationFrame = originalCancelRaf;
  globalThis.requestAnimationFrame = originalRaf;
  globalThis.cancelAnimationFrame = originalCancelRaf;

  await Then("the promise resolves only after DOM cleanup removes the active node", async () => {
    if (!resolved) {
      throw new Error("Expected frame-sequence animation promise to resolve after final cleanup.");
    }
    if (overlay.querySelectorAll("canvas").length !== 0) {
      throw new Error("Expected no active frame canvas nodes after animation cleanup.");
    }
  });
});

registerTest("FRAME_SEQUENCE_ANIMATOR_THROWS_IF_LAYOUT_CHANGES_DURING_FRAME_ADVANCE", async ({ Given, When, Then }) => {
  const overlay = document.createElement("div");
  overlay.style.position = "relative";
  document.body.appendChild(overlay);

  const frameSources = ["frame-0", "frame-1", "frame-2", "frame-3"] as const;
  const resolvedSpec = resolveSpriteSheetSpec(COMBAT_ANIMATIONS.dustCloud, {
    width: 256,
    height: 64
  });
  const frames = {
    frameWidth: 64,
    frameHeight: 64,
    frameCanvases: createFrameCanvases(frameSources, 64, 64),
    frameDataUrls: frameSources
  } as const;

  const animator = new FrameSequenceAnimator(overlay, {
    resolveSpec: async () => resolvedSpec,
    resolveFrames: async () => frames
  });

  const rafCallbacks: RafCallback[] = [];
  const originalRaf = window.requestAnimationFrame;
  const originalCancelRaf = window.cancelAnimationFrame;

  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  };
  window.cancelAnimationFrame = () => {};
  globalThis.requestAnimationFrame = window.requestAnimationFrame;
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame;

  let caughtError: unknown = null;
  let animationPromise: Promise<void> | null = null;

  await Given("a running frame-sequence animation with a configured image node", async () => {
    animationPromise = animator.playAnimation("dustCloud", 50, 60, 1);
    void animationPromise.catch((error) => {
      caughtError = error;
    });
    // Wait for the animation to configure and add the image element
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  await When("the image layout is mutated before the next frame tick", async () => {
    const surface = overlay.querySelector<HTMLDivElement>("div[data-frame-sequence-surface='true']");
    if (!surface) {
      throw new Error("Expected active frame surface before mutating layout.");
    }
    surface.style.left = "999px";

    const callback = rafCallbacks.shift();
    if (!callback) {
      throw new Error("Expected queued animation callback for invariant check.");
    }

    try {
      callback(performance.now() + 110);
    } catch (error) {
      caughtError = error;
    }

    if (!animationPromise) {
      throw new Error("Expected animation promise to exist for invariant failure verification.");
    }
    await animationPromise.catch(() => undefined);
  });

  window.requestAnimationFrame = originalRaf;
  window.cancelAnimationFrame = originalCancelRaf;
  globalThis.requestAnimationFrame = originalRaf;
  globalThis.cancelAnimationFrame = originalCancelRaf;

  await Then("the frame-sequence guard rejects layout mutation during playback", async () => {
    if (!(caughtError instanceof Error)) {
      throw new Error("Expected frame-sequence guard to throw an Error when layout changes during playback.");
    }
    if (!caughtError.message.includes("mutated layout field containerLeft")) {
      throw new Error(`Expected invariant error to identify containerLeft mutation, received: ${caughtError.message}`);
    }
  });
});

registerTest("FRAME_SEQUENCE_ANIMATOR_REJECTS_FULL_SHEET_URL_FRAME_SOURCES", async ({ Given, When, Then }) => {
  const overlay = document.createElement("div");
  overlay.style.position = "relative";
  document.body.appendChild(overlay);

  const resolvedSpec = resolveSpriteSheetSpec(COMBAT_ANIMATIONS.dustCloud, {
    width: 256,
    height: 64
  });
  const frameSources = [resolvedSpec.imagePath, "frame-1", "frame-2", "frame-3"] as const;
  const frames = {
    frameWidth: 64,
    frameHeight: 64,
    frameCanvases: createFrameCanvases(frameSources, 64, 64),
    frameDataUrls: frameSources
  } as const;

  const animator = new FrameSequenceAnimator(overlay, {
    resolveSpec: async () => resolvedSpec,
    resolveFrames: async () => frames
  });

  let caughtError: unknown = null;

  await Given("a cached frame sequence whose first frame incorrectly points at the full sprite sheet", async () => {
  });

  await When("playback begins", async () => {
    try {
      await animator.playAnimation("dustCloud", 40, 50, 1);
    } catch (error) {
      caughtError = error;
    }
  });

  await Then("the renderer rejects the full-sheet frame source before visible playback continues", async () => {
    if (!(caughtError instanceof Error)) {
      throw new Error("Expected cached playback to reject a full-sheet frame source.");
    }
    if (!caughtError.message.includes("full sprite sheet URL")) {
      throw new Error(`Expected full-sheet source guard to fire, received: ${caughtError.message}`);
    }
    if (overlay.querySelectorAll("canvas").length !== 0) {
      throw new Error("Expected no visible frame nodes after full-sheet cached playback is rejected.");
    }
  });
});
