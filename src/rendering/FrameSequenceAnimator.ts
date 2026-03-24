import {
  COMBAT_ANIMATIONS,
  getSpriteSheetFrameDuration,
  getSpriteSheetFrameOpacity,
  loadSpriteSheetImage,
  resolveSpriteSheetSpecAsync,
  sliceSpriteSheet,
  type CachedFrameSet,
  type ResolvedSpriteSheetSpec
} from "./SpriteSheetAnimator";

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

interface FrameSequenceLayoutSnapshot {
  readonly containerTransform: string;
  readonly containerStyleTransform: string;
  readonly containerViewBox: string;
  readonly containerClipPath: string;
  readonly imageX: string;
  readonly imageY: string;
  readonly imageWidth: string;
  readonly imageHeight: string;
  readonly imageTransform: string;
  readonly imageStyleTransform: string;
  readonly imageViewBox: string;
  readonly imageClipPath: string;
}

const frameSequenceCache = new Map<string, Promise<CachedFrameSet>>();

type FrameSequenceSpecResolver = (animationType: keyof typeof COMBAT_ANIMATIONS) => Promise<ResolvedSpriteSheetSpec>;
type FrameSequenceFrameResolver = (spec: ResolvedSpriteSheetSpec) => Promise<CachedFrameSet>;

export interface FrameSequenceAnimatorDependencies {
  readonly resolveSpec?: FrameSequenceSpecResolver;
  readonly resolveFrames?: FrameSequenceFrameResolver;
}

class FrameSequenceAnimation {
  private animationType: keyof typeof COMBAT_ANIMATIONS | null = null;
  private spec: ResolvedSpriteSheetSpec | null = null;
  private resolvedFrames: readonly string[] = [];
  private currentFrame = 0;
  private lastFrameTimestamp = 0;
  private isPlaying = false;
  private rafHandle: number | null = null;
  private completionResolver: (() => void) | undefined;
  private completionRejector: ((error: Error) => void) | undefined;
  private layoutSnapshot: FrameSequenceLayoutSnapshot | null = null;

  private readonly container: SVGGElement;
  private readonly imageElement: SVGImageElement;

  constructor() {
    this.container = document.createElementNS(SVG_NS, "g");
    this.container.style.pointerEvents = "none";

    this.imageElement = document.createElementNS(SVG_NS, "image");
    this.imageElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
    this.container.appendChild(this.imageElement);
  }

  configure(
    animationType: keyof typeof COMBAT_ANIMATIONS,
    spec: ResolvedSpriteSheetSpec,
    frames: CachedFrameSet,
    svgParent: SVGElement,
    x: number,
    y: number,
    scale: number = 1
  ): void {
    this.release();
    if (frames.frameDataUrls.length < spec.frameCount) {
      throw new Error(
        `[FrameSequenceAnimator] ${animationType} resolved ${frames.frameDataUrls.length} cached frames, but playback requires ${spec.frameCount}.`
      );
    }

    this.animationType = animationType;
    this.spec = spec;
    this.resolvedFrames = frames.frameDataUrls;
    this.currentFrame = 0;
    this.container.style.opacity = "1";

    const effectiveScale = scale * spec.renderScale;
    const destW = spec.logicalFrameWidth * effectiveScale;
    const destH = spec.logicalFrameHeight * effectiveScale;
    const destX = x - destW * spec.anchorX;
    const destY = y - destH * spec.anchorY;

    this.container.removeAttribute("transform");
    this.container.style.transform = "";
    this.container.removeAttribute("viewBox");
    this.container.removeAttribute("clip-path");

    this.imageElement.setAttribute("x", String(destX));
    this.imageElement.setAttribute("y", String(destY));
    this.imageElement.setAttribute("width", String(destW));
    this.imageElement.setAttribute("height", String(destH));
    this.imageElement.removeAttribute("transform");
    this.imageElement.style.transform = "";
    this.imageElement.removeAttribute("viewBox");
    this.imageElement.removeAttribute("clip-path");

    if (this.container.parentNode && this.container.parentNode !== svgParent) {
      this.container.parentNode.removeChild(this.container);
    }
    if (this.container.parentNode !== svgParent) {
      svgParent.appendChild(this.container);
    }
    if (this.container.parentNode !== svgParent) {
      throw new Error(`[FrameSequenceAnimator] Failed to attach ${animationType} container to the effects layer.`);
    }

    this.layoutSnapshot = this.captureLayoutSnapshot();
    this.updateFrame(0);
  }

  play(): Promise<void> {
    if (!this.spec || this.resolvedFrames.length === 0 || !this.animationType) {
      throw new Error("[FrameSequenceAnimator] play() was called before configure() established a valid frame sequence.");
    }

    this.stop();
    this.isPlaying = true;
    this.currentFrame = 0;
    this.lastFrameTimestamp = performance.now();
    this.updateFrame(0);

    return new Promise<void>((resolve, reject) => {
      this.completionResolver = resolve;
      this.completionRejector = reject;
      this.rafHandle = requestAnimationFrame(this.tick);
    });
  }


  stop(): void {
    this.isPlaying = false;
    if (this.rafHandle != null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  release(): void {
    this.stop();
    this.settleCompletion();
    this.animationType = null;
    this.spec = null;
    this.resolvedFrames = [];
    this.layoutSnapshot = null;
    this.container.style.opacity = "0";
    this.imageElement.removeAttribute("href");
    this.imageElement.removeAttributeNS(XLINK_NS, "href");
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  private readonly tick = (currentTime: number): void => {
    this.rafHandle = null;
    if (!this.isPlaying || !this.spec) {
      return;
    }

    try {
      const elapsed = currentTime - this.lastFrameTimestamp;
      const frameDuration = getSpriteSheetFrameDuration(this.spec, this.currentFrame, this.spec.frameCount);
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

      this.rafHandle = requestAnimationFrame(this.tick);
    } catch (error) {
      this.fail(error);
    }
  };

  private finish(): void {
    this.stop();
    this.settleCompletion();
  }

  private fail(error: unknown): void {
    this.stop();
    const failure = error instanceof Error
      ? error
      : new Error(`[FrameSequenceAnimator] Playback failed with non-Error value: ${String(error)}`);
    this.settleFailure(failure);
  }

  private settleCompletion(): void {
    const completion = this.completionResolver;
    this.completionResolver = undefined;
    this.completionRejector = undefined;
    completion?.();
  }

  private settleFailure(error: Error): void {
    const rejector = this.completionRejector;
    this.completionResolver = undefined;
    this.completionRejector = undefined;
    rejector?.(error);
  }

  private updateFrame(frameIndex: number): void {
    if (!this.spec || this.resolvedFrames.length === 0 || !this.animationType) {
      throw new Error("[FrameSequenceAnimator] updateFrame() was called without a configured frame sequence.");
    }

    const frameSource = this.resolvedFrames[frameIndex];
    if (!frameSource) {
      throw new Error(
        `[FrameSequenceAnimator] ${this.animationType} is missing cached frame ${frameIndex} of ${this.resolvedFrames.length}.`
      );
    }

    this.assertLayoutInvariant();
    this.imageElement.setAttribute("href", frameSource);
    this.imageElement.setAttributeNS(XLINK_NS, "href", frameSource);
    this.container.style.opacity = String(getSpriteSheetFrameOpacity(this.spec, frameIndex, this.spec.frameCount));
    this.assertLayoutInvariant();
  }

  private assertLayoutInvariant(): void {
    if (this.resolvedFrames.length === 0 || !this.layoutSnapshot || !this.animationType) {
      return;
    }

    const currentSnapshot = this.captureLayoutSnapshot();
    const changedField = Object.entries(this.layoutSnapshot).find(([key, value]) => currentSnapshot[key as keyof FrameSequenceLayoutSnapshot] !== value);
    if (changedField) {
      throw new Error(
        `[FrameSequenceAnimator] ${this.animationType} mutated layout field ${changedField[0]} during frame-sequence playback. ` +
        "Configured frame sequences may only update href and opacity."
      );
    }
  }

  private captureLayoutSnapshot(): FrameSequenceLayoutSnapshot {
    return {
      containerTransform: this.container.getAttribute("transform") ?? "",
      containerStyleTransform: this.container.style.transform,
      containerViewBox: this.container.getAttribute("viewBox") ?? "",
      containerClipPath: this.container.getAttribute("clip-path") ?? "",
      imageX: this.imageElement.getAttribute("x") ?? "",
      imageY: this.imageElement.getAttribute("y") ?? "",
      imageWidth: this.imageElement.getAttribute("width") ?? "",
      imageHeight: this.imageElement.getAttribute("height") ?? "",
      imageTransform: this.imageElement.getAttribute("transform") ?? "",
      imageStyleTransform: this.imageElement.style.transform,
      imageViewBox: this.imageElement.getAttribute("viewBox") ?? "",
      imageClipPath: this.imageElement.getAttribute("clip-path") ?? ""
    };
  }
}

export class FrameSequenceAnimator {
  private readonly svgElement: SVGElement;
  private readonly activeAnimations = new Set<FrameSequenceAnimation>();
  private readonly animationPool = new Map<string, FrameSequenceAnimation[]>();
  private readonly resolvedSpecCache = new Map<string, Promise<ResolvedSpriteSheetSpec>>();
  private readonly resolveSpecImpl: FrameSequenceSpecResolver;
  private readonly resolveFramesImpl: FrameSequenceFrameResolver;

  constructor(svgElement: SVGElement, dependencies: FrameSequenceAnimatorDependencies = {}) {
    this.svgElement = svgElement;
    this.resolveSpecImpl = dependencies.resolveSpec ?? this.resolveSpecInternal;
    this.resolveFramesImpl = dependencies.resolveFrames ?? this.resolveFramesInternal;
  }

  async playAnimation(
    animationType: keyof typeof COMBAT_ANIMATIONS,
    x: number,
    y: number,
    scale: number = 1
  ): Promise<void> {
    console.log(`[FrameSequenceAnimator] playAnimation called - type: ${animationType}, pos: (${x}, ${y}), scale: ${scale}`);
    const resolvedSpec = await this.getResolvedSpec(animationType);
    const frames = await this.ensureResolvedFrames(resolvedSpec);
    console.log(`[FrameSequenceAnimator] Spec resolved, frames cached: ${frames.frameDataUrls.length}`);

    const pool = this.getAnimationPool(animationType);
    const animation = pool.pop() ?? new FrameSequenceAnimation();
    this.activeAnimations.add(animation);

    try {
      animation.configure(animationType, resolvedSpec, frames, this.svgElement, x, y, scale);
      await animation.play();
      animation.release();
    } catch (error) {
      animation.release();
      throw error;
    } finally {
      this.activeAnimations.delete(animation);
      pool.push(animation);
    }
  }

  stopAll(): void {
    this.activeAnimations.forEach((animation) => {
      animation.release();
    });
    this.activeAnimations.clear();
  }

  private getAnimationPool(animationType: keyof typeof COMBAT_ANIMATIONS): FrameSequenceAnimation[] {
    const cacheKey = String(animationType);
    let pool = this.animationPool.get(cacheKey);
    if (!pool) {
      pool = [];
      this.animationPool.set(cacheKey, pool);
    }
    return pool;
  }

  private async getResolvedSpec(animationType: keyof typeof COMBAT_ANIMATIONS): Promise<ResolvedSpriteSheetSpec> {
    const cacheKey = String(animationType);
    const cached = this.resolvedSpecCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const pending = this.resolveSpecImpl(animationType).catch((error) => {
      console.error(`[FrameSequenceAnimator] Failed to resolve spec for ${animationType}:`, error);
      this.resolvedSpecCache.delete(cacheKey);
      throw error;
    });

    this.resolvedSpecCache.set(cacheKey, pending);
    return pending;
  }

  private async ensureResolvedFrames(spec: ResolvedSpriteSheetSpec): Promise<CachedFrameSet> {
    return this.resolveFramesImpl(spec);
  }

  private readonly resolveSpecInternal: FrameSequenceSpecResolver = async (animationType) => {
    const spec = COMBAT_ANIMATIONS[animationType];
    return resolveSpriteSheetSpecAsync(spec);
  };

  private readonly resolveFramesInternal: FrameSequenceFrameResolver = async (spec) => {
    const cacheKey = spec.imagePath;
    const cached = frameSequenceCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const pending = loadSpriteSheetImage(spec.imagePath)
      .then((asset) => sliceSpriteSheet(asset.image, spec.columns, spec.rows, spec.frameCount))
      .catch((error) => {
        console.error(`[FrameSequenceAnimator] Failed to resolve cached frames for ${cacheKey}:`, error);
        frameSequenceCache.delete(cacheKey);
        throw error;
      });

    frameSequenceCache.set(cacheKey, pending);
    return pending;
  };
}
