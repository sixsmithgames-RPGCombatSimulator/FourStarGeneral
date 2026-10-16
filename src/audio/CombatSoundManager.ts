/**
 * Combat Sound Manager
 *
 * Handles layered weapon audio playback using Web Audio API.
 * Assembles sounds at runtime from multiple layers with variation,
 * manages buffer caching, and controls repetition.
 */

import type {
  SoundAssetMeta,
  SoundCatalog,
  SelectedSoundLayer,
  WeaponSoundClass,
  ImpactMaterial,
  SoundLayerFamily
} from "./SoundAssetMetadata";
import { WEAPON_AUDIO_PROFILES, type WeaponAudioProfile } from "./WeaponAudioProfiles";
import { SeededRandom } from "../rendering/ProceduralPrimitives";

export type SoundPlaybackMode = "full" | "weapon" | "impact" | "impact_only" | "transient_only";

export interface CombatAudioAvailability {
  readonly available: boolean;
  readonly reason: string | null;
}

export interface QueuedWeaponSoundRequest {
  /** Weapon class to play */
  readonly weaponClass: WeaponSoundClass;
  /** Optional target material for impact sounds */
  readonly targetMaterial?: ImpactMaterial;
  /** Playback layer selection strategy */
  readonly playbackMode?: SoundPlaybackMode;
  /** Master gain multiplier */
  readonly gainMultiplier?: number;
}

/**
 * Playback request for a weapon sound event.
 */
export interface WeaponSoundRequest extends QueuedWeaponSoundRequest {
  /** Deterministic seed for variation */
  readonly seed: number;
}

/**
 * Combat sound manager using Web Audio API for layered playback.
 */
export class CombatSoundManager {
  static readonly DEFAULT_MASTER_VOLUME = 0.7;
  private static readonly RESUME_TIMEOUT_MS = 250;

  private readonly audioContext: AudioContext | null;
  private readonly masterGainNode: GainNode | null;
  private readonly availability: CombatAudioAvailability;
  private masterVolume = CombatSoundManager.DEFAULT_MASTER_VOLUME;
  private readonly bufferCache: Map<string, AudioBuffer> = new Map();
  private soundCatalog: SoundCatalog | null = null;
  private catalogReady = false;
  private catalogError: string | null = null;

  // Repetition control: track recently used variants
  private readonly transientHistory: Map<string, number[]> = new Map();
  private readonly impactHistory: Map<string, number[]> = new Map();

  constructor() {
    const AudioContextConstructor = typeof window !== "undefined"
      ? window.AudioContext
        ?? (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
    let audioContext: AudioContext | null = null;
    let masterGainNode: GainNode | null = null;
    let unavailableReason: string | null = AudioContextConstructor
      ? null
      : "Web Audio API is unavailable in this browser.";
    try {
      if (AudioContextConstructor) {
        audioContext = new AudioContextConstructor();
        masterGainNode = audioContext.createGain();
        masterGainNode.connect(audioContext.destination);
        masterGainNode.gain.value = this.masterVolume;
      }
    } catch (error) {
      console.warn("[CombatSoundManager] Web Audio API could not be initialized; continuing without combat audio", error);
      unavailableReason = "Web Audio API could not be initialized in this browser.";
      audioContext = null;
      masterGainNode = null;
    }
    this.audioContext = audioContext;
    this.masterGainNode = masterGainNode;
    this.availability = Object.freeze({
      available: audioContext !== null,
      reason: audioContext ? null : unavailableReason ?? "Combat audio is unavailable in this browser."
    });

    if (this.audioContext) {
      console.log("[CombatSoundManager] Initialized with Web Audio API");
    } else {
      console.warn("[CombatSoundManager] Web Audio API unavailable; continuing without combat audio");
    }
  }

  /**
   * Load sound catalog from JSON.
   */
  async loadSoundCatalog(source: string | SoundCatalog): Promise<void> {
    this.catalogReady = false;
    try {
      if (typeof source === "string") {
        const catalogUrl = new URL(source, document.baseURI);
        const response = await fetch(catalogUrl);
        if (!response.ok) {
          throw new Error(`Failed to load sound catalog: ${response.statusText}`);
        }

        this.soundCatalog = await response.json() as SoundCatalog;
      } else {
        this.soundCatalog = source;
      }

      await this.preloadCatalogBuffers();
      this.catalogError = null;
      this.catalogReady = true;
      console.log(`[CombatSoundManager] Loaded sound catalog v${this.soundCatalog?.version} with ${Object.keys(this.soundCatalog?.assets ?? {}).length} assets`);
    } catch (error) {
      this.catalogError = `Combat audio could not load: ${error instanceof Error ? error.message : String(error)}. Check your connection and reload the game to retry.`;
      console.error("[CombatSoundManager] Error loading sound catalog:", error);
      throw error;
    }
  }

  /**
   * Preload audio buffer for an asset.
   */
  private async loadAudioBuffer(asset: SoundAssetMeta): Promise<AudioBuffer | null> {
    if (!this.audioContext) {
      return null;
    }
    // Check cache first
    if (this.bufferCache.has(asset.id)) {
      return this.bufferCache.get(asset.id)!;
    }

    try {
      const assetUrl = new URL(asset.filePath, document.baseURI);
      const response = await fetch(assetUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      this.bufferCache.set(asset.id, audioBuffer);
      return audioBuffer;
    } catch (error) {
      throw new Error(`Failed to load audio asset ${asset.filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Play a weapon sound event with layered assembly.
   */
  async playWeaponSound(request: WeaponSoundRequest): Promise<void> {
    if (!this.audioContext || this.masterVolume === 0 || this.catalogError) {
      return;
    }
    if (!this.soundCatalog) {
      console.warn("[CombatSoundManager] Sound catalog not loaded");
      return;
    }

    // Loading is optional presentation readiness, never a queue for old visual
    // events. A fresh cue can play once the catalog has finished decoding.
    if (!this.catalogReady) return;
    if (this.masterVolume === 0 || !await this.ensureAudioContextReady() || this.masterVolume === 0) {
      return;
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
  private selectLayers(
    profile: WeaponAudioProfile,
    request: WeaponSoundRequest
  ): SelectedSoundLayer[] {
    const rng = new SeededRandom(request.seed);
    const selected: SelectedSoundLayer[] = [];
    const playbackMode = request.playbackMode ?? "full";
    const includeTransientLayers =
      playbackMode === "full" || playbackMode === "weapon" || playbackMode === "impact" || playbackMode === "transient_only";
    const includeBodyLayers = playbackMode === "full" || playbackMode === "weapon";
    const includeMechanicalLayers = playbackMode === "full" || playbackMode === "weapon";
    const includeFlightLayers = playbackMode === "full" || playbackMode === "weapon";
    const includeImpactLayers = playbackMode === "full" || playbackMode === "impact" || playbackMode === "impact_only";
    const includeTailLayers = playbackMode === "full" || playbackMode === "weapon";

    // Always include transient (mandatory for most weapons)
    if (includeTransientLayers && profile.transientPool.length > 0) {
      const transient = this.selectVariantWithCooldown(
        profile.transientPool,
        profile.weaponClass,
        "transient",
        profile.transientCooldown ?? 0,
        rng
      );

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
        const impact = this.selectVariantWithCooldown(
          impactPool,
          profile.weaponClass,
          "impact",
          profile.impactCooldown ?? 0,
          rng
        );

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
  private selectVariant(pool: readonly string[], rng: SeededRandom): SoundAssetMeta | null {
    if (pool.length === 0) return null;

    const index = rng.int(0, pool.length - 1);
    const assetId = pool[index];
    return this.soundCatalog?.assets[assetId!] ?? null;
  }

  /**
   * Select variant with repetition control cooldown.
   */
  private selectVariantWithCooldown(
    pool: readonly string[],
    weaponClass: WeaponSoundClass,
    family: SoundLayerFamily,
    cooldown: number,
    rng: SeededRandom
  ): SoundAssetMeta | null {
    if (pool.length === 0) return null;

    const historyKey = `${weaponClass}:${family}`;
    const history = family === "transient"
      ? this.transientHistory
      : this.impactHistory;

    const recentVariants = history.get(historyKey) ?? [];

    // Find available variants (not in cooldown)
    const availableIndices = pool
      .map((_, i) => i)
      .filter(i => !recentVariants.includes(i));

    let selectedIndex: number;

    if (availableIndices.length > 0) {
      // Select from available variants
      const randomAvailableIndex = rng.int(0, availableIndices.length - 1);
      selectedIndex = availableIndices[randomAvailableIndex]!;
    } else {
      // All variants in cooldown, pick randomly anyway
      selectedIndex = rng.int(0, pool.length - 1);
    }

    // Update history
    const updatedHistory = [selectedIndex, ...recentVariants].slice(0, cooldown);
    history.set(historyKey, updatedHistory);

    const assetId = pool[selectedIndex];
    return this.soundCatalog?.assets[assetId!] ?? null;
  }

  /**
   * Apply variation (pitch/gain jitter) to a selected asset.
   */
  private applyVariation(
    asset: SoundAssetMeta,
    profile: WeaponAudioProfile,
    rng: SeededRandom
  ): SelectedSoundLayer {
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
  private async playLayer(layer: SelectedSoundLayer, masterGain: number): Promise<void> {
    if (!this.audioContext || !this.masterGainNode) {
      return;
    }
    const buffer = await this.loadAudioBuffer(layer.asset);
    if (!buffer || this.masterVolume === 0 || this.audioContext.state !== "running") {
      return;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = layer.pitchMultiplier;

    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = layer.gainMultiplier * masterGain;

    source.connect(gainNode);
    gainNode.connect(this.masterGainNode);

    const releaseNodes = (): void => {
      source.disconnect();
      gainNode.disconnect();
    };
    source.onended = releaseNodes;
    try {
      const startTime = this.audioContext.currentTime + layer.startOffsetMs / 1000;
      source.start(startTime);
    } catch (error) {
      releaseNodes();
      console.error(`[CombatSoundManager] Failed to start audio asset ${layer.asset.filePath}:`, error);
      throw error;
    }
  }

  /**
   * Set master volume (0.0 to 1.0).
   */
  setMasterVolume(volume: number): void {
    if (!Number.isFinite(volume)) {
      throw new RangeError("Combat sound volume must be a finite number.");
    }
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGainNode) {
      this.masterGainNode.gain.value = this.masterVolume;
    }
  }

  /**
   * Get current master volume.
   */
  getMasterVolume(): number {
    return this.masterVolume;
  }

  /** Reports runtime capability and asset readiness independently of the saved volume preference. */
  getAvailability(): CombatAudioAvailability {
    return this.catalogError
      ? { available: false, reason: this.catalogError }
      : this.availability;
  }

  /**
   * Clear repetition history (useful for testing).
   */
  clearRepetitionHistory(): void {
    this.transientHistory.clear();
    this.impactHistory.clear();
  }

  private async ensureAudioContextReady(): Promise<boolean> {
    if (!this.audioContext || this.audioContext.state === "closed") return false;
    if (this.audioContext.state === "running") return true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // Browsers may leave resume pending until a permitted gesture. Expire this
      // visual cue instead of stalling combat or replaying it after a later unlock.
      await Promise.race([
        this.audioContext.resume(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error(`Browser audio did not resume within ${CombatSoundManager.RESUME_TIMEOUT_MS}ms. Enable Battle Sound after interacting with the game to retry.`)),
            CombatSoundManager.RESUME_TIMEOUT_MS);
        })
      ]);
      // Web Audio can change state during the awaited resume even though TS
      // retains the pre-await narrowed property type.
      return (this.audioContext.state as AudioContextState) === "running";
    } catch (error) {
      console.warn("[CombatSoundManager] Skipping audio cue because the browser did not resume combat sound:", error);
      return false;
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  private async preloadCatalogBuffers(): Promise<void> {
    if (!this.soundCatalog) {
      return;
    }

    const assets = Object.values(this.soundCatalog.assets);
    await Promise.all(assets.map(async (asset) => {
      await this.loadAudioBuffer(asset);
    }));
  }
}
