/**
 * MODULE: CampaignAdvanceController
 * WHAT: Orchestrates bounded multi-segment campaign advance commands over the certified one-segment resolver.
 * WHY: Players need useful time controls without weakening per-segment transactions, rollback, determinism, or event-stop guarantees.
 *
 * DEPENDENCIES: CampaignSegmentResolver owns simulation; CampaignAdvanceRules persists the classification produced by each segment.
 * EXPORTS: requests/results, target calculation, and advanceCampaignRuntime.
 */

import { createStableCampaignRecordId } from "./CampaignCanonical";
import { resolveCampaignSegment, type CampaignSegmentResolutionResult } from "./CampaignSegmentResolver";
import {
  CampaignRuntimeError,
  type CampaignAdvanceAlert,
  type CampaignAdvanceMode,
  type CampaignAdvanceStepRecord,
  type CampaignAdvanceStopReason,
  type CampaignInvariantIssue,
  type CampaignRuntimeState,
  type CampaignScenarioDefinition,
  type CampaignSegmentPhase
} from "./campaignRuntimeTypes";

const NEXT_REPORT_DEFAULT_LIMIT = 64;
const NEXT_REPORT_MAX_LIMIT = 64;

/** User preference and bounded test controls for one advance gesture. */
export interface CampaignAdvanceRequest {
  readonly mode: CampaignAdvanceMode;
  readonly pauseAfterEveryResolution?: boolean;
  readonly stopOnCriticalAlerts?: boolean;
  readonly maxSegments?: number;
}

/** Test/diagnostic observer that cannot alter production command policy. */
export interface CampaignAdvanceDiagnostics {
  readonly afterPhase?: (segmentIndex: number, phase: CampaignSegmentPhase, candidate: CampaignRuntimeState) => void;
}

/** Aggregate command result reconstructed from the segment records persisted during this gesture. */
export interface CampaignAdvanceExecutionReport {
  readonly commandId: string;
  readonly mode: CampaignAdvanceMode;
  readonly fromSegment: number;
  readonly toSegment: number;
  readonly targetSegment: number | null;
  readonly elapsedSegments: number;
  readonly stoppedEarly: boolean;
  readonly stopReason: CampaignAdvanceStopReason;
  readonly stepRecordIds: readonly string[];
  readonly transactionIds: readonly string[];
  readonly alerts: readonly CampaignAdvanceAlert[];
}

export interface CampaignAdvanceCommitted {
  readonly ok: true;
  readonly state: CampaignRuntimeState;
  readonly report: CampaignAdvanceExecutionReport;
  readonly segmentResults: readonly Extract<CampaignSegmentResolutionResult, { ok: true }>[];
}

export interface CampaignAdvanceRejected {
  readonly ok: false;
  readonly state: CampaignRuntimeState;
  readonly report: CampaignAdvanceExecutionReport;
  readonly segmentResults: readonly Extract<CampaignSegmentResolutionResult, { ok: true }>[];
  readonly error: CampaignRuntimeError;
  readonly issues: readonly CampaignInvariantIssue[];
}

export type CampaignAdvanceResult = CampaignAdvanceCommitted | CampaignAdvanceRejected;

/** Calculates the exact named boundary for modes with a finite target. */
export function getCampaignAdvanceTargetSegment(currentSegment: number, mode: CampaignAdvanceMode): number | null {
  if (mode === "segment") return currentSegment + 1;
  if (mode === "day") return currentSegment + 8;
  if (mode === "nextReport") return null;
  const boundary = mode === "dawn" ? 2 : 6;
  const segmentOfDay = currentSegment % 8;
  const rawDelta = (boundary - segmentOfDay + 8) % 8;
  return currentSegment + (rawDelta === 0 ? 8 : rawDelta);
}

function normalizeMaximum(request: CampaignAdvanceRequest, targetSegment: number | null, currentSegment: number): number {
  if (targetSegment !== null) return targetSegment - currentSegment;
  const requested = request.maxSegments ?? NEXT_REPORT_DEFAULT_LIMIT;
  if (!Number.isInteger(requested) || requested < 1) return NEXT_REPORT_DEFAULT_LIMIT;
  return Math.min(requested, NEXT_REPORT_MAX_LIMIT);
}

function buildReport(
  commandId: string,
  mode: CampaignAdvanceMode,
  fromSegment: number,
  targetSegment: number | null,
  records: readonly CampaignAdvanceStepRecord[],
  stopReason: CampaignAdvanceStopReason
): CampaignAdvanceExecutionReport {
  const toSegment = records[records.length - 1]?.toSegment ?? fromSegment;
  return {
    commandId,
    mode,
    fromSegment,
    toSegment,
    targetSegment,
    elapsedSegments: toSegment - fromSegment,
    stoppedEarly: targetSegment !== null && toSegment < targetSegment,
    stopReason,
    stepRecordIds: records.map((record) => record.id),
    transactionIds: records.map((record) => record.transactionId),
    alerts: records.flatMap((record) => record.alerts.map((alert) => structuredClone(alert)))
  };
}

/** Runs a bounded sequence of ordinary segment transactions and stops exactly on the persisted policy result. */
export function advanceCampaignRuntime(
  source: CampaignRuntimeState,
  definition: CampaignScenarioDefinition,
  request: CampaignAdvanceRequest,
  diagnostics: CampaignAdvanceDiagnostics = {}
): CampaignAdvanceResult {
  const fromSegment = source.currentSegment;
  const targetSegment = getCampaignAdvanceTargetSegment(fromSegment, request.mode);
  const maximum = normalizeMaximum(request, targetSegment, fromSegment);
  const safetySegment = fromSegment + maximum;
  const commandId = createStableCampaignRecordId(
    "advance-command",
    source.campaignId,
    source.revision,
    fromSegment,
    request.mode
  );
  let state = structuredClone(source);
  const records: CampaignAdvanceStepRecord[] = [];
  const segmentResults: Extract<CampaignSegmentResolutionResult, { ok: true }>[] = [];

  for (let index = 0; index < maximum; index += 1) {
    const result = resolveCampaignSegment(state, definition, {
      afterPhase: (phase, candidate) => diagnostics.afterPhase?.(index, phase, candidate),
      advanceContext: {
        commandId,
        mode: request.mode,
        targetSegment,
        safetySegment,
        pauseAfterEveryResolution: request.pauseAfterEveryResolution ?? false,
        stopOnCriticalAlerts: request.stopOnCriticalAlerts ?? true
      }
    });
    if (!result.ok) {
      return {
        ok: false,
        state,
        report: buildReport(commandId, request.mode, fromSegment, targetSegment, records, "resolutionFailed"),
        segmentResults,
        error: result.error,
        issues: result.issues
      };
    }

    state = result.state;
    segmentResults.push(result);
    const recordId = state.advanceRecordOrder[state.advanceRecordOrder.length - 1];
    const record = recordId ? state.advanceRecords[recordId] : null;
    if (!record || record.commandId !== commandId) {
      return {
        ok: false,
        state,
        report: buildReport(commandId, request.mode, fromSegment, targetSegment, records, "resolutionFailed"),
        segmentResults,
        error: new CampaignRuntimeError(
          "INVALID_RUNTIME",
          "A committed campaign segment did not retain its advance checkpoint.",
          { commandId, segment: state.currentSegment }
        ),
        issues: []
      };
    }
    records.push(structuredClone(record));
    if (record.stopped && record.stopReason) {
      return {
        ok: true,
        state,
        report: buildReport(commandId, request.mode, fromSegment, targetSegment, records, record.stopReason),
        segmentResults
      };
    }
  }

  return {
    ok: true,
    state,
    report: buildReport(commandId, request.mode, fromSegment, targetSegment, records, "safetyLimit"),
    segmentResults
  };
}
