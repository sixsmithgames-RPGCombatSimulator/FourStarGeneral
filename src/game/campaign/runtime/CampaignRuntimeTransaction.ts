/**
 * MODULE: CampaignRuntimeTransaction
 * WHAT: Applies Campaign 2.0 mutations to a defensive candidate, commits one revision with ordered events, or returns the unchanged safe state.
 * WHY: Segment systems must share one atomic boundary so partial consequences, random consumption, or failed validation never become authoritative.
 *
 * DEPENDENCIES: CampaignRandom checkpoints deterministic streams; CampaignCanonical creates stable IDs and guards immutable event history; invariant validation certifies candidates.
 * EXPORTS: CampaignRuntimeMutator and runCampaignRuntimeTransaction.
 */

import { computeCampaignContentHash, createStableCampaignRecordId } from "./CampaignCanonical";
import { CampaignRandom } from "./CampaignRandom";
import { validateCampaignRuntimeState } from "./CampaignInvariantValidator";
import {
  CampaignRuntimeError,
  type CampaignDomainEvent,
  type CampaignDomainEventDraft,
  type CampaignInvariantIssue,
  type CampaignResolutionMetadata,
  type CampaignResolutionReport,
  type CampaignRuntimeMutation,
  type CampaignRuntimeState,
  type CampaignTransactionRejected,
  type CampaignTransactionResult
} from "./campaignRuntimeTypes";

/** Domain mutator that edits only a defensive candidate and returns material event drafts. */
export type CampaignRuntimeMutator = (
  draft: CampaignRuntimeState,
  random: CampaignRandom
) => readonly CampaignDomainEventDraft[] | CampaignRuntimeMutation;

/** Converts the backward-compatible array mutator result into events plus explicit report metadata. */
function normalizeMutationResult(
  result: readonly CampaignDomainEventDraft[] | CampaignRuntimeMutation,
  sourceSegment: number,
  candidateSegment: number
): { events: readonly CampaignDomainEventDraft[]; resolution: CampaignResolutionMetadata } {
  if (Array.isArray(result)) {
    return {
      events: result,
      resolution: {
        resolutionKind: "transaction",
        fromSegment: sourceSegment,
        toSegment: candidateSegment,
        frozenFactionViews: [],
        phaseReports: []
      }
    };
  }
  const mutation = result as CampaignRuntimeMutation;
  return {
    events: mutation.events,
    resolution: mutation.resolution ?? {
      resolutionKind: "transaction",
      fromSegment: sourceSegment,
      toSegment: candidateSegment,
      frozenFactionViews: [],
      phaseReports: []
    }
  };
}

/**
 * WHAT: Creates a rejected transaction retaining a defensive copy of the last safe state.
 * WHY: Callers need a consistent recovery result for source-invalid, mutator, and candidate-invalid failures.
 *
 * @param source - Last authoritative runtime.
 * @param error - Structured transaction failure.
 * @param issues - Invariant diagnostics, when available.
 * @returns Rejected result whose state has no shared references with mutation candidates.
 */
function rejectTransaction(
  source: CampaignRuntimeState,
  error: CampaignRuntimeError,
  issues: readonly CampaignInvariantIssue[]
): CampaignTransactionRejected {
  return {
    ok: false,
    state: structuredClone(source),
    error,
    issues: structuredClone(issues)
  };
}

/**
 * WHAT: Assigns stable transaction metadata to one event draft.
 * WHY: Domain systems describe facts while the transaction boundary exclusively owns revision, sequence, segment, and event identity.
 *
 * @param draft - Material domain fact emitted by the mutator or transaction boundary.
 * @param campaignId - Stable campaign identity.
 * @param revision - Newly committed revision.
 * @param sequence - Event order inside the revision.
 * @param segment - Campaign segment at commit.
 * @returns Immutable event ready for append-only history.
 */
function finalizeEvent(
  draft: CampaignDomainEventDraft,
  campaignId: string,
  revision: number,
  sequence: number,
  segment: number
): CampaignDomainEvent {
  return {
    ...structuredClone(draft),
    id: createStableCampaignRecordId("event", campaignId, revision, sequence, draft.type, draft.category),
    campaignId,
    revision,
    sequence,
    segment
  };
}

/**
 * WHAT: Verifies fields that a transaction mutator is never allowed to replace.
 * WHY: Readonly TypeScript markers do not protect JavaScript callers or unsafe casts at runtime.
 *
 * @param source - Authoritative pre-transaction runtime.
 * @param candidate - Mutated defensive candidate.
 * @returns Structured issues for immutable identity/history violations.
 */
function validateTransactionOwnership(
  source: CampaignRuntimeState,
  candidate: CampaignRuntimeState
): CampaignInvariantIssue[] {
  const issues: CampaignInvariantIssue[] = [];
  if (candidate.runtimeVersion !== source.runtimeVersion) {
    issues.push({
      code: "RUNTIME_VERSION_INVALID",
      path: "runtimeVersion",
      message: "A campaign transaction cannot change the runtime schema version."
    });
  }
  if (candidate.campaignId !== source.campaignId) {
    issues.push({
      code: "CAMPAIGN_ID_INVALID",
      path: "campaignId",
      message: "A campaign transaction cannot change campaign identity."
    });
  }
  if (candidate.scenarioKey !== source.scenarioKey) {
    issues.push({
      code: "SCENARIO_KEY_INVALID",
      path: "scenarioKey",
      message: "A campaign transaction cannot change the authored scenario key."
    });
  }
  if (candidate.scenarioContentHash !== source.scenarioContentHash) {
    issues.push({
      code: "CONTENT_HASH_INVALID",
      path: "scenarioContentHash",
      message: "A campaign transaction cannot change the authored content hash."
    });
  }
  if (computeCampaignContentHash(candidate.eventLog) !== computeCampaignContentHash(source.eventLog)) {
    issues.push({
      code: "EVENT_LOG_INVALID",
      path: "eventLog",
      message: "Domain mutators cannot rewrite append-only campaign event history."
    });
  }
  return issues;
}

/**
 * WHAT: Atomically applies one Campaign 2.0 mutation and commits exactly one validated revision.
 * WHY: Later segment resolvers need rollback-safe composition, deterministic random checkpoints, ordered events, and idempotent revision reports.
 *
 * @param source - Last authoritative valid runtime.
 * @param label - Stable diagnostic label for this transaction.
 * @param mutator - Domain mutation applied only to a defensive candidate.
 * @returns Committed validated state/report, or rejected result retaining the safe source state.
 */
export function runCampaignRuntimeTransaction(
  source: CampaignRuntimeState,
  label: string,
  mutator: CampaignRuntimeMutator
): CampaignTransactionResult {
  const sourceIssues = validateCampaignRuntimeState(source);
  if (sourceIssues.length > 0) {
    return rejectTransaction(
      source,
      new CampaignRuntimeError(
        "INVALID_RUNTIME",
        `Campaign transaction ${label} cannot start because the source runtime is invalid.`,
        { label, issueCount: sourceIssues.length, firstCode: sourceIssues[0].code }
      ),
      sourceIssues
    );
  }
  if (label.trim().length === 0) {
    return rejectTransaction(
      source,
      new CampaignRuntimeError(
        "TRANSACTION_FAILED",
        "Campaign transaction label cannot be empty.",
        { label }
      ),
      []
    );
  }

  try {
    const candidate = structuredClone(source);
    const random = CampaignRandom.fromSerialized(candidate.rng);
    const mutation = normalizeMutationResult(mutator(candidate, random), source.currentSegment, candidate.currentSegment);
    const eventDrafts = mutation.events.map((event) => structuredClone(event));
    const resolution = structuredClone(mutation.resolution);
    candidate.rng = random.serialize();

    const ownershipIssues = validateTransactionOwnership(source, candidate);
    if (ownershipIssues.length > 0) {
      return rejectTransaction(
        source,
        new CampaignRuntimeError(
          "TRANSACTION_FAILED",
          `Campaign transaction ${label} attempted to mutate runtime identity or append-only history.`,
          { label, issueCount: ownershipIssues.length, firstCode: ownershipIssues[0].code }
        ),
        ownershipIssues
      );
    }

    const nextRevision = source.revision + 1;
    const transactionId = createStableCampaignRecordId("transaction", source.campaignId, nextRevision, label);
    const commitDraft: CampaignDomainEventDraft = {
      type: "transactionCommitted",
      category: "system",
      summary: `Campaign transaction committed: ${label}.`,
      details: { transactionId, label, eventCount: eventDrafts.length, resolutionKind: resolution.resolutionKind }
    };
    const events = [...eventDrafts, commitDraft].map((event, sequence) => (
      finalizeEvent(event, source.campaignId, nextRevision, sequence, candidate.currentSegment)
    ));
    const report: CampaignResolutionReport = {
      transactionId,
      label,
      fromRevision: source.revision,
      toRevision: nextRevision,
      segment: candidate.currentSegment,
      eventIds: events.map((event) => event.id),
      ...resolution
    };

    candidate.revision = nextRevision;
    candidate.eventLog = [...source.eventLog.map((event) => structuredClone(event)), ...events];
    candidate.lastResolution = report;

    const candidateIssues = validateCampaignRuntimeState(candidate);
    if (candidateIssues.length > 0) {
      return rejectTransaction(
        source,
        new CampaignRuntimeError(
          "INVALID_RUNTIME",
          `Campaign transaction ${label} produced an invalid candidate and was rolled back.`,
          { label, issueCount: candidateIssues.length, firstCode: candidateIssues[0].code }
        ),
        candidateIssues
      );
    }

    return { ok: true, state: candidate, report };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return rejectTransaction(
      source,
      new CampaignRuntimeError(
        "TRANSACTION_FAILED",
        `Campaign transaction ${label} failed before commit: ${detail}`,
        { label, detail }
      ),
      []
    );
  }
}
