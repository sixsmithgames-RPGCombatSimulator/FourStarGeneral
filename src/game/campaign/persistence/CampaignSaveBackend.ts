/**
 * MODULE: CampaignSaveBackend
 * WHAT: Implements deterministic in-memory and browser IndexedDB storage backends for immutable Campaign 2.0 saves and atomic slot pointers.
 * WHY: SaveRepository needs one copy-on-write storage contract that is testable without weakening the production IndexedDB transaction.
 *
 * DEPENDENCIES: CampaignSaveEnvelope verifies read-back integrity; CampaignSaveTypes defines transaction and record contracts.
 * EXPORTS: In-memory state/hooks and IndexedDbCampaignSaveBackend.
 */

import { validateCampaignSaveEnvelope } from "./CampaignSaveEnvelope";
import {
  CampaignSaveError,
  type CampaignSaveAtomicCommit,
  type CampaignSaveQuarantineRecord,
  type CampaignSaveSlotIndexEntry,
  type CampaignSaveStorageBackend
} from "./CampaignSaveTypes";

/** Observable atomic commit stages used by deterministic interruption tests and tooling diagnostics. */
export type CampaignSaveCommitStage =
  | "temporaryWritten"
  | "temporaryVerified"
  | "finalWritten"
  | "slotUpdated"
  | "temporaryRemoved";

/** Optional hook that may inspect or deliberately interrupt an in-memory atomic commit. */
export type CampaignSaveCommitObserver = (stage: CampaignSaveCommitStage) => void;

/** Serializable state used to seed or inspect the deterministic in-memory backend. */
export interface InMemoryCampaignSaveBackendState {
  readonly saves: Readonly<Record<string, unknown>>;
  readonly slots: Readonly<Record<string, CampaignSaveSlotIndexEntry>>;
  readonly quarantine: Readonly<Record<string, CampaignSaveQuarantineRecord>>;
}

/**
 * WHAT: Creates a defensive map from a string-keyed record.
 * WHY: In-memory backend construction and export must never share mutable references with tests or callers.
 *
 * @param record - Serializable keyed state.
 * @returns Map containing defensive values.
 */
function cloneRecordToMap<T>(record: Readonly<Record<string, T>>): Map<string, T> {
  return new Map(Object.entries(structuredClone(record)));
}

/**
 * WHAT: Converts a map into a defensive string-keyed record.
 * WHY: Tests and non-browser tooling need an inspectable snapshot without gaining mutation access to backend truth.
 *
 * @param map - Backend map.
 * @returns Defensive serializable record.
 */
function cloneMapToRecord<T>(map: ReadonlyMap<string, T>): Record<string, T> {
  return Object.fromEntries(Array.from(map.entries(), ([key, value]) => [key, structuredClone(value)]));
}

/**
 * Deterministic transactional backend for tests and non-browser save tooling.
 * Commits mutate cloned maps and swap them only after every stage succeeds.
 */
export class InMemoryCampaignSaveBackend implements CampaignSaveStorageBackend {
  private saves: Map<string, unknown>;
  private slots: Map<string, CampaignSaveSlotIndexEntry>;
  private quarantineRecords: Map<string, CampaignSaveQuarantineRecord>;
  private readonly commitObserver?: CampaignSaveCommitObserver;

  /**
   * WHAT: Creates an isolated in-memory persistence backend.
   * WHY: Atomicity, quota/interruption simulation, quarantine, and recovery need deterministic tests independent of browser APIs.
   *
   * @param initialState - Optional persisted records used to reproduce corruption/recovery cases.
   * @param commitObserver - Optional commit-stage observer that may throw to simulate interruption.
   */
  public constructor(initialState?: InMemoryCampaignSaveBackendState, commitObserver?: CampaignSaveCommitObserver) {
    this.saves = cloneRecordToMap(initialState?.saves ?? {});
    this.slots = cloneRecordToMap(initialState?.slots ?? {});
    this.quarantineRecords = cloneRecordToMap(initialState?.quarantine ?? {});
    this.commitObserver = commitObserver;
  }

  /** @inheritdoc */
  public async getSave(saveId: string): Promise<unknown | null> {
    const value = this.saves.get(saveId);
    return value === undefined ? null : structuredClone(value);
  }

  /** @inheritdoc */
  public async getSlot(slotId: string): Promise<CampaignSaveSlotIndexEntry | null> {
    const value = this.slots.get(slotId);
    return value === undefined ? null : structuredClone(value);
  }

  /** @inheritdoc */
  public async listSlots(): Promise<readonly CampaignSaveSlotIndexEntry[]> {
    return Array.from(this.slots.values(), (slot) => structuredClone(slot))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.slotId.localeCompare(right.slotId));
  }

  /**
   * WHAT: Atomically commits against cloned maps and swaps state only after successful temporary verification.
   * WHY: An observer-thrown interruption at any stage must leave all prior records byte-equivalent.
   *
   * @param request - Immutable save, new slot pointer, and optimistic expected pointer.
   * @throws CampaignSaveError for concurrency, duplicates, validation, or simulated storage failure.
   */
  public async commitAtomic(request: CampaignSaveAtomicCommit): Promise<void> {
    const saves = new Map(this.saves);
    const slots = new Map(this.slots);
    const temporary = new Map<string, unknown>();
    const current = slots.get(request.slot.slotId) ?? null;
    if ((current?.currentSaveId ?? null) !== request.expectedCurrentSaveId) {
      throw new CampaignSaveError(
        "CONCURRENT_WRITE",
        `Campaign save slot ${request.slot.slotId} changed before the atomic commit.`,
        {
          slotId: request.slot.slotId,
          expectedCurrentSaveId: request.expectedCurrentSaveId,
          receivedCurrentSaveId: current?.currentSaveId ?? null
        }
      );
    }
    if (saves.has(request.envelope.saveId)) {
      throw new CampaignSaveError(
        "DUPLICATE_SAVE_ID",
        `Campaign save ID ${request.envelope.saveId} already exists.`,
        { saveId: request.envelope.saveId }
      );
    }

    try {
      temporary.set(request.temporaryId, structuredClone(request.envelope));
      this.commitObserver?.("temporaryWritten");
      const readBack = temporary.get(request.temporaryId);
      const validation = validateCampaignSaveEnvelope(readBack);
      if (!validation.ok) throw validation.error;
      this.commitObserver?.("temporaryVerified");
      saves.set(request.envelope.saveId, validation.envelope);
      this.commitObserver?.("finalWritten");
      slots.set(request.slot.slotId, structuredClone(request.slot));
      this.commitObserver?.("slotUpdated");
      temporary.delete(request.temporaryId);
      this.commitObserver?.("temporaryRemoved");
    } catch (error) {
      if (error instanceof CampaignSaveError) throw error;
      const detail = error instanceof Error ? error.message : String(error);
      throw new CampaignSaveError("STORAGE_FAILED", `In-memory campaign save commit was interrupted: ${detail}`, { detail });
    }

    this.saves = saves;
    this.slots = slots;
  }

  /** @inheritdoc */
  public async quarantine(record: CampaignSaveQuarantineRecord): Promise<void> {
    this.quarantineRecords.set(record.quarantineId, structuredClone(record));
  }

  /** @inheritdoc */
  public async listQuarantine(): Promise<readonly CampaignSaveQuarantineRecord[]> {
    return Array.from(this.quarantineRecords.values(), (record) => structuredClone(record))
      .sort((left, right) => right.quarantinedAt.localeCompare(left.quarantinedAt)
        || left.quarantineId.localeCompare(right.quarantineId));
  }

  /**
   * WHAT: Exports a defensive backend snapshot.
   * WHY: Corruption/recovery fixtures need to modify a copy and construct a new backend without mutating a live repository.
   *
   * @returns Complete isolated in-memory persistence state.
   */
  public exportState(): InMemoryCampaignSaveBackendState {
    return {
      saves: cloneMapToRecord(this.saves),
      slots: cloneMapToRecord(this.slots),
      quarantine: cloneMapToRecord(this.quarantineRecords)
    };
  }
}

const INDEXED_DB_VERSION = 1;
const SAVE_STORE = "campaignSaves";
const SLOT_STORE = "campaignSlots";
const TEMPORARY_STORE = "campaignTemporary";
const QUARANTINE_STORE = "campaignQuarantine";

/**
 * WHAT: Converts an IndexedDB request into a rejecting promise.
 * WHY: Backend operations need linear error handling while retaining native transaction atomicity.
 *
 * @param request - Active IndexedDB request.
 * @returns Promise resolving to the request result.
 */
function indexedDbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed without an error value."));
  });
}

/**
 * WHAT: Waits for an IndexedDB transaction to commit or abort.
 * WHY: Request success is not durability; callers return only after the transaction completes.
 *
 * @param transaction - Active transaction.
 * @returns Promise resolving only on committed completion.
 */
function indexedDbTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
  });
}

/**
 * WHAT: Maps browser storage failures into stable campaign save error codes.
 * WHY: UI and recovery logic must distinguish unavailable storage, quota exhaustion, concurrency, and generic failures.
 *
 * @param error - Unknown browser or application failure.
 * @param action - Diagnostic storage action.
 * @returns Stable CampaignSaveError.
 */
function mapIndexedDbError(error: unknown, action: string): CampaignSaveError {
  if (error instanceof CampaignSaveError) return error;
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return new CampaignSaveError("QUOTA_EXCEEDED", `IndexedDB quota was exceeded while ${action}.`, { action });
  }
  const detail = error instanceof Error ? error.message : String(error);
  return new CampaignSaveError("STORAGE_FAILED", `IndexedDB failed while ${action}: ${detail}`, { action, detail });
}

/** Browser IndexedDB implementation using copy-on-write saves and an atomic slot-pointer transaction. */
export class IndexedDbCampaignSaveBackend implements CampaignSaveStorageBackend {
  private readonly factory: IDBFactory | null;
  private readonly databaseName: string;
  private databasePromise: Promise<IDBDatabase> | null = null;

  /**
   * WHAT: Creates a browser IndexedDB save backend with injectable factory/name.
   * WHY: Production uses the global browser factory while tests/tooling can supply an isolated implementation.
   *
   * @param factory - IndexedDB factory; null makes unavailable storage explicit.
   * @param databaseName - Stable database namespace.
   */
  public constructor(
    factory: IDBFactory | null = typeof globalThis.indexedDB === "undefined" ? null : globalThis.indexedDB,
    databaseName = "fourstar-general-saves"
  ) {
    this.factory = factory;
    this.databaseName = databaseName;
  }

  /**
   * WHAT: Opens and upgrades the Campaign 2.0 object stores once.
   * WHY: Every operation must share the same schema version and fail explicitly when IndexedDB is unavailable.
   *
   * @returns Open versioned database.
   */
  private openDatabase(): Promise<IDBDatabase> {
    if (!this.factory) {
      return Promise.reject(new CampaignSaveError(
        "STORAGE_UNAVAILABLE",
        "IndexedDB is unavailable; Campaign 2.0 saves cannot fall back to the legacy localStorage slot."
      ));
    }
    if (!this.databasePromise) {
      this.databasePromise = new Promise((resolve, reject) => {
        const request = this.factory!.open(this.databaseName, INDEXED_DB_VERSION);
        request.onupgradeneeded = () => {
          const database = request.result;
          for (const store of [SAVE_STORE, SLOT_STORE, TEMPORARY_STORE, QUARANTINE_STORE]) {
            if (!database.objectStoreNames.contains(store)) database.createObjectStore(store);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(mapIndexedDbError(request.error, "opening the campaign save database"));
        request.onblocked = () => reject(new CampaignSaveError(
          "STORAGE_FAILED",
          "Campaign save database upgrade is blocked by another open game session."
        ));
      });
    }
    return this.databasePromise;
  }

  /**
   * WHAT: Reads one keyed value in a committed readonly transaction.
   * WHY: Saves, slots, and quarantine use identical safe read semantics.
   *
   * @param storeName - IndexedDB object store.
   * @param key - Record key.
   * @returns Defensive stored value or null.
   */
  private async readRecord(storeName: string, key: string): Promise<unknown | null> {
    try {
      const database = await this.openDatabase();
      const transaction = database.transaction(storeName, "readonly");
      const completion = indexedDbTransaction(transaction);
      const result = await indexedDbRequest(transaction.objectStore(storeName).get(key));
      await completion;
      return result === undefined ? null : structuredClone(result);
    } catch (error) {
      throw mapIndexedDbError(error, `reading ${storeName}/${key}`);
    }
  }

  /** @inheritdoc */
  public async getSave(saveId: string): Promise<unknown | null> {
    return this.readRecord(SAVE_STORE, saveId);
  }

  /** @inheritdoc */
  public async getSlot(slotId: string): Promise<CampaignSaveSlotIndexEntry | null> {
    return this.readRecord(SLOT_STORE, slotId) as Promise<CampaignSaveSlotIndexEntry | null>;
  }

  /** @inheritdoc */
  public async listSlots(): Promise<readonly CampaignSaveSlotIndexEntry[]> {
    try {
      const database = await this.openDatabase();
      const transaction = database.transaction(SLOT_STORE, "readonly");
      const completion = indexedDbTransaction(transaction);
      const records = await indexedDbRequest(transaction.objectStore(SLOT_STORE).getAll()) as CampaignSaveSlotIndexEntry[];
      await completion;
      return structuredClone(records)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.slotId.localeCompare(right.slotId));
    } catch (error) {
      throw mapIndexedDbError(error, "listing campaign save slots");
    }
  }

  /**
   * WHAT: Stages, verifies, promotes, and indexes one envelope inside a single IndexedDB transaction.
   * WHY: A crash, quota error, blocked request, or concurrent pointer change must preserve the prior slot and save.
   *
   * @param request - Immutable save and optimistic slot-pointer update.
   */
  public async commitAtomic(request: CampaignSaveAtomicCommit): Promise<void> {
    const preflight = validateCampaignSaveEnvelope(request.envelope);
    if (!preflight.ok) throw preflight.error;

    const database = await this.openDatabase();
    const transaction = database.transaction([SAVE_STORE, SLOT_STORE, TEMPORARY_STORE], "readwrite");
    const completion = indexedDbTransaction(transaction);
    try {
      const saves = transaction.objectStore(SAVE_STORE);
      const slots = transaction.objectStore(SLOT_STORE);
      const temporary = transaction.objectStore(TEMPORARY_STORE);
      const current = await indexedDbRequest(slots.get(request.slot.slotId)) as CampaignSaveSlotIndexEntry | undefined;
      if ((current?.currentSaveId ?? null) !== request.expectedCurrentSaveId) {
        throw new CampaignSaveError(
          "CONCURRENT_WRITE",
          `Campaign save slot ${request.slot.slotId} changed before the IndexedDB commit.`,
          { slotId: request.slot.slotId }
        );
      }
      const duplicate = await indexedDbRequest(saves.get(request.envelope.saveId));
      if (duplicate !== undefined) {
        throw new CampaignSaveError(
          "DUPLICATE_SAVE_ID",
          `Campaign save ID ${request.envelope.saveId} already exists.`,
          { saveId: request.envelope.saveId }
        );
      }

      await indexedDbRequest(temporary.put(structuredClone(request.envelope), request.temporaryId));
      const readBack = await indexedDbRequest(temporary.get(request.temporaryId));
      const verification = validateCampaignSaveEnvelope(readBack);
      if (!verification.ok) throw verification.error;
      await indexedDbRequest(saves.put(verification.envelope, verification.envelope.saveId));
      await indexedDbRequest(slots.put(structuredClone(request.slot), request.slot.slotId));
      await indexedDbRequest(temporary.delete(request.temporaryId));
      await completion;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // A browser may already have aborted after the failing request; the completion promise still settles below.
      }
      await completion.catch(() => undefined);
      throw mapIndexedDbError(error, `committing campaign save ${request.envelope.saveId}`);
    }
  }

  /** @inheritdoc */
  public async quarantine(record: CampaignSaveQuarantineRecord): Promise<void> {
    try {
      const database = await this.openDatabase();
      const transaction = database.transaction(QUARANTINE_STORE, "readwrite");
      const completion = indexedDbTransaction(transaction);
      await indexedDbRequest(transaction.objectStore(QUARANTINE_STORE).put(structuredClone(record), record.quarantineId));
      await completion;
    } catch (error) {
      throw mapIndexedDbError(error, `quarantining campaign save ${record.saveId}`);
    }
  }

  /** @inheritdoc */
  public async listQuarantine(): Promise<readonly CampaignSaveQuarantineRecord[]> {
    try {
      const database = await this.openDatabase();
      const transaction = database.transaction(QUARANTINE_STORE, "readonly");
      const completion = indexedDbTransaction(transaction);
      const records = await indexedDbRequest(transaction.objectStore(QUARANTINE_STORE).getAll()) as CampaignSaveQuarantineRecord[];
      await completion;
      return structuredClone(records)
        .sort((left, right) => right.quarantinedAt.localeCompare(left.quarantinedAt)
          || left.quarantineId.localeCompare(right.quarantineId));
    } catch (error) {
      throw mapIndexedDbError(error, "listing quarantined campaign saves");
    }
  }

  /**
   * WHAT: Closes the cached database connection.
   * WHY: Tests, hot reload, and future account/session changes need a clean way to release IndexedDB upgrades.
   */
  public async close(): Promise<void> {
    if (!this.databasePromise) return;
    const database = await this.databasePromise;
    database.close();
    this.databasePromise = null;
  }
}
