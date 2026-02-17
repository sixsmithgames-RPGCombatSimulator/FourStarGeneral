/**
 * Sprite sheet animator for combat effects.
 * Handles frame-by-frame playback of sprite sheet animations (muzzle flashes, explosions, etc.)
 */

export interface SpriteSheetSpec {
  imagePath: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  frameDuration: number; // milliseconds per frame
  loop: boolean;
}

// Import animation assets using Vite's new URL() syntax for proper bundling
const muzzleFlashUrl = new URL("../assets/combat animations/muzzle_flash.png", import.meta.url).href;
const explosionSmallUrl = new URL("../assets/combat animations/explosion_small.png", import.meta.url).href;
const explosionLargeUrl = new URL("../assets/combat animations/explosion_large.png", import.meta.url).href;
const dustCloudUrl = new URL("../assets/combat animations/dust_cloud.png", import.meta.url).href;
const tracerUrl = new URL("../assets/combat animations/tracer.png", import.meta.url).href;

/**
 * Pre-defined animation specifications for combat effects.
 */
export const COMBAT_ANIMATIONS: Record<string, SpriteSheetSpec> = {
  muzzleFlash: {
    imagePath: muzzleFlashUrl,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 4,
    frameDuration: 50, // 0.2s total
    loop: false
  },
  explosionSmall: {
    imagePath: explosionSmallUrl,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 6,
    frameDuration: 80, // 0.48s total
    loop: false
  },
  explosionLarge: {
    imagePath: explosionLargeUrl,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 8,
    frameDuration: 100, // 0.8s total
    loop: false
  },
  dustCloud: {
    imagePath: dustCloudUrl,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 5,
    frameDuration: 100, // 0.5s total
    loop: false
  },
  tracer: {
    imagePath: tracerUrl,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 1,
    frameDuration: 100, // single frame
    loop: false
  }
} as const;

/**
 * Manages playback of a single sprite sheet animation instance.
 */
export class SpriteSheetAnimation {
  private spec: SpriteSheetSpec;
  private currentFrame: number = 0;
  private startTime: number = 0;
  private element: SVGImageElement;
  private container: SVGGElement;
  private isPlaying: boolean = false;
  private onComplete?: () => void;

  constructor(
    spec: SpriteSheetSpec,
    svgParent: SVGElement,
    x: number,
    y: number,
    scale: number = 1
  ) {
    this.spec = spec;
    this.scale = scale;

    // Create SVG group to hold the animation
    this.container = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this.container.setAttribute("transform", `translate(${x}, ${y})`);

    const clipId = `sprite-clip-${Math.random().toString(36).slice(2)}`;
    const clipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
    clipPath.setAttribute("id", clipId);
    clipPath.setAttribute("clipPathUnits", "userSpaceOnUse");
    const clipRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    clipRect.setAttribute("x", String(x));
    clipRect.setAttribute("y", String(y));
    clipRect.setAttribute("width", String(spec.frameWidth * scale));
    clipRect.setAttribute("height", String(spec.frameHeight * scale));
    clipPath.appendChild(clipRect);

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.appendChild(clipPath);
    this.container.appendChild(defs);

    this.element = document.createElementNS("http://www.w3.org/2000/svg", "image");
    this.element.setAttribute("width", String(spec.frameWidth * spec.frameCount * scale));
    this.element.setAttribute("height", String(spec.frameHeight * scale));
    this.element.setAttributeNS("http://www.w3.org/1999/xlink", "href", spec.imagePath);
    this.element.setAttribute("clip-path", `url(#${clipId})`);

    this.updateFrame(0);

    this.container.appendChild(this.element);
    svgParent.appendChild(this.container);
  }

  /**
   * Updates the displayed frame by adjusting the viewBox.
   */
  private readonly scale: number;

  private updateFrame(frameIndex: number): void {
    const xOffset = -frameIndex * this.spec.frameWidth * this.scale;
    this.element.setAttribute("transform", `translate(${xOffset}, 0)`);
  }

  /**
   * Starts playing the animation.
   */
  play(onComplete?: () => void): void {
    this.isPlaying = true;
    this.currentFrame = 0;
    this.startTime = performance.now();
    this.onComplete = onComplete;
    this.tick(this.startTime);
  }

  /**
   * Animation frame callback.
   */
  private tick = (currentTime: number): void => {
    if (!this.isPlaying) return;

    const elapsed = currentTime - this.startTime;
    const targetFrame = Math.floor(elapsed / this.spec.frameDuration);

    if (targetFrame >= this.spec.frameCount) {
      if (this.spec.loop) {
        // Loop back to start
        this.startTime = currentTime;
        this.currentFrame = 0;
        this.updateFrame(0);
        requestAnimationFrame(this.tick);
      } else {
        // Animation complete
        this.stop();
        if (this.onComplete) {
          this.onComplete();
        }
      }
    } else {
      // Update to next frame if changed
      if (targetFrame !== this.currentFrame) {
        this.currentFrame = targetFrame;
        this.updateFrame(targetFrame);
      }
      requestAnimationFrame(this.tick);
    }
  };

  /**
   * Stops the animation.
   */
  stop(): void {
    this.isPlaying = false;
  }

  /**
   * Removes the animation from the DOM.
   */
  remove(): void {
    this.stop();
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

/**
 * Factory for creating and managing combat animations.
 */
export class SpriteSheetAnimator {
  private svgElement: SVGElement;
  private activeAnimations: Set<SpriteSheetAnimation> = new Set();

  constructor(svgElement: SVGElement) {
    this.svgElement = svgElement;
  }

  /**
   * Plays a combat animation at the specified hex coordinates.
   */
  playAnimation(
    animationType: keyof typeof COMBAT_ANIMATIONS,
    x: number,
    y: number,
    scale: number = 1
  ): Promise<void> {
    return new Promise((resolve) => {
      const spec = COMBAT_ANIMATIONS[animationType];
      const animation = new SpriteSheetAnimation(spec, this.svgElement, x, y, scale);

      this.activeAnimations.add(animation);

      animation.play(() => {
        animation.remove();
        this.activeAnimations.delete(animation);
        resolve();
      });
    });
  }

  /**
   * Stops all active animations.
   */
  stopAll(): void {
    this.activeAnimations.forEach((anim) => {
      anim.remove();
    });
    this.activeAnimations.clear();
  }
}
