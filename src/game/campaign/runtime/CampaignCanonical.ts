/**
 * MODULE: CampaignCanonical
 * WHAT: Provides deterministic JSON canonicalization, content hashing, and stable campaign record IDs.
 * WHY: Save compatibility, deterministic tests, and idempotent events require identifiers independent of object insertion order or wall-clock time.
 *
 * DEPENDENCIES: campaignRuntimeTypes supplies structured errors.
 * EXPORTS: canonicalCampaignStringify, computeCampaignContentHash, and createStableCampaignRecordId.
 */

import { CampaignRuntimeError } from "./campaignRuntimeTypes";

type CanonicalPrimitive = string | number | boolean | null;
type CanonicalValue = CanonicalPrimitive | CanonicalValue[] | { [key: string]: CanonicalValue };

/**
 * WHAT: Determines whether a value is a plain serializable record.
 * WHY: Accepting class instances would make the canonical representation depend on hidden prototype behavior.
 *
 * @param value - Candidate object.
 * @returns True only for object-literal or null-prototype records.
 */
function isPlainRecord(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * WHAT: Converts supported campaign data into recursively key-sorted JSON data.
 * WHY: Native JSON preserves insertion order, which would make semantically identical content produce different hashes.
 *
 * @param value - Value to normalize.
 * @param path - Diagnostic path used when unsupported data is encountered.
 * @returns Canonical JSON value, or undefined for omitted object properties.
 * @throws CampaignRuntimeError when data is not finite or JSON-compatible.
 */
function canonicalizeCampaignValue(value: unknown, path: string): CanonicalValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CampaignRuntimeError(
        "CANONICALIZATION_FAILED",
        `Campaign content contains a non-finite number at ${path}.`,
        { path, value: String(value) }
      );
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      const normalized = canonicalizeCampaignValue(entry, `${path}[${index}]`);
      if (normalized === undefined) {
        throw new CampaignRuntimeError(
          "CANONICALIZATION_FAILED",
          `Campaign content contains an undefined array entry at ${path}[${index}].`,
          { path: `${path}[${index}]` }
        );
      }
      return normalized;
    });
  }
  if (typeof value === "object") {
    if (!isPlainRecord(value)) {
      throw new CampaignRuntimeError(
        "CANONICALIZATION_FAILED",
        `Campaign content contains a non-plain object at ${path}.`,
        { path }
      );
    }
    // The plain-object check above justifies treating enumerable entries as a string-keyed record.
    const record = value as Record<string, unknown>;
    const normalized: { [key: string]: CanonicalValue } = {};
    Object.keys(record).sort().forEach((key) => {
      const entry = canonicalizeCampaignValue(record[key], `${path}.${key}`);
      if (entry !== undefined) {
        normalized[key] = entry;
      }
    });
    return normalized;
  }

  throw new CampaignRuntimeError(
    "CANONICALIZATION_FAILED",
    `Campaign content contains an unsupported ${typeof value} value at ${path}.`,
    { path, valueType: typeof value }
  );
}

/**
 * WHAT: Serializes campaign data into stable, recursively key-sorted JSON.
 * WHY: Content hashes and deterministic IDs must not change when object properties are inserted in a different order.
 *
 * @param value - JSON-compatible campaign data.
 * @returns Stable JSON string.
 * @throws CampaignRuntimeError when the root is undefined or contains unsupported values.
 */
export function canonicalCampaignStringify(value: unknown): string {
  const canonical = canonicalizeCampaignValue(value, "$");
  if (canonical === undefined) {
    throw new CampaignRuntimeError(
      "CANONICALIZATION_FAILED",
      "Campaign content cannot canonicalize an undefined root value.",
      { path: "$" }
    );
  }
  return JSON.stringify(canonical);
}

/**
 * WHAT: Computes a compact deterministic FNV-1a hash of campaign content.
 * WHY: Browser and test environments need a synchronous content identity without depending on asynchronous crypto APIs.
 *
 * @param value - JSON-compatible campaign data.
 * @returns Version-prefixed lowercase hexadecimal content hash.
 */
export function computeCampaignContentHash(value: unknown): string {
  const canonical = canonicalCampaignStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32-${hash.toString(16).padStart(8, "0")}`;
}

/**
 * WHAT: Normalizes a record kind into a readable ID prefix.
 * WHY: Stable IDs remain useful in logs while rejecting ambiguous or empty namespaces.
 *
 * @param kind - Human-readable entity kind.
 * @returns Lowercase identifier-safe prefix.
 * @throws CampaignRuntimeError when no usable characters remain.
 */
function normalizeRecordKind(kind: string): string {
  const normalized = kind.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (normalized.length === 0) {
    throw new CampaignRuntimeError(
      "CANONICALIZATION_FAILED",
      "Stable campaign record IDs require a non-empty record kind.",
      { kind }
    );
  }
  return normalized;
}

/**
 * WHAT: Creates a deterministic ID from an entity kind and stable identity components.
 * WHY: Legacy migration and domain-event idempotency cannot rely on array positions, wall-clock time, or unseeded randomness.
 *
 * @param kind - Entity namespace such as campaign, tile, formation, event, or transaction.
 * @param components - Stable content identifying this record within the namespace.
 * @returns Readable, deterministic identifier.
 */
export function createStableCampaignRecordId(kind: string, ...components: readonly unknown[]): string {
  const prefix = normalizeRecordKind(kind);
  const hash = computeCampaignContentHash({ kind: prefix, components }).replace("fnv1a32-", "");
  return `${prefix}_${hash}`;
}
