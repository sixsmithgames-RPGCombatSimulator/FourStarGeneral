/**
 * Sound Asset Metadata and Type Definitions
 *
 * Defines metadata structure for layered weapon audio assets.
 * Each sound asset is tagged with family, weapon class, material, and variation info.
 */

/**
 * Sound layer families for weapon audio.
 */
export type SoundLayerFamily =
  | "transient"
  | "body"
  | "mechanical"
  | "flight"
  | "impact"
  | "debris"
  | "tail";

/**
 * Weapon classes matching effect types.
 */
export type WeaponSoundClass =
  | "small_arms"
  | "mg"
  | "mortar"
  | "cannon"
  | "tank_50mm"
  | "tank_75mm"
  | "tank_100mm"
  | "tank_destroyer_150mm"
  | "rocket"
  | "artillery"
  | "small_bomb"
  | "large_bomb"
  | "demolition_charge";

/**
 * Impact material types for terrain-responsive sounds.
 */
export type ImpactMaterial =
  | "soft"
  | "earth"
  | "mud"
  | "grass"
  | "armor"
  | "wood"
  | "masonry"
  | "road"
  | "snow"
  | "sand";

/**
 * Loudness classification for mixing.
 */
export type LoudnessClass = "light" | "medium" | "heavy" | "massive";

/**
 * Metadata for a single sound asset.
 */
export interface SoundAssetMeta {
  /** Unique asset identifier */
  readonly id: string;
  /** Layer family this asset belongs to */
  readonly family: SoundLayerFamily;
  /** Weapon class this sound is designed for */
  readonly weaponClass: WeaponSoundClass;
  /** Optional material this sound represents (for impacts/debris) */
  readonly material?: ImpactMaterial;
  /** Variant index within its pool */
  readonly variantIndex: number;
  /** Duration in milliseconds */
  readonly durationMs: number;
  /** Loudness classification for gain staging */
  readonly loudnessClass: LoudnessClass;
  /** Additional tags for filtering */
  readonly tags: string[];
  /** File path relative to sounds directory */
  readonly filePath: string;
}

/**
 * Sound catalog containing all loaded assets.
 */
export interface SoundCatalog {
  /** All sound assets indexed by ID */
  readonly assets: Record<string, SoundAssetMeta>;
  /** Version of the catalog */
  readonly version: string;
}

/**
 * Runtime variation parameters for sound playback.
 */
export interface SoundVariationParams {
  /** Pitch jitter percentage (e.g., 0.02 = ±2%) */
  readonly pitchJitterPct: number;
  /** Gain jitter in decibels (e.g., 1.5 = ±1.5dB) */
  readonly gainJitterDb: number;
  /** Start time offset jitter in milliseconds */
  readonly startOffsetJitterMs: number;
}

/**
 * Layer selection result for runtime assembly.
 */
export interface SelectedSoundLayer {
  /** The sound asset to play */
  readonly asset: SoundAssetMeta;
  /** Calculated pitch multiplier (1.0 = no change) */
  readonly pitchMultiplier: number;
  /** Calculated gain multiplier (1.0 = 0dB) */
  readonly gainMultiplier: number;
  /** Delay offset in milliseconds */
  readonly startOffsetMs: number;
}
