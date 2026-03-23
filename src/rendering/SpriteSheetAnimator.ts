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
 * Resolves sprite href for SVG <image> elements.
 * Vite-bundled assets and data URLs work directly - no conversion needed.
 */
function resolveSpriteHref(src: string): string {
  if (src.startsWith("data:")) return src;
  if (src.startsWith("blob:")) return src;
  return src; // https: or relative asset URL - use directly
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
  /** Nested SVG element that acts as a viewport window, cropping the sheet via viewBox. */
  private readonly frameSvg: SVGSVGElement;
  /** Full sprite sheet image rendered inside the nested SVG viewport. */
  private readonly imageElement: SVGImageElement;

  constructor() {
    this.container = document.createElementNS(SVG_NS, "g");
    this.container.style.pointerEvents = "none";

    // The nested <svg> acts as a fixed viewport window with overflow:hidden
    // We shift the image inside it to show different frames
    this.frameSvg = document.createElementNS(SVG_NS, "svg");
    this.frameSvg.setAttribute("overflow", "hidden");
    this.frameSvg.style.overflow = "hidden"; // Set both for browser compatibility

    this.imageElement = document.createElementNS(SVG_NS, "image");
    this.imageElement.setAttribute("preserveAspectRatio", "none"); // Don't scale/fit the image
    this.frameSvg.appendChild(this.imageElement);
    this.container.appendChild(this.frameSvg);
  }

  configure(
    spec: ResolvedSpriteSheetSpec,
    svgParent: SVGElement,
    x: number,
    y: number,
    scale: number = 1
  ): void {
    console.log(`[Animation] configure - pos: (${x}, ${y}), scale: ${scale}, renderScale: ${spec.renderScale}`);
    this.stop();
    this.spec = spec;
    this.currentFrame = 0;
    this.positionX = x;
    this.positionY = y;
    this.scale = scale * spec.renderScale;
    this.container.style.opacity = "1";

    // Use the original sprite URL directly (Vite handles bundled assets correctly)
    const href = resolveSpriteHref(spec.imagePath);
    console.log(`[Animation] Setting sprite href: ${href}`);

    // Set both href and xlink:href for maximum browser compatibility
    this.imageElement.setAttribute("href", href);
    this.imageElement.setAttributeNS(XLINK_NS, "href", href);
    // The image shows the full sprite sheet at its natural size
    this.imageElement.setAttribute("width", String(spec.sheetWidth));
    this.imageElement.setAttribute("height", String(spec.sheetHeight));

    // Position the nested SVG at the destination rectangle on the map
    const destW = spec.frameWidth * this.scale;
    const destH = spec.frameHeight * this.scale;
    const destX = this.positionX - destW * spec.anchorX;
    const destY = this.positionY - destH * spec.anchorY;

    this.frameSvg.setAttribute("x", String(destX));
    this.frameSvg.setAttribute("y", String(destY));
    this.frameSvg.setAttribute("width", String(destW));
    this.frameSvg.setAttribute("height", String(destH));
    // FIXED viewBox - never changes, always shows a frameWidth x frameHeight window
    this.frameSvg.setAttribute("viewBox", `0 0 ${spec.frameWidth} ${spec.frameHeight}`);
    console.log(`[Animation] Frame SVG: dest=(${destX.toFixed(1)}, ${destY.toFixed(1)}) size=${destW.toFixed(1)}x${destH.toFixed(1)} viewBox=0 0 ${spec.frameWidth} ${spec.frameHeight}`);

    // Append animation container to effects layer (svgParent)
    if (this.container.parentNode !== svgParent) {
      svgParent.appendChild(this.container);
      console.log(`[Animation] Container appended to effects layer:`, {
        parentNodeName: svgParent.nodeName,
        parentClass: svgParent.getAttribute("class"),
        isConnected: this.container.isConnected
      });
    } else {
      console.log(`[Animation] Container already attached to effects layer`);
    }

    // CRITICAL ASSERTION: Verify container is actually in the effects layer
    if (this.container.parentNode !== svgParent) {
      throw new Error(`[Animation] CRITICAL: Animation container was not appended to effects layer! Parent: ${this.container.parentNode?.nodeName}`);
    }

    this.updateFrame(0);
    console.log(`[Animation] configure complete`);
  }

  /**
   * Advances the animation to the given frame by shifting the full sprite sheet image
   * to negative offsets, letting the fixed viewport window show the desired frame.
   */
  private updateFrame(frameIndex: number): void {
    if (!this.spec) {
      return;
    }

    const column = frameIndex % this.spec.columns;
    const row = Math.floor(frameIndex / this.spec.columns);
    // Shift the full sprite sheet image to show the desired frame in the fixed viewport
    const srcX = column * this.spec.frameWidth;
    const srcY = row * this.spec.frameHeight;
    const opacity = getSpriteSheetFrameOpacity(this.spec, frameIndex, this.spec.frameCount);

    console.log(`[Animation] updateFrame ${frameIndex} - col:${column} row:${row} imageOffset:(-${srcX}, -${srcY}) opacity:${opacity.toFixed(2)}`);
    // Move the image by negative offsets to show the current frame in the fixed viewport
    this.imageElement.setAttribute("x", String(-srcX));
    this.imageElement.setAttribute("y", String(-srcY));
    this.container.style.opacity = String(opacity);
  }

  play(onComplete?: () => void): void {
    console.log(`[Animation] play called - has spec: ${!!this.spec}, container connected: ${this.container.isConnected}`);
    if (!this.spec) {
      console.log(`[Animation] play aborted - no spec`);
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
      console.log(`[Animation] tick aborted - isPlaying: ${this.isPlaying}, hasSpec: ${!!this.spec}`);
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
          console.log(`[Animation] Looping back to frame 0`);
          this.currentFrame = 0;
          this.updateFrame(0);
        } else {
          console.log(`[Animation] Animation complete at frame ${this.currentFrame}`);
          this.finish();
          return;
        }
      } else {
        this.currentFrame = nextFrame;
        this.updateFrame(this.currentFrame);
        console.log(`[Animation] Advanced to frame ${this.currentFrame}/${this.spec.frameCount}`);
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

    // Remove container (and its nested SVG) from effects layer
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
      console.error(`[SpriteSheetAnimator] Failed to resolve spec for ${animationType}:`, error);
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
    console.log(`[SpriteSheetAnimator] playAnimation called - type: ${animationType}, pos: (${x}, ${y}), scale: ${scale}`);
    const resolvedSpec = await this.getResolvedSpec(animationType);
    console.log(`[SpriteSheetAnimator] Spec resolved:`, resolvedSpec);

    return new Promise((resolve) => {
      const pool = this.getAnimationPool(animationType);
      const animation = pool.pop() ?? new SpriteSheetAnimation();

      this.activeAnimations.add(animation);
      console.log(`[SpriteSheetAnimator] Calling configure on animation`);
      animation.configure(resolvedSpec, this.svgElement, x, y, scale);
      console.log(`[SpriteSheetAnimator] Configuration complete, calling play on animation`);
      animation.play(() => {
        console.log(`[SpriteSheetAnimator] Animation completed`);
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
