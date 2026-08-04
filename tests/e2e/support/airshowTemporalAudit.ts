import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  AIR_SHOW_BOMBER_MAX_HEADING_CHANGE_DEGREES_PER_SAMPLE,
  AIR_SHOW_FIGHTER_MAX_HEADING_CHANGE_DEGREES_PER_SAMPLE,
  AIR_SHOW_TEMPORAL_SAMPLE_INTERVAL_MS
} from "../../../src/ui/airshow/AirShowTimeline";

export interface AirshowTemporalActor {
  readonly actorId: string;
  readonly flightId: string;
  readonly role: string;
  readonly combatRole: string;
  readonly faction: string;
  readonly active: boolean;
  readonly opacity: number;
  readonly connected: boolean;
  readonly headingDegrees: number;
  readonly width: number;
  readonly height: number;
  readonly bombReleased: boolean;
  readonly destroyed: boolean;
  readonly cx: number;
  readonly cy: number;
}

export interface AirshowTemporalSample {
  readonly elapsedMs: number;
  readonly phaseLabel: string | null;
  readonly lastCue: string | null;
  readonly impactFired: boolean;
  readonly cueCounts: Readonly<Record<string, number>>;
  readonly effectCounts: Readonly<Record<string, number>>;
  readonly actors: ReadonlyArray<AirshowTemporalActor>;
}

export interface AirshowTemporalSpawn {
  readonly actorId: string;
  readonly role: string;
  readonly active: boolean;
  readonly cx: number;
  readonly cy: number;
}

export interface AirshowTemporalOriginPlan {
  readonly offsetPx: number;
  readonly axis: { readonly cx: number; readonly cy: number };
  readonly mapBounds: { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number };
  readonly playerBoundary: { readonly cx: number; readonly cy: number };
  readonly botBoundary: { readonly cx: number; readonly cy: number };
  readonly playerOrigin: { readonly cx: number; readonly cy: number };
  readonly botOrigin: { readonly cx: number; readonly cy: number };
}

export interface AirshowTemporalFinding {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly actorId?: string;
  readonly timeMs?: number;
}

export interface AirshowTemporalActorMetrics {
  readonly actorId: string;
  readonly flightId: string;
  readonly role: string;
  readonly faction: string;
  readonly firstActiveMs: number;
  readonly lastActiveMs: number;
  readonly activeSamples: number;
  readonly lifecycleGaps: number;
  readonly medianSpeedPxPerMs: number;
  readonly maximumSpeedPxPerMs: number;
  readonly maximumHeadingChangeDegrees: number;
}

export interface AirshowTemporalAudit {
  readonly version: 1;
  readonly scenarioId: string;
  readonly generatedAtIso: string;
  readonly passed: boolean;
  readonly sampleCount: number;
  readonly actorCount: number;
  readonly durationMs: number;
  readonly medianSampleIntervalMs: number;
  readonly maximumSampleGapMs: number;
  readonly mergeMinimumOpposingDistancePx: number | null;
  readonly scrambleCentroidDistancePx: number | null;
  readonly scrambleNearestOpposingDistancePx: number | null;
  readonly pairingSwitchFraction: number | null;
  readonly bomberMinimumSpacingPx: number | null;
  readonly flakCueCount: number;
  readonly flakObservedBatches: number;
  readonly maximumFlakBatchGapMs: number | null;
  readonly actorMetrics: ReadonlyArray<AirshowTemporalActorMetrics>;
  readonly findings: ReadonlyArray<AirshowTemporalFinding>;
}

export interface AirshowTemporalAuditOptions {
  readonly scenarioId: string;
  readonly originPlan?: AirshowTemporalOriginPlan | null;
  readonly spawn?: ReadonlyArray<AirshowTemporalSpawn>;
  readonly requireFullEngagement?: boolean;
  readonly requireFlak?: boolean;
  readonly requireImpactContinuity?: boolean;
  readonly targetSampleIntervalMs?: number;
}

export interface AirshowTemporalArtifactPaths {
  readonly json: string;
  readonly csv: string;
  readonly summary: string;
}

const FIGHTER_SPEED_PX_PER_MS = 0.115;
const BOMBER_SPEED_PX_PER_MS = 0.0575;

function distance(
  left: { readonly cx: number; readonly cy: number },
  right: { readonly cx: number; readonly cy: number }
): number {
  return Math.hypot(left.cx - right.cx, left.cy - right.cy);
}

function median(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1]! + sorted[midpoint]!) / 2
    : sorted[midpoint]!;
}

function centroid(actors: ReadonlyArray<AirshowTemporalActor>): { readonly cx: number; readonly cy: number } {
  return {
    cx: actors.reduce((sum, actor) => sum + actor.cx, 0) / actors.length,
    cy: actors.reduce((sum, actor) => sum + actor.cy, 0) / actors.length
  };
}

function angularDifferenceDegrees(left: number, right: number): number {
  return Math.abs((((right - left) % 360) + 540) % 360 - 180);
}

function activeFighterSides(sample: AirshowTemporalSample): {
  readonly playerSide: ReadonlyArray<AirshowTemporalActor>;
  readonly botSide: ReadonlyArray<AirshowTemporalActor>;
} {
  const fighters = sample.actors.filter((actor) =>
    actor.active && (actor.role === "interceptor" || actor.role === "escort")
  );
  return {
    playerSide: fighters.filter((actor) => actor.faction !== "Bot"),
    botSide: fighters.filter((actor) => actor.faction === "Bot")
  };
}

function nearestOpposingDistance(
  playerSide: ReadonlyArray<AirshowTemporalActor>,
  botSide: ReadonlyArray<AirshowTemporalActor>
): number {
  if (playerSide.length === 0 || botSide.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...playerSide.flatMap((playerActor) =>
    botSide.map((botActor) => distance(playerActor, botActor))
  ));
}

function nearestOpponentIds(sample: AirshowTemporalSample): Map<string, string> {
  const { playerSide, botSide } = activeFighterSides(sample);
  const result = new Map<string, string>();
  const assign = (
    actors: ReadonlyArray<AirshowTemporalActor>,
    opponents: ReadonlyArray<AirshowTemporalActor>
  ): void => {
    actors.forEach((actor) => {
      const nearest = [...opponents].sort((left, right) => distance(actor, left) - distance(actor, right))[0];
      if (nearest) result.set(actor.actorId, nearest.actorId);
    });
  };
  assign(playerSide, botSide);
  assign(botSide, playerSide);
  return result;
}

function formatTimestamp(elapsedMs: number): string {
  const totalMs = Math.max(0, Math.round(elapsedMs));
  const minutes = Math.floor(totalMs / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const milliseconds = totalMs % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function round(value: number, digits = 3): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function csvEscape(value: string | number | boolean | null): string {
  const text = value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function auditAirshowTemporalTrace(
  inputSamples: ReadonlyArray<AirshowTemporalSample>,
  options: AirshowTemporalAuditOptions
): AirshowTemporalAudit {
  const findings: AirshowTemporalFinding[] = [];
  const samples = inputSamples
    .filter((sample) => Number.isFinite(sample.elapsedMs) && sample.actors.length > 0)
    .sort((left, right) => left.elapsedMs - right.elapsedMs);
  const targetSampleIntervalMs = options.targetSampleIntervalMs ?? 100;
  const intervals = samples.slice(1).map((sample, index) => sample.elapsedMs - samples[index]!.elapsedMs);
  const positiveIntervals = intervals.filter((interval) => interval > 0);
  const medianSampleIntervalMs = median(positiveIntervals);
  const maximumSampleGapMs = Math.max(0, ...positiveIntervals);

  if (samples.length < 10) {
    findings.push({ severity: "error", code: "insufficient-samples", message: `Only ${samples.length} painted-position samples were captured.` });
  }
  if (medianSampleIntervalMs > targetSampleIntervalMs * 1.6 || maximumSampleGapMs > targetSampleIntervalMs * 3) {
    findings.push({
      severity: "error",
      code: "sample-cadence",
      message: `Trace cadence is too sparse: median ${medianSampleIntervalMs.toFixed(1)}ms, maximum gap ${maximumSampleGapMs.toFixed(1)}ms.`
    });
  }

  const actorIds = Array.from(new Set(samples.flatMap((sample) => sample.actors.map((actor) => actor.actorId))));
  const actorMetrics: AirshowTemporalActorMetrics[] = [];
  actorIds.forEach((actorId) => {
    const entries = samples.flatMap((sample) => {
      const actor = sample.actors.find((candidate) => candidate.actorId === actorId);
      return actor ? [{ elapsedMs: sample.elapsedMs, actor }] : [];
    });
    const firstActiveIndex = entries.findIndex((entry) => entry.actor.active);
    let lastActiveIndex = -1;
    entries.forEach((entry, index) => {
      if (entry.actor.active) lastActiveIndex = index;
    });
    if (firstActiveIndex < 0 || lastActiveIndex <= firstActiveIndex) {
      findings.push({ severity: "error", code: "actor-never-active", actorId, message: `${actorId} has no measurable active lifecycle.` });
      return;
    }

    const activeWindow = entries.slice(firstActiveIndex, lastActiveIndex + 1);
    const lifecycleGaps = activeWindow.filter((entry) => !entry.actor.active).length;
    if (lifecycleGaps > 0) {
      const firstGap = activeWindow.find((entry) => !entry.actor.active);
      findings.push({
        severity: "error",
        code: "actor-lifecycle-gap",
        actorId,
        timeMs: firstGap?.elapsedMs,
        message: `${actorId} disappears for ${lifecycleGaps} samples inside its visible lifecycle.`
      });
    }
    const paintFailure = activeWindow.find((entry) =>
      entry.actor.active
      && !entry.actor.destroyed
      && (!entry.actor.connected || entry.actor.opacity <= 0.05)
    );
    if (paintFailure) {
      findings.push({
        severity: "error",
        code: "actor-not-painted",
        actorId,
        timeMs: paintFailure.elapsedMs,
        message: `${actorId} is active but not visibly painted at ${formatTimestamp(paintFailure.elapsedMs)}.`
      });
    }

    const speeds: number[] = [];
    const headingChanges: number[] = [];
    for (let index = 1; index < activeWindow.length; index += 1) {
      const previous = activeWindow[index - 1]!;
      const current = activeWindow[index]!;
      const elapsedMs = current.elapsedMs - previous.elapsedMs;
      if (elapsedMs <= 0 || !previous.actor.active || !current.actor.active) continue;
      const observedSpeed = distance(previous.actor, current.actor) / elapsedMs;
      speeds.push(observedSpeed);
      const headingChangeDegrees = angularDifferenceDegrees(previous.actor.headingDegrees, current.actor.headingDegrees);
      headingChanges.push(headingChangeDegrees * AIR_SHOW_TEMPORAL_SAMPLE_INTERVAL_MS / elapsedMs);
      const expectedSpeed = current.actor.role === "bomber" ? BOMBER_SPEED_PX_PER_MS : FIGHTER_SPEED_PX_PER_MS;
      if (observedSpeed > expectedSpeed * 1.35 + 0.01) {
        findings.push({
          severity: "error",
          code: "actor-speed-spike",
          actorId,
          timeMs: current.elapsedMs,
          message: `${actorId} reaches ${observedSpeed.toFixed(4)}px/ms at ${formatTimestamp(current.elapsedMs)}; expected at most ${(expectedSpeed * 1.35 + 0.01).toFixed(4)}px/ms.`
        });
        break;
      }
    }
    const role = entries[firstActiveIndex]!.actor.role;
    const expectedSpeed = role === "bomber" ? BOMBER_SPEED_PX_PER_MS : FIGHTER_SPEED_PX_PER_MS;
    const medianSpeedPxPerMs = median(speeds);
    const maximumSpeedPxPerMs = Math.max(0, ...speeds);
    const maximumHeadingChangeDegrees = Math.max(0, ...headingChanges);
    if (speeds.length < 8) {
      findings.push({ severity: "error", code: "insufficient-actor-motion", actorId, message: `${actorId} has only ${speeds.length} usable movement samples.` });
    } else if (medianSpeedPxPerMs < expectedSpeed * 0.75 || medianSpeedPxPerMs > expectedSpeed * 1.12) {
      findings.push({
        severity: "error",
        code: "actor-speed-median",
        actorId,
        message: `${actorId} median speed is ${medianSpeedPxPerMs.toFixed(4)}px/ms; expected ${expectedSpeed.toFixed(4)}px/ms.`
      });
    }
    const headingLimit = role === "bomber"
      ? AIR_SHOW_BOMBER_MAX_HEADING_CHANGE_DEGREES_PER_SAMPLE
      : AIR_SHOW_FIGHTER_MAX_HEADING_CHANGE_DEGREES_PER_SAMPLE;
    if (maximumHeadingChangeDegrees > headingLimit) {
      const sharpEntry = activeWindow.slice(1).find((entry, index) => {
        const previous = activeWindow[index]!;
        const elapsedMs = entry.elapsedMs - previous.elapsedMs;
        return elapsedMs > 0
          && angularDifferenceDegrees(previous.actor.headingDegrees, entry.actor.headingDegrees)
            * AIR_SHOW_TEMPORAL_SAMPLE_INTERVAL_MS / elapsedMs > headingLimit;
      });
      findings.push({
        severity: "error",
        code: "actor-sharp-turn",
        actorId,
        timeMs: sharpEntry?.elapsedMs,
        message: `${actorId} reaches ${maximumHeadingChangeDegrees.toFixed(1)} degrees of heading change per ${AIR_SHOW_TEMPORAL_SAMPLE_INTERVAL_MS}ms; limit is ${headingLimit} degrees.`
      });
    }
    const identity = entries[firstActiveIndex]!.actor;
    actorMetrics.push({
      actorId,
      flightId: identity.flightId,
      role,
      faction: identity.faction,
      firstActiveMs: activeWindow[0]!.elapsedMs,
      lastActiveMs: activeWindow[activeWindow.length - 1]!.elapsedMs,
      activeSamples: activeWindow.filter((entry) => entry.actor.active).length,
      lifecycleGaps,
      medianSpeedPxPerMs,
      maximumSpeedPxPerMs,
      maximumHeadingChangeDegrees
    });
  });

  if (options.originPlan) {
    if (Math.abs(options.originPlan.offsetPx - 500) > 0.001) {
      findings.push({ severity: "error", code: "origin-offset", message: `Origin offset is ${options.originPlan.offsetPx}px instead of 500px.` });
    }
    if (Math.abs(distance(options.originPlan.playerOrigin, options.originPlan.playerBoundary) - 500) > 0.01
      || Math.abs(distance(options.originPlan.botOrigin, options.originPlan.botBoundary) - 500) > 0.01) {
      findings.push({ severity: "error", code: "origin-distance", message: "One or both faction origins are not exactly 500px beyond the rendered tile boundary." });
    }
    (options.spawn ?? []).forEach((actor) => {
      const bounds = options.originPlan!.mapBounds;
      const insideMap = actor.cx >= bounds.minX && actor.cx <= bounds.maxX && actor.cy >= bounds.minY && actor.cy <= bounds.maxY;
      if (insideMap) {
        findings.push({ severity: "error", code: "spawn-inside-map", actorId: actor.actorId, message: `${actor.actorId} spawns inside the rendered tile envelope.` });
      }
    });
  }

  let mergeMinimumOpposingDistancePx: number | null = null;
  let scrambleCentroidDistancePx: number | null = null;
  let scrambleNearestOpposingDistancePx: number | null = null;
  let pairingSwitchFraction: number | null = null;
  if (options.requireFullEngagement) {
    const mergeSamples = samples.filter((sample) => sample.phaseLabel === "escort-clash-merge");
    const mergeDistances = mergeSamples.map((sample) => {
      const sides = activeFighterSides(sample);
      return nearestOpposingDistance(sides.playerSide, sides.botSide);
    });
    mergeMinimumOpposingDistancePx = mergeDistances.length > 0 ? Math.min(...mergeDistances) : null;
    if (mergeMinimumOpposingDistancePx === null || mergeMinimumOpposingDistancePx > 55) {
      findings.push({
        severity: "error",
        code: "merge-alignment",
        message: `Closest observed head-on merge is ${mergeMinimumOpposingDistancePx?.toFixed(1) ?? "missing"}px; maximum is 55px.`
      });
    }

    const scrambleSamples = samples.filter((sample) => sample.phaseLabel === "escort-clash-scramble");
    const scrambleSample = scrambleSamples[Math.floor(scrambleSamples.length / 2)];
    if (!scrambleSample) {
      findings.push({ severity: "error", code: "missing-scramble", message: "No painted scramble samples were captured." });
    } else {
      const sides = activeFighterSides(scrambleSample);
      if (sides.playerSide.length === 0 || sides.botSide.length === 0) {
        findings.push({ severity: "error", code: "empty-scramble-side", message: "The scramble does not contain active fighters from both factions." });
      } else {
        scrambleCentroidDistancePx = distance(centroid(sides.playerSide), centroid(sides.botSide));
        scrambleNearestOpposingDistancePx = nearestOpposingDistance(sides.playerSide, sides.botSide);
        if (scrambleCentroidDistancePx > 210 || scrambleNearestOpposingDistancePx > 160) {
          findings.push({
            severity: "error",
            code: "split-scramble",
            message: `Scramble centroids are ${scrambleCentroidDistancePx.toFixed(1)}px apart and the nearest opponents are ${scrambleNearestOpposingDistancePx.toFixed(1)}px apart.`
          });
        }
      }
    }

    if (mergeSamples.length > 0 && scrambleSample) {
      const closestMergeSample = mergeSamples.reduce((best, sample) => {
        const sides = activeFighterSides(sample);
        const bestSides = activeFighterSides(best);
        return nearestOpposingDistance(sides.playerSide, sides.botSide)
          < nearestOpposingDistance(bestSides.playerSide, bestSides.botSide) ? sample : best;
      });
      const mergePairs = nearestOpponentIds(closestMergeSample);
      const scramblePairs = nearestOpponentIds(scrambleSample);
      const comparableActors = [...mergePairs.keys()].filter((actorId) => scramblePairs.has(actorId));
      const switchedActors = comparableActors.filter((actorId) => mergePairs.get(actorId) !== scramblePairs.get(actorId));
      pairingSwitchFraction = comparableActors.length > 0 ? switchedActors.length / comparableActors.length : null;
      if (pairingSwitchFraction === null || pairingSwitchFraction < 0.5) {
        findings.push({
          severity: "error",
          code: "pairing-switch",
          message: `Only ${((pairingSwitchFraction ?? 0) * 100).toFixed(0)}% of fighters switch their nearest opponent after the merge; minimum is 50%.`
        });
      }
    }
  }

  const strikeSamples = samples.filter((sample) =>
    sample.phaseLabel === "bomber-ingress"
    || sample.phaseLabel === "bomber-defense-pass"
    || sample.phaseLabel === "target-run"
  );
  const bomberDistances = strikeSamples.flatMap((sample) => {
    const bombers = sample.actors.filter((actor) => actor.active && actor.role === "bomber");
    return bombers.flatMap((left, leftIndex) => bombers.slice(leftIndex + 1).map((right) => distance(left, right)));
  });
  const bomberMinimumSpacingPx = bomberDistances.length > 0 ? Math.min(...bomberDistances) : null;
  if (bomberMinimumSpacingPx !== null && bomberMinimumSpacingPx < 48) {
    findings.push({ severity: "error", code: "bomber-spacing", message: `Bombers close to ${bomberMinimumSpacingPx.toFixed(1)}px; minimum painted spacing is 48px.` });
  }

  const flakCueCount = Math.max(0, ...samples.map((sample) => sample.cueCounts.flak ?? 0));
  const flakBatchTimes: number[] = [];
  let previousFlakCount = 0;
  samples.forEach((sample) => {
    const count = sample.cueCounts.flak ?? 0;
    if (count > previousFlakCount) flakBatchTimes.push(sample.elapsedMs);
    previousFlakCount = count;
  });
  const flakBatchGaps = flakBatchTimes.slice(1).map((timeMs, index) => timeMs - flakBatchTimes[index]!);
  const maximumFlakBatchGapMs = flakBatchGaps.length > 0 ? Math.max(...flakBatchGaps) : null;
  if (options.requireFlak) {
    if (flakCueCount < 6) {
      findings.push({ severity: "error", code: "flak-count", message: `Only ${flakCueCount} flak cues fired; at least 6 are required for sustained coverage.` });
    }
    if (flakBatchTimes.length < 4) {
      findings.push({ severity: "error", code: "flak-batches", message: `Flak appears in only ${flakBatchTimes.length} observed time batches.` });
    }
    if (maximumFlakBatchGapMs !== null && maximumFlakBatchGapMs > 900) {
      findings.push({ severity: "error", code: "flak-cadence", message: `Observed flak pauses for ${maximumFlakBatchGapMs.toFixed(0)}ms; maximum is 900ms.` });
    }
    const smokeObserved = samples.some((sample) => (sample.effectCounts.flakSmokePuff ?? 0) > 0);
    if (!smokeObserved) {
      findings.push({ severity: "warning", code: "flak-smoke-not-observed", message: "No active flak smoke effect was present on a 100ms sample." });
    }
  }

  if (options.requireImpactContinuity) {
    const impactSample = samples.find((sample) => sample.impactFired || (sample.cueCounts.impact ?? 0) > 0);
    if (!impactSample) {
      findings.push({ severity: "error", code: "impact-not-observed", message: "No impact cue was observed in the temporal trace." });
    } else {
      const continuityStartMs = impactSample.elapsedMs - 500;
      const continuityEndMs = impactSample.elapsedMs + 2500;
      const continuitySamples = samples.filter((sample) =>
        sample.elapsedMs >= continuityStartMs && sample.elapsedMs <= continuityEndMs
      );
      const bomberIds = impactSample.actors.filter((actor) => actor.role === "bomber" && actor.active).map((actor) => actor.actorId);
      if (bomberIds.length === 0) {
        findings.push({ severity: "error", code: "impact-without-bomber", timeMs: impactSample.elapsedMs, message: "No active bomber is painted when the impact cue fires." });
      }
      bomberIds.forEach((actorId) => {
        const failedSample = continuitySamples.find((sample) => {
          const actor = sample.actors.find((candidate) => candidate.actorId === actorId);
          return !actor || !actor.connected || !actor.active || actor.opacity <= 0.05;
        });
        if (failedSample) {
          findings.push({
            severity: "error",
            code: "bomber-impact-disappearance",
            actorId,
            timeMs: failedSample.elapsedMs,
            message: `${actorId} is absent or hidden at ${formatTimestamp(failedSample.elapsedMs)} during the impact continuity window.`
          });
        }
        const released = continuitySamples.some((sample) =>
          sample.actors.some((actor) => actor.actorId === actorId && actor.bombReleased)
        );
        if (!released) {
          findings.push({ severity: "error", code: "bomb-release-not-observed", actorId, message: `${actorId} never exposes its bomb-release state before impact.` });
        }
      });
    }
  }

  if (options.requireFullEngagement && options.originPlan) {
    const lastActiveByActor = new Map<string, AirshowTemporalActor>();
    samples.forEach((sample) => sample.actors.filter((actor) => actor.active).forEach((actor) => lastActiveByActor.set(actor.actorId, actor)));
    const bounds = options.originPlan.mapBounds;
    const mapCenter = { cx: (bounds.minX + bounds.maxX) / 2, cy: (bounds.minY + bounds.maxY) / 2 };
    lastActiveByActor.forEach((actor) => {
      const projection = (actor.cx - mapCenter.cx) * options.originPlan!.axis.cx
        + (actor.cy - mapCenter.cy) * options.originPlan!.axis.cy;
      const correctSide = actor.faction === "Bot" ? projection < 0 : projection > 0;
      if (!correctSide) {
        findings.push({ severity: "error", code: "wrong-egress-side", actorId: actor.actorId, message: `${actor.actorId} exits toward the wrong faction HQ side.` });
      }
    });
  }

  return {
    version: 1,
    scenarioId: options.scenarioId,
    generatedAtIso: new Date().toISOString(),
    passed: findings.every((finding) => finding.severity !== "error"),
    sampleCount: samples.length,
    actorCount: actorIds.length,
    durationMs: samples.length > 0 ? samples[samples.length - 1]!.elapsedMs - samples[0]!.elapsedMs : 0,
    medianSampleIntervalMs,
    maximumSampleGapMs,
    mergeMinimumOpposingDistancePx,
    scrambleCentroidDistancePx,
    scrambleNearestOpposingDistancePx,
    pairingSwitchFraction,
    bomberMinimumSpacingPx,
    flakCueCount,
    flakObservedBatches: flakBatchTimes.length,
    maximumFlakBatchGapMs,
    actorMetrics,
    findings
  };
}

function renderSummary(audit: AirshowTemporalAudit): string {
  const lines = [
    "AIR SHOW TEMPORAL CERTIFICATION",
    `Result: ${audit.passed ? "PASS" : "FAIL"}`,
    `Scenario: ${audit.scenarioId}`,
    `Generated: ${audit.generatedAtIso}`,
    `Trace: ${audit.sampleCount} samples, ${audit.actorCount} aircraft, ${formatTimestamp(audit.durationMs)}`,
    `Cadence: median ${audit.medianSampleIntervalMs.toFixed(1)}ms, maximum gap ${audit.maximumSampleGapMs.toFixed(1)}ms`,
    `Merge: ${audit.mergeMinimumOpposingDistancePx?.toFixed(1) ?? "n/a"}px nearest opponents`,
    `Scramble: ${audit.scrambleCentroidDistancePx?.toFixed(1) ?? "n/a"}px centroids, ${audit.scrambleNearestOpposingDistancePx?.toFixed(1) ?? "n/a"}px nearest opponents`,
    `Pairing switch: ${audit.pairingSwitchFraction === null ? "n/a" : `${(audit.pairingSwitchFraction * 100).toFixed(0)}%`}`,
    `Bomber spacing: ${audit.bomberMinimumSpacingPx?.toFixed(1) ?? "n/a"}px minimum`,
    `Flak: ${audit.flakCueCount} cues across ${audit.flakObservedBatches} sampled batches, maximum gap ${audit.maximumFlakBatchGapMs?.toFixed(0) ?? "n/a"}ms`,
    "",
    "FINDINGS"
  ];
  if (audit.findings.length === 0) {
    lines.push("None.");
  } else {
    audit.findings.forEach((finding) => {
      lines.push(`[${finding.severity.toUpperCase()}] ${finding.code}${finding.actorId ? ` ${finding.actorId}` : ""}${finding.timeMs === undefined ? "" : ` @ ${formatTimestamp(finding.timeMs)}`}: ${finding.message}`);
    });
  }
  lines.push("", "AIRCRAFT");
  audit.actorMetrics.forEach((actor) => {
    lines.push(
      `${actor.actorId} | ${actor.role} | ${actor.faction} | active ${formatTimestamp(actor.firstActiveMs)}-${formatTimestamp(actor.lastActiveMs)} | `
      + `median ${actor.medianSpeedPxPerMs.toFixed(4)}px/ms | max ${actor.maximumSpeedPxPerMs.toFixed(4)}px/ms | `
      + `max turn ${actor.maximumHeadingChangeDegrees.toFixed(1)}deg | gaps ${actor.lifecycleGaps}`
    );
  });
  return `${lines.join("\n")}\n`;
}

function renderCsv(samples: ReadonlyArray<AirshowTemporalSample>): string {
  const header = [
    "sample", "timestamp", "elapsed_ms", "phase", "actor_id", "flight_id", "role", "combat_role", "faction",
    "active", "opacity", "connected", "center_x", "center_y", "heading_deg", "width", "height", "bomb_released",
    "destroyed", "last_cue", "impact_fired", "tracer_cues", "flak_cues", "release_cues", "impact_cues", "destruction_cues",
    "active_flak_bursts", "active_flak_smoke"
  ];
  const rows = [header.map(csvEscape).join(",")];
  samples.forEach((sample, sampleIndex) => {
    sample.actors.forEach((actor) => {
      rows.push([
        sampleIndex,
        formatTimestamp(sample.elapsedMs),
        round(sample.elapsedMs, 1),
        sample.phaseLabel,
        actor.actorId,
        actor.flightId,
        actor.role,
        actor.combatRole,
        actor.faction,
        actor.active,
        round(actor.opacity),
        actor.connected,
        round(actor.cx),
        round(actor.cy),
        round(actor.headingDegrees, 1),
        round(actor.width, 1),
        round(actor.height, 1),
        actor.bombReleased,
        actor.destroyed,
        sample.lastCue,
        sample.impactFired,
        sample.cueCounts.tracer ?? 0,
        sample.cueCounts.flak ?? 0,
        sample.cueCounts["bomb-release"] ?? 0,
        sample.cueCounts.impact ?? 0,
        sample.cueCounts.destruction ?? 0,
        sample.effectCounts.flakBurst ?? 0,
        sample.effectCounts.flakSmokePuff ?? 0
      ].map(csvEscape).join(","));
    });
  });
  return `${rows.join("\n")}\n`;
}

export function writeAirshowTemporalArtifacts(
  fileStem: string,
  samples: ReadonlyArray<AirshowTemporalSample>,
  audit: AirshowTemporalAudit,
  outputDir = path.resolve(process.cwd(), "diagnostics", "playwright", "airshow-traces", "latest")
): AirshowTemporalArtifactPaths {
  mkdirSync(outputDir, { recursive: true });
  const paths = {
    json: path.join(outputDir, `${fileStem}.json`),
    csv: path.join(outputDir, `${fileStem}.csv`),
    summary: path.join(outputDir, `${fileStem}.txt`)
  };
  const normalizedSamples = samples.map((sample, index) => ({
    index,
    timestamp: formatTimestamp(sample.elapsedMs),
    ...sample,
    actors: sample.actors.map((actor) => ({
      ...actor,
      opacity: round(actor.opacity),
      headingDegrees: round(actor.headingDegrees, 1),
      cx: round(actor.cx),
      cy: round(actor.cy)
    }))
  }));
  writeFileSync(paths.json, `${JSON.stringify({ audit, samples: normalizedSamples }, null, 2)}\n`, "utf8");
  writeFileSync(paths.csv, renderCsv(samples), "utf8");
  writeFileSync(paths.summary, renderSummary(audit), "utf8");
  return paths;
}
