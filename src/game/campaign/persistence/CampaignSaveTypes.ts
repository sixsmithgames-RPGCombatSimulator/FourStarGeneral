/**
 * MODULE: CampaignSaveTypes
 * WHAT: Defines versioned Campaign 2.0 save envelopes, payload metadata, slot indexes, quarantine records, and structured persistence errors.
 * WHY: Durable saves need explicit contracts independent of browser storage and player-facing save UI.
 *
 * DEPENDENCIES: Campaign runtime contracts supply the authoritative campaign payload.
 * EXPORTS: Save schema constants, envelope/index records, results, errors, and backend transaction contracts.
 */

import type { CampaignRuntimeState } from "../runtime/campaignRuntimeTypes";
import type { ActiveCampaignBattleSave } from "../../battle/persistence/BattleSaveTypes";

/** Current unified Four-Star save envelope schema. */
export const FOUR_STAR_SAVE_ENVELOPE_VERSION = 1;

/** Current named-slot index schema. */
export const CAMPAIGN_SAVE_SLOT_INDEX_VERSION = 1;

/** Default number of superseded immutable records retained behind one slot. */
export const DEFAULT_CAMPAIGN_SAVE_HISTORY_LIMIT = 8;

/** Player-visible storage purpose for one save slot. */
export type FourStarSaveSlotType = "manual" | "autosave" | "checkpoint";

/** Game state represented by the unified envelope. Campaign persistence currently authors campaign records only. */
export type FourStarSaveGameMode = "campaign" | "battle";

/** Landing-screen and save-browser metadata that does not own campaign rules truth. */
export interface CampaignSaveDisplayMetadata {
  readonly campaignTitle: string;
  readonly segment: number;
  readonly phaseLabel: string;
  readonly lastEventSummary: string | null;
  readonly playTimeSeconds: number;
  readonly difficulty: string | null;
  readonly result: "victory" | "defeat" | null;
  readonly thumbnailKey: string | null;
}

/** Minimal campaign workspace context restored after authoritative state hydration. */
export interface CampaignUiResumeContext {
  readonly workspace: "theater" | "operations" | "intelligence" | "logistics" | "formations" | "objectives";
  readonly selectedEntityId: string | null;
  readonly mapCenter: { readonly x: number; readonly y: number } | null;
  readonly mapZoom: number | null;
}

/** Campaign payload owns the optional campaign-bound tactical continuation. */
export interface CampaignSavePayload {
  readonly runtime: CampaignRuntimeState;
  readonly activeBattle: ActiveCampaignBattleSave | null;
  readonly commanderRosterLink: string | null;
  readonly uiResumeContext: CampaignUiResumeContext;
}

/** Integrity-checked immutable Campaign 2.0 save artifact. */
export interface FourStarCampaignSaveEnvelope {
  readonly envelopeVersion: typeof FOUR_STAR_SAVE_ENVELOPE_VERSION;
  readonly saveId: string;
  readonly slotType: FourStarSaveSlotType;
  readonly gameMode: "campaign";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly buildVersion: string;
  readonly contentVersion: string;
  readonly scenarioKey: string;
  readonly campaignId: string;
  readonly engagementId: string | null;
  readonly display: CampaignSaveDisplayMetadata;
  readonly payload: CampaignSavePayload;
  readonly checksum: string;
}

/** Immutable envelope fields accepted before the version and checksum are assigned. */
export type CampaignSaveEnvelopeInput = Omit<FourStarCampaignSaveEnvelope, "envelopeVersion" | "checksum">;

/** Optional authored-content expectation enforced while opening an otherwise valid save. */
export interface CampaignSaveExpectedContent {
  readonly scenarioKey: string;
  readonly scenarioContentHash: string;
}

/** Named pointer to the newest immutable envelope and bounded prior history. */
export interface CampaignSaveSlotIndexEntry {
  readonly indexVersion: typeof CAMPAIGN_SAVE_SLOT_INDEX_VERSION;
  readonly slotId: string;
  readonly label: string;
  readonly slotType: FourStarSaveSlotType;
  readonly currentSaveId: string;
  readonly previousSaveIds: readonly string[];
  readonly updatedAt: string;
  readonly display: CampaignSaveDisplayMetadata;
}

/** Persisted diagnostic record for a corrupt save that must not become authoritative. */
export interface CampaignSaveQuarantineRecord {
  readonly quarantineId: string;
  readonly saveId: string;
  readonly slotId: string;
  readonly quarantinedAt: string;
  readonly reasonCode: CampaignSaveErrorCode;
  readonly reason: string;
  readonly display: CampaignSaveDisplayMetadata | null;
  readonly rawRecord: unknown;
}

/** Stable save-layer failure categories used by storage, migrations, recovery, and future UI. */
export type CampaignSaveErrorCode =
  | "INVALID_ENVELOPE"
  | "UNSUPPORTED_ENVELOPE_VERSION"
  | "CHECKSUM_MISMATCH"
  | "CONTENT_MISMATCH"
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_FAILED"
  | "QUOTA_EXCEEDED"
  | "CONCURRENT_WRITE"
  | "DUPLICATE_SAVE_ID"
  | "SLOT_NOT_FOUND"
  | "SAVE_NOT_FOUND"
  | "MIGRATION_FAILED"
  | "UNSUPPORTED_LEGACY_VERSION";

/** Scalar diagnostic context safe for logs and player-facing error adapters. */
export type CampaignSaveErrorContextValue = string | number | boolean | null;

/** Structured persistence error with stable recovery semantics. */
export class CampaignSaveError extends Error {
  public readonly code: CampaignSaveErrorCode;
  public readonly context: Readonly<Record<string, CampaignSaveErrorContextValue>>;

  /**
   * WHAT: Creates a stable save error with scalar diagnostic context.
   * WHY: Persistence failures must be distinguishable without parsing display text.
   *
   * @param code - Stable persistence failure category.
   * @param message - Human-readable diagnostic explanation.
   * @param context - Scalar facts useful for recovery and diagnostics.
   */
  public constructor(
    code: CampaignSaveErrorCode,
    message: string,
    context: Readonly<Record<string, CampaignSaveErrorContextValue>> = {}
  ) {
    super(message);
    this.name = "CampaignSaveError";
    this.code = code;
    this.context = context;
  }
}

/** One structural or semantic envelope validation issue. */
export interface CampaignSaveValidationIssue {
  readonly path: string;
  readonly message: string;
}

/** Successful envelope validation with a defensive typed copy. */
export interface CampaignSaveValidationSuccess {
  readonly ok: true;
  readonly envelope: FourStarCampaignSaveEnvelope;
}

/** Failed envelope validation retaining all detected issues. */
export interface CampaignSaveValidationFailure {
  readonly ok: false;
  readonly error: CampaignSaveError;
  readonly issues: readonly CampaignSaveValidationIssue[];
}

/** Non-throwing envelope validation result. */
export type CampaignSaveValidationResult = CampaignSaveValidationSuccess | CampaignSaveValidationFailure;

/** Atomic backend request that creates one immutable save and advances a slot pointer. */
export interface CampaignSaveAtomicCommit {
  readonly temporaryId: string;
  readonly envelope: FourStarCampaignSaveEnvelope;
  readonly slot: CampaignSaveSlotIndexEntry;
  readonly expectedCurrentSaveId: string | null;
}

/** Storage contract implemented by IndexedDB and deterministic test/tooling backends. */
export interface CampaignSaveStorageBackend {
  getSave(saveId: string): Promise<unknown | null>;
  getSlot(slotId: string): Promise<CampaignSaveSlotIndexEntry | null>;
  listSlots(): Promise<readonly CampaignSaveSlotIndexEntry[]>;
  commitAtomic(request: CampaignSaveAtomicCommit): Promise<void>;
  quarantine(record: CampaignSaveQuarantineRecord): Promise<void>;
  listQuarantine(): Promise<readonly CampaignSaveQuarantineRecord[]>;
}

/** Explicit earlier verified envelope offered after the current slot record fails validation. */
export interface CampaignSaveRecoveryCandidate {
  readonly failedSaveId: string;
  readonly envelope: FourStarCampaignSaveEnvelope;
}

/** Successful current-slot load. */
export interface CampaignSaveLoadSuccess {
  readonly ok: true;
  readonly envelope: FourStarCampaignSaveEnvelope;
}

/** Failed current-slot load with an optional independently verified earlier candidate. */
export interface CampaignSaveLoadFailure {
  readonly ok: false;
  readonly error: CampaignSaveError;
  readonly recoveryCandidate: CampaignSaveRecoveryCandidate | null;
}

/** Repository load result that never silently substitutes an earlier save. */
export type CampaignSaveLoadResult = CampaignSaveLoadSuccess | CampaignSaveLoadFailure;
