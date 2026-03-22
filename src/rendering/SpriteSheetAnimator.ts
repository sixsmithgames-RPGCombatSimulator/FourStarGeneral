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
    renderScale: 0.45,
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
    renderScale: 0.55,
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
  const cached = spriteSheetImageCache.get(imagePath);
  if (cached) {
    return cached;
  }

  const pending = new Promise<SpriteSheetImageAsset>((resolve, reject) => {
    if (typeof Image !== "function") {
      reject(new Error(`Image loading is unavailable while resolving sprite sheet ${imagePath}.`));
      return;
    }

    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      resolve({
        image,
        width: image.naturalWidth,
        height: image.naturalHeight
      });
    };
    image.onerror = () => {
      spriteSheetImageCache.delete(imagePath);
      reject(new Error(`Failed to load sprite sheet image: ${imagePath}`));
    };
    image.src = imagePath;

    if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
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
 * Instances are reusable so the animator can pool them for repeated explosions.
 */
export class SpriteSheetAnimation {
  private spec: ResolvedSpriteSheetSpec | null = null;
  private currentFrame = 0;
  private lastFrameTimestamp = 0;
  private positionX = 0;
  private positionY = 0;
  private scale = 1;
  private isPlaying = false;
  private onComplete?: () => void;

  private readonly container: SVGGElement;
  private readonly defs: SVGDefsElement;
  private readonly clipPath: SVGClipPathElement;
  private readonly clipRect: SVGRectElement;
  private readonly element: SVGImageElement;

  constructor() {
    this.container = document.createElementNS(SVG_NS, "g");
    this.container.style.pointerEvents = "none";

    this.defs = document.createElementNS(SVG_NS, "defs");
    this.clipPath = document.createElementNS(SVG_NS, "clipPath");
    this.clipPath.setAttribute("id", `sprite-clip-${Math.random().toString(36).slice(2)}`);
    this.clipPath.setAttribute("clipPathUnits", "userSpaceOnUse");

    this.clipRect = document.createElementNS(SVG_NS, "rect");
    this.clipPath.appendChild(this.clipRect);
    this.defs.appendChild(this.clipPath);
    this.container.appendChild(this.defs);

    this.element = document.createElementNS(SVG_NS, "image");
    this.element.setAttribute("clip-path", `url(#${this.clipPath.getAttribute("id")})`);
    this.container.appendChild(this.element);
  }

  configure(
    spec: ResolvedSpriteSheetSpec,
    svgParent: SVGElement,
    x: number,
    y: number,
    scale: number = 1
  ): void {
    console.log(`[SpriteSheetAnimation] configure - pos: (${x}, ${y}), scale: ${scale}, renderScale: ${spec.renderScale}`);
    this.stop();
    this.spec = spec;
    this.currentFrame = 0;
    this.positionX = x;
    this.positionY = y;
    this.scale = scale * spec.renderScale;
    this.container.style.opacity = "1";

    this.element.setAttributeNS(XLINK_NS, "href", spec.imagePath);
    this.element.setAttribute("width", String(spec.sheetWidth * this.scale));
    this.element.setAttribute("height", String(spec.sheetHeight * this.scale));

    const frameWidth = spec.frameWidth * this.scale;
    const frameHeight = spec.frameHeight * this.scale;
    const left = this.positionX - frameWidth * spec.anchorX;
    const top = this.positionY - frameHeight * spec.anchorY;

    this.clipRect.setAttribute("x", String(left));
    this.clipRect.setAttribute("y", String(top));
    this.clipRect.setAttribute("width", String(frameWidth));
    this.clipRect.setAttribute("height", String(frameHeight));

    console.log(`[SpriteSheetAnimation] Container parent before: ${this.container.parentNode?.nodeName}, target parent: ${svgParent.nodeName}`);
    if (this.container.parentNode !== svgParent) {
      svgParent.appendChild(this.container);
      console.log(`[SpriteSheetAnimation] Container appended to ${svgParent.nodeName}, isConnected: ${this.container.isConnected}`);
    } else {
      console.log(`[SpriteSheetAnimation] Container already attached to correct parent`);
    }

    this.updateFrame(0);
    console.log(`[SpriteSheetAnimation] configure complete - container opacity: ${this.container.style.opacity}, isConnected: ${this.container.isConnected}`);
  }

  private updateFrame(frameIndex: number): void {
    if (!this.spec) {
      return;
    }

    const column = frameIndex % this.spec.columns;
    const row = Math.floor(frameIndex / this.spec.columns);
    const frameWidth = this.spec.frameWidth * this.scale;
    const frameHeight = this.spec.frameHeight * this.scale;
    const left = this.positionX - frameWidth * this.spec.anchorX;
    const top = this.positionY - frameHeight * this.spec.anchorY;
    const xOffset = left - column * frameWidth;
    const yOffset = top - row * frameHeight;

    this.element.setAttribute("transform", `translate(${xOffset}, ${yOffset})`);
    this.container.style.opacity = String(getSpriteSheetFrameOpacity(this.spec, frameIndex, this.spec.frameCount));
  }

  play(onComplete?: () => void): void {
    console.log(`[SpriteSheetAnimation] play called - spec exists: ${!!this.spec}, container connected: ${this.container.isConnected}`);
    if (!this.spec) {
      console.warn("[SpriteSheetAnimation] play aborted - no spec");
      onComplete?.();
      return;
    }

    this.isPlaying = true;
    this.currentFrame = 0;
    this.lastFrameTimestamp = performance.now();
    this.onComplete = onComplete;
    this.updateFrame(0);
    console.log(`[SpriteSheetAnimation] Starting animation - frameCount: ${this.spec.frameCount}, isPlaying: ${this.isPlaying}`);
    requestAnimationFrame(this.tick);
  }

  private readonly tick = (currentTime: number): void => {
    if (!this.isPlaying || !this.spec) {
      return;
    }

    let remainingElapsed = currentTime - this.lastFrameTimestamp;
    let frameDuration = getSpriteSheetFrameDuration(this.spec, this.currentFrame, this.spec.frameCount);

    while (remainingElapsed >= frameDuration && this.isPlaying) {
      remainingElapsed -= frameDuration;
      this.lastFrameTimestamp += frameDuration;

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

      frameDuration = getSpriteSheetFrameDuration(this.spec, this.currentFrame, this.spec.frameCount);
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
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

/**
 * Factory for creating and managing combat animations.
 */
export class SpriteSheetAnimator {
  private readonly svgElement: SVGElement;
  private readonly activeAnimations: Set<SpriteSheetAnimation> = new Set();
  private readonly animationPool = new Map<string, SpriteSheetAnimation[]>();
  private readonly resolvedSpecCache = new Map<string, Promise<ResolvedSpriteSheetSpec>>();

  constructor(svgElement: SVGElement) {
    this.svgElement = svgElement;
  }

  private getSpecCacheKey(animationType: keyof typeof COMBAT_ANIMATIONS): string {
    return String(animationType);
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
    const cacheKey = this.getSpecCacheKey(animationType);
    const cached = this.resolvedSpecCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const spec = COMBAT_ANIMATIONS[animationType];
    const pending = resolveSpriteSheetSpecAsync(spec).catch((error) => {
      this.resolvedSpecCache.delete(cacheKey);
      throw error;
    });

    this.resolvedSpecCache.set(cacheKey, pending);
    return pending;
  }

  /**
   * Plays a combat animation anchored at the supplied coordinates.
   * Anchor defaults are carried by the animation spec so tall explosions can rise above the impact hex.
   */
  async playAnimation(
    animationType: keyof typeof COMBAT_ANIMATIONS,
    x: number,
    y: number,
    scale: number = 1
  ): Promise<void> {
    console.log(`[SpriteSheetAnimator] playAnimation START - type: ${animationType}, pos: (${x}, ${y}), scale: ${scale}`);
    console.log("[SpriteSheetAnimator] SVG element:", this.svgElement, "isConnected:", this.svgElement?.isConnected);

    const resolvedSpec = await this.getResolvedSpec(animationType);
    console.log(`[SpriteSheetAnimator] Resolved spec for ${animationType}:`, resolvedSpec);

    return new Promise((resolve) => {
      const pool = this.getAnimationPool(animationType);
      const animation = pool.pop() ?? new SpriteSheetAnimation();
      console.log(`[SpriteSheetAnimator] Animation instance obtained (from pool: ${pool.length > 0})`);

      this.activeAnimations.add(animation);
      console.log(`[SpriteSheetAnimator] Configuring animation...`);
      animation.configure(resolvedSpec, this.svgElement, x, y, scale);
      console.log(`[SpriteSheetAnimator] Starting animation playback...`);
      animation.play(() => {
        console.log(`[SpriteSheetAnimator] Animation ${animationType} completed, cleaning up`);
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
