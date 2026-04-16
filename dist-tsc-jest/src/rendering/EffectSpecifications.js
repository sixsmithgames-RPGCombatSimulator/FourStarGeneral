/**
 * Effect Specification Loading and Validation
 *
 * Handles loading weapon effect specifications from JSON and provides
 * type-safe access to effect configurations.
 */
/**
 * Effect specifications catalog loaded from JSON.
 */
class EffectSpecificationCatalog {
    constructor() {
        this.specs = new Map();
    }
    /**
     * Load specifications from JSON data.
     */
    load(rawSpecs) {
        this.specs.clear();
        for (const raw of rawSpecs) {
            const spec = this.parseSpecification(raw);
            this.specs.set(spec.type, spec);
        }
        console.log(`[EffectSpecifications] Loaded ${this.specs.size} effect specifications`);
    }
    /**
     * Parse and validate a raw specification.
     */
    parseSpecification(raw) {
        // Validate required fields
        if (!raw.type || !raw.displayName || !raw.durationMs) {
            throw new Error(`Invalid effect specification: missing required fields`);
        }
        if (!raw.phases || raw.phases.length === 0) {
            throw new Error(`Effect ${raw.type} has no phases defined`);
        }
        // Flatten all primitives from all phases
        const allPrimitives = [];
        for (const phase of raw.phases) {
            for (const primitive of phase.primitives) {
                allPrimitives.push({
                    type: primitive.type,
                    startMs: primitive.startMs,
                    endMs: primitive.endMs,
                    params: primitive.params
                });
            }
        }
        return {
            type: raw.type,
            displayName: raw.displayName,
            durationMs: raw.durationMs,
            phases: raw.phases.map(phase => ({
                name: phase.name,
                startMs: phase.startMs,
                endMs: phase.endMs,
                primitives: phase.primitives
            })),
            allPrimitives,
            nodeCountBudget: raw.nodeCountBudget,
            useTerrainResponse: raw.useTerrainResponse ?? false
        };
    }
    /**
     * Get specification by weapon effect type.
     */
    getSpec(type) {
        return this.specs.get(type) ?? null;
    }
    /**
     * Get all loaded specification types.
     */
    getAllTypes() {
        return Array.from(this.specs.keys());
    }
    /**
     * Check if a specification exists for a type.
     */
    hasSpec(type) {
        return this.specs.has(type);
    }
}
/**
 * Global effect specification catalog.
 */
export const effectCatalog = new EffectSpecificationCatalog();
/**
 * Load effect specifications from JSON file.
 */
export async function loadEffectSpecifications(jsonPath) {
    try {
        const response = await fetch(jsonPath);
        if (!response.ok) {
            throw new Error(`Failed to load effect specifications: ${response.statusText}`);
        }
        const rawSpecs = await response.json();
        effectCatalog.load(rawSpecs);
    }
    catch (error) {
        console.error(`[EffectSpecifications] Error loading specs from ${jsonPath}:`, error);
        throw error;
    }
}
/**
 * Get effect specification by weapon type.
 */
export function getEffectSpec(weaponType) {
    return effectCatalog.getSpec(weaponType);
}
/**
 * Validate that an effect specification is well-formed.
 */
export function validateEffectSpec(spec) {
    const errors = [];
    // Check duration
    if (spec.durationMs <= 0) {
        errors.push(`Invalid duration: ${spec.durationMs}ms`);
    }
    // Check phases
    if (spec.phases.length === 0) {
        errors.push("No phases defined");
    }
    for (const phase of spec.phases) {
        if (phase.startMs < 0 || phase.endMs <= phase.startMs) {
            errors.push(`Invalid phase timing: ${phase.name} (${phase.startMs}-${phase.endMs}ms)`);
        }
        if (phase.endMs > spec.durationMs) {
            errors.push(`Phase ${phase.name} extends beyond effect duration`);
        }
        if (phase.primitives.length === 0) {
            errors.push(`Phase ${phase.name} has no primitives`);
        }
    }
    // Check primitive timings
    for (const primitive of spec.allPrimitives) {
        if (primitive.startMs < 0 || primitive.endMs <= primitive.startMs) {
            errors.push(`Invalid primitive timing: ${primitive.type} (${primitive.startMs}-${primitive.endMs}ms)`);
        }
        if (primitive.endMs > spec.durationMs) {
            errors.push(`Primitive ${primitive.type} extends beyond effect duration`);
        }
    }
    // Check node count budget
    const { min, typical, max } = spec.nodeCountBudget;
    if (min < 0 || typical < min || max < typical) {
        errors.push(`Invalid node count budget: min=${min}, typical=${typical}, max=${max}`);
    }
    return errors;
}
/**
 * Get primitives active at a specific time in the effect.
 */
export function getActivePrimitives(spec, elapsedMs) {
    return spec.allPrimitives.filter(primitive => elapsedMs >= primitive.startMs && elapsedMs <= primitive.endMs);
}
/**
 * Get current phase for a given elapsed time.
 */
export function getCurrentPhase(spec, elapsedMs) {
    for (const phase of spec.phases) {
        if (elapsedMs >= phase.startMs && elapsedMs <= phase.endMs) {
            return phase;
        }
    }
    return null;
}
/**
 * Calculate progress within a time range [0-1].
 */
export function calculateProgress(elapsedMs, startMs, endMs) {
    if (elapsedMs <= startMs)
        return 0;
    if (elapsedMs >= endMs)
        return 1;
    return (elapsedMs - startMs) / (endMs - startMs);
}
