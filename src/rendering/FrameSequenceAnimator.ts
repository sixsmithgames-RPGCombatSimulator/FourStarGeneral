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

let nextFrameSequencePlaybackId = 1;

function readCanvasFrameSource(canvasElement: HTMLCanvasElement): string {
  return canvasElement.dataset.frameSource ?? "";
}

function getCanvasContext(canvasElement: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvasElement.getContext("2d");
  if (!context) {
    throw new Error("[FrameSequenceAnimator] Canvas 2D context is unavailable for combat effect playback.");
  }
  return context;
}

function summarizeFrameSource(frameSource: string): string {
  if (frameSource.startsWith("data:")) {
    return `${frameSource.slice(0, 48)}… (${frameSource.length} chars)`;
  }
  return frameSource;
}

interface FrameSequenceLayoutSnapshot {
  readonly foreignObjectX: string;
  readonly foreignObjectY: string;
  readonly foreignObjectWidth: string;
  readonly foreignObjectHeight: string;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly canvasStyleWidth: string;
  readonly canvasStyleHeight: string;
}

const frameSequenceCache = new Map<string, Promise<CachedFrameSet>>();

type FrameSequenceSpecResolver = (animationType: keyof typeof COMBAT_ANIMATIONS) => Promise<ResolvedSpriteSheetSpec>;
type FrameSequenceFrameResolver = (spec: ResolvedSpriteSheetSpec) => Promise<CachedFrameSet>;

export interface FrameSequenceAnimatorDependencies {
  readonly resolveSpec?: FrameSequenceSpecResolver;
  readonly resolveFrames?: FrameSequenceFrameResolver;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const XHTML_NS = "http://www.w3.org/1999/xhtml";

class FrameSequenceAnimation {
  private animationType: keyof typeof COMBAT_ANIMATIONS | null = null;
  private spec: ResolvedSpriteSheetSpec | null = null;
  private resolvedFrames: readonly string[] = [];
  private resolvedFrameCanvases: readonly HTMLCanvasElement[] = [];
  private currentFrame = 0;
  private lastFrameTimestamp = 0;
  private isPlaying = false;
  private rafHandle: number | null = null;
  private completionResolver: (() => void) | undefined;
  private completionRejector: ((error: Error) => void) | undefined;
  private layoutSnapshot: FrameSequenceLayoutSnapshot | null = null;
  private playbackId = "";
  private lastRenderedFrameIndex = -1;
  private lastRenderedFrameSource = "";

  private readonly foreignObject: SVGForeignObjectElement;
  private readonly xhtmlWrapper: HTMLDivElement;
  private readonly canvasElement: HTMLCanvasElement;

  constructor() {
    // Create SVG foreignObject
    this.foreignObject = document.createElementNS(SVG_NS, "foreignObject");
    this.foreignObject.setAttribute("pointer-events", "none");
    this.foreignObject.dataset.frameSequenceSurface = "true";

    // Create XHTML wrapper div
    this.xhtmlWrapper = document.createElementNS(XHTML_NS, "div") as HTMLDivElement;
    this.xhtmlWrapper.style.width = "100%";
    this.xhtmlWrapper.style.height = "100%";
    this.xhtmlWrapper.style.pointerEvents = "none";

    // Create canvas
    this.canvasElement = document.createElement("canvas");
    this.canvasElement.style.display = "block";
    this.canvasElement.style.width = "100%";
    this.canvasElement.style.height = "100%";
    this.canvasElement.style.pointerEvents = "none";

    // Structure: foreignObject > XHTML div > canvas
    this.xhtmlWrapper.appendChild(this.canvasElement);
    this.foreignObject.appendChild(this.xhtmlWrapper);
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
    if (frames.frameCanvases.length < spec.frameCount) {
      throw new Error(
        `[FrameSequenceAnimator] ${animationType} resolved ${frames.frameCanvases.length} cached frame surfaces, but playback requires ${spec.frameCount}.`
      );
    }

    this.animationType = animationType;
    this.spec = spec;
    this.resolvedFrames = frames.frameDataUrls;
    this.resolvedFrameCanvases = frames.frameCanvases;
    this.currentFrame = 0;
    this.playbackId = `${animationType}#${nextFrameSequencePlaybackId++}`;
    this.lastRenderedFrameIndex = -1;
    this.lastRenderedFrameSource = "";

    const effectiveScale = scale * spec.renderScale;
    const displayScaleX = (spec.logicalFrameWidth * effectiveScale) / frames.sourceFrameWidth;
    const displayScaleY = (spec.logicalFrameHeight * effectiveScale) / frames.sourceFrameHeight;
    const destW = frames.frameWidth * displayScaleX;
    const destH = frames.frameHeight * displayScaleY;
    const destX = x - frames.anchorPixelX * displayScaleX;
    const destY = y - frames.anchorPixelY * displayScaleY;

    // Position using SVG attributes, not CSS
    this.foreignObject.setAttribute("x", String(destX));
    this.foreignObject.setAttribute("y", String(destY));
    this.foreignObject.setAttribute("width", String(destW));
    this.foreignObject.setAttribute("height", String(destH));
    this.foreignObject.setAttribute("opacity", "1");

    this.canvasElement.width = Math.max(1, Math.round(frames.frameWidth));
    this.canvasElement.height = Math.max(1, Math.round(frames.frameHeight));
    this.canvasElement.removeAttribute("data-frame-source");
    this.canvasElement.removeAttribute("data-frame-index");
    getCanvasContext(this.canvasElement).clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);

    // Runtime guard: verify svgParent is an SVG element
    if (!(svgParent instanceof SVGElement)) {
      const receivedType = (svgParent as any)?.constructor?.name ?? typeof svgParent;
      throw new Error(
        `[FrameSequenceAnimator] Combat effects must mount to an SVG element. ` +
        `Received ${receivedType}. ` +
        `Use a foreignObject parent or a dedicated HTML overlay outside the SVG.`
      );
    }

    if (this.foreignObject.parentNode && this.foreignObject.parentNode !== svgParent) {
      this.foreignObject.parentNode.removeChild(this.foreignObject);
    }
    if (this.foreignObject.parentNode !== svgParent) {
      svgParent.appendChild(this.foreignObject);
    }
    if (this.foreignObject.parentNode !== svgParent) {
      throw new Error(`[FrameSequenceAnimator] Failed to attach ${animationType} foreignObject to SVG effects overlay.`);
    }

    this.layoutSnapshot = this.captureLayoutSnapshot();
    this.updateFrame(0);
  }

  play(): Promise<void> {
    if (!this.spec || this.resolvedFrames.length === 0 || this.resolvedFrameCanvases.length === 0 || !this.animationType) {
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
    this.cleanupVisualState();
    this.settleCompletion();
  }

  private cleanupVisualState(): void {
    this.animationType = null;
    this.spec = null;
    this.resolvedFrames = [];
    this.resolvedFrameCanvases = [];
    this.layoutSnapshot = null;
    this.playbackId = "";
    this.lastRenderedFrameIndex = -1;
    this.lastRenderedFrameSource = "";
    this.foreignObject.setAttribute("opacity", "0");
    const context = this.canvasElement.getContext("2d");
    if (context) {
      context.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
    }
    this.canvasElement.removeAttribute("data-frame-source");
    this.canvasElement.removeAttribute("data-frame-index");
    if (this.foreignObject.parentNode) {
      this.foreignObject.parentNode.removeChild(this.foreignObject);
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
    this.release();
  }

  private fail(error: unknown): void {
    this.stop();
    const failure = error instanceof Error
      ? error
      : new Error(`[FrameSequenceAnimator] Playback failed with non-Error value: ${String(error)}`);
    this.cleanupVisualState();
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
    if (!this.spec || this.resolvedFrames.length === 0 || this.resolvedFrameCanvases.length === 0 || !this.animationType) {
      throw new Error("[FrameSequenceAnimator] updateFrame() was called without a configured frame sequence.");
    }

    const frameSource = this.resolvedFrames[frameIndex];
    const frameSurface = this.resolvedFrameCanvases[frameIndex];
    if (!frameSource) {
      throw new Error(
        `[FrameSequenceAnimator] ${this.animationType} is missing cached frame ${frameIndex} of ${this.resolvedFrames.length}.`
      );
    }
    if (!frameSurface) {
      throw new Error(
        `[FrameSequenceAnimator] ${this.animationType} is missing cached frame surface ${frameIndex} of ${this.resolvedFrameCanvases.length}.`
      );
    }
    if (frameSource === this.spec.imagePath) {
      throw new Error(
        `[FrameSequenceAnimator] ${this.playbackId} resolved frame ${frameIndex} back to the full sprite sheet URL. ` +
        "Pre-sliced playback must use single-frame assets only."
      );
    }

    this.assertLayoutInvariant();
    this.assertVisibleSourceNeverUsesSheetUrl();
    this.drawFrame(frameSurface, frameSource, frameIndex);
    this.foreignObject.setAttribute("opacity", String(getSpriteSheetFrameOpacity(this.spec, frameIndex, this.spec.frameCount)));
    this.assertVisibleFrameState(frameIndex, frameSource);
    this.assertLayoutInvariant();
  }

  private drawFrame(frameSurface: HTMLCanvasElement, frameSource: string, frameIndex: number): void {
    const ctx = getCanvasContext(this.canvasElement);

    // Hardened draw step - full reset before drawing
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "copy"; // Replace all pixels
    ctx.drawImage(frameSurface, 0, 0, this.canvasElement.width, this.canvasElement.height);
    ctx.globalCompositeOperation = "source-over"; // Restore default

    this.canvasElement.dataset.frameSource = frameSource;
    this.canvasElement.dataset.frameIndex = String(frameIndex);
  }

  private assertVisibleSourceNeverUsesSheetUrl(): void {
    if (!this.spec || this.resolvedFrames.length === 0) {
      return;
    }

    const visibleSource = readCanvasFrameSource(this.canvasElement);
    if (visibleSource === this.spec.imagePath) {
      throw new Error(
        `[FrameSequenceAnimator] ${this.playbackId} attempted to render cached playback using the full sprite sheet URL ${this.spec.imagePath}.`
      );
    }
  }

  private assertVisibleFrameState(frameIndex: number, frameSource: string): void {
    if (!this.spec) {
      return;
    }

    const visibleNodeCount = this.foreignObject.querySelectorAll("canvas").length;
    if (visibleNodeCount !== 1) {
      throw new Error(
        `[FrameSequenceAnimator] ${this.playbackId} expected exactly one visible canvas node, found ${visibleNodeCount}.`
      );
    }

    const visibleSource = readCanvasFrameSource(this.canvasElement);
    if (visibleSource !== frameSource) {
      throw new Error(
        `[FrameSequenceAnimator] ${this.playbackId} expected visible frame source ${summarizeFrameSource(frameSource)}, ` +
        `received ${summarizeFrameSource(visibleSource)}.`
      );
    }
    if ((this.canvasElement.dataset.frameIndex ?? "") !== String(frameIndex)) {
      throw new Error(
        `[FrameSequenceAnimator] ${this.playbackId} expected visible frame index ${frameIndex}, ` +
        `received ${this.canvasElement.dataset.frameIndex ?? "<missing>"}.`
      );
    }
    if (visibleSource === this.spec.imagePath) {
      throw new Error(
        `[FrameSequenceAnimator] ${this.playbackId} reverted to full sprite sheet source ${this.spec.imagePath} during cached playback.`
      );
    }
    if (
      this.spec.frameCount > 1 &&
      this.lastRenderedFrameIndex >= 0 &&
      frameIndex !== this.lastRenderedFrameIndex &&
      frameSource === this.lastRenderedFrameSource
    ) {
      throw new Error(
        `[FrameSequenceAnimator] ${this.playbackId} advanced from frame ${this.lastRenderedFrameIndex} to ${frameIndex} without changing the visible frame source.`
      );
    }

    console.log(
      `[FrameSequenceAnimator] Frame swap - animation: ${this.playbackId}, frame: ${frameIndex}, ` +
      `source: ${summarizeFrameSource(visibleSource)}, nodes: ${visibleNodeCount}`
    );
    this.lastRenderedFrameIndex = frameIndex;
    this.lastRenderedFrameSource = frameSource;
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
        "Configured frame sequences may only update drawn pixels and opacity."
      );
    }
  }

  private captureLayoutSnapshot(): FrameSequenceLayoutSnapshot {
    return {
      foreignObjectX: this.foreignObject.getAttribute("x") ?? "",
      foreignObjectY: this.foreignObject.getAttribute("y") ?? "",
      foreignObjectWidth: this.foreignObject.getAttribute("width") ?? "",
      foreignObjectHeight: this.foreignObject.getAttribute("height") ?? "",
      canvasWidth: this.canvasElement.width,
      canvasHeight: this.canvasElement.height,
      canvasStyleWidth: this.canvasElement.style.width,
      canvasStyleHeight: this.canvasElement.style.height
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
      .then((asset) => sliceSpriteSheet(asset.image, spec.columns, spec.rows, spec.frameCount, spec.anchorX, spec.anchorY))
      .catch((error) => {
        console.error(`[FrameSequenceAnimator] Failed to resolve cached frames for ${cacheKey}:`, error);
        frameSequenceCache.delete(cacheKey);
        throw error;
      });

    frameSequenceCache.set(cacheKey, pending);
    return pending;
  };
}
