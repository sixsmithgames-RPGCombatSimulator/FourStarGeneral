import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import {
  COMBAT_ANIMATIONS,
  getSpriteSheetFrameDuration,
  getSpriteSheetFrameOpacity,
  resolveSpriteSheetSpec
} from "../src/rendering/SpriteSheetAnimator";

registerTest("SPRITESHEET_ANIMATOR_KEEPS_SINGLE_ROW_STRIPS_COMPATIBLE", async ({ Given, When, Then }) => {
  let resolved: ReturnType<typeof resolveSpriteSheetSpec> | null = null;

  await Given("the legacy muzzle-flash strip metadata", async () => {
  });

  await When("sprite-sheet geometry is resolved without image probing", async () => {
    resolved = resolveSpriteSheetSpec(COMBAT_ANIMATIONS.muzzleFlash);
  });

  await Then("the animation stays a one-row strip with derived sheet dimensions", async () => {
    if (!resolved) {
      throw new Error("Expected muzzle-flash metadata to resolve.");
    }
    if (resolved.columns !== 4 || resolved.rows !== 1) {
      throw new Error(`Expected muzzle-flash strip to resolve as 4x1, received ${resolved.columns}x${resolved.rows}.`);
    }
    if (resolved.frameWidth !== 64 || resolved.frameHeight !== 64) {
      throw new Error(`Expected 64x64 muzzle-flash frames, received ${resolved.frameWidth}x${resolved.frameHeight}.`);
    }
    if (resolved.sheetWidth !== 256 || resolved.sheetHeight !== 64) {
      throw new Error(`Expected derived legacy sheet size 256x64, received ${resolved.sheetWidth}x${resolved.sheetHeight}.`);
    }
  });
});

registerTest("SPRITESHEET_ANIMATOR_RESOLVES_MULTI_ROW_EXPLOSION_LAYOUT_AND_STAGED_TIMING", async ({ Given, When, Then }) => {
  let resolved: ReturnType<typeof resolveSpriteSheetSpec> | null = null;
  let earlyDuration = 0;
  let midDuration = 0;
  let lateDuration = 0;
  let preFadeOpacity = 0;
  let fadeStartOpacity = 0;
  let finalOpacity = 0;

  await Given("the new FSG large explosion sheet and its loaded image dimensions", async () => {
  });

  await When("the renderer derives frame geometry and playback characteristics", async () => {
    const metrics = resolveSpriteSheetSpec(COMBAT_ANIMATIONS.explosionLarge, {
      width: 1536,
      height: 1024
    });
    resolved = metrics;
    earlyDuration = getSpriteSheetFrameDuration(COMBAT_ANIMATIONS.explosionLarge, 1, metrics.frameCount);
    midDuration = getSpriteSheetFrameDuration(COMBAT_ANIMATIONS.explosionLarge, 10, metrics.frameCount);
    lateDuration = getSpriteSheetFrameDuration(COMBAT_ANIMATIONS.explosionLarge, 22, metrics.frameCount);
    preFadeOpacity = getSpriteSheetFrameOpacity(COMBAT_ANIMATIONS.explosionLarge, 14, metrics.frameCount);
    fadeStartOpacity = getSpriteSheetFrameOpacity(COMBAT_ANIMATIONS.explosionLarge, 15, metrics.frameCount);
    finalOpacity = getSpriteSheetFrameOpacity(COMBAT_ANIMATIONS.explosionLarge, 23, metrics.frameCount);
  });

  await Then("the explosion uses a 6x4 grid with a faster blast front and a faded smoke tail", async () => {
    if (!resolved) {
      throw new Error("Expected explosion metadata to resolve.");
    }
    if (resolved.columns !== 6 || resolved.rows !== 4) {
      throw new Error(`Expected large explosion sheet to resolve as 6x4, received ${resolved.columns}x${resolved.rows}.`);
    }
    if (resolved.frameWidth !== 256 || resolved.frameHeight !== 256) {
      throw new Error(`Expected 256x256 explosion frames, received ${resolved.frameWidth}x${resolved.frameHeight}.`);
    }
    if (resolved.frameCount !== 24) {
      throw new Error(`Expected 24 explosion frames, received ${resolved.frameCount}.`);
    }
    if (!(earlyDuration < midDuration && midDuration < lateDuration)) {
      throw new Error(`Expected staged timing to slow over time, received early=${earlyDuration}, mid=${midDuration}, late=${lateDuration}.`);
    }
    if (preFadeOpacity !== 1 || fadeStartOpacity !== 1) {
      throw new Error(`Expected smoke fade to start after frame 15, received preFade=${preFadeOpacity}, fadeStart=${fadeStartOpacity}.`);
    }
    if (finalOpacity !== 0) {
      throw new Error(`Expected final explosion frame to fully fade, received opacity ${finalOpacity}.`);
    }
  });
});
