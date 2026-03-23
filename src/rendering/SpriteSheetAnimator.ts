/**
 * Sprite sheet animator for combat effects.
 * Handles frame-by-frame playback of sprite sheet animations (muzzle flashes, explosions, etc.)
 */

export interface SpriteSheetSpec {
  imagePath: string;
  columns?: number;
  rows?: number;
  frameWidth?: number;
  frameHeight?: number;
  frameCount?: number;
  frameDuration?: number; // milliseconds per frame when staged timing is not supplied
  getFrameDuration?: (frameIndex: number, totalFrames: number) => number;
  loop: boolean;
  renderScale?: number;
  anchorX?: number;
  anchorY?: number;
  fadeOutStartFrame?: number;
}

export interface ResolvedSpriteSheetSpec extends SpriteSheetSpec {
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  renderScale: number;
  anchorX: number;
  anchorY: number;
  sheetWidth: number;
  sheetHeight: number;
}

interface SpriteSheetImageAsset {
  image: HTMLImageElement;
  width: number;
  height: number;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

/**
 * Holds pre-sliced per-frame data URLs for a single animation type.
 * Produced once by `sliceSpriteSheet` and cached for the lifetime of the session.
 */
interface CachedFrameSet {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly frameDataUrls: readonly string[];
}

/**
 * Module-level cache so each animation type is sliced only once.
 * Keyed by `SpriteSheetSpec.imagePath` to deduplicate across animator instances.
 */
const slicedFrameCache = new Map<string, Promise<CachedFrameSet>>();

/**
 * Slices a loaded sprite sheet into individual per-frame PNG data URLs using an
 * offscreen canvas.  Each frame is cropped with a 1 source-pixel inset on every
 * side to eliminate neighbor-frame bleed that SVG image scaling can introduce.
 */
async function sliceSpriteSheet(
  image: HTMLImageElement,
  columns: number,
  rows: number,
  frameWidth: number,
  frameHeight: number,
  frameCount: number
): Promise<CachedFrameSet> {
  const frameDataUrls: string[] = [];
  const inset = 1; // source-pixel border trimmed from each side

  for (let i = 0; i < frameCount; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);

    // Source rectangle inside the sheet (inset by 1px to avoid sampling neighbors)
    const sx = col * frameWidth + inset;
    const sy = row * frameHeight + inset;
    const sw = frameWidth - inset * 2;
    const sh = frameHeight - inset * 2;

    const canvas = document.createElement("canvas");
    canvas.width = frameWidth;
    canvas.height = frameHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error(`[SpriteSheet] Could not obtain 2D context for frame ${i} slicing.`);
    }
    ctx.clearRect(0, 0, frameWidth, frameHeight);

    // Draw the inset source rectangle back into the full frame, preserving
    // the 1px transparent border that guards against sampling artifacts.
    ctx.drawImage(
      image,
      sx, sy, sw, sh,
      inset, inset, frameWidth - inset * 2, frameHeight - inset * 2
    );

    frameDataUrls.push(canvas.toDataURL("image/png"));
  }

  console.log(`[SpriteSheet] Sliced ${frameCount} frames (${frameWidth}x${frameHeight}) from ${columns}x${rows} sheet`);
  return { frameWidth, frameHeight, frameDataUrls };
}

// Import animation assets using Vite's new URL() syntax for proper bundling
const muzzleFlashUrl = new URL("../assets/combat animations/muzzle_flash.png", import.meta.url).href;
const explosionSmallUrl = new URL("../assets/combat animations/FSG_Explosion_Small.png", import.meta.url).href;
const explosionLargeUrl = new URL("../assets/combat animations/FSG_Explosion_Large.png", import.meta.url).href;
const impactHitsUrl = new URL("../assets/combat animations/FSG_Sparks_and_Hits.png", import.meta.url).href;
const dustCloudUrl = new URL("../assets/combat animations/dust_cloud.png", import.meta.url).href;
const tracerUrl = new URL("../assets/combat animations/tracer.png", import.meta.url).href;

function largeExplosionFrameDuration(frameIndex: number): number {
  if (frameIndex < 3) return 40;
  if (frameIndex < 9) return 58;
  if (frameIndex < 16) return 72;
  return 96;
}

function smallExplosionFrameDuration(frameIndex: number): number {
  if (frameIndex < 4) return 34;
  if (frameIndex < 10) return 46;
  if (frameIndex < 16) return 60;
  return 80;
}

function impactHitsFrameDuration(frameIndex: number): number {
  if (frameIndex < 4) return 18;
  if (frameIndex < 10) return 24;
  if (frameIndex < 16) return 30;
  return 36;
}

/**
 * Pre-defined animation specifications for combat effects.
 */
export const COMBAT_ANIMATIONS: Record<string, SpriteSheetSpec> = {
  muzzleFlash: {
    imagePath: muzzleFlashUrl,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 4,
    frameDuration: 50,
    loop: false
  },
  explosionSmall: {
    imagePath: explosionSmallUrl,
    columns: 6,
    rows: 4,
    frameCount: 24,
    loop: false,
    frameWidth: 64,
    frameHeight: 64,
    renderScale: 1.5,
    anchorX: 0.5,
    anchorY: 0.78,
    fadeOutStartFrame: 16,
    getFrameDuration: (frameIndex) => smallExplosionFrameDuration(frameIndex)
  },
  explosionLarge: {
    imagePath: explosionLargeUrl,
    columns: 6,
    rows: 4,
    frameCount: 24,
    loop: false,
    frameWidth: 64,
    frameHeight: 64,
    renderScale: 2.0,
    anchorX: 0.5,
    anchorY: 0.8,
    fadeOutStartFrame: 15,
    getFrameDuration: (frameIndex) => largeExplosionFrameDuration(frameIndex)
  },
  impactHits: {
    imagePath: impactHitsUrl,
    columns: 6,
    rows: 4,
    frameCount: 24,
    loop: false,
    renderScale: 0.24,
    anchorX: 0.5,
    anchorY: 0.5,
    fadeOutStartFrame: 16,
    getFrameDuration: (frameIndex) => impactHitsFrameDuration(frameIndex)
  },
  dustCloud: {
    imagePath: dustCloudUrl,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 5,
    frameDuration: 100,
    loop: false
  },
  tracer: {
    imagePath: tracerUrl,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 1,
    frameDuration: 100,
    loop: false
  }
} as const;

function normalizePositiveInt(value: number | undefined): number | null {
  if (!Number.isFinite(value) || value == null) {
    return null;
  }
  const normalized = Math.round(value);
  return normalized > 0 ? normalized : null;
}

function normalizePositiveNumber(value: number | undefined): number | null {
  if (!Number.isFinite(value) || value == null) {
    return null;
  }
  return value > 0 ? value : null;
}

/**
 * Resolves sprite-sheet geometry from either explicit frame dimensions or an image-backed grid.
 * Multi-row sheets can specify only `columns`/`rows`; the frame size is derived from the loaded image.
 */
export function resolveSpriteSheetSpec(
  spec: SpriteSheetSpec,
  imageDimensions?: { width: number; height: number }
): ResolvedSpriteSheetSpec {
  const imageWidth = normalizePositiveNumber(imageDimensions?.width ?? 0);
  const imageHeight = normalizePositiveNumber(imageDimensions?.height ?? 0);

  let columns = normalizePositiveInt(spec.columns);
  let rows = normalizePositiveInt(spec.rows);
  let frameWidth = normalizePositiveNumber(spec.frameWidth);
  let frameHeight = normalizePositiveNumber(spec.frameHeight);
  const requestedFrameCount = normalizePositiveInt(spec.frameCount) ?? null;

  if (!columns) {
    if (frameWidth && imageWidth) {
      columns = Math.max(1, Math.round(imageWidth / frameWidth));
    } else if (requestedFrameCount) {
      columns = requestedFrameCount;
    } else {
      columns = 1;
    }
  }

  if (!rows) {
    if (frameHeight && imageHeight) {
      rows = Math.max(1, Math.round(imageHeight / frameHeight));
    } else if (requestedFrameCount) {
      rows = Math.max(1, Math.ceil(requestedFrameCount / columns));
    } else {
      rows = 1;
    }
  }

  if (!frameWidth) {
    if (!imageWidth) {
      throw new Error(`Sprite sheet ${spec.imagePath} is missing frameWidth and image width metadata.`);
    }
    frameWidth = imageWidth / columns;
  }

  if (!frameHeight) {
    if (!imageHeight) {
      throw new Error(`Sprite sheet ${spec.imagePath} is missing frameHeight and image height metadata.`);
    }
    frameHeight = imageHeight / rows;
  }

  const availableFrameSlots = Math.max(1, columns * rows);
  const frameCount = Math.max(1, Math.min(requestedFrameCount ?? availableFrameSlots, availableFrameSlots));
  const sheetWidth = imageWidth ?? frameWidth * columns;
  const sheetHeight = imageHeight ?? frameHeight * rows;

  return {
    ...spec,
    columns,
    rows,
    frameWidth,
    frameHeight,
    frameCount,
    renderScale: normalizePositiveNumber(spec.renderScale ?? 1) ?? 1,
    anchorX: spec.anchorX ?? 0.5,
    anchorY: spec.anchorY ?? 0.5,
    sheetWidth,
    sheetHeight
  };
}

/**
 * Returns the display duration of a single frame, honoring staged timing when provided.
 */
export function getSpriteSheetFrameDuration(spec: SpriteSheetSpec, frameIndex: number, totalFrames: number): number {
  const duration = typeof spec.getFrameDuration === "function"
    ? spec.getFrameDuration(frameIndex, totalFrames)
    : spec.frameDuration;
  return Math.max(1, Math.round(duration ?? 100));
}

/**
 * Returns the per-frame opacity used for the optional smoke fade-out in the tail of an animation.
 */
export function getSpriteSheetFrameOpacity(spec: SpriteSheetSpec, frameIndex: number, totalFrames: number): number {
  const fadeOutStartFrame = normalizePositiveInt(spec.fadeOutStartFrame ?? 0);
  if (fadeOutStartFrame == null || frameIndex < fadeOutStartFrame || totalFrames <= fadeOutStartFrame + 1) {
    return 1;
  }

  const fadeFrameSpan = Math.max(1, totalFrames - fadeOutStartFrame - 1);
  const fadeProgress = Math.max(0, frameIndex - fadeOutStartFrame) / fadeFrameSpan;
  return Math.max(0, 1 - fadeProgress);
}

const spriteSheetImageCache = new Map<string, Promise<SpriteSheetImageAsset>>();

function loadSpriteSheetImage(imagePath: string): Promise<SpriteSheetImageAsset> {
  console.log(`[SpriteSheet] loadSpriteSheetImage for: ${imagePath}`);
  const cached = spriteSheetImageCache.get(imagePath);
  if (cached) {
    console.log(`[SpriteSheet] Found cached image: ${imagePath}`);
    return cached;
  }

  console.log(`[SpriteSheet] Loading new image: ${imagePath}`);
  const pending = new Promise<SpriteSheetImageAsset>((resolve, reject) => {
    if (typeof Image !== "function") {
      reject(new Error(`Image loading is unavailable while resolving sprite sheet ${imagePath}.`));
      return;
    }

    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      console.log(`[SpriteSheet] Image loaded: ${imagePath}, dimensions: ${image.naturalWidth}x${image.naturalHeight}`);
      resolve({
        image,
        width: image.naturalWidth,
        height: image.naturalHeight
      });
    };
    image.onerror = () => {
      console.error(`[SpriteSheet] Failed to load image: ${imagePath}`);
      spriteSheetImageCache.delete(imagePath);
      reject(new Error(`Failed to load sprite sheet image: ${imagePath}`));
    };
    image.src = imagePath;

    if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
      console.log(`[SpriteSheet] Image already complete: ${imagePath}`);
      resolve({
        image,
        width: image.naturalWidth,
        height: image.naturalHeight
      });
    }
  });

  spriteSheetImageCache.set(imagePath, pending);
  return pending;
}

function requiresLoadedImage(spec: SpriteSheetSpec): boolean {
  return spec.frameWidth == null || spec.frameHeight == null;
}

async function resolveSpriteSheetSpecAsync(spec: SpriteSheetSpec): Promise<ResolvedSpriteSheetSpec> {
  if (!requiresLoadedImage(spec)) {
    return resolveSpriteSheetSpec(spec);
  }

  const asset = await loadSpriteSheetImage(spec.imagePath);
  void asset.image;

  return resolveSpriteSheetSpec(spec, {
    width: asset.width,
    height: asset.height
  });
}

/**
 * Manages playback of a single sprite sheet animation instance.
 * Uses pre-sliced per-frame data URLs — each tick swaps the `<image>` href to
 * the next frame.  No live sheet cropping, no clip-path, no nested SVG viewport.
 * Instances are reusable so the animator can pool them for repeated explosions.
 */
export class SpriteSheetAnimation {
  private spec: ResolvedSpriteSheetSpec | null = null;
  private cachedFrames: CachedFrameSet | null = null;
  private currentFrame = 0;
  private lastFrameTimestamp = 0;
  private positionX = 0;
  private positionY = 0;
  private scale = 1;
  private isPlaying = false;
  private onComplete?: () => void;

  private readonly container: SVGGElement;
  /** Single image element whose href is swapped to the current pre-sliced frame. */
  private readonly imageElement: SVGImageElement;

  constructor() {
    this.container = document.createElementNS(SVG_NS, "g");
    this.container.style.pointerEvents = "none";

    this.imageElement = document.createElementNS(SVG_NS, "image");
    this.imageElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
    this.container.appendChild(this.imageElement);
  }

  /**
   * Prepares the animation for playback using pre-sliced frame data URLs.
   * Positions a single `<image>` at the destination rectangle on the map.
   */
  configure(
    spec: ResolvedSpriteSheetSpec,
    frames: CachedFrameSet,
    svgParent: SVGElement,
    x: number,
    y: number,
    scale: number = 1
  ): void {
    console.log(`[Animation] configure - pos: (${x}, ${y}), scale: ${scale}, renderScale: ${spec.renderScale}`);
    this.stop();
    this.spec = spec;
    this.cachedFrames = frames;
    this.currentFrame = 0;
    this.positionX = x;
    this.positionY = y;
    this.scale = scale * spec.renderScale;
    this.container.style.opacity = "1";

    // Position the image at the destination rectangle on the map
    const destW = spec.frameWidth * this.scale;
    const destH = spec.frameHeight * this.scale;
    const destX = this.positionX - destW * spec.anchorX;
    const destY = this.positionY - destH * spec.anchorY;

    this.imageElement.setAttribute("x", String(destX));
    this.imageElement.setAttribute("y", String(destY));
    this.imageElement.setAttribute("width", String(destW));
    this.imageElement.setAttribute("height", String(destH));
    console.log(`[Animation] Image rect: dest=(${destX.toFixed(1)}, ${destY.toFixed(1)}) size=${destW.toFixed(1)}x${destH.toFixed(1)}, frames=${frames.frameDataUrls.length}`);

    // Append animation container to effects layer (svgParent)
    if (this.container.parentNode !== svgParent) {
      svgParent.appendChild(this.container);
      console.log(`[Animation] Container appended to effects layer`);
    }

    // CRITICAL ASSERTION: Verify container is actually in the effects layer
    if (this.container.parentNode !== svgParent) {
      throw new Error(`[Animation] CRITICAL: Animation container was not appended to effects layer! Parent: ${this.container.parentNode?.nodeName}`);
    }

    this.updateFrame(0);
    console.log(`[Animation] configure complete`);
  }

  /**
   * Swaps the image href to the pre-sliced data URL for the given frame index.
   * No sheet translation, no clip-path — just a direct URL swap.
   */
  private updateFrame(frameIndex: number): void {
    if (!this.spec || !this.cachedFrames) {
      return;
    }

    const dataUrl = this.cachedFrames.frameDataUrls[frameIndex];
    if (!dataUrl) {
      console.error(`[Animation] Missing pre-sliced frame ${frameIndex}/${this.cachedFrames.frameDataUrls.length}`);
      return;
    }

    const opacity = getSpriteSheetFrameOpacity(this.spec, frameIndex, this.spec.frameCount);

    // Swap to pre-sliced frame — both href and xlink:href for browser compatibility
    this.imageElement.setAttribute("href", dataUrl);
    this.imageElement.setAttributeNS(XLINK_NS, "href", dataUrl);
    this.container.style.opacity = String(opacity);
  }

  play(onComplete?: () => void): void {
    console.log(`[Animation] play called - has spec: ${!!this.spec}, container connected: ${this.container.isConnected}`);
    if (!this.spec || !this.cachedFrames) {
      console.log(`[Animation] play aborted - no spec or no cached frames`);
      onComplete?.();
      return;
    }

    this.isPlaying = true;
    this.currentFrame = 0;
    this.lastFrameTimestamp = performance.now();
    this.onComplete = onComplete;
    this.updateFrame(0);
    console.log(`[Animation] Starting requestAnimationFrame loop, frameCount: ${this.spec.frameCount}`);
    requestAnimationFrame(this.tick);
  }

  private readonly tick = (currentTime: number): void => {
    if (!this.isPlaying || !this.spec) {
      return;
    }

    const elapsed = currentTime - this.lastFrameTimestamp;
    const frameDuration = getSpriteSheetFrameDuration(this.spec, this.currentFrame, this.spec.frameCount);

    // Only advance ONE frame per tick to ensure each frame is visible.
    // Otherwise large delays can cause the animation to skip frames invisibly.
    if (elapsed >= frameDuration) {
      this.lastFrameTimestamp = currentTime;

      const nextFrame = this.currentFrame + 1;
      if (nextFrame >= this.spec.frameCount) {
        if (this.spec.loop) {
          this.currentFrame = 0;
          this.updateFrame(0);
        } else {
          this.finish();
          return;
        }
      } else {
        this.currentFrame = nextFrame;
        this.updateFrame(this.currentFrame);
      }
    }

    requestAnimationFrame(this.tick);
  };

  private finish(): void {
    this.stop();
    const completion = this.onComplete;
    this.onComplete = undefined;
    completion?.();
  }

  stop(): void {
    this.isPlaying = false;
  }

  release(): void {
    this.stop();
    this.onComplete = undefined;
    this.container.style.opacity = "0";

    // Remove container from effects layer
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

/**
 * Factory for creating and managing combat animations.
 * Pre-slices sprite sheets into individual frame data URLs on first use per
 * animation type, then swaps a single `<image>` href per tick during playback.
 */
export class SpriteSheetAnimator {
  private readonly svgElement: SVGElement;
  private readonly activeAnimations: Set<SpriteSheetAnimation> = new Set();
  private readonly animationPool = new Map<string, SpriteSheetAnimation[]>();
  private readonly resolvedSpecCache = new Map<string, Promise<ResolvedSpriteSheetSpec>>();

  constructor(svgElement: SVGElement) {
    this.svgElement = svgElement;
  }

  private getAnimationPool(animationType: keyof typeof COMBAT_ANIMATIONS): SpriteSheetAnimation[] {
    const key = String(animationType);
    let pool = this.animationPool.get(key);
    if (!pool) {
      pool = [];
      this.animationPool.set(key, pool);
    }
    return pool;
  }

  private async getResolvedSpec(animationType: keyof typeof COMBAT_ANIMATIONS): Promise<ResolvedSpriteSheetSpec> {
    const cacheKey = String(animationType);
    const cached = this.resolvedSpecCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const spec = COMBAT_ANIMATIONS[animationType];
    const pending = resolveSpriteSheetSpecAsync(spec).catch((error) => {
      console.error(`[SpriteSheetAnimator] Failed to resolve spec for ${animationType}:`, error);
      this.resolvedSpecCache.delete(cacheKey);
      throw error;
    });

    this.resolvedSpecCache.set(cacheKey, pending);
    return pending;
  }

  /**
   * Ensures the sprite sheet for the given spec is sliced into per-frame data URLs.
   * Returns the cached frame set, slicing on first call per image path.
   */
  private async ensureSlicedFrames(spec: ResolvedSpriteSheetSpec): Promise<CachedFrameSet> {
    const cacheKey = spec.imagePath;
    const cached = slicedFrameCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const pending = loadSpriteSheetImage(spec.imagePath).then((asset) =>
      sliceSpriteSheet(
        asset.image,
        spec.columns,
        spec.rows,
        spec.frameWidth,
        spec.frameHeight,
        spec.frameCount
      )
    ).catch((error) => {
      console.error(`[SpriteSheetAnimator] Failed to slice frames for ${cacheKey}:`, error);
      slicedFrameCache.delete(cacheKey);
      throw error;
    });

    slicedFrameCache.set(cacheKey, pending);
    return pending;
  }

  /**
   * Plays a combat animation anchored at the supplied coordinates.
   * On first call per animation type, the sprite sheet is loaded and pre-sliced
   * into individual frame data URLs.  Subsequent calls reuse the cached frames.
   */
  async playAnimation(
    animationType: keyof typeof COMBAT_ANIMATIONS,
    x: number,
    y: number,
    scale: number = 1
  ): Promise<void> {
    console.log(`[SpriteSheetAnimator] playAnimation called - type: ${animationType}, pos: (${x}, ${y}), scale: ${scale}`);
    const resolvedSpec = await this.getResolvedSpec(animationType);
    const frames = await this.ensureSlicedFrames(resolvedSpec);
    console.log(`[SpriteSheetAnimator] Spec resolved, frames cached: ${frames.frameDataUrls.length}`);

    return new Promise((resolve) => {
      const pool = this.getAnimationPool(animationType);
      const animation = pool.pop() ?? new SpriteSheetAnimation();

      this.activeAnimations.add(animation);
      animation.configure(resolvedSpec, frames, this.svgElement, x, y, scale);
      animation.play(() => {
        animation.release();
        this.activeAnimations.delete(animation);
        pool.push(animation);
        resolve();
      });
    });
  }

  /**
   * Stops all active animations.
   */
  stopAll(): void {
    this.activeAnimations.forEach((animation) => {
      animation.release();
    });
    this.activeAnimations.clear();
  }
}
