/**
 * MODULE: CampaignSaveEnvelope
 * WHAT: Creates, checksums, structurally validates, and hydrates unified Campaign 2.0 save envelopes.
 * WHY: Storage backends must never persist or return an envelope whose identity, runtime, metadata, or integrity is unverified.
 *
 * DEPENDENCIES: CampaignCanonical supplies deterministic hashing; runtime invariants certify authoritative payload truth.
 * EXPORTS: Checksum, creation, validation, assertion, and display-metadata extraction functions.
 */

import { computeCampaignContentHash } from "../runtime/CampaignCanonical";
import { validateCampaignRuntimeState } from "../runtime/CampaignInvariantValidator";
import type { CampaignRuntimeState } from "../runtime/campaignRuntimeTypes";
import { assertCompleteActiveCampaignBattleSave } from "../../battle/persistence/BattleSaveTypes";
import {
  FOUR_STAR_SAVE_ENVELOPE_VERSION,
  CampaignSaveError,
  type CampaignSaveDisplayMetadata,
  type CampaignSaveEnvelopeInput,
  type CampaignSaveExpectedContent,
  type CampaignSaveValidationIssue,
  type CampaignSaveValidationResult,
  type FourStarCampaignSaveEnvelope
} from "./CampaignSaveTypes";

/** Supported player workspace values for envelope-version 1 UI resume context. */
const CAMPAIGN_SAVE_WORKSPACES = new Set([
  "theater",
  "operations",
  "intelligence",
  "logistics",
  "formations",
  "objectives"
]);

/** Supported slot purposes for envelope-version 1. */
const CAMPAIGN_SAVE_SLOT_TYPES = new Set(["manual", "autosave", "checkpoint"]);

/**
 * WHAT: Identifies plain object records before property inspection.
 * WHY: Save input is untrusted JSON/IndexedDB data and must be shape-checked before typed access.
 *
 * @param value - Unknown candidate value.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * WHAT: Checks a timestamp for canonical UTC ISO representation.
 * WHY: Stable timestamps avoid locale ambiguity in indexes, exports, and deterministic diagnostics.
 *
 * @param value - Candidate timestamp.
 * @returns True when parsing and re-serialization produce the same ISO string.
 */
function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

/**
 * WHAT: Checks an optional string field.
 * WHY: Reused nullable metadata fields need consistent shape rules.
 *
 * @param value - Candidate nullable string.
 * @returns True for null or a string.
 */
function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/**
 * WHAT: Adds one envelope issue when a condition is false.
 * WHY: Validation reports every usable diagnostic instead of stopping at the first malformed field.
 *
 * @param issues - Current issue accumulator.
 * @param condition - Required condition.
 * @param path - Failing envelope path.
 * @param message - Human-readable failure.
 */
function requireEnvelopeField(
  issues: CampaignSaveValidationIssue[],
  condition: boolean,
  path: string,
  message: string
): void {
  if (!condition) issues.push({ path, message });
}

/**
 * WHAT: Removes the checksum field from an envelope-shaped record.
 * WHY: Integrity covers every stored field except the checksum value itself.
 *
 * @param value - Envelope-shaped plain record.
 * @returns Defensive unsigned record retaining known and unknown fields.
 */
function unsignedEnvelopeRecord(value: Record<string, unknown>): Record<string, unknown> {
  const clone = structuredClone(value);
  delete clone.checksum;
  return clone;
}

/**
 * WHAT: Computes the version-tagged checksum of every envelope field except `checksum`.
 * WHY: Read-back verification must detect truncation, mutation, interrupted promotion, and metadata/payload drift.
 *
 * @param value - Envelope-shaped record with or without an existing checksum.
 * @returns Versioned deterministic integrity checksum.
 * @throws CampaignSaveError when the value is not an object or cannot be canonicalized.
 */
export function computeCampaignSaveChecksum(value: unknown): string {
  if (!isRecord(value)) {
    throw new CampaignSaveError("INVALID_ENVELOPE", "Campaign save checksum requires an envelope object.");
  }
  try {
    return `fsg-save-v1-${computeCampaignContentHash(unsignedEnvelopeRecord(value))}`;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CampaignSaveError(
      "INVALID_ENVELOPE",
      `Campaign save contains data that cannot be checksummed: ${detail}`,
      { detail }
    );
  }
}

/**
 * WHAT: Validates landing-screen metadata independently of runtime truth.
 * WHY: Corrupt summaries must not break slot listing even when the payload is otherwise intact.
 *
 * @param display - Unknown display record.
 * @param issues - Envelope issue accumulator.
 */
function validateDisplayMetadata(display: unknown, issues: CampaignSaveValidationIssue[]): void {
  if (!isRecord(display)) {
    issues.push({ path: "display", message: "Save display metadata must be an object." });
    return;
  }
  requireEnvelopeField(issues, typeof display.campaignTitle === "string" && display.campaignTitle.trim().length > 0,
    "display.campaignTitle", "Campaign title must be non-empty.");
  requireEnvelopeField(issues, Number.isInteger(display.segment) && Number(display.segment) >= 0,
    "display.segment", "Display segment must be a non-negative integer.");
  requireEnvelopeField(issues, typeof display.phaseLabel === "string" && display.phaseLabel.trim().length > 0,
    "display.phaseLabel", "Phase label must be non-empty.");
  requireEnvelopeField(issues, isNullableString(display.lastEventSummary),
    "display.lastEventSummary", "Last-event summary must be a string or null.");
  requireEnvelopeField(issues, typeof display.playTimeSeconds === "number"
    && Number.isFinite(display.playTimeSeconds) && display.playTimeSeconds >= 0,
  "display.playTimeSeconds", "Play time must be a non-negative finite number.");
  requireEnvelopeField(issues, isNullableString(display.difficulty),
    "display.difficulty", "Difficulty must be a string or null.");
  requireEnvelopeField(issues, display.result === null || display.result === "victory" || display.result === "defeat",
    "display.result", "Result must be victory, defeat, or null.");
  requireEnvelopeField(issues, isNullableString(display.thumbnailKey),
    "display.thumbnailKey", "Thumbnail key must be a string or null.");
}

/**
 * WHAT: Performs safe minimum shape checks before invoking the typed runtime invariant validator.
 * WHY: A corrupt save may omit nested runtime collections that the invariant validator legitimately expects from typed callers.
 *
 * @param runtime - Unknown payload runtime.
 * @returns True when required top-level collections and scalar links exist.
 */
function hasRuntimeValidationShape(runtime: unknown): runtime is CampaignRuntimeState {
  if (!isRecord(runtime)) return false;
  return typeof runtime.campaignId === "string"
    && typeof runtime.scenarioKey === "string"
    && typeof runtime.scenarioContentHash === "string"
    && Array.isArray(runtime.tileOrder)
    && isRecord(runtime.tiles)
    && Array.isArray(runtime.factionOrder)
    && isRecord(runtime.factions)
    && Array.isArray(runtime.formationOrder)
    && isRecord(runtime.formations)
    && Array.isArray(runtime.engagementOrder)
    && isRecord(runtime.engagements)
    && Array.isArray(runtime.engagementLedgerOrder)
    && isRecord(runtime.engagementLedger)
    && Array.isArray(runtime.objectiveOrder)
    && isRecord(runtime.objectives)
    && Array.isArray(runtime.orderOrder)
    && isRecord(runtime.orders)
    && Array.isArray(runtime.reservationOrder)
    && isRecord(runtime.reservations)
    && isRecord(runtime.knowledgeByFaction)
    && Array.isArray(runtime.eventLog)
    && Array.isArray(runtime.advanceRecordOrder)
    && isRecord(runtime.advanceRecords)
    && isRecord(runtime.compatibility);
}

/**
 * WHAT: Validates payload/runtime/UI resume structure and cross-envelope identity links.
 * WHY: A checksummed record can still be semantically invalid or linked to the wrong campaign.
 *
 * @param envelope - Envelope-shaped record.
 * @param issues - Envelope issue accumulator.
 */
function validatePayload(envelope: Record<string, unknown>, issues: CampaignSaveValidationIssue[]): void {
  const payload = envelope.payload;
  if (!isRecord(payload)) {
    issues.push({ path: "payload", message: "Campaign save payload must be an object." });
    return;
  }
  requireEnvelopeField(issues, payload.activeBattle === null || isRecord(payload.activeBattle), "payload.activeBattle",
    "Active tactical battle must be a complete battle object or null.");
  requireEnvelopeField(issues, isNullableString(payload.commanderRosterLink), "payload.commanderRosterLink",
    "Commander roster link must be a string or null.");

  const resume = payload.uiResumeContext;
  if (!isRecord(resume)) {
    issues.push({ path: "payload.uiResumeContext", message: "UI resume context must be an object." });
  } else {
    requireEnvelopeField(issues, typeof resume.workspace === "string" && CAMPAIGN_SAVE_WORKSPACES.has(resume.workspace),
      "payload.uiResumeContext.workspace", "UI resume workspace is unsupported.");
    requireEnvelopeField(issues, isNullableString(resume.selectedEntityId),
      "payload.uiResumeContext.selectedEntityId", "Selected entity ID must be a string or null.");
    const center = resume.mapCenter;
    requireEnvelopeField(issues, center === null || (isRecord(center)
      && typeof center.x === "number" && Number.isFinite(center.x)
      && typeof center.y === "number" && Number.isFinite(center.y)),
    "payload.uiResumeContext.mapCenter", "Map center must contain finite x/y values or be null.");
    requireEnvelopeField(issues, resume.mapZoom === null || (typeof resume.mapZoom === "number"
      && Number.isFinite(resume.mapZoom) && resume.mapZoom > 0),
    "payload.uiResumeContext.mapZoom", "Map zoom must be a positive finite number or null.");
  }

  if (!hasRuntimeValidationShape(payload.runtime)) {
    issues.push({ path: "payload.runtime", message: "Campaign runtime is missing required top-level state collections." });
    return;
  }
  try {
    validateCampaignRuntimeState(payload.runtime).forEach((issue) => {
      issues.push({ path: `payload.runtime.${issue.path}`, message: issue.message });
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    issues.push({ path: "payload.runtime", message: `Campaign runtime validation failed safely: ${detail}` });
    return;
  }

  requireEnvelopeField(issues, envelope.campaignId === payload.runtime.campaignId,
    "campaignId", "Envelope campaign ID must match runtime campaign identity.");
  requireEnvelopeField(issues, envelope.scenarioKey === payload.runtime.scenarioKey,
    "scenarioKey", "Envelope scenario key must match runtime scenario identity.");
  requireEnvelopeField(issues, envelope.engagementId === payload.runtime.activeEngagementId,
    "engagementId", "Envelope engagement ID must match the active runtime engagement.");
  if (payload.activeBattle !== null) {
    if (!payload.runtime.activeEngagementId) {
      issues.push({ path: "payload.activeBattle", message: "Active tactical battle requires an active campaign engagement." });
    } else {
      try {
        assertCompleteActiveCampaignBattleSave(payload.activeBattle, {
          campaignId: payload.runtime.campaignId,
          campaignRevision: payload.runtime.revision,
          scenarioKey: payload.runtime.scenarioKey,
          engagementId: payload.runtime.activeEngagementId
        });
      } catch (error) {
        issues.push({
          path: "payload.activeBattle",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }
  if (isRecord(envelope.display)) {
    requireEnvelopeField(issues, envelope.display.segment === payload.runtime.currentSegment,
      "display.segment", "Display segment must match runtime time.");
  }
}

/**
 * WHAT: Validates an unknown save envelope, checksum, runtime, and optional authored-content expectation.
 * WHY: IndexedDB, imports, migrations, and future cloud sources are all untrusted boundaries.
 *
 * @param value - Unknown stored or imported value.
 * @param expectedContent - Optional scenario key/hash required by the caller.
 * @returns Non-throwing validation result with every detected issue.
 */
export function validateCampaignSaveEnvelope(
  value: unknown,
  expectedContent?: CampaignSaveExpectedContent
): CampaignSaveValidationResult {
  if (!isRecord(value)) {
    const error = new CampaignSaveError("INVALID_ENVELOPE", "Campaign save envelope must be an object.");
    return { ok: false, error, issues: [{ path: "$", message: error.message }] };
  }

  if (typeof value.envelopeVersion === "number" && value.envelopeVersion > FOUR_STAR_SAVE_ENVELOPE_VERSION) {
    const error = new CampaignSaveError(
      "UNSUPPORTED_ENVELOPE_VERSION",
      `Campaign save envelope version ${value.envelopeVersion} is newer than supported version ${FOUR_STAR_SAVE_ENVELOPE_VERSION}.`,
      { receivedVersion: value.envelopeVersion, supportedVersion: FOUR_STAR_SAVE_ENVELOPE_VERSION }
    );
    return { ok: false, error, issues: [{ path: "envelopeVersion", message: error.message }] };
  }

  const issues: CampaignSaveValidationIssue[] = [];
  requireEnvelopeField(issues, value.envelopeVersion === FOUR_STAR_SAVE_ENVELOPE_VERSION,
    "envelopeVersion", `Envelope version must be ${FOUR_STAR_SAVE_ENVELOPE_VERSION}.`);
  requireEnvelopeField(issues, typeof value.saveId === "string" && value.saveId.trim().length > 0,
    "saveId", "Save ID must be non-empty.");
  requireEnvelopeField(issues, typeof value.slotType === "string" && CAMPAIGN_SAVE_SLOT_TYPES.has(value.slotType),
    "slotType", "Save slot type is unsupported.");
  requireEnvelopeField(issues, value.gameMode === "campaign", "gameMode",
    "Envelope version 1 campaign persistence requires campaign game mode.");
  requireEnvelopeField(issues, isCanonicalIsoTimestamp(value.createdAt), "createdAt",
    "Created timestamp must be canonical UTC ISO format.");
  requireEnvelopeField(issues, isCanonicalIsoTimestamp(value.updatedAt), "updatedAt",
    "Updated timestamp must be canonical UTC ISO format.");
  if (isCanonicalIsoTimestamp(value.createdAt) && isCanonicalIsoTimestamp(value.updatedAt)) {
    requireEnvelopeField(issues, Date.parse(value.updatedAt) >= Date.parse(value.createdAt), "updatedAt",
      "Updated timestamp cannot precede created timestamp.");
  }
  for (const field of ["buildVersion", "contentVersion", "scenarioKey", "campaignId"] as const) {
    requireEnvelopeField(issues, typeof value[field] === "string" && value[field].trim().length > 0,
      field, `${field} must be a non-empty string.`);
  }
  requireEnvelopeField(issues, isNullableString(value.engagementId), "engagementId",
    "Engagement ID must be a string or null.");
  validateDisplayMetadata(value.display, issues);
  validatePayload(value, issues);

  if (issues.length > 0) {
    const error = new CampaignSaveError(
      "INVALID_ENVELOPE",
      `Campaign save envelope failed ${issues.length} validation check(s).`,
      { issueCount: issues.length, firstPath: issues[0].path }
    );
    return { ok: false, error, issues };
  }

  let expectedChecksum: string;
  try {
    expectedChecksum = computeCampaignSaveChecksum(value);
  } catch (error) {
    const saveError = error instanceof CampaignSaveError
      ? error
      : new CampaignSaveError("INVALID_ENVELOPE", String(error));
    return { ok: false, error: saveError, issues: [{ path: "checksum", message: saveError.message }] };
  }
  if (value.checksum !== expectedChecksum) {
    const error = new CampaignSaveError(
      "CHECKSUM_MISMATCH",
      "Campaign save checksum does not match its stored content.",
      { saveId: String(value.saveId), expectedChecksum, receivedChecksum: String(value.checksum) }
    );
    return { ok: false, error, issues: [{ path: "checksum", message: error.message }] };
  }

  const envelope = structuredClone(value) as unknown as FourStarCampaignSaveEnvelope;
  if (expectedContent && (envelope.scenarioKey !== expectedContent.scenarioKey
    || envelope.payload.runtime.scenarioContentHash !== expectedContent.scenarioContentHash)) {
    const error = new CampaignSaveError(
      "CONTENT_MISMATCH",
      "Campaign save does not match the expected authored scenario content.",
      {
        expectedScenarioKey: expectedContent.scenarioKey,
        receivedScenarioKey: envelope.scenarioKey,
        expectedContentHash: expectedContent.scenarioContentHash,
        receivedContentHash: envelope.payload.runtime.scenarioContentHash
      }
    );
    return { ok: false, error, issues: [{ path: "payload.runtime.scenarioContentHash", message: error.message }] };
  }
  return { ok: true, envelope };
}

/**
 * WHAT: Creates and certifies a complete immutable campaign save envelope.
 * WHY: Callers should not hand-author versions/checksums or persist an invalid runtime.
 *
 * @param input - Explicit identity, metadata, timestamps, versions, and campaign payload.
 * @returns Defensive checksummed envelope.
 * @throws CampaignSaveError when the input fails envelope/runtime validation.
 */
export function createCampaignSaveEnvelope(input: CampaignSaveEnvelopeInput): FourStarCampaignSaveEnvelope {
  const unsigned = {
    envelopeVersion: FOUR_STAR_SAVE_ENVELOPE_VERSION,
    ...structuredClone(input)
  };
  const candidate = {
    ...unsigned,
    checksum: computeCampaignSaveChecksum(unsigned)
  };
  const validation = validateCampaignSaveEnvelope(candidate);
  if (!validation.ok) throw validation.error;
  return validation.envelope;
}

/**
 * WHAT: Returns safe display metadata from an unknown record when available.
 * WHY: Quarantine listings should retain useful identification without trusting the full corrupt envelope.
 *
 * @param value - Unknown stored save record.
 * @returns Defensive display metadata or null when its shape is invalid.
 */
export function extractCampaignSaveDisplayMetadata(value: unknown): CampaignSaveDisplayMetadata | null {
  if (!isRecord(value)) return null;
  const issues: CampaignSaveValidationIssue[] = [];
  validateDisplayMetadata(value.display, issues);
  return issues.length === 0
    ? structuredClone(value.display) as CampaignSaveDisplayMetadata
    : null;
}
