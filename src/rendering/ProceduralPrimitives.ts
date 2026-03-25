/**
 * Procedural SVG Primitives for Combat Effects
 *
 * Provides 8 reusable primitive renderers that compose to create weapon-specific effects.
 * All primitives use bottom-center anchor point (128, 220) in 256×256 frame and support
 * deterministic seed-based variation.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Rendering context passed to each primitive renderer.
 */
export interface PrimitiveRenderContext {
  /** Parent SVG group to append elements to */
  readonly parent: SVGGElement;
  /** Current animation phase progress [0-1] */
  readonly phaseProgress: number;
  /** Overall effect progress [0-1] */
  readonly overallProgress: number;
  /** Elapsed milliseconds since effect start */
  readonly elapsedMs: number;
  /** Deterministic seed for variation */
  readonly seed: number;
  /** Anchor X in local coordinates (128 for center) */
  readonly anchorX: number;
  /** Anchor Y in local coordinates (220 for bottom) */
  readonly anchorY: number;
  /** Current zoom tier: 'far' | 'mid' | 'near' */
  readonly zoomTier: 'far' | 'mid' | 'near';
  /** Terrain tint color (optional, for debris/dust) */
  readonly terrainTint?: string;
}

/**
 * Configuration for a primitive instance.
 */
export interface PrimitiveConfig {
  /** Start time in milliseconds */
  readonly startMs: number;
  /** End time in milliseconds */
  readonly endMs: number;
  /** Primitive-specific parameters */
  readonly params: Record<string, unknown>;
}

/**
 * Seeded pseudo-random number generator for deterministic variation.
 */
export class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  /**
   * Returns next random number in range [0, 1).
   */
  next(): number {
    // Simple LCG (Linear Congruential Generator)
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  /**
   * Returns random number in range [min, max).
   */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Returns random integer in range [min, max].
   */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}

/**
 * Easing function for smooth animations.
 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t: number): number {
  return t * t * t;
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * PRIMITIVE 1: Flash Core
 * Radial gradient circle expanding from anchor, white-hot center to yellow edge.
 */
export function renderFlashCore(ctx: PrimitiveRenderContext, config: PrimitiveConfig): SVGElement[] {
  const params = config.params as {
    maxRadius: number;
    peakProgress: number;
    fadeProgress: number;
  };

  const progress = ctx.phaseProgress;
  const { maxRadius, peakProgress, fadeProgress } = params;

  // Grow to peak, then fade
  const radius = progress < peakProgress
    ? (progress / peakProgress) * maxRadius
    : maxRadius;

  const opacity = progress < fadeProgress
    ? 1.0
    : 1.0 - ((progress - fadeProgress) / (1 - fadeProgress));

  // Create radial gradient
  const gradientId = `flash-core-${ctx.seed}-${Date.now()}`;
  const defs = document.createElementNS(SVG_NS, "defs");
  const gradient = document.createElementNS(SVG_NS, "radialGradient");
  gradient.setAttribute("id", gradientId);

  const stop1 = document.createElementNS(SVG_NS, "stop");
  stop1.setAttribute("offset", "0%");
  stop1.setAttribute("stop-color", "#fff6da");
  gradient.appendChild(stop1);

  const stop2 = document.createElementNS(SVG_NS, "stop");
  stop2.setAttribute("offset", "100%");
  stop2.setAttribute("stop-color", "#ffd76a");
  gradient.appendChild(stop2);

  defs.appendChild(gradient);

  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", ctx.anchorX.toString());
  circle.setAttribute("cy", ctx.anchorY.toString());
  circle.setAttribute("r", radius.toString());
  circle.setAttribute("fill", `url(#${gradientId})`);
  circle.setAttribute("opacity", opacity.toString());

  return [defs, circle];
}

/**
 * PRIMITIVE 2: Shock Ring
 * Expanding concentric circles, orange to transparent.
 */
export function renderShockRing(ctx: PrimitiveRenderContext, config: PrimitiveConfig): SVGElement[] {
  const params = config.params as {
    minRadius: number;
    maxRadius: number;
    strokeWidth: number;
    ringCount: number;
  };

  const progress = easeOutCubic(ctx.phaseProgress);
  const { minRadius, maxRadius, strokeWidth, ringCount } = params;

  const elements: SVGElement[] = [];
  const rng = new SeededRandom(ctx.seed);

  for (let i = 0; i < ringCount; i++) {
    const ringProgress = Math.max(0, Math.min(1, progress - i * 0.15));
    if (ringProgress <= 0) continue;

    const radius = minRadius + ringProgress * (maxRadius - minRadius);
    const opacity = 1.0 - ringProgress;

    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", ctx.anchorX.toString());
    circle.setAttribute("cy", ctx.anchorY.toString());
    circle.setAttribute("r", radius.toString());
    circle.setAttribute("stroke", "#ff8d2a");
    circle.setAttribute("stroke-width", strokeWidth.toString());
    circle.setAttribute("fill", "none");
    circle.setAttribute("opacity", opacity.toString());

    elements.push(circle);
  }

  return elements;
}

/**
 * PRIMITIVE 3: Sparks
 * Radial line burst with length animation.
 */
export function renderSparks(ctx: PrimitiveRenderContext, config: PrimitiveConfig): SVGElement[] {
  const params = config.params as {
    sparkCount: number;
    minLength: number;
    maxLength: number;
    strokeWidth: number;
  };

  const { sparkCount, minLength, maxLength, strokeWidth } = params;
  const rng = new SeededRandom(ctx.seed);
  const elements: SVGElement[] = [];

  const nodeCount = ctx.zoomTier === 'far' ? Math.floor(sparkCount * 0.5) :
                    ctx.zoomTier === 'near' ? sparkCount :
                    Math.floor(sparkCount * 0.75);

  for (let i = 0; i < nodeCount; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const length = rng.range(minLength, maxLength);
    const sparkProgress = easeOutCubic(ctx.phaseProgress);

    const currentLength = length * sparkProgress;
    const x2 = ctx.anchorX + Math.cos(angle) * currentLength;
    const y2 = ctx.anchorY + Math.sin(angle) * currentLength;

    const opacity = 1.0 - sparkProgress;

    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", ctx.anchorX.toString());
    line.setAttribute("y1", ctx.anchorY.toString());
    line.setAttribute("x2", x2.toString());
    line.setAttribute("y2", y2.toString());
    line.setAttribute("stroke", "#ffd76a");
    line.setAttribute("stroke-width", strokeWidth.toString());
    line.setAttribute("opacity", opacity.toString());
    line.setAttribute("stroke-linecap", "round");

    elements.push(line);
  }

  return elements;
}

/**
 * PRIMITIVE 4: Debris
 * Ballistic particles with curved trajectory, terrain-colored.
 */
export function renderDebris(ctx: PrimitiveRenderContext, config: PrimitiveConfig): SVGElement[] {
  const params = config.params as {
    particleCount: number;
    minVelocity: number;
    maxVelocity: number;
    particleSize: number;
  };

  const { particleCount, minVelocity, maxVelocity, particleSize } = params;
  const rng = new SeededRandom(ctx.seed);
  const elements: SVGElement[] = [];

  const nodeCount = ctx.zoomTier === 'far' ? Math.floor(particleCount * 0.3) :
                    ctx.zoomTier === 'near' ? particleCount :
                    Math.floor(particleCount * 0.6);

  const baseColor = ctx.terrainTint ?? "#4a3c28";

  for (let i = 0; i < nodeCount; i++) {
    const angle = rng.range(-Math.PI / 3, -Math.PI * 2 / 3);
    const velocity = rng.range(minVelocity, maxVelocity);
    const progress = easeInCubic(ctx.phaseProgress);

    // Ballistic trajectory
    const distance = velocity * progress;
    const gravity = 0.5;
    const x = ctx.anchorX + Math.cos(angle) * distance;
    const y = ctx.anchorY + Math.sin(angle) * distance + gravity * progress * progress * 50;

    const opacity = 1.0 - progress;

    const particle = document.createElementNS(SVG_NS, "circle");
    particle.setAttribute("cx", x.toString());
    particle.setAttribute("cy", y.toString());
    particle.setAttribute("r", particleSize.toString());
    particle.setAttribute("fill", baseColor);
    particle.setAttribute("opacity", opacity.toString());

    elements.push(particle);
  }

  return elements;
}

/**
 * PRIMITIVE 5: Dust Puff
 * Expanding ellipse cloud with terrain tint.
 */
export function renderDustPuff(ctx: PrimitiveRenderContext, config: PrimitiveConfig): SVGElement[] {
  const params = config.params as {
    maxRadiusX: number;
    maxRadiusY: number;
  };

  const progress = easeOutCubic(ctx.phaseProgress);
  const { maxRadiusX, maxRadiusY } = params;

  const radiusX = progress * maxRadiusX;
  const radiusY = progress * maxRadiusY;
  const opacity = 0.6 * (1.0 - progress);

  const baseColor = ctx.terrainTint ?? "#b89968";

  const ellipse = document.createElementNS(SVG_NS, "ellipse");
  ellipse.setAttribute("cx", ctx.anchorX.toString());
  ellipse.setAttribute("cy", ctx.anchorY.toString());
  ellipse.setAttribute("rx", radiusX.toString());
  ellipse.setAttribute("ry", radiusY.toString());
  ellipse.setAttribute("fill", baseColor);
  ellipse.setAttribute("opacity", opacity.toString());

  return [ellipse];
}

/**
 * PRIMITIVE 6: Smoke Puff
 * Rising turbulent cloud, dark gray.
 */
export function renderSmokePuff(ctx: PrimitiveRenderContext, config: PrimitiveConfig): SVGElement[] {
  const params = config.params as {
    maxRadius: number;
    riseDistance: number;
  };

  const progress = easeInOutQuad(ctx.phaseProgress);
  const { maxRadius, riseDistance } = params;

  const radius = progress * maxRadius;
  const offsetY = -progress * riseDistance;
  const opacity = 0.7 * (1.0 - progress * 0.5);

  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", ctx.anchorX.toString());
  circle.setAttribute("cy", (ctx.anchorY + offsetY).toString());
  circle.setAttribute("r", radius.toString());
  circle.setAttribute("fill", "#2b2424");
  circle.setAttribute("opacity", opacity.toString());

  return [circle];
}

/**
 * PRIMITIVE 7: Embers
 * Glowing circles with flicker, ember red→orange.
 */
export function renderEmbers(ctx: PrimitiveRenderContext, config: PrimitiveConfig): SVGElement[] {
  const params = config.params as {
    emberCount: number;
    minRadius: number;
    maxRadius: number;
    spreadDistance: number;
  };

  const { emberCount, minRadius, maxRadius, spreadDistance } = params;
  const rng = new SeededRandom(ctx.seed);
  const elements: SVGElement[] = [];

  const nodeCount = ctx.zoomTier === 'far' ? Math.floor(emberCount * 0.4) :
                    ctx.zoomTier === 'near' ? emberCount :
                    Math.floor(emberCount * 0.7);

  for (let i = 0; i < nodeCount; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const distance = rng.range(0, spreadDistance) * ctx.phaseProgress;
    const x = ctx.anchorX + Math.cos(angle) * distance;
    const y = ctx.anchorY + Math.sin(angle) * distance;

    const radius = rng.range(minRadius, maxRadius);
    const flicker = 0.8 + 0.2 * Math.sin(ctx.elapsedMs * 0.02 + i);
    const opacity = flicker * (1.0 - ctx.phaseProgress);

    const color = rng.next() > 0.5 ? "#8b2a1e" : "#ff8d2a";

    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", x.toString());
    circle.setAttribute("cy", y.toString());
    circle.setAttribute("r", radius.toString());
    circle.setAttribute("fill", color);
    circle.setAttribute("opacity", opacity.toString());

    elements.push(circle);
  }

  return elements;
}

/**
 * PRIMITIVE 8: Scorch
 * Ground burn mark ellipse with charcoal gradient.
 */
export function renderScorch(ctx: PrimitiveRenderContext, config: PrimitiveConfig): SVGElement[] {
  const params = config.params as {
    radiusX: number;
    radiusY: number;
    fadeInProgress: number;
  };

  const { radiusX, radiusY, fadeInProgress } = params;

  const opacity = ctx.phaseProgress < fadeInProgress
    ? (ctx.phaseProgress / fadeInProgress) * 0.4
    : 0.4;

  const gradientId = `scorch-${ctx.seed}-${Date.now()}`;
  const defs = document.createElementNS(SVG_NS, "defs");
  const gradient = document.createElementNS(SVG_NS, "radialGradient");
  gradient.setAttribute("id", gradientId);

  const stop1 = document.createElementNS(SVG_NS, "stop");
  stop1.setAttribute("offset", "0%");
  stop1.setAttribute("stop-color", "#1a1414");
  gradient.appendChild(stop1);

  const stop2 = document.createElementNS(SVG_NS, "stop");
  stop2.setAttribute("offset", "100%");
  stop2.setAttribute("stop-color", "#2b2424");
  gradient.appendChild(stop2);

  defs.appendChild(gradient);

  const ellipse = document.createElementNS(SVG_NS, "ellipse");
  ellipse.setAttribute("cx", ctx.anchorX.toString());
  ellipse.setAttribute("cy", ctx.anchorY.toString());
  ellipse.setAttribute("rx", radiusX.toString());
  ellipse.setAttribute("ry", radiusY.toString());
  ellipse.setAttribute("fill", `url(#${gradientId})`);
  ellipse.setAttribute("opacity", opacity.toString());

  return [defs, ellipse];
}

/**
 * Primitive renderer function type.
 */
export type PrimitiveRenderer = (ctx: PrimitiveRenderContext, config: PrimitiveConfig) => SVGElement[];

/**
 * Registry of all available primitive renderers.
 */
export const PRIMITIVE_RENDERERS: Record<string, PrimitiveRenderer> = {
  flash_core: renderFlashCore,
  shock_ring: renderShockRing,
  sparks: renderSparks,
  debris: renderDebris,
  dust_puff: renderDustPuff,
  smoke_puff: renderSmokePuff,
  embers: renderEmbers,
  scorch: renderScorch
};
