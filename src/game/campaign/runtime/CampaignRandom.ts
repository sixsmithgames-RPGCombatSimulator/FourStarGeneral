/**
 * MODULE: CampaignRandom
 * WHAT: Implements serialized deterministic random streams for Campaign 2.0.
 * WHY: Weather, movement, intelligence, AI tie-breaking, combat delegation, and identity must not reroll one another or change after loading.
 *
 * DEPENDENCIES: CampaignCanonical derives stable per-stream seeds; campaignRuntimeTypes defines serialized contracts and errors.
 * EXPORTS: Stream names, state validation, and the CampaignRandom generator.
 */

import { computeCampaignContentHash } from "./CampaignCanonical";
import {
  CAMPAIGN_RANDOM_STATE_VERSION,
  CampaignRuntimeError,
  type CampaignRandomStreamName,
  type SerializedCampaignRandomState
} from "./campaignRuntimeTypes";

/** Fixed stream order keeps initialization, validation, and serialized diagnostics stable. */
export const CAMPAIGN_RANDOM_STREAM_NAMES: readonly CampaignRandomStreamName[] = [
  "weather",
  "movement",
  "intelligence",
  "aiTieBreak",
  "delegatedCombat",
  "identity"
];

/**
 * WHAT: Checks whether a numeric seed is a serialized unsigned 32-bit integer.
 * WHY: JavaScript bitwise operations silently coerce invalid numbers; campaign saves must reject them explicitly.
 *
 * @param value - Candidate seed.
 * @returns True when the value is an integer from 0 through 2^32-1.
 */
function isUint32(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

/**
 * WHAT: Derives one deterministic subsystem seed from a base seed and stream name.
 * WHY: Independent stream seeds ensure consuming weather randomness never changes an AI or intelligence result.
 *
 * @param baseSeed - Campaign-wide unsigned seed.
 * @param stream - Named subsystem stream.
 * @returns Deterministic unsigned stream seed.
 */
function deriveStreamSeed(baseSeed: number, stream: CampaignRandomStreamName): number {
  const hash = computeCampaignContentHash({ baseSeed, stream });
  return Number.parseInt(hash.slice("fnv1a32-".length), 16) >>> 0;
}

/**
 * WHAT: Creates a complete initialized stream record.
 * WHY: Materializing every known stream prevents missing fields from turning into hidden defaults during load.
 *
 * @param baseSeed - Valid unsigned campaign seed.
 * @returns Seed for every named subsystem stream.
 */
function createStreamSeeds(baseSeed: number): Record<CampaignRandomStreamName, number> {
  return {
    weather: deriveStreamSeed(baseSeed, "weather"),
    movement: deriveStreamSeed(baseSeed, "movement"),
    intelligence: deriveStreamSeed(baseSeed, "intelligence"),
    aiTieBreak: deriveStreamSeed(baseSeed, "aiTieBreak"),
    delegatedCombat: deriveStreamSeed(baseSeed, "delegatedCombat"),
    identity: deriveStreamSeed(baseSeed, "identity")
  };
}

/**
 * WHAT: Validates the complete serialized random-state contract.
 * WHY: Loading a missing or malformed stream must fail explicitly instead of reseeding and changing the campaign future.
 *
 * @param state - Unknown save payload field.
 * @returns True only when version, base seed, and every named stream are valid.
 */
export function isSerializedCampaignRandomState(state: unknown): state is SerializedCampaignRandomState {
  if (typeof state !== "object" || state === null) {
    return false;
  }
  // Runtime validation above establishes that reading named scalar fields is safe.
  const candidate = state as {
    version?: unknown;
    baseSeed?: unknown;
    streams?: unknown;
  };
  if (candidate.version !== CAMPAIGN_RANDOM_STATE_VERSION || !isUint32(candidate.baseSeed)) {
    return false;
  }
  if (typeof candidate.streams !== "object" || candidate.streams === null) {
    return false;
  }
  const streams = candidate.streams as Record<string, unknown>;
  return CAMPAIGN_RANDOM_STREAM_NAMES.every((name) => isUint32(streams[name]));
}

/**
 * Serializable deterministic campaign random generator with isolated named streams.
 */
export class CampaignRandom {
  private readonly baseSeed: number;
  private readonly streams: Record<CampaignRandomStreamName, number>;

  /**
   * WHAT: Creates deterministic named streams from an unsigned campaign seed.
   * WHY: New campaigns require explicit, reproducible random state from their first mutation.
   *
   * @param baseSeed - Integer from 0 through 2^32-1.
   * @throws CampaignRuntimeError when the seed is invalid.
   */
  public constructor(baseSeed: number) {
    if (!isUint32(baseSeed)) {
      throw new CampaignRuntimeError(
        "INVALID_RANDOM_STATE",
        "Campaign random seed must be an unsigned 32-bit integer.",
        { baseSeed: String(baseSeed) }
      );
    }
    this.baseSeed = baseSeed;
    this.streams = createStreamSeeds(baseSeed);
  }

  /**
   * WHAT: Restores a generator from serialized named-stream state.
   * WHY: Loading must continue the exact random sequence rather than deriving fresh stream seeds.
   *
   * @param state - Complete serialized random state.
   * @returns Restored deterministic generator.
   * @throws CampaignRuntimeError when any stream is absent or malformed.
   */
  public static fromSerialized(state: unknown): CampaignRandom {
    if (!isSerializedCampaignRandomState(state)) {
      throw new CampaignRuntimeError(
        "INVALID_RANDOM_STATE",
        "Campaign random state is missing, has an unsupported version, or contains an invalid named stream.",
        { expectedVersion: CAMPAIGN_RANDOM_STATE_VERSION }
      );
    }
    const generator = new CampaignRandom(state.baseSeed);
    CAMPAIGN_RANDOM_STREAM_NAMES.forEach((name) => {
      generator.streams[name] = state.streams[name];
    });
    return generator;
  }

  /**
   * WHAT: Advances one named stream and returns a normalized value.
   * WHY: All campaign randomness must be explicit about which subsystem consumes it.
   *
   * @param stream - Named subsystem stream.
   * @returns Deterministic number in [0, 1).
   */
  public next(stream: CampaignRandomStreamName): number {
    const nextSeed = (Math.imul(this.streams[stream], 1664525) + 1013904223) >>> 0;
    this.streams[stream] = nextSeed;
    return nextSeed / 0x100000000;
  }

  /**
   * WHAT: Returns a deterministic floating-point value inside a half-open interval.
   * WHY: Domain services should not reproduce range math or consume a generic global stream.
   *
   * @param stream - Named subsystem stream.
   * @param minimum - Inclusive finite lower bound.
   * @param maximum - Exclusive finite upper bound greater than minimum.
   * @returns Deterministic number in [minimum, maximum).
   * @throws CampaignRuntimeError when the interval is invalid.
   */
  public range(stream: CampaignRandomStreamName, minimum: number, maximum: number): number {
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) {
      throw new CampaignRuntimeError(
        "INVALID_RANDOM_RANGE",
        "Campaign random range requires finite bounds with maximum greater than minimum.",
        { stream, minimum: String(minimum), maximum: String(maximum) }
      );
    }
    return minimum + this.next(stream) * (maximum - minimum);
  }

  /**
   * WHAT: Returns a deterministic integer inside an inclusive interval.
   * WHY: Selection and tie-breaking need unbiased, validated integer bounds.
   *
   * @param stream - Named subsystem stream.
   * @param minimum - Inclusive integer lower bound.
   * @param maximum - Inclusive integer upper bound.
   * @returns Deterministic integer in [minimum, maximum].
   * @throws CampaignRuntimeError when either bound is non-integral or reversed.
   */
  public integer(stream: CampaignRandomStreamName, minimum: number, maximum: number): number {
    if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || maximum < minimum) {
      throw new CampaignRuntimeError(
        "INVALID_RANDOM_RANGE",
        "Campaign random integer range requires integral bounds with maximum at least minimum.",
        { stream, minimum, maximum }
      );
    }
    return Math.floor(this.next(stream) * (maximum - minimum + 1)) + minimum;
  }

  /**
   * WHAT: Captures the exact current state of every named random stream.
   * WHY: Campaign save/load and transaction rollback require a defensive, serializable checkpoint.
   *
   * @returns Complete immutable random-state snapshot.
   */
  public serialize(): SerializedCampaignRandomState {
    return {
      version: CAMPAIGN_RANDOM_STATE_VERSION,
      baseSeed: this.baseSeed,
      streams: { ...this.streams }
    };
  }
}
