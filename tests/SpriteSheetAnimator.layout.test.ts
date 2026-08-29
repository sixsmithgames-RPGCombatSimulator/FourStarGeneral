import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import {
  COMBAT_ANIMATIONS,
  getSpriteSheetFrameDuration,
  getSpriteSheetFrameOpacity,
  loadSpriteSheetImage,
  sliceSpriteSheet,
  resolveSpriteSheetSpecAsync
} from "../src/rendering/SpriteSheetAnimator";

registerTest("SPRITESHEET_ANIMATOR_KEEPS_SINGLE_ROW_STRIPS_COMPATIBLE", async ({ Given, When, Then }) => {
  let resolved: Awaited<ReturnType<typeof resolveSpriteSheetSpecAsync>> | null = null;

  await Given("the legacy muzzle-flash strip metadata", async () => {
  });

  await When("sprite-sheet geometry is resolved without image probing", async () => {
    resolved = await resolveSpriteSheetSpecAsync(COMBAT_ANIMATIONS.muzzleFlash);
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

registerTest("SPRITESHEET_ANIMATOR_EXPLOSION_SMALL_SLICE_REMAINS_STRICT_PER_CELL", async ({ Given, When, Then }) => {
  let frames: Awaited<ReturnType<typeof sliceSpriteSheet>> | null = null;

  await Given("the small explosion sprite sheet asset", async () => {
  });

  await When("the renderer slices the sheet into cached frame assets", async () => {
    const asset = await loadSpriteSheetImage(COMBAT_ANIMATIONS.explosionSmall.imagePath);
    frames = await sliceSpriteSheet(
      asset.image,
      COMBAT_ANIMATIONS.explosionSmall.columns!,
      COMBAT_ANIMATIONS.explosionSmall.rows!,
      COMBAT_ANIMATIONS.explosionSmall.frameCount!,
      COMBAT_ANIMATIONS.explosionSmall.anchorX,
      COMBAT_ANIMATIONS.explosionSmall.anchorY
    );
  });

  await Then("cached explosion frames keep the original cell dimensions and spec anchor", async () => {
    if (!frames) {
      throw new Error("Expected cached small-explosion frames to resolve.");
    }
    if (frames.frameWidth !== 256 || frames.frameHeight !== 256) {
      throw new Error(`Expected strict 256x256 cached explosion frames, received ${frames.frameWidth}x${frames.frameHeight}.`);
    }
    if (frames.sourceFrameWidth !== 256 || frames.sourceFrameHeight !== 256) {
      throw new Error(`Expected cached source explosion frames to remain 256x256, received ${frames.sourceFrameWidth}x${frames.sourceFrameHeight}.`);
    }
    if (frames.anchorPixelX !== 128) {
      throw new Error(`Expected small explosion anchorPixelX to remain 128, received ${frames.anchorPixelX}.`);
    }
    if (Math.abs(frames.anchorPixelY - 199.68) > 0.001) {
      throw new Error(`Expected small explosion anchorPixelY to remain 199.68, received ${frames.anchorPixelY}.`);
    }
  });
});

registerTest("SPRITESHEET_ANIMATOR_RESOLVES_MULTI_ROW_EXPLOSION_LAYOUT_AND_STAGED_TIMING", async ({ Given, When, Then }) => {
  let resolved: Awaited<ReturnType<typeof resolveSpriteSheetSpecAsync>> | null = null;
  let earlyDuration = 0;
  let midDuration = 0;
  let lateDuration = 0;
  let preFadeOpacity = 0;
  let fadeStartOpacity = 0;
  let finalOpacity = 0;

  await Given("the new FSG large explosion sheet and its loaded image dimensions", async () => {
  });

  await When("the renderer derives frame geometry and playback characteristics", async () => {
    resolved = await resolveSpriteSheetSpecAsync(COMBAT_ANIMATIONS.explosionLarge);
    earlyDuration = getSpriteSheetFrameDuration(COMBAT_ANIMATIONS.explosionLarge, 1, resolved.frameCount);
    midDuration = getSpriteSheetFrameDuration(COMBAT_ANIMATIONS.explosionLarge, 10, resolved.frameCount);
    lateDuration = getSpriteSheetFrameDuration(COMBAT_ANIMATIONS.explosionLarge, 22, resolved.frameCount);
    preFadeOpacity = getSpriteSheetFrameOpacity(COMBAT_ANIMATIONS.explosionLarge, 14, resolved.frameCount);
    fadeStartOpacity = getSpriteSheetFrameOpacity(COMBAT_ANIMATIONS.explosionLarge, 15, resolved.frameCount);
    finalOpacity = getSpriteSheetFrameOpacity(COMBAT_ANIMATIONS.explosionLarge, 23, resolved.frameCount);
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

registerTest("SPRITESHEET_ANIMATOR_RESOLVES_MULTI_ROW_VEHICLE_HIT_LAYOUT", async ({ Given, When, Then }) => {
  let resolved: Awaited<ReturnType<typeof resolveSpriteSheetSpecAsync>> | null = null;
  let frames: Awaited<ReturnType<typeof sliceSpriteSheet>> | null = null;
  let firstDuration = 0;
  let finalDuration = 0;

  await Given("the new FSG sparks-and-hits sheet and its loaded image dimensions", async () => {
  });

  await When("the renderer derives the impact-hit sprite geometry", async () => {
    resolved = await resolveSpriteSheetSpecAsync(COMBAT_ANIMATIONS.impactHits);
    const asset = await loadSpriteSheetImage(COMBAT_ANIMATIONS.impactHits.imagePath);
    frames = await sliceSpriteSheet(
      asset.image,
      COMBAT_ANIMATIONS.impactHits.columns!,
      COMBAT_ANIMATIONS.impactHits.rows!,
      COMBAT_ANIMATIONS.impactHits.frameCount!,
      COMBAT_ANIMATIONS.impactHits.anchorX,
      COMBAT_ANIMATIONS.impactHits.anchorY
    );
    firstDuration = getSpriteSheetFrameDuration(COMBAT_ANIMATIONS.impactHits, 1, resolved.frameCount);
    finalDuration = getSpriteSheetFrameDuration(COMBAT_ANIMATIONS.impactHits, 48, resolved.frameCount);
  });

  await Then("vehicle hit sprites resolve as the authored 7x7 sheet with normalized frame geometry", async () => {
    if (!resolved || !frames) {
      throw new Error("Expected impact-hit metadata to resolve.");
    }
    if (resolved.columns !== 7 || resolved.rows !== 7 || resolved.frameCount !== 49) {
      throw new Error(`Expected impact-hit sheet to resolve as 7x7/49, received ${resolved.columns}x${resolved.rows}/${resolved.frameCount}.`);
    }
    if (Math.abs(resolved.frameWidth - 1397 / 7) > 0.001 || Math.abs(resolved.frameHeight - 986 / 7) > 0.001) {
      throw new Error(`Expected geometry derived from the 1397x986 authored sheet, received ${resolved.frameWidth}x${resolved.frameHeight}.`);
    }
    if (frames.frameWidth !== 197 || frames.frameHeight !== 138 || frames.frameCanvases.length !== 49) {
      throw new Error(`Expected 49 normalized 197x138 cached frames, received ${frames.frameCanvases.length} at ${frames.frameWidth}x${frames.frameHeight}.`);
    }
    if (resolved.renderScale >= COMBAT_ANIMATIONS.explosionSmall.renderScale!) {
      throw new Error("Expected vehicle-hit sprites to render smaller than explosion sprites.");
    }
    if (!(firstDuration < finalDuration)) {
      throw new Error(`Expected vehicle-hit playback to slow slightly into the tail, received first=${firstDuration}, final=${finalDuration}.`);
    }
  });
});
