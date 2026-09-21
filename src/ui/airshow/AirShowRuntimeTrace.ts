import { resolvePrimaryResolvedAirShowBomber, type PlannedAirShowScene, type ResolvedAirShowScene } from "./AirShowPlaybackScene";
import type { AirShowScenarioFamily, AirShowTimeline, AirShowTimelineCue } from "./AirShowTimeline";

export interface AirShowRuntimeTraceFlightSummary {
  readonly flightId: string;
  readonly role: "interceptor" | "escort" | "bomber";
  readonly combatRole: string;
  readonly faction: string;
  readonly actorIds: readonly string[];
}

export type AirShowRuntimeTraceEvent =
  | {
      readonly kind: "runtime-flight-build-skipped";
      readonly flightId: string;
      readonly role: "interceptor" | "escort" | "bomber";
      readonly combatRole: string;
      readonly faction: string;
      readonly scenarioType: string;
      readonly actorIds: readonly string[];
      readonly reason: string;
    }
  | {
      readonly kind: "timeline-start";
      readonly timelineVersion: 2;
      readonly scenario: AirShowScenarioFamily;
      readonly totalDurationMs: number;
      readonly actorIds: readonly string[];
      readonly beatLabels: readonly string[];
      readonly cueCount: number;
    }
  | {
      readonly kind: "beat-entered";
      readonly label: string;
      readonly timeMs: number;
      readonly activeActorIds: readonly string[];
    }
  | {
      readonly kind: "cue-fired";
      readonly cueKind: AirShowTimeline["cues"][number]["kind"];
      readonly timeMs: number;
      readonly subjectActorIds: readonly string[];
    }
  | {
      readonly kind: "timeline-complete";
      readonly elapsedMs: number;
      readonly firedCueCount: number;
    };

export interface AirShowRuntimeTraceEventRecord {
  readonly index: number;
  readonly event: AirShowRuntimeTraceEvent;
}

export interface AirShowRuntimeTrace {
  readonly version: 2;
  readonly recordedAtIso: string;
  readonly source: "AirShowTimelinePlayer";
  readonly scene: {
    readonly hexKey: string;
    readonly kind: ResolvedAirShowScene["kind"] | null;
    readonly bomberTargetHexKey: string | null;
    readonly playerHqKey: string | null;
    readonly botHqKey: string | null;
  };
  readonly timeline: {
    readonly version: 2;
    readonly scenario: AirShowScenarioFamily;
    readonly totalDurationMs: number;
    readonly flights: readonly AirShowRuntimeTraceFlightSummary[];
    readonly beats: ReadonlyArray<{ readonly label: string; readonly startTimeMs: number; readonly endTimeMs: number }>;
    readonly cueCounts: Readonly<Record<AirShowTimeline["cues"][number]["kind"], number>>;
  };
  readonly events: readonly AirShowRuntimeTraceEventRecord[];
  readonly status: "success" | "error";
  readonly error: string | null;
}

export interface AirShowRuntimeTraceDebugHook {
  clear(): void;
  disable(): void;
  downloadLatest(fileName?: string): boolean;
  enable(): void;
  exportLatest(pretty?: boolean): string | null;
  getHistory(): readonly AirShowRuntimeTrace[];
  getLatest(): AirShowRuntimeTrace | null;
  isEnabled(): boolean;
}

export interface AirShowRuntimeTraceSession {
  trace: {
    version: 2;
    recordedAtIso: string;
    source: "AirShowTimelinePlayer";
    scene: AirShowRuntimeTrace["scene"];
    timeline: AirShowRuntimeTrace["timeline"];
    events: AirShowRuntimeTraceEventRecord[];
    status: "success" | "error";
    error: string | null;
  };
}

type AirShowRuntimeTraceStore = {
  enabled: boolean;
  traces: AirShowRuntimeTrace[];
};

const MAX_RUNTIME_TRACE_HISTORY = 5;
const runtimeTraceStore: AirShowRuntimeTraceStore = {
  enabled: true,
  traces: []
};

declare global {
  interface Window {
    __FSG_AIRSHOW_RUNTIME_TRACE__?: AirShowRuntimeTraceDebugHook;
  }
}

function cloneTrace<T>(value: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}

function buildDebugHook(): AirShowRuntimeTraceDebugHook {
  return {
    clear(): void {
      runtimeTraceStore.traces.length = 0;
    },
    disable(): void {
      runtimeTraceStore.enabled = false;
    },
    downloadLatest(fileName = "fsg-airshow-runtime-trace.json"): boolean {
      if (typeof window === "undefined") {
        return false;
      }
      const latest = runtimeTraceStore.traces[runtimeTraceStore.traces.length - 1] ?? null;
      if (!latest) {
        return false;
      }
      const blob = new Blob([JSON.stringify(latest, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      return true;
    },
    enable(): void {
      runtimeTraceStore.enabled = true;
    },
    exportLatest(pretty = true): string | null {
      const latest = runtimeTraceStore.traces[runtimeTraceStore.traces.length - 1] ?? null;
      return latest ? JSON.stringify(latest, null, pretty ? 2 : 0) : null;
    },
    getHistory(): readonly AirShowRuntimeTrace[] {
      return runtimeTraceStore.traces.map((trace) => cloneTrace(trace));
    },
    getLatest(): AirShowRuntimeTrace | null {
      const latest = runtimeTraceStore.traces[runtimeTraceStore.traces.length - 1] ?? null;
      return latest ? cloneTrace(latest) : null;
    },
    isEnabled(): boolean {
      return runtimeTraceStore.enabled;
    }
  };
}

export function installAirShowRuntimeTraceDebugHook(
  targetWindow: Window & typeof globalThis = window
): AirShowRuntimeTraceDebugHook {
  if (!targetWindow.__FSG_AIRSHOW_RUNTIME_TRACE__) {
    targetWindow.__FSG_AIRSHOW_RUNTIME_TRACE__ = buildDebugHook();
  }
  return targetWindow.__FSG_AIRSHOW_RUNTIME_TRACE__;
}

export function beginAirShowRuntimeTrace(
  scene: ResolvedAirShowScene,
  timeline: AirShowTimeline,
  plannedScene: PlannedAirShowScene
): AirShowRuntimeTraceSession | null {
  if (!runtimeTraceStore.enabled) {
    return null;
  }
  return {
    trace: {
      version: 2,
      recordedAtIso: new Date().toISOString(),
      source: "AirShowTimelinePlayer",
      scene: {
        hexKey: scene.hexKey,
        kind: scene.kind ?? null,
        bomberTargetHexKey: scene.bomberTargetHexKey ?? resolvePrimaryResolvedAirShowBomber(scene)?.targetHexKey ?? null,
        playerHqKey: scene.playerHqKey ?? null,
        botHqKey: scene.botHqKey ?? null
      },
      timeline: {
        version: timeline.version,
        scenario: timeline.scenario,
        totalDurationMs: timeline.totalDurationMs,
        flights: plannedScene.flights.map((flight) => ({
          flightId: flight.id,
          role: flight.role,
          combatRole: flight.combatRole ?? flight.role,
          faction: flight.faction ?? "",
          actorIds: flight.actors.map((actor) => actor.actorId)
        })),
        beats: timeline.beats.map((beat) => ({ ...beat })),
        cueCounts: timeline.cues.reduce<AirShowRuntimeTrace["timeline"]["cueCounts"]>((counts, cue) => ({
          ...counts,
          [cue.kind]: counts[cue.kind] + 1
        }), {
          tracer: 0,
          flak: 0,
          "bomb-release": 0,
          impact: 0,
          destruction: 0
        })
      },
      events: [],
      status: "success",
      error: null
    }
  };
}

export function recordAirShowRuntimeTraceEvent(
  session: AirShowRuntimeTraceSession | null,
  event: AirShowRuntimeTraceEvent
): void {
  if (!session || !runtimeTraceStore.enabled) {
    return;
  }
  session.trace.events.push({
    index: session.trace.events.length,
    event: cloneTrace(event)
  });
}

export function recordAirShowTimelineStart(
  session: AirShowRuntimeTraceSession | null,
  timeline: AirShowTimeline
): void {
  recordAirShowRuntimeTraceEvent(session, {
    kind: "timeline-start",
    timelineVersion: timeline.version,
    scenario: timeline.scenario,
    totalDurationMs: timeline.totalDurationMs,
    actorIds: timeline.actors.map((actor) => actor.actorId),
    beatLabels: timeline.beats.map((beat) => beat.label),
    cueCount: timeline.cues.length
  });
}

export function recordAirShowTimelineBeat(
  session: AirShowRuntimeTraceSession | null,
  label: string,
  timeMs: number,
  activeActorIds: readonly string[]
): void {
  recordAirShowRuntimeTraceEvent(session, { kind: "beat-entered", label, timeMs, activeActorIds });
}

export function recordAirShowTimelineCue(
  session: AirShowRuntimeTraceSession | null,
  cue: AirShowTimelineCue
): void {
  const subjectActorIds = cue.kind === "tracer"
    ? [cue.sourceActorId, cue.targetActorId]
    : cue.kind === "flak" || cue.kind === "bomb-release"
      ? [cue.bomberActorId]
      : cue.kind === "destruction"
        ? [cue.actorId]
        : [];
  recordAirShowRuntimeTraceEvent(session, {
    kind: "cue-fired",
    cueKind: cue.kind,
    timeMs: cue.timeMs,
    subjectActorIds
  });
}

export function recordAirShowTimelineComplete(
  session: AirShowRuntimeTraceSession | null,
  elapsedMs: number,
  firedCueCount: number
): void {
  recordAirShowRuntimeTraceEvent(session, { kind: "timeline-complete", elapsedMs, firedCueCount });
}

export function completeAirShowRuntimeTrace(
  session: AirShowRuntimeTraceSession | null,
  status: "success" | "error",
  error: string | null = null
): void {
  if (!session || !runtimeTraceStore.enabled) {
    return;
  }
  session.trace.status = status;
  session.trace.error = error;
  runtimeTraceStore.traces.push(cloneTrace(session.trace));
  while (runtimeTraceStore.traces.length > MAX_RUNTIME_TRACE_HISTORY) {
    runtimeTraceStore.traces.shift();
  }
}
