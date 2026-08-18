/**
 * MODULE: CampaignSaveRepository
 * WHAT: Manages named Campaign 2.0 slot history, atomic immutable writes, verified loads, corruption quarantine, and explicit recovery candidates.
 * WHY: Storage mechanics must not leak into UI/domain code or silently replace a damaged current save with another campaign state.
 *
 * DEPENDENCIES: CampaignSaveEnvelope certifies records; CampaignSaveStorageBackend supplies atomic persistence; CampaignCanonical creates stable quarantine IDs.
 * EXPORTS: CampaignSaveRepository and slot-write/load option contracts.
 */

import { createStableCampaignRecordId } from "../runtime/CampaignCanonical";
import {
  extractCampaignSaveDisplayMetadata,
  validateCampaignSaveEnvelope
} from "./CampaignSaveEnvelope";
import {
  CAMPAIGN_SAVE_SLOT_INDEX_VERSION,
  DEFAULT_CAMPAIGN_SAVE_HISTORY_LIMIT,
  CampaignSaveError,
  type CampaignSaveExpectedContent,
  type CampaignSaveLoadResult,
  type CampaignSaveQuarantineRecord,
  type CampaignSaveRecoveryCandidate,
  type CampaignSaveSlotIndexEntry,
  type CampaignSaveStorageBackend,
  type FourStarCampaignSaveEnvelope
} from "./CampaignSaveTypes";

/** Inputs needed to create or advance one named save slot. */
export interface CampaignSaveSlotWriteRequest {
  readonly slotId: string;
  readonly label: string;
  readonly envelope: FourStarCampaignSaveEnvelope;
}

/** Explicit load context used for content policy and deterministic quarantine metadata. */
export interface CampaignSaveSlotLoadOptions {
  readonly observedAt: string;
  readonly expectedContent?: CampaignSaveExpectedContent;
}

/**
 * WHAT: Validates a canonical UTC timestamp used in quarantine/index diagnostics.
 * WHY: Repository behavior must not call wall-clock time implicitly or store locale-dependent dates.
 *
 * @param value - Explicit caller-provided timestamp.
 * @returns True for canonical UTC ISO format.
 */
function isCanonicalIsoTimestamp(value: string): boolean {
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

/**
 * WHAT: Validates a slot index loaded from an untrusted backend.
 * WHY: A corrupt pointer/history must not direct the repository to arbitrary or duplicate records.
 *
 * @param slot - Backend-provided slot candidate.
 * @returns True when identity, history, type, and timestamp are internally valid.
 */
function isCampaignSaveSlotIndexEntry(slot: unknown): slot is CampaignSaveSlotIndexEntry {
  if (typeof slot !== "object" || slot === null) return false;
  const candidate = slot as Partial<CampaignSaveSlotIndexEntry>;
  const validType = candidate.slotType === "manual" || candidate.slotType === "autosave" || candidate.slotType === "checkpoint";
  const history = candidate.previousSaveIds;
  return candidate.indexVersion === CAMPAIGN_SAVE_SLOT_INDEX_VERSION
    && typeof candidate.slotId === "string" && candidate.slotId.trim().length > 0
    && typeof candidate.label === "string" && candidate.label.trim().length > 0
    && validType
    && typeof candidate.currentSaveId === "string" && candidate.currentSaveId.trim().length > 0
    && Array.isArray(history)
    && history.every((id) => typeof id === "string" && id.trim().length > 0)
    && new Set(history).size === history.length
    && !history.includes(candidate.currentSaveId)
    && typeof candidate.updatedAt === "string" && isCanonicalIsoTimestamp(candidate.updatedAt)
    && extractCampaignSaveDisplayMetadata({ display: candidate.display }) !== null;
}

/**
 * WHAT: Clones a corrupt raw record when possible and falls back to a diagnostic string.
 * WHY: Quarantine must not fail and hide the primary corruption just because an exotic tooling backend returned an uncloneable value.
 *
 * @param rawRecord - Unknown record returned by storage.
 * @returns Cloneable quarantine payload.
 */
function cloneQuarantinePayload(rawRecord: unknown): unknown {
  try {
    return structuredClone(rawRecord);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { uncloneableRecord: true, detail, value: String(rawRecord) };
  }
}

/**
 * WHAT: Determines whether a validation failure represents corruption rather than compatible read-only state.
 * WHY: Future-version and content-policy mismatches must be retained but not mislabeled as damaged data.
 *
 * @param error - Validation error.
 * @returns True only for malformed/checksum-corrupt records.
 */
function shouldQuarantine(error: CampaignSaveError): boolean {
  return error.code === "INVALID_ENVELOPE" || error.code === "CHECKSUM_MISMATCH";
}

/** Durable campaign save repository with immutable records and copy-on-write named slots. */
export class CampaignSaveRepository {
  private readonly backend: CampaignSaveStorageBackend;
  private readonly historyLimit: number;

  /**
   * WHAT: Creates a repository over an injected storage backend.
   * WHY: Browser IndexedDB and deterministic tests must share identical validation/recovery policy.
   *
   * @param backend - Atomic save storage implementation.
   * @param historyLimit - Maximum superseded save IDs retained per slot.
   */
  public constructor(
    backend: CampaignSaveStorageBackend,
    historyLimit = DEFAULT_CAMPAIGN_SAVE_HISTORY_LIMIT
  ) {
    if (!Number.isInteger(historyLimit) || historyLimit < 1) {
      throw new CampaignSaveError(
        "STORAGE_FAILED",
        "Campaign save history limit must be a positive integer.",
        { historyLimit }
      );
    }
    this.backend = backend;
    this.historyLimit = historyLimit;
  }

  /**
   * WHAT: Writes a verified immutable envelope and atomically creates/advances its named slot pointer.
   * WHY: Slot overwrite must preserve the prior current save until read-back verification and pointer commit both succeed.
   *
   * @param request - Slot identity/label and a fully checksummed envelope.
   * @returns Newly committed slot entry.
   */
  public async saveSlot(request: CampaignSaveSlotWriteRequest): Promise<CampaignSaveSlotIndexEntry> {
    if (request.slotId.trim().length === 0 || request.label.trim().length === 0) {
      throw new CampaignSaveError("INVALID_ENVELOPE", "Campaign save slot ID and label must be non-empty.");
    }
    const envelopeValidation = validateCampaignSaveEnvelope(request.envelope);
    if (!envelopeValidation.ok) throw envelopeValidation.error;

    const existingRaw = await this.backend.getSlot(request.slotId);
    if (existingRaw && !isCampaignSaveSlotIndexEntry(existingRaw)) {
      throw new CampaignSaveError(
        "STORAGE_FAILED",
        `Campaign save slot index ${request.slotId} is corrupt and cannot be advanced.`,
        { slotId: request.slotId }
      );
    }
    const existing = existingRaw ?? null;
    if (existing && existing.slotType !== envelopeValidation.envelope.slotType) {
      throw new CampaignSaveError(
        "INVALID_ENVELOPE",
        `Campaign save slot ${request.slotId} cannot change from ${existing.slotType} to ${envelopeValidation.envelope.slotType}.`,
        { slotId: request.slotId, previousType: existing.slotType, requestedType: envelopeValidation.envelope.slotType }
      );
    }

    const previousSaveIds = existing
      ? Array.from(new Set([existing.currentSaveId, ...existing.previousSaveIds]))
        .filter((saveId) => saveId !== envelopeValidation.envelope.saveId)
        .slice(0, this.historyLimit)
      : [];
    const slot: CampaignSaveSlotIndexEntry = {
      indexVersion: CAMPAIGN_SAVE_SLOT_INDEX_VERSION,
      slotId: request.slotId,
      label: request.label,
      slotType: envelopeValidation.envelope.slotType,
      currentSaveId: envelopeValidation.envelope.saveId,
      previousSaveIds,
      updatedAt: envelopeValidation.envelope.updatedAt,
      display: structuredClone(envelopeValidation.envelope.display)
    };
    await this.backend.commitAtomic({
      temporaryId: `temporary:${envelopeValidation.envelope.saveId}`,
      envelope: envelopeValidation.envelope,
      slot,
      expectedCurrentSaveId: existing?.currentSaveId ?? null
    });
    return structuredClone(slot);
  }

  /**
   * WHAT: Lists validated named slot pointers in backend order.
   * WHY: Save-browser callers must never render or follow malformed index records.
   *
   * @returns Defensive validated slot entries.
   */
  public async listSlots(): Promise<readonly CampaignSaveSlotIndexEntry[]> {
    const slots = await this.backend.listSlots();
    const invalid = slots.find((slot) => !isCampaignSaveSlotIndexEntry(slot));
    if (invalid) {
      throw new CampaignSaveError("STORAGE_FAILED", "Campaign save slot index contains an invalid record.");
    }
    return structuredClone(slots);
  }

  /**
   * WHAT: Persists one deterministic corruption diagnostic.
   * WHY: Damaged records remain exportable/inspectable and are never silently discarded.
   *
   * @param slotId - Slot that referenced the bad record.
   * @param saveId - Bad immutable save identity.
   * @param observedAt - Explicit canonical diagnostic timestamp.
   * @param rawRecord - Stored value that failed validation.
   * @param error - Stable validation failure.
   */
  private async quarantineRecord(
    slotId: string,
    saveId: string,
    observedAt: string,
    rawRecord: unknown,
    error: CampaignSaveError
  ): Promise<void> {
    const record: CampaignSaveQuarantineRecord = {
      quarantineId: createStableCampaignRecordId("quarantine", slotId, saveId, error.code),
      saveId,
      slotId,
      quarantinedAt: observedAt,
      reasonCode: error.code,
      reason: error.message,
      display: extractCampaignSaveDisplayMetadata(rawRecord),
      rawRecord: cloneQuarantinePayload(rawRecord)
    };
    await this.backend.quarantine(record);
  }

  /**
   * WHAT: Finds the newest independently valid prior record behind a failed slot current pointer.
   * WHY: Recovery must be explicit and must not trust an earlier save merely because it exists.
   *
   * @param slot - Valid slot history.
   * @param failedSaveId - Current failed save identity.
   * @param options - Explicit content policy and observation timestamp.
   * @returns Verified recovery candidate or null.
   */
  private async findRecoveryCandidate(
    slot: CampaignSaveSlotIndexEntry,
    failedSaveId: string,
    options: CampaignSaveSlotLoadOptions
  ): Promise<CampaignSaveRecoveryCandidate | null> {
    for (const saveId of slot.previousSaveIds) {
      const raw = await this.backend.getSave(saveId);
      if (raw === null) continue;
      const validation = validateCampaignSaveEnvelope(raw, options.expectedContent);
      if (validation.ok) {
        return { failedSaveId, envelope: validation.envelope };
      }
      if (shouldQuarantine(validation.error)) {
        await this.quarantineRecord(slot.slotId, saveId, options.observedAt, raw, validation.error);
      }
    }
    return null;
  }

  /**
   * WHAT: Loads and verifies the current slot record without silently accepting recovery history.
   * WHY: Players must know when the requested current save is damaged or incompatible and explicitly choose an earlier candidate.
   *
   * @param slotId - Named slot identity.
   * @param options - Explicit observation timestamp and optional authored-content expectation.
   * @returns Successful current envelope or failure plus an independently verified recovery candidate.
   */
  public async loadSlot(slotId: string, options: CampaignSaveSlotLoadOptions): Promise<CampaignSaveLoadResult> {
    if (!isCanonicalIsoTimestamp(options.observedAt)) {
      throw new CampaignSaveError(
        "INVALID_ENVELOPE",
        "Campaign save load observation timestamp must be canonical UTC ISO format.",
        { observedAt: options.observedAt }
      );
    }
    const slotRaw = await this.backend.getSlot(slotId);
    if (!slotRaw) {
      return {
        ok: false,
        error: new CampaignSaveError("SLOT_NOT_FOUND", `Campaign save slot ${slotId} does not exist.`, { slotId }),
        recoveryCandidate: null
      };
    }
    if (!isCampaignSaveSlotIndexEntry(slotRaw)) {
      return {
        ok: false,
        error: new CampaignSaveError("STORAGE_FAILED", `Campaign save slot index ${slotId} is corrupt.`, { slotId }),
        recoveryCandidate: null
      };
    }
    const raw = await this.backend.getSave(slotRaw.currentSaveId);
    if (raw === null) {
      const error = new CampaignSaveError(
        "SAVE_NOT_FOUND",
        `Campaign save ${slotRaw.currentSaveId} referenced by slot ${slotId} is missing.`,
        { slotId, saveId: slotRaw.currentSaveId }
      );
      return {
        ok: false,
        error,
        recoveryCandidate: await this.findRecoveryCandidate(slotRaw, slotRaw.currentSaveId, options)
      };
    }

    const validation = validateCampaignSaveEnvelope(raw, options.expectedContent);
    if (validation.ok) return { ok: true, envelope: validation.envelope };
    if (shouldQuarantine(validation.error)) {
      await this.quarantineRecord(slotId, slotRaw.currentSaveId, options.observedAt, raw, validation.error);
    }
    return {
      ok: false,
      error: validation.error,
      recoveryCandidate: await this.findRecoveryCandidate(slotRaw, slotRaw.currentSaveId, options)
    };
  }

  /**
   * WHAT: Lists persisted quarantine diagnostics.
   * WHY: Future recovery/export UI needs access without exposing backend implementation details.
   *
   * @returns Defensive quarantine records in backend order.
   */
  public async listQuarantine(): Promise<readonly CampaignSaveQuarantineRecord[]> {
    return this.backend.listQuarantine();
  }
}
