/**
 * MODULE: CampaignSaveMigration
 * WHAT: Purely parses and migrates shipped localStorage campaign snapshots (saveVersion 1/2) into checksummed Campaign 2.0 envelopes.
 * WHY: Existing progress must survive the runtime split without mutating the legacy source or deriving authored content from mutable save truth.
 *
 * DEPENDENCIES: Existing campaign intelligence seeds missing v1 knowledge; scenario adapter materializes runtime overrides; save envelope certifies output.
 * EXPORTS: Legacy snapshot/context/result contracts and migrateLegacyCampaignSave.
 */

import type {
  CampaignDecision,
  CampaignPendingEngagement,
  CampaignScenarioData,
  CampaignTurnState
} from "../../../core/campaignTypes";
import type { CampaignKnowledgeState } from "../../../core/campaignIntelTypes";
import { createCampaignKnowledgeState } from "../../../state/CampaignIntelligence";
import {
  computeCampaignContentHash,
  createStableCampaignRecordId
} from "../runtime/CampaignCanonical";
import {
  createCampaignRuntime,
  splitLegacyCampaignScenario
} from "../runtime/CampaignScenarioAdapter";
import type { CampaignScenarioDefinition } from "../runtime/campaignRuntimeTypes";
import { createCampaignSaveEnvelope } from "./CampaignSaveEnvelope";
import {
  CampaignSaveError,
  type CampaignSaveDisplayMetadata,
  type CampaignUiResumeContext,
  type FourStarCampaignSaveEnvelope,
  type FourStarSaveSlotType
} from "./CampaignSaveTypes";

/** Exact supported shipped localStorage snapshot versions. */
export type SupportedLegacyCampaignSaveVersion = 1 | 2;

/** Typed legacy snapshot after safe JSON/shape parsing. */
export interface LegacyCampaignSaveSnapshot {
  readonly saveVersion: SupportedLegacyCampaignSaveVersion;
  readonly scenario: CampaignScenarioData;
  readonly turnState: CampaignTurnState | null;
  readonly decisions: readonly CampaignDecision[];
  readonly engagements: readonly CampaignPendingEngagement[];
  readonly activeEngagementId: string | null;
  readonly currentSegment?: number;
  readonly currentDay?: number;
  readonly intelligenceByFaction?: Readonly<Record<string, CampaignKnowledgeState>>;
}

/** Explicit, side-effect-free context required to resolve content and create a new envelope. */
export interface LegacyCampaignSaveMigrationContext {
  readonly resolveScenario: (scenarioKey: string) => CampaignScenarioData | null;
  readonly buildVersion: string;
  readonly contentVersion: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly slotType: FourStarSaveSlotType;
  readonly playTimeSeconds: number;
  readonly difficulty: string | null;
  readonly commanderRosterLink: string | null;
  readonly uiResumeContext: CampaignUiResumeContext;
}

/** Certified migration output plus content/source identity used by import orchestration and tests. */
export interface LegacyCampaignSaveMigrationResult {
  readonly sourceVersion: SupportedLegacyCampaignSaveVersion;
  readonly sourceHash: string;
  readonly definition: CampaignScenarioDefinition;
  readonly envelope: FourStarCampaignSaveEnvelope;
}

/**
 * WHAT: Identifies plain object-like JSON records.
 * WHY: Parsed legacy JSON remains untrusted until each required field is checked.
 *
 * @param value - Unknown parsed JSON value.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * WHAT: Converts a legacy JSON string into a supported, minimally safe snapshot.
 * WHY: Migration must reject malformed/future saves without executing adapter or intelligence code against unsafe shapes.
 *
 * @param raw - Original localStorage string.
 * @returns Supported legacy snapshot with defensive typed references.
 * @throws CampaignSaveError for invalid JSON, malformed records, or future versions.
 */
function parseLegacyCampaignSave(raw: string): LegacyCampaignSaveSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CampaignSaveError("MIGRATION_FAILED", `Legacy campaign save is not valid JSON: ${detail}`, { detail });
  }
  if (!isRecord(parsed)) {
    throw new CampaignSaveError("MIGRATION_FAILED", "Legacy campaign save root must be an object.");
  }
  if (typeof parsed.saveVersion === "number" && parsed.saveVersion > 2) {
    throw new CampaignSaveError(
      "UNSUPPORTED_LEGACY_VERSION",
      `Legacy campaign save version ${parsed.saveVersion} is newer than supported version 2 and remains read-only.`,
      { receivedVersion: parsed.saveVersion, supportedVersion: 2 }
    );
  }
  if (parsed.saveVersion !== 1 && parsed.saveVersion !== 2) {
    throw new CampaignSaveError(
      "MIGRATION_FAILED",
      "Legacy campaign save must declare saveVersion 1 or 2.",
      { receivedVersion: typeof parsed.saveVersion === "number" ? parsed.saveVersion : null }
    );
  }
  if (!isRecord(parsed.scenario)
    || typeof parsed.scenario.key !== "string"
    || !Array.isArray(parsed.scenario.tiles)
    || !Array.isArray(parsed.scenario.fronts)
    || !Array.isArray(parsed.scenario.economies)) {
    throw new CampaignSaveError(
      "MIGRATION_FAILED",
      "Legacy campaign save is missing its scenario identity or mutable tiles/fronts/economies."
    );
  }
  if (parsed.turnState !== undefined && parsed.turnState !== null && !isRecord(parsed.turnState)) {
    throw new CampaignSaveError("MIGRATION_FAILED", "Legacy campaign turnState must be an object or null.");
  }
  if (parsed.decisions !== undefined && !Array.isArray(parsed.decisions)) {
    throw new CampaignSaveError("MIGRATION_FAILED", "Legacy campaign decisions must be an array when present.");
  }
  if (parsed.engagements !== undefined && !Array.isArray(parsed.engagements)) {
    throw new CampaignSaveError("MIGRATION_FAILED", "Legacy campaign engagements must be an array when present.");
  }
  if (parsed.activeEngagementId !== undefined
    && parsed.activeEngagementId !== null
    && typeof parsed.activeEngagementId !== "string") {
    throw new CampaignSaveError("MIGRATION_FAILED", "Legacy active engagement ID must be a string or null.");
  }
  if (parsed.currentSegment !== undefined && typeof parsed.currentSegment !== "number") {
    throw new CampaignSaveError("MIGRATION_FAILED", "Legacy currentSegment must be numeric when present.");
  }
  if (parsed.currentDay !== undefined && typeof parsed.currentDay !== "number") {
    throw new CampaignSaveError("MIGRATION_FAILED", "Legacy currentDay must be numeric when present.");
  }
  if (parsed.intelligenceByFaction !== undefined && !isRecord(parsed.intelligenceByFaction)) {
    throw new CampaignSaveError("MIGRATION_FAILED", "Legacy faction intelligence must be an object when present.");
  }

  return {
    saveVersion: parsed.saveVersion,
    scenario: structuredClone(parsed.scenario) as unknown as CampaignScenarioData,
    turnState: parsed.turnState === undefined ? null : structuredClone(parsed.turnState) as CampaignTurnState | null,
    decisions: parsed.decisions === undefined ? [] : structuredClone(parsed.decisions) as CampaignDecision[],
    engagements: parsed.engagements === undefined ? [] : structuredClone(parsed.engagements) as CampaignPendingEngagement[],
    activeEngagementId: parsed.activeEngagementId === undefined ? null : parsed.activeEngagementId,
    ...(parsed.currentSegment !== undefined ? { currentSegment: parsed.currentSegment } : {}),
    ...(parsed.currentDay !== undefined ? { currentDay: parsed.currentDay } : {}),
    ...(parsed.intelligenceByFaction !== undefined
      ? { intelligenceByFaction: structuredClone(parsed.intelligenceByFaction) as Record<string, CampaignKnowledgeState> }
      : {})
  };
}

/**
 * WHAT: Resolves canonical three-hour campaign time from v1/v2 legacy fields.
 * WHY: v1 day saves and v2 segment saves must converge without inventing a wall-clock value.
 *
 * @param snapshot - Supported legacy snapshot.
 * @returns Non-negative integer campaign segment.
 * @throws CampaignSaveError when required time is absent or malformed.
 */
function resolveLegacySegment(snapshot: LegacyCampaignSaveSnapshot): number {
  if (snapshot.currentSegment !== undefined) {
    if (!Number.isInteger(snapshot.currentSegment) || snapshot.currentSegment < 0) {
      throw new CampaignSaveError(
        "MIGRATION_FAILED",
        "Legacy currentSegment must be a non-negative integer.",
        { currentSegment: snapshot.currentSegment }
      );
    }
    return snapshot.currentSegment;
  }
  if (snapshot.currentDay !== undefined) {
    if (!Number.isInteger(snapshot.currentDay) || snapshot.currentDay < 1) {
      throw new CampaignSaveError(
        "MIGRATION_FAILED",
        "Legacy currentDay must be a positive integer.",
        { currentDay: snapshot.currentDay }
      );
    }
    return (snapshot.currentDay - 1) * 8;
  }
  return 0;
}

/**
 * WHAT: Derives an unsigned deterministic migration seed from canonical legacy content.
 * WHY: Legacy saves contain no RNG checkpoint, so the first migrated future must be stable across repeated imports.
 *
 * @param sourceHash - Versioned FNV-1a source hash.
 * @returns Unsigned 32-bit campaign seed.
 */
function migrationSeedFromHash(sourceHash: string): number {
  return Number.parseInt(sourceHash.slice("fnv1a32-".length), 16) >>> 0;
}

/**
 * WHAT: Preserves supplied v2 knowledge or seeds missing v1/v2 faction knowledge through existing fog rules.
 * WHY: Migration must neither expose raw opponent truth nor discard scheduled intelligence operations.
 *
 * @param snapshot - Parsed legacy snapshot.
 * @param segment - Migrated current segment.
 * @returns Defensive Player/Bot knowledge records.
 * @throws CampaignSaveError when supplied ownership is inconsistent.
 */
function migrateLegacyKnowledge(
  snapshot: LegacyCampaignSaveSnapshot,
  segment: number
): Record<string, CampaignKnowledgeState> {
  if (snapshot.intelligenceByFaction) {
    const cloned = structuredClone(snapshot.intelligenceByFaction);
    for (const faction of ["Player", "Bot"] as const) {
      const knowledge = cloned[faction];
      if (!knowledge || knowledge.faction !== faction) {
        throw new CampaignSaveError(
          "MIGRATION_FAILED",
          `Legacy faction knowledge must contain an owned ${faction} record.`,
          { faction }
        );
      }
    }
    return cloned;
  }
  return {
    Player: createCampaignKnowledgeState(snapshot.scenario, "Player", segment),
    Bot: createCampaignKnowledgeState(snapshot.scenario, "Bot", segment)
  };
}

/**
 * WHAT: Creates consistent save-browser metadata from the migrated runtime and explicit context.
 * WHY: Migration should not fabricate play time/difficulty or depend on UI state outside its input.
 *
 * @param title - Resolved authored campaign title.
 * @param segment - Migrated campaign time.
 * @param status - Runtime planning/engagement state.
 * @param lastEventSummary - First migrated event summary.
 * @param context - Explicit migration metadata.
 * @returns Complete envelope display record.
 */
function buildMigrationDisplay(
  title: string,
  segment: number,
  status: "planning" | "engagement",
  lastEventSummary: string,
  context: LegacyCampaignSaveMigrationContext
): CampaignSaveDisplayMetadata {
  return {
    campaignTitle: title,
    segment,
    phaseLabel: status === "engagement" ? "Tactical engagement" : "Campaign planning",
    lastEventSummary,
    playTimeSeconds: context.playTimeSeconds,
    difficulty: context.difficulty,
    result: null,
    thumbnailKey: null
  };
}

/**
 * WHAT: Purely migrates a shipped v1/v2 localStorage string into a validated Campaign 2.0 envelope.
 * WHY: Existing progress needs deterministic runtime identity, current authored content, checksum integrity, and no source mutation.
 *
 * @param raw - Original localStorage value; never written or modified.
 * @param context - Explicit content resolver, versions, timestamps, metadata, and resume context.
 * @returns Validated definition/envelope plus source identity.
 * @throws CampaignSaveError when JSON, version, content, mutable references, runtime invariants, or envelope checks fail.
 */
export function migrateLegacyCampaignSave(
  raw: string,
  context: LegacyCampaignSaveMigrationContext
): LegacyCampaignSaveMigrationResult {
  const snapshot = parseLegacyCampaignSave(raw);
  const sourceHash = computeCampaignContentHash(snapshot);
  const resolvedScenario = context.resolveScenario(snapshot.scenario.key);
  if (!resolvedScenario || resolvedScenario.key !== snapshot.scenario.key) {
    throw new CampaignSaveError(
      "MIGRATION_FAILED",
      `Authored scenario ${snapshot.scenario.key} could not be resolved for legacy migration.`,
      { scenarioKey: snapshot.scenario.key }
    );
  }

  try {
    // Validate the embedded legacy scenario shape, but never use it as authored definition truth.
    splitLegacyCampaignScenario(snapshot.scenario);
    const definition = splitLegacyCampaignScenario(resolvedScenario);
    const segment = resolveLegacySegment(snapshot);
    const campaignId = createStableCampaignRecordId(
      "campaign",
      "legacy-migration",
      snapshot.scenario.key,
      sourceHash
    );
    const runtime = createCampaignRuntime(definition, {
      campaignId,
      seed: migrationSeedFromHash(sourceHash),
      currentSegment: segment,
      turnState: snapshot.turnState,
      queuedDecisions: structuredClone(snapshot.decisions) as CampaignDecision[],
      engagements: snapshot.engagements,
      activeEngagementId: snapshot.activeEngagementId,
      knowledgeByFaction: migrateLegacyKnowledge(snapshot, segment),
      runtimeSeedOverride: {
        tiles: snapshot.scenario.tiles,
        economies: snapshot.scenario.economies,
        fronts: snapshot.scenario.fronts
      }
    });
    const saveId = createStableCampaignRecordId(
      "save",
      campaignId,
      `legacy-v${snapshot.saveVersion}`,
      sourceHash,
      context.contentVersion
    );
    const lastEventSummary = runtime.eventLog[runtime.eventLog.length - 1]?.summary ?? "Campaign migrated.";
    const envelope = createCampaignSaveEnvelope({
      saveId,
      slotType: context.slotType,
      gameMode: "campaign",
      createdAt: context.createdAt,
      updatedAt: context.updatedAt,
      buildVersion: context.buildVersion,
      contentVersion: context.contentVersion,
      scenarioKey: runtime.scenarioKey,
      campaignId: runtime.campaignId,
      engagementId: runtime.activeEngagementId,
      display: buildMigrationDisplay(
        definition.title,
        runtime.currentSegment,
        runtime.activeEngagementId ? "engagement" : "planning",
        lastEventSummary,
        context
      ),
      payload: {
        runtime,
        activeBattle: null,
        commanderRosterLink: context.commanderRosterLink,
        uiResumeContext: structuredClone(context.uiResumeContext)
      }
    });
    return { sourceVersion: snapshot.saveVersion, sourceHash, definition, envelope };
  } catch (error) {
    if (error instanceof CampaignSaveError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new CampaignSaveError(
      "MIGRATION_FAILED",
      `Legacy campaign save could not be migrated safely: ${detail}`,
      { scenarioKey: snapshot.scenario.key, detail }
    );
  }
}
