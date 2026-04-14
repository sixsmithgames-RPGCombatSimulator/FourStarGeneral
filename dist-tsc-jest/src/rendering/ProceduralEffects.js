/**
 * Procedural Effects Animation Orchestrator
 *
 * Manages playback of procedural SVG combat effects with requestAnimationFrame timing,
 * phase progression, DOM lifecycle, and instance pooling.
 */
import { PRIMITIVE_RENDERERS } from "./ProceduralPrimitives";
import { getEffectSpec, calculateProgress, getCurrentPhase } from "./EffectSpecifications";
const SVG_NS = "http://www.w3.org/2000/svg";
/**
 * Single procedural effect instance with requestAnimationFrame playback.
 */
class ProceduralEffectInstance {
    constructor(spec, config, parentGroup) {
        this.startTime = 0;
        this.rafHandle = null;
        this.isActive = false;
        this.resolveCompletion = null;
        this.spec = spec;
        this.config = config;
        this.parentGroup = parentGroup;
        // Create content group for this effect instance
        this.contentGroup = document.createElementNS(SVG_NS, "g");
        this.contentGroup.setAttribute("data-effect-instance", "true");
        this.contentGroup.setAttribute("data-effect-type", config.effectType);
        this.contentGroup.setAttribute("transform", `translate(${config.x}, ${config.y}) scale(${config.scale})`);
    }
    /**
     * Start effect playback.
     */
    start() {
        if (this.isActive) {
            console.warn(`[ProceduralEffects] Effect ${this.config.effectType} already active`);
            return Promise.resolve();
        }
        this.isActive = true;
        this.startTime = performance.now();
        this.parentGroup.appendChild(this.contentGroup);
        const promise = new Promise((resolve) => {
            this.resolveCompletion = resolve;
        });
        this.scheduleNextFrame();
        return promise;
    }
    /**
     * Schedule next animation frame.
     */
    scheduleNextFrame() {
        this.rafHandle = requestAnimationFrame((timestamp) => {
            this.updateFrame(timestamp);
        });
    }
    /**
     * Update animation frame.
     */
    updateFrame(timestamp) {
        if (!this.isActive)
            return;
        const elapsedMs = timestamp - this.startTime;
        // Check if effect is complete
        if (elapsedMs >= this.spec.durationMs) {
            this.complete();
            return;
        }
        // Render current frame
        this.renderFrame(elapsedMs);
        // Schedule next frame
        this.scheduleNextFrame();
    }
    /**
     * Render a single frame of the effect.
     */
    renderFrame(elapsedMs) {
        // Clear previous frame content
        while (this.contentGroup.firstChild) {
            this.contentGroup.removeChild(this.contentGroup.firstChild);
        }
        const overallProgress = elapsedMs / this.spec.durationMs;
        const currentPhase = getCurrentPhase(this.spec, elapsedMs);
        // Render all active primitives
        for (const primitiveInstance of this.spec.allPrimitives) {
            if (elapsedMs < primitiveInstance.startMs || elapsedMs > primitiveInstance.endMs) {
                continue;
            }
            const primitiveProgress = calculateProgress(elapsedMs, primitiveInstance.startMs, primitiveInstance.endMs);
            const renderer = PRIMITIVE_RENDERERS[primitiveInstance.type];
            if (!renderer) {
                console.warn(`[ProceduralEffects] Unknown primitive type: ${primitiveInstance.type}`);
                continue;
            }
            const renderContext = {
                parent: this.contentGroup,
                phaseProgress: primitiveProgress,
                overallProgress,
                elapsedMs,
                seed: this.config.seed,
                anchorX: 0,
                anchorY: 0,
                zoomTier: this.config.zoomTier,
                terrainTint: this.config.terrainTint
            };
            const primitiveConfig = {
                startMs: primitiveInstance.startMs,
                endMs: primitiveInstance.endMs,
                params: primitiveInstance.params
            };
            try {
                const elements = renderer(renderContext, primitiveConfig);
                for (const element of elements) {
                    this.contentGroup.appendChild(element);
                }
            }
            catch (error) {
                console.error(`[ProceduralEffects] Error rendering primitive ${primitiveInstance.type}:`, error);
            }
        }
    }
    /**
     * Complete the effect and clean up.
     */
    complete() {
        this.isActive = false;
        if (this.rafHandle !== null) {
            cancelAnimationFrame(this.rafHandle);
            this.rafHandle = null;
        }
        // Remove content from DOM
        if (this.contentGroup.parentNode) {
            this.contentGroup.parentNode.removeChild(this.contentGroup);
        }
        // Resolve completion promise
        if (this.resolveCompletion) {
            this.resolveCompletion();
            this.resolveCompletion = null;
        }
    }
    /**
     * Cancel the effect early.
     */
    cancel() {
        if (this.isActive) {
            this.complete();
        }
    }
    /**
     * Check if this instance is currently active.
     */
    get active() {
        return this.isActive;
    }
}
/**
 * Procedural effects animator with instance pooling and concurrent playback.
 */
export class ProceduralEffectsAnimator {
    constructor(parentGroup, soundManager) {
        this.activeInstances = new Set();
        this.seedCounter = 0;
        this.parentGroup = parentGroup;
        this.soundManager = soundManager ?? null;
    }
    /**
     * Play a weapon effect animation.
     */
    async playAnimation(effectType, x, y, scale = 1, zoomTier = 'mid', terrainTint, soundRequest) {
        const spec = getEffectSpec(effectType);
        if (!spec) {
            console.warn(`[ProceduralEffects] No specification found for effect type: ${effectType}`);
            return;
        }
        // Generate deterministic seed
        const seed = this.generateSeed();
        const config = {
            effectType,
            x,
            y,
            scale,
            seed,
            zoomTier,
            terrainTint
        };
        // Trigger sound playback
        const resolvedSoundRequest = soundRequest === undefined
            ? this.resolveDefaultSoundRequest(effectType)
            : soundRequest;
        if (this.soundManager && resolvedSoundRequest) {
            this.soundManager.playWeaponSound({
                ...resolvedSoundRequest,
                seed,
            }).catch((error) => {
                console.error(`[ProceduralEffects] Sound playback failed for ${effectType}:`, error);
            });
        }
        const instance = new ProceduralEffectInstance(spec, config, this.parentGroup);
        this.activeInstances.add(instance);
        try {
            await instance.start();
        }
        finally {
            this.activeInstances.delete(instance);
        }
    }
    /**
     * Generate a deterministic seed for effect variation.
     */
    generateSeed() {
        // Use combination of timestamp and counter for uniqueness
        const timeSeed = performance.now() % 10000;
        this.seedCounter = (this.seedCounter + 1) % 1000;
        return Math.floor(timeSeed * 1000 + this.seedCounter);
    }
    resolveDefaultSoundRequest(effectType) {
        switch (effectType) {
            case "artillery":
                return {
                    weaponClass: "artillery",
                    playbackMode: "impact_only",
                    targetMaterial: "earth",
                    gainMultiplier: 0.94
                };
            case "explosionSmall":
                return {
                    weaponClass: "small_bomb",
                    playbackMode: "impact_only",
                    targetMaterial: "earth",
                    gainMultiplier: 0.88
                };
            case "explosionLarge":
                return {
                    weaponClass: "large_bomb",
                    playbackMode: "impact_only",
                    targetMaterial: "earth",
                    gainMultiplier: 1
                };
            default:
                return null;
        }
    }
    /**
     * Cancel all active effects.
     */
    cancelAll() {
        for (const instance of this.activeInstances) {
            instance.cancel();
        }
        this.activeInstances.clear();
    }
    /**
     * Stop all active effects (alias for cancelAll for compatibility).
     */
    stopAll() {
        this.cancelAll();
    }
    /**
     * Get count of currently active effects.
     */
    getActiveCount() {
        return this.activeInstances.size;
    }
    /**
     * Check if any effects are currently playing.
     */
    hasActiveEffects() {
        return this.activeInstances.size > 0;
    }
}
/**
 * Determine zoom tier based on zoom level.
 */
export function getZoomTier(zoomLevel) {
    if (zoomLevel < 1.5)
        return 'far';
    if (zoomLevel > 3.0)
        return 'near';
    return 'mid';
}
