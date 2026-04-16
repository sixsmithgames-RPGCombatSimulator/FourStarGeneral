/**
 * Combat Sound Manager
 *
 * Handles layered weapon audio playback using Web Audio API.
 * Assembles sounds at runtime from multiple layers with variation,
 * manages buffer caching, and controls repetition.
 */
import { WEAPON_AUDIO_PROFILES } from "./WeaponAudioProfiles";
import { SeededRandom } from "../rendering/ProceduralPrimitives";
/**
 * Combat sound manager using Web Audio API for layered playback.
 */
export class CombatSoundManager {
    constructor() {
        this.bufferCache = new Map();
        this.soundCatalog = null;
        this.preloadPromise = null;
        // Repetition control: track recently used variants
        this.transientHistory = new Map();
        this.impactHistory = new Map();
        // Create Web Audio context
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGainNode = this.audioContext.createGain();
        this.masterGainNode.connect(this.audioContext.destination);
        this.masterGainNode.gain.value = CombatSoundManager.DEFAULT_MASTER_VOLUME;
        console.log("[CombatSoundManager] Initialized with Web Audio API");
    }
    /**
     * Load sound catalog from JSON.
     */
    async loadSoundCatalog(catalogPath) {
        try {
            const response = await fetch(catalogPath);
            if (!response.ok) {
                throw new Error(`Failed to load sound catalog: ${response.statusText}`);
            }
            this.soundCatalog = await response.json();
            this.preloadPromise = this.preloadCatalogBuffers();
            await this.preloadPromise;
            console.log(`[CombatSoundManager] Loaded sound catalog v${this.soundCatalog?.version} with ${Object.keys(this.soundCatalog?.assets ?? {}).length} assets`);
        }
        catch (error) {
            console.error("[CombatSoundManager] Error loading sound catalog:", error);
            throw error;
        }
    }
    /**
     * Preload audio buffer for an asset.
     */
    async loadAudioBuffer(asset) {
        // Check cache first
        if (this.bufferCache.has(asset.id)) {
            return this.bufferCache.get(asset.id);
        }
        try {
            const response = await fetch(asset.filePath);
            if (!response.ok) {
                console.warn(`[CombatSoundManager] Failed to load ${asset.filePath}: ${response.statusText}`);
                return null;
            }
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.bufferCache.set(asset.id, audioBuffer);
            return audioBuffer;
        }
        catch (error) {
            console.error(`[CombatSoundManager] Error loading audio buffer for ${asset.id}:`, error);
            return null;
        }
    }
    /**
     * Play a weapon sound event with layered assembly.
     */
    async playWeaponSound(request) {
        if (!this.soundCatalog) {
            console.warn("[CombatSoundManager] Sound catalog not loaded");
            return;
        }
        await this.ensureAudioContextReady();
        if (this.preloadPromise) {
            await this.preloadPromise;
        }
        const profile = WEAPON_AUDIO_PROFILES[request.weaponClass];
        if (!profile) {
            console.warn(`[CombatSoundManager] No audio profile for weapon class: ${request.weaponClass}`);
            return;
        }
        // Select layers for this event
        const selectedLayers = this.selectLayers(profile, request);
        // Play all selected layers
        const playbackPromises = selectedLayers.map(layer => this.playLayer(layer, request.gainMultiplier ?? 1.0));
        await Promise.all(playbackPromises);
    }
    /**
     * Select sound layers for runtime assembly.
     */
    selectLayers(profile, request) {
        const rng = new SeededRandom(request.seed);
        const selected = [];
        const playbackMode = request.playbackMode ?? "full";
        const includeTransientLayers = playbackMode === "full" || playbackMode === "weapon" || playbackMode === "impact" || playbackMode === "transient_only";
        const includeBodyLayers = playbackMode === "full" || playbackMode === "weapon";
        const includeMechanicalLayers = playbackMode === "full" || playbackMode === "weapon";
        const includeFlightLayers = playbackMode === "full" || playbackMode === "weapon";
        const includeImpactLayers = playbackMode === "full" || playbackMode === "impact" || playbackMode === "impact_only";
        const includeTailLayers = playbackMode === "full" || playbackMode === "weapon";
        // Always include transient (mandatory for most weapons)
        if (includeTransientLayers && profile.transientPool.length > 0) {
            const transient = this.selectVariantWithCooldown(profile.transientPool, profile.weaponClass, "transient", profile.transientCooldown ?? 0, rng);
            if (transient) {
                selected.push(this.applyVariation(transient, profile, rng));
            }
        }
        // Optional body layer
        if (includeBodyLayers && profile.bodyPool && profile.bodyPool.length > 0 && rng.next() > 0.2) {
            const body = this.selectVariant(profile.bodyPool, rng);
            if (body) {
                selected.push(this.applyVariation(body, profile, rng));
            }
        }
        // Optional mechanical layer
        if (includeMechanicalLayers && profile.mechanicalPool && profile.mechanicalPool.length > 0 && rng.next() > 0.3) {
            const mechanical = this.selectVariant(profile.mechanicalPool, rng);
            if (mechanical) {
                selected.push(this.applyVariation(mechanical, profile, rng));
            }
        }
        // Optional flight layer
        if (includeFlightLayers && profile.flightPool && profile.flightPool.length > 0 && rng.next() > 0.5) {
            const flight = this.selectVariant(profile.flightPool, rng);
            if (flight) {
                selected.push(this.applyVariation(flight, profile, rng));
            }
        }
        // Impact layer (if material specified)
        if (includeImpactLayers && request.targetMaterial) {
            const impactPool = profile.impactPoolsByMaterial[request.targetMaterial];
            if (impactPool && impactPool.length > 0) {
                const impact = this.selectVariantWithCooldown(impactPool, profile.weaponClass, "impact", profile.impactCooldown ?? 0, rng);
                if (impact) {
                    selected.push(this.applyVariation(impact, profile, rng));
                }
            }
            // Optional debris layer
            const debrisPool = profile.debrisPoolsByMaterial?.[request.targetMaterial];
            if (debrisPool && debrisPool.length > 0 && rng.next() > 0.4) {
                const debris = this.selectVariant(debrisPool, rng);
                if (debris) {
                    selected.push(this.applyVariation(debris, profile, rng));
                }
            }
        }
        // Optional tail layer
        if (includeTailLayers && profile.tailPools && profile.tailPools.length > 0 && rng.next() > 0.3) {
            const tail = this.selectVariant(profile.tailPools, rng);
            if (tail) {
                selected.push(this.applyVariation(tail, profile, rng));
            }
        }
        // Enforce min/max layer constraints
        return selected.slice(0, profile.maxLayers);
    }
    /**
     * Select a variant from a pool using seeded randomness.
     */
    selectVariant(pool, rng) {
        if (pool.length === 0)
            return null;
        const index = rng.int(0, pool.length - 1);
        const assetId = pool[index];
        return this.soundCatalog?.assets[assetId] ?? null;
    }
    /**
     * Select variant with repetition control cooldown.
     */
    selectVariantWithCooldown(pool, weaponClass, family, cooldown, rng) {
        if (pool.length === 0)
            return null;
        const historyKey = `${weaponClass}:${family}`;
        const history = family === "transient"
            ? this.transientHistory
            : this.impactHistory;
        const recentVariants = history.get(historyKey) ?? [];
        // Find available variants (not in cooldown)
        const availableIndices = pool
            .map((_, i) => i)
            .filter(i => !recentVariants.includes(i));
        let selectedIndex;
        if (availableIndices.length > 0) {
            // Select from available variants
            const randomAvailableIndex = rng.int(0, availableIndices.length - 1);
            selectedIndex = availableIndices[randomAvailableIndex];
        }
        else {
            // All variants in cooldown, pick randomly anyway
            selectedIndex = rng.int(0, pool.length - 1);
        }
        // Update history
        const updatedHistory = [selectedIndex, ...recentVariants].slice(0, cooldown);
        history.set(historyKey, updatedHistory);
        const assetId = pool[selectedIndex];
        return this.soundCatalog?.assets[assetId] ?? null;
    }
    /**
     * Apply variation (pitch/gain jitter) to a selected asset.
     */
    applyVariation(asset, profile, rng) {
        // Pitch jitter: ±pitchJitterPct
        const pitchJitter = (rng.next() - 0.5) * 2 * profile.pitchJitterPct;
        const pitchMultiplier = 1.0 + pitchJitter;
        // Gain jitter: ±gainJitterDb
        const gainJitter = (rng.next() - 0.5) * 2 * profile.gainJitterDb;
        const gainMultiplier = Math.pow(10, gainJitter / 20); // dB to linear
        // Start offset jitter
        const startOffsetMs = rng.range(0, profile.startOffsetJitterMs);
        return {
            asset,
            pitchMultiplier,
            gainMultiplier,
            startOffsetMs
        };
    }
    /**
     * Play a single sound layer with Web Audio API.
     */
    async playLayer(layer, masterGain) {
        const buffer = await this.loadAudioBuffer(layer.asset);
        if (!buffer) {
            return; // Failed to load, skip
        }
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = layer.pitchMultiplier;
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = layer.gainMultiplier * masterGain;
        source.connect(gainNode);
        gainNode.connect(this.masterGainNode);
        const startTime = this.audioContext.currentTime + layer.startOffsetMs / 1000;
        source.start(startTime);
        // Auto-cleanup
        source.onended = () => {
            source.disconnect();
            gainNode.disconnect();
        };
    }
    /**
     * Set master volume (0.0 to 1.0).
     */
    setMasterVolume(volume) {
        this.masterGainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
    /**
     * Get current master volume.
     */
    getMasterVolume() {
        return this.masterGainNode.gain.value;
    }
    /**
     * Clear repetition history (useful for testing).
     */
    clearRepetitionHistory() {
        this.transientHistory.clear();
        this.impactHistory.clear();
    }
    async ensureAudioContextReady() {
        if (this.audioContext.state === "suspended") {
            try {
                await this.audioContext.resume();
            }
            catch (error) {
                console.warn("[CombatSoundManager] Failed to resume audio context:", error);
            }
        }
    }
    async preloadCatalogBuffers() {
        if (!this.soundCatalog) {
            return;
        }
        const assets = Object.values(this.soundCatalog.assets);
        await Promise.all(assets.map(async (asset) => {
            await this.loadAudioBuffer(asset);
        }));
    }
}
CombatSoundManager.DEFAULT_MASTER_VOLUME = 0.7;
